import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { taskReminderNotificationCopy } from "../lib/notifications/task-reminder-dispatch";

test("English task reminder notifications are explicit and contain no Cyrillic fallback", () => {
  const copy = taskReminderNotificationCopy({
    locale: "en",
    taskTitle: "Submit the response",
  });
  assert.deepEqual(copy, {
    title: "Task deadline",
    body: "Task deadline approaching: Submit the response.",
  });
  assert.doesNotMatch(`${copy.title}\n${copy.body}`, /[\u0400-\u04ff]/u);
});

test("notification preferences localize invalid input and explicitly send the UI locale", async () => {
  const [route, panel] = await Promise.all([
    readFile(new URL("../app/api/platform/notification-preferences/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/_platform/NotificationPreferencesPanel.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(route, /localizedRequestFormatError\(request\)/u);
  assert.doesNotMatch(route, /Некорректные настройки уведомлений/u);
  assert.match(panel, /"x-juro-locale": locale/u);
});
