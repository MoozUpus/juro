# User guide

JURO uses localized `/uz/...` and `/ru/...` routes. Use AI lawyer, cases, document builder and document-review routes only within the active account/workspace context. Uploaded document-analysis files currently remain in protected quarantine until a real scanner is connected; they are not sent to AI.

For sensitive legal tasks, review sources, assumptions and deadlines before acting. Voice-with-avatar is disabled until an approved rigged Jurobek asset and verified voice pipeline are available.

## Memory (local candidate; staging deployment pending)

Open `Settings → Privacy` to review what JURO may reuse between chats. You can
turn automatic memory off, add a global or current-workspace entry, edit or
delete it, and clear all entries visible in the current context. A source label
and saved date explain where each record came from.

Passwords, verification codes and payment-card details cannot be saved.
Saving a potentially sensitive circumstance manually requires a separate
checkbox, including after an edit. If encrypted memory is unavailable, the
screen says so explicitly and AI chat continues without memory. A privacy
export includes decrypted active entries visible from the current workspace or
fails rather than silently omitting them.
