# Marlin Nexus — CPM SQL Server Schema and Dependency Inventory

> Verification date: 2026-09-09  
> Scope: CPM SQL Server contract, repository SQL consumers, and attempted metadata-only live inspection.  
> Safety: no business rows, credentials, secret-file contents, or write statements are stored here.

## 1. Executive status

- **Configured database:** `Marlin_Uyg` on SQL Server instance `MARLINSQL` (configuration evidence only).
- **Application contract:** Nexus connects with `mssql`, `readOnlyIntent: true`, parameterized SQL, and an application allow-list that rejects persistent writes, DDL, permissions changes, procedure execution, and database administration commands.
- **Live catalog status:** **UNVERIFIED**. The authorized host had `sqlcmd`, but the metadata-only connection to `192.168.12.17\\MARLINSQL` timed out before authentication/query execution. No live catalog result is claimed.
- **Production decision:** database schema, permissions, indexes, foreign keys, jobs, views, procedures, backup/failover, and owner/SLA remain release-gating unknowns until a DBA-approved read-only session succeeds.

## 2. Configuration and connection boundary

| Item | Evidence | Status |
|---|---|---|
| SQL Server host | `CPM_SQL_SERVER` (example/configured value: `192.168.12.17`) | Configuration confirmed; live reachability timed out |
| SQL instance | `CPM_SQL_INSTANCE=MARLINSQL` | Configuration confirmed |
| Database | `CPM_SQL_DATABASE=Marlin_Uyg` | Configuration confirmed; live database identity unverified |
| Company scope | `CPM_SQL_COMPANY`, default `01` | Configuration confirmed |
| Driver | `mssql` package | Confirmed in `package.json` and `server/cpmConnectionConfig.mjs` |
| Connection intent | `readOnlyIntent: true` | Confirmed in `server/cpmConnectionConfig.mjs` |
| Encryption | `CPM_SQL_ENCRYPT`; Compose currently sets `false` | Configuration confirmed; production security decision required |
| Certificate trust | `CPM_SQL_TRUST_SERVER_CERTIFICATE`, default `false` | Configuration confirmed; live SQL certificate not verified |
| Pool/timeouts | pool max 4; connection 8s; request 90s | Confirmed in connection config |
| Credential source | environment pair or two-line `CPM_CREDENTIAL_FILE` secret mount | Path/contract confirmed; secret contents not read |

## 3. Application consumers and confirmed table dependencies

The following are **source-level dependencies** extracted from the SQL modules. They identify referenced objects and columns, not live object existence or cardinality.

| CPM object | Consumer modules | Usage |
|---|---|---|
| `STKHAR` | `server/salesCases.mjs`, `server/finalInvoiceLedger.mjs`, `server/cpmInvoiceAuditSql.mjs`, `server/inventoryOpeningResearchSql.mjs`, `server/sourceProvenanceSql.mjs`, `server/settlementEvidenceSql.mjs` | Sales/invoice lines, inventory movements, document links, quantities, amounts, currencies, depot/department, source-document lineage |
| `EVRBAS` | `server/salesCases.mjs`, `server/finalInvoiceLedger.mjs`, `server/cpmInvoiceAuditSql.mjs` | Document headers, commercial owner/preparer, entry/modification metadata, status |
| `MIREVRBAS` | `server/salesCases.mjs`, `server/finalInvoiceLedger.mjs` | Document history/version and actor evidence |
| `EVRONY` | `server/salesCases.mjs`, `server/finalInvoiceLedger.mjs` | Approval history and terminal approval state |
| `STKKRT` | `server/inventoryOpeningResearchSql.mjs` | Product-card currency and product identity |
| `DVZHAR` | `server/inventoryOpeningResearchSql.mjs` | Exchange-rate candidates by bank, type, date, currency |
| `BNKKRT` | `server/inventoryOpeningResearchSql.mjs` | Bank master name used to validate rate-source identity |
| `FYTKRT` | `server/inventoryOpeningResearchSql.mjs` | Current historical price candidates |
| `MIRFYTKRT` | `server/inventoryOpeningResearchSql.mjs` | Historical price candidates and validity windows |
| `CARENT` | `server/settlementEvidenceSql.mjs` | Invoice-to-current-account settlement evidence candidates |
| `CARHAR` | `server/settlementEvidenceSql.mjs` | Account movement and source/counter document evidence candidates |
| `EVRHAR` | `server/settlementEvidenceSql.mjs` | Additional document movement evidence candidates |
| `MIRCARHAR` | `server/settlementEvidenceSql.mjs` | Historical account movement evidence candidates |
| `MIRCAR` | `server/settlementEvidenceSql.mjs` | Historical account master/evidence candidates |

