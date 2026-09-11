# Homepage

Dynamic content for the public homepage. Public reads live at `/api/v1/homepage`. Admin writes are under `/api/v1/admin/homepage` and require an authenticated admin.

There is a single settings document for the whole site — it's created automatically on first read or write, admins never create or delete it.

## GET `/api/v1/homepage` (public)

Returns:

- `caseNumber`: live count of published cases (`MockCase` with `isPublished: true`). Never stored — always computed fresh so it can't drift from `/cases`.
- `testimonialsCount`: admin-entered number.
- `registrarsCount`: admin-entered number.
- `youtubeLinks`: admin-managed list of `{ _id, title, url, order }`, sorted by `order`.

## PATCH `/api/v1/admin/homepage`

Body (camelCase, at least one field): `testimonialsCount`, `registrarsCount` — both non-negative integers. `caseNumber` cannot be set here; it's always derived from published cases.

## YouTube links

- `POST /api/v1/admin/homepage/youtube-links` — body: `title`, `url` (must be a `youtube.com`/`youtu.be` link), optional `order`.
- `PATCH /api/v1/admin/homepage/youtube-links/:linkId` — any of `title`, `url`, `order`.
- `DELETE /api/v1/admin/homepage/youtube-links/:linkId` — removes the link.

All three return the full updated settings document.
