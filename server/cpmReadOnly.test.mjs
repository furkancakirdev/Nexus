import test from "node:test";
import assert from "node:assert/strict";
import {
  assertCpmReadOnlySql,
  createCpmReadOnlyExecutor,
  executeCpmReadOnlyQuery,
  fingerprintCpmQuery,
} from "./cpmReadOnly.mjs";
import { finalInvoiceLedgerSql } from "./finalInvoiceLedger.mjs";
import { salesCaseSql } from "./salesCases.mjs";
import { sourceProvenanceSql } from "./sourceProvenanceSql.mjs";
import { sourceProvenanceByCanonicalIdsSql } from "./sourceProvenanceSql.mjs";
import { cpmMovementCandidateSql, dvzharRateCandidateSql, stkhArType81SampleSql, stkhArType81SummarySql, stkhArType82SampleSql, stkhArType82SummarySql, stkkrtPriceCandidateSql, stksymDevirSampleSql } from "./inventoryOpeningResearchSql.mjs";
import { stksymDevirSummarySql, stksymStkhArMatchSummarySql } from "./inventoryOpeningResearchSql.mjs";

const healthSql = "SELECT DB_NAME() AS databaseName";

test("production CPM queries pass the local-temp-only structural guard", () => {
  for (const query of [healthSql, salesCaseSql, finalInvoiceLedgerSql, sourceProvenanceSql, cpmMovementCandidateSql, dvzharRateCandidateSql, stkkrtPriceCandidateSql, stkhArType81SampleSql, stkhArType81SummarySql, stkhArType82SampleSql, stkhArType82SummarySql, stksymDevirSampleSql, stksymDevirSummarySql, stksymStkhArMatchSummarySql]) {
    assert.equal(assertCpmReadOnlySql(query), query);
  }
});

test("CPM guard permits only connection-scoped local temp operations", () => {
  const safe = `
    CREATE TABLE #x (id int);
    INSERT/**/INTO #x VALUES (1);
    SELECT id INTO #y FROM #x;
    CREATE UNIQUE CLUSTERED INDEX IX_x ON #x(id);
    CREATE NONCLUSTERED INDEX IX_y ON #y(id);
    SELECT 'UPDATE dbo.RealTable' AS harmless FROM #x;
    -- DROP TABLE dbo.RealTable;
    DROP TABLE #y;
    DROP TABLE #x;
  `;
  assert.doesNotThrow(() => assertCpmReadOnlySql(safe));
});

test("CPM guard rejects persistent, global-temp and procedural operations", () => {
  const blocked = [
    "CREATE TABLE dbo.X (id int)",
    "CREATE TABLE tempdb.dbo.X (id int)",
    "CREATE TABLE ##X (id int)",
    "INSERT INTO dbo.X VALUES (1)",
    "SELECT 1 INTO dbo.X",
    "CREATE INDEX IX ON dbo.X(id)",
    "CREATE INDEX IX ON ##X(id)",
    "UPDATE #x SET id=2",
    "DELETE FROM #x",
    "MERGE dbo.X USING dbo.Y ON 1=1 WHEN MATCHED THEN UPDATE SET id=1;",
    "TRUNCATE TABLE dbo.X",
    "ALTER TABLE dbo.X ADD y int",
    "EXEC dbo.WriteSomething",
    "EXECUTE sp_executesql N'DELETE FROM dbo.X'",
    "GRANT SELECT ON dbo.X TO public",
    "DENY SELECT ON dbo.X TO public",
    "REVOKE SELECT ON dbo.X FROM public",
    "USE master",
    "DBCC CHECKIDENT ('dbo.X', RESEED, 0)",
    "BACKUP DATABASE X TO DISK='x'",
    "RESTORE DATABASE X FROM DISK='x'",
    "CREATE PROC dbo.X AS SELECT 1",
    "CREATE/*comment*/INDEX IX ON dbo.X(id)",
    "SELECT 1; /* safe */ INSERT INTO dbo.X VALUES (1)",
    "SELECT 'unterminated",
    "SELECT 1 /* unterminated",
  ];
  for (const query of blocked) {
    assert.throws(() => assertCpmReadOnlySql(query), undefined, query);
  }
});

