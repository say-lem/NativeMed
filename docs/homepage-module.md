# Homepage

Dynamic content for the public homepage. Public reads live at `/api/v1/homepage`. Admin writes are under `/api/v1/admin/homepage` and require an authenticated admin.

There is a single settings document for the whole site — it's created automatically on first read or write, admins never create or delete it.

## GET `/api/v1/homepage` (public)

Returns:

- `caseNumber`: live count of published cases (`MockCase` with `isPublished: true`). Never stored — always computed fresh so it can't drift from `/cases`.
- `testimonialsCount`: admin-entered number.
- `registrarsCount`: admin-entered number.
- `contactEmail`: admin-entered contact email, or `null` if not set.
- `contactPhone`: admin-entered contact phone, or `null` if not set.
- `youtubeLinks`: admin-managed list of `{ _id, title, url, order }`, sorted by `order`.

## PATCH `/api/v1/admin/homepage`

Body (camelCase, at least one field): `testimonialsCount`, `registrarsCount` — both non-negative integers; `contactEmail` (valid email, stored lowercased); `contactPhone` (7–20 characters, no format enforced beyond length). `caseNumber` cannot be set here; it's always derived from published cases.

## YouTube links

- `POST /api/v1/admin/homepage/youtube-links` — body: `title`, `url` (must be a `youtube.com`/`youtu.be` link), optional `order`.
- `PATCH /api/v1/admin/homepage/youtube-links/:linkId` — any of `title`, `url`, `order`.
- `DELETE /api/v1/admin/homepage/youtube-links/:linkId` — removes the link.

All three return the full updated settings document.

## Terms and conditions

Own endpoint, separate from the general homepage feed/stats above, backed by the same singleton document.

- `GET /api/v1/homepage/terms` (public) — `{ content, updatedAt }`. `content` is `''` and `updatedAt` is `null` until an admin sets it.
- `GET /api/v1/admin/homepage/terms` — same shape, for the admin editor to load current content.
- `PATCH /api/v1/admin/homepage/terms` — body: `{ content }` (required, non-empty). The first call creates it, every later call edits it in place — there's no separate create step. `updatedAt` is stamped on every save.

## Legal disclaimer

Same pattern and singleton as terms and conditions above, but its own field/endpoint — editing one never touches the other.

- `GET /api/v1/homepage/legal-disclaimer` (public) — `{ content, updatedAt }`. `content` is `''` and `updatedAt` is `null` until an admin sets it.
- `GET /api/v1/admin/homepage/legal-disclaimer` — same shape, for the admin editor to load current content.
- `PATCH /api/v1/admin/homepage/legal-disclaimer` — body: `{ content }` (required, non-empty). First call creates it, later calls edit in place.

## FAQs

An admin-managed list of question/answer pairs on the same singleton document. Reading is fully open; only writes require an admin.

- `GET /api/v1/homepage/faqs` (public) — array of `{ _id, question, answer, order }`, sorted by `order`.
- `POST /api/v1/admin/homepage/faqs` — body: `question`, `answer`, optional `order`.
- `PATCH /api/v1/admin/homepage/faqs/:faqId` — any of `question`, `answer`, `order` (at least one field).
- `DELETE /api/v1/admin/homepage/faqs/:faqId` — removes the FAQ.

The two write endpoints return the full updated settings document (same as YouTube links).
