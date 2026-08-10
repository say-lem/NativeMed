# Frontend Migration Guide — Course Pricing, Admin Drive Links & Delete Cascade

**Date:** 2026-08-10
**Audience:** Frontend engineers integrating against the NativeMed API
**Companion doc:** [`frontend-integration-guide.md`](./frontend-integration-guide.md) — the full API reference, already updated to reflect everything below. This document exists to walk through *what changed*, *why*, and *exactly what you need to touch* on the frontend to adapt.

---

## Table of contents

1. [Summary](#1-summary)
2. [Change 1 — Tier-based course pricing](#2-change-1--tier-based-course-pricing)
3. [Change 2 — Admin responses now include Drive folder links](#3-change-2--admin-responses-now-include-drive-folder-links)
4. [Change 3 — Deleting a course now unenrolls everyone](#4-change-3--deleting-a-course-now-unenrolls-everyone)
5. [Full updated TypeScript types](#5-full-updated-typescript-types)
6. [Migration checklist](#6-migration-checklist)
7. [Testing checklist](#7-testing-checklist)

---

## 1. Summary

| # | Change | Breaking? | Where it affects you |
|---|--------|-----------|----------------------|
| 1 | Course pricing is now **per access tier**, not a single flat price | **Yes** — `priceMonthly`/`priceQuarterly` are gone | Course create/edit forms, course detail pricing display, checkout flow |
| 2 | Admin course responses now include the Google Drive folder links | No — additive | Admin course edit form (can now pre-fill instead of asking the admin to re-enter) |
| 3 | Deleting a course now automatically unenrolls every user and cancels their subscriptions for it | No — same endpoint/response shape, but the real-world effect is bigger | Delete-course confirmation UX |

Change 1 is the only breaking change. If your frontend reads `course.priceMonthly` / `course.priceQuarterly` anywhere, it will now be `undefined` — those fields no longer exist on the API response.

---

## 2. Change 1 — Tier-based course pricing

### Why

Previously every course had exactly one price pair (`priceMonthly`, `priceQuarterly`) regardless of which access tier the buyer chose (`mocksessions_only` vs `mocksession_and_lectures`). The admin now needs to charge a different amount for each tier — e.g. a cheaper price for "mock sessions only" and a higher price for "mock sessions + lectures". Both tiers already existed as a concept (they controlled which Google Drive folders got shared), but price never varied by tier — it only varied by billing interval.

**Note:** access to the course PDF is unaffected by this change and always has been tier-independent — any active enrollment (either tier) grants PDF access.

### Before → After

**Course object — before:**

```json
{
  "_id": "6789abc...",
  "title": "Onah Chinedum",
  "description": "...",
  "priceMonthly": 49.99,
  "priceQuarterly": 129.99,
  "isPublished": true
}
```

**Course object — after:**

```json
{
  "_id": "6789abc...",
  "title": "Onah Chinedum",
  "description": "...",
  "pricing": {
    "mocksessions_only": { "monthly": 29.99, "quarterly": 79.99 },
    "mocksession_and_lectures": { "monthly": 49.99, "quarterly": 129.99 }
  },
  "isPublished": true
}
```

`priceMonthly` and `priceQuarterly` **no longer exist** on the Course object, in create/update payloads, or anywhere else. They are fully replaced by `pricing`.

### Endpoints affected

| Endpoint | What changed |
|----------|---------------|
| `GET /courses`, `GET /courses/:id` | Response now has `pricing` instead of `priceMonthly`/`priceQuarterly` |
| `GET /courses/admin/all`, `GET /courses/admin/:id` | Same |
| `POST /courses` (create) | Request body requires `pricing` (see validation rules below); response returns it |
| `PATCH /courses/:id` (update) | Request body accepts a partial `pricing` object; response returns the merged result |
| `POST /payments/checkout` | No request shape change (still `{ courseId, tier, interval, ... }`), but the price charged is now looked up as `course.pricing[tier][interval]` instead of `course.priceMonthly`/`priceQuarterly` filtered by `interval` alone. If that specific tier/interval combination isn't priced, checkout now returns: `"This course is not available for {interval} billing on the {tier} tier"` (previously just `"...for {interval} billing"`, with no tier awareness). |

### Validation rules (create/update)

| Rule | Detail |
|------|--------|
| `pricing.mocksessions_only` | **Required on create.** Must have at least one of `monthly` / `quarterly` set. |
| `pricing.mocksession_and_lectures` | **Required on create.** Must have at least one of `monthly` / `quarterly` set. |
| Each `monthly`/`quarterly` value | Number ≥ 0, GBP |
| On update | `pricing` is optional; if sent, each tier inside it is optional too. **Partial updates merge per tier/interval against the existing document** — sending only `{ pricing: { mocksessions_only: { monthly: 24.99 } } }` updates just that one number and leaves `mocksessions_only.quarterly` and the entire `mocksession_and_lectures` tier untouched. After the merge, both tiers must still have at least one price set, or the update is rejected with `400`. |

**Validation error example** (creating a course with `mocksessions_only` entirely missing from the payload):

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": {
    "pricing.mocksessions_only": ["Invalid input: expected object, received undefined"]
  }
}
```

**Validation error example** (a tier present but with neither `monthly` nor `quarterly`):

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": {
    "pricing.mocksessions_only.monthly": [
      "At least one of monthly or quarterly price is required for this tier"
    ]
  }
}
```

Don't pattern-match on the exact wording of the first message (Zod's built-in "missing required field" text) — treat any error under the `pricing.mocksessions_only` or `pricing.mocksession_and_lectures` key as "this tier needs attention" and point the admin at that section of the form.

### What to update on the frontend

1. **Admin create-course form** — replace the single "Monthly £ / Quarterly £" pair with **two** pricing sections, one per tier:
   ```
   Mock Sessions Only
     Monthly £  [____]
     Quarterly £ [____]
   Mock Sessions + Lectures
     Monthly £  [____]
     Quarterly £ [____]
   ```
   Each section needs its own "at least one required" validation, client-side, mirroring the backend rule.

2. **Admin edit-course form** — same two sections; when submitting a partial update (e.g. changing only one number), you only need to send the tier/interval you changed — don't need to resend the whole `pricing` object. See the request example below.

   ```json
   PATCH /courses/:id
   {
     "pricing": {
       "mocksession_and_lectures": { "monthly": 59.99 }
     }
   }
   ```

3. **Course detail / pricing display** — you now show **two** price cards (or a tier selector with a price that updates), not one:
   ```tsx
   function CoursePricing({ course, tier }: { course: Course; tier: CourseAccessTier }) {
     const price = course.pricing[tier];
     return (
       <div>
         {price.monthly != null && <button onClick={() => checkout(tier, 'monthly')}>£{price.monthly.toFixed(2)} / month</button>}
         {price.quarterly != null && <button onClick={() => checkout(tier, 'quarterly')}>£{price.quarterly.toFixed(2)} / quarter</button>}
       </div>
     );
   }
   ```
   If a tier has neither `monthly` nor `quarterly` set (see note below on existing courses), hide that tier's purchase option entirely rather than showing empty buttons.

4. **Checkout flow** — tier selection now directly affects the price shown, not just which Drive folders get granted. Make sure your tier-selection UI updates the displayed price when the user switches tiers, and only enables the interval buttons that exist for the *currently selected* tier (not "any interval that exists on the course" — must be scoped to the selected tier).

### ⚠️ Heads-up on existing/migrated courses

Courses that existed before this change had their old flat price migrated onto `mocksession_and_lectures` only — there was no historical price for `mocksessions_only`, so **that tier is currently unpriced on migrated courses** until the admin sets it via the update endpoint. Practically:

- `course.pricing.mocksessions_only` may be `{}` (both `monthly` and `quarterly` undefined) on older courses.
- Your pricing display and checkout tier-selector must handle this gracefully: if a tier has no price, don't render it as purchasable. Don't assume every course has both tiers priced.

---

## 3. Change 2 — Admin responses now include Drive folder links

### Why

`lecturesDriveFolderId` and `mockSessionsDriveFolderId` were always accepted on create/update, but were **never returned** in any response — public or admin — because the API stripped them for public safety. This meant the admin edit form had no way to pre-fill these fields; admins had to re-paste the Drive link every time they edited a course, even to change something unrelated like the title.

### What changed

Admin-facing endpoints now return the Drive folder links. Public endpoints still never do — this is purely additive for admins.

| Endpoint | Returns Drive links? |
|----------|----------------------|
| `GET /courses` (public list) | **No** — unchanged |
| `GET /courses/:id` (public detail) | **No** — unchanged |
| `GET /courses/admin/all` | **Yes — new** |
| `GET /courses/admin/:id` | **Yes — new** |
| `POST /courses` (create) | **Yes — new** |
| `PATCH /courses/:id` (update) | **Yes — new** |

### Before → After (admin detail response)

**Before:**
```json
{
  "_id": "6789abc...",
  "title": "Onah Chinedum",
  "pricing": { "...": "..." },
  "isPublished": true
}
```

**After:**
```json
{
  "_id": "6789abc...",
  "title": "Onah Chinedum",
  "pricing": { "...": "..." },
  "lecturesDriveFolderId": "10aYg5EFRmbyrhJpGbPcUhny9ST9kAL-T",
  "mockSessionsDriveFolderId": "10aYg5EFRmbyrhJpGbPcUhny9ST9kAL-T",
  "isPublished": true
}
```

### What to update on the frontend

1. **Admin edit-course form** — pre-fill the two Drive-link inputs from `GET /courses/admin/:id` instead of leaving them blank / asking the admin to re-enter. This is the main win here — no other change is required to keep working, this just unlocks better UX.
2. **Do not** surface these fields anywhere reachable by non-admin users — the public endpoints still correctly omit them, but if you have any shared "Course" rendering component used in both admin and public contexts, make sure it doesn't accidentally leak `lecturesDriveFolderId`/`mockSessionsDriveFolderId` if present (e.g. don't spread the raw admin course object into a public-facing card without filtering).
3. Use the new `AdminCourse` type (see [§5](#5-full-updated-typescript-types)) to type these responses distinctly from the public `Course` type, so TypeScript catches accidental leakage at compile time.

---

## 4. Change 3 — Deleting a course now unenrolls everyone

### Why

Previously, `DELETE /courses/:id` only removed the Course document. Any users enrolled in that course kept their `Enrollment` record marked active, kept their Google Drive folder access, and — worse — kept being **billed** by Stripe for a course that no longer existed, with no way to know why. This was a silent data-integrity/billing gap.

### What changed

`DELETE /courses/:id` now cascades, in this order, before the course is removed:

1. **Every active enrollment for the course is deactivated** (`Enrollment.isActive = false`).
2. **Google Drive access is revoked** for each enrolled user, for whichever folders their tier had granted (lectures and/or mock sessions).
3. **Every active/past-due subscription billing for that course is cancelled** — both on Stripe (so the user stops being charged) and in the local database (`Subscription.status = 'cancelled'`), immediately rather than waiting on a webhook round-trip.
4. The course is deleted.

### Endpoint / response shape

**No change.** Still:

```
DELETE /api/v1/courses/:id
```
```json
{ "success": true, "message": "Course deleted" }
```

There's no new data in the response — the cascade happens server-side and isn't reported back per-user. If you need to show the admin how many people will be affected, fetch `GET /enrollments/course/:courseId` (admin-only, paginated) **before** issuing the delete, since that data won't exist to query afterward.

### What to update on the frontend

This isn't an API contract change, but it **is** a behavior change with real consequences (unenrollment + billing cancellation), so the UI should reflect that:

1. **Strengthen the delete confirmation dialog.** Previously "delete course" was a fairly low-stakes action. Now it immediately unenrolls every paying user and cancels their subscriptions. Recommended copy:

   > **Delete "{course.title}"?**
   > This will immediately revoke access for all enrolled users and cancel their subscriptions for this course. This cannot be undone.
   > [Cancel] [Delete course]

2. **Consider showing the enrolled-user count** in that confirmation dialog using `GET /enrollments/course/:courseId` (returns `{ items, total, ... }` — use `total`), so the admin understands the blast radius before confirming — e.g. "This will unenroll 12 users."

3. **No polling/waiting needed** — the cascade completes synchronously as part of the `DELETE` request; by the time you get the `200` response, all enrollments and subscriptions are already updated.

---

## 5. Full updated TypeScript types

Replace any existing `Course`/pricing-related types in your frontend codebase with these:

```ts
export type SubscriptionType = 'case_bank' | 'course';
export type CourseAccessTier = 'mocksessions_only' | 'mocksession_and_lectures';
export type BillingInterval = 'monthly' | 'quarterly';
export type SubscriptionStatus = 'active' | 'expired' | 'cancelled' | 'past_due';

export interface TierPricing {
  monthly?: number;
  quarterly?: number;
}

export interface CoursePricing {
  mocksessions_only: TierPricing;
  mocksession_and_lectures: TierPricing;
}

// Public shape — GET /courses, GET /courses/:id
export interface Course {
  _id: string;
  title: string;
  description: string;
  pricing: CoursePricing;
  thumbnailUrl?: string;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

// Admin shape — GET /courses/admin/*, POST /courses, PATCH /courses/:id
export interface AdminCourse extends Course {
  lecturesDriveFolderId: string;
  mockSessionsDriveFolderId: string;
  createdBy?: { _id: string; fullName: string; email: string } | string;
}

// POST /courses body
export interface CreateCoursePayload {
  title: string;
  description: string;
  pricing: CoursePricing; // both tier keys required, each with monthly and/or quarterly
  lecturesDriveFolderId: string;
  mockSessionsDriveFolderId: string;
  isPublished?: boolean;
}

// PATCH /courses/:id body — everything optional, pricing merges per tier/interval
export interface UpdateCoursePayload {
  title?: string;
  description?: string;
  pricing?: Partial<Record<CourseAccessTier, Partial<TierPricing>>>;
  lecturesDriveFolderId?: string;
  mockSessionsDriveFolderId?: string;
  isPublished?: boolean;
}
```

---

## 6. Migration checklist

Work through this in order — each step depends on the types from §5 being in place first.

- [ ] Replace `priceMonthly?: number` / `priceQuarterly?: number` on your local `Course` type with `pricing: CoursePricing` (§5).
- [ ] Find every place in the codebase that reads `course.priceMonthly` / `course.priceQuarterly` (search for both strings) and update to `course.pricing[tier].monthly` / `.quarterly`.
- [ ] Update the admin create-course form to submit two tiers of pricing instead of one flat pair.
- [ ] Update the admin edit-course form the same way, and confirm partial single-field pricing updates still work (send only what changed).
- [ ] Update the public course-detail pricing display to show per-tier pricing, gracefully hiding a tier if it has no price set.
- [ ] Update the checkout tier-selector so the displayed price and available intervals are scoped to the currently selected tier.
- [ ] Add the `AdminCourse` type and use it for admin list/detail responses; wire the edit form to pre-fill `lecturesDriveFolderId`/`mockSessionsDriveFolderId` from it.
- [ ] Audit any shared course-rendering component to ensure Drive links from an `AdminCourse` never leak into a public-facing view.
- [ ] Update the delete-course confirmation dialog copy to warn about cascading unenrollment/subscription cancellation.
- [ ] (Optional) Wire an enrolled-user count into the delete confirmation if you have/adopt an endpoint for it.

---

## 7. Testing checklist

### Pricing
- [ ] Create a course with both tiers fully priced (monthly + quarterly on each) — succeeds.
- [ ] Create a course with only `monthly` set on each tier (no quarterly) — succeeds.
- [ ] Create a course missing `mocksessions_only` entirely — `400`, error path `pricing.mocksessions_only`.
- [ ] Create a course where a tier is present but empty (`{}`) — `400`.
- [ ] Update a course to change only `mocksessions_only.monthly` — confirm `mocksessions_only.quarterly` and all of `mocksession_and_lectures` are unchanged in the response.
- [ ] View a course whose `mocksessions_only` tier has no price (a migrated pre-existing course) — confirm the UI hides that purchase option instead of showing a blank/zero price.
- [ ] Checkout with a tier/interval combination the course doesn't support — confirm the `400` error message names both the interval and the tier.
- [ ] Checkout with a valid tier/interval — confirm the Stripe line item amount matches `course.pricing[tier][interval]`.

### Admin Drive links
- [ ] `GET /courses/admin/:id` response includes `lecturesDriveFolderId` and `mockSessionsDriveFolderId`.
- [ ] `GET /courses/:id` (public) response does **not** include either field.
- [ ] Admin edit form pre-fills both Drive link inputs from the fetched course.
- [ ] `POST /courses` and `PATCH /courses/:id` responses include the Drive links.

### Delete cascade
- [ ] Enroll a test user in a test course, delete the course, confirm `GET /enrollments/me` no longer lists it as active for that user.
- [ ] With an active paid subscription on the test course, delete the course, confirm the subscription's status becomes `cancelled` and (in Stripe test mode) the subscription is cancelled there too.
- [ ] Confirm the delete confirmation dialog shows the updated warning copy before the request fires.
