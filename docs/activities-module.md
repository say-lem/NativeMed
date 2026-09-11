# Activities and announcements

Announcements use the existing `/api/v1/activities` resource. Admin operations are under `/api/v1/admin/activities` and require an authenticated admin.

POST and PATCH accept these additional fields (camelCase):

- `time`: optional event time in 24-hour `HH:mm` format, e.g. `14:30`.
- `activityType`: optional free-text string, e.g. `class`, `lecture`, or `training` (1–100 characters).
- `activityStatus`: optional free-text string, e.g. `upcoming` or `cancelled` (1–100 characters). This describes the event and does not control publication.
- `courseId`: optional existing course ObjectId. Send `null` to remove a course link. Linking does not restrict announcement visibility to enrolled users.
- `isPublished`: optional boolean, default `true`. Set `false` to create an unpublished announcement.

The new metadata fields are optional for compatibility with existing clients. Date and description remain required on creation.

GET `/api/v1/activities` returns only published announcements, with pagination totals excluding unpublished entries. Existing records without `isPublished` remain visible.

GET `/api/v1/admin/activities` returns all entries, including archived/unpublished announcements.

PATCH `/api/v1/admin/activities/:activityId/unpublish` (or `/archive`) hides an announcement without deleting it. PATCH `/api/v1/admin/activities/:activityId/publish` makes it public again. These actions need no request body and can be repeated. Admins can also change `isPublished` through the existing PATCH endpoint and edit archived entries.

DELETE remains permanent deletion. All list endpoints accept `page` and `limit`.
