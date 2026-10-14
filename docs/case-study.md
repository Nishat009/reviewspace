# ReviewSpace: case study

ReviewSpace is a design review and approval tool. A designer uploads a screenshot, the client clicks the exact spot that needs work and leaves a comment, the designer replies and uploads V2, and the client approves that specific version.

This document covers the decisions behind it: how pins are positioned, where permissions are enforced, how realtime survives disconnects, why approval is tied to a version, and what was traded off.

## 1. Pins that stay put

A pin is stored as a position relative to the image, never in screen pixels:

```ts
type AnnotationPosition = { x: number; y: number }; // 0–1 on both axes
```

The tricky part is turning a click into that position while the image is zoomed, panned and letterboxed inside its viewport. The editor doesn't track the transform itself. It asks the browser where the image actually is on screen:

```ts
// lib/annotation.ts
const rect = image.getBoundingClientRect(); // already includes zoom, pan and centring
const x = (event.clientX - rect.left) / rect.width;
const y = (event.clientY - rect.top) / rect.height;
if (x < 0 || x > 1 || y < 0 || y > 1) return null; // empty space: no pin
```

To render a pin, the editor places it at `left: x * 100%; top: y * 100%` inside the image's own box (the box that gets zoomed). It is wrapped in a counter-scaled container, so it keeps the same on-screen size at 25% and at 400%.

Some details that matter in use:

- **Explicit modes.** In *View* mode a drag pans and a click never creates a pin. In *Comment* mode panning is off and a click places a pin. A press-and-move beyond 4 px is treated as a drag.
- **Drafts are never lost.** The draft pin and its text live in a small Zustand store. A failed submit keeps both, and leaving the page or switching versions with unsent text asks first.
- **The database checks the coordinates too:** `CHECK (x BETWEEN 0 AND 1 AND y BETWEEN 0 AND 1)`.

Tests: unit tests feed the same image point through five different zoom, pan and window transforms and expect the same stored position (`annotation.test.ts`). A Playwright test then creates a pin, zooms in and resizes the window, and checks that the pin tip stays on the same image point.

## 2. Where permissions are enforced

Hiding a button isn't access control, so every request is authorized on the server, in layers:

| Layer | Job |
| --- | --- |
| `proxy.ts` | Sends signed-out users to sign-in. A convenience, not a boundary. |
| `getCurrentUser()` | Re-reads the user on every request; rejects revoked sessions (`sessionVersion`). |
| `lib/authz/permissions.ts` | The role matrix as pure functions, tested row by row. |
| `server/access.ts` | One place that answers "can this actor see this project, version or thread, and what may they do there?" Every service call starts here. |
| Realtime | Channels are authorized when the stream opens, re-checked every 20 s and immediately on access changes. Team-only events are filtered per subscriber. |
| Postgres | Composite foreign keys make cross-workspace rows impossible. Partial unique indexes and triggers enforce the business rules below. |

The actor is either a **member** (a signed-in user with a workspace role) or a **guest** (a share-link visitor). Both go through the same `authorizeVersion` and `authorizeThread`. A guest's view is fixed: public threads only, no uploads, never approval.

Two choices worth calling out:

- **404, not 403, across tenants.** A project in someone else's workspace and a project that doesn't exist return the same response, so nobody can probe which exist.
- **Internal threads don't exist for clients.** They aren't just hidden in the UI. The API omits them, fetching one returns 404, replying returns 404, realtime events about them are never sent to clients, and @mention suggestions on an internal thread exclude clients. The integration test `internal comments never reach a client` checks all five.

## 3. Realtime that survives disconnects

Realtime uses Server-Sent Events: one stream per browser tab, shared by every component through a small provider. Two decisions keep it simple and safe.

**Events are invalidation hints, not data.** An event says "thread X on version Y changed". The client then refetches through the normal, permission-checked API. So:

- the database is the only source of truth;
- private content never travels over the stream (an event carries ids and nothing else);
- a duplicate or out-of-order event is harmless, because it just triggers another refetch. Event ids are de-duplicated anyway.

**Reconnect means resync.** `EventSource` reconnects automatically. When it does, the provider sends every subscriber a `resync`, and they refetch threads, comments and review state. Anything posted while the viewer was offline appears. A Playwright test covers this: it takes the client offline, the designer comments, the client comes back online, and the comment appears.

Optimistic updates and server events never produce a duplicate comment. The optimistic thread or comment carries the same `clientMutationId` the server stores, and the refetched list replaces the optimistic copy.

