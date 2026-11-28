# Eqence agent status

## Last run
Started 2026-11-28 14:36 Muscat (UTC+4), finished 2026-11-28 14:48 Muscat. Status: FINISHED.
First recorded run (no earlier status file existed).

### Audited
- pnpm install, type check (client and server), build, tests: all clean on main 58bb7ba. 70 tests before this run, 86 after.
- No lint script exists in the repo (only prettier `format`).
- API security read through: Better Auth with email verification, 2FA lockout, rate limits; every /api/v1 route needs a session;
  /api/v1/admin/* needs admin role, 2FA and our Origin on writes; CRM and data routes are tenant scoped; Hub and Judge.me
  webhooks verify signatures and fail closed; public chat and demo are rate limited with daily caps; client IP from X-Real-IP only.
  No exposed secrets found in tracked files (a `.env.local` exists in the working copy and was not read).
- Live: www.eqence.com serves /, /pricing, /faq, /about, /contact, /demo, /blog, /app, robots.txt, sitemap.xml, llms.txt (all 200).
  /api/waitlist (Vercel function) answers (405 on GET, as designed).
- api.eqence.com does not answer (connection timeout). Consistent with the paused Alibaba server csb-fra.
  Live effect: sign up, sign in, the dashboard, the site assistant, the demo and the blog list cannot work until it is back.

### Fixed and merged (merge commits, code only)
- PR #2 `agent/20261128-api-unreachable`: the client `api()` helper showed visitors the browser's raw "Failed to fetch" or a
  JSON parse error when the API is down or a proxy returns an HTML error page. Now a plain "We could not reach Eqence just now"
  message. 8 tests with stubbed fetch. Merged as 9859ac2.
- PR #3 `agent/20261128-waitlist-tests`: 8 tests for `api/waitlist.ts` (validation, honeypot, escaping, subject header
  injection, missing key, Resend failure), fetch stubbed. Placed in `test/` because Vercel deploys every file in `api/`. Merged as c229e16.

### Verified live
- Vercel project `eqence` deploys production from main. Latest READY production deployment is still 58bb7ba.
- The two merges above did NOT trigger a Vercel build (checked for about 10 minutes). Every earlier deployment was created
  under Fathi's account, so Vercel likely builds only pushes it can tie to a team member. The live site is unchanged and healthy.

### Open pull requests
- None opened by the agent. Old remote branches with no open PR: feat/outreach-unsubscribe, fix/function-and-tap,
  fix/site-claims, fix/videos-wait-for-setting, merge/engine (left untouched).

### Needs Fathi
1. api.eqence.com is down because csb-fra is paused. Nothing in the app beyond the static pages and the waitlist works live
   until it is restored. Agent will not touch it.
2. Vercel did not build main after the agent merges (9859ac2, c229e16). Either redeploy main in the Vercel dashboard or check
   the project's Git settings so pushes from the agent build. Until then PR #2 is merged but not live.
3. The GitHub repo homepage field points at https://eqence-enterprise.vercel.app, which returns DEPLOYMENT_NOT_FOUND.
   Consider changing it to https://www.eqence.com (repo setting, not changed by the agent).
4. Supabase organization unpaid: recorded as blocked; no action taken.

### Next steps for the next run
1. Check whether Vercel has built 9859ac2 or later; if so, verify the live pages and that sign in shows the new message while the API is down.
2. `POST /api/v1/connections/:id/sync` passes an unchecked id to a uuid column, so a malformed id is a 500 instead of 404;
   add a uuid check like crm.ts uses, with a test (apps/api/test-int has the integration harness).
3. Connection routes (`/api/v1/connections*`) lack the `fromOurSite` origin check that crm.ts write routes use; add it for consistency.
4. Read README.md and docs/intended-schema.md against the code for advertised but missing features.
5. Add a lint script (no ESLint config exists) or at least a `prettier --check` step.
6. Bundle is 556 kB in one chunk; code split the /app routes.
