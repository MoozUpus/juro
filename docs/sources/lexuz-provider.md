# Lex.uz provider

Lex.uz is JURO's authoritative public-law source for Uzbekistan. Production uses
a direct provider that searches for official candidates, follows bounded network
rules, fetches the canonical page, extracts a limited source packet, and passes
that packet to the legal-answer gateway.

Controls include:

- exact `https` host allowlisting for `lex.uz` and `www.lex.uz`;
- redirect, timeout, response-size, and content-type limits;
- canonical document identity and locale normalization;
- server-side source/version and quote checks;
- no provider-authored URL or metadata trust;
- fail-closed behavior when the official source is unavailable.

JURO does not claim an official Lex.uz API or partnership. It consumes publicly
available official pages and must respect availability, freshness, and source
changes. Monitoring confirms transport/metadata health; legal correctness still
requires the citation boundary and, for release evaluation, human review.
