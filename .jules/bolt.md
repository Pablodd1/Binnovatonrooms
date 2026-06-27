## 2024-06-27 - [Avoid dynamic allocations in high-frequency image loops]
**Learning:** Client-side image processing (like `scoreFrame`) is highly sensitive to Garbage Collection (GC) overhead. Dynamic arrays with `.push()` and methods like `.reduce` create significant object churn and performance delays.
**Action:** Pre-allocate TypedArrays (e.g., `Float32Array`) and use basic `for` loops instead of dynamically allocating arrays and using higher-order methods in performance-critical paths.
