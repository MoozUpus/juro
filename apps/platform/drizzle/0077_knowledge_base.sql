-- Migration 0077: versioned RU/UZ knowledge base with tenant-bound feedback.
-- Expand-only. Published article versions are immutable and public reads expose
-- only the current published version selected by article status/version number.
CREATE TABLE `knowledge_base_articles` (
  `id` text PRIMARY KEY NOT NULL,
  `slug` text NOT NULL,
  `category` text NOT NULL,
  `status` text DEFAULT 'draft' NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `published_at` text,
  CONSTRAINT `knowledge_base_articles_status_check` CHECK (`status` IN ('draft','published','archived')),
  CONSTRAINT `knowledge_base_articles_slug_check` CHECK (`slug` GLOB '[a-z0-9]*' AND length(`slug`) BETWEEN 3 AND 120)
);--> statement-breakpoint
CREATE UNIQUE INDEX `knowledge_base_articles_slug_uidx` ON `knowledge_base_articles` (`slug`);--> statement-breakpoint
CREATE INDEX `knowledge_base_articles_status_idx` ON `knowledge_base_articles` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `knowledge_base_article_versions` (
  `id` text PRIMARY KEY NOT NULL,
  `article_id` text NOT NULL,
  `version_number` integer NOT NULL,
  `title_ru` text NOT NULL,
  `title_uz` text NOT NULL,
  `summary_ru` text NOT NULL,
  `summary_uz` text NOT NULL,
  `body_ru_json` text NOT NULL,
  `body_uz_json` text NOT NULL,
  `related_slugs_json` text DEFAULT '[]' NOT NULL,
  `content_sha256` text NOT NULL,
  `created_at` text NOT NULL,
  `published_at` text,
  FOREIGN KEY (`article_id`) REFERENCES `knowledge_base_articles`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `knowledge_base_article_versions_number_check` CHECK (`version_number` >= 1),
  CONSTRAINT `knowledge_base_article_versions_hash_check` CHECK (length(`content_sha256`) = 64),
  CONSTRAINT `knowledge_base_article_versions_body_ru_check` CHECK (json_valid(`body_ru_json`)),
  CONSTRAINT `knowledge_base_article_versions_body_uz_check` CHECK (json_valid(`body_uz_json`)),
  CONSTRAINT `knowledge_base_article_versions_related_check` CHECK (json_valid(`related_slugs_json`))
);--> statement-breakpoint
CREATE UNIQUE INDEX `knowledge_base_article_versions_number_uidx` ON `knowledge_base_article_versions` (`article_id`,`version_number`);--> statement-breakpoint
CREATE INDEX `knowledge_base_article_versions_published_idx` ON `knowledge_base_article_versions` (`article_id`,`published_at`,`version_number`);--> statement-breakpoint
CREATE TABLE `knowledge_base_feedback` (
  `id` text PRIMARY KEY NOT NULL,
  `article_id` text NOT NULL,
  `version_id` text NOT NULL,
  `workspace_id` text NOT NULL,
  `user_id` text NOT NULL,
  `helpful` integer NOT NULL,
  `revision` integer DEFAULT 1 NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`article_id`) REFERENCES `knowledge_base_articles`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`version_id`) REFERENCES `knowledge_base_article_versions`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `knowledge_base_feedback_helpful_check` CHECK (`helpful` IN (0,1)),
  CONSTRAINT `knowledge_base_feedback_revision_check` CHECK (`revision` >= 1)
);--> statement-breakpoint
CREATE UNIQUE INDEX `knowledge_base_feedback_scope_uidx` ON `knowledge_base_feedback` (`article_id`,`version_id`,`workspace_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `knowledge_base_feedback_article_idx` ON `knowledge_base_feedback` (`article_id`,`version_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `knowledge_base_feedback_events` (
  `id` text PRIMARY KEY NOT NULL,
  `feedback_id` text NOT NULL,
  `article_id` text NOT NULL,
  `version_id` text NOT NULL,
  `workspace_id` text NOT NULL,
  `user_id` text NOT NULL,
  `helpful` integer NOT NULL,
  `revision` integer NOT NULL,
  `idempotency_key` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`feedback_id`) REFERENCES `knowledge_base_feedback`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `knowledge_base_feedback_events_helpful_check` CHECK (`helpful` IN (0,1)),
  CONSTRAINT `knowledge_base_feedback_events_revision_check` CHECK (`revision` >= 1),
  CONSTRAINT `knowledge_base_feedback_events_key_check` CHECK (length(`idempotency_key`) BETWEEN 16 AND 180)
);--> statement-breakpoint
CREATE UNIQUE INDEX `knowledge_base_feedback_events_revision_uidx` ON `knowledge_base_feedback_events` (`feedback_id`,`revision`);--> statement-breakpoint
CREATE UNIQUE INDEX `knowledge_base_feedback_events_idempotency_uidx` ON `knowledge_base_feedback_events` (`workspace_id`,`user_id`,`idempotency_key`);--> statement-breakpoint
CREATE TRIGGER `knowledge_base_feedback_events_insert_guard`
BEFORE INSERT ON `knowledge_base_feedback_events`
WHEN NOT EXISTS (
  SELECT 1 FROM `knowledge_base_feedback` feedback
  WHERE feedback.`id` = NEW.`feedback_id`
    AND feedback.`article_id` = NEW.`article_id`
    AND feedback.`version_id` = NEW.`version_id`
    AND feedback.`workspace_id` = NEW.`workspace_id`
    AND feedback.`user_id` = NEW.`user_id`
    AND feedback.`helpful` = NEW.`helpful`
    AND feedback.`revision` = NEW.`revision`
)
BEGIN
  SELECT RAISE(ABORT, 'knowledge_base_feedback_event_projection_mismatch');
