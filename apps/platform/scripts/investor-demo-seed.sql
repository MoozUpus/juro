-- JURO investor demonstration dataset, version 1.
-- Every person, matter, document, conversation and payment below is synthetic.
-- This script intentionally creates no OTP challenges, sessions, credentials,
-- uploaded files, legal-source claims or legislation updates.

INSERT OR IGNORE INTO `user_profiles`
  (`id`,`email`,`full_name`,`first_name`,`last_name`,`locale`,`account_type`,`timezone`,
   `default_workspace_id`,`onboarding_completed_at`,`lifecycle_status`,`created_at`,`updated_at`)
VALUES
  ('10000000-0000-4000-8000-000000000001','investor-client@juro.uz','Client Demo · JURO','Client Demo','JURO','ru','individual','Asia/Tashkent',
   NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'active',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('10000000-0000-4000-8000-000000000002','investor-lawyer@juro.uz','Lawyer Demo · JURO','Lawyer Demo','JURO','ru','lawyer','Asia/Tashkent',
   NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'active',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('10000000-0000-4000-8000-000000000003','investor-admin@juro.uz','Admin Demo · JURO','Admin Demo','JURO','ru','individual','Asia/Tashkent',
   NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'active',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));

INSERT OR IGNORE INTO `workspaces`
  (`id`,`type`,`name`,`full_name`,`short_name`,`created_by_user_id`,`locale`,`created_at`,`updated_at`)
VALUES
  ('20000000-0000-4000-8000-000000000001','individual','Investor Client · synthetic','Investor Client · synthetic','Client Demo','10000000-0000-4000-8000-000000000001','ru',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('20000000-0000-4000-8000-000000000002','lawyer','Investor Lawyer · synthetic','Investor Lawyer · synthetic','Lawyer Demo','10000000-0000-4000-8000-000000000002','ru',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('20000000-0000-4000-8000-000000000003','individual','Investor Admin · synthetic','Investor Admin · synthetic','Admin Demo','10000000-0000-4000-8000-000000000003','ru',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));

UPDATE `user_profiles`
SET `default_workspace_id`=CASE `id`
  WHEN '10000000-0000-4000-8000-000000000001' THEN '20000000-0000-4000-8000-000000000001'
  WHEN '10000000-0000-4000-8000-000000000002' THEN '20000000-0000-4000-8000-000000000002'
  WHEN '10000000-0000-4000-8000-000000000003' THEN '20000000-0000-4000-8000-000000000003'
END
WHERE `id` IN (
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003'
);

INSERT OR IGNORE INTO `workspace_members`
  (`id`,`workspace_id`,`user_id`,`role`,`status`,`joined_at`,`created_at`,`updated_at`)
VALUES
  ('21000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','owner','active',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('21000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','owner','active',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('21000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003','owner','active',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));

INSERT OR IGNORE INTO `platform_staff_assignments`
  (`id`,`user_id`,`role`,`grant_source`,`granted_by_user_id`,`grant_reason`,`granted_at`,`expires_at`,
   `revoked_at`,`revocation_source`,`revoked_by_user_id`,`revocation_reason`,`created_at`,`updated_at`)
VALUES
  ('c0000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','administrator','operator_bootstrap',NULL,
   'Synthetic investor demonstration administrator; production access remains MFA-gated.',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now','+365 days'),
   NULL,NULL,NULL,NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));

INSERT OR IGNORE INTO `lawyer_profiles`
  (`id`,`user_id`,`display_name`,`specialties_json`,`languages_json`,`status`,`marketplace_status`,
   `public_approved_at`,`publication_consent_at`,`accepting_new_requests`,`juro_approval_status`,`top_lawyer_status`,
   `experience_years`,`price_description`,`consultation_duration_minutes`,`additional_services_json`,
   `availability_status`,`next_available_at`,`advocate_status`,`firm_name`,`bio`,`profile_revision`,`city`,`region`,
   `education`,`consultation_formats_json`,`created_at`,`updated_at`)
VALUES
  ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','Lawyer Demo · JURO',
   '["Корпоративное право","Договоры"]','["ru","uz"]','public_approved','public_approved',
   strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'),1,'not_approved','not_featured',
   8,'Синтетическая демо-ставка: от 200 000 сум',60,'["Экспресс-проверка договора","Видеоконсультация"]',
   'available',strftime('%Y-%m-%dT%H:%M:%fZ','now','+1 day'),'declared','JURO Demo Legal',
   'Полностью синтетический профиль для демонстрации инвесторам. Не является реальным юристом или рекламой юридических услуг.',
   1,'Ташкент','Ташкент','Синтетические демонстрационные сведения об образовании','["video","chat"]',
   strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));

