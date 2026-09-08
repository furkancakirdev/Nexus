import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { createServer } from "vite";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

async function renderSummary(canonicalMetric, annualPool = 0, rows = []) {
  const vite = await createServer({ configFile: resolve(process.cwd(), "vite.config.mjs") });
  try {
    const { SummaryPage } = await vite.ssrLoadModule("/src/SummaryPage.jsx");
    return renderToStaticMarkup(
      React.createElement(SummaryPage, {
        canonicalMetric,
        annualPool,
        employees: [],
        rows,
        settings: {},
        targetRows: [],
        mode: "live",
      }),
    );
  } finally {
    await vite.close();
  }
}

function metricCardMarkup(markup, title) {
  const titleIndex = markup.indexOf(`>${title}</span>`);
  assert.notEqual(titleIndex, -1, `metric card not found: ${title}`);
  const cardMarker = '<div class="nexus-metric-card ';
  const cardStart = markup.lastIndexOf(cardMarker, titleIndex);
  const nextCard = markup.indexOf(cardMarker, titleIndex + 1);
  return markup.slice(cardStart, nextCard === -1 ? undefined : nextCard);
}

const completeCanonicalMetric = {
  status: "TAMAM",
  try: { netSales: 100, cost: 60, profit: 40, margin: 17.5 },
  eur: { netSales: 10, cost: 6, profit: 4, margin: 40, complete: true },
  eurRevenue: { netSales: 10, complete: true },
  scope: { costReview: { lines: 0 } },
};

test("Summary reads the canonical TRY margin instead of recomputing profit divided by net sales", async () => {
  const markup = await renderSummary(completeCanonicalMetric);
  const card = metricCardMarkup(markup, "Ortalama Brüt Marj");

  assert.match(card, />%17\.5<\/strong>/);
  assert.doesNotMatch(card, />%40\.0<\/strong>/);
});

test("Summary does not synthesize an EUR pool from annualPool and an EUR/TRY revenue ratio", async () => {
  const markup = await renderSummary(completeCanonicalMetric, 50);
  const card = metricCardMarkup(markup, "Net Dağıtım Havuzu");

  assert.match(card, />—<\/strong>/);
  assert.doesNotMatch(card, /5\s*€/);
});

test("Summary suppresses row-level EUR financial values when the canonical EUR metric is missing", async () => {
  const markup = await renderSummary(null, 0, [{
    month: 1,
    monthName: "Ocak",
    eurEquivalent: { netSales: 120, profit: 60 },
    uncoveredCostLines: 0,
  }]);

  assert.match(metricCardMarkup(markup, "Net Ciro"), />—<\/strong>/);
  assert.doesNotMatch(markup, /€120/);
  assert.doesNotMatch(markup, /€60/);
});

test("Summary keeps missing cost-review evidence in review instead of coercing null to zero", async () => {
  const markup = await renderSummary({
    ...completeCanonicalMetric,
    scope: { costReview: { lines: null } },
  }, 0, [{
    month: 1,
    monthName: "Ocak",
    uncoveredCostLines: 4,
    unlinkedReturnLines: 0,
  }]);
  const card = metricCardMarkup(markup, "İnceleme Kuyruğu");

  assert.match(card, />4<\/strong>/);
  assert.match(markup, /4 maliyet satırı incelenmeli/);
});
