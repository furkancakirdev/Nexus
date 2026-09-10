const finite = (value) => typeof value === "number" && Number.isFinite(value) ? value : null;

export function buildFinancialVisibility(metric = null) {
  const source = metric?.try || {};
  const confirmed = metric?.scope?.confirmed || {};
  const missing = metric?.scope?.costReview || {};
  const reviewLines = finite(missing.lines) ?? finite(metric?.evidence?.reviewLines);
  const confirmedLines = finite(confirmed.lines) ?? 0;
  const netSales = finite(source.netSales);
  const rawKnownCost = finite(source.cost);
  const hasKnownCostEvidence = metric?.status === "TAMAM"
    || confirmedLines > 0;
  const knownCost = hasKnownCostEvidence ? rawKnownCost : null;
  const provisionalProfit = hasKnownCostEvidence ? finite(source.profit) : null;
  const provisionalMargin = hasKnownCostEvidence ? finite(source.margin) : null;
  return {
    complete: metric?.status === "TAMAM"
      && reviewLines === 0
      && netSales !== null
      && knownCost !== null
      && provisionalProfit !== null,
    netSales,
    knownCost,
    provisionalProfit,
    provisionalMargin,
    hasKnownCostEvidence,
    confirmedLines,
    confirmedNetSales: confirmedLines > 0 ? finite(confirmed.netSales) : null,
    confirmedCost: confirmedLines > 0 ? finite(confirmed.cost) : null,
    confirmedProfit: confirmedLines > 0 ? finite(confirmed.profit) : null,
    confirmedMargin: confirmedLines > 0 ? finite(confirmed.margin) : null,
    missingLines: reviewLines,
    missingNetSales: finite(missing.netSales),
    knownMissingCost: finite(missing.cost),
  };
}
