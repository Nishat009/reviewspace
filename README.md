# ReviewSpace

Collaborative design review and client approval. Designers upload screenshots, clients pin comments to exact spots on the image, the team ships new versions, and a designated approver signs off on a specific version.

Built for agencies, freelancers and product teams. The case study in [docs/case-study.md](docs/case-study.md) explains the main design decisions.

## Features

- **Workspaces and roles**: owner, admin, member, client reviewer. Each user can be in several workspaces with a different role in each. Members and clients only see projects they're assigned to.
- **Projects**: create, edit, archive and restore, search, status filter, grid or list view, people and access, activity history.
- **Assets and versions**: drag-and-drop or file-picker upload straight to private storage, with progress and retry. The server validates and thumbnails every file. A change is always a new version (V1 → V2 → V3) and never replaces an old one.
- **Review editor**: zoom, pan, fit and 100%, with explicit *View* and *Comment* modes. Pins are stored in normalized image coordinates, so they stay on the same spot at any zoom, window size or device. It has threads, replies, edit and delete own comments, resolve and reopen, open/resolved filters, @mentions, emoji reactions, image attachments, and internal team-only threads. Keyboard shortcuts: `V`, `C`, `P`, `+`, `-`, `0`, `J`, `K`, `Esc`.
- **Approval**: the team picks one designated approver and requests a review. Only that person can approve or request changes. Decisions are append-only and recorded per version, and a new version never inherits an approval.
- **Realtime**: comments, replies, resolutions and decisions appear without a refresh. The editor shows who else is viewing and a connection indicator. After a reconnect the client refetches what it missed.
- **Notifications**: in-app (unread count, mark read, deep links to the exact version and thread) and email, with per-type email preferences. You are never notified about your own actions.
- **Version comparison**: side by side with synced zoom, or an overlay slider. Different image sizes are flagged.
- **Sharing**: email invitations (to the workspace or straight into one project) that you can resend and revoke, and that expire. Share links can be view-only or allow comments, with an optional expiry and password, and can be revoked. Share-link guests comment under a name but can never approve.
- **Account**: profile and avatar, password change, sign out everywhere, optional Google sign-in.

## Stack

| Layer | Choice |
| --- | --- |
| App + API | Next.js 16 (App Router, Server Actions, Route Handlers), TypeScript |
| UI | Tailwind CSS 4, shadcn/ui (Radix), react-zoom-pan-pinch |
| Client state | TanStack Query for server data, Zustand for editor state |
| Database | PostgreSQL + Prisma 7 (`@prisma/adapter-pg`) |
| Auth | Auth.js v5 (credentials + optional Google, JWT sessions) + own authorization layer |
| Forms | React Hook Form + Zod (same schemas on client and server) |
| Storage | Supabase Storage (private bucket, signed URLs), or local disk in development |
| Realtime | Server-Sent Events; in-memory fan-out, or Postgres LISTEN/NOTIFY across instances |
| Images | sharp (validation, thumbnails, avatars) |
| Email | Resend (printed to the console in development) |
| Tests | Vitest (unit + Postgres integration), Playwright (end-to-end), Storybook |
| CI | GitHub Actions |

## Getting started

```bash
pnpm install
cp .env.example .env            # then fill AUTH_SECRET (see comment in the file)

pnpm db:dev                     # local Postgres via `prisma dev` (no Docker needed)
#   copy the printed TCP URL into DATABASE_URL and set DATABASE_POOL_MAX="1", then:
pnpm db:migrate
pnpm db:seed                    # optional demo data (see below)

pnpm dev                        # http://localhost:3000
```

Without Supabase credentials, uploads are stored under `.storage/` and served through signed, expiring `/api/storage/*` URLs. To use Supabase, set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, then run `pnpm storage:setup` once to create the private bucket.

`prisma dev` serves one database connection at a time. That's why `.env` sets `DATABASE_POOL_MAX="1"` for it, and why `pnpm db:studio` opens Prisma Studio with a single connection.

### Demo data

`pnpm db:seed` creates the **Travel Website Redesign** project in a "Northwind Studio" workspace. The password for all three accounts is `reviewspace-demo`:

| Account | Role |
| --- | --- |
| `owner@demo.reviewspace.test` | Agency owner |
| `designer@demo.reviewspace.test` | Designer (member) |
| `client@demo.reviewspace.test` | Client reviewer, with Homepage V3 waiting for their approval |