Additional table names in query modules must be confirmed against the live catalog before production approval. Temporary tables such as `#documents`, `#filtered`, `#page`, and `#invoices` are created only inside read-only transactions and are not CPM schema objects.

### Query contract IDs

The server fingerprints and labels bounded query contracts, including `sales-cases-v1`, `final-invoice-ledger-v1`, `inventory-movement-candidate-v1`, `exchange-rate-candidate-v1`, `historical-price-candidate-v1`, `settlement-evidence-v1`, `invoice-audit-bounded-v1`, and source-provenance contracts. `settlement-evidence-v1` is explicitly quarantined and must not be treated as definitive settlement proof without further verification.

## 4. Object inventory status

| Object category requested | Repository evidence | Live status | Required evidence |
|---|---|---|---|
| Databases | `Marlin_Uyg` configured | **Unknown** | `sys.databases` result with database ID/state/recovery model |
| Schemas | Two-part schema names are not consistently embedded in query text | **Unknown** | `sys.schemas` and object schema mapping |
| Tables | Referenced names listed in section 3 | **Unknown** | `sys.tables`, `sys.columns`, row-independent metadata |
| Views | No confirmed view dependency in inspected runtime SQL | **Unknown** | `sys.views` inventory and dependency query |
| Stored procedures | No procedure-call path; `EXEC`/`EXECUTE` prohibited by read-only parser | **Unknown** | `sys.procedures` inventory; verify no runtime dependency |
| SQL Agent jobs | Not represented in repository/runtime configuration | **Unknown** | `msdb.dbo.sysjobs` metadata via DBA-approved account |
| Indexes | Temporary indexes are created only on local temp tables; CPM indexes not known | **Unknown** | `sys.indexes`, `sys.index_columns`, usage/plan evidence |
| Foreign keys | No live constraint metadata available | **Unknown** | `sys.foreign_keys` and `sys.foreign_key_columns` |
| Permissions | Application credential identity and grants not exposed in repository | **Unknown** | `sys.database_principals`, role memberships, object permissions; redact principal secrets |
| Triggers | No runtime trigger dependency identified | **Unknown** | `sys.triggers` and `sys.sql_modules` |
| Backup/restore | Not part of application repository contract | **Unknown** | DBA backup schedule, retention, restore drill, RPO/RTO evidence |

## 5. Read-only enforcement and dependency boundaries

- `server/cpmReadOnly.mjs` rejects `UPDATE`, `DELETE`, `MERGE`, `TRUNCATE`, `ALTER`, `EXEC`, `GRANT`, `DENY`, `REVOKE`, `USE`, `DBCC`, `BACKUP`, and `RESTORE` tokens.
- It permits bounded temporary-table operations only when the temp table is created in the same query and does not permit persistent table/index targets.
- `server/cpmTransaction.mjs` wraps CPM reads in read-only transactions; retry handling is isolated in `server/sqlReadRetry.mjs`.
- The application must not infer schema ownership, foreign-key guarantees, index performance, or permission sufficiency from successful SQL text parsing alone.
- Nexus application state, HR state, approvals, audit events, and ledger snapshots are file-backed Nexus data and are not CPM-owned tables.

## 6. Live inspection attempt

### Exact procedure

The authorized host was checked for the SQL client and a metadata-only `sqlcmd` probe was attempted. The probe was intended to query only catalog views (`sys.databases`, `sys.schemas`, `sys.tables`, `sys.columns`, `sys.indexes`, `sys.foreign_keys`, `sys.procedures`, `sys.views`, `msdb.dbo.sysjobs`, and permission metadata). It did not select business rows and did not issue writes.

