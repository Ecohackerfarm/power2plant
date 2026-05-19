# User Feedback Feature — Design Spec

**Date:** 2026-05-19  
**Milestone:** v0.13.0  
**Status:** Approved

## Goal

Allow anonymous users to report incorrect or broken content (data or visual/translation issues) from any page. Protect against bots and spam. Give admins a simple UI to review and resolve reports.

---

## 1. Data Model

```prisma
enum FeedbackMode   { DATA OTHER }
enum FeedbackStatus { OPEN RESOLVED DISMISSED }

model Feedback {
  id           String         @id @default(cuid())
  mode         FeedbackMode
  pageUrl      String
  entityType   String?        // "crop" | "relationship" — nearest ancestor
  entityId     String?        // id of that entity
  targetKey    String?        // data-feedback-target value (DATA mode only)
  screenshot   String?        // base64 JPEG, compressed (OTHER mode only)
  annotation   Json?          // { x, y, w, h } — relative 0–1 coords
  message      String         // mandatory for DATA, optional for OTHER
  ipHash       String         // SHA-256(ip + FEEDBACK_IP_SALT), never raw IP
  status       FeedbackStatus @default(OPEN)
  createdAt    DateTime       @default(now())
  resolvedAt   DateTime?
  resolvedNote String?

  @@index([status, createdAt])
  @@index([ipHash, createdAt])
}
```

**Screenshot storage:** base64 JPEG in DB, captured at `pixelRatio: 0.75`, quality 0.75 → ~50–200 KB per row. Migrate to object storage if volume grows.

---

## 2. Spam Protection

Three gates, checked in order on every submission (fail fast):

| Gate | Mechanism | On fail |
|------|-----------|---------|
| Honeypot | Hidden `<input name="website" />` must be empty | 200 OK (silent drop) |
| Rate limit | 20 submissions / IP / hour — query `Feedback` by `ipHash` + `createdAt > now()-1h` | 429 |
| Validation | `message` min 3 / max 2000 chars (mandatory for DATA, optional for OTHER — if provided must meet min/max); screenshot max 300 KB base64 | 400 |

IP hashing: `SHA-256(rawIp + process.env.FEEDBACK_IP_SALT)`. Salt is a static secret in env — hashes are pseudonymous and not linkable across deployments without the salt.

---

## 3. API Routes

### `POST /api/feedback` — public, anonymous

Request body:
```ts
{
  mode: "DATA" | "OTHER"
  pageUrl: string
  entityType?: string
  entityId?: string
  targetKey?: string       // DATA mode
  screenshot?: string      // OTHER mode, base64
  annotation?: { x: number; y: number; w: number; h: number }  // relative 0–1
  message: string
  website: string          // honeypot, must be empty
}
```

Responses: `201` success · `400` validation · `429` rate limited

### `GET /api/admin/feedback` — admin only

Query params: `status`, `mode`, `page`, `limit`  
Auth: session email must be in `ADMIN_EMAILS` env var (comma-separated). Returns 403 otherwise.

### `PATCH /api/admin/feedback/[id]` — admin only

```ts
{ status: "RESOLVED" | "DISMISSED", resolvedNote?: string }
```

---

## 4. Frontend Components

### Feedback icon in global nav header

Single `<FeedbackButton />` instance lives in the global nav header (introduced in issue #125). Available on every page. Small flag/alert icon — clearly visible, not floating.

### Modal flow

```
Flag icon click
  → Modal: "What's wrong?"
      [Data — something incorrect]    [Other — visual / translation]
           ↓                                       ↓
   Modal hides                        html-to-image captures viewport
   Page enters selection mode         Screenshot shown in modal
                                      User drags to draw one rectangle
   Desktop:                           Optional text field
     Hover → border on                Submit
     data-feedback-target elements
     Click → element captured

   Mobile:
     Tap once → highlights element
                (hint: "tap again to confirm")
     Tap again → confirmed

   Modal returns with context filled
   Mandatory text field
   Submit
```

### Element targeting (DATA mode)

Pages are instrumented with `data-feedback-target` and `data-entity-type` / `data-entity-id` attributes. On selection, the component walks up the DOM tree to find the nearest entity anchor.

**Crop detail page targets:**
- `crop:name`, `crop:image`, `crop:description`
- `crop:companions`, `crop:antagonists`, `crop:growing-info`

**Relationships page targets:**
- `relationship:<id>` on each relationship card

**Other pages:** no `data-feedback-target` elements → DATA mode element selection finds nothing → fallback: user can still submit with text only, `targetKey` will be null.

### Screenshot capture (OTHER mode)

Library: `html-to-image` (MIT, actively maintained).  
Settings: `pixelRatio: 0.75`, JPEG quality `0.75`.  
Annotation: custom React canvas overlay on top of captured image — user drags to draw one rectangle. Coordinates stored as relative (0–1) values.

---

## 5. Admin UI — `/admin/feedback`

- Next.js server component — reads session + `ADMIN_EMAILS` at render time, redirects to `/` if unauthorized
- Table columns: date · mode · page · target / screenshot thumbnail · message · status badge
- Resolve / Dismiss buttons → `PATCH` endpoint → optimistic status update
- Filter by status (OPEN / RESOLVED / DISMISSED) and mode (DATA / OTHER)

### Admin link in nav header

When a logged-in user's email is in `ADMIN_EMAILS`, the global nav header shows an "Admin" link to `/admin/feedback`. Resolved server-side: root layout reads session + env var, passes `isAdmin: boolean` to header component. No client-side env var exposure.

---

## 6. New Environment Variables

| Variable | Description |
|----------|-------------|
| `FEEDBACK_IP_SALT` | Static secret for IP hashing |
| `ADMIN_EMAILS` | Comma-separated admin email allowlist |

---

## 7. Dependencies

| Package | Use | License |
|---------|-----|---------|
| `html-to-image` | DOM-to-JPEG capture (OTHER mode) | MIT |

No other new dependencies. Rate limiting is query-based (no Redis needed at this scale).

---

## 8. Out of Scope

- Categorized feedback types (only free text for now)
- Email/webhook notifications on new feedback
- Per-feedback-target analytics
- Object storage for screenshots (DB is sufficient at current scale)
