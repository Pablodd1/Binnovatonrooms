# Bolt Performance Journal

## Performance Optimizations
- **Array Traversals**: Consolidating multiple loops and `Array.prototype.filter` / `Array.prototype.map` into a single loop improves performance, especially on hot paths or large arrays, as it avoids redundant iterations and reduces garbage collection overhead from temporary arrays.
