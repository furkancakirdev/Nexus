import test from "node:test";
import assert from "node:assert/strict";
import {
  buildInvoiceReconciliation,
  buildSourceRowProvenanceDiagnostic,
} from "./ledgerApi.mjs";
import { buildDepartmentAnalysis } from "./departmentAnalysis.mjs";

function row(overrides = {}) {
  return {
    documentDate: "2026-08-10T00:00:00.000Z",
    isSale: true,
    grossAmount: 120,
    discountAmount: 20,
    netAmount: 100,
    signedNetSales: 100,
    signedVatAmount: 20,
    signedInvoiceTotalInclVat: 120,
    ...overrides,
  };
}

test("CPM canonical fatura toplamları Nexus aylık özetine kuruşla uzlaşır", () => {
  const ledger = { rows: [row(), row({ isSale: false, grossAmount: 50, discountAmount: 0, netAmount: 50, signedNetSales: -50, signedVatAmount: -10, signedInvoiceTotalInclVat: -60 })] };
  const result = buildInvoiceReconciliation(ledger);
  assert.equal(result.status, "matched");
  assert.equal(result.source.netSales, 50);
  assert.equal(result.source.invoiceTotalInclVat, 60);
  assert.equal(result.nexus.netSales, 50);
  assert.equal(result.breakdown[0].difference, 0);
  assert.equal(result.exactMinorUnitDifferences.netSales, 0);
});

test("uzlaştırma kayan nokta artıklarını exact minor-unit kanıtından ayırır", () => {
  const ledger = {
    rows: [
      row({ grossAmount: "0.10", discountAmount: "0.00", netAmount: "0.10", signedNetSales: "0.10" }),
      row({ grossAmount: "0.20", discountAmount: "0.00", netAmount: "0.20", signedNetSales: "0.20" }),
    ],
  };
  const result = buildInvoiceReconciliation(ledger, [{
    month: 8,
    monthName: "Ağustos",
    sales: "0.30",
    returns: "0.00",
    discounts: "0.00",
    netSales: "0.30",
    invoiceLineCount: 2,
  }]);

  assert.equal(result.status, "matched");
  assert.equal(result.differences.netSales, 5.551115123125783e-17);
  assert.deepEqual(result.exactMinorUnitDifferences, {
    grossSales: 0,
    returns: 0,
    discounts: 0,
    netSales: 0,
  });
});

test("kanonik net satış pilot kartlarını ikinci kez exact toplama eklemez", () => {
  const result = buildInvoiceReconciliation(
    { rows: [
      row({ grossAmount: "1.00", netAmount: "1.00", signedNetSales: "1.00" }),
      row({ productCode: "ISCILIK", grossAmount: "10.00", netAmount: "10.00", signedNetSales: "10.00" }),
    ] },
    [{
      month: 8,
      sales: 0,
      returns: 0,
      discounts: 0,
      netSales: 11,
      pilotCards: { labor: { sales: 10, returns: 0, discounts: 0 } },
    }],
  );

  assert.equal(result.exactMinorUnitDifferences.netSales, 0);
});

test("exact minor-unit karşılaştırması dördüncü ondalığı muhasebe yuvarlamasıyla işler", () => {
  const result = buildInvoiceReconciliation(
    { rows: [row({ grossAmount: "1.005", netAmount: "1.005", signedNetSales: "1.005" })] },
    [{ month: 8, sales: "1.01", returns: 0, discounts: 0, netSales: "1.01", invoiceLineCount: 1 }],
  );

  assert.equal(result.exactMinorUnitDifferences.netSales, 0);
});

test("Nexus görünümü CPM kaynağından saparsa uzlaştırma inceleme durumuna düşer", () => {
  const ledger = { rows: [row()] };
  const result = buildInvoiceReconciliation(ledger, [{ month: 8, monthName: "Ağustos", sales: 90, returns: 0, discounts: 0, invoiceLineCount: 1 }]);
  assert.equal(result.status, "review-required");
  assert.equal(result.differences.netSales, 10);
  assert.equal(result.breakdown[0].difference, 10);
});

