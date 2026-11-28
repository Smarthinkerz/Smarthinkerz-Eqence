# Eqence agent status

## Last run
Started 2026-11-28 20:36 Muscat (UTC+4), finished 2026-11-28 20:46 Muscat. Status: FINISHED.

### Audited
- main 354a87b and later: pnpm install, type check, build and 86 unit tests all clean. No lint script (unchanged).
- Integration suite (apps/api/test-int, 66 tests) run for the first time by the agent, against a local throwaway Postgres 16.
  On a clean main 16 failed, all because the required test settings were not documented (rate limit, price ladder,
  partner secret, FILE_DIR). With them, 66 of 66 pass. No real third party service is called (Judge.me and AI stubbed).
- Found: malformed ids on connection, draft and reply routes returned 500; writes on those routes and on brand voice
  had no same-site Origin check (CRM, account and admin routes already had one).
- Public copy in client/src and the prerender: no em or en dash characters in customer facing strings.
- Live: www.eqence.com /, /pricing, /faq, /about, /contact, /demo, /blog, /app, robots.txt, sitemap.xml, llms.txt all 200.
  api.eqence.com still does not answer (csb-fra paused).

### Fixed and merged (merge commits, code only)
- PR #4 `agent/20261128-route-guards`: uuid check (404) and same-site Origin check (403) on /api/v1/connections/*,
  /interactions/:id/draft, /responses/:id* and PUT /brand-voice. Integration test proves 500 before, 404/403 after, and
  that a refused write changes nothing. Merged as 033b3bd. Takes effect at the next API server deploy.
- PR #5 `agent/20261128-test-int-script`: `pnpm --filter ./apps/api test:int` (apps/api/scripts/test-int.sh) runs the
  integration suite with its test-only settings against DATABASE_URL. Merged as 354a87b.
- PR #6 `agent/20261128-split-app-bundle`: app and admin pages lazy loaded; main script 556 kB to 371 kB. Browser check
  of /, /faq, /app/sign-in, /app, /app/admin and a 404 path with no page errors. Merged as 9d3b7ac.

### Verified live
- Vercel project `eqence` production is still 58bb7ba (created by Fathi). No deployment was created for any agent push
  (9859ac2, c229e16, 033b3bd, 354a87b, 9d3b7ac). Live site unchanged and healthy; PRs #2 and #6 are merged but not live.

### Open pull requests
- None. Old remote branches with no open PR left untouched: feat/outreach-unsubscribe, fix/function-and-tap,
  fix/site-claims, fix/videos-wait-for-setting, merge/engine.

### Needs Fathi
1. api.eqence.com is down because csb-fra is paused. Sign up, sign in, the dashboard, the site assistant, the demo and the
   blog list cannot work live until it is back. Agent will not touch it. PR #4 needs an API deploy once it is back.
2. Vercel does not build agent pushes to main. Redeploy main (now 9d3b7ac) in the Vercel dashboard, or check the
   project's Git settings so commits from the agent build. Until then PRs #2 and #6 are not live.
3. GitHub repo homepage field points at https://eqence-enterprise.vercel.app (DEPLOYMENT_NOT_FOUND). Consider
   https://www.eqence.com.
4. Supabase organization unpaid: recorded as blocked; no action taken.
5. Before the API deploy: confirm the production WEB_ORIGINS lists every site origin the app is used from (for example a
   beta origin), since PR #4 now refuses writes from any other origin, as CRM and account writes already did.

### Next steps for the next run
1. Check Vercel for a build of 9d3b7ac or later; if live, verify the public pages, /app loading its chunk, and the
   "could not reach Eqence" message on sign in while the API is down. Revert at once if anything breaks.
2. Add a lint step: ESLint flat config for client and apps/api (or `prettier --check` as a first step) and a `lint` script.
3. README.md is still the generic template scaffold text, not Eqence; write a real README (what it is, workspace layout,
   how to run, test, test:int, migrate) with no claims beyond what the code does.
4. Read docs/intended-schema.md against the code for advertised but missing features.
5. Add unit tests for client pages with logic but no tests (Connections, BrandVoice forms) where practical.

## Previous run
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