**Result:** connection to `192.168.12.17\\MARLINSQL` timed out before authentication/query execution. No catalog output, credential value, or database mutation was produced.

### Required DBA-run catalog probe

Run from an approved network location with a dedicated read-only account and do not save the password in shell history:

```sql
SELECT DB_NAME() AS database_name, DATABASEPROPERTYEX(DB_NAME(), 'Status') AS database_status;
SELECT s.name AS schema_name FROM sys.schemas AS s ORDER BY s.name;
SELECT s.name AS schema_name, t.name AS table_name, t.create_date, t.modify_date
FROM sys.tables AS t JOIN sys.schemas AS s ON s.schema_id = t.schema_id ORDER BY s.name, t.name;
SELECT s.name AS schema_name, v.name AS view_name
FROM sys.views AS v JOIN sys.schemas AS s ON s.schema_id = v.schema_id ORDER BY s.name, v.name;
SELECT s.name AS schema_name, p.name AS procedure_name, p.create_date, p.modify_date
FROM sys.procedures AS p JOIN sys.schemas AS s ON s.schema_id = p.schema_id ORDER BY s.name, p.name;
SELECT OBJECT_SCHEMA_NAME(fk.parent_object_id) AS parent_schema,
       OBJECT_NAME(fk.parent_object_id) AS parent_table,
       fk.name AS foreign_key_name,
       OBJECT_SCHEMA_NAME(fk.referenced_object_id) AS referenced_schema,
       OBJECT_NAME(fk.referenced_object_id) AS referenced_table
FROM sys.foreign_keys AS fk ORDER BY parent_schema, parent_table, foreign_key_name;
SELECT OBJECT_SCHEMA_NAME(ix.object_id) AS schema_name,
       OBJECT_NAME(ix.object_id) AS object_name,
       ix.name AS index_name, ix.type_desc, ix.is_unique, ix.is_primary_key
FROM sys.indexes AS ix
WHERE ix.index_id > 0 ORDER BY schema_name, object_name, ix.index_id;
SELECT dp.name AS principal_name, dp.type_desc, perm.permission_name, perm.state_desc,
       OBJECT_SCHEMA_NAME(perm.major_id) AS object_schema,
       OBJECT_NAME(perm.major_id) AS object_name
FROM sys.database_principals AS dp
LEFT JOIN sys.database_permissions AS perm ON perm.grantee_principal_id = dp.principal_id
ORDER BY dp.name, object_schema, object_name, perm.permission_name;
```

For SQL Agent jobs, a DBA must separately run the equivalent metadata-only query in `msdb` and provide job names, enabled state, schedules, owner principal, and last-run status without command-step secrets.

## 7. Production blockers and follow-up owners

1. **Critical:** complete live catalog capture and attach a timestamped, redacted result.
2. **Critical:** verify the application credential has only required read permissions and cannot write/execute procedures.
3. **Critical:** document CPM backup, restore, failover, maintenance window, and RPO/RTO ownership.
4. **High:** reconcile query-referenced objects with actual schemas, synonyms, views, and compatibility-level behavior.
5. **High:** review indexes and query plans for the bounded ledger/inventory queries without changing CPM schema during this task.
6. **High:** inventory SQL Agent jobs and confirm none mutate data in ways Nexus depends on without an owner/runbook.
7. **High:** confirm foreign keys are not assumed by application code where the live database does not enforce them.
8. **Owner for all unresolved items:** **Unknown — DBA/operations assignment required**.

## 8. Sign-off

| Role | Name | Decision | Evidence |
|---|---|---|---|
| CPM/DBA owner | Unknown | Pending | Live catalog and permission report required |
| Nexus technical owner | Unknown | Pending | Consumer-to-object reconciliation required |
| Data/finance owner | Unknown | Pending | Financial source and read-only scope approval required |
| Security/operations owner | Unknown | Pending | Credential, permission, backup, and network approval required |

**Inventory status:** `SOURCE_CONSUMERS_MAPPED`, `LIVE_CATALOG_BLOCKED_BY_TIMEOUT`, `SCHEMA_AND_PERMISSION_SIGNOFF_PENDING`.
