# T09 Performance/capacity baseline evidence

Command: `node --test server/releaseReadiness.test.mjs server/releasePreflight.test.mjs server/deploymentContract.test.mjs`

Result: PASS — 17 tests, 17 passed, 0 failed.

Covered: readiness/preflight gates, runtime/build metadata, safe read-only runtime checks, transport/host/state/candidate validation and deployment contract. This is a readiness baseline, not a production load benchmark; p50/p95 and throughput still require a production-like load run.
