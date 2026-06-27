## 2024-06-27 - Global Focus-Visible Styles
**Learning:** Next.js development server generates a dirty `next-env.d.ts` state. When verifying UX frontend changes locally with Playwright and a running dev server, be careful to revert `next-env.d.ts` before committing, as it causes CI failures.
**Action:** Always run `git checkout next-env.d.ts` or `git restore next-env.d.ts` after spinning up the dev server for UI verification and before submitting a PR.
