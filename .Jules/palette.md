## 2025-03-08 - Keyboard Accessibility Baseline
**Learning:** Found that this Next.js app lacked fundamental keyboard focus styles globally (`:focus-visible`), and core UI components like the file upload button were inaccessible to screen readers because of `display: none` on the input.
**Action:** When working on apps without a robust design system, first ensure global `:focus-visible` styles exist for interactive elements, and use visually hidden techniques (clip/overflow) instead of `display: none` for file inputs.
