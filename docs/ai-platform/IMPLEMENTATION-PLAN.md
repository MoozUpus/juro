# Remaining implementation plan — after 2026-08-07 audit

1. Completed: deploy the pending-profile visibility correction to protected
   staging. A browser extension blocked a direct image-endpoint smoke, so retain
   the server regression test and repeat it in a neutral browser session.
2. Create a synthetic approved lawyer profile under a controlled staging
   account, then test client request → conflict preview → consented case access
   → completion. Do not fabricate a real lawyer or availability.
3. Build a separate, noindex website prototype for the public approved-lawyer
   marketplace. It must not replace `juro.uz/` before owner approval.
4. Split the admin UI into a dedicated staging deployment and session boundary;
   retain fresh MFA for moderation and quality decisions.
5. Execute and record the final authenticated browser/mobile/accessibility/
   performance matrix. Fix evidenced P0/P1 findings.
6. Only after all staging gates are evidenced, prepare (not execute) distinct
   functional-production and UI-production approval requests.
