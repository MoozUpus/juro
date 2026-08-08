-- SYNTHETIC STAGING FIXTURE ONLY. Never execute against production.
-- It supplies approved technical pricing/tax configuration only; it creates no
-- customer, case, proposal, payment, entitlement, or payable records.

INSERT OR IGNORE INTO pricing_policies(id,code,name,status,created_at,updated_at)
VALUES('13000000-0000-4000-8000-000000000001','marketplace_service_standard','Synthetic staging marketplace service policy','approved','2026-08-03T00:00:00.000Z','2026-08-03T00:00:00.000Z');

INSERT OR IGNORE INTO pricing_policy_versions(
  id,policy_id,version,currency,provider_commission_rate_basis_points,vat_rate_basis_points,
  provider_fee_bearer,basis,effective_from,approval_status,approved_by_user_id,approved_at,
  created_by_user_id,created_at,marketplace_commission_rate_basis_points
)
SELECT '13000000-0000-4000-8000-000000000002','13000000-0000-4000-8000-000000000001',1,'UZS',0,0,
  'PLATFORM_ABSORBS','SYNTHETIC STAGING ONLY; 10% marketplace commission, no provider fee','2026-01-01T00:00:00.000Z','approved',id,
  '2026-08-03T00:00:00.000Z',id,'2026-08-03T00:00:00.000Z',1000
FROM user_profiles ORDER BY created_at,id LIMIT 1;

INSERT OR IGNORE INTO tax_profiles(
  id,subject_type,subject_id,service_type,payer_status,tax_model,vat_rate_basis_points,effective_from,
  approval_status,approved_by_user_id,approved_at,version,created_at,updated_at
)
SELECT '13000000-0000-4000-8000-000000000003','PLATFORM','JURO','MARKETPLACE_SERVICE','TEST_ONLY',
  'NO_VAT_SYNTHETIC_STAGING_ONLY',0,'2026-01-01T00:00:00.000Z','approved',id,'2026-08-03T00:00:00.000Z',1,
  '2026-08-03T00:00:00.000Z','2026-08-03T00:00:00.000Z' FROM user_profiles ORDER BY created_at,id LIMIT 1;

INSERT OR IGNORE INTO tax_profiles(
  id,subject_type,subject_id,service_type,payer_status,tax_model,vat_rate_basis_points,effective_from,
  approval_status,approved_by_user_id,approved_at,version,created_at,updated_at
)
SELECT 'lawyer-staging-tax:' || lp.id,'LAWYER',lp.id,'LEGAL_SERVICE','TEST_ONLY','NO_VAT_SYNTHETIC_STAGING_ONLY',0,
  '2026-01-01T00:00:00.000Z','approved',lp.user_id,'2026-08-03T00:00:00.000Z',1,'2026-08-03T00:00:00.000Z','2026-08-03T00:00:00.000Z'
FROM lawyer_profiles lp;

SELECT
  (SELECT COUNT(*) FROM pricing_policy_versions WHERE id='13000000-0000-4000-8000-000000000002') AS marketplace_policy_versions,
  (SELECT COUNT(*) FROM tax_profiles WHERE service_type='MARKETPLACE_SERVICE' AND subject_id='JURO') AS platform_tax_profiles,
  (SELECT COUNT(*) FROM tax_profiles WHERE service_type='LEGAL_SERVICE' AND subject_type='LAWYER') AS lawyer_tax_profiles;
