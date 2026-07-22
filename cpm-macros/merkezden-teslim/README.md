# CPM Merkezden Teslim Macro Pilot

Version: `2026.07.20-pilot.1`

Status: installed in the live Sales Order macro set in guarded dry-run mode on 2026-07-20. The dry run prepared `FURKAN`, `SERVIS`, and `MRK` without saving; its temporary order `SSP-00979` was deleted. No real pilot order has been detected by Marlin Nexus yet.

The distributed code defaults to `MARLIN_NEXUS_DRY_RUN = true`. In this mode the command prepares the in-memory document fields but never calls `DataObject.Save`. The guarded smoke test passed. Follow `CANLI-KURULUM-TR.md` for the separately controlled first real order and rollback sequence.

## Purpose

This package separates commercial ownership from physical fulfillment on Sales Orders:

- `EVRBAS.SATICINO`: commercial owner CPM user code
- `STKHAR.MASRAFKOD`: commercial department code
- `STKHAR.DEPOKOD`: physical fulfillment depot
- `STKHAR.SONKAYNAK*`: downstream source-document chain, maintained by CPM conversions

The `Merkezden Teslim` command is limited to active Service users. It stamps the source Sales Order with the current Service owner, sets every line to department `SERVIS`, changes only the physical depot to `MRK`, confirms the values, and saves through CPM's normal `DataObject.Save` path.

The pilot intentionally does not hook generic `BeforePost` events. Ordinary orders and historical documents remain unchanged. Existing Marlin Nexus user mapping continues to classify normal same-user sales; this macro records the cross-depot exception that cannot be inferred later.

## Files

- `LibMarlinNexusOwnership.js`: CPM macro library and button handler.
- `BASLA-addition.js`: toolbar button wiring.
- `CANLI-KURULUM-TR.md`: exact Turkish live-client paste, smoke-test, activation, and rollback steps.
- `test-macro.cjs`: offline behavior tests with mocked CPM tables.
- `validate.ps1`: static checks and test runner.

## Read-Only Field Evidence

The production schema was queried read-only on 2026-07-20:

| Field | SQL type | Current target-document use | Pilot value |
|---|---|---:|---|
| `EVRBAS.SATICINO` | `varchar(30)` | Empty in sampled 2026 types 14/17/64/85/91 | CPM owner code, such as `FURKAN` |
| `STKHAR.MASRAFKOD` | `varchar(30)` | Empty in sampled 2026 types 14/17/64/85/91 | `SERVIS` or `YEDEK_PARCA` |
| `STKHAR.DEPOKOD` | `varchar(30)` | Actively used | `MRK` for central fulfillment |

There is no SQL foreign key on `SATICINO` or `MASRAFKOD`. CPM application-level lookup and conversion behavior must still be verified in the isolated test client.

## CPM Registration Record

The library and `BASLA` addition were added manually to the live Sales Order macro set after a complete macro backup. The steps below remain the reproducible registration and rollback record.

1. Export the complete current Sales Order macro set and capture every macro's name, user scope, run-on-open flag, button flag, category, and shortcut.
2. In the isolated test client, add a library macro named `LibMarlinNexusOwnership` with the contents of `LibMarlinNexusOwnership.js`.
3. Add the contents of `BASLA-addition.js` inside the existing `BASLA` `try` block after `BarManager` and the existing custom buttons have been created.
4. Keep the macro scope identical to the current shared Sales Order macros. Do not assume `SYSTEM` inheritance without testing with `FURKAN`, `BCETINEL`, `MKARA`, and a central-office user.
5. Open a blank Sales Order without saving and verify that the button appears under `Araçlar`.
6. Run the acceptance matrix below against baseline database snapshots.

## Acceptance Matrix

| Scenario | Expected result |
|---|---|
| Burak, central delivery | Owner `BCETINEL`, department `SERVIS`, depot `MRK` |
| Mehmet, central delivery | Owner `MKARA`, department `SERVIS`, depot `MRK` |
| Furkan, central delivery | Owner `FURKAN`, department `SERVIS`, depot `MRK` |
| Normal order without button | No owner, department, or depot field is changed by this pilot |
| Central user clicks `Merkezden Teslim` | Operation blocked; no save |
| Service user opens another owner's order | Ownership replacement blocked; no save |
| Missing customer or product lines | Operation blocked; no save |
| Type 14 -> 17 -> 85 | Owner, department, depot, and every `SONKAYNAK*` link reconcile |
| Partial deliveries | Every child line preserves source owner/department and quantities reconcile |
| Return/cancellation | Reversal inherits original owner and department instead of the posting user |

## Safety Gates

- The macro contains no direct SQL, `ExecSql`, `CommandText`, `UPDATE`, `INSERT`, or `DELETE` operation.
- It saves only through the open CPM document object after an explicit confirmation.
- Its default dry-run mode never invokes `DataObject.Save`; activation requires intentionally changing one constant to `false` after the smoke test.
- It does not attach broad automatic posting events or mutate ordinary/historical orders.
- It never derives commercial department from depot or posting user on an existing owned document.
- Do not import while the isolated CPM Sales Order client still raises startup access violations.
- Do not deploy until `SATICINO` and `MASRAFKOD` propagation through 14 -> 17 -> 85 and return paths is proven.
- Marlin Nexus remains read-only against CPM.

## Rollback

1. Stop testing and close the Sales Order screen without creating additional documents.
2. Restore the test databases from their baseline snapshots if any document was saved.
3. Restore the exported original `BASLA` macro.
4. remove the test-only `LibMarlinNexusOwnership` macro entry.
5. Reopen Sales Order and confirm the button and event handlers are absent.
6. Compare macro metadata and hashes with the pre-test export.
