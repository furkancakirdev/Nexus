import assert from "node:assert/strict";
import test from "node:test";

import {
  actorDisplayName,
  actorActivityLabel,
  buildEvidenceTags,
  documentTypeLabel,
  getBatchDocumentEvidence,
  isOfficialOwnerRankingCandidate,
  projectDepartmentEurMetric,
} from "../src/departmentEvidencePresentation.js";
import { DEFAULT_IDENTITIES } from "./ownershipResolver.mjs";

test("CPM satış zinciri belge türlerini doğru adlandırır", () => {
  assert.equal(documentTypeLabel(13), "Teklif");
  assert.equal(documentTypeLabel(14), "Satış siparişi");
  assert.equal(documentTypeLabel(15), "Satış irsaliyesi");
  assert.equal(documentTypeLabel(17), "Satış faturası");
  assert.equal(documentTypeLabel(18), "Satış iadesi");
  assert.equal(documentTypeLabel(64), "Sipariş onay");
  assert.equal(documentTypeLabel(85), "Nihai fatura");
  assert.equal(documentTypeLabel(91), "Perakende satış");
  assert.equal(documentTypeLabel(999), "Bağlı evrak");
});

test("ticari ve muhasebe aktörlerini tam isimle gösterir", () => {
  assert.equal(actorDisplayName("CAN"), "Can Belikırık");
  assert.equal(actorDisplayName("CBELIKIRIK"), "Can Belikırık");
  assert.equal(actorDisplayName("EMRE"), "Emre Erdoğan");
  assert.equal(actorDisplayName("EERDOGAN"), "Emre Erdoğan");
  assert.equal(actorDisplayName("BIRCAN"), "Bircan Çolak");
  assert.equal(actorDisplayName("MAYAZ"), "Metin Ayaz");
  assert.equal(actorDisplayName("bilinmeyen"), "Tanımsız kullanıcı (BILINMEYEN)");
  assert.equal(actorDisplayName(""), "Belirsiz aktör");
});

test("arayüzdeki bilinen aktör isimleri sunucu kimlik kaydıyla aynı kalır", () => {
  for (const [code, identity] of Object.entries(DEFAULT_IDENTITIES)) {
    assert.equal(actorDisplayName(code), identity.name, code);
  }
});

test("EUR gelir kanıtı eksikse departman sunumu hiçbir gelir tutarını göstermez", () => {
  const projection = projectDepartmentEurMetric({
    canonicalMetric: {
      status: "TAMAM",
      eurRevenue: { complete: false, netSales: 999 },
      eur: { complete: true, netSales: 999, cost: 400, profit: 599, margin: 60 },
    },
    eurRevenueComplete: false,
    eurEquivalent: {
      grossSales: 1100,
      returns: 50,
      discounts: 51,
      netSales: 999,
      cost: 400,
      profit: 599,
      margin: 60,
      revenueComplete: false,
      costComplete: true,
    },
  });

  assert.equal(projection.grossSales, null);
  assert.equal(projection.returns, null);
  assert.equal(projection.discounts, null);
  assert.equal(projection.netSales, null);
  assert.equal(projection.cost, 400);
  assert.equal(projection.profit, 599);
  assert.equal(projection.margin, 60);
});

test("maliyet ve kâr mevcut canonical tamamlanma kapısına uyar", () => {
  const projection = projectDepartmentEurMetric({
    canonicalMetric: {
      status: "INCELEME",
      eurRevenue: { complete: true, netSales: 999 },
      eur: { complete: true, netSales: 999, cost: 400, profit: 599, margin: 60 },
    },
    eurEquivalent: { cost: 400, profit: 599, margin: 60, costComplete: true },
  });

  assert.equal(projection.netSales, 999);
  assert.equal(projection.cost, null);
  assert.equal(projection.profit, null);
  assert.equal(projection.margin, null);
});