INSERT OR IGNORE INTO `lawyer_profile_publication_events`
  (`id`,`lawyer_profile_id`,`actor_user_id`,`profile_revision`,`previous_profile_status`,`previous_marketplace_status`,`publication_consent_at`,`created_at`)
VALUES
  ('31000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',1,
   'pending','profile_incomplete',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));

INSERT OR IGNORE INTO `lawyer_trials`
  (`id`,`lawyer_profile_id`,`starts_at`,`ends_at`,`status`,`post_expiry_mode`,`created_at`,`updated_at`)
VALUES
  ('32000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',strftime('%Y-%m-%dT%H:%M:%fZ','now'),
   strftime('%Y-%m-%dT%H:%M:%fZ','now','+90 days'),'active','stay_published',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));

INSERT OR IGNORE INTO `lawyer_availability_rules`
  (`id`,`lawyer_profile_id`,`weekday`,`starts_at`,`ends_at`,`timezone`,`status`,`created_at`,`updated_at`)
VALUES
  ('33000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',1,'09:00','18:00','Asia/Tashkent','active',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('33000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001',3,'09:00','18:00','Asia/Tashkent','active',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('33000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000001',5,'09:00','16:00','Asia/Tashkent','active',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));

INSERT OR IGNORE INTO `cases`
  (`id`,`workspace_id`,`owner_user_id`,`account_type`,`locale`,`title`,`description`,`legal_area`,`status`,
   `current_revision`,`next_deadline_at`,`lifecycle_revision`,`created_at`,`updated_at`)
VALUES
  ('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
   'individual','ru','Synthetic demo · проверка договора','Синтетическое дело без реальных персональных или юридических данных.','Корпоративное право','open',
   1,strftime('%Y-%m-%dT%H:%M:%fZ','now','+10 days'),0,strftime('%Y-%m-%dT%H:%M:%fZ','now','-5 days'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));

INSERT OR IGNORE INTO `case_events`
  (`id`,`case_id`,`actor_user_id`,`event_type`,`metadata_json`,`created_at`)
VALUES
  ('41000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
   'synthetic_demo_case_created','{"synthetic":true,"datasetVersion":1}',strftime('%Y-%m-%dT%H:%M:%fZ','now','-5 days'));

INSERT OR IGNORE INTO `action_plans`
  (`id`,`case_id`,`created_by_user_id`,`title`,`status`,`progress_percent`,`current_revision`,`created_at`,`updated_at`)
VALUES
  ('70000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
   'Synthetic demo · подготовка договорной позиции','in_progress',50,1,strftime('%Y-%m-%dT%H:%M:%fZ','now','-4 days'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));

INSERT OR IGNORE INTO `action_plan_steps`
  (`id`,`plan_id`,`ordinal`,`title`,`description`,`status`,`deadline_type`,`due_at`,`assignee_user_id`,`action_type`,`revision`,`created_at`,`updated_at`)
VALUES
  ('71000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001',1,'Собрать исходные условия','Синтетический завершённый шаг.','completed','calendar_days',strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 days'),'10000000-0000-4000-8000-000000000001','review',1,strftime('%Y-%m-%dT%H:%M:%fZ','now','-4 days'),strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 days')),
  ('71000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000001',2,'Согласовать безопасную редакцию','Синтетический активный шаг для совместной работы.','in_progress','calendar_days',strftime('%Y-%m-%dT%H:%M:%fZ','now','+7 days'),'10000000-0000-4000-8000-000000000002','document',1,strftime('%Y-%m-%dT%H:%M:%fZ','now','-4 days'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));

INSERT OR IGNORE INTO `tasks`
  (`id`,`workspace_id`,`case_id`,`plan_step_id`,`owner_user_id`,`title`,`description`,`due_at`,`safe_due_at`,`calculation_method`,`deadline_type`,`status`,`created_at`,`updated_at`)
