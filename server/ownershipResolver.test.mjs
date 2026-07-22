import assert from "node:assert/strict";
import test from "node:test";
import { resolveCommercialOwnership } from "./ownershipResolver.mjs";

function document(overrides = {}) {
  const row = {
    rootId: "ROOT-1",
    documentType: 85,
    documentNo: "F-1",
    customerCode: "C-1",
    documentDate: "2026-07-01T00:00:00.000Z",
    depth: 0,
    commercialOwner: null,
    departmentCode: null,
    depotCode: "MRK",
    preparerUser: null,
    entryUser: null,
    modifierUser: null,
    ...overrides,
  };
  return {
    ...row,
    lineageId: Object.hasOwn(overrides, "lineageId")
      ? overrides.lineageId
      : `LINE|${row.documentType}|${row.documentNo}|${row.customerCode}`,
    headerId: Object.hasOwn(overrides, "headerId")
      ? overrides.headerId
      : `HEADER|${row.documentType}|${row.documentNo}|${row.customerCode}`,
  };
}

function actor(documentRow, actorCode, overrides = {}) {
  return {
    rootId: documentRow.rootId,
    lineageId: documentRow.lineageId,
    headerId: documentRow.headerId,
    documentKey: `${documentRow.documentType}|${documentRow.documentNo}|${documentRow.customerCode}`,
    documentType: documentRow.documentType,
    documentNo: documentRow.documentNo,
    customerCode: documentRow.customerCode,
    actorCode,
    actorRole: "history-entry",
    sourceType: "MIREVRBAS",
    firstSeen: documentRow.documentDate,
    lastSeen: documentRow.documentDate,
    actionCount: 1,
    ...overrides,
  };
}

function caseEvidence({
  economic = {},
  lineage = [],
  actorEvents = [],
  identities,
} = {}) {
  return {
    economic: {
      rootId: "ROOT-1",
      documentType: 85,
      documentNo: "F-1",
      customerCode: "C-1",
      documentDate: "2026-07-01T00:00:00.000Z",
      depotCode: "MRK",
      ...economic,
    },
    lineage,
    actorEvents,
    identities,
  };
}

test("macro source order beats central-depot invoice user", () => {
  const invoice = document({ entryUser: "CBELIKIRIK" });
  const sourceOrder = document({
    documentType: 14,
    documentNo: "SSP-100",
    documentDate: "2026-06-28T00:00:00.000Z",
    depth: 3,
    commercialOwner: "FURKAN",
    departmentCode: "SERVIS",
  });

  const result = resolveCommercialOwnership(caseEvidence({
    lineage: [invoice, sourceOrder],
    actorEvents: [actor(invoice, "CBELIKIRIK")],
  }));

  assert.equal(result.ownerCode, "FURKAN");
  assert.equal(result.ownerName, "Furkan Çakır");
  assert.equal(result.department, "service");
  assert.equal(result.method, "macro-source-order");
  assert.equal(result.confidence, "confirmed");
  assert.equal(result.sourceOrderNo, "SSP-100");
  assert.equal(result.fulfillmentDepotCode, "MRK");
  assert.equal(result.crossDepot, true);
});

test("ignores Bircan and terminal invoice modifiers", () => {
  const invoice = document({ modifierUser: "BIRCAN" });
  const source = document({
    documentType: 14,
    documentNo: "SSP-101",
    documentDate: "2026-06-29T00:00:00.000Z",
    depth: 2,
    entryUser: "MKARA",
  });

  const result = resolveCommercialOwnership(caseEvidence({
    lineage: [invoice, source],
    actorEvents: [
      actor(invoice, "BIRCAN", { actorRole: "history-change" }),
      actor(source, "MKARA", { firstSeen: "2026-06-29T08:00:00.000Z" }),
    ],
  }));

  assert.equal(result.ownerCode, "MKARA");
  assert.equal(result.ownerName, "Mehmet Kara");
  assert.equal(result.department, "service");
  assert.equal(result.method, "upstream-history");
  assert.equal(result.evidence.excludedActors.some((item) => item.code === "BIRCAN"), true);
});

