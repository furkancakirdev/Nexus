# Nexus Backup and Disaster-Recovery Verification

> Verification date: 2026-09-09
> Scope: repository state paths and authorized Nexus host metadata
> Safety: metadata-only inspection plus isolated archive restore; no production restart, overwrite, database write, or secret read
> Status: `RESTORE_TEST_PASS`, `BACKUP_CONTROL_EVIDENCE_INCOMPLETE`, `RPO_RTO_UNDEFINED`

## Executive result

An isolated restore test succeeded against the host archive:

- Source archive: `/home/serviceproadmin/backups/marlin-nexus-erp-readiness-20260824-1230/data-before.tgz`
- Restore target: temporary directory under `/tmp`, removed automatically after the test
- Archive validation: `tar -tzf` succeeded
- Extracted files: `8`
- `app-state.json` files: `1`
- `hr-state.json` files: `1`
- Ledger snapshot files: `4`
- Live application files and containers: unchanged

This proves that this specific archive is readable and contains representative critical application state. It does **not** prove that backups run on schedule, are encrypted, are retained according to policy, or can restore CPM SQL data.

## Repository evidence

The Compose deployment mounts application state at `/app/data`:

- `APP_STATE_FILE=/app/data/app-state.json`
- `LEDGER_SNAPSHOT_DIR=/app/data/ledger-snapshots`
- `./data:/app/data`
- Nexus user and CPM credential mounts are read-only secret files.

The repository contains atomic state writes and ledger snapshot paths, but no configured backup scheduler, retention worker, encryption/key-management policy, restore command, or declared RPO/RTO. No application migration framework is configured.

## Host metadata evidence

Metadata-only SSH inspection reported:

- Host: `linux-01`
- Application state exists under `/home/serviceproadmin/apps/marlin-profit-sharing/data`.
- `app-state.json`, `hr-state.json`, and year-specific ledger snapshots are present.
- Several backup/release archives exist under the application `backups/`, `releases/`, and `tmp/` paths.
- A system timer matching Nexus/Marlin/backup was not observed. The only matching system timer output was the unrelated `dpkg-db-backup.timer`.
- Docker volume names for Nexus application data or backups were not observed in the filtered output; the Compose deployment uses a host bind mount for `/app/data`.

The inspection intentionally recorded filenames, modes, sizes, and timestamps only. It did not read credential, user, TLS private-key, or business-row contents.

## Control verification matrix

| Control | Result | Evidence / gap |
|---|---|---|
| Backup artifact exists | **Pass for sampled archive** | `data-before.tgz` existed and was readable |
| Archive integrity | **Pass for sampled archive** | `tar -tzf` and extraction succeeded |
| Restore to isolated target | **Pass** | 8 files restored to temporary directory; cleanup ran on exit |
| Critical state coverage | **Pass for sampled archive** | app state, HR state, and four ledger snapshots present |
| Scheduled backups | **Unverified** | No Nexus-specific system timer or cron evidence found |
| Retention duration/deletion policy | **Unverified** | No policy or automated retention job identified |
| Backup encryption at rest | **Unverified** | Archive encryption/key-management metadata was not available |
| Backup access permissions | **Partial** | Archive file metadata was inspected; formal restore-role authorization was not verified |
| CPM SQL backup/restore | **Unverified** | No safe isolated CPM backup or test database was provided |
| Recovery point objective (RPO) | **Not defined** | No approved target or measured schedule exists |
| Recovery time objective (RTO) | **Not defined** | No approved target or timed full-service recovery run exists |
| Restore runbook | **Incomplete** | Archive extraction was proven; service/database rehydration and validation steps are not operationally approved |
| Post-restore integrity validation | **Partial** | File presence was checked; application startup, schema/data checks, and business reconciliation were not run |

## Reproduction commands

Run from the authorized host with a non-secret operator account. Replace the archive path only with an approved backup artifact. Do not target the live data directory.

```sh
archive=/home/serviceproadmin/backups/marlin-nexus-erp-readiness-20260824-1230/data-before.tgz
restore=$(mktemp -d /tmp/nexus-restore-test.XXXXXX)
trap 'rm -rf "$restore"' EXIT
tar -tzf "$archive" >/dev/null
tar -xzf "$archive" -C "$restore"
find "$restore" -type f | wc -l
find "$restore" -type f -name 'app-state.json' | wc -l
find "$restore" -type f -name 'hr-state.json' | wc -l
find "$restore" -type f -path '*ledger-snapshots/*' | wc -l
```

Observed result: `RESTORE_STATUS=PASS`, `RESTORE_FILE_COUNT=8`, `APP_STATE_FILES=1`, `HR_STATE_FILES=1`, `LEDGER_SNAPSHOT_FILES=4`.

## Release blockers and required follow-up

1. Define and approve RPO/RTO targets for application state, ledger snapshots, and CPM data.
2. Establish a scheduled backup job with observable success/failure alerts.
3. Define retention, deletion, off-host replication, and encrypted-at-rest/key-rotation policy.
4. Restrict backup archives and restore operations to named operators and verify permissions with an access test.
5. Perform a timed restore in an isolated environment, start the candidate service, run health/readiness checks, and reconcile representative state.
6. Obtain an approved CPM SQL backup/restore procedure and test database before claiming database recovery coverage.
7. Publish a signed restore runbook and attach evidence to the release record.

**No production release should claim verified disaster recovery until the unverified controls above have owners, approved targets, and repeatable evidence.**