test("eski kapsam kodları resmi uzlaştırmaya ve gelir toplamına dahil edilir", () => {
  const result = buildInvoiceReconciliation({ rows: [row(), row({ productCode: "KOMISYON", grossAmount: 50, discountAmount: 0, netAmount: 50, signedNetSales: 50, signedVatAmount: 10, signedInvoiceTotalInclVat: 60 })] });
  assert.equal(result.status, "matched");
  assert.equal(result.source.netSales, 150);
  assert.equal(result.excludedIncome.netSales, 0);
  assert.equal(result.rawSource.netSales, 150);
  assert.deepEqual(result.excludedIncomeCodes, []);
});

test("source-row provenance bağımsız CPM kanıtı yoksa diagnostic'i fail-closed döndürür", () => {
  const result = buildSourceRowProvenanceDiagnostic({
    rows: [
      row({ rootId: "STK-1", documentNo: "SF-1" }),
      row({
        rootId: "STK-2",
        documentNo: "SF-2",
        productCode: "KOMISYON",
        grossAmount: 50,
        netAmount: 50,
        signedNetSales: 50,
        signedVatAmount: 10,
        signedInvoiceTotalInclVat: 60,
      }),
    ],
  });

  assert.equal(result.status, "unverified");
  assert.equal(result.evidenceMode, "canonical-ledger-only");
  assert.equal(result.sourceTable, "STKHAR");
  assert.equal(result.sourceKeyField, "ID");
  assert.equal(result.independentSourceRowsAvailable, false);
  assert.deepEqual(result.summary, {
    rows: 2,
    nullSourceRowIds: 0,
    duplicateSourceRowIds: 0,
    includedRows: 2,
    excludedIncomeRows: 0,
    unmatchedRows: 2,
  });
  assert.deepEqual(result.rows.map(({ sourceRowId, disposition, matchStatus }) => ({
    sourceRowId,
    disposition,
    matchStatus,
  })), [
    { sourceRowId: "STK-1", disposition: "included", matchStatus: "not-independently-verified" },
    { sourceRowId: "STK-2", disposition: "included", matchStatus: "not-independently-verified" },
  ]);
});

test("source-row provenance her tutarı açık bir kapsam sınıfına taşır", () => {
  const result = buildSourceRowProvenanceDiagnostic({
    rows: [
      row({ rootId: "COMMERCIAL" }),
      row({ rootId: "COMMISSION", productCode: "KOMISYON" }),
      row({ rootId: "TEST" }),
    ],
    excludedTestRows: [{ rootId: "TEST" }],
  });

  assert.deepEqual(result.rows.map((item) => item.scopeClassification), [
    "commercial-revenue",
    "commercial-revenue",
    "test-document",
  ]);
});

test("dört eski gelir kodu departman toplamında ve kişi kırılımında tutulur", () => {
  const codes = ["KOMISYON", "GD-0187", "PDI", "GD-0079"];
  const rows = codes.map((productCode, index) => row({
    rootId: `INCOME-${index}`,
    productCode,
    netAmount: 100,
    grossAmount: 100,
    signedNetSales: 100,
    department: "service",
    commercialOwner: "OWNER",
    attributionConfidence: "confirmed",
    financeV2: { costStatus: "review", reviewReason: "missing-cost", productCurrency: "TRY" },
  }));
  const analysis = buildDepartmentAnalysis({ year: 2026, ledger: { rows } });
  assert.equal(analysis.detailRows.length, 4);
  assert.equal(analysis.totals.netSales, 400);
  assert.equal(analysis.departments.find((item) => item.id === "service").netSales, 400);
  assert.equal(analysis.ownerEvidenceTotals.find((item) => item.id === "OWNER").netSales, 400);
});

test("source-row provenance anahtarı null veya duplicate ise matched iddiasını reddeder", () => {
  const result = buildSourceRowProvenanceDiagnostic({
    rows: [row({ rootId: null }), row({ rootId: "DUP" }), row({ rootId: "DUP" })],
  });

  assert.equal(result.status, "unavailable");
  assert.equal(result.summary.nullSourceRowIds, 1);
  assert.equal(result.summary.duplicateSourceRowIds, 1);
  assert.equal(result.summary.unmatchedRows, 3);
});