test("history-change is audit-only and cannot support source SATICINO", () => {
  const source = document({
    documentType: 14,
    documentNo: "SSP-MODIFIER",
    documentDate: "2026-06-29T00:00:00",
    depth: 2,
    commercialOwner: "CBELIKIRIK",
  });
  const result = resolveCommercialOwnership(caseEvidence({
    lineage: [document(), source],
    actorEvents: [
      actor(source, "MKARA", { firstSeen: "2026-06-29T08:00:00" }),
      actor(source, "CBELIKIRIK", {
        actorRole: "history-change",
        firstSeen: "2026-06-29T09:00:00",
      }),
    ],
  }));

  assert.equal(result.ownerCode, "MKARA");
  assert.equal(result.method, "upstream-history");
  assert.equal(result.confidence, "inferred");
  assert.equal(result.actorEvents.some((event) => (
    event.actorCode === "CBELIKIRIK" && event.actorRole === "history-change"
  )), true);
});

test("source SATICINO is used only when a real actor event supports it", () => {
  const source = document({
    documentType: 14,
    documentNo: "SSP-102",
    documentDate: "2026-06-29T00:00:00.000Z",
    depth: 2,
    commercialOwner: "FURKAN",
  });

  const result = resolveCommercialOwnership(caseEvidence({
    lineage: [document(), source],
    actorEvents: [actor(source, "MKARA", { firstSeen: "2026-06-29T08:00:00.000Z" })],
  }));

  assert.equal(result.ownerCode, "MKARA");
  assert.equal(result.method, "upstream-history");
  assert.equal(result.evidence.excludedActors.some((item) => item.code === "FURKAN"), true);
});

test("reused document text cannot support a seller through another header identity", () => {
  const source = document({
    lineageId: "LINE-SOURCE-A",
    headerId: "HEADER-SOURCE-A",
    documentType: 14,
    documentNo: "SSP-REUSED",
    documentDate: "2026-06-29T00:00:00",
    depth: 2,
    commercialOwner: "FURKAN",
  });
  const result = resolveCommercialOwnership(caseEvidence({
    lineage: [document(), source],
    actorEvents: [
      actor(source, "FURKAN", {
        lineageId: "LINE-OTHER-PERIOD",
        headerId: "HEADER-OTHER-PERIOD",
        firstSeen: "2026-01-02T08:00:00",
      }),
      actor(source, "MKARA", { firstSeen: "2026-06-29T08:00:00" }),
    ],
  }));

  assert.equal(result.ownerCode, "MKARA");
  assert.equal(result.method, "upstream-history");
  assert.equal(result.evidence.excludedActors.some((item) => (
    item.code === "FURKAN" && item.reason === "seller-without-stable-entry-event"
  )), true);
});

test("a later document cannot masquerade as the source order", () => {
  const futureOrder = document({
    documentType: 14,
    documentNo: "SSP-FUTURE",
    documentDate: "2026-07-02T00:00:00.000Z",
    depth: 2,
    commercialOwner: "FURKAN",
    departmentCode: "SERVIS",
  });
  const offer = document({
    documentType: 13,
    documentNo: "TKL-REAL",
    documentDate: "2026-06-29T00:00:00.000Z",
    depth: 3,
  });
  const result = resolveCommercialOwnership(caseEvidence({
    lineage: [document(), futureOrder, offer],
    actorEvents: [actor(offer, "MKARA")],
  }));

  assert.equal(result.ownerCode, "MKARA");
  assert.equal(result.method, "upstream-history");
  assert.equal(result.sourceOrderNo, null);
});

