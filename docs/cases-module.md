# Cases Module — Frontend Integration Guide

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Base URL](#base-url)
4. [Data Model](#data-model)
   - [Full Case Object](#full-case-object)
   - [Sub-document Schemas](#sub-document-schemas)
   - [List Item Projection](#list-item-projection)
5. [Enums & Allowed Values](#enums--allowed-values)
6. [Pagination](#pagination)
7. [Endpoints](#endpoints)
   - [GET /cases/specialties](#get-casesspecialties)
   - [GET /cases](#get-cases)
   - [GET /cases/specialty/:specialty](#get-casesspecialtyspecialty)
   - [GET /cases/:id](#get-casesid)
   - [GET /cases/overview](#get-casesoverview)
   - [GET/PATCH /cases/admin/overview](#getpatch-casesadminoverview)
   - [GET /cases/admin/all](#get-casesadminall)
   - [GET /cases/admin/:id](#get-casesadminid)
   - [POST /cases](#post-cases)
   - [PATCH /cases/:id](#patch-casesid)
   - [PATCH /cases/:id/image](#patch-casesidimage)
   - [PATCH /cases/:id/station-image](#patch-casesidstation-image)
   - [PATCH /cases/:id/publish](#patch-casesidpublish)
   - [POST /cases/:id/duplicate](#post-casesidduplicate)
   - [DELETE /cases/:id](#delete-casesid)
8. [Error Responses](#error-responses)
9. [Integration Notes](#integration-notes)

---

## Overview

The Cases module manages mock clinical OSCE cases. Cases have two visibility states:

- **Draft** (`isPublished: false`) — visible to admins only
- **Published** (`isPublished: true`) — visible to everyone, but the first `FREE_CASE_PREVIEW_LIMIT` (currently 5) published cases by station order are the only ones visible **without** a Case Bank subscription. This free preview is now public — no login required. Beyond the preview, a case requires a logged-in user with either an active Case Bank subscription or the `admin` role.

Also see the [case bank product overview](#getpatch-casesadminoverview) — an admin-editable title/description/image describing the case bank as a purchasable product, surfaced on the [catalog endpoint](./catalog-module.md).

Responses are consistent across all endpoints:

```json
{
  "success": true,
  "message": "Human-readable message",
  "data": { ... }
}
```

---

## Authentication

The browsing endpoints (`GET /cases`, `/cases/specialty/:specialty`, `/cases/specialties`, `/cases/:id`, `/cases/overview`) accept an **optional** Bearer token:

```
Authorization: Bearer <accessToken>
```

- **No token / anonymous** — you get the free preview only (the first `FREE_CASE_PREVIEW_LIMIT` published cases).
- **Valid token, no Case Bank subscription** — same free preview as anonymous.
- **Valid token, active Case Bank subscription (or `role: "admin"`)** — full access to every published case.

An invalid or expired token on these routes is treated the same as no token — you fall back to the free preview rather than getting a `401`.

Admin write endpoints (create/update/delete/publish, and the admin overview editor) still **require** a valid token with `role: "admin"`. Accessing an admin endpoint as a regular user or anonymously returns `403`/`401`.

---

## Base URL

```
http://localhost:5000/api/v1/cases          (development)
https://your-production-domain.com/api/v1/cases   (production)
```

---

## Data Model

### Full Case Object

This is the complete shape returned by `GET /cases/:id` and `GET /cases/admin/:id`.

```ts
{
  _id:              string;          // MongoDB ObjectId as string
  stationNumber:    number;          // Station ordering number (e.g. 20)
  title:            string;          // e.g. "Young Man With Hand Lesion"
  consultationType: string;          // e.g. "Video Consultation"
  specialty:        string;          // see Enums section
  difficulty:       "easy" | "medium" | "hard";
  isPublished:      boolean;

  // Images — both are optional; only present when an image has been uploaded
  imageUrl?:        string;          // Cloudinary CDN URL — cover/banner image
  stationImageUrl?: string;          // Cloudinary CDN URL — station-specific image

  createdBy:        string | UserRef; // ObjectId string, or populated { _id, fullName, email }
  createdAt:        string;          // ISO 8601 date
  updatedAt:        string;          // ISO 8601 date

  patientData:      PatientData;
  patientStory:     string;          // Role-player brief — may contain markdown
  markingScheme:    MarkingSchemeSection[];
  exampleExplanation: string;        // Model explanation to patient — may contain markdown
  management:       string[];        // Bullet-point management steps
  learningPoints:   string;          // Educational content — may contain markdown
  furtherResources: FurtherResource[];
}
```

> **Note:** `imagePublicId` and `stationImagePublicId` are internal Cloudinary IDs and are **never** included in any response. Do not attempt to use them on the frontend.

---

### Sub-document Schemas

#### PatientData

```ts
{
  name:               string;        // e.g. "James Thornton"
  age:                number;        // 0–130
  gender:             "male" | "female" | "other";
  pastMedicalHistory: string[];      // List of conditions
  drugHistory:        string[];      // Medications / allergies
  recentConsultation: RecentConsultation;
  bloodTestResults:   BloodTestResults;
}
```

#### RecentConsultation

```ts
{
  date?:   string;   // ISO 8601 date — may be absent
  seenBy:  string;   // e.g. "GP Surgery"
  role?:   string;   // e.g. "Healthcare Assistant"
  notes:   string;   // Free-text, may be multi-line
}
```

#### BloodTestResults

```ts
{
  summary: string;           // Free-text summary
  rows:    BloodTestRow[];
}
```

#### BloodTestRow

```ts
{
  test:           string;    // e.g. "ALT"
  result:         string;    // e.g. "91 U/L"
  referenceRange: string;    // e.g. "10–45 U/L"
  isAbnormal:     boolean;   // Use to highlight the row in red
}
```

#### MarkingSchemeSection

```ts
{
  heading: string;    // Section title e.g. "Data Gathering and Diagnosis"
  points:  string[];  // Marking criteria for this section
}
```

#### FurtherResource

```ts
{
  title: string;   // Display label e.g. "NICE CKS – Fatty Liver"
  url:   string;   // Full URL
}
```

---

### List Item Projection

The list endpoints (`GET /cases` and `GET /cases/admin/all`) return a **lightweight projection** — heavy fields like `patientStory`, `markingScheme`, `exampleExplanation`, `management`, `learningPoints`, and `furtherResources` are excluded to keep the response small.

**User list projection:**

```ts
{
  _id:           string;
  stationNumber: number;
  title:         string;
  specialty:     string;
  difficulty:    "easy" | "medium" | "hard";
  imageUrl?:     string;
  patientData: {
    name:   string;
    age:    number;
    gender: "male" | "female" | "other";
  };
  createdAt: string;
}
```

**Admin list projection** — same as above but also includes:

```ts
{
  consultationType: string;
  isPublished:      boolean;
  stationImageUrl?: string;
  createdBy: {
    _id:      string;
    fullName: string;
    email:    string;
  };
  updatedAt: string;
}
```

Fetch the full case detail (`GET /cases/:id`) when the user opens an individual case.

---

## Enums & Allowed Values

### Specialties

```
Dermatology/Allergy/Immunology
Elderly Medicine/ Palliative
Endocrine and Nephrology
ENT & Eye
Ethics
Gastroenterology/ Haematology
Gynaecology/ Women's Health
Mental Health
Paediatrics
Respiratory
Rheumatology/ Musculoskeletal
Travel Health/ Infectious Disease
```

Use `GET /cases/specialties` to fetch this list dynamically at runtime — it returns only the specialties that have at least one published case, along with the count per specialty.

### Difficulty

```
easy | medium | hard
```

### Gender

```
male | female | other
```

### Consultation Type (free string — common values)

```
Video Consultation
Telephone Consultation
Face-to-Face Consultation
Consultation
```

---

## Pagination

All list endpoints return a consistent pagination envelope:

```ts
{
  items:      CaseListItem[];   // The page of results
  total:      number;           // Total matching documents
  page:       number;           // Current page (1-indexed)
  limit:      number;           // Items per page
  totalPages: number;           // Math.ceil(total / limit)
}
```

**Query parameters:**

| Param      | Type    | Default | Max | Description                          |
|------------|---------|---------|-----|--------------------------------------|
| `page`     | number  | `1`     | —   | Page number (1-indexed)              |
| `limit`    | number  | `12`    | `50`| Items per page                       |
| `specialty`| string  | —       | —   | Filter by specialty (case-insensitive) |
| `difficulty`| string | —       | —   | `easy`, `medium`, or `hard`          |
| `search`   | string  | —       | —   | Full-text search on title, specialty, patient name, learning points |

---

## Endpoints

---

### GET /cases/specialties

Returns all specialties that have at least one **published** case, with the case count per specialty. Use this to build the specialty filter dropdown.

**Auth:** Optional (public free preview; full access needs a Case Bank subscription or admin role)

**Request:**

```
GET /api/v1/cases/specialties
Authorization: Bearer <token>
```

**Response `200`:**

```json
{
  "success": true,
  "message": "Specialties fetched",
  "data": [
    { "specialty": "Dermatology/Allergy/Immunology", "count": 2 },
    { "specialty": "Elderly Medicine/ Palliative",   "count": 216 },
    { "specialty": "Endocrine and Nephrology",       "count": 6 },
    { "specialty": "ENT & Eye",                      "count": 2 },
    { "specialty": "Ethics",                         "count": 4 },
    { "specialty": "Gastroenterology/ Haematology",  "count": 4 },
    { "specialty": "Gynaecology/ Women's Health",    "count": 3 },
    { "specialty": "Mental Health",                  "count": 4 },
    { "specialty": "Paediatrics",                    "count": 1 },
    { "specialty": "Respiratory",                    "count": 3 },
    { "specialty": "Rheumatology/ Musculoskeletal",  "count": 1 },
    { "specialty": "Travel Health/ Infectious Disease", "count": 1 }
  ]
}
```

---

### GET /cases

Paginated list of **published** cases. Returns the lightweight projection.

**Auth:** Optional (public free preview; full access needs a Case Bank subscription or admin role)

**Request:**

```
GET /api/v1/cases?page=1&limit=12
GET /api/v1/cases?page=1&limit=12&specialty=Respiratory
GET /api/v1/cases?page=1&limit=12&difficulty=hard
GET /api/v1/cases?page=1&limit=12&search=chest+pain
Authorization: Bearer <token>
```

**Response `200`:**

```json
{
  "success": true,
  "message": "Cases fetched",
  "data": {
    "items": [
      {
        "_id": "6659a1f2b3c4d5e6f7a8b9c0",
        "stationNumber": 20,
        "title": "Young Man With Hand Lesion",
        "specialty": "Dermatology/Allergy/Immunology",
        "difficulty": "medium",
        "imageUrl": "https://res.cloudinary.com/ddv2ukheu/image/upload/v.../cover.jpg",
        "patientData": {
          "name": "James Thornton",
          "age": 28,
          "gender": "male"
        },
        "createdAt": "2024-01-15T10:30:00.000Z"
      }
    ],
    "total": 247,
    "page": 1,
    "limit": 12,
    "totalPages": 21
  }
}
```

---

### GET /cases/specialty/:specialty

Paginated list of published cases filtered to a specific specialty. Equivalent to `GET /cases?specialty=X` but uses a URL path param.

**Auth:** Optional (public free preview; full access needs a Case Bank subscription or admin role)

**Request:**

```
GET /api/v1/cases/specialty/Respiratory?page=1&limit=12
Authorization: Bearer <token>
```

URL-encode the specialty if it contains spaces or slashes:

```
GET /api/v1/cases/specialty/Elderly%20Medicine%2F%20Palliative
```

**Response `200`:** Same pagination envelope as `GET /cases`.

---

### GET /cases/:id

Full detail for a single **published** case. Returns all fields including `patientStory`, `markingScheme`, etc.

**Auth:** Optional (public free preview; full access needs a Case Bank subscription or admin role)

**Request:**

```
GET /api/v1/cases/6659a1f2b3c4d5e6f7a8b9c0
Authorization: Bearer <token>
```

**Response `200`:**

```json
{
  "success": true,
  "message": "Case fetched",
  "data": {
    "_id": "6659a1f2b3c4d5e6f7a8b9c0",
    "stationNumber": 20,
    "title": "Young Man With Hand Lesion",
    "consultationType": "Video Consultation",
    "specialty": "Dermatology/Allergy/Immunology",
    "difficulty": "medium",
    "isPublished": true,
    "imageUrl": "https://res.cloudinary.com/ddv2ukheu/image/upload/v.../cover.jpg",
    "stationImageUrl": "https://res.cloudinary.com/ddv2ukheu/image/upload/v.../station.png",
    "createdBy": "6659a1f2b3c4d5e6f7a8b900",
    "patientData": {
      "name": "James Thornton",
      "age": 28,
      "gender": "male",
      "pastMedicalHistory": ["Eczema", "Hay fever"],
      "drugHistory": ["Cetirizine 10mg once daily", "NKDA"],
      "recentConsultation": {
        "date": "2024-01-10T00:00:00.000Z",
        "seenBy": "GP Surgery",
        "role": "GP",
        "notes": "Noted hand lesion during routine appointment"
      },
      "bloodTestResults": {
        "summary": "No significant abnormalities",
        "rows": [
          {
            "test": "ALT",
            "result": "32 U/L",
            "referenceRange": "10–45 U/L",
            "isAbnormal": false
          }
        ]
      }
    },
    "patientStory": "You are James Thornton...",
    "markingScheme": [
      {
        "heading": "Data Gathering and Diagnosis",
        "points": [
          "Asks about onset and duration",
          "Asks about associated symptoms"
        ]
      }
    ],
    "exampleExplanation": "So what I think is happening...",
    "management": [
      "Topical corticosteroid cream",
      "Emollient moisturiser twice daily"
    ],
    "learningPoints": "## Eczema\nEczema is a chronic inflammatory skin condition...",
    "furtherResources": [
      {
        "title": "NICE CKS – Eczema",
        "url": "https://cks.nice.org.uk/topics/eczema-atopic/"
      }
    ],
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-06-19T08:00:00.000Z"
  }
}
```

**Errors:**

| Status | Condition                              |
|--------|----------------------------------------|
| `404`  | Case not found or case is not published |

---

### GET /cases/overview

The case bank as a *product* — title, description, and an optional cover image, set by the admin. Distinct from any individual `MockCase`. This is also what feeds the `case_bank` entry on the [catalog endpoint](./catalog-module.md#get-apiv1products-public).

**Auth:** Public — no token required.

**Request:**

```
GET /api/v1/cases/overview
```

**Response `200`:**

```json
{
  "success": true,
  "message": "Case bank overview fetched",
  "data": {
    "_id": "6659a1f2b3c4d5e6f7a8b9c0",
    "title": "Case Bank Access",
    "description": "Unlimited access to all mock clinical cases.",
    "detailedDescription": "A much longer write-up of everything the case bank includes — shown on the case bank's own product page.",
    "imageUrl": "https://res.cloudinary.com/ddv2ukheu/image/upload/v.../overview.jpg",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

`title`/`description` are `"Case Bank Access"` / `"Unlimited access to all mock clinical cases."` by default until an admin edits them. `detailedDescription` is absent until an admin sets it — it's a longer-form write-up for the case bank's own page, distinct from the short `description` used in the catalog listing (the catalog does **not** include `detailedDescription`, same as courses). `imageUrl` is absent until an admin uploads one.

---

### GET/PATCH /cases/admin/overview

Admin editor for the case bank overview above. It's a singleton — there's always exactly one, created automatically on first read/write.

**Auth:** Required (admin)

**Fetch current values:**

```
GET /api/v1/cases/admin/overview
Authorization: Bearer <token>
```

Same response shape as the public `GET /cases/overview`.

**Update title/description:**

```
PATCH /api/v1/cases/admin/overview
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "title": "MRCGP Case Bank",
  "description": "Practice with real exam-style clinical stations.",
  "detailedDescription": "A much longer write-up of everything the case bank includes."
}
```

At least one of `title`/`description`/`detailedDescription` is required; all are optional (send only what's changing).

**Replace the cover image:**

```
PATCH /api/v1/cases/admin/overview/image
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

| Field   | Type | Required | Notes                       |
|---------|------|----------|------------------------------|
| `image` | file | Yes      | jpg, png, or webp. Max 5 MB |

Resized to 800×450 (16:9) on the server. The previous image (if any) is deleted from Cloudinary automatically.

**Response `200`:**

```json
{ "success": true, "message": "Case bank overview image updated", "data": { "imageUrl": "https://res.cloudinary.com/ddv2ukheu/image/upload/v.../overview.jpg" } }
```

---

### GET /cases/admin/all

Admin-only version of the list endpoint. Returns **all cases** including drafts, with the `createdBy` user populated.

**Auth:** Required (admin)

**Request:**

```
GET /api/v1/cases/admin/all?page=1&limit=12
GET /api/v1/cases/admin/all?page=1&limit=12&specialty=Ethics&difficulty=easy
Authorization: Bearer <token>
```

**Response `200`:** Same pagination envelope as `GET /cases`, but items include `isPublished`, `consultationType`, `stationImageUrl`, and a populated `createdBy`.

---

### GET /cases/admin/:id

Full case detail for an admin. Returns drafts as well as published cases. `createdBy` is populated with `{ _id, fullName, email }`.

**Auth:** Required (admin)

**Request:**

```
GET /api/v1/cases/admin/6659a1f2b3c4d5e6f7a8b9c0
Authorization: Bearer <token>
```

**Response `200`:** Same full case object shape as `GET /cases/:id`, with `createdBy` populated and draft cases included.

---

### POST /cases

Create a new case. Supports two formats:

- **JSON body** — for creating without images
- **Multipart form-data** — for creating with an optional cover image (`image`) and/or station image (`stationImage`) in the same request

New cases are always created as drafts unless `isPublished: true` is explicitly set.

**Auth:** Required (admin)

---

#### Option A — JSON body

```
POST /api/v1/cases
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**

```json
{
  "stationNumber": 1,
  "title": "Bleeding In Pregnancy",
  "consultationType": "Video Consultation",
  "specialty": "Gynaecology/ Women's Health",
  "difficulty": "medium",
  "isPublished": false,

  "patientData": {
    "name": "Aimee Drayton",
    "age": 28,
    "gender": "female",
    "pastMedicalHistory": ["Normal vaginal delivery 3 years ago"],
    "drugHistory": ["No Known Drug Allergy"],
    "recentConsultation": {
      "date": "2024-01-10T00:00:00.000Z",
      "seenBy": "GP Surgery",
      "role": "GP",
      "notes": "Urgent video appointment booked by patient"
    },
    "bloodTestResults": {
      "summary": "No blood tests available",
      "rows": []
    }
  },

  "patientStory": "You are Aimee Drayton, a 28-year-old female...",
  "markingScheme": [
    {
      "heading": "Data Gathering",
      "points": [
        "Asks about onset of bleeding",
        "Asks about associated pain"
      ]
    }
  ],
  "exampleExplanation": "I understand you've been experiencing some bleeding...",
  "management": [
    "Refer to Early Pregnancy Unit",
    "Arrange transvaginal ultrasound"
  ],
  "learningPoints": "## Bleeding in Early Pregnancy\n...",
  "furtherResources": [
    {
      "title": "NICE CKS – Miscarriage",
      "url": "https://cks.nice.org.uk/topics/miscarriage/"
    }
  ]
}
```

**Field Reference:**

| Field                | Type               | Required | Notes                                             |
|----------------------|--------------------|----------|---------------------------------------------------|
| `stationNumber`      | number (int ≥ 1)   | Yes      | Used for ordering; must be unique per station     |
| `title`              | string             | Yes      |                                                   |
| `consultationType`   | string             | No       | Defaults to `"Consultation"`                      |
| `specialty`          | string             | Yes      | Use an exact value from the Specialties list      |
| `difficulty`         | `easy\|medium\|hard` | No     | Defaults to `"medium"`                            |
| `isPublished`        | boolean            | No       | Defaults to `false`                               |
| `patientData`        | object             | Yes      | See PatientData schema                            |
| `patientStory`       | string             | Yes      | Markdown/plain text — role-player brief           |
| `markingScheme`      | array (min 1)      | Yes      | At least one section with at least one point      |
| `exampleExplanation` | string             | Yes      |                                                   |
| `management`         | array (min 1)      | Yes      | At least one item                                 |
| `learningPoints`     | string             | Yes      |                                                   |
| `furtherResources`   | array              | No       | Defaults to `[]`. Each item: `{ title, url }`     |

---

#### Option B — Multipart form-data (with images)

Use this when you want to attach a cover image and/or station image at creation time.

```
POST /api/v1/cases
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Form fields:**

| Field          | Type   | Required | Notes                                                        |
|----------------|--------|----------|--------------------------------------------------------------|
| `payload`      | text   | Yes      | The entire JSON body from Option A as a **string**           |
| `image`        | file   | No       | Cover/banner image. jpg, png, or webp. Max 5 MB              |
| `stationImage` | file   | No       | Station-specific image. jpg, png, or webp. Max 5 MB          |

Example using `fetch`:

```js
const formData = new FormData();
formData.append('payload', JSON.stringify(caseData));   // the full JSON as a string
formData.append('image', coverImageFile);               // File object
formData.append('stationImage', stationImageFile);      // File object

await fetch('/api/v1/cases', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: formData,
});
```

> Do **not** set `Content-Type` manually when using `FormData` — the browser sets it automatically with the correct boundary.

---

**Response `201`:**

```json
{
  "success": true,
  "message": "Case created",
  "data": { ...full case object... }
}
```

**Errors:**

| Status | Condition                                              |
|--------|--------------------------------------------------------|
| `400`  | Validation failed — response includes field-level errors |
| `400`  | Invalid `payload` JSON (multipart only)                |
| `400`  | Unsupported image type (not jpg/png/webp)               |
| `413`  | Image exceeds 5 MB limit                               |

---

### PATCH /cases/:id

Partial update — send only the fields you want to change. All fields are optional. For `patientData`, you can send just the sub-fields you want to update (e.g., only `age`) without affecting the rest of the patient record.

**Auth:** Required (admin)

**Request:**

```
PATCH /api/v1/cases/6659a1f2b3c4d5e6f7a8b9c0
Authorization: Bearer <token>
Content-Type: application/json
```

**Body examples:**

Update just the title:
```json
{ "title": "Updated Case Title" }
```

Update specialty and difficulty:
```json
{
  "specialty": "Respiratory",
  "difficulty": "hard"
}
```

Update a nested patientData field without touching other fields:
```json
{
  "patientData": {
    "age": 35
  }
}
```

Add a further resource:
```json
{
  "furtherResources": [
    { "title": "NICE CKS – Asthma", "url": "https://cks.nice.org.uk/topics/asthma/" }
  ]
}
```

> **Note:** `furtherResources` and `markingScheme` are replaced entirely when included — they are not merged. Send the full updated array.

**Response `200`:**

```json
{
  "success": true,
  "message": "Case updated",
  "data": { ...full updated case object... }
}
```

**Errors:**

| Status | Condition              |
|--------|------------------------|
| `400`  | Validation error       |
| `404`  | Case not found         |

---

### PATCH /cases/:id/image

Upload or replace the **cover image** for a case. The previous image is automatically deleted from Cloudinary.

Images are resized to 800×450 (16:9) on the server.

**Auth:** Required (admin)

**Request:**

```
PATCH /api/v1/cases/6659a1f2b3c4d5e6f7a8b9c0/image
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Form fields:**

| Field   | Type | Required | Notes                              |
|---------|------|----------|------------------------------------|
| `image` | file | Yes      | jpg, png, or webp. Max 5 MB        |

**Response `200`:**

```json
{
  "success": true,
  "message": "Case image updated",
  "data": {
    "imageUrl": "https://res.cloudinary.com/ddv2ukheu/image/upload/v.../cover.jpg"
  }
}
```

**Errors:**

| Status | Condition                          |
|--------|------------------------------------|
| `400`  | No file uploaded                   |
| `400`  | Unsupported file type              |
| `404`  | Case not found                     |

---

### PATCH /cases/:id/station-image

Upload or replace the **station image** for a case. This is a secondary image shown alongside the case station details. The previous station image is automatically deleted from Cloudinary.

Images are resized to 800×600 (4:3) on the server.

**Auth:** Required (admin)

**Request:**

```
PATCH /api/v1/cases/6659a1f2b3c4d5e6f7a8b9c0/station-image
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Form fields:**

| Field          | Type | Required | Notes                              |
|----------------|------|----------|------------------------------------|
| `stationImage` | file | Yes      | jpg, png, or webp. Max 5 MB        |

**Response `200`:**

```json
{
  "success": true,
  "message": "Station image updated",
  "data": {
    "stationImageUrl": "https://res.cloudinary.com/ddv2ukheu/image/upload/v.../station.png"
  }
}
```

**Errors:**

| Status | Condition                          |
|--------|------------------------------------|
| `400`  | No file uploaded                   |
| `400`  | Unsupported file type              |
| `404`  | Case not found                     |

---

### PATCH /cases/:id/publish

Toggles the published state of a case. If it is currently published it will be unpublished, and vice versa. No request body is needed.

**Auth:** Required (admin)

**Request:**

```
PATCH /api/v1/cases/6659a1f2b3c4d5e6f7a8b9c0/publish
Authorization: Bearer <token>
```

**Response `200`:**

```json
{
  "success": true,
  "message": "Case published successfully",
  "data": {
    "_id": "6659a1f2b3c4d5e6f7a8b9c0",
    "title": "Young Man With Hand Lesion",
    "isPublished": true
  }
}
```

The `message` will read `"Case unpublished successfully"` when toggled off.

---

### POST /cases/:id/duplicate

Creates a draft copy of an existing case. The duplicate gets:
- `title` prefixed with `"Copy of "`
- The next available `stationNumber`
- `isPublished: false` regardless of the source case
- No images (cover image and station image are not copied)

**Auth:** Required (admin)

**Request:**

```
POST /api/v1/cases/6659a1f2b3c4d5e6f7a8b9c0/duplicate
Authorization: Bearer <token>
```

**Response `201`:**

```json
{
  "success": true,
  "message": "Case duplicated as draft",
  "data": { ...full new case object... }
}
```

**Errors:**

| Status | Condition           |
|--------|---------------------|
| `404`  | Source case not found |

---

### DELETE /cases/:id

Permanently deletes a case and its associated Cloudinary images (both cover and station images). This is a hard delete — there is no recycle bin.

**Auth:** Required (admin)

**Request:**

```
DELETE /api/v1/cases/6659a1f2b3c4d5e6f7a8b9c0
Authorization: Bearer <token>
```

**Response `200`:**

```json
{
  "success": true,
  "message": "Case deleted",
  "data": null
}
```

**Errors:**

| Status | Condition       |
|--------|-----------------|
| `404`  | Case not found  |

---

## Error Responses

All errors follow this shape:

```json
{
  "success": false,
  "message": "Human-readable error message",
  "errors": [ ... ]   // present on validation errors only
}
```

### Validation errors (400)

When the request body fails validation, `errors` is an array of field-level messages:

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    { "field": "title", "message": "Title is required" },
    { "field": "patientData.age", "message": "Expected number, received string" }
  ]
}
```

### Common status codes

| Status | Meaning                                                       |
|--------|---------------------------------------------------------------|
| `200`  | Success                                                       |
| `201`  | Resource created                                              |
| `400`  | Bad request — validation error or missing required field      |
| `401`  | No token or token expired — redirect to login                 |
| `403`  | Authenticated but not an admin                                |
| `404`  | Resource not found                                            |
| `413`  | File too large (image exceeds 5 MB)                           |
| `429`  | Rate limit hit (200 req / 15 min on cases endpoints)          |
| `500`  | Internal server error                                         |

---

## Integration Notes

### 1. Token handling

Access tokens expire after **15 minutes**. When a request returns `401`, call `POST /api/v1/auth/refresh-token` with the stored `refreshToken` to get a new access token, then retry the original request.

### 2. List → Detail pattern

Do not try to render the full case from the list response — it is a lightweight projection. Always fetch the full detail via `GET /cases/:id` when the user clicks into a case.

### 3. Markdown fields

The following fields may contain markdown and should be rendered with a markdown parser (e.g., `react-markdown`):

- `patientStory`
- `exampleExplanation`
- `learningPoints`
- `recentConsultation.notes`

### 4. Blood test table

`patientData.bloodTestResults.rows` is designed to render as a table. Use `isAbnormal: true` to highlight the row (e.g., red text or background). Example columns: `test`, `result`, `referenceRange`.

### 5. Image fallback

Both `imageUrl` and `stationImageUrl` are optional. Always handle the case where they are `undefined` or `null` — show a placeholder image or skeleton.

### 6. Specialty filter URL encoding

Specialty values contain spaces and slashes (e.g., `"Elderly Medicine/ Palliative"`). When using the specialty as a URL path segment (`/cases/specialty/:specialty`), URL-encode it:

```js
const encoded = encodeURIComponent('Elderly Medicine/ Palliative');
fetch(`/api/v1/cases/specialty/${encoded}`);
```

When used as a query param (`?specialty=...`), `fetch` and `axios` handle encoding automatically.

### 7. Multipart form-data — payload field

When creating a case with images (Option B), the entire JSON body must be sent as a **string** in a field called `payload`. Do not send the JSON fields individually as separate form fields.

```js
// Correct
formData.append('payload', JSON.stringify(caseData));

// Wrong — will not work
formData.append('title', caseData.title);
formData.append('specialty', caseData.specialty);
```

### 8. Replace vs merge on array fields

`PATCH /cases/:id` merges top-level scalar fields and nested `patientData` sub-fields (dot-notation). However, **array fields** (`markingScheme`, `management`, `furtherResources`, `pastMedicalHistory`, `drugHistory`) are replaced entirely when included. Always send the full updated array, not just the new items.

### 9. Admin routes vs user routes

| Scenario                                 | Use                          |
|------------------------------------------|------------------------------|
| Browse published cases (user-facing)     | `GET /cases`                 |
| View a published case (user-facing)      | `GET /cases/:id`             |
| Browse all cases including drafts (admin)| `GET /cases/admin/all`       |
| View any case including drafts (admin)   | `GET /cases/admin/:id`       |

Regular users hitting `/cases/admin/*` will receive `403 Forbidden`.
