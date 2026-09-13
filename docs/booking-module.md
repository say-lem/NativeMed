# Booking (one-on-one sessions)

Admin-managed "products" for one-on-one booking sessions. Public reads live at `/api/v1/booking`. Booking a slot requires a logged-in user (the admin needs to know who booked). Admin management is under `/api/v1/admin/booking` and requires an authenticated admin.

Multiple distinct session products can exist side by side (e.g. a 30-minute consult vs a 1-hour deep dive), each with its own title, description, price, time options, and pool of available dates.

## How availability works

- `availableTimes` is a reusable list of time-of-day options (e.g. `10:00`, `14:00`) that apply to every date in the pool — they are not tied to a specific date.
- `availableDates` is the pool of calendar dates the admin has opened up, each tracked with `isBooked`.
- Booking a session reserves a **date** (any time slot booked on that date consumes the whole date — the admin only runs one session per day). Once booked, that date is removed from what's shown to the public and can no longer be booked by anyone else.
- Reservation is atomic — two users booking the same date at the same moment can't both win; the second gets a 409.
- Price is informational only in this module — no payment gate on booking.

## Public

- `GET /api/v1/booking` — paginated list of published products. Each product's `availableDates` only includes dates that are still unbooked.
- `GET /api/v1/booking/:productId` — a single published product, same date filtering.

## Booking a session (authenticated user)

- `POST /api/v1/booking/:productId/book` — body: `{ date, time }`. `time` must be one of the product's `availableTimes`; `date` must be a date currently in the product's unbooked pool. On success, creates a `SessionBooking` record and emails the admin (`CONTACT_EMAIL_TO`, falling back to `EMAIL_FROM_ADDRESS`) with the session, date/time, and the booker's name/email. The email send is fire-and-forget — a failure there never fails the booking.
- `GET /api/v1/booking/me` — paginated list of the logged-in user's own bookings, newest date first, with `productId` populated (`title`/`description`/`price`).

## Admin — products

- `GET /api/v1/admin/booking/products` — all products, published or not.
- `POST /api/v1/admin/booking/products` — body: `title`, `description`, `price`, optional `availableTimes` (array of `HH:mm`), optional `isPublished`.
- `PATCH /api/v1/admin/booking/products/:productId` — update any of the above (at least one field). Note this replaces `availableTimes` wholesale if provided.
- `PATCH /api/v1/admin/booking/products/:productId/publish` / `/unpublish` (or `/archive`) — toggle visibility, repeatable.
- `DELETE /api/v1/admin/booking/products/:productId` — permanent delete; also removes every `SessionBooking` for that product.

## Admin — available dates

- `POST /api/v1/admin/booking/products/:productId/dates` — body: `{ date }`. Rejected with 400 if that calendar date was already added.
- `DELETE /api/v1/admin/booking/products/:productId/dates/:dateId` — removes a date from the pool. Rejected with 400 if the date has already been booked (cancel the booking out-of-band first if that's truly needed).

## Admin — bookings

- `GET /api/v1/admin/booking/bookings` — paginated list of every booking across all products, newest first, with `productId`/`userId` populated (`title`/`price` and `fullName`/`email` respectively).
