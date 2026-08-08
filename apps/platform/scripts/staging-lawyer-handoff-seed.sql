-- SYNTHETIC STAGING FIXTURE ONLY. Never execute against production.
--
-- The rows below make the public marketplace and booking gates observable in
-- staging without creating a real person, a login session, an OTP challenge,
-- a case, a request, or a payment. Both display names and .invalid addresses
-- deliberately identify the records as fixtures. The profile image is the
-- existing JURO logo uploaded separately to the private staging R2 bucket.

-- Fully completed but still pending: it may be listed, but its CTA must remain
-- disabled until a real, audited moderation decision is recorded.
INSERT OR IGNORE INTO user_profiles (
  id,email,full_name,phone,locale,account_type,onboarding_completed_at,
  timezone,created_at,updated_at
) VALUES (
  '22000000-0000-4000-8000-000000000011',
  'staging-pending-lawyer@fixtures.invalid',
  'JURO staging fixture — pending lawyer',
  '+998000000011','ru','lawyer','2026-08-07T00:00:00.000Z',
  'Asia/Tashkent','2026-08-07T00:00:00.000Z','2026-08-07T00:00:00.000Z'
);

INSERT OR IGNORE INTO workspaces (id,type,name,locale,created_by_user_id,created_at,updated_at)
VALUES (
  '22000000-0000-4000-8000-000000000012','individual',
  'JURO staging fixture — pending lawyer','ru',
  '22000000-0000-4000-8000-000000000011',
  '2026-08-07T00:00:00.000Z','2026-08-07T00:00:00.000Z'
);

INSERT OR IGNORE INTO workspace_members (id,workspace_id,user_id,role,status,joined_at,created_at,updated_at)
VALUES (
  '22000000-0000-4000-8000-000000000013',
  '22000000-0000-4000-8000-000000000012',
  '22000000-0000-4000-8000-000000000011','owner','active',
  '2026-08-07T00:00:00.000Z','2026-08-07T00:00:00.000Z','2026-08-07T00:00:00.000Z'
);

UPDATE user_profiles
SET default_workspace_id='22000000-0000-4000-8000-000000000012'
WHERE id='22000000-0000-4000-8000-000000000011' AND default_workspace_id IS NULL;

INSERT OR IGNORE INTO lawyer_profiles (
  id,user_id,display_name,specialties_json,languages_json,status,marketplace_status,
  experience_years,price_description,availability_status,advocate_status,firm_name,bio,
  city,region,education,consultation_formats_json,
  profile_photo_key,profile_photo_mime,profile_photo_sha256,profile_photo_size_bytes,
  created_at,updated_at
) VALUES (
  '22000000-0000-4000-8000-000000000014',
  '22000000-0000-4000-8000-000000000011',
  'JURO staging fixture — профиль на проверке',
  '["contracts"]','["ru","uz"]','pending','pending_review',
  5,'Только синтетический staging-тест','available','declared',
  'JURO staging fixture','Не реальный юрист. Профиль нужен для проверки pending-review UX.',
  'Tashkent','Tashkent','Synthetic staging fixture','["chat"]',
  'staging-fixtures/lawyer-profile-juro-logo.png','image/png',
  '878ac78393832b42307e73f8ae93f721b7ac84f71ff1fef19566eb78b4bfd271',211767,
  '2026-08-07T00:00:00.000Z','2026-08-07T00:00:00.000Z'
);

-- Approved fixture: its status is changed only by the existing immutable
-- lawyer_profile_moderation trigger. The moderator is the sole staging user
-- available for the owner-authorized beta review; no staff role is fabricated.
INSERT OR IGNORE INTO user_profiles (
  id,email,full_name,phone,locale,account_type,onboarding_completed_at,
  timezone,created_at,updated_at
) VALUES (
  '22000000-0000-4000-8000-000000000001',
  'staging-approved-lawyer@fixtures.invalid',
  'JURO staging fixture — approved lawyer',
  '+998000000001','ru','lawyer','2026-08-07T00:00:00.000Z',
  'Asia/Tashkent','2026-08-07T00:00:00.000Z','2026-08-07T00:00:00.000Z'
);

INSERT OR IGNORE INTO workspaces (id,type,name,locale,created_by_user_id,created_at,updated_at)
VALUES (
  '22000000-0000-4000-8000-000000000002','individual',
  'JURO staging fixture — approved lawyer','ru',
  '22000000-0000-4000-8000-000000000001',
  '2026-08-07T00:00:00.000Z','2026-08-07T00:00:00.000Z'
);

