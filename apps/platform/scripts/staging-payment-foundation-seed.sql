-- SYNTHETIC STAGING FIXTURE ONLY. Never execute against production.
-- Amounts are integer minor units. This fixture intentionally uses a zero-tax
-- test profile; it is not a legal/tax position and must not be promoted.

INSERT OR IGNORE INTO pricing_policies(id,code,name,status,created_at,updated_at)
VALUES('12000000-0000-4000-8000-000000000001','subscription_standard','Synthetic staging subscription policy','approved','2026-08-03T00:00:00.000Z','2026-08-03T00:00:00.000Z');

INSERT OR IGNORE INTO pricing_policy_versions(
  id,policy_id,version,currency,provider_commission_rate_basis_points,vat_rate_basis_points,
  provider_fee_bearer,basis,effective_from,approval_status,approved_by_user_id,approved_at,
  created_by_user_id,created_at
)
SELECT
  '12000000-0000-4000-8000-000000000002','12000000-0000-4000-8000-000000000001',1,'UZS',0,0,
  'PLATFORM_ABSORBS','SYNTHETIC STAGING ONLY; zero provider fee and zero tax for technical verification',
  '2026-01-01T00:00:00.000Z','approved',id,'2026-08-03T00:00:00.000Z',id,'2026-08-03T00:00:00.000Z'
FROM user_profiles ORDER BY created_at,id LIMIT 1;

INSERT OR IGNORE INTO tax_profiles(
  id,subject_type,subject_id,service_type,payer_status,tax_model,vat_rate_basis_points,
  effective_from,approval_status,approved_by_user_id,approved_at,version,created_at,updated_at
)
SELECT
  '12000000-0000-4000-8000-000000000003','PLATFORM','JURO','SUBSCRIPTION','TEST_ONLY',
  'NO_VAT_SYNTHETIC_STAGING_ONLY',0,'2026-01-01T00:00:00.000Z','approved',id,
  '2026-08-03T00:00:00.000Z',1,'2026-08-03T00:00:00.000Z','2026-08-03T00:00:00.000Z'
FROM user_profiles ORDER BY created_at,id LIMIT 1;

INSERT OR IGNORE INTO subscription_plans(id,code,status,created_at,updated_at)
VALUES('12000000-0000-4000-8000-000000000004','staging_individual','active','2026-08-03T00:00:00.000Z','2026-08-03T00:00:00.000Z');

INSERT OR IGNORE INTO subscription_plan_versions(
  id,plan_id,version,name_ru,name_uz,billing_period,price_minor,currency,entitlements_json,
  effective_from,approval_status,approved_by_user_id,approved_at,created_by_user_id,created_at
)
SELECT
  '12000000-0000-4000-8000-000000000005','12000000-0000-4000-8000-000000000004',1,
  'Staging Individual — тест','Staging Individual — sinov','monthly',1000000,'UZS',
  '{"entitlements":[{"code":"ai.answer_cycles","limitValue":20,"unit":"cycle","rolloverAllowed":false,"metadata":{"fixture":"staging"}}]}',
  '2026-01-01T00:00:00.000Z','approved',id,'2026-08-03T00:00:00.000Z',id,'2026-08-03T00:00:00.000Z'
FROM user_profiles ORDER BY created_at,id LIMIT 1;

SELECT
  (SELECT COUNT(*) FROM pricing_policy_versions WHERE id='12000000-0000-4000-8000-000000000002') AS pricing_policy_versions,
  (SELECT COUNT(*) FROM tax_profiles WHERE id='12000000-0000-4000-8000-000000000003') AS tax_profiles,
  (SELECT COUNT(*) FROM subscription_plan_versions WHERE id='12000000-0000-4000-8000-000000000005') AS subscription_plan_versions;
