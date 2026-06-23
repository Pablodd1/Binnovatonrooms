
## 2024-05-18 - Pre-allocate Arrays in Tight Loops
**Learning:** Allocating standard dynamic arrays (using `[]` and `.push()`) inside tight loops like `requestAnimationFrame` or `setInterval` creates massive memory fragmentation and forces frequent garbage collection spikes, dropping frames.
**Action:** Use pre-allocated typed arrays like `Float32Array` with standard loops and inline accumulations instead of mapping/reducing over standard arrays.