The seed covers three Homepage versions and two Checkout versions, open and resolved comments, an internal thread, a changes-requested version and an approved version. Re-running it replaces only the demo workspace and the demo users.

### Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` / `pnpm build` / `pnpm start` | Run, build, serve |
| `pnpm typecheck` | Generates route types, then `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm test` | Unit tests: pin math, permission matrix, review state machine, mentions, tokens, redirects |
| `pnpm test:db` | Integration tests against `TEST_DATABASE_URL` (must be a separate database) |
| `pnpm test:e2e` | Playwright, two-browser flows (re-seeds demo data; starts `pnpm dev` if nothing is running) |
| `pnpm storybook` / `pnpm build-storybook` | Component docs |
| `pnpm db:migrate` / `pnpm db:seed` / `pnpm db:studio` | Database |
| `pnpm uploads:cleanup` | Removes abandoned and failed uploads (also available as `GET /api/cron/cleanup` with `Authorization: Bearer $CRON_SECRET`) |

`prisma dev` routes every database name to the same instance, so the test database needs its own server: `npx prisma dev --name reviewspace-test --detach`. The test setup refuses to run if it detects that it points at the app database.

## Architecture

```
src/
  app/
    (auth)/        sign-in/up, reset, verify, invitation pages
    (app)/         onboarding, notifications, account, /w/[slug] (shell + full-screen editor)
    s/[token]/     share-link review (public, token-authenticated)
    api/           realtime SSE, read endpoints for TanStack Query, local storage, cron
    actions/       server actions (mutations), grouped by area
  components/      UI: review editor, uploads, projects, members, realtime provider
  lib/             pure helpers: pin math, review state machine, mentions, validation, storage, signed tokens
  server/          service layer: access (authorization), projects, assets, comments, reviews,
                   members, share links, notifications, realtime
prisma/            schema, migrations (incl. hand-written SQL constraints), seed
tests/db/          Postgres integration tests
e2e/               Playwright tests
```

Every mutation follows the same path: **validate input → authenticate → authorize → business rule → write (one transaction) → side effects after commit (notifications, email, realtime)**.

### Where permissions are enforced

1. **`proxy.ts`** only redirects signed-out users. It is a convenience, not a security boundary.
2. **`getCurrentUser()`** re-reads the user from the database on every request and rejects sessions whose `sessionVersion` is stale. Password changes and resets bump it.
3. **`lib/authz/permissions.ts`** is the role matrix as pure functions, tested row by row.
4. **`server/access.ts`** resolves the actor (member or share-link guest) against a project, version or thread. Every service call goes through it. A missing resource and a forbidden one both return the same 404, and internal threads don't exist for clients.
5. **Realtime** channels are authorized on subscribe and re-checked periodically and on access changes. Team-only events are filtered per subscriber.
6. **The database** is the last line of defence (below).

### Data integrity in the schema

- Child rows reference their parent through a composite key `(id, workspaceId)`, so Postgres rejects anything that points across workspaces.
- Hand-written SQL adds:
  - one pending invitation per email per workspace
  - one open review per version
  - normalized pin coordinates (`CHECK`)
  - a trigger that makes a finalized version's file immutable
  - append-only review decisions
  - guest identities that can never have a password
- `clientMutationId` unique keys make a double-clicked or retried submit a no-op.
- Version and pin numbers come from row-locked counters, so concurrent uploads never share a number.

### Auth details

- Passwords use argon2id (OWASP parameters). Unknown emails still run a hash, so response timing doesn't reveal which accounts exist.
- Verification, reset and invitation tokens are 256-bit random values. Only their SHA-256 hash is stored, and each can be used once.
- Email verification and invitation acceptance need a click (POST), so email link scanners can't use them up.
- `callbackUrl` only accepts same-origin paths.
- Sign-in, sign-up, reset, comments, uploads, invitations and share-link passwords are rate limited. The limiter is in-memory, so swap in Redis for multi-instance hosting.

## Deployment notes

- **Vercel + Supabase**: set `DATABASE_URL` (pooled), `SUPABASE_*`, `AUTH_SECRET`, `APP_URL` and `RESEND_API_KEY`.
- **More than one instance**: set `REALTIME_DRIVER=postgres` and point `REALTIME_DATABASE_URL` at a direct (non-pooled) connection for `LISTEN`.
- **Cleanup**: schedule `GET /api/cron/cleanup` (e.g. Vercel Cron) with `CRON_SECRET`.
# reviewspace
