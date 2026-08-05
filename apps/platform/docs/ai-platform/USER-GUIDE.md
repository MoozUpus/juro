# User guide

## Guest AI (staging candidate)

On the RU or UZ guest page, enter one legal question and complete the anti-abuse
check. JURO may ask up to five clarifying questions; those do not use the single
guest answer. A completed answer can be reopened on the same device until the
24-hour session expires. Guest content is not added to permanent chat history
or memory. Register to continue, save the answer or create a case. The short-
lived encrypted session is automatically removed after expiry.

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

## Create a document from an AI answer (local candidate)

When an AI answer recommends an available JURO template, select **Create a
document**. Review every proposed value, edit incorrect details and remove data
that should not enter the draft. JURO creates the Builder draft only after
confirmation, then opens the real document editor. The recommendation is not a
legal approval of the resulting document; review the generated draft and its
sources before use. This flow is not yet deployed to staging or production.
