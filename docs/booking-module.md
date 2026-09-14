# Booking (one-on-one sessions)

Admin-managed "products" for one-on-one booking sessions. Public reads live at `/api/v1/booking`. Booking a slot requires a logged-in user (the admin needs to know who booked). Admin management is under `/api/v1/admin/booking` and requires an authenticated admin.

Multiple distinct session products can exist side by side (e.g. a 30-minute consult vs a 1-hour deep dive), each with its own title, description, price, time options, and pool of available dates.

## How availability works

- `availableTimes` is a reusable list of time-of-day options (e.g. `10:00`, `14:00`) that apply to every date in the pool.
- `availableDates` is the pool of calendar dates the admin has opened up, each tracking its own `bookedTimes` — the subset of `availableTimes` already taken **on that date**.
- Each `(date, time)` pair is booked independently. Booking one time on a date does not affect the other times on that same date — they remain bookable. A date only disappears from the public response once every one of the product's `availableTimes` has been booked on it.
- Reservation is atomic — two users booking the same `(date, time)` slot at the same moment can't both win; the second gets a 409. Booking a *different* time on the same date always succeeds independently.
- Price is informational only in this module — no payment gate on booking.

## Public

- `GET /api/v1/booking` — paginated list of published products. Each entry in a product's `availableDates` is reshaped to `{ _id, date, availableTimes }`, where `availableTimes` is that date's still-unbooked times only; dates with none left are omitted entirely.
- `GET /api/v1/booking/:productId` — a single published product, same shaping.

## Booking a session (authenticated user)

- `POST /api/v1/booking/:productId/book` — body: `{ date, time }`. `time` must be one of the product's `availableTimes`; `date` must exist in the product's pool with that specific time not yet booked. On success, creates a `SessionBooking` record and emails the admin (`CONTACT_EMAIL_TO`, falling back to `EMAIL_FROM_ADDRESS`) with the session, date/time, and the booker's name/email. The email send is fire-and-forget — a failure there never fails the booking.
- `GET /api/v1/booking/me` — paginated list of the logged-in user's own bookings, newest date first, with `productId` populated (`title`/`description`/`price`).

## Admin — products

- `GET /api/v1/admin/booking/products` — all products, published or not.
- `POST /api/v1/admin/booking/products` — body: `title`, `description`, `price`, optional `availableTimes` (array of `HH:mm`), optional `isPublished`.
- `PATCH /api/v1/admin/booking/products/:productId` — update any of the above (at least one field). Note this replaces `availableTimes` wholesale if provided.
- `PATCH /api/v1/admin/booking/products/:productId/publish` / `/unpublish` (or `/archive`) — toggle visibility, repeatable.
- `DELETE /api/v1/admin/booking/products/:productId` — permanent delete; also removes every `SessionBooking` for that product.

## Admin — available dates

- `POST /api/v1/admin/booking/products/:productId/dates` — body: `{ date }`. Rejected with 400 if that calendar date was already added.
- `DELETE /api/v1/admin/booking/products/:productId/dates/:dateId` — removes a date from the pool. Rejected with 400 if the date already has any bookings on it (cancel the booking(s) out-of-band first if that's truly needed).

## Admin — bookings

- `GET /api/v1/admin/booking/bookings` — paginated list of every booking across all products, newest first, with `productId`/`userId` populated (`title`/`price` and `fullName`/`email` respectively).
