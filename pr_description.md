🎯 **What:** The testing gap addressed
The `normalize` function in `src/lib/installer-match.ts` had no unit tests. Additionally, the tests for `specialtyAliases` from the same file were incorrectly placed inside `__tests__/analytics.test.ts`.

📊 **Coverage:** What scenarios are now tested
- The `normalize` function is now fully tested in its own file `__tests__/installer-match.test.ts`.
- Tests cover normal usage (converting strings to lowercase and trimming whitespace).
- Tests cover removing diacritics and accents (e.g., "Álbañíl" -> "albanil").
- Tests cover combinations of mixed cases, whitespaces and diacritics.
- Tests cover edge cases (empty or whitespace-only strings).
- Existing `specialtyAliases` tests were correctly migrated to `__tests__/installer-match.test.ts`.

✨ **Result:** The improvement in test coverage
Test coverage is improved, and the test suite has better organization and clear boundaries between test scopes, preventing potential regressions.