test("undated or invalid-dated macro sources cannot become confirmed", () => {
  for (const [sourceDate, finalDate] of [
    [null, "2026-07-01T10:00:00"],
    ["2026-06-29T10:00:00", "invalid-final-date"],
  ]) {
    const source = document({
      documentType: 14,
      documentNo: `SSP-UNDATED-${String(sourceDate)}`,
      documentDate: sourceDate,
      depth: 2,
      commercialOwner: "FURKAN",
      departmentCode: "SERVIS",
      depotCode: null,
    });
    const result = resolveCommercialOwnership(caseEvidence({
      economic: { documentDate: finalDate, depotCode: null },
      lineage: [source],
    }));

    assert.equal(result.ownerCode, null);
    assert.equal(result.department, "review");
    assert.equal(result.method, "review-required");
    assert.equal(result.confidence, "review");
    assert.equal(result.sourceOrderNo, null);
    assert.equal(result.evidence.invalidSourceDocuments.some((item) => (
      item.documentNo === source.documentNo && item.reason === "unproven-source-timestamp"
    )), true);
  }
});

test("valid macro candidate atomically supplies owner department and order number", () => {
  const invalid = document({
    documentType: 14,
    documentNo: "SSP-INVALID-OWNER",
    documentDate: "2026-06-20T10:00:00",
    depth: 4,
    commercialOwner: "BIRCAN",
    departmentCode: "SERVIS",
  });
  const valid = document({
    documentType: 14,
    documentNo: "SSP-VALID-OWNER",
    documentDate: "2026-06-21T10:00:00",
    depth: 3,
    commercialOwner: "FURKAN",
    departmentCode: "SERVIS",
  });
  const result = resolveCommercialOwnership(caseEvidence({
    lineage: [document(), invalid, valid],
  }));

  assert.equal(result.ownerCode, "FURKAN");
  assert.equal(result.department, "service");
  assert.equal(result.sourceOrderNo, "SSP-VALID-OWNER");
  assert.equal(result.evidence.selected.sourceOrderNo, "SSP-VALID-OWNER");
  assert.equal(result.evidence.selected.headerId, valid.headerId);
  assert.equal(result.evidence.selected.lineageId, valid.lineageId);
});

test("conflicting same-rank macro candidates are quarantined for review", () => {
  const serviceOrder = document({
    documentType: 14,
    documentNo: "SSP-CONFLICT-SERVICE",
    documentDate: "2026-06-20T10:00:00",
    depth: 3,
    commercialOwner: "FURKAN",
    departmentCode: "SERVIS",
  });
  const partsOrder = document({
    documentType: 14,
    documentNo: "SSP-CONFLICT-PARTS",
    documentDate: "2026-06-21T10:00:00",
    depth: 3,
    commercialOwner: "CBELIKIRIK",
    departmentCode: "YEDEK PARCA SATIS",
  });
  const result = resolveCommercialOwnership(caseEvidence({
    lineage: [document(), serviceOrder, partsOrder],
  }));

  assert.equal(result.ownerCode, null);
  assert.equal(result.department, "review");
  assert.equal(result.method, "macro-conflict");
  assert.equal(result.confidence, "review");
  assert.equal(result.sourceOrderNo, null);
  assert.deepEqual(
    result.evidence.macroConflicts.map((item) => [item.ownerCode, item.department]).sort(),
    [["CBELIKIRIK", "parts"], ["FURKAN", "service"]],
  );
});

test("rejects stale OGENCOGLU template evidence after June 2024", () => {
  const source = document({
    documentType: 14,
    documentNo: "SSP-103",
    documentDate: "2026-06-09T00:00:00.000Z",
    depth: 2,
    commercialOwner: "OGENCOGLU",
    entryUser: "FURKAN",
  });

  const result = resolveCommercialOwnership(caseEvidence({
    economic: { documentDate: "2026-06-09T00:00:00.000Z" },
    lineage: [document({ documentDate: "2026-06-09T00:00:00.000Z" }), source],
    actorEvents: [
      actor(source, "OGENCOGLU", { firstSeen: "2026-06-09T08:00:00.000Z" }),
      actor(source, "FURKAN", { firstSeen: "2026-06-09T09:00:00.000Z" }),
    ],
  }));

  assert.equal(result.ownerCode, "FURKAN");
  assert.equal(result.ownerName, "Furkan Çakır");
  assert.equal(result.department, "service");
  assert.equal(result.evidence.excludedActors.some((item) => item.code === "OGENCOGLU"), true);
});

