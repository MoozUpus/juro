-- Normalize the synthetic builder content to real line breaks and complete
-- the two exact questionnaire fields used by the configurable registry.

UPDATE `document_answers`
SET `answers_json`=json_set(
      `answers_json`,
      '$."representative.enabled"', 'no',
      '$."confirmation.accepted"', json('true')
    ),
    `updated_at`=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE `document_id` IN ('51000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000002');
UPDATE `document_current_content`
SET `auto_content`=replace(`auto_content`,char(92)||'n',char(10)),
    `final_content`=replace(`final_content`,char(92)||'n',char(10)),
    `manually_edited`=1,
    `updated_at`=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE `document_id` IN ('51000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000002');
