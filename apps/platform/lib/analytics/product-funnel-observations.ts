export async function recordLawyerDirectoryVisit(input: {
  db: D1Database;
  userId: string;
  observedAt?: Date;
}): Promise<void> {
  const observedAt = (input.observedAt ?? new Date()).toISOString();
  const visitDay = observedAt.slice(0, 10);
  await input.db.prepare(
    `INSERT INTO lawyer_directory_daily_visits (
       user_id,visit_day,first_viewed_at,last_viewed_at
     ) VALUES (?,?,?,?)
     ON CONFLICT(user_id,visit_day) DO UPDATE SET
       first_viewed_at=min(first_viewed_at,excluded.first_viewed_at),
       last_viewed_at=max(last_viewed_at,excluded.last_viewed_at)`,
  ).bind(input.userId, visitDay, observedAt, observedAt).run();
}

export async function recordAiAnswerSourceOpen(input: {
  db: D1Database;
  userId: string;
  responseMessageId: string;
  observedAt?: Date;
}): Promise<void> {
  const observedAt = (input.observedAt ?? new Date()).toISOString();
  await input.db.prepare(
    `INSERT INTO ai_answer_source_opens (
       user_id,response_message_id,first_opened_at,last_opened_at
     ) VALUES (?,?,?,?)
     ON CONFLICT(user_id,response_message_id) DO UPDATE SET
       first_opened_at=min(first_opened_at,excluded.first_opened_at),
       last_opened_at=max(last_opened_at,excluded.last_opened_at)`,
  ).bind(input.userId, input.responseMessageId, observedAt, observedAt).run();
}