INSERT OR IGNORE INTO workspace_members (id,workspace_id,user_id,role,status,joined_at,created_at,updated_at)
VALUES (
  '22000000-0000-4000-8000-000000000003',
  '22000000-0000-4000-8000-000000000002',
  '22000000-0000-4000-8000-000000000001','owner','active',
  '2026-08-07T00:00:00.000Z','2026-08-07T00:00:00.000Z','2026-08-07T00:00:00.000Z'
);

UPDATE user_profiles
SET default_workspace_id='22000000-0000-4000-8000-000000000002'
WHERE id='22000000-0000-4000-8000-000000000001' AND default_workspace_id IS NULL;

INSERT OR IGNORE INTO lawyer_profiles (
  id,user_id,display_name,specialties_json,languages_json,status,marketplace_status,
  experience_years,price_description,availability_status,advocate_status,firm_name,bio,
  city,region,education,consultation_formats_json,
  profile_photo_key,profile_photo_mime,profile_photo_sha256,profile_photo_size_bytes,
  created_at,updated_at
) VALUES (
  '22000000-0000-4000-8000-000000000004',
  '22000000-0000-4000-8000-000000000001',
  'JURO staging fixture — одобренный юрист',
  '["contracts"]','["ru","uz"]','pending','pending_review',
  8,'Demo only · 100 000 UZS','available','declared',
  'JURO staging fixture','Не реальный юрист. Профиль нужен для проверки записи и демо-оплаты.',
  'Tashkent','Tashkent','Synthetic staging fixture','["chat","phone"]',
  'staging-fixtures/lawyer-profile-juro-logo.png','image/png',
  '878ac78393832b42307e73f8ae93f721b7ac84f71ff1fef19566eb78b4bfd271',211767,
  '2026-08-07T00:00:00.000Z','2026-08-07T00:00:00.000Z'
);

INSERT OR IGNORE INTO lawyer_profile_moderation (
  id,lawyer_profile_id,profile_revision,moderator_user_id,decision,reason,profile_sha256,created_at
)
SELECT
  '22000000-0000-4000-8000-000000000005',
  '22000000-0000-4000-8000-000000000004',1,id,'approved',
  'Owner-authorized synthetic staging beta fixture; not a production accreditation.',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  '2026-08-07T00:00:00.000Z'
FROM user_profiles
WHERE id NOT IN (
  '22000000-0000-4000-8000-000000000001',
  '22000000-0000-4000-8000-000000000011'
)
ORDER BY created_at,id
LIMIT 1;

UPDATE lawyer_profiles
SET marketplace_status='public_approved',updated_at='2026-08-07T00:00:00.000Z'
WHERE id='22000000-0000-4000-8000-000000000004'
  AND status='public_approved' AND marketplace_status='pending_review';

INSERT OR IGNORE INTO workspace_audit_events (
  id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at
) VALUES
  ('22000000-0000-4000-8000-000000000006','22000000-0000-4000-8000-000000000002',
   '22000000-0000-4000-8000-000000000001','lawyer_profile',
   '22000000-0000-4000-8000-000000000004','synthetic_staging_fixture_created',
   '{"approved":"beta","booking":"demo_only"}','2026-08-07T00:00:00.000Z'),
  ('22000000-0000-4000-8000-000000000016','22000000-0000-4000-8000-000000000012',
   '22000000-0000-4000-8000-000000000011','lawyer_profile',
   '22000000-0000-4000-8000-000000000014','synthetic_staging_fixture_created',
   '{"review":"pending","booking":"blocked"}','2026-08-07T00:00:00.000Z');

SELECT
  (SELECT COUNT(*) FROM lawyer_profiles WHERE id='22000000-0000-4000-8000-000000000004'
    AND status='public_approved' AND marketplace_status='public_approved'
    AND public_approved_at IS NOT NULL) AS approved_fixture,
  (SELECT COUNT(*) FROM lawyer_profiles WHERE id='22000000-0000-4000-8000-000000000014'
    AND status='pending' AND marketplace_status='pending_review'
    AND public_approved_at IS NULL) AS pending_fixture,
  (SELECT COUNT(*) FROM lawyer_profile_moderation WHERE id='22000000-0000-4000-8000-000000000005'
    AND decision='approved') AS immutable_beta_moderation;
