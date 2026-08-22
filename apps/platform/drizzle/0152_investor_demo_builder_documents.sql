-- Repair the two fixed synthetic investor-demo documents so their canonical
-- /documents/:id routes load the configured JURO Builder instead of falling
-- back to the legacy receipt editor.

INSERT OR IGNORE INTO `document_templates`
  (`id`,`key`,`category`,`active`,`created_at`,`updated_at`)
VALUES
  ('candidate-1301001-v1','1301001','contracts',1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));

INSERT OR IGNORE INTO `document_template_locales`
  (`id`,`template_id`,`language`,`name`,`source_object_key`,`created_at`,`updated_at`)
VALUES
  ('candidate-1301001-v1-ru','candidate-1301001-v1','ru','Договор купли-продажи товаров между организациями',NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('candidate-1301001-v1-uz','candidate-1301001-v1','uz','Tashkilotlar o‘rtasida tovar oldi-sotdi shartnomasi',NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));

INSERT INTO `document_answers` (`document_id`,`answers_json`,`updated_at`)
SELECT
  '51000000-0000-4000-8000-000000000001',
  '{"court.name":"SYNTHETIC DEMO — адресат","applicant.fullName":"Client Demo","applicant.address":"SYNTHETIC DEMO","applicant.phone":"+998 00 000 00 00","otherParty.type":"company","otherParty.companyName":"Synthetic Counterparty LLC","otherParty.tin":"000000000","otherParty.address":"SYNTHETIC DEMO","case.proceduralStatus":"other","case.background":"Синтетический сценарий проверки проекта договора.","matter.details":"Проверка предмета, сроков, оплаты и порядка приёмки без реальных сторон и обязательств.","matter.hasAmount":"no","claim.request":"Подготовить согласованную безопасную редакцию проекта.","claim.evidence":"SYNTHETIC DEMO — проект без реальных документов.","claim.attachments":"SYNTHETIC DEMO — приложения отсутствуют.","confirmation":true}',
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE EXISTS (SELECT 1 FROM `documents` WHERE `id`='51000000-0000-4000-8000-000000000001')
ON CONFLICT(`document_id`) DO UPDATE SET
  `answers_json`=excluded.`answers_json`,
  `updated_at`=excluded.`updated_at`;

INSERT INTO `document_answers` (`document_id`,`answers_json`,`updated_at`)
SELECT
  '51000000-0000-4000-8000-000000000002',
  '{"court.name":"SYNTHETIC DEMO — адресат","applicant.fullName":"Lawyer Demo","applicant.address":"SYNTHETIC DEMO","applicant.phone":"+998 00 000 00 00","otherParty.type":"company","otherParty.companyName":"Synthetic Counterparty LLC","otherParty.tin":"000000000","otherParty.address":"SYNTHETIC DEMO","case.proceduralStatus":"other","case.background":"Синтетический рабочий проект юриста.","matter.details":"Проверка структуры договора без реальных сторон и обязательств.","matter.hasAmount":"no","claim.request":"Подготовить вопросы клиенту и согласованную редакцию.","claim.evidence":"SYNTHETIC DEMO — рабочие материалы.","claim.attachments":"SYNTHETIC DEMO — приложения отсутствуют.","confirmation":true}',
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE EXISTS (SELECT 1 FROM `documents` WHERE `id`='51000000-0000-4000-8000-000000000002')
ON CONFLICT(`document_id`) DO UPDATE SET
  `answers_json`=excluded.`answers_json`,
  `updated_at`=excluded.`updated_at`;

UPDATE `documents`
SET `template_id`='candidate-1301001-v1',
    `template_code`='1301001',
    `template_version`='0.1.0',
    `participant_mode`='configurable',
    `acting_side`=NULL,
    `category`='Договоры',
    `status`='Черновик',
    `title`=CASE `id`
      WHEN '51000000-0000-4000-8000-000000000002' THEN 'Synthetic demo · рабочий проект юриста'
      ELSE 'Synthetic demo · проект договора'
    END,
    `updated_at`=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE `id` IN ('51000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000002');

UPDATE `document_current_content`
SET `auto_content`=CASE `document_id`
      WHEN '51000000-0000-4000-8000-000000000002' THEN 'SYNTHETIC DEMO — РАБОЧИЙ ПРОЕКТ ЮРИСТА\n\nКонтекст: анализ структуры демонстрационного договора Client Demo.\n\nПроверить: предмет, сроки, оплату, приёмку и порядок урегулирования разногласий.\n\nНе отправлять клиенту без явного подтверждения юриста.'
      ELSE 'SYNTHETIC DEMO — ПРОЕКТ ДОГОВОРА\n\nУчастники: Client Demo и Synthetic Counterparty LLC.\n\nПредмет: демонстрационная проверка условий поставки без реальных сторон, реквизитов или обязательств.\n\nСледующий шаг: согласовать безопасную редакцию с Lawyer Demo.\n\nЭтот проект создан только для investor demo и не является действующим договором.'
    END,
    `final_content`=CASE `document_id`
      WHEN '51000000-0000-4000-8000-000000000002' THEN 'SYNTHETIC DEMO — РАБОЧИЙ ПРОЕКТ ЮРИСТА\n\nКонтекст: анализ структуры демонстрационного договора Client Demo.\n\nПроверить: предмет, сроки, оплату, приёмку и порядок урегулирования разногласий.\n\nНе отправлять клиенту без явного подтверждения юриста.'
      ELSE 'SYNTHETIC DEMO — ПРОЕКТ ДОГОВОРА\n\nУчастники: Client Demo и Synthetic Counterparty LLC.\n\nПредмет: демонстрационная проверка условий поставки без реальных сторон, реквизитов или обязательств.\n\nСледующий шаг: согласовать безопасную редакцию с Lawyer Demo.\n\nЭтот проект создан только для investor demo и не является действующим договором.'
    END,
    `manually_edited`=1,
    `updated_at`=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE `document_id` IN ('51000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000002');
