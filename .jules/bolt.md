## Performance Learnings

### Array methods in high-frequency paths
- Client-side image processing in this codebase (e.g., camera frame scoring) is highly sensitive to Garbage Collection (GC) overhead.
- Use typed arrays (e.g., `Float32Array`) and basic `for`-loops over dynamic arrays and expensive array methods (`reduce`, `filter`) in high-frequency paths.
