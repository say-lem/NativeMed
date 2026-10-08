# Activities and announcements

Announcements use the existing `/api/v1/activities` resource. Admin operations are under `/api/v1/admin/activities` and require an authenticated admin.

POST and PATCH accept these additional fields (camelCase):

- `time`: optional event time in 24-hour `HH:mm` format, e.g. `14:30`.
- `activityType`: optional free-text string, e.g. `class`, `lecture`, or `training` (1–100 characters).
- `activityStatus`: optional free-text string, e.g. `upcoming` or `cancelled` (1–100 characters). This describes the event and does not control publication.
- `product`: optional attachment `{ "type": "course" | "live_course" | "one_on_one" | "free_product", "id": "<ObjectId>" }`, or `{ "type": "case_bank" }` for the site-wide case bank (which has no ID). The referenced product must exist; unpublished products can also be attached. Send `null` to remove an attachment. Linking does not restrict announcement visibility to purchasers.
- `courseId`: supported for older clients; maps to a course attachment. Do not send both `product` and `courseId`. Responses include `product` for legacy course links too. `courseId` is cleared when attaching another product type.
- `isPublished`: optional boolean, default `true`. Set `false` to create an unpublished announcement.

The new metadata fields are optional for compatibility with existing clients. Date and description remain required on creation.

GET `/api/v1/activities` returns only published announcements, with pagination totals excluding unpublished entries. Existing records without `isPublished` remain visible.

GET `/api/v1/admin/activities` returns all entries, including archived/unpublished announcements.

PATCH `/api/v1/admin/activities/:activityId/unpublish` (or `/archive`) hides an announcement without deleting it. PATCH `/api/v1/admin/activities/:activityId/publish` makes it public again. These actions need no request body and can be repeated. Admins can also change `isPublished` through the existing PATCH endpoint and edit archived entries.

DELETE remains permanent deletion. All list endpoints accept `page` and `limit`.

Example POST `/api/v1/admin/activities` (the same attachment format works on PATCH):

```json
{
  "date": "2026-10-15",
  "description": "Book your upcoming one-to-one session",
  "product": { "type": "one_on_one", "id": "507f1f77bcf86cd799439011" }
}
```

Public and admin list responses include the attachment type and ID; product details are not populated. Use `/api/v1/products` for paid catalog selections and `/api/v1/free-products` for free resources.