test("CPM guard requires a local temp table to exist before mutation or removal", () => {
  for (const query of [
    "INSERT INTO #x VALUES (1)",
    "CREATE INDEX IX ON #x(id)",
    "DROP TABLE #x",
  ]) {
    assert.throws(() => assertCpmReadOnlySql(query), undefined, query);
  }
});

test("CPM executor rejects unknown or modified query before request.query", async () => {
  const approved = "SELECT 1 AS ok";
  let callCount = 0;
  const request = { query: async () => { callCount += 1; return { recordsets: [] }; } };
  const auditEvents = [];
  const execute = createCpmReadOnlyExecutor({
    allowedFingerprints: { approved: fingerprintCpmQuery(approved) },
    audit: (event) => auditEvents.push(event),
  });

  await assert.rejects(() => execute({ request, queryId: "unknown", query: approved }));
  await assert.rejects(() => execute({ request, queryId: "approved", query: `${approved} -- changed` }));
  assert.equal(callCount, 0);
  assert.equal(auditEvents.length, 2);
  assert.ok(auditEvents.every((event) => event.status === "rejected"));
  assert.ok(auditEvents.every((event) => !("query" in event) && !("parameters" in event)));
});

test("production fingerprint registry executes the approved queries", async () => {
  const received = [];
  const request = { query: async (query) => { received.push(query); return { recordsets: [] }; } };
  await executeCpmReadOnlyQuery({ request, queryId: "health-database-name", query: healthSql });
  await executeCpmReadOnlyQuery({ request, queryId: "sales-cases-v1", query: salesCaseSql });
  await executeCpmReadOnlyQuery({ request, queryId: "final-invoice-ledger-v1", query: finalInvoiceLedgerSql });
  await executeCpmReadOnlyQuery({ request, queryId: "source-provenance-candidates-v1", query: sourceProvenanceSql });
  await executeCpmReadOnlyQuery({ request, queryId: "source-provenance-canonical-ids-v1", query: sourceProvenanceByCanonicalIdsSql });
  await executeCpmReadOnlyQuery({ request, queryId: "inventory-movement-candidate-v1", query: cpmMovementCandidateSql });
  await executeCpmReadOnlyQuery({ request, queryId: "exchange-rate-candidate-v1", query: dvzharRateCandidateSql });
  await executeCpmReadOnlyQuery({ request, queryId: "historical-price-candidate-v1", query: stkkrtPriceCandidateSql });
  await executeCpmReadOnlyQuery({ request, queryId: "inventory-opening-stkhar-sample-v1", query: stkhArType82SampleSql });
  await executeCpmReadOnlyQuery({ request, queryId: "inventory-opening-stkhar-summary-v1", query: stkhArType82SummarySql });
  await executeCpmReadOnlyQuery({ request, queryId: "inventory-opening-stkhar-type81-sample-v1", query: stkhArType81SampleSql });
  await executeCpmReadOnlyQuery({ request, queryId: "inventory-opening-stkhar-type81-summary-v1", query: stkhArType81SummarySql });
  await executeCpmReadOnlyQuery({ request, queryId: "inventory-opening-stksym-sample-v1", query: stksymDevirSampleSql });
  await executeCpmReadOnlyQuery({ request, queryId: "inventory-opening-stksym-summary-v1", query: stksymDevirSummarySql });
  await executeCpmReadOnlyQuery({ request, queryId: "inventory-opening-stksym-stkhar-match-summary-v1", query: stksymStkhArMatchSummarySql });
  assert.deepEqual(received, [healthSql, salesCaseSql, finalInvoiceLedgerSql, sourceProvenanceSql, sourceProvenanceByCanonicalIdsSql, cpmMovementCandidateSql, dvzharRateCandidateSql, stkkrtPriceCandidateSql, stkhArType82SampleSql, stkhArType82SummarySql, stkhArType81SampleSql, stkhArType81SummarySql, stksymDevirSampleSql, stksymDevirSummarySql, stksymStkhArMatchSummarySql]);
});
