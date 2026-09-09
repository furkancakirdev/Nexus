import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import test from "node:test";
import { cpmInvoiceAuditSql } from "./cpmInvoiceAuditSql.mjs";
import {
  buildCpmInvoiceAuditPayload,
  normalizeInvoiceAuditRequest,
} from "./cpmInvoiceAudit.mjs";
import { assertCpmReadOnlySql } from "./cpmReadOnly.mjs";
import { createUnifiedLedgerRouter } from "./ledgerApi.mjs";

test("bounded CPM invoice audit query remains SELECT-only and evidence-shaped", () => {
  assert.equal(assertCpmReadOnlySql(cpmInvoiceAuditSql), cpmInvoiceAuditSql);
  assert.match(cpmInvoiceAuditSql, /EVRAKTIP IN \(17, 18, 85, 91\)/);
  assert.match(cpmInvoiceAuditSql, /EVRAKTARIH >= @startDate/);
  assert.match(cpmInvoiceAuditSql, /EVRAKTARIH < @endDate/);
  assert.match(cpmInvoiceAuditSql, /candidate\.EVRAKTARIH = page\.documentDate/);
  assert.match(cpmInvoiceAuditSql, /commercialOwnerCandidate/);
  assert.match(cpmInvoiceAuditSql, /commercialOwnerHeaderValue/);
  assert.match(cpmInvoiceAuditSql, /commercialOwnerCandidate/);
  assert.match(cpmInvoiceAuditSql, /preparer-fallback-candidate/);
  assert.match(cpmInvoiceAuditSql, /EVRAKHAZIRLAYAN COLLATE Turkish_CI_AI NOT IN/);
  assert.match(cpmInvoiceAuditSql, /CAST\(CASE WHEN h\.EVRAKTIP = 18 THEN 0 ELSE 1 END AS bit\) isSale/);
  assert.match(cpmInvoiceAuditSql, /INTO #filtered/);
  assert.match(cpmInvoiceAuditSql, /INTO #page/);
  assert.match(cpmInvoiceAuditSql, /CAST\(h\.TUTAR AS decimal\(28, 4\)\)/);
  assert.doesNotMatch(cpmInvoiceAuditSql, /CAST\(ISNULL\(h\.TUTAR, 0\)/);
});

test("invoice audit pagination is bounded and deterministic", () => {
  assert.deepEqual(normalizeInvoiceAuditRequest({}), { valid: true, page: 1, pageSize: 100, offset: 0 });
  assert.deepEqual(normalizeInvoiceAuditRequest({ page: "3", pageSize: "9999" }), {
    valid: true,
    page: 3,
    pageSize: 500,
    offset: 1000,
  });
  assert.deepEqual(normalizeInvoiceAuditRequest({ page: "-1", pageSize: "0" }), { valid: false, error: "invalid-page" });
  assert.deepEqual(normalizeInvoiceAuditRequest({ page: "21474838", pageSize: "100" }), { valid: false, error: "pagination-out-of-range" });
});

test("invoice audit payload stays explicitly candidate and non-official", () => {
  const payload = buildCpmInvoiceAuditPayload({
    year: 2026,
    page: 2,
    pageSize: 100,
    totalRows: "201",
    summaryRows: [{ documentType: 17, netAmount: 12 }],
    rows: [{ rootId: 1 }],
  });
  assert.equal(payload.evidence.official, false);
  assert.equal(payload.evidence.status, "candidate");
  assert.equal(payload.pagination.totalPages, 3);
  assert.equal(payload.rows[0].rootId, 1);
});

test("raw invoice audit route uses bounded page inputs and loader output", async (t) => {
  const router = createUnifiedLedgerRouter({
    ledgerService: { get: async () => ({ value: null }) },
    rawInvoiceAuditLoader: async (year, pagination) => buildCpmInvoiceAuditPayload({
      year,
      ...pagination,
      totalRows: 501,
      summaryRows: [{ documentType: 17 }],
      rows: [{ rootId: 7 }],
    }),
  });
  const app = express();
  app.use(router);
  const server = app.listen(0);
  t.after(() => server.close());
  await once(server, "listening");
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/reconciliation/raw-invoices?year=2026&page=2&pageSize=9999`);
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.year, 2026);
  assert.equal(payload.pagination.page, 2);
  assert.equal(payload.pagination.pageSize, 500);
  assert.equal(payload.evidence.official, false);

  const overflow = await fetch(`http://127.0.0.1:${address.port}/api/reconciliation/raw-invoices?year=2026&page=21474838&pageSize=100`);
  assert.equal(overflow.status, 400);
});
