## Performance Journal
- Client-side image processing in this codebase (e.g., camera frame scoring) is highly sensitive to Garbage Collection (GC) overhead. Use typed arrays (e.g., Float32Array) and basic for-loops over dynamic arrays and expensive array methods (reduce, filter) in high-frequency paths.
- Batch processing of images via Python FastAPI endpoints should leverage a global `ThreadPoolExecutor` bounded appropriately in combination with `asyncio.gather` for optimal GPU/CPU utilization without context-switching thrashing and blocking I/O bottlenecks.