test("keeps OGENCOGLU historical work in service before the provisional cutoff", () => {
  const source = document({
    documentType: 14,
    documentNo: "SSP-OLD",
    documentDate: "2024-06-30T00:00:00.000Z",
    depth: 2,
    commercialOwner: "OGENCOGLU",
  });
  const result = resolveCommercialOwnership(caseEvidence({
    economic: { documentDate: "2024-06-30T00:00:00.000Z" },
    lineage: [source],
    actorEvents: [actor(source, "OGENCOGLU")],
  }));

  assert.equal(result.ownerCode, "OGENCOGLU");
  assert.equal(result.ownerName, "Özlenen Gençoğlu");
  assert.equal(result.department, "service");
  assert.equal(result.ownerActive, false);
});

test("uses standalone retail history entry as commercial evidence", () => {
  const retail = document({ documentType: 91, documentNo: "P-1", entryUser: "BCETINEL" });
  const result = resolveCommercialOwnership(caseEvidence({
    economic: { documentType: 91, documentNo: "P-1" },
    lineage: [retail],
    actorEvents: [actor(retail, "BCETINEL")],
  }));

  assert.equal(result.ownerCode, "BCETINEL");
  assert.equal(result.ownerName, "Burak Çetinel");
  assert.equal(result.department, "service");
  assert.equal(result.method, "retail-history");
});

test("uses historical Tuğrul department at the assignment boundary", () => {
  for (const [date, department] of [
    ["2026-05-25T00:00:00.000Z", "service"],
    ["2026-05-26T00:00:00.000Z", "parts"],
  ]) {
    const source = document({
      documentType: 14,
      documentNo: `SSP-${date.slice(8, 10)}`,
      documentDate: date,
      depth: 2,
    });
    const result = resolveCommercialOwnership(caseEvidence({
      economic: { documentDate: date },
      lineage: [source],
      actorEvents: [actor(source, "TSEMİZ")],
    }));
    assert.equal(result.department, department);
    assert.equal(result.ownerName, "Tuğrul Semiz");
  }
});

test("uses the real actor event date instead of a later document date", () => {
  const source = document({
    documentType: 13,
    documentNo: "TKL-TSEMIZ",
    documentDate: "2026-05-26T00:00:00.000Z",
    depth: 2,
  });
  const result = resolveCommercialOwnership(caseEvidence({
    economic: { documentDate: "2026-05-26T00:00:00.000Z" },
    lineage: [source],
    actorEvents: [actor(source, "TSEMİZ", { firstSeen: "2026-05-25T23:55:00+03:00" })],
  }));

  assert.equal(result.ownerCode, "TSEMIZ");
  assert.equal(result.department, "service");
  assert.equal(result.ownerLocation, "Yatmarin");
});

test("supported source seller uses the actual entry event date", () => {
  const source = document({
    documentType: 14,
    documentNo: "SSP-TSEMIZ-EVENT",
    documentDate: "2026-05-26T09:00:00",
    depth: 2,
    commercialOwner: "TSEMİZ",
  });
  const result = resolveCommercialOwnership(caseEvidence({
    economic: { documentDate: "2026-05-26T10:00:00" },
    lineage: [source],
    actorEvents: [actor(source, "TSEMİZ", { firstSeen: "2026-05-25T23:55:00+03:00" })],
  }));

  assert.equal(result.ownerCode, "TSEMIZ");
  assert.equal(result.department, "service");
  assert.equal(result.method, "supported-source-seller");
});