VALUES
  ('e0000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
   '71000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Synthetic demo · согласовать редакцию',
   'Совместная задача клиента и юриста на синтетических данных.',strftime('%Y-%m-%dT%H:%M:%fZ','now','+7 days'),strftime('%Y-%m-%dT%H:%M:%fZ','now','+6 days'),
   'synthetic_demo','calendar_days','planned',strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 days'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));

INSERT OR IGNORE INTO `document_templates`
  (`id`,`key`,`category`,`active`,`created_at`,`updated_at`)
VALUES
  ('candidate-1301001-v1','1301001','contracts',1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));

INSERT OR IGNORE INTO `document_template_locales`
  (`id`,`template_id`,`language`,`name`,`source_object_key`,`created_at`,`updated_at`)
VALUES
  ('candidate-1301001-v1-ru','candidate-1301001-v1','ru','Договор купли-продажи товаров между организациями',NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('candidate-1301001-v1-uz','candidate-1301001-v1','uz','Tashkilotlar o‘rtasida tovar oldi-sotdi shartnomasi',NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));

INSERT OR IGNORE INTO `documents`
  (`id`,`workspace_id`,`owner_user_id`,`template_id`,`template_code`,`template_version`,`language`,`participant_mode`,`acting_side`,
   `title`,`category`,`status`,`case_id`,`plan_step_id`,`generated_at`,`revision`,`created_at`,`updated_at`)
VALUES
  ('51000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
   'candidate-1301001-v1','1301001','0.1.0','ru','configurable',NULL,'Synthetic demo · проект договора','Договоры','Черновик',
   '40000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000002',strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day'),1,strftime('%Y-%m-%dT%H:%M:%fZ','now','-3 days'),strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('51000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',
   'candidate-1301001-v1','1301001','0.1.0','ru','configurable',NULL,'Synthetic demo · рабочий проект юриста','Договоры','Черновик',
   NULL,NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day'),1,strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 days'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));

