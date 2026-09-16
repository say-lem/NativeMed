# Booking (one-on-one sessions)

Admin-managed "products" for one-on-one booking sessions. Public reads live at `/api/v1/booking`. Booking a slot requires a logged-in user (the admin needs to know who booked). Admin management is under `/api/v1/admin/booking` and requires an authenticated admin.

Multiple distinct session products can exist side by side (e.g. a 30-minute consult vs a 1-hour deep dive), each with its own title, description, price, time options, and pool of available dates.

## How availability works

- `availableTimes` is a reusable list of time-of-day options (e.g. `10:00`, `14:00`) that apply to every date in the pool.
- `availableDates` is the pool of calendar dates the admin has opened up, each tracking its own `bookedTimes` — the subset of `availableTimes` already taken **on that date**.
- Each `(date, time)` pair is booked independently. Booking one time on a date does not affect the other times on that same date — they remain bookable. A date only disappears from the public response once every one of the product's `availableTimes` has been booked on it.
- Reservation is atomic — two users starting checkout for the same `(date, time)` slot at the same moment can't both win; the second gets a 409. Booking a *different* time on the same date always succeeds independently.
- A slot is held (removed from availability) the moment checkout starts, not when payment completes — otherwise two people could pay for the same slot simultaneously. If checkout is abandoned and the Stripe session expires unpaid, the hold is released automatically (see "Payment flow" below).

## Public

- `GET /api/v1/booking` — paginated list of published products. Each entry in a product's `availableDates` is reshaped to `{ _id, date, times }`, where `times` is every one of the product's `availableTimes` tagged with `{ time, isAvailable }` — so the frontend can render the full set of time buttons for that day and disable the ones already booked, rather than the list just shrinking. A date is only omitted entirely once every time on it is unavailable.
- `GET /api/v1/booking/:productId` — a single published product, same shaping.

## Booking a session (authenticated user)

- `POST /api/v1/booking/:productId/book` — body: `{ date, time, successUrl?, cancelUrl? }`. `time` must be one of the product's `availableTimes`; `date` must exist in the product's pool with that specific time not yet booked. Reserves the slot, creates a `SessionBooking` with `status: 'pending'`, and returns `{ bookingId, sessionId, url }` — redirect the user to `url` (a Stripe Checkout page, `mode: 'payment'`, one-time charge for the product's `price`) to complete payment. **The booking is not confirmed yet at this point.**
- `GET /api/v1/booking/me` — paginated list of the logged-in user's own bookings (any status), newest date first, with `productId` populated (`title`/`description`/`price`).

## Payment flow

A booking only becomes real once Stripe confirms payment — this module never confirms a booking synchronously:

1. `POST /:productId/book` holds the slot and starts a Stripe Checkout session (`mode: 'payment'`), tagged with `metadata: { type: 'booking', bookingId, productId, userId }`.
2. On successful payment, Stripe fires `checkout.session.completed` at the shared webhook (`POST /api/v1/payments/webhook`, handled by `payments.service.ts`). For `mode: 'payment'` + `metadata.type === 'booking'`, it calls `bookingService.confirmBookingPayment()`, which:
   - marks the `SessionBooking` `status: 'confirmed'`,
   - emails the admin (`CONTACT_EMAIL_TO`, falling back to `EMAIL_FROM_ADDRESS`) with the session, date/time, and the booker's name/email, with a `booking.ics` calendar attachment (defaults to a 1-hour event — `BookingProduct` has no session-length field) so the admin's mail client offers to add it straight to their calendar.
   - `payments.service.ts` then records a `Payment` (`itemType: 'booking'`, keyed on the checkout session id).
3. If the user abandons checkout and the Stripe session expires unpaid, Stripe fires `checkout.session.expired`, which calls `bookingService.releasePendingBooking()` — the held slot is freed back into the pool and the `SessionBooking` is marked `status: 'cancelled'`. A later checkout for the same slot then succeeds normally.
4. If Stripe Checkout session creation itself fails synchronously (e.g. a Stripe outage), the hold is released and the pending `SessionBooking` is deleted immediately — the user simply never got a checkout link.

**Note:** the Stripe webhook endpoint must be subscribed to `checkout.session.expired` (in addition to the events the rest of the payments module already relies on) for held-but-abandoned slots to ever free up automatically.

`SessionBooking.status` is one of `pending` | `confirmed` | `cancelled`. Admin/user booking list endpoints below return bookings of any status — a `pending` entry never got paid (yet); a `cancelled` one expired unpaid.

## Admin — products

- `GET /api/v1/admin/booking/products` — all products, published or not.
- `POST /api/v1/admin/booking/products` — body: `title`, `description`, `price`, optional `availableTimes` (array of `HH:mm`), optional `isPublished`.
- `PATCH /api/v1/admin/booking/products/:productId` — update any of the above (at least one field). Note this replaces `availableTimes` wholesale if provided.
- `PATCH /api/v1/admin/booking/products/:productId/publish` / `/unpublish` (or `/archive`) — toggle visibility, repeatable.
- `DELETE /api/v1/admin/booking/products/:productId` — permanent delete; also removes every `SessionBooking` for that product.

## Admin — available dates

- `POST /api/v1/admin/booking/products/:productId/dates` — body: `{ date }`. Rejected with 400 if that calendar date was already added.
- `DELETE /api/v1/admin/booking/products/:productId/dates/:dateId` — removes a date from the pool. Rejected with 400 if the date has any held time on it — including a still-`pending` (unpaid) checkout, not just a `confirmed` one.

## Admin — bookings

- `GET /api/v1/admin/booking/bookings` — paginated list of every booking across all products, newest first, with `productId`/`userId` populated (`title`/`price` and `fullName`/`email` respectively).