END;--> statement-breakpoint
CREATE TRIGGER `knowledge_base_feedback_events_audit`
AFTER INSERT ON `knowledge_base_feedback_events`
BEGIN
  INSERT INTO `workspace_audit_events` (`id`,`workspace_id`,`actor_user_id`,`entity_type`,`entity_id`,`action`,`metadata_json`,`created_at`)
  VALUES (NEW.`id` || ':audit',NEW.`workspace_id`,NEW.`user_id`,'knowledge_base_feedback',NEW.`feedback_id`,'knowledge_base_feedback_recorded',json_object('articleId',NEW.`article_id`,'versionId',NEW.`version_id`,'helpful',NEW.`helpful`,'revision',NEW.`revision`),NEW.`created_at`);
END;--> statement-breakpoint
CREATE TRIGGER `knowledge_base_feedback_events_no_update`
BEFORE UPDATE ON `knowledge_base_feedback_events`
BEGIN
  SELECT RAISE(ABORT, 'knowledge_base_feedback_event_immutable');
END;--> statement-breakpoint
CREATE TRIGGER `knowledge_base_feedback_events_no_delete`
BEFORE DELETE ON `knowledge_base_feedback_events`
WHEN EXISTS (SELECT 1 FROM `knowledge_base_feedback` WHERE `id` = OLD.`feedback_id`)
BEGIN
  SELECT RAISE(ABORT, 'knowledge_base_feedback_event_immutable');
END;--> statement-breakpoint

