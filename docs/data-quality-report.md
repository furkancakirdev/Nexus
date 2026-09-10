# Marlin Nexus — CPM Data-Quality Profile

> Profile date: 2026-09-09  
> Scope: CPM objects consumed by Nexus and repository-level data-quality controls.  
> Status: `LIVE_PROFILE_BLOCKED_PENDING_READ_ONLY_DBA_SESSION`  
> Safety: no business rows, credentials, secret values, or write statements were accessed or stored.

## 1. Executive summary

A live row-level profile could not be completed. The authorized metadata-only connection to `192.168.12.17\\MARLINSQL` timed out before authentication/query execution, and this checkout contains no CSV, JSON, JSONL, SQL dump, or other CPM row extract suitable for profiling. Consequently, null rates, duplicate counts, orphan counts, invalid-format counts, stale-record counts, and anomaly rates are **not measured** and must not be inferred from application query text.

The application’s source contracts identify the following high-impact data domains: sales/inventory movements, document headers and history, approvals, product cards, exchange rates, historical prices, current-account settlement evidence, and employee/operational state held outside CPM. The report below records the measurable evidence available now and the exact read-only profile procedure required for a DBA-approved session.

## 2. Evidence and limitations

| Evidence item | Result | Interpretation |
|---|---|---|
| CPM row extract in repository | None found (`csv`, `json`, `jsonl`, `sql`) | No local population can be measured |
| Live SQL connection | Timeout before authentication/query execution | No live metric is available |
| Query contracts | Referenced objects/columns are source-confirmed | Useful for profiling design, not data quality results |
| Read-only policy | `readOnlyIntent`, parameterization, query fingerprinting, write/DDL token rejection | Protects access path; does not prove source-data quality |
| Application quarantine behavior | Unknown/ambiguous source evidence is retained as review/quarantine in relevant flows | Reduces silent propagation but is not a remediation |

**Required interpretation rule:** `Unknown` means no measurement was obtained; it does not mean zero defects.

## 3. Scope and source-level quality rules

| Domain / objects | Quality dimensions to profile | Consumer impact |
|---|---|---|
| `STKHAR` movement lines | Null keys/dates/products/quantities/amounts; duplicate movement IDs; invalid quantities/amounts/dates; orphaned document/product/account references; stale `KAYITDURUM`/modification dates; sign/currency anomalies | Sales, inventory, cost, ledger, provenance |
| `EVRBAS`, `MIREVRBAS`, `EVRONY` | Missing document keys/status/owner/approval; duplicate document keys; orphan history/approval rows; invalid status/date transitions; stale pending approvals | Sales cases, invoice lineage, approval evidence |
| `STKKRT` | Missing product codes/currency; duplicate product codes; invalid currency codes; inactive/stale cards | Inventory and cost candidates |
| `DVZHAR`, `BNKKRT` | Missing bank/date/currency/rate; duplicate rate keys; unknown bank/currency codes; zero/negative/outlier rates; stale rates | Exchange-rate evidence |
| `FYTKRT`, `MIRFYTKRT` | Missing product/date/price/currency; duplicate validity ranges; overlapping effective windows; negative/outlier prices; stale prices | Historical cost candidates |
| `CARENT`, `CARHAR`, `EVRHAR`, `MIRCARHAR`, `MIRCAR` | Missing account/document links; duplicate movements; orphan settlement references; invalid dates/amounts; stale unapplied balances | Settlement evidence and reconciliation |
| Nexus file-backed state (`data/`) | Missing required fields, duplicate IDs, invalid enum/status/date values, stale revisions, orphan document references | Approvals, HR, audit, ledger snapshots |

## 4. Measurement status by requested dimension

| Dimension | Measured result | Status | Required measurement |
|---|---:|---|---|
| Null rates | Not available | Blocked | `COUNT(*)` and per-column `NULLIF/LTRIM/RTRIM` counts by table/company/year |
| Duplicate records | Not available | Blocked | Key/group duplicate counts for movement, document, product, rate, price, account, and approval keys |
| Orphaned relationships | Not available | Blocked | Left joins against referenced master/header tables and explicit missing-reference counts |
| Invalid formats | Not available | Blocked | `TRY_CONVERT`, date/currency/code allow-lists, whitespace/control-character checks |
| Inconsistent codes | Not available | Blocked | Distinct code inventory versus approved code dictionaries and cross-table consistency checks |
| Stale records | Not available | Blocked | Age buckets from modification/event/approval dates against approved freshness thresholds |
| Anomalous values | Not available | Blocked | Negative/zero/sign checks, percentile/IQR or business-threshold outliers, impossible transitions |

