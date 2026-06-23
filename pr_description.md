🔒 Fix weak randomness in request ID generation

🎯 **What:**
Replaced `Math.random()` with `crypto.randomUUID()` in the `generateRequestId` function within `src/lib/logger.ts`.

⚠️ **Risk:**
`Math.random()` provides weak randomness and is not cryptographically secure. Using it to generate IDs makes them potentially predictable or prone to collisions, which could theoretically be exploited if request IDs are utilized in sensitive contexts (e.g., logging sensitive operations, correlating cross-service requests, or masking internal states).

🛡️ **Solution:**
Updated the implementation to use `crypto.randomUUID()`, which leverages a Cryptographically Secure Pseudo-Random Number Generator (CSPRNG) to create universally unique identifiers. The `Date.now()` prefix was preserved to retain sortability. Added tests to verify the expected format and uniqueness of the generated IDs.
