# Free products

Public, unauthenticated access to free downloadable/linked material. `/api/v1/free-products` has no `authenticate`/`authorize` middleware at all — it's open by design. Admin management is under `/api/v1/admin/free-products` and requires an authenticated admin.

Each product is either:

- **`link`** — a description plus an external URL to the material (e.g. a Google Drive link, another site).
- **`pdf`** — a description plus a PDF the admin uploads directly (stored on Cloudinary).

## Public

- `GET /api/v1/free-products` — paginated list of published products (`page`, `limit`).
- `GET /api/v1/free-products/:productId` — a single published product.

For `pdf` products, `fileUrl` is a short-lived signed Cloudinary download link generated fresh on every request (Cloudinary blocks unsigned CDN delivery of PDFs regardless of asset type — see `content-module` for the same constraint) — never cache it.

## Admin

- `GET /api/v1/admin/free-products` — all products, published or not.
- `POST /api/v1/admin/free-products` — create a `link` product. Body: `title`, `description`, `fileUrl`.
- `POST /api/v1/admin/free-products/upload-pdf` — create a `pdf` product. Multipart: `title`, `description`, optional `order`, file field `file`.
- `PATCH /api/v1/admin/free-products/:productId` — update `title`/`description`/`order`/`isPublished`. `fileUrl` can only be edited on `link` products — a PDF must be deleted and re-uploaded to change the file.
- `PATCH /api/v1/admin/free-products/:productId/publish` / `/unpublish` (or `/archive`) — toggle visibility without deleting. Repeatable either way.
- `DELETE /api/v1/admin/free-products/:productId` — permanent delete; also removes the Cloudinary asset for `pdf` products.
