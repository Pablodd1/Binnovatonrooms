## Array Iteration Optimization
* When calculating multiple summary statistics over the same large array, consolidate all calculations into a single, traditional `for` loop.
* Avoid using `reduce`, `filter`, and multiple `for...of` loops, as these introduce iteration overhead and potential GC overhead by creating intermediate arrays.
