# Free products

Public, unauthenticated access to free content. `/api/v1/free-products` has no `authenticate`/`authorize` middleware at all — it's open by design. Admin management is under `/api/v1/admin/free-products` and requires an authenticated admin.

Each product is one of:

- **`blog`** — expected to be the common case: a cover image, a title, and written content (`content`). `description` is optional since the content itself carries the material.
- **`link`** — a title + description plus an external URL to material hosted elsewhere.
- **`pdf`** — a title + description plus a PDF the admin uploads directly (stored on Cloudinary).

## Public

- `GET /api/v1/free-products` — paginated list of published products (`page`, `limit`), mixed types together, ordered by `order`.
- `GET /api/v1/free-products/:productId` — a single published product.

For `pdf` products, `fileUrl` is a short-lived signed Cloudinary download link generated fresh on every request (Cloudinary blocks unsigned CDN delivery of PDFs regardless of asset type — see `content-module` for the same constraint) — never cache it. `blog` cover images (`coverImageUrl`) have no such restriction and are delivered as a normal CDN URL.

## Admin

- `GET /api/v1/admin/free-products` — all products, published or not.
- `POST /api/v1/admin/free-products` — create a `link` product. Body: `title`, `description`, `fileUrl`, optional `order`.
- `POST /api/v1/admin/free-products/upload-pdf` — create a `pdf` product. Multipart: `title`, `description`, optional `order`, file field `file`.
- `POST /api/v1/admin/free-products/upload-blog` — create a `blog` product. Multipart: `title`, `content`, optional `description`, optional `order`, image field `coverImage`.
- `PATCH /api/v1/admin/free-products/:productId` — update `title`/`description`/`order`/`isPublished`. `fileUrl` can only be edited on `link` products; `content` can only be edited on `blog` products. A PDF or cover image is never replaced through this endpoint.
- `PATCH /api/v1/admin/free-products/:productId/cover-image` — replace a `blog` product's cover image. Multipart, image field `coverImage`. Destroys the old Cloudinary image first (400 if the product isn't a `blog`).
- `PATCH /api/v1/admin/free-products/:productId/publish` / `/unpublish` (or `/archive`) — toggle visibility without deleting. Repeatable either way.
- `DELETE /api/v1/admin/free-products/:productId` — permanent delete; also removes the Cloudinary asset for `pdf` products and the cover image for `blog` products.
