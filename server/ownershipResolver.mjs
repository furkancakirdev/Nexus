const NON_COMMERCIAL_CODES = new Set([
  "BIRCAN", "SYSTEM", "SYS", "ADMIN", "SA", "CPM", "CPMAPP", "SQL", "MSSQL",
]);

const UPSTREAM_DOCUMENT_TYPES = new Set([13, 14, 15, 64]);
const SOURCE_SELLER_DOCUMENT_TYPES = new Set([13, 14]);
const REAL_HISTORY_ROLES = new Set(["history-entry", "history-change"]);

export const DEFAULT_IDENTITIES = Object.freeze({
  FURKAN: {
    name: "Furkan Çakır", department: "service", location: "Yatmarin", active: true,
  },
  BCETINEL: {
    name: "Burak Çetinel", department: "service", location: "Yatmarin", active: true,
  },
  MKARA: {
    name: "Mehmet Kara", department: "service", location: "Merkez Ofis", active: true,
  },
  OGENCOGLU: {
    name: "Özlenen Gençoğlu", department: "service", location: "Yatmarin", active: false,
    until: "2024-06-30",
  },
  NTOKER: {
    name: "N. Toker", department: "parts", location: "Merkez Ofis", active: false,
  },
  AERIMLI: {
    name: "Alperen Erimli", department: "parts", location: "Merkez Ofis", active: false,
  },
  TSEMIZ: {
    name: "Tuğrul Semiz", department: "parts", location: "Merkez Ofis", active: true,
    assignments: [
      { until: "2026-05-25", department: "service", location: "Yatmarin" },
      { from: "2026-05-26", department: "parts", location: "Merkez Ofis" },
    ],
  },
  BIRCAN: {
    name: "Bircan Çolak", department: null, location: "Merkez Ofis", active: true,
    commercial: false,
  },
  CBELIKIRIK: {
    name: "Can Belikırık", department: "parts", location: "Merkez Ofis", active: true,
  },
  CAN: {
    name: "Can Belikırık", department: "parts", location: "Merkez Ofis", active: true,
  },
  EERDOGAN: {
    name: "Emre Erdoğan", department: "parts", location: "Merkez Ofis", active: true,
  },
  EMRE: {
    name: "Emre Erdoğan", department: "parts", location: "Merkez Ofis", active: true,
  },
});

export function normalizeActorCode(value) {
  return String(value ?? "")
    .trim()
    .toLocaleUpperCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, "");
}

