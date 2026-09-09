# T07 Data model/integrity evidence

Command: `node --test server/finalInvoiceValidation.test.mjs server/employeePolicy.test.mjs server/settingsPolicy.test.mjs server/distribution.test.mjs`

Result: PASS — 46 tests, 46 passed, 0 failed.

Covered: invalid financial inputs, duplicate identities, invalid periods/departments, distribution invariants, orphan/overflow prevention and policy serialization boundaries.