## 5. DBA-run read-only profiling procedure

Run from an approved network location with a dedicated read-only account. Substitute only approved parameters; do not save credentials or row-level output in shell history. Return aggregate counts and rates, not business rows or personal data.

### 5.1 Population and null-rate template

```sql
-- Replace @company and @startDate/@endDate with approved values.
DECLARE @company varchar(8) = '01';
DECLARE @startDate date = '2022-01-01';
DECLARE @endDate date = DATEADD(day, 1, CAST(GETDATE() AS date));

SELECT
  'STKHAR' AS table_name,
  COUNT_BIG(*) AS row_count,
  SUM(CASE WHEN ID IS NULL THEN 1 ELSE 0 END) AS null_id,
  SUM(CASE WHEN NULLIF(LTRIM(RTRIM(MALKOD)), '') IS NULL THEN 1 ELSE 0 END) AS blank_product_code,
  SUM(CASE WHEN EVRAKTARIH IS NULL THEN 1 ELSE 0 END) AS null_document_date,
  SUM(CASE WHEN MIKTAR IS NULL THEN 1 ELSE 0 END) AS null_quantity,
  SUM(CASE WHEN TUTAR IS NULL THEN 1 ELSE 0 END) AS null_amount,
  SUM(CASE WHEN EVRAKTARIH < @startDate OR EVRAKTARIH >= @endDate THEN 1 ELSE 0 END) AS outside_date_window
FROM STKHAR
WHERE SIRKETNO = @company;
```

Repeat the same aggregate pattern for each scoped object and record numerator, denominator, rate, filter, and profile timestamp. Do not return raw rows.

### 5.2 Duplicate-key checks

```sql
SELECT 'STKHAR.ID' AS key_name, COUNT_BIG(*) AS duplicate_group_count,
       COALESCE(SUM(duplicate_rows), 0) AS duplicate_excess_rows
FROM (
  SELECT ID, COUNT_BIG(*) - 1 AS duplicate_rows
  FROM STKHAR
  WHERE SIRKETNO = @company
  GROUP BY ID
  HAVING COUNT_BIG(*) > 1
) AS d;

-- Apply equivalent checks to approved business keys:
-- document (EVRAKTIP, EVRAKNO, SIRKETNO), product (MALKOD),
-- rate (bank/currency/type/date), price (product/currency/effective date),
-- and account/document movement keys.
```

### 5.3 Orphan checks

Use only confirmed live relationships after schema reconciliation. Example pattern:

```sql
SELECT 'STKHAR -> EVRBAS' AS relationship_name,
       COUNT_BIG(*) AS orphan_count
FROM STKHAR h
LEFT JOIN EVRBAS b
  ON b.SIRKETNO = h.SIRKETNO
 AND b.EVRAKTIP = h.EVRAKTIP
 AND b.EVRAKNO = h.EVRAKNO
WHERE h.SIRKETNO = @company
  AND b.EVRAKNO IS NULL;
```

Run equivalent checks for movement→product, rate→bank, history→header, approval→document, settlement→account/document, and any live foreign keys. If a relationship is conceptual rather than enforced, label it `application relationship` in results.

### 5.4 Invalid formats, codes, staleness, and anomalies

```sql
SELECT
  SUM(CASE WHEN TRY_CONVERT(date, CONVERT(varchar(30), EVRAKTARIH)) IS NULL
            AND EVRAKTARIH IS NOT NULL THEN 1 ELSE 0 END) AS invalid_dates,
  SUM(CASE WHEN MIKTAR < 0 THEN 1 ELSE 0 END) AS negative_quantities,
  SUM(CASE WHEN TUTAR < 0 THEN 1 ELSE 0 END) AS negative_amounts,
  SUM(CASE WHEN NULLIF(LTRIM(RTRIM(DOVIZ)), '') IS NOT NULL
            AND UPPER(LTRIM(RTRIM(DOVIZ))) NOT IN ('TRY','EUR','USD','GBP')
           THEN 1 ELSE 0 END) AS unknown_currency_codes,
  SUM(CASE WHEN EVRAKTARIH < DATEADD(year, -3, CAST(GETDATE() AS date)) THEN 1 ELSE 0 END) AS stale_rows
FROM STKHAR
WHERE SIRKETNO = @company;
```

