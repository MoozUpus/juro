# Staging Phase 5 archive-safety evidence

Date: 2026-07-31
Scope: owner-only `juro-platform-staging`. Production, Sites, `apps/website`, D1 schema, and Cloudflare resources were not changed by this slice.

## Exact source and behavior

- Source commit: `94fce8e` (`feat(platform): reject unsafe document archives`).
- Worker version: `3bc029a3-8722-4edd-8c05-d615d5ce9a13`, 100% staging traffic.
- ZIP/DOCX inspection occurs only after R2 size, SHA-256, and magic-byte verification.
- The inspector parses metadata without decompressing or executing members.
- It rejects split/ZIP64 archives, encryption, unsupported compression, symlinks, unsafe or duplicate paths, excessive depth, nested archives, unsupported package members, over 20 package files, over 200 MB expanded size, and expansion above 100:1.
- DOCX requires `[Content_Types].xml`, `_rels/.rels`, and `word/document.xml`, and rejects VBA/executable content.
- Unsafe objects are deleted from private R2 and receive a failed lifecycle plus content-free audit reason.
- Passing this structural gate still produces `MALWARE_SCANNER_UNAVAILABLE`; no file becomes safe and no AI analysis is dispatched.

## Verification

- archive-security tests: 3/3 passed, covering safe packages, traversal, nested/unsupported members, expansion bomb, file-count limit, required OOXML parts, and active content;
- full platform regression: passed, including 84/84 Cloudflare/job tests;
- type-check and lint: passed;
- staging build and exact artifact validation: passed;
- canonical builder smoke: 34 scenarios, DOCX/PDF/ZIP passed;
- comparison smoke: three changes and PDF/DOCX output passed;
- tracked-source secret-pattern scan: zero matching files;
- postdeploy D1: `quick_check=ok`, 40 migrations through `0039`, no schema change from this slice;
- anonymous finalize API request: Cloudflare Access `302`;
- production Worker remains `91774ed4-72e9-47bb-b93a-a4208d490b24`.

The deployed secret-name inventory remains `IDENTITY_KEYRING`, `RESEND_API_KEY`, and `TURNSTILE_SECRET_KEY`. Provider secrets and a real malware scanner remain absent.

## Open gates and rollback

This central-directory preflight does not validate member CRC or local-header identity and does not decompress a package. The future isolated malware scanner/extractor must repeat path, size, ratio, type, local-header, and checksum controls before creating a derivative. Actual ZIP package extraction/relationship analysis, OCR, live provider analysis, and the 100-package evaluation remain open.

Application rollback is the prior staging Worker version `593e7fd4-1d60-4ba2-accc-c44b1e0a2ba0`. No D1 rollback is required because this slice has no schema or data migration. Production is never a rollback target.