INSERT INTO `knowledge_base_articles` (`id`,`slug`,`category`,`status`,`created_at`,`updated_at`,`published_at`) VALUES
('kb-ai-sources','ai-lawyer-sources','ai','published','2026-08-04T00:00:00.000Z','2026-08-04T00:00:00.000Z','2026-08-04T00:00:00.000Z'),
('kb-analysis-files','document-analysis-files','documents','published','2026-08-04T00:00:00.000Z','2026-08-04T00:00:00.000Z','2026-08-04T00:00:00.000Z'),
('kb-account-security','account-security','security','published','2026-08-04T00:00:00.000Z','2026-08-04T00:00:00.000Z','2026-08-04T00:00:00.000Z'),
('kb-cases-deadlines','cases-and-deadlines','cases','published','2026-08-04T00:00:00.000Z','2026-08-04T00:00:00.000Z','2026-08-04T00:00:00.000Z');--> statement-breakpoint
INSERT INTO `knowledge_base_article_versions` (`id`,`article_id`,`version_number`,`title_ru`,`title_uz`,`summary_ru`,`summary_uz`,`body_ru_json`,`body_uz_json`,`related_slugs_json`,`content_sha256`,`created_at`,`published_at`) VALUES
('kbv-ai-sources-1','kb-ai-sources',1,'Как AI-юрист JURO работает с источниками','AI-yurist JURO manbalar bilan qanday ishlaydi','Как отличить подтверждённую норму от вывода AI и когда подключать юриста.','Tasdiqlangan norma, AI xulosasi va yurist yordami qachon kerakligini ajrating.','[{"heading":"Как формируется ответ","paragraphs":["AI-юрист JURO сначала уточняет факты, затем отделяет подтверждённые нормы от предположений и показывает практические следующие шаги."]},{"heading":"Какие источники используются","paragraphs":["Для юридически значимых выводов JURO использует официальные материалы lex.uz, практические сценарии advice.uz и явно отмеченные внутренние материалы JURO. Ссылка, редакция и дата проверки показываются рядом с источником."]},{"heading":"Когда нужен живой юрист","paragraphs":["Если основание не подтверждено, источник устарел или ситуация содержит критический срок, ответ помечается предупреждением и предлагает передать контекст специалисту."]}]','[{"heading":"Javob qanday tuziladi","paragraphs":["AI-yurist JURO avval faktlarni aniqlashtiradi, so‘ng tasdiqlangan normalarni taxminlardan ajratadi va amaliy keyingi qadamlarni ko‘rsatadi."]},{"heading":"Qaysi manbalar ishlatiladi","paragraphs":["Yuridik ahamiyatga ega xulosalar uchun JURO lex.uz rasmiy materiallari, advice.uz amaliy ssenariylari va alohida belgilangan JURO ichki materiallaridan foydalanadi. Havola, tahrir va tekshiruv sanasi manba yonida ko‘rsatiladi."]},{"heading":"Qachon jonli yurist kerak","paragraphs":["Asos tasdiqlanmasa, manba eskirgan bo‘lsa yoki vaziyatda muhim muddat mavjud bo‘lsa, javob ogohlantirish bilan belgilanadi va kontekstni mutaxassisga topshirish taklif etiladi."]}]','["account-security","cases-and-deadlines"]','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','2026-08-04T00:00:00.000Z','2026-08-04T00:00:00.000Z'),
('kbv-analysis-files-1','kb-analysis-files',1,'Какие файлы можно проверить','Qaysi fayllarni tekshirish mumkin','Форматы, лимиты и этапы безопасной обработки документов.','Hujjatlarni xavfsiz qayta ishlash formatlari, limitlari va bosqichlari.','[{"heading":"Поддерживаемые материалы","paragraphs":["Можно загрузить PDF, DOCX, JPG или PNG. Один файл — до 50 МБ, до 20 файлов в одном пакете и до 500 страниц на пакет."]},{"heading":"Что происходит после загрузки","paragraphs":["Файл загружается в закрытое хранилище, проходит проверку типа и безопасности, извлечение текста или OCR и только после статуса готовности передаётся в анализ."]},{"heading":"Если текст распознан плохо","paragraphs":["JURO показывает предупреждение и страницы с низкой уверенностью. Нечитаемые фрагменты не должны додумываться системой."]}]','[{"heading":"Qo‘llab-quvvatlanadigan materiallar","paragraphs":["PDF, DOCX, JPG yoki PNG yuklash mumkin. Bitta fayl 50 MB gacha, bitta paketda 20 tagacha fayl va 500 betgacha bo‘lishi mumkin."]},{"heading":"Yuklangandan keyin nima bo‘ladi","paragraphs":["Fayl yopiq saqlash joyiga yuklanadi, turi va xavfsizligi tekshiriladi, matn yoki OCR olinadi va faqat tayyor holatidan keyin tahlilga yuboriladi."]},{"heading":"Matn yomon tanilsa","paragraphs":["JURO ogohlantirish va ishonchliligi past sahifalarni ko‘rsatadi. O‘qib bo‘lmaydigan qismlar tizim tomonidan to‘qib chiqarilmasligi kerak."]}]','["ai-lawyer-sources","account-security"]','bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','2026-08-04T00:00:00.000Z','2026-08-04T00:00:00.000Z'),
('kbv-account-security-1','kb-account-security',1,'Как защитить аккаунт JURO','JURO hisobini qanday himoya qilish kerak','Сессии, 2FA и безопасная работа с доступом.','Sessiyalar, 2FA va kirish huquqi bilan xavfsiz ishlash.','[{"heading":"Проверяйте активные устройства","paragraphs":["В настройках безопасности можно посмотреть активные сессии, завершить одну из них или выйти на всех устройствах."]},{"heading":"Включите 2FA","paragraphs":["Для дополнительной защиты используйте приложение-аутентификатор и сохраните резервные коды в отдельном безопасном месте. JURO не просит отправлять коды или ключи в поддержку."]},{"heading":"Контролируйте доступ","paragraphs":["Доступ юриста к делу предоставляется отдельно, показывает доступные материалы и может быть отозван пользователем."]}]','[{"heading":"Faol qurilmalarni tekshiring","paragraphs":["Xavfsizlik sozlamalarida faol sessiyalarni ko‘rish, bittasini yakunlash yoki barcha qurilmalardan chiqish mumkin."]},{"heading":"2FA ni yoqing","paragraphs":["Qo‘shimcha himoya uchun autentifikator ilovasidan foydalaning va zaxira kodlarni alohida xavfsiz joyda saqlang. JURO kod yoki kalitlarni qo‘llab-quvvatlash xizmatiga yuborishni so‘ramaydi."]},{"heading":"Kirish huquqini boshqaring","paragraphs":["Yuristga ish bo‘yicha kirish alohida beriladi, ochiq materiallar ko‘rsatiladi va foydalanuvchi tomonidan bekor qilinishi mumkin."]}]','["document-analysis-files","cases-and-deadlines"]','cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc','2026-08-04T00:00:00.000Z','2026-08-04T00:00:00.000Z'),
('kbv-cases-deadlines-1','kb-cases-deadlines',1,'Как работают дела, планы и сроки','Ishlar, rejalar va muddatlar qanday ishlaydi','Как собрать чат, документы, задачи и контрольные даты в одном деле.','Chat, hujjatlar, vazifalar va nazorat sanalarini bitta ishda jamlang.','[{"heading":"Что хранится в деле","paragraphs":["Дело объединяет чаты, документы, анализы, источники, задачи, календарные события и доступ юриста в одном контексте."]},{"heading":"Когда создаются задачи","paragraphs":["AI сначала предлагает план. Задачи появляются только после подтверждения пользователем действия «Добавить в дело»."]},{"heading":"Как проверять срок","paragraphs":["Для срока показываются исходная дата, правовое основание, тип дней, учтённые выходные и итоговая дата. Если исходная дата неизвестна, срок остаётся предварительным до уточнения."]}]','[{"heading":"Ishda nima saqlanadi","paragraphs":["Ish chatlar, hujjatlar, tahlillar, manbalar, vazifalar, kalendar voqealari va yurist kirishini bitta kontekstda birlashtiradi."]},{"heading":"Vazifalar qachon yaratiladi","paragraphs":["AI avval reja taklif qiladi. Vazifalar faqat foydalanuvchi «Ishga qo‘shish» amalini tasdiqlagandan keyin paydo bo‘ladi."]},{"heading":"Muddatni qanday tekshirish kerak","paragraphs":["Muddat uchun boshlang‘ich sana, huquqiy asos, kun turi, hisobga olingan dam olish kunlari va yakuniy sana ko‘rsatiladi. Boshlang‘ich sana noma’lum bo‘lsa, aniqlashtirilguncha muddat dastlabki bo‘lib qoladi."]}]','["ai-lawyer-sources","document-analysis-files"]','dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd','2026-08-04T00:00:00.000Z','2026-08-04T00:00:00.000Z');
--> statement-breakpoint
UPDATE `knowledge_base_article_versions` SET `content_sha256`='766834da5a9878b335c6837e52fcb350df4ea927699bf6b39bbe5e6f8929952c' WHERE `id`='kbv-ai-sources-1';--> statement-breakpoint
UPDATE `knowledge_base_article_versions` SET `content_sha256`='e799a860c1d028f257908e65c504c51ed806fb25bcbc8d6efe0f638382597f53' WHERE `id`='kbv-analysis-files-1';--> statement-breakpoint
UPDATE `knowledge_base_article_versions` SET `content_sha256`='27064ac2163495ca2aa778bd0eadf90203fb71f5759da14c8178c0c4b7462400' WHERE `id`='kbv-account-security-1';--> statement-breakpoint
UPDATE `knowledge_base_article_versions` SET `content_sha256`='fb9ea3e7015697d338770309d3eccf552732690a64290273b7167b6cb5366618' WHERE `id`='kbv-cases-deadlines-1';--> statement-breakpoint
CREATE TRIGGER `knowledge_base_published_versions_no_update`
BEFORE UPDATE ON `knowledge_base_article_versions`
WHEN OLD.`published_at` IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'knowledge_base_published_version_immutable');
END;--> statement-breakpoint
CREATE TRIGGER `knowledge_base_published_versions_no_delete`
BEFORE DELETE ON `knowledge_base_article_versions`
WHEN OLD.`published_at` IS NOT NULL AND EXISTS (SELECT 1 FROM `knowledge_base_articles` WHERE `id` = OLD.`article_id`)
BEGIN
  SELECT RAISE(ABORT, 'knowledge_base_published_version_immutable');
END;