-- The canonical document route loads configurable drafts only when the
-- questionnaire answers exist and the template code belongs to the registry.
INSERT INTO `document_answers` (`document_id`,`answers_json`,`updated_at`)
VALUES
  ('51000000-0000-4000-8000-000000000001','{"court.name":"SYNTHETIC DEMO — адресат","applicant.fullName":"Client Demo","applicant.address":"SYNTHETIC DEMO","applicant.phone":"+998 00 000 00 00","otherParty.type":"company","otherParty.companyName":"Synthetic Counterparty LLC","otherParty.tin":"000000000","otherParty.address":"SYNTHETIC DEMO","representative.enabled":"no","case.proceduralStatus":"other","case.background":"Синтетический сценарий проверки проекта договора.","matter.details":"Проверка предмета, сроков, оплаты и порядка приёмки без реальных сторон и обязательств.","matter.hasAmount":"no","claim.request":"Подготовить согласованную безопасную редакцию проекта.","claim.evidence":"SYNTHETIC DEMO — проект без реальных документов.","claim.attachments":"SYNTHETIC DEMO — приложения отсутствуют.","confirmation.accepted":true}',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('51000000-0000-4000-8000-000000000002','{"court.name":"SYNTHETIC DEMO — адресат","applicant.fullName":"Lawyer Demo","applicant.address":"SYNTHETIC DEMO","applicant.phone":"+998 00 000 00 00","otherParty.type":"company","otherParty.companyName":"Synthetic Counterparty LLC","otherParty.tin":"000000000","otherParty.address":"SYNTHETIC DEMO","representative.enabled":"no","case.proceduralStatus":"other","case.background":"Синтетический рабочий проект юриста.","matter.details":"Проверка структуры договора без реальных сторон и обязательств.","matter.hasAmount":"no","claim.request":"Подготовить вопросы клиенту и согласованную редакцию.","claim.evidence":"SYNTHETIC DEMO — рабочие материалы.","claim.attachments":"SYNTHETIC DEMO — приложения отсутствуют.","confirmation.accepted":true}',strftime('%Y-%m-%dT%H:%M:%fZ','now'))
ON CONFLICT(`document_id`) DO UPDATE SET
  `answers_json`=excluded.`answers_json`,
  `updated_at`=excluded.`updated_at`;

INSERT OR IGNORE INTO `document_current_content`
  (`document_id`,`auto_content`,`final_content`,`manually_edited`,`updated_at`)
VALUES
  ('51000000-0000-4000-8000-000000000001','SYNTHETIC DEMO — ПРОЕКТ ДОГОВОРА'||char(10)||char(10)||'Участники: Client Demo и Synthetic Counterparty LLC.'||char(10)||char(10)||'Предмет: демонстрационная проверка условий поставки без реальных сторон, реквизитов или обязательств.'||char(10)||char(10)||'Следующий шаг: согласовать безопасную редакцию с Lawyer Demo.'||char(10)||char(10)||'Этот проект создан только для investor demo и не является действующим договором.','SYNTHETIC DEMO — ПРОЕКТ ДОГОВОРА'||char(10)||char(10)||'Участники: Client Demo и Synthetic Counterparty LLC.'||char(10)||char(10)||'Предмет: демонстрационная проверка условий поставки без реальных сторон, реквизитов или обязательств.'||char(10)||char(10)||'Следующий шаг: согласовать безопасную редакцию с Lawyer Demo.'||char(10)||char(10)||'Этот проект создан только для investor demo и не является действующим договором.',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('51000000-0000-4000-8000-000000000002','SYNTHETIC DEMO — РАБОЧИЙ ПРОЕКТ ЮРИСТА'||char(10)||char(10)||'Контекст: анализ структуры демонстрационного договора Client Demo.'||char(10)||char(10)||'Проверить: предмет, сроки, оплату, приёмку и порядок урегулирования разногласий.'||char(10)||char(10)||'Не отправлять клиенту без явного подтверждения юриста.','SYNTHETIC DEMO — РАБОЧИЙ ПРОЕКТ ЮРИСТА'||char(10)||char(10)||'Контекст: анализ структуры демонстрационного договора Client Demo.'||char(10)||char(10)||'Проверить: предмет, сроки, оплату, приёмку и порядок урегулирования разногласий.'||char(10)||char(10)||'Не отправлять клиенту без явного подтверждения юриста.',1,strftime('%Y-%m-%dT%H:%M:%fZ','now'));

-- Re-applying the seed also upgrades a version-1 dataset that was created
-- before its document records were made compatible with JURO Builder.
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
SET `manually_edited`=1,
    `updated_at`=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE `document_id` IN ('51000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000002');

INSERT OR IGNORE INTO `conversations`
  (`id`,`workspace_id`,`owner_user_id`,`case_id`,`title`,`locale`,`status`,`created_at`,`updated_at`)
VALUES
  ('60000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','Synthetic demo · уточнение по договору','ru','active',strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 days'),strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 days')),
  ('60000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',NULL,'Synthetic demo · анализ позиции клиента','ru','active',strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day'),strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day'));

INSERT OR IGNORE INTO `conversation_messages`
  (`id`,`conversation_id`,`author_type`,`content`,`structured_json`,`created_at`)