function text(value) {
  return String(value ?? "").trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateOnly(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null;
}

function timestamp(value) {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function departmentFromCode(value) {
  const normalized = normalizeActorCode(value);
  if (!normalized) return null;
  if (normalized.includes("SERVIS")) return "service";
  if (normalized.includes("YEDEKPARCA") || normalized === "PARCA" || normalized.includes("SATIS")) {
    return "parts";
  }
  return null;
}

function normalizeDepot(value) {
  const normalized = normalizeActorCode(value);
  if (!normalized) return { code: null, name: "Belirsiz" };
  if (normalized === "MRK" || normalized.includes("MERKEZ")) {
    return { code: "MRK", name: "Merkez Depo" };
  }
  if (normalized === "YTM" || normalized.includes("YATMARIN")) {
    return { code: "YTM", name: "Yatmarin Depo" };
  }
  return { code: text(value), name: text(value) };
}

function assignmentAt(identity, value) {
  const currentDate = dateOnly(value);
  if (!identity?.assignments?.length || !currentDate) return { ...identity };
  const assignment = identity.assignments.find((item) => (
    (!item.from || currentDate >= item.from) && (!item.until || currentDate <= item.until)
  ));
  return assignment ? { ...identity, ...assignment } : { ...identity };
}

function identityRegistry(overrides) {
  const normalizedOverrides = Object.fromEntries(Object.entries(overrides || {}).map(([code, identity]) => [
    normalizeActorCode(code),
    { ...identity },
  ]));
  return { ...DEFAULT_IDENTITIES, ...normalizedOverrides };
}

function excludedReason(code, identity, value) {
  if (!code) return "empty-code";
  if (/\d/.test(code)) return "customer-like-code";
  if (NON_COMMERCIAL_CODES.has(code) || identity?.commercial === false) return "non-commercial-user";
  const eventDate = dateOnly(value);
  if (identity?.from && eventDate && eventDate < identity.from) return "outside-employment-period";
  if (identity?.until && eventDate && eventDate > identity.until) return "outside-employment-period";
  return null;
}

function resolveIdentity(value, atDate, identities) {
  const code = normalizeActorCode(value);
  const configured = identities[code];
  const reason = excludedReason(code, configured, atDate);
  if (reason) return { code, valid: false, reason, identity: configured || null };
  const identity = assignmentAt(configured || {
    name: `Tanımsız kullanıcı (${code})`,
    department: "parts",
    location: "Merkez Ofis",
    active: true,
    mappingRequired: true,
  }, atDate);
  return { code, valid: true, reason: null, identity };
}

function documentKey(row) {
  return `${Number(row?.documentType)}|${text(row?.documentNo)}|${text(row?.customerCode)}`;
}

function eventKey(row) {
  return text(row?.documentKey) || documentKey(row);
}

function normalizeDocuments(economic, lineage) {
  const documents = [];
  const seen = new Set();
  const candidates = [...(Array.isArray(lineage) ? lineage : []), { ...economic, depth: 0 }];
  for (const row of candidates) {
    if (!row || !text(row.documentNo) || !Number.isInteger(Number(row.documentType))) continue;
    const identity = `${documentKey(row)}|${text(row.lineNo)}|${text(row.lineageId ?? row.ancestorId ?? row.rootId)}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    documents.push({ ...row, depth: number(row.depth) });
  }
  return documents.sort((left, right) => (
    number(right.depth) - number(left.depth)
    || timestamp(left.documentDate) - timestamp(right.documentDate)
    || documentKey(left).localeCompare(documentKey(right), "tr")
  ));
}

function relevantEvents(actorEvents, documents) {
  const keys = new Set(documents.map(documentKey));
  return (Array.isArray(actorEvents) ? actorEvents : [])
    .filter((event) => keys.has(eventKey(event)))
    .map((event) => ({ ...event }))
    .sort((left, right) => (
      timestamp(left.firstSeen) - timestamp(right.firstSeen)
      || eventKey(left).localeCompare(eventKey(right), "tr")
      || normalizeActorCode(left.actorCode).localeCompare(normalizeActorCode(right.actorCode), "tr")
    ));
}

function isRealHistoryEvent(event) {
  return String(event?.sourceType || "").toLocaleUpperCase("tr-TR") === "MIREVRBAS"
    && REAL_HISTORY_ROLES.has(String(event?.actorRole || "").toLocaleLowerCase("tr-TR"));
}

function isPlausibleSourceDocument(row, economic) {
  const sameDocument = documentKey(row) === documentKey(economic);
  if (sameDocument) return Number(economic?.documentType) === 14;
  if (number(row?.depth) <= 0) return false;
  const rowDate = timestamp(row?.documentDate);
  const economicDate = timestamp(economic?.documentDate);
  return rowDate === Number.POSITIVE_INFINITY
    || economicDate === Number.POSITIVE_INFINITY
    || rowDate <= economicDate;
}

function actorEvidence(value, atDate, identities, excludedActors, source) {
  const resolved = resolveIdentity(value, atDate, identities);
  if (!resolved.valid) {
    if (resolved.code) excludedActors.push({ code: resolved.code, reason: resolved.reason, source });
    return null;
  }
  return resolved;
}

function selectedResult({
  selected = null,
  department,
  method,
  confidence,
  evidence,
  evidenceDocuments,
  actorEvents,
  sourceOrderNo,
  fulfillmentDepot,
}) {
  const expectedDepot = department === "service" ? "YTM" : department === "parts" ? "MRK" : null;
  return {
    department,
    ownerCode: selected?.code || null,
    ownerName: selected?.identity?.name || "Belirsiz",
    ownerActive: selected?.identity?.active ?? null,
    ownerLocation: selected?.identity?.location || "Belirsiz",
    method,
    confidence,
    sourceOrderNo,
    evidenceDocuments: evidenceDocuments.map((row) => ({ ...row })),
    actorEvents: actorEvents.map((row) => ({ ...row })),
    fulfillmentDepotCode: fulfillmentDepot.code,
    fulfillmentDepotName: fulfillmentDepot.name,
    crossDepot: Boolean(
      expectedDepot && fulfillmentDepot.code && fulfillmentDepot.code !== expectedDepot,
    ),
    evidence: {
      ...evidence,
      identityMappingRequired: Boolean(selected?.identity?.mappingRequired),
    },
  };
}

/**
 * Nihai ekonomik satırın ticari sahibini tam belge zincirinden çözer.
 * Girdi satırlarını değiştirmez; seçilen ve dışlanan kanıtları denetime açar.
 *
 * @param {Object} input
 * @param {Object} input.economic
 * @param {Object[]} [input.lineage]
 * @param {Object[]} [input.actorEvents]
 * @param {Record<string, Object>} [input.identities]
 */
export function resolveCommercialOwnership({
  economic = {},
  lineage = [],
  actorEvents = [],
  identities: identityOverrides = {},
} = {}) {
  const identities = identityRegistry(identityOverrides);
  const evidenceDocuments = normalizeDocuments(economic, lineage);
  const events = relevantEvents(actorEvents, evidenceDocuments);
  const documentByKey = new Map(evidenceDocuments.map((row) => [documentKey(row), row]));
  const excludedActors = [];
  const sourceOrders = evidenceDocuments.filter((row) => (
    Number(row.documentType) === 14 && isPlausibleSourceDocument(row, economic)
  ));
  const sourceOrderNo = sourceOrders[0]?.documentNo || null;
  const fulfillmentDepot = normalizeDepot(
    economic.depotCode || evidenceDocuments.find((row) => number(row.depth) === 0)?.depotCode,
  );
  const baseEvidence = {
    selected: null,
    excludedActors,
    conflictingActors: [],
    candidateOwnerCode: null,
  };

  for (const event of events) {
    const eventDocument = documentByKey.get(eventKey(event));
    const resolved = resolveIdentity(
      event.actorCode,
      eventDocument?.documentDate || event.firstSeen || economic.documentDate,
      identities,
    );
    if (!resolved.valid && resolved.code) {
      excludedActors.push({ code: resolved.code, reason: resolved.reason, source: eventKey(event) });
    }
  }

  // Makro siparişi, açık departman ve sahip birlikte taşındığında en güçlü kanıttır.
  for (const row of sourceOrders) {
    const department = departmentFromCode(row.departmentCode);
    const selected = actorEvidence(
      row.commercialOwner,
      row.documentDate || economic.documentDate,
      identities,
      excludedActors,
      "macro-source-order",
    );
    if (!department || !selected) continue;
    return selectedResult({
      selected,
      department,
      method: "macro-source-order",
      confidence: "confirmed",
      evidence: { ...baseEvidence, selected: { code: selected.code, documentKey: documentKey(row) } },
      evidenceDocuments,
      actorEvents: events,
      sourceOrderNo,
      fulfillmentDepot,
    });
  }

  const realEvents = events.filter(isRealHistoryEvent);
  const realEventsByDocument = new Map();
  for (const event of realEvents) {
    const key = eventKey(event);
    if (!realEventsByDocument.has(key)) realEventsByDocument.set(key, []);
    realEventsByDocument.get(key).push(event);
  }

  // Kaynak SATICINO, yalnızca aynı belgede gerçek MIREVRBAS işlemi varsa kabul edilir.
  for (const row of evidenceDocuments.filter((item) => (
    isPlausibleSourceDocument(item, economic)
    && SOURCE_SELLER_DOCUMENT_TYPES.has(Number(item.documentType))
  ))) {
    const sellerCode = normalizeActorCode(row.commercialOwner);
    if (!sellerCode) continue;
    const supportingEvent = (realEventsByDocument.get(documentKey(row)) || [])
      .find((event) => normalizeActorCode(event.actorCode) === sellerCode);
    if (!supportingEvent) {
      excludedActors.push({ code: sellerCode, reason: "seller-without-real-event", source: documentKey(row) });
      continue;
    }
    const selected = actorEvidence(
      sellerCode,
      row.documentDate || supportingEvent.firstSeen || economic.documentDate,
      identities,
      excludedActors,
      "supported-source-seller",
    );
    if (!selected) continue;
    return selectedResult({
      selected,
      department: selected.identity.department,
      method: "supported-source-seller",
      confidence: "confirmed",
      evidence: { ...baseEvidence, selected: { code: selected.code, documentKey: documentKey(row) } },
      evidenceDocuments,
      actorEvents: events,
      sourceOrderNo,
      fulfillmentDepot,
    });
  }

  const standaloneRetail = Number(economic.documentType) === 91;
  const historyCandidates = realEvents.flatMap((event) => {
    const sourceDocument = documentByKey.get(eventKey(event));
    const isUpstream = isPlausibleSourceDocument(sourceDocument, economic)
      && UPSTREAM_DOCUMENT_TYPES.has(Number(sourceDocument?.documentType));
    const isRetailHistory = standaloneRetail && Number(sourceDocument?.documentType) === 91;
    if (!isUpstream && !isRetailHistory) return [];
    const selected = actorEvidence(
      event.actorCode,
      event.firstSeen || sourceDocument?.documentDate || economic.documentDate,
      identities,
      excludedActors,
      eventKey(event),
    );
    return selected ? [{ event, sourceDocument, selected, isRetailHistory }] : [];
  }).sort((left, right) => (
    timestamp(left.event.firstSeen) - timestamp(right.event.firstSeen)
    || number(right.sourceDocument?.depth) - number(left.sourceDocument?.depth)
    || left.selected.code.localeCompare(right.selected.code, "tr")
  ));

  if (historyCandidates.length > 0) {
    const winner = historyCandidates[0];
    const conflictingActors = [...new Set(historyCandidates
      .slice(1)
      .map((candidate) => candidate.selected.code)
      .filter((code) => code !== winner.selected.code))];
    return selectedResult({
      selected: winner.selected,
      department: winner.selected.identity.department,
      method: winner.isRetailHistory ? "retail-history" : "upstream-history",
      confidence: "inferred",
      evidence: {
        ...baseEvidence,
        selected: { code: winner.selected.code, documentKey: eventKey(winner.event) },
        conflictingActors,
      },
      evidenceDocuments,
      actorEvents: events,
      sourceOrderNo,
      fulfillmentDepot,
    });
  }

  const consensusActors = [];
  for (const row of evidenceDocuments.filter((item) => isPlausibleSourceDocument(item, economic))) {
    for (const [field, value] of [["preparerUser", row.preparerUser], ["entryUser", row.entryUser]]) {
      const selected = actorEvidence(
        value,
        row.documentDate || economic.documentDate,
        identities,
        excludedActors,
        `${documentKey(row)}:${field}`,
      );
      if (selected) consensusActors.push(selected);
    }
  }
  const distinctConsensusActors = [...new Map(consensusActors.map((item) => [item.code, item])).values()];
  const consensusDepartments = new Set(distinctConsensusActors.map((item) => item.identity.department));
  if (distinctConsensusActors.length >= 2 && consensusDepartments.size === 1) {
    return selectedResult({
      department: [...consensusDepartments][0],
      method: "same-department-consensus",
      confidence: "review",
      evidence: {
        ...baseEvidence,
        consensusActors: distinctConsensusActors.map((item) => item.code),
      },
      evidenceDocuments,
      actorEvents: events,
      sourceOrderNo,
      fulfillmentDepot,
    });
  }

  const candidateOwnerCode = normalizeActorCode(economic.candidateAttributionActor);
  const candidate = actorEvidence(
    candidateOwnerCode,
    economic.candidateAttributionDocumentDate || economic.documentDate,
    identities,
    excludedActors,
    "b2b-candidate-hint",
  );
  if (candidate) {
    return selectedResult({
      department: candidate.identity.department,
      method: "b2b-candidate-hint",
      confidence: "review",
      evidence: {
        ...baseEvidence,
        candidateOwnerCode: candidate.code,
        candidateDocumentNo: economic.candidateAttributionDocumentNo || null,
        candidateDocumentType: economic.candidateAttributionDocumentType || null,
        candidateField: economic.candidateAttributionField || null,
      },
      evidenceDocuments,
      actorEvents: events,
      sourceOrderNo,
      fulfillmentDepot,
    });
  }

  const depotDepartment = fulfillmentDepot.code === "YTM"
    ? "service"
    : fulfillmentDepot.code === "MRK" ? "parts" : null;
  if (depotDepartment) {
    return selectedResult({
      department: depotDepartment,
      method: "depot-fallback",
      confidence: "review",
      evidence: baseEvidence,
      evidenceDocuments,
      actorEvents: events,
      sourceOrderNo,
      fulfillmentDepot,
    });
  }

  return selectedResult({
    department: "review",
    method: "review-required",
    confidence: "review",
    evidence: baseEvidence,
    evidenceDocuments,
    actorEvents: events,
    sourceOrderNo,
    fulfillmentDepot,
  });
}
