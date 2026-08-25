# Citation policy

## Authoritative evidence

For public Uzbek law, a user-visible legal citation must resolve to the official
Lex.uz host and to the exact server-fetched source/version supporting the claim.
An allowlisted-looking URL, provider-generated quote, vector match, or source ID
alone is insufficient.

Every accepted citation must preserve:

- canonical HTTPS URL and official source classification;
- the verified source/version and retrieval timestamp;
- exact document/article identity when available;
- a bounded supporting fragment whose text exists in the fetched record;
- the AI run/message relationship and validation status.

## Rejection rules

Reject a citation when the host redirects outside the allowlist, the response is
not valid bounded content, the source/version is unavailable or inapplicable,
the quote cannot be located, the provider selected an undeclared source, or the
citation belongs to a different tenant/message.

Advice.uz is not authoritative citation evidence. Internal documents are
explicitly non-official. A web-search result is only a discovery candidate and
becomes eligible only after independent Lex.uz fetch and validation.

Source health and answer correctness are different claims: HTTP availability
does not prove legal relevance, while a previously relevant source can become
stale after amendment. High-risk answers retain lawyer-review guidance even
when citations pass the mechanical boundary.
