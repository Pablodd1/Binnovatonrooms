# AGENTS.md — Mandatory Agent Rules for BuildScan AI

All AI agents working in this repository MUST read and apply these rules on every
task. The skills referenced below are installed in `.agents/skills/` and pinned in
`skills-lock.json`. They are not optional.

## Rule 1 — GitHub Open Code Review & Verification (always apply)

Source skills: `code-review`, `autofix` (coderabbitai/skills)

- **Pre-commit diff check:** review the full `git diff` before every commit. Never
  commit code you cannot explain line by line.
- **Zero secret exposure:** no API keys, tokens, connection strings, or passwords
  in code, commits, logs, or test fixtures. Secrets live only in Vercel/GitHub
  environment variables and secrets. If a secret appears in a diff, stop and
  rotate it before proceeding.
- **Security audits:** check new dependencies for advisories (`npm audit`), check
  new endpoints for auth/validation/rate-limiting appropriate to their risk, and
  check any HTML/JSX rendering of model or user output for injection.
- **Build gates:** `npx tsc --noEmit`, `npm run lint`, `npm test`, and
  `npm run build` must all pass before a change is considered done. A change that
  is not verified is not finished.
- **Clean commits:** one logical change per commit, imperative subject line, body
  explaining root cause (not just symptoms). Never mix feature work with
  debugging debris, stray files, or unrelated-project changes.
- **Workspace hygiene:** this workspace intentionally contains unrelated project
  folders (ignored in `.gitignore` and `.dockerignore`, excluded in `tsconfig.json`).
  Never commit them, never install their dependencies into this `package.json`.

## Rule 2 — Modern Web Quality & React Best Practices (always apply)

Source skills: `vercel-react-best-practices`, `vercel-composition-patterns`,
`vercel-optimize`, `web-design-guidelines` (vercel-labs/agent-skills) and
`seo`, `performance`, `accessibility`, `core-web-vitals`,
`web-quality-audit`, `best-practices` (addyosmani/web-quality-skills)

- **Waterfall elimination:** no sequential awaits for independent work — use
  `Promise.all`. No client-side fetch chains that could be a single server
  response. No waterfall of dependent effects when a derived value suffices.
- **Bundle optimization:** keep the client bundle lean; prefer server components
  and dynamic imports for heavy client-only code (camera, charts); tree-shake
  icon imports; measure before and after any "optimization."
- **Technical SEO:** every public page has a unique title and description;
  canonical URLs use trailing slashes consistently; `robots.txt` and sitemap
  stay in sync with real routes. (This app is currently `noindex` by design —
  keep it that way until it is ready for public indexing.)
- **WCAG 2.2 accessibility:** semantic HTML, labeled form controls, icon-only
  buttons carry `aria-label`, color is never the only signal, hit targets are
  at least 44px, and focus order is logical. New UI must be usable with
  keyboard and screen reader.
- **Core Web Vitals:** LCP < 2.5s, INP < 200ms, CLS < 0.1. Images get explicit
  dimensions; fonts don't cause layout shift; long tasks are broken up.

## Monitoring contract

- `scripts/jev-audit.mjs` audits key routes and classifies failures with Jev
  (System-1, `jev-latest`) — heuristics take over if the API key is absent.
- `.github/workflows/jev-monitor.yml` runs it every 6 hours, on push to
  main/master, and on demand. Required secrets: `TYPESAFE_API_KEY`,
  `RESEND_API_KEY`, `NOTIFICATION_EMAIL` (optional `ALERT_WEBHOOK_URL`),
  plus repo variable `BASE_URL`.
- When adding a route that defines availability, add it to `ROUTES` in
  `scripts/jev-audit.mjs`.

## Verification checklist (run before declaring any task done)

1. `npx tsc --noEmit` — zero errors
2. `npm run lint` — zero errors/warnings
3. `npm test` — all pass
4. `npm run build` — succeeds
5. `git status` — only intended files staged; no foreign-project files
6. Live verification after deploy: `curl /api/health`, and for user-facing
   changes, one real request through the affected flow
