# Test report — 2026-10-15

Environment: Windows, Node.js 24.18.0, installed pnpm dependencies.

| Check | Final result |
| --- | --- |
| Unit tests | 110 passed across 9 files |
| Database integration tests | 29 passed across 2 files, including fixture cleanup |
| ESLint | Passed |
| TypeScript / Next route generation | Passed |
| Production build | Passed |
| Storybook build | Passed without the previously reported warnings |
| Built Storybook smoke test | All 14 stories rendered without JavaScript errors |
| Chromium E2E | All 6 passed; normal exit code 0, including teardown |
| Isolation guard | Explicitly pointing E2E at the app database was rejected |

Browser coverage: client permissions and internal thread privacy, cross-workspace access, share-link revocation and guest approval restrictions, offline reconnect, pin coordinates after zoom and resize, and the two-browser upload/comment/reply/resolve/version/compare/approval flow.

## Fixes and limits

- Prisma shares one client/pool across production route bundles. The final production browser run reported no `08P01` / `P2039` errors. E2E now fails if those errors or unexpected API errors appear in server logs.
- E2E aligns APP_URL automatically, owns a fresh local production server directly, and closes it without the Windows shell/taskkill path. Existing servers are never reused.
- E2E uses E2E_DATABASE_URL or TEST_DATABASE_URL, refuses the app database, and verifies the server-selected database. CI creates a separate E2E database.
- E2E cleans its seeded workspaces/users, unique outsider account, and temporary uploads on teardown. Integration tests track and delete only fixture ids created by their worker. Previously accumulated fixtures are not broadly deleted.
- Storybook splits vendor/runtime chunks. Only browser-irrelevant `use client` notices are filtered. The indivisible ~812 kB Storybook runtime has a documented 900 kB warning threshold. Profiling timing notices are disabled. All built stories were browser-tested.
- E2E uses explicit console email transport and never sends live email. Five new email tests cover provider success/rejection, network failure, console transport, configured links, and HTML escaping.
- Live Resend delivery and hosted Supabase storage still need valid provider credentials; neither is claimed as verified. Local uploads and mocked email provider behavior passed.

README and .env.example document configuration. PowerShell uses pnpm.cmd without changing execution policy. Run `pnpm.cmd build` before `pnpm.cmd test:e2e`, and `pnpm.cmd build-storybook` before `pnpm.cmd test:storybook`. Do not run database suites concurrently against the same test database.
