const finite = (value) => typeof value === "number" && Number.isFinite(value) ? value : null;

export function buildFinancialVisibility(metric = null) {
  const source = metric?.try || {};
  const confirmed = metric?.scope?.confirmed || {};
  const missing = metric?.scope?.costReview || {};
  const reviewLines = finite(missing.lines) ?? finite(metric?.evidence?.reviewLines);
  const netSales = finite(source.netSales);
  const knownCost = finite(source.cost);
  const provisionalProfit = finite(source.profit);
  const provisionalMargin = finite(source.margin);
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
    confirmedLines: finite(confirmed.lines) ?? 0,
    confirmedNetSales: finite(confirmed.netSales),
    confirmedCost: finite(confirmed.cost),
    confirmedProfit: finite(confirmed.profit),
    confirmedMargin: finite(confirmed.margin),
    missingLines: reviewLines,
    missingNetSales: finite(missing.netSales),
    knownMissingCost: finite(missing.cost),
  };
}