test("undated actor event cannot borrow the document date for effective identity", () => {
  const source = document({
    documentType: 14,
    documentNo: "SSP-TSEMIZ-NO-EVENT-DATE",
    documentDate: "2026-05-26T09:00:00",
    depth: 2,
    commercialOwner: "TSEMİZ",
    depotCode: null,
  });
  const result = resolveCommercialOwnership(caseEvidence({
    economic: { documentDate: "2026-05-26T10:00:00", depotCode: null },
    lineage: [source],
    actorEvents: [actor(source, "TSEMİZ", { firstSeen: null })],
  }));

  assert.equal(result.ownerCode, null);
  assert.equal(result.department, "review");
  assert.equal(result.method, "review-required");
  assert.equal(result.evidence.excludedActors.some((item) => (
    item.code === "TSEMIZ" && item.reason === "invalid-event-date"
  )), true);
});

test("Istanbul midnight keeps TSEMIZ on the May 26 assignment", () => {
  const source = document({
    documentType: 13,
    documentNo: "TKL-TSEMIZ-MIDNIGHT",
    documentDate: "2026-05-26T00:30:00+03:00",
    depth: 2,
  });
  const result = resolveCommercialOwnership(caseEvidence({
    economic: { documentDate: "2026-05-26T10:00:00+03:00" },
    lineage: [source],
    actorEvents: [actor(source, "TSEMİZ", { firstSeen: "2026-05-26T00:30:00+03:00" })],
  }));

  assert.equal(result.department, "parts");
  assert.equal(result.ownerLocation, "Merkez Ofis");
});

test("Istanbul midnight rejects OGENCOGLU after the June cutoff", () => {
  const source = document({
    documentType: 13,
    documentNo: "TKL-OGEN-MIDNIGHT",
    documentDate: "2024-07-01T00:30:00+03:00",
    depth: 2,
  });
  const result = resolveCommercialOwnership(caseEvidence({
    economic: { documentDate: "2024-07-01T10:00:00+03:00" },
    lineage: [source],
    actorEvents: [
      actor(source, "OGENCOGLU", { firstSeen: "2024-07-01T00:30:00+03:00" }),
      actor(source, "FURKAN", { firstSeen: "2024-07-01T01:00:00+03:00" }),
    ],
  }));

  assert.equal(result.ownerCode, "FURKAN");
  assert.equal(result.evidence.excludedActors.some((item) => item.code === "OGENCOGLU"), true);
});

test("Mehmet remains service when central depot fulfills the sale", () => {
  const source = document({ documentType: 14, documentNo: "SSP-104", depth: 2 });
  const result = resolveCommercialOwnership(caseEvidence({
    economic: { depotCode: "MRK" },
    lineage: [source],
    actorEvents: [actor(source, "MKARA")],
  }));

  assert.equal(result.ownerCode, "MKARA");
  assert.equal(result.department, "service");
  assert.equal(result.fulfillmentDepotCode, "MRK");
  assert.equal(result.crossDepot, true);
});

test("rejects customer-card-like actor codes", () => {
  const source = document({ documentType: 14, documentNo: "SSP-105", depth: 2 });
  const result = resolveCommercialOwnership(caseEvidence({
    economic: { depotCode: null },
    lineage: [source],
    actorEvents: [actor(source, "DBS003")],
  }));

  assert.equal(result.ownerCode, null);
  assert.equal(result.ownerName, "Belirsiz");
  assert.equal(result.department, "review");
  assert.equal(result.method, "review-required");
});

