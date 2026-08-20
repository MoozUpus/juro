import { z } from "zod";
import { parseJsonRequest } from "../../../../lib/auth/input";
import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../lib/document-builder/storage/runtime";

const time = /^([01]\d|2[0-3]):[0-5]\d$/;
const input = z.object({
  rules: z.array(z.object({
    weekday: z.number().int().min(1).max(7),
    startsAt: z.string().regex(time),
    endsAt: z.string().regex(time),
    status: z.enum(["active", "paused"]).default("active"),
  }).refine((value) => value.startsAt < value.endsAt, "INVALID_TIME_RANGE")).max(28),
  unavailability: z.array(z.object({
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    reason: z.string().trim().max(500).optional(),
  }).refine(
    (value) => Date.parse(value.startsAt) < Date.parse(value.endsAt),
    "INVALID_UNAVAILABILITY_RANGE",
  )).max(100),
  locale: z.enum(["ru", "uz"]),
}).strict();

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
}

async function ownProfile(userId: string) {
  return requireD1().prepare(
    `SELECT p.id FROM lawyer_profiles p JOIN user_profiles u ON u.id=p.user_id
     WHERE p.user_id=? AND u.account_type='lawyer' LIMIT 1`,
  ).bind(userId).first<{ id: string }>();
}

export const GET = withApiErrors(async function GET() {
  const user = await requireApiUser();
  const profile = await ownProfile(user.id);
  if (!profile) return response({ code: "LAWYER_PROFILE_REQUIRED" }, 403);
  const db = requireD1();
  const [rules, periods] = await Promise.all([
    db.prepare("SELECT id,weekday,starts_at AS startsAt,ends_at AS endsAt,timezone,status FROM lawyer_availability_rules WHERE lawyer_profile_id=? ORDER BY weekday,starts_at").bind(profile.id).all(),
    db.prepare("SELECT id,starts_at AS startsAt,ends_at AS endsAt,reason FROM lawyer_unavailability_periods WHERE lawyer_profile_id=? ORDER BY starts_at").bind(profile.id).all(),
  ]);
  return response({ rules: rules.results, unavailability: periods.results });
});

export const PUT = withApiErrors(async function PUT(request: Request) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const profile = await ownProfile(user.id);
  if (!profile) return response({ code: "LAWYER_PROFILE_REQUIRED" }, 403);
  const parsed = await parseJsonRequest(request, input, 8_192);
  if (!parsed.ok) return response({ code: "INVALID_SCHEDULE", error: "Проверьте рабочие часы." }, 400);
  const db = requireD1();
  const now = new Date().toISOString();
  await db.batch([
    db.prepare("DELETE FROM lawyer_availability_rules WHERE lawyer_profile_id=?").bind(profile.id),
    db.prepare("DELETE FROM lawyer_unavailability_periods WHERE lawyer_profile_id=?").bind(profile.id),
    ...parsed.data.rules.map((rule) => db.prepare(
      "INSERT INTO lawyer_availability_rules (id,lawyer_profile_id,weekday,starts_at,ends_at,timezone,status,created_at,updated_at) VALUES (?,?,?,?,?,'Asia/Tashkent',?,?,?)",
    ).bind(crypto.randomUUID(), profile.id, rule.weekday, rule.startsAt, rule.endsAt, rule.status, now, now)),
    ...parsed.data.unavailability.map((period) => db.prepare(
      "INSERT INTO lawyer_unavailability_periods (id,lawyer_profile_id,starts_at,ends_at,reason,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
    ).bind(
      crypto.randomUUID(),
      profile.id,
      new Date(period.startsAt).toISOString(),
      new Date(period.endsAt).toISOString(),
      period.reason || null,
      now,
      now,
    )),
  ]);
  return response({
    saved: true,
    count: parsed.data.rules.length,
    unavailabilityCount: parsed.data.unavailability.length,
  });
});
