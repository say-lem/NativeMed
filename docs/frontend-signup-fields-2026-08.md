# Frontend Migration Guide — Signup Fields (phone, telegramUsername, examSitting)

**Date:** 2026-08-12
**Audience:** Frontend engineers integrating against the NativeMed API
**Companion doc:** [`frontend-integration-guide.md`](./frontend-integration-guide.md) — the general API reference for courses/subscriptions/Stripe. This doc is scoped to auth/signup only.

---

## Table of contents

1. [Summary](#1-summary)
2. [Why this doc exists](#2-why-this-doc-exists)
3. [Register — request body](#3-register--request-body)
4. [Field rules](#4-field-rules)
5. [Register — response](#5-register--response)
6. [Validation error shape](#6-validation-error-shape)
7. [Other endpoints that touch these fields](#7-other-endpoints-that-touch-these-fields)
8. [Signup form UI recommendations](#8-signup-form-ui-recommendations)
9. [TypeScript types](#9-typescript-types)
10. [Migration checklist](#10-migration-checklist)
11. [Testing checklist](#11-testing-checklist)

---

## 1. Summary

`POST /api/v1/auth/register` requires three fields that most frontend signup forms have not been sending:

| Field | Type | Required on signup? | Format |
|---|---|---|---|
| `phone` | string | **Yes** | Any string ≥ 7 characters (e.g. `+2348012345678`) |
| `telegramUsername` | string | **Yes** | Handle, with or without leading `@` — server normalizes to `@handle` |
| `examSitting` | string | **Yes** | Strict `MM/YY` (e.g. `03/26` for March 2026) |

These fields already existed on the `User` model and were already accepted by the API — this is not a new backend feature. What changed just now:
- `telegramUsername` and `examSitting` are now **required** (previously optional/unenforced) on `POST /auth/register`.
- `examSitting` is now **format-validated** as `MM/YY` — previously any free-text string was accepted.

If your signup form does not currently collect and send `phone`, `telegramUsername`, and `examSitting`, **registration will now fail with a 422** until you add them.

---

## 2. Why this doc exists

These three fields were added to the `User` schema and the register endpoint's validation a while back, but no frontend signup form was ever updated to actually collect and submit them. This doc is the missing integration piece — it documents exactly what the signup form needs to send and how to render/validate each field.

---

## 3. Register — request body

```
POST /api/v1/auth/register
Content-Type: application/json
```

```json
{
  "fullName": "Ada Obi",
  "email": "ada@example.com",
  "password": "Password123!",
  "phone": "+2348012345678",
  "telegramUsername": "adaobi",
  "examSitting": "03/26",
  "whatsappNumber": "+2348012345678"
}
```

`whatsappNumber` is unrelated to this change and remains optional — included above only for completeness since it sits next to `phone` on the model.

---

## 4. Field rules

### `phone`
- Required, trimmed string, minimum 7 characters.
- No format/regex enforced beyond length — send whatever the user types (with or without a `+` country code prefix). Client-side, still validate it looks like a real phone number before submitting.

### `telegramUsername`
- Required, non-empty string.
- The server auto-prefixes `@` if the user didn't type one: `"adaobi"` and `"@adaobi"` both become `"@adaobi"` in the stored/returned value.
- **Recommendation:** don't force the user to type `@` — accept either and let the server normalize it, but if you want the UI to preview the normalized form, mirror the same rule client-side: `value.startsWith('@') ? value : '@' + value`.

### `examSitting`
- Required, must match **`MM/YY`** exactly: two-digit month `01`–`12`, a literal `/`, then a two-digit year.
  - Valid: `"03/26"`, `"01/27"`, `"12/25"`
  - Invalid: `"3/26"` (month not zero-padded), `"March 2026"`, `"2026-03"`, `"13/26"` (invalid month)
- **Strongly recommend a native `<input type="month">`** or a month/year picker component rather than free text — it naturally produces `YYYY-MM`, which you'll need to reformat to `MM/YY` before submitting:
  ```ts
  // input.value from <input type="month"> is "2026-03"
  const toExamSitting = (monthInputValue: string): string => {
    const [year, month] = monthInputValue.split('-');
    return `${month}/${year.slice(2)}`;
  };
  // toExamSitting("2026-03") -> "03/26"
  ```
- If you instead use two separate dropdowns (month 1–12, year e.g. current year through +3 years), zero-pad the month and take the last two digits of the year before combining with `/`.

---

## 5. Register — response

Unchanged shape, now includes all three fields on the returned `user` object:

```json
{
  "success": true,
  "message": "Registration successful",
  "data": {
    "accessToken": "...",
    "refreshToken": "...",
    "user": {
      "_id": "6789abc...",
      "fullName": "Ada Obi",
      "email": "ada@example.com",
      "role": "user",
      "phone": "+2348012345678",
      "whatsappNumber": "+2348012345678",
      "telegramUsername": "@adaobi",
      "examSitting": "03/26",
      "mustChangePassword": false
    }
  }
}
```

---

## 6. Validation error shape

`POST /auth/register` returns `422` with per-field messages, same shape as every other endpoint using the `validate` middleware:

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": {
    "phone": ["Invalid phone number"],
    "telegramUsername": ["Telegram username is required"],
    "examSitting": ["examSitting must be in MM/YY format"]
  }
}
```

Map each key in `errors` directly to the corresponding form field's error state — no parsing of message text required, the keys match the request body field names exactly.

---

## 7. Other endpoints that touch these fields

| Endpoint | `phone` | `telegramUsername` | `examSitting` |
|---|---|---|---|
| `POST /auth/register` | **Required** | **Required** | **Required**, `MM/YY` |
| `PATCH /auth/me` (self profile update) | Optional | Optional | Optional, `MM/YY` if sent |
| `PATCH /auth/admin/users/:userId` (admin edit) | Optional | *(not editable by admin — omit from admin edit form)* | Optional, `MM/YY` if sent |
| `GET /auth/me` | Returned | Returned | Returned |

Note: `updateUserByAdminSchema` does not accept `telegramUsername` — if you have an admin "edit user" form, don't show a Telegram field there; it will be silently ignored by the API (extra fields not in the Zod schema are stripped, not errored on).

For `PATCH /auth/me`, the same `MM/YY` format is enforced on `examSitting` if the user changes their exam date from their account settings page — reuse the same input component/formatter described in [§4](#4-field-rules).

---

## 8. Signup form UI recommendations

1. **Phone** — standard text input, `type="tel"`, with basic client-side length check (≥ 7 chars) before enabling submit.
2. **Telegram username** — text input, placeholder `@yourusername`, strip/re-add `@` for display consistency; don't block submission if the user omits `@`.
3. **Exam sitting** — `<input type="month">` (or equivalent date-picker restricted to month/year) rather than free text, converted to `MM/YY` on submit per the snippet in [§4](#4-field-rules). This avoids most of the format errors a free-text field would produce.
4. All three should be **required** fields on the signup form with inline validation before the request is even sent, so users don't have to round-trip to the server to discover a 422.

---

## 9. TypeScript types

```ts
export interface RegisterPayload {
  fullName: string;
  email: string;
  password: string;
  phone: string;
  telegramUsername: string;
  examSitting: string; // MM/YY, e.g. "03/26"
  whatsappNumber?: string;
}

export interface User {
  _id: string;
  fullName: string;
  email: string;
  role: 'user' | 'admin';
  phone: string;
  whatsappNumber?: string;
  telegramUsername: string;
  examSitting: string; // MM/YY
  mustChangePassword: boolean;
}
```

---

## 10. Migration checklist

- [ ] Add `phone`, `telegramUsername`, and `examSitting` inputs to the signup form (they may already exist as unused/uncollected fields — confirm they're actually wired into the submit payload).
- [ ] Add an `<input type="month">` (or equivalent) for exam sitting, with the `MM/YY` conversion helper from [§4](#4-field-rules).
- [ ] Make all three fields required client-side, matching the server rules.
- [ ] Wire the `422` `errors` object to per-field inline error messages (see [§6](#6-validation-error-shape)).
- [ ] Update the local `RegisterPayload`/`User` types (§9) — `telegramUsername` and `examSitting` are no longer optional on the `User` type as far as registration is concerned.
- [ ] If you have an account-settings page using `PATCH /auth/me`, reuse the same exam-sitting picker/formatter there.
- [ ] Confirm any admin "edit user" screen does **not** attempt to send `telegramUsername` (not accepted by that endpoint).

---

## 11. Testing checklist

- [ ] Submit signup with all fields valid, including `examSitting: "03/26"` — succeeds, response `user` object includes all three fields.
- [ ] Submit signup with `telegramUsername: "adaobi"` (no `@`) — succeeds, response shows `"@adaobi"`.
- [ ] Submit signup with `examSitting: "3/26"` (not zero-padded) — `422`, error under `examSitting`.
- [ ] Submit signup with `examSitting: "13/26"` (invalid month) — `422`.
- [ ] Submit signup omitting `phone` — `422`, error under `phone`.
- [ ] Submit signup omitting `telegramUsername` — `422`, error under `telegramUsername`.
- [ ] `PATCH /auth/me` with a new valid `examSitting` — succeeds and `GET /auth/me` reflects it.
- [ ] `PATCH /auth/me` with a malformed `examSitting` — `422`.
