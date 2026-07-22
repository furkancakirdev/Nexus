const NON_COMMERCIAL_CODES = new Set([
  "BIRCAN", "SYSTEM", "SYS", "ADMIN", "SA", "CPM", "CPMAPP", "SQL", "MSSQL",
]);

const UPSTREAM_DOCUMENT_TYPES = new Set([13, 14, 15, 64]);
const SOURCE_SELLER_DOCUMENT_TYPES = new Set([13, 14]);
const OWNER_EVIDENCE_ROLES = new Set([
  "history-entry", "commercial-action", "sales-action", "owner-assignment",
]);
const ISTANBUL_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Istanbul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

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
  if (typeof value === "string") {
    const normalized = value.trim();
    const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    const [, yearText, monthText, dayText] = match;
    const calendarCheck = new Date(Date.UTC(
      Number(yearText), Number(monthText) - 1, Number(dayText),
    ));
    if (calendarCheck.getUTCFullYear() !== Number(yearText)
      || calendarCheck.getUTCMonth() !== Number(monthText) - 1
      || calendarCheck.getUTCDate() !== Number(dayText)) return null;
    const hasExplicitZone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(normalized);
    if (!hasExplicitZone) return `${yearText}-${monthText}-${dayText}`;
  }
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  const parts = Object.fromEntries(ISTANBUL_DATE_FORMATTER
    .formatToParts(parsed)
    .filter((part) => part.type !== "literal")
    .map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
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

function stableEvidenceKey(row) {
  const rootId = text(row?.rootId);
  const lineageId = text(row?.lineageId ?? row?.ancestorId);
  const headerId = text(row?.headerId ?? row?.recId);
  if (!rootId || !lineageId || !headerId) return null;
  return `${rootId}|${lineageId}|${headerId}`;
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
    const matchingStableDocument = documents.find((candidate) => (
      text(candidate.rootId) === text(row.rootId) && documentKey(candidate) === documentKey(row)
    ));
    if (!stableEvidenceKey(row) && matchingStableDocument) continue;
    const identity = stableEvidenceKey(row)
      || `${text(row.rootId)}|${documentKey(row)}|${text(row.lineNo)}`;
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
  const keys = new Set(documents.map(stableEvidenceKey).filter(Boolean));
  return (Array.isArray(actorEvents) ? actorEvents : [])
    .filter((event) => keys.has(stableEvidenceKey(event)))
    .map((event) => ({ ...event }))
    .sort((left, right) => (
      timestamp(left.firstSeen) - timestamp(right.firstSeen)
      || eventKey(left).localeCompare(eventKey(right), "tr")
      || normalizeActorCode(left.actorCode).localeCompare(normalizeActorCode(right.actorCode), "tr")
    ));
}

function isOwnerEvidenceEvent(event) {
  return String(event?.sourceType || "").toLocaleUpperCase("tr-TR") === "MIREVRBAS"
    && OWNER_EVIDENCE_ROLES.has(String(event?.actorRole || "").toLocaleLowerCase("tr-TR"));
}

function sourceTimestampStatus(row, economic) {
  const sourceTimestamp = timestamp(row?.documentDate);
  const finalTimestamp = timestamp(economic?.documentDate);
  if (!Number.isFinite(sourceTimestamp) || !Number.isFinite(finalTimestamp)) {
    return { valid: false, reason: "unproven-source-timestamp" };
  }
  if (sourceTimestamp > finalTimestamp) {
    return { valid: false, reason: "source-after-final" };
  }
  return { valid: true, reason: null };
}

function enabledFlag(value) {
  return value === true || value === 1 || text(value) === "1";
}

function isSameEconomicDocument(row, economic) {
  const rowStableKey = stableEvidenceKey(row);
  const economicStableKey = stableEvidenceKey(economic);
  if (rowStableKey && economicStableKey) return rowStableKey === economicStableKey;
  return documentKey(row) === documentKey(economic);
}

function isPlausibleSourceDocument(row, economic) {
  const sameDocument = isSameEconomicDocument(row, economic);
  if (sameDocument) {
    return Number(economic?.documentType) === 14
      && enabledFlag(row?.active)
      && !enabledFlag(row?.isTest)
      && !enabledFlag(row?.excluded)
      && sourceTimestampStatus(row, economic).valid;
  }
  if (number(row?.depth) <= 0) return false;
  return sourceTimestampStatus(row, economic).valid;
}

function addExcludedActor(excludedActors, item) {
  if (!excludedActors.some((candidate) => (
    candidate.code === item.code
    && candidate.reason === item.reason
    && candidate.source === item.source
  ))) excludedActors.push(item);
}

function actorEvidence(value, atDate, identities, excludedActors, source) {
  const resolved = resolveIdentity(value, atDate, identities);
  if (!resolved.valid) {
    if (resolved.code) addExcludedActor(
      excludedActors,
      { code: resolved.code, reason: resolved.reason, source },
    );
    return null;
  }
  return resolved;
}

function actorEventEvidence(event, identities, excludedActors, source) {
  const code = normalizeActorCode(event?.actorCode);
  if (!dateOnly(event?.firstSeen)) {
    if (code) addExcludedActor(excludedActors, { code, reason: "invalid-event-date", source });
    return null;
  }
  return actorEvidence(event.actorCode, event.firstSeen, identities, excludedActors, source);
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
  const documentByStableKey = new Map(evidenceDocuments
    .map((row) => [stableEvidenceKey(row), row])
    .filter(([stableKey]) => Boolean(stableKey)));
  const excludedActors = [];
  const invalidSourceDocuments = evidenceDocuments
    .filter((row) => number(row.depth) > 0 && UPSTREAM_DOCUMENT_TYPES.has(Number(row.documentType)))
    .flatMap((row) => {
      const status = sourceTimestampStatus(row, economic);
      return status.valid ? [] : [{
        documentType: Number(row.documentType),
        documentNo: text(row.documentNo),
        customerCode: text(row.customerCode),
        lineageId: text(row.lineageId) || null,
        headerId: text(row.headerId) || null,
        reason: status.reason,
      }];
    });
  const sourceOrders = evidenceDocuments.filter((row) => (
    Number(row.documentType) === 14 && isPlausibleSourceDocument(row, economic)
  ));
  const traceSourceOrderNo = sourceOrders
    .find((row) => !isSameEconomicDocument(row, economic))?.documentNo || null;
  const fulfillmentDepot = normalizeDepot(
    economic.depotCode || evidenceDocuments.find((row) => number(row.depth) === 0)?.depotCode,
  );
  const baseEvidence = {
    selected: null,
    excludedActors,
    conflictingActors: [],
    candidateOwnerCode: null,
    invalidSourceDocuments,
  };

  for (const event of events) {
    actorEventEvidence(event, identities, excludedActors, eventKey(event));
  }

  // Makro sahibi, departmanı ve sipariş kimliği aynı doğrulanmış adaydan atomik seçilir.
  const macroCandidates = sourceOrders.flatMap((row) => {
    const department = departmentFromCode(row.departmentCode);
    const selected = actorEvidence(
      row.commercialOwner,
      row.documentDate || economic.documentDate,
      identities,
      excludedActors,
      "macro-source-order",
    );
    if (!department || !selected) return [];
    return [{ row, department, selected }];
  });
  const macroSignatures = new Set(macroCandidates.map((candidate) => (
    `${candidate.selected.code}|${candidate.department}`
  )));
  if (macroSignatures.size > 1) {
    return selectedResult({
      department: "review",
      method: "macro-conflict",
      confidence: "review",
      evidence: {
        ...baseEvidence,
        macroConflicts: macroCandidates.map(({ row, department, selected }) => ({
          ownerCode: selected.code,
          department,
          documentNo: text(row.documentNo),
          lineageId: text(row.lineageId) || null,
          headerId: text(row.headerId) || null,
        })),
      },
      evidenceDocuments,
      actorEvents: events,
      sourceOrderNo: null,
      fulfillmentDepot,
    });
  }
  if (macroCandidates.length > 0) {
    const { row, department, selected } = macroCandidates[0];
    const sourceOrderNo = text(row.documentNo) || null;
    return selectedResult({
      selected,
      department,
      method: "macro-source-order",
      confidence: "confirmed",
      evidence: {
        ...baseEvidence,
        selected: {
          code: selected.code,
          department,
          sourceOrderNo,
          documentKey: documentKey(row),
          lineageId: text(row.lineageId) || null,
          headerId: text(row.headerId) || null,
        },
      },
      evidenceDocuments,
      actorEvents: events,
      sourceOrderNo,
      fulfillmentDepot,
    });
  }

  const ownerEvents = events.filter(isOwnerEvidenceEvent);
  const ownerEventsByDocument = new Map();
  for (const event of ownerEvents) {
    const key = stableEvidenceKey(event);
    if (!key) continue;
    if (!ownerEventsByDocument.has(key)) ownerEventsByDocument.set(key, []);
    ownerEventsByDocument.get(key).push(event);
  }

  // Kaynak SATICINO, yalnızca aynı belgede gerçek MIREVRBAS işlemi varsa kabul edilir.
  for (const row of evidenceDocuments.filter((item) => (
    isPlausibleSourceDocument(item, economic)
    && SOURCE_SELLER_DOCUMENT_TYPES.has(Number(item.documentType))
  ))) {
    const sellerCode = normalizeActorCode(row.commercialOwner);
    if (!sellerCode) continue;
    const supportingEvent = (ownerEventsByDocument.get(stableEvidenceKey(row)) || [])
      .find((event) => normalizeActorCode(event.actorCode) === sellerCode);
    if (!supportingEvent) {
      excludedActors.push({
        code: sellerCode,
        reason: "seller-without-stable-entry-event",
        source: stableEvidenceKey(row) || documentKey(row),
      });
      continue;
    }
    const selected = actorEventEvidence(
      supportingEvent,
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
      sourceOrderNo: traceSourceOrderNo,
      fulfillmentDepot,
    });
  }

  const standaloneRetail = Number(economic.documentType) === 91;
  const historyCandidates = ownerEvents.flatMap((event) => {
    const sourceDocument = documentByStableKey.get(stableEvidenceKey(event));
    const isUpstream = isPlausibleSourceDocument(sourceDocument, economic)
      && UPSTREAM_DOCUMENT_TYPES.has(Number(sourceDocument?.documentType));
    const isRetailHistory = standaloneRetail && Number(sourceDocument?.documentType) === 91;
    if (!isUpstream && !isRetailHistory) return [];
    const selected = actorEventEvidence(
      event,
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
      sourceOrderNo: traceSourceOrderNo,
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
      sourceOrderNo: traceSourceOrderNo,
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
      sourceOrderNo: traceSourceOrderNo,
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
      sourceOrderNo: traceSourceOrderNo,
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
    sourceOrderNo: traceSourceOrderNo,
    fulfillmentDepot,
  });
}
