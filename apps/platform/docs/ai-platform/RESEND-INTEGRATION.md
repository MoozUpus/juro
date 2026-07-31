# Resend integration

Resend is configured only as a server-side staging secret (`RESEND_API_KEY`). OTP and security email routes use the configured `EMAIL_FROM` identity; values are never read from Cloudflare or committed. Delivery is not claimed solely from secret presence. A production sender-domain verification and an end-to-end deliverability test remain release gates.