test("EUR gelir kırılımı review ise net satış dışında brüt/iade/iskonto gösterilmez", () => {
  const projection = projectDepartmentEurMetric({
    canonicalMetric: {
      status: "TAMAM",
      eurRevenue: { complete: true, netSales: 999 },
      eurBreakdown: { complete: false, grossSales: 1100, returns: 50, discounts: 51 },
      eur: { complete: true, netSales: 999, cost: 400, profit: 599, margin: 60 },
    },
    eurEquivalent: {
      grossSales: 1100,
      returns: 50,
      discounts: 51,
      netSales: 999,
      revenueComplete: true,
      costComplete: true,
    },
  });

  assert.equal(projection.netSales, 999);
  assert.equal(projection.grossSales, null);
  assert.equal(projection.returns, null);
  assert.equal(projection.discounts, null);
});

test("EUR breakdown kanıtı eksikse brüt satış, iade ve iskonto sayısal gösterilmez", () => {
  const projection = projectDepartmentEurMetric({
    canonicalMetric: {
      status: "TAMAM",
      eurRevenue: { complete: true, netSales: 999 },
      eur: { complete: true, netSales: 999, cost: 400, profit: 599, margin: 60 },
      eurBreakdown: { present: true, complete: false, grossSales: 1100, returns: 50, discounts: 51 },
    },
    eurEquivalent: {
      grossSales: 1100,
      returns: 50,
      discounts: 51,
      netSales: 999,
      breakdownComplete: false,
    },
  });

  assert.equal(projection.netSales, 999);
  assert.equal(projection.grossSales, null);
  assert.equal(projection.returns, null);
  assert.equal(projection.discounts, null);
});

test("91→85 yalnız ortak root veya lineage kanıtıyla bağlı sayılır", () => {
  const withoutIdentity = getBatchDocumentEvidence({
    batchRisk: true,
    evidenceDocuments: [
      { documentType: 91, documentNo: "PS-1" },
      { documentType: 85, documentNo: "SF-1" },
    ],
  });
  assert.equal(withoutIdentity.status, "blocked");

  const linked = getBatchDocumentEvidence({
    batchRisk: true,
    evidenceDocuments: [
      { rootId: "ROOT-1", lineageId: "LINE-91", headerId: "HEADER-91", documentType: 91, documentNo: "PS-1" },
      { rootId: "ROOT-1", lineageId: "LINE-85", headerId: "HEADER-85", documentType: 85, documentNo: "SF-1" },
    ],
  });
  assert.equal(linked.status, "linked");

  const lineageLinked = getBatchDocumentEvidence({
    batchRisk: true,
    evidenceDocuments: [
      { lineageId: "LINE-1", headerId: "HEADER-91", documentType: 91, documentNo: "PS-2" },
      { lineageId: "LINE-1", headerId: "HEADER-85", documentType: 85, documentNo: "SF-2" },
    ],
  });
  assert.equal(lineageLinked.status, "linked");

  const differentRoots = getBatchDocumentEvidence({
    batchRisk: true,
    evidenceDocuments: [
      { rootId: "ROOT-1", lineageId: "LINE-91", documentType: 91, documentNo: "PS-1" },
      { rootId: "ROOT-2", lineageId: "LINE-85", documentType: 85, documentNo: "SF-1" },
    ],
  });
  assert.equal(differentRoots.status, "blocked");
});

test("inactive actor tarihsel atıf olarak kalır ve resmi sıralama etiketi kesinleştirmez", () => {
  assert.equal(actorActivityLabel(false), "inactive actor · tarihsel atıf");
  assert.equal(
    buildEvidenceTags({ attributionStatus: "confirmed", commercialOwner: "OGENCOGLU", ownerActive: false })
      .some((tag) => tag.id === "inactive-actor"),
    true,
  );
  assert.equal(isOfficialOwnerRankingCandidate({ active: false }), false);
  assert.equal(isOfficialOwnerRankingCandidate({ active: true }), true);
});