VALUES
  ('61000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','user','SYNTHETIC DEMO: какие данные нужны для проверки проекта договора?',NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 days')),
  ('61000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000001','assistant','Для содержательной проверки нужны предмет, стороны, цена, сроки и желаемый результат. В демонстрации реальные данные не используются.',
   '{"confirmedFindings":[],"responseKind":"clarification_required","summary":"Синтетический демонстрационный диалог.","answer":"Уточните предмет, стороны, цену, сроки и желаемый результат; не вводите реальные персональные данные в инвесторском демо.","language":"ru","jurisdiction":"UZ","answerMode":"detailed","reasoningMode":"fast","clarificationQuestions":["Каков предмет договора?","Какой результат требуется?"],"assumptions":[],"risks":[],"sources":[],"requiredDocuments":[],"actionPlan":[],"deadlines":[],"successOutlook":null,"urgency":"normal","suggestedDocument":null,"suggestLawyer":true,"legalDatabaseAsOf":"2026-08-22T00:00:00.000Z","sourceAccessMode":"direct","sourcesRetrievedAt":null,"sourceValidationStatus":"unavailable","coverageStatus":"no_coverage"}',
   strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 days')),
  ('61000000-0000-4000-8000-000000000003','60000000-0000-4000-8000-000000000002','user','SYNTHETIC DEMO: подготовь вопросы клиенту перед анализом договора.',NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day')),
  ('61000000-0000-4000-8000-000000000004','60000000-0000-4000-8000-000000000002','assistant','Сначала уточните предмет, применимое право, существенные сроки и ожидаемый результат. Это синтетическая демонстрация без правового вывода.',
   '{"confirmedFindings":[],"responseKind":"clarification_required","summary":"Синтетическая демонстрация подготовки анализа.","answer":"Нужны предмет договора, применимое право, существенные сроки и ожидаемый результат.","language":"ru","jurisdiction":"UZ","answerMode":"detailed","reasoningMode":"fast","clarificationQuestions":["Каков предмет договора?","Какое применимое право указано?","Каков ожидаемый результат?"],"assumptions":[],"risks":[],"sources":[],"requiredDocuments":[],"actionPlan":[],"deadlines":[],"successOutlook":null,"urgency":"normal","suggestedDocument":null,"suggestLawyer":false,"legalDatabaseAsOf":"2026-08-22T00:00:00.000Z","sourceAccessMode":"direct","sourcesRetrievedAt":null,"sourceValidationStatus":"unavailable","coverageStatus":"no_coverage"}',
   strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day'));

INSERT OR IGNORE INTO `monitoring_preferences`
  (`id`,`workspace_id`,`user_id`,`audience`,`topics_json`,`channels_json`,`frequency`,`locale`,`document_impact_consent`,`last_delivered_at`,`created_at`,`updated_at`)
VALUES
  ('80000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','individual','["contracts"]','["in_app"]','weekly','ru',0,NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('80000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','lawyer','["contracts","corporate"]','["in_app"]','daily','ru',0,NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));

INSERT OR IGNORE INTO `lawyer_requests`
  (`id`,`workspace_id`,`case_id`,`requester_user_id`,`lawyer_profile_id`,`status`,`anonymized_summary`,`requested_scope_json`,`created_at`,`updated_at`)
VALUES
  ('90000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','accepted',
   'SYNTHETIC DEMO: проверка структуры и рисков проекта договора без реальных сторон.','["consultation","document_review","case_transfer"]',
   strftime('%Y-%m-%dT%H:%M:%fZ','now','-3 days'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));

INSERT OR IGNORE INTO `conflict_checks`
  (`id`,`lawyer_request_id`,`lawyer_profile_id`,`status`,`reviewed_at`,`reviewed_by_user_id`,`created_at`)
VALUES
  ('90100000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','cleared',strftime('%Y-%m-%dT%H:%M:%fZ','now','-3 days'),'10000000-0000-4000-8000-000000000002',strftime('%Y-%m-%dT%H:%M:%fZ','now','-3 days'));

INSERT OR IGNORE INTO `lawyer_offers`
  (`id`,`lawyer_request_id`,`version`,`status`,`scope_description`,`price_description`,`duration_description`,`created_by_user_id`,`responded_by_user_id`,`responded_at`,`created_at`,`updated_at`)
VALUES
  ('90200000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001',1,'accepted','SYNTHETIC DEMO: консультация и проверка проекта договора.','200 000 сум — синтетическая демо-цена.','До 3 рабочих дней.','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 days'),strftime('%Y-%m-%dT%H:%M:%fZ','now','-3 days'),strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 days'));

INSERT OR IGNORE INTO `lawyer_access_grants`
  (`id`,`lawyer_request_id`,`case_id`,`lawyer_user_id`,`granted_by_user_id`,`expires_at`,`revoked_at`,`revoke_reason`,`created_at`)
VALUES
  ('90300000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',strftime('%Y-%m-%dT%H:%M:%fZ','now','+30 days'),NULL,NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 days'));

INSERT OR IGNORE INTO `lawyer_time_entries`
  (`id`,`lawyer_user_id`,`workspace_id`,`case_id`,`lawyer_request_id`,`source`,`status`,`description`,`billable`,
   `started_at`,`ended_at`,`duration_seconds`,`created_at`,`updated_at`)
VALUES
  ('90500000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001',
   '40000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','manual','completed',
   'SYNTHETIC DEMO: первичная проверка структуры проекта договора.',1,strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day','-1 hour'),
   strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day'),3600,strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day'),strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day'));

INSERT OR IGNORE INTO `lawyer_knowledge_items`
  (`id`,`lawyer_user_id`,`workspace_id`,`case_id`,`client_user_id`,`kind`,`title`,`content`,`source_url`,`folder`,`tags_json`,`favorite`,`archived_at`,`created_at`,`updated_at`)
VALUES
  ('90700000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002',
   '40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','legal_position','Synthetic demo · вопросы к проекту договора',
   'SYNTHETIC DEMO: уточнить предмет, сроки, порядок приёмки и предел ответственности. Не является юридическим заключением.',
   NULL,'Договорная работа','["demo","договор"]',1,NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day'),strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day')),
  ('90700000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002',
   NULL,NULL,'clause','Synthetic demo · оговорка об ответственности',
   'SYNTHETIC DEMO: пример рабочей оговорки без реальных сторон, сумм или обязательств.',NULL,'Библиотека оговорок',
   '["demo","оговорка"]',0,NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 days'),strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 days'));

INSERT OR IGNORE INTO `lawyer_request_messages`
  (`id`,`lawyer_request_id`,`author_user_id`,`author_role`,`body`,`read_at`,`created_at`)
VALUES
  ('90400000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','client','SYNTHETIC DEMO: прикрепил проект без реальных данных.',strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day'),strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 days')),
  ('90400000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','lawyer','SYNTHETIC DEMO: получил документ, обсудим вопросы на видеоконсультации.',NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day'));

INSERT OR IGNORE INTO `lawyer_task_comments`
  (`id`,`task_id`,`author_user_id`,`body`,`created_at`,`updated_at`)
VALUES
  ('e1000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',
   'SYNTHETIC DEMO: отметил пункты для обсуждения на звонке.',strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day'),strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day'));

INSERT OR IGNORE INTO `lawyer_consultations`
  (`id`,`lawyer_request_id`,`lawyer_profile_id`,`client_user_id`,`case_id`,`starts_at`,`ends_at`,`timezone`,`format`,`status`,`internal_note`,`result_note`,`created_at`,`updated_at`)
VALUES
  ('90600000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
   strftime('%Y-%m-%dT10:00:00.000Z','now','+1 day'),strftime('%Y-%m-%dT11:00:00.000Z','now','+1 day'),'Asia/Tashkent','video','confirmed','SYNTHETIC DEMO — без реальных сведений.',NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));

INSERT OR IGNORE INTO `lawyer_profile_deletion_requests`
  (`id`,`lawyer_profile_id`,`requested_by_user_id`,`status`,`reason`,`decision_reason`,`reviewed_by_user_id`,`requested_at`,`reviewed_at`,`created_at`,`updated_at`)
VALUES
  ('b0000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','requested',
   'SYNTHETIC DEMO: запрос для показа контролируемого решения администратора.',NULL,NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));