Fan-out has two drivers. In-memory works for one server. Postgres `LISTEN/NOTIFY` lets several instances share events. Presence ("Sara is viewing") uses the same channel with heartbeats and expiry.

## 4. Approval belongs to a version

A version's review state follows a small, explicit state machine (`lib/review-state.ts`):

```
DRAFT → IN_REVIEW → APPROVED
          │   ↑
          ↓   │ (request again)
   CHANGES_REQUESTED
```

The rules:

- **One designated approver per review.** They are chosen when the review is requested, must have access to the project, and are re-checked when they decide.
- **Approving V2 says nothing about V3.** A new version starts as a draft with no comments. V1's comments stay on V1, because the design under them may have moved. The editor links to earlier versions' unresolved comments instead of copying them forward.
- **Resolving comments is separate from approving.** A version can be approved with open threads, and resolving every thread approves nothing.
- **Decisions are history.** `review_decisions` is append-only (a trigger blocks `UPDATE`). Once a version is approved its file is immutable (another trigger), so "who approved what, when" always points at the exact pixels.
- **Concurrent decisions resolve cleanly.** The request and the version move with conditional updates (`WHERE status = 'OPEN'` / `WHERE reviewState = 'IN_REVIEW'`) in one transaction. When two conflicting decisions arrive together, exactly one wins and the other gets a clear conflict. A partial unique index allows only one open review per version.
- **Holding a share link is not enough to approve.** Approval needs an identifiable, signed-in reviewer.

## 5. Uploads

Uploads take three steps, so large files never pass through the app server:

1. **Reserve.** The server checks permissions, creates a `PENDING` version and returns a one-time signed upload URL.
2. **Upload.** The browser PUTs the file straight to private storage, with progress shown.
3. **Finalize.** The server downloads what actually arrived and checks it: the real format must be PNG, JPEG or WebP (read from the bytes, not the browser's claim), within the size and dimension limits. It then makes a thumbnail and assigns the next version number under a row lock. Anything invalid is deleted and the version is marked `FAILED`.

A failed upload can be retried without creating a duplicate asset. Abandoned uploads are cleaned up by a scheduled job. Images are only ever served through short-lived signed URLs, issued after an access check.

## 6. Trade-offs

| Decision | Why | Cost |
| --- | --- | --- |
| Next.js server actions and route handlers, no separate backend | One codebase and one deploy; a service layer keeps the business rules testable | API shape is tied to the app |
| SSE instead of WebSockets or a managed realtime service | Plain HTTP, authorized with the same session or share token, easy to reason about | One open connection per tab; HTTP/1.1 limits connections per origin (fine on HTTP/2) |
| Events carry ids only | No private data on the stream; duplicates are harmless | One extra fetch per update |
| Point annotations only | The core workflow first | No rectangles, arrows or drawing yet |
| One approver per review | Clear accountability | No "all must approve" rule yet |
| Archive instead of delete for projects | History stays intact | Workspace deletion is the only hard delete |
| Share-link guests as lightweight users | Comments keep one author model and idempotency key | Guest rows to clean up when a workspace is deleted (handled) |
| In-memory rate limiting | No extra infrastructure | Needs Redis for multiple instances |

## 7. What is tested

- **Unit (Vitest, 105 tests):** pin math under zoom, pan and resize; the role matrix; the review state machine; mention parsing (including that HTML stays inert); realtime filtering; token handling; redirect safety; slugs.
- **Integration against Postgres (29 tests):**
  - workspace isolation
  - clients can't upload or manage members
  - internal comments never reach a client
  - V1 comments stay on V1
  - unique version numbers under concurrent uploads
  - a new version doesn't inherit approval
  - only the designated approver decides
  - conflicting decisions: exactly one wins
  - a double-clicked submit creates one comment
  - reply notifications
  - revoked and expired share links stop working
  - plus the schema constraints and triggers
- **End-to-end (Playwright, 6 tests):**
  - the full two-browser walkthrough: upload, pin, live update, reply, resolve, V2, request review, compare, approve, activity
  - missed comments arriving after a reconnect
  - pins staying put after zoom and resize
  - client access limits
  - cross-account 404
  - share-link revocation, and that guests can't approve

## 8. Known limitations

- Live cursors, rectangle and arrow annotations, multiple approvers and automated pixel diffs are deliberately out of scope for this release.
- Rate limiting is in-memory.
- The local storage driver is for development; production uses Supabase Storage.
- The Postgres realtime driver is needed for multi-instance hosting. The default in-memory driver assumes one server.
