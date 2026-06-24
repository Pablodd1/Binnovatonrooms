## 2025-06-24 - Accessible File Input
**Learning:** `display: none` on file inputs breaks accessibility and removes the element from keyboard tabbing order completely.
**Action:** When styling custom file inputs or upload buttons, always use `.sr-only` or visually-hidden CSS techniques to hide the native input, and ensure the parent wrapper or label can relay the `:focus-visible` state.