INSERT OR IGNORE INTO `notifications`
  (`id`,`workspace_id`,`user_id`,`document_id`,`target_type`,`target_id`,`type`,`title`,`body`,`read_at`,`created_at`)
VALUES
  ('b1000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',NULL,
   'lawyer_consultation','90600000-0000-4000-8000-000000000001','lawyer_consultation_confirmed','SYNTHETIC DEMO · консультация подтверждена','Откройте конкретную видеоконсультацию.',NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('b1000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',NULL,
   'lawyer_request','90000000-0000-4000-8000-000000000001','lawyer_request_received','SYNTHETIC DEMO · новая заявка','Откройте конкретную заявку клиента.',NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('b1000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003',NULL,
   'admin_lawyer_profile_deletion','b0000000-0000-4000-8000-000000000001','lawyer_profile_deletion_requested','SYNTHETIC DEMO · запрос на удаление','Откройте конкретный запрос и примите контролируемое решение.',NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now'));

INSERT OR IGNORE INTO `billing_case_transfer_fee_rules`
  (`id`,`version`,`label_ru`,`label_uz`,`legal_area`,`case_type`,`fee_basis_points`,`priority`,`effective_from`,`effective_to`,`created_by_user_id`,`reason`,`created_at`)
VALUES
  ('a1000000-0000-4000-8000-000000000001',1,'Семейные дела — 2%','Oilaviy ishlar — 2%','Семейное право',NULL,200,100,'2020-01-01T00:00:00.000Z',NULL,'10000000-0000-4000-8000-000000000003','Synthetic investor demo fee rule.',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('a1000000-0000-4000-8000-000000000002',2,'Корпоративные дела — 5%','Korporativ ishlar — 5%','Корпоративное право',NULL,500,200,'2020-01-01T00:00:00.000Z',NULL,'10000000-0000-4000-8000-000000000003','Synthetic investor demo fee rule.',strftime('%Y-%m-%dT%H:%M:%fZ','now'));

INSERT OR IGNORE INTO `billing_fee_configuration_events`
  (`id`,`entity_type`,`entity_id`,`action`,`actor_user_id`,`reason`,`previous_snapshot_json`,`next_snapshot_json`,`created_at`)
VALUES
  ('a1100000-0000-4000-8000-000000000001','case_transfer_rule','a1000000-0000-4000-8000-000000000001','created','10000000-0000-4000-8000-000000000003','Synthetic investor demo fee rule.',NULL,'{"feeBasisPoints":200,"legalArea":"Семейное право","synthetic":true}',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('a1100000-0000-4000-8000-000000000002','case_transfer_rule','a1000000-0000-4000-8000-000000000002','created','10000000-0000-4000-8000-000000000003','Synthetic investor demo fee rule.',NULL,'{"feeBasisPoints":500,"legalArea":"Корпоративное право","synthetic":true}',strftime('%Y-%m-%dT%H:%M:%fZ','now'));

INSERT OR IGNORE INTO `demo_payment_runs`
  (`id`,`external_id`,`workspace_id`,`user_id`,`flow_type`,`provider`,`is_simulation`,`amount_minor`,`currency`,`installment_count`,
   `service_kind`,`payment_method`,`legal_area`,`fee_policy_version_id`,`case_transfer_fee_rule_id`,`lawyer_service_amount_minor`,
   `consultation_fee_amount_minor`,`case_transfer_fee_amount_minor`,`juro_service_markup_minor`,`client_total_minor`,`lawyer_payout_minor`,
   `breakdown_json`,`status`,`idempotency_key`,`version`,`created_at`,`updated_at`)
VALUES
  ('a0000000-0000-4000-8000-000000000001','demo_investor_client_v1','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','lawyer_service','demo',1,5000000,'UZS',NULL,
   'consultation','direct','Корпоративное право','billing-fee-system-v1',NULL,5000000,50000,0,0,5000000,4950000,
   '{"serviceKind":"consultation","paymentMethod":"direct","lawyerServiceAmountMinor":5000000,"consultationFeeBasisPoints":100,"consultationFeeAmountMinor":50000,"caseTransferFeeBasisPoints":0,"caseTransferFeeAmountMinor":0,"juroServiceMarkupBasisPoints":0,"juroServiceMarkupMinor":0,"clientTotalMinor":5000000,"lawyerPayoutMinor":4950000,"platformRevenueMinor":50000,"installmentCount":null,"feePolicy":{"id":"billing-fee-system-v1","version":1},"appliedCaseTransferRule":null}',
   'succeeded','investor-demo:client:v1',2,strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day'),strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day')),
  ('a0000000-0000-4000-8000-000000000002','demo_investor_lawyer_v1','20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','lawyer_service','demo',1,20000000,'UZS',NULL,
   'case_transfer','direct','Корпоративное право','billing-fee-system-v1','a1000000-0000-4000-8000-000000000002',20000000,0,1000000,0,20000000,19000000,
   '{"serviceKind":"case_transfer","paymentMethod":"direct","lawyerServiceAmountMinor":20000000,"consultationFeeBasisPoints":0,"consultationFeeAmountMinor":0,"caseTransferFeeBasisPoints":500,"caseTransferFeeAmountMinor":1000000,"juroServiceMarkupBasisPoints":0,"juroServiceMarkupMinor":0,"clientTotalMinor":20000000,"lawyerPayoutMinor":19000000,"platformRevenueMinor":1000000,"installmentCount":null,"feePolicy":{"id":"billing-fee-system-v1","version":1},"appliedCaseTransferRule":{"id":"a1000000-0000-4000-8000-000000000002","version":2,"labelRu":"Корпоративные дела — 5%","labelUz":"Korporativ ishlar — 5%"}}',
   'paid_out','investor-demo:lawyer:v1',3,strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day'),strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('a0000000-0000-4000-8000-000000000003','demo_investor_admin_v1','20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003','subscription','demo',1,9900000,'UZS',NULL,
   'subscription','direct',NULL,'billing-fee-system-v1',NULL,9900000,0,0,0,9900000,0,
   '{"serviceKind":"subscription","paymentMethod":"direct","lawyerServiceAmountMinor":9900000,"consultationFeeBasisPoints":0,"consultationFeeAmountMinor":0,"caseTransferFeeBasisPoints":0,"caseTransferFeeAmountMinor":0,"juroServiceMarkupBasisPoints":0,"juroServiceMarkupMinor":0,"clientTotalMinor":9900000,"lawyerPayoutMinor":0,"platformRevenueMinor":0,"installmentCount":null,"feePolicy":{"id":"billing-fee-system-v1","version":1},"appliedCaseTransferRule":null}',
   'succeeded','investor-demo:admin:v1',2,strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day'),strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day'));

INSERT OR IGNORE INTO `demo_payment_events`
  (`id`,`run_id`,`ordinal`,`action`,`previous_status`,`status`,`actor_user_id`,`created_at`)
VALUES
  ('a0100000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001',1,'created',NULL,'previewed','10000000-0000-4000-8000-000000000001',strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day')),
  ('a0100000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001',2,'succeed','previewed','succeeded','10000000-0000-4000-8000-000000000001',strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day')),
  ('a0200000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002',1,'created',NULL,'previewed','10000000-0000-4000-8000-000000000002',strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day')),
  ('a0200000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000002',2,'succeed','previewed','succeeded','10000000-0000-4000-8000-000000000002',strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day')),
  ('a0200000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000002',3,'payout','succeeded','paid_out','10000000-0000-4000-8000-000000000002',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('a0300000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000003',1,'created',NULL,'previewed','10000000-0000-4000-8000-000000000003',strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day')),
  ('a0300000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000003',2,'succeed','previewed','succeeded','10000000-0000-4000-8000-000000000003',strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day'));

INSERT OR IGNORE INTO `workspace_audit_events`
  (`id`,`workspace_id`,`actor_user_id`,`entity_type`,`entity_id`,`action`,`metadata_json`,`created_at`)
VALUES
  ('d0000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','investor_demo','client_demo','synthetic_dataset_seeded','{"synthetic":true,"datasetVersion":1}',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('d0000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','investor_demo','lawyer_demo','synthetic_dataset_seeded','{"synthetic":true,"datasetVersion":1}',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('d0000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003','investor_demo','admin_demo','synthetic_dataset_seeded','{"synthetic":true,"datasetVersion":1}',strftime('%Y-%m-%dT%H:%M:%fZ','now'));

INSERT OR IGNORE INTO `investor_demo_accounts`
  (`account_key`,`user_id`,`workspace_id`,`dataset_version`,`status`,`synthetic_disclosure`,`created_at`,`updated_at`)
VALUES
  ('client_demo','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',1,'active','Investor Demo: all people, documents, cases and payments in this account are synthetic.',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('lawyer_demo','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002',1,'active','Investor Demo: all people, documents, cases and payments in this account are synthetic.',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('admin_demo','10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003',1,'active','Investor Demo: all people, documents, cases and payments in this account are synthetic.',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));

INSERT OR IGNORE INTO `investor_demo_dataset_events`
  (`id`,`dataset_version`,`event_type`,`actor_user_id`,`summary_json`,`created_at`)
VALUES
  ('d1000000-0000-4000-8000-000000000001',1,'seeded','10000000-0000-4000-8000-000000000003',
   '{"synthetic":true,"accounts":["client_demo","lawyer_demo","admin_demo"],"containsRealPersonalData":false,"containsFakeLegalSources":false}',strftime('%Y-%m-%dT%H:%M:%fZ','now'));

SELECT
  (SELECT count(*) FROM `investor_demo_accounts` WHERE `dataset_version`=1 AND `status`='active') AS `active_demo_accounts`,
  (SELECT count(*) FROM `demo_payment_runs` WHERE `id` IN ('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000003') AND `provider`='demo' AND `is_simulation`=1) AS `synthetic_payments`,
  (SELECT count(*) FROM `lawyer_profiles` WHERE `id`='30000000-0000-4000-8000-000000000001' AND `publication_consent_at` IS NOT NULL) AS `published_demo_lawyers`;
