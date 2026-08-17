# Contact Module — Integration Guide

## Table of Contents

1. [Overview](#overview)
2. [Base URL](#base-url)
3. [Authentication](#authentication)
4. [Endpoint — POST /contact](#endpoint--post-contact)
5. [Field Reference & Validation Rules](#field-reference--validation-rules)
6. [Success Response](#success-response)
7. [Error Responses](#error-responses)
8. [Rate Limiting / Traffic Shaping](#rate-limiting--traffic-shaping)
9. [What Happens Server-Side](#what-happens-server-side)
10. [Environment Variables (backend setup)](#environment-variables-backend-setup)
11. [Frontend Integration Examples](#frontend-integration-examples)
12. [CORS Notes](#cors-notes)
13. [Testing With curl](#testing-with-curl)
14. [Gotchas & Design Notes](#gotchas--design-notes)

---

## Overview

The Contact module powers the "Contact Us" section of the public website. It exposes a single **open (unauthenticated) endpoint** that accepts a name, email, and message, and relays it as an email to the site's contact inbox.

Key characteristics:

- **No database persistence.** Nothing is written to MongoDB. There is no admin UI, list endpoint, or historical record of submissions — the message exists only in the email it generates. If you need a record of past submissions, look in the `info@nativemeded.co.uk` inbox, not the database.
- **No authentication.** This is a public endpoint intended to be called directly from the marketing/contact page of the website, before a visitor has an account.
- **Asynchronous delivery.** A successful `202` response means the message was *accepted and queued*, not that the email has already landed in the inbox. See [Rate Limiting / Traffic Shaping](#rate-limiting--traffic-shaping).
- **Reply-To is the visitor.** The notification email's `Reply-To` header is set to the visitor's submitted email address, so staff can hit "Reply" in their mail client and respond directly — no separate CRM/ticketing step needed.

---

## Base URL

```
http://localhost:5000/api/v1/contact          (development)
https://your-production-domain.com/api/v1/contact   (production)
```

---

## Authentication

**None.** No `Authorization` header, cookie, or API key is required or checked. Do not send credentials to this endpoint — treat it like any other public form submission.

---

## Endpoint — POST /contact

```
POST /api/v1/contact
Content-Type: application/json
```

**Request body:**

```json
{
  "fullName": "Jane Visitor",
  "email": "jane.visitor@example.com",
  "message": "Hi, I'd like to know more about the case bank subscription pricing."
}
```

That's the entire contract — three fields, no query params, no path params, no file uploads.

---

## Field Reference & Validation Rules

Validation is enforced server-side with Zod (`src/modules/contact/schema/contact.schema.ts`). Any request that fails validation is rejected with `422` before anything is queued or emailed.

| Field      | Type   | Required | Rules                                                                 |
|------------|--------|----------|------------------------------------------------------------------------|
| `fullName` | string | Yes      | Trimmed. Min length **2**, max length **100**.                        |
| `email`    | string | Yes      | Trimmed. Must be a valid email format. Max length **254**.            |
| `message`  | string | Yes      | Trimmed. Min length **10**, max length **5000**.                      |

Notes:

- Leading/trailing whitespace is stripped from all three fields before validation and before the email is composed.
- There is no HTML/markdown support in `message` — treat it as plain text on the frontend (a `<textarea>` is enough). The backend HTML-escapes it before embedding it in the notification email, so raw HTML pasted by a visitor will render as literal text, not executable markup, in the recipient's inbox.
- No profanity/spam-content filtering is performed — only shape/length validation. Abuse mitigation is handled entirely via rate limiting (below), not content inspection.

---

## Success Response

```
HTTP/1.1 202 Accepted
```

```json
{
  "success": true,
  "message": "Your message has been received and will be sent shortly",
  "data": null
}
```

**Important:** `202 Accepted` (not `201 Created`) is used deliberately. It signals "the server has accepted this for processing" rather than "the side effect (the email) has already completed." Do not treat a `202` as proof the email was delivered — under normal/light traffic it will go out within moments, but see the rate limiting section for what happens under bursty traffic from the same visitor.

---

## Error Responses

All errors use the project-standard envelope:

```json
{
  "success": false,
  "message": "Human-readable error message",
  "errors": { /* present only on 422 validation errors */ }
}
```

| Status | Condition                                                                 |
|--------|-----------------------------------------------------------------------------|
| `422`  | Validation failed — one or more fields missing/invalid. `errors` is a map of field name → array of messages. |
| `429`  | This client (by IP) has exceeded the contact form's traffic shaping capacity — see below. |
| `500`  | Unexpected server error (e.g. SMTP misconfiguration in production). The HTTP request itself will not normally surface an SMTP failure as a `500` — see [What Happens Server-Side](#what-happens-server-side) for why. |

**Example — validation failure:**

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": {
    "fullName": ["Full name is required"],
    "email": ["Invalid email address"],
    "message": ["Message must be at least 10 characters"]
  }
}
```

**Example — rate limited:**

```json
{
  "success": false,
  "message": "Too many messages sent, please try again later."
}
```

---

## Rate Limiting / Traffic Shaping

This endpoint does **not** use a simple "N requests per window, then reject" limiter. Since its only job is sending an email, it uses a **leaky bucket queue** (traffic shaping) keyed per client IP, implemented in `src/shared/middleware/leakyBucket.ts` and configured in `src/modules/contact/queue/contact.queue.ts`:

- **Drain rate:** 10 messages per 15 minutes per IP (i.e. roughly 1 every 90 seconds once the queue is backed up).
- **Buffer:** up to 10 further submissions from the same IP may wait in the queue behind that.
- **Overflow:** once the buffer is full, further submissions from that IP get `429` immediately.

What this means concretely for a burst of requests from one visitor/IP:

1. The **first** submission is sent almost immediately.
2. The next several are accepted (`202`) but their actual email dispatch is spaced out — each one leaks out roughly 90 seconds after the previous.
3. Up to **11 total** submissions from the same IP within the window will be accepted this way (1 immediate + 10 queued).
4. The **12th** and beyond, while the bucket is still full, get `429 Too Many Requests`.

This is different from the rest of the API (which uses a leaky-bucket *meter* — instant accept/reject, no queueing). The contact form intentionally decouples the HTTP response from email delivery: the request returns `202` right away rather than holding the connection open for up to several minutes waiting for its turn in the send queue (which would risk browser/proxy timeouts).

**Frontend implication:** if you show a "Message sent!" confirmation on `202`, that's honest — the submission was accepted — but don't imply "delivered" for burst scenarios. In practice a normal visitor submitting the form once will never notice any delay.

---

## What Happens Server-Side

1. `POST /contact` hits `validate(contactMessageSchema)` — malformed input never reaches the queue.
2. The controller (`src/modules/contact/controller/contact.controller.ts`) enqueues a background job keyed by `req.ip` on the leaky bucket queue.
   - If the queue for that IP is full, the controller responds `429` and nothing is queued.
   - Otherwise it responds `202` immediately — **before** the email is actually sent.
3. When the job reaches the front of its per-IP queue, `src/modules/contact/service/contact.service.ts` → `src/modules/contact/email/contact.email.service.ts` builds and sends the email via the shared mailer (`src/shared/services/email.service.ts`, nodemailer).
4. If sending fails at that point (e.g. bad SMTP credentials), the failure is caught and logged server-side (`console.error('Failed to send contact message email:', err)`) — it does **not** propagate back to the original HTTP request, since that request already completed with `202`. There is currently no user-facing retry or dead-letter mechanism for a failed send; check server logs if messages appear to go missing.

---

## Environment Variables (backend setup)

These are read from `.env` via `src/config/env.ts`. If you're deploying this for the first time or pointing it at a different inbox, this is what to set:

| Variable              | Purpose                                                                 | Current value (`.env`)         |
|------------------------|--------------------------------------------------------------------------|---------------------------------|
| `EMAIL_FROM_NAME`     | Display name on the "From" header for **all** app emails (not contact-specific). | `Native Med`                    |
| `EMAIL_FROM_ADDRESS`  | "From" address for all app emails, including contact notifications.       | `info@nativemeded.co.uk`        |
| `CONTACT_EMAIL_TO`    | The inbox that receives contact form submissions. Falls back to `EMAIL_FROM_ADDRESS` if unset. | `info@nativemeded.co.uk`        |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` | Real SMTP transport. If `SMTP_HOST` is unset and `NODE_ENV !== 'production'`, mail falls back to a **console-logging transport** — nothing is actually sent, the composed email is printed to stdout instead. | Unset locally — dev logs to console |

> `EMAIL_FROM_ADDRESS` is shared across the whole app (welcome emails, password resets, admin invites, contact notifications). Changing it changes the "From" on all outgoing mail, not just contact submissions.

---

## Frontend Integration Examples

### Plain `fetch`

```js
async function submitContactForm({ fullName, email, message }) {
  const res = await fetch(`${API_BASE_URL}/api/v1/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fullName, email, message }),
  });

  const body = await res.json();

  if (res.status === 202) {
    return { ok: true, message: body.message };
  }

  if (res.status === 422) {
    // body.errors is a map of fieldName -> string[]
    return { ok: false, fieldErrors: body.errors };
  }

  if (res.status === 429) {
    return { ok: false, message: body.message }; // "Too many messages sent, please try again later."
  }

  return { ok: false, message: body.message ?? 'Something went wrong. Please try again.' };
}
```

### React form handler

```tsx
const [status, setStatus] = useState<'idle' | 'submitting' | 'sent' | 'error'>('idle');
const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setStatus('submitting');
  setFieldErrors({});

  const result = await submitContactForm({ fullName, email, message });

  if (result.ok) {
    setStatus('sent');
    // clear the form here
  } else if (result.fieldErrors) {
    setFieldErrors(result.fieldErrors);
    setStatus('idle');
  } else {
    setStatus('error');
    // toast/banner with result.message
  }
};
```

### Field-level error rendering

Since `errors` is keyed by field name, you can map it straight onto form inputs:

```tsx
{fieldErrors.fullName && <span className="error">{fieldErrors.fullName[0]}</span>}
{fieldErrors.email && <span className="error">{fieldErrors.email[0]}</span>}
{fieldErrors.message && <span className="error">{fieldErrors.message[0]}</span>}
```

---

## CORS Notes

The whole API is behind a single CORS policy configured in `src/app.ts`:

```ts
app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
```

The contact endpoint is **not** exempt from this — requests must originate from whatever origin `CLIENT_URL` is set to in the deployed environment (e.g. `https://nativemeded.co.uk` in production). If the marketing site that hosts the contact form is on a different origin/subdomain than `CLIENT_URL`, browser requests will be blocked by CORS even though the endpoint itself requires no auth. Server-to-server calls (no browser involved) aren't subject to CORS and are unaffected.

---

## Testing With curl

**Valid submission:**

```bash
curl -X POST http://localhost:5000/api/v1/contact \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "Jane Visitor",
    "email": "jane.visitor@example.com",
    "message": "Hi, I would like to know more about the case bank subscription pricing."
  }'
```

Expected: `202` with the "received and will be sent shortly" message. In development (no `SMTP_HOST` set), check the server console for a `📧 DEV EMAIL` block showing the composed message instead of an actual sent email.

**Validation failure:**

```bash
curl -X POST http://localhost:5000/api/v1/contact \
  -H "Content-Type: application/json" \
  -d '{"fullName": "J", "email": "not-an-email", "message": "hi"}'
```

Expected: `422` with per-field error messages.

**Triggering the rate limit** (fire more than 11 requests back-to-back from the same machine):

```bash
for i in $(seq 1 15); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:5000/api/v1/contact \
    -H "Content-Type: application/json" \
    -d "{\"fullName\":\"Load Test $i\",\"email\":\"loadtest$i@example.com\",\"message\":\"Rate limit test message number $i.\"}"
done
```

Expected: `202` for the first 11, `429` from the 12th onward.

> **Local dev note:** macOS's AirPlay Receiver (Control Center) squats on port `5000` by default and will silently swallow requests with a bogus `403 Forbidden` from `AirTunes`, not from this app. If you see unexplained `403`s with an `AirTunes` server header, either disable AirPlay Receiver in System Settings → General → AirDrop & Handoff, or run the dev server on a different port (`PORT=5050 npm run dev`).

---

## Gotchas & Design Notes

- **Nothing is stored.** There's no `GET /contact` history, no MongoDB collection, no admin dashboard for submissions. If the business ever wants a record of contact form activity (analytics, CRM sync, spam auditing), that's new scope — currently the email *is* the record.
- **`202`, not `201`.** Don't change this to `201 Created` — nothing is "created" as a resource; the response is intentionally signaling "accepted for async processing."
- **Rate limiting is per-IP, not global.** Different visitors from different IPs don't affect each other's quota. A shared office/NAT IP could hit the limit faster than expected if multiple people use the form around the same time.
- **Failed sends are silent to the caller.** If SMTP is down or misconfigured in production, the visitor still sees a success response (their submission was validly accepted and queued) — the failure only shows up in server logs. This trade-off favors not leaking backend infrastructure failures to a public, unauthenticated endpoint, but means you should have log monitoring on this path if the contact form matters operationally.
- **`EMAIL_FROM_ADDRESS` is global, not contact-specific.** If you need contact-form emails to come from a different address than the rest of the app's transactional emails (welcome, password reset, etc.), that requires a code change, not just an env var — currently they all share one SMTP "from" identity.