Approved currency, status, document-type, bank, department, and warehouse dictionaries must come from the DBA/data owner; the example code list is not an authoritative CPM dictionary. For anomaly detection, return aggregate bucket counts and approved thresholds/percentiles rather than raw sensitive records.

## 6. Prioritized findings backlog

| ID | Priority | Finding | Impact | Evidence status | Owner | Acceptance criterion |
|---|---|---|---|---|---|---|
| DQ-001 | Critical | No live row-level profile is available because the CPM connection timed out | Production financial/reporting quality is unknown; defects may silently affect ledger and reconciliation | Confirmed blocker from connection attempt | DBA/Operations (TBD) | Approved read-only session returns aggregate profile for every scoped table and dimension with timestamp and query hash |
| DQ-002 | Critical | Business keys, duplicate tolerances, and relationship rules are not approved for all CPM domains | Duplicate/orphan results cannot be classified consistently | Policy gap | Data/Finance owner (TBD) | Signed data dictionary names keys, tolerances, and relationship ownership for each scoped object |
| DQ-003 | High | Null/blank mandatory-field thresholds are not measured | Missing product, document, date, amount, rate, or approval fields can invalidate analyses | Unmeasured | DBA + Data owner (TBD) | Null-rate report contains numerator/denominator/rate and approved threshold for every mandatory field |
| DQ-004 | High | Duplicate movement/document/rate/price keys are not measured | Double counting can distort sales, cost, rates, and settlement evidence | Unmeasured | DBA/Data owner (TBD) | Duplicate report identifies key, duplicate groups, excess rows, remediation owner, and zero unresolved critical duplicates |
| DQ-005 | High | Orphaned document/product/account relationships are not measured | Lineage and reconciliation may fail or quarantine valid-looking data | Unmeasured | DBA/Finance owner (TBD) | Relationship report covers all approved links and classifies every orphan as defect, allowed exception, or mapping gap |
| DQ-006 | High | Code dictionaries and cross-table consistency are not verified | Unknown currencies, statuses, departments, depots, banks, or document types can misclassify results | Unmeasured | Data owner (TBD) | Approved dictionaries are versioned; unknown-code rate is zero for release-critical codes or explicitly risk-accepted |
| DQ-007 | High | Date freshness and stale-record behavior are not measured | Old rates/prices/approvals or future-dated documents can produce incorrect decisions | Unmeasured | Finance/Operations (TBD) | Freshness buckets and future-date counts meet approved thresholds; stale records have documented handling |
| DQ-008 | High | Amount/quantity/rate anomalies are not measured | Sign, zero, unit, currency, and outlier errors can materially alter financial outputs | Unmeasured | Data/Finance owner (TBD) | Anomaly profile uses approved business rules and percentile thresholds; all critical anomalies are resolved or quarantined |
| DQ-009 | Medium | Nexus file-backed state lacks a repeatable aggregate quality check | Invalid enums, duplicate IDs, stale revisions, or orphan documents may affect HR/approval workflows | Partially source-observed; no profile run | Technical/QA owner (TBD) | A non-sensitive state validator runs in CI/operations and reports zero critical violations |
| DQ-010 | Medium | Data-quality metrics and remediation history are not centrally retained | Trends and recurring source defects cannot be demonstrated to owners/auditors | Policy gap | Data/Operations (TBD) | Timestamped aggregate profiles, thresholds, exceptions, and closure evidence are retained under approved policy |

## 7. Release impact

- `DQ-001` through `DQ-008` are production-blocking for financial, inventory, exchange-rate, settlement, and approval outputs until measured and accepted.
- A source-quality failure must result in `review`, `quarantine`, or an explicitly approved exception; the application must not silently convert unknown evidence to a valid financial result.
- Profile outputs must contain aggregate counts/rates only unless a separately approved investigation requires restricted row-level access.

## 8. Required sign-off

| Role | Name | Decision | Evidence |
|---|---|---|---|
| CPM/DBA owner | Unknown | Pending | Live read-only profile and schema confirmation |
| Data/finance owner | Unknown | Pending | Keys, dictionaries, thresholds, anomaly policy |
| Nexus technical owner | Unknown | Pending | Consumer impact and quarantine behavior |
| Security/privacy owner | Unknown | Pending | Access, minimization, retention, and output redaction |

**Final status:** `LIVE_METRICS_NOT_AVAILABLE`, `PROFILE_PROCEDURE_READY_FOR_DBA`, `RELEASE_BLOCKED_PENDING_DATA_EVIDENCE`.