test("B2B nearby candidate assigns only a review-required department hint", () => {
  const result = resolveCommercialOwnership(caseEvidence({
    economic: {
      depotCode: null,
      candidateAttributionActor: "FURKAN",
      candidateAttributionField: "EVRAKHAZIRLAYAN",
      candidateAttributionDocumentType: 64,
      candidateAttributionDocumentNo: "B2B-1",
      candidateAttributionDocumentDate: "2026-06-30T00:00:00.000Z",
    },
    lineage: [document({ depotCode: null })],
  }));

  assert.equal(result.ownerCode, null);
  assert.equal(result.department, "service");
  assert.equal(result.method, "b2b-candidate-hint");
  assert.equal(result.confidence, "review");
  assert.equal(result.evidence.candidateOwnerCode, "FURKAN");
});

test("unknown alphabetic actor keeps an explicit full-name placeholder", () => {
  const source = document({ documentType: 13, documentNo: "TKL-1", depth: 3 });
  const result = resolveCommercialOwnership(caseEvidence({
    lineage: [source],
    actorEvents: [actor(source, "YENIKULLANICI")],
  }));

  assert.equal(result.ownerCode, "YENIKULLANICI");
  assert.equal(result.ownerName, "Tanımsız kullanıcı (YENIKULLANICI)");
  assert.equal(result.department, "parts");
  assert.equal(result.evidence.identityMappingRequired, true);
});

test("earliest upstream history event wins when commercial actors conflict", () => {
  const offer = document({
    documentType: 13,
    documentNo: "TKL-2",
    documentDate: "2026-06-20T00:00:00.000Z",
    depth: 4,
  });
  const order = document({
    documentType: 14,
    documentNo: "SSP-106",
    documentDate: "2026-06-21T00:00:00.000Z",
    depth: 3,
  });
  const approval = document({
    documentType: 64,
    documentNo: "ONAY-2",
    documentDate: "2026-06-22T00:00:00.000Z",
    depth: 2,
  });
  const dispatch = document({
    documentType: 15,
    documentNo: "IRS-2",
    documentDate: "2026-06-23T00:00:00.000Z",
    depth: 1,
    commercialOwner: "CBELIKIRIK",
  });
  const result = resolveCommercialOwnership(caseEvidence({
    lineage: [document(), dispatch, approval, order, offer],
    actorEvents: [
      actor(order, "CBELIKIRIK", { firstSeen: "2026-06-21T08:00:00.000Z" }),
      actor(offer, "FURKAN", { firstSeen: "2026-06-20T08:00:00.000Z" }),
      actor(approval, "MKARA", { firstSeen: "2026-06-22T08:00:00.000Z" }),
      actor(dispatch, "CBELIKIRIK", { firstSeen: "2026-06-23T08:00:00.000Z" }),
    ],
  }));

  assert.equal(result.ownerCode, "FURKAN");
  assert.equal(result.method, "upstream-history");
  assert.deepEqual(result.evidence.conflictingActors, ["CBELIKIRIK", "MKARA"]);
  assert.deepEqual(
    result.evidenceDocuments.map((row) => row.documentType),
    [13, 14, 64, 15, 85],
  );
});

test("same-department actor consensus does not invent a person owner", () => {
  const result = resolveCommercialOwnership(caseEvidence({
    economic: { depotCode: null },
    lineage: [
      document({ documentType: 13, documentNo: "TKL-3", depth: 3, entryUser: "FURKAN" }),
      document({ documentType: 14, documentNo: "SSP-107", depth: 2, preparerUser: "MKARA" }),
    ],
  }));

  assert.equal(result.ownerCode, null);
  assert.equal(result.department, "service");
  assert.equal(result.method, "same-department-consensus");
  assert.equal(result.confidence, "review");
});

test("no ownership evidence remains visibly review-required", () => {
  const result = resolveCommercialOwnership(caseEvidence({
    economic: { depotCode: null },
    lineage: [document({ depotCode: null })],
  }));

  assert.equal(result.ownerCode, null);
  assert.equal(result.department, "review");
  assert.equal(result.method, "review-required");
  assert.equal(result.confidence, "review");
  assert.equal(result.evidenceDocuments.length, 1);
  assert.deepEqual(result.actorEvents, []);
});
