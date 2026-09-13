# Catalog

A single public endpoint listing everything on the platform a user can pay for — courses, one-on-one booking sessions, and the case bank — so users can see the full offering in one place. Read-only; it aggregates data already owned by the courses, booking, cases, and subscriptions modules rather than storing anything itself.

## GET `/api/v1/products` (public)

Returns a flat array, each item tagged with a `type` discriminator:

- `type: 'course'` — `{ _id, title, description, thumbnailUrl, pricing }`, one per published course (same fields as `GET /api/v1/courses`).
- `type: 'one_on_one'` — `{ _id, title, description, price }`, one per published booking product (see `booking-module.md`).
- `type: 'case_bank'` — always exactly one entry: `{ title, description, prices, caseCount }`. `title`/`description`/`prices` come from `CASE_BANK_PLAN` (`subscriptions/constants/plans.ts`); `caseCount` is a live count of published cases (`MockCase` with `isPublished: true`) — never stored, so it can't drift from `/cases`. This item has no `_id` since the case bank isn't a persisted document.

No pagination — the catalog is expected to stay small (a handful of courses/sessions plus one case bank entry).
