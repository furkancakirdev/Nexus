# Refactoring Boundaries

> Updated: 2026-09-09

## CPM infrastructure extraction

`server/cpmPool.mjs` owns CPM credential-file/environment resolution and lazy SQL pool lifecycle. `server/index.mjs` consumes only the adapter's `getPool()` capability; route and domain loaders retain their existing public contracts.

The adapter preserves three intentional behaviors:

- no configured CPM credentials returns `null` without opening a connection;
- a successful pool is reused for the app instance;
- a failed connection clears the cached promise so a later request may retry.

## Intentional exception

Route registration and orchestration remain in `server/index.mjs` for this slice. Moving every route and loader into separate modules would be a larger public-contract refactor with no evidence of a current defect; it is therefore out of scope. Future extraction should preserve the injected loader/router interfaces and add contract tests before moving each route group.

## Verification

- `node --test server/cpmPool.test.mjs`: 3 passed.
- `npm test`: 685 passed.
- `node --test server/apiDatabase.integration.test.mjs server/cpmTransaction.test.mjs server/cpmReadOnly.test.mjs`: 15 passed.
- `node --check server/cpmPool.mjs server/index.mjs`: passed.
