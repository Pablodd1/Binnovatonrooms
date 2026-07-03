#!/bin/bash
sed -i 's/rateLimit.resetAt/rateLimit.reset/g' src/app/api/analyze/route.ts
sed -i 's/rateLimit.resetAt/rateLimit.reset/g' src/lib/request-guards.ts
