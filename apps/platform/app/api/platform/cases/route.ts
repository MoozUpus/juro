import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../lib/document-builder/storage/runtime";
import { isoNow, parseJson } from "../../../../lib/document-builder/storage/db";
import { workspaceForUser } from "../../../../lib/platform/workspace";

const scenarios: Record<string, { ru: string[]; uz: string[] }> = {
  "unpaid-salary": { ru: ["Собрать трудовые документы и расчёты", "Подготовить письменное требование работодателю", "Зафиксировать вручение требования", "Проверить ответ и определить следующий способ защиты"], uz: ["Mehnat hujjatlari va hisob-kitoblarni yig‘ish", "Ish beruvchiga yozma talab tayyorlash", "Talab topshirilganini qayd etish", "Javobni tekshirib, keyingi himoya usulini belgilash"] },
  debt: { ru: ["Собрать подтверждения долга", "Проверить срок и условия возврата", "Подготовить требование о возврате", "Зафиксировать ответ или отсутствие ответа"], uz: ["Qarzni tasdiqlovchi dalillarni yig‘ish", "Qaytarish muddati va shartlarini tekshirish", "Qaytarish talabini tayyorlash", "Javobni yoki javob yo‘qligini qayd etish"] },
  consumer: { ru: ["Собрать чек, договор и переписку", "Сформулировать нарушение и требование", "Направить претензию", "Оценить ответ и дальнейшие действия"], uz: ["Chek, shartnoma va yozishmalarni yig‘ish", "Buzilish va talabni ifodalash", "Talabnoma yuborish", "Javob va keyingi harakatlarni baholash"] },
  "debt-recovery": { ru: ["Проверить договор и первичные документы", "Рассчитать подтверждённую задолженность", "Подготовить досудебную претензию", "Зафиксировать ответ и решение о следующем этапе"], uz: ["Shartnoma va birlamchi hujjatlarni tekshirish", "Tasdiqlangan qarzdorlikni hisoblash", "Sudgacha talabnoma tayyorlash", "Javob va keyingi bosqich qarorini qayd etish"] },
  "contract-breach": { ru: ["Зафиксировать обязательство и нарушение", "Собрать доказательства исполнения своей стороны", "Подготовить уведомление или претензию", "Согласовать способ урегулирования"], uz: ["Majburiyat va buzilishni qayd etish", "O‘z tomonining ijrosini tasdiqlovchi dalillarni yig‘ish", "Bildirishnoma yoki talabnoma tayyorlash", "Hal etish usulini kelishish"] },
};

function response(body: unknown, status=200){return Response.json(body,{status,headers:{"cache-control":"private, no-store"}});}

export const GET = withApiErrors(async function GET(request:Request){
  const user=await requireApiUser(); const db=requireD1();
  const workspace=await workspaceForUser(user);
  const caseId=new URL(request.url).searchParams.get("caseId");
  const caseScope=caseId ? " AND c.id=?" : "";
  const query=`SELECT c.id,c.title,c.description,c.legal_area AS legalArea,c.status,c.next_deadline_at AS nextDeadlineAt,c.created_at AS createdAt,c.updated_at AS updatedAt,
    p.id AS planId,p.title AS planTitle,p.status AS planStatus,p.progress_percent AS progressPercent,
    (SELECT json_group_array(json_object('id',s.id,'ordinal',s.ordinal,'title',s.title,'description',s.description,'status',s.status,'dueAt',s.due_at,'actionType',s.action_type,'templateCode',s.template_code,'revision',s.revision)) FROM action_plan_steps s WHERE s.plan_id=p.id ORDER BY s.ordinal) AS stepsJson
    FROM cases c LEFT JOIN action_plans p ON p.case_id=c.id WHERE c.workspace_id=?${caseScope} AND c.archived_at IS NULL ORDER BY c.updated_at DESC`;
  const rows=caseId ? await db.prepare(query).bind(workspace.id,caseId).all() : await db.prepare(query).bind(workspace.id).all();
  return response({cases:(rows.results as Array<Record<string,unknown>>).map(row=>({...row,steps:parseJson(String(row.stepsJson||"[]"),[])}))});
});

export const POST = withApiErrors(async function POST(request:Request){
  assertSafeWrite(request); const user=await requireApiUser(); const body=await request.json().catch(()=>null) as {title?:string;description?:string;legalArea?:string;locale?:string;accountType?:string}|null;
  const title=body?.title?.trim().slice(0,180); const legalArea=body?.legalArea&&scenarios[body.legalArea]?body.legalArea:"debt"; const locale=body?.locale==="uz"?"uz":"ru"; const accountType=body?.accountType==="business"?"business":"individual";
  if(!title)return response({error:locale==="ru"?"Укажите название ситуации.":"Vaziyat nomini kiriting."},400);
  const now=isoNow(); const caseId=crypto.randomUUID(); const planId=crypto.randomUUID(); const steps=scenarios[legalArea][locale]; const db=requireD1();
  const workspace=await workspaceForUser(user);
  await db.batch([
    db.prepare("INSERT INTO cases (id,workspace_id,owner_user_id,account_type,locale,title,description,legal_area,status,current_revision,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,'open',1,?,?)").bind(caseId,workspace.id,user.id,accountType,locale,title,body?.description?.trim().slice(0,2000)||null,legalArea,now,now),
    db.prepare("INSERT INTO action_plans (id,case_id,created_by_user_id,title,status,progress_percent,current_revision,created_at,updated_at) VALUES (?,?,?,?,'in_progress',0,1,?,?)").bind(planId,caseId,user.id,locale==="ru"?`План: ${title}`:`Reja: ${title}`,now,now),
    ...steps.map((step,index)=>db.prepare("INSERT INTO action_plan_steps (id,plan_id,ordinal,title,status,deadline_type,revision,created_at,updated_at) VALUES (?,?,?,?,'not_started','calendar_days',1,?,?)").bind(crypto.randomUUID(),planId,index+1,step,now,now)),
    db.prepare("INSERT INTO case_events (id,case_id,actor_user_id,event_type,metadata_json,created_at) VALUES (?,?,?,'case_created',?,?)").bind(crypto.randomUUID(),caseId,user.id,JSON.stringify({legalArea}),now),
  ]);
  return response({ok:true,caseId,planId},201);
});
