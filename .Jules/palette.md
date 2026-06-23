## 2024-06-22 - Missing ARIA label on photo selection thumb button
**Learning:** The photo thumbnail buttons lacked text or `aria-label`s, only showing numbers and grades, missing context for screen readers. Using existing class utilities is better than adding new CSS to solve focus issues.
**Action:** Always verify icon-only buttons have an `aria-label` for screen reader accessibility. Check existing CSS classes instead of adding custom CSS.
