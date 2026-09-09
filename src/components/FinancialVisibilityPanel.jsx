import React from "react";
import { IconAlertTriangle, IconCircleCheck, IconEye } from "@tabler/icons-react";
import { formatInteger, formatMoney, formatPercent } from "../utils/formatters.js";
import { buildFinancialVisibility } from "../financialVisibility.mjs";

export function FinancialVisibilityPanel({ metric, title = "Finansal görünürlük" }) {
  const value = buildFinancialVisibility(metric);
  if (!metric) return null;
  const StatusIcon = value.complete ? IconCircleCheck : IconAlertTriangle;
  return (
    <section className="panel financial-visibility" aria-label={title}>
      <div className="financial-visibility__head">
        <span><IconEye size={20} /></span>
        <div>
          <h2>{title}</h2>
          <p>Tüm hesaplanabilen değerler gösterilir; kanıtı eksik rakamlar resmî sonuç değildir.</p>
        </div>
        <strong className={value.complete ? "complete" : "review"}><StatusIcon size={16} />{value.complete ? "Doğrulanmış" : "Geçici hesap"}</strong>
      </div>
      <div className="financial-visibility__grid">
        <div><small>Net satış · kaynak TRY</small><strong>{formatMoney(value.netSales)}</strong><span>Kaynak satış toplamı</span></div>
        <div><small>Mevcut maliyet toplamı · kaynak TRY</small><strong>{formatMoney(value.knownCost)}</strong><span>{value.hasKnownCostEvidence ? "İnceleme satırlarındaki mevcut tutarlar dahil olabilir" : "Doğrulanabilir maliyet kanıtı bulunamadı"}</span></div>
        <div><small>Geçici brüt kâr · kaynak TRY</small><strong>{formatMoney(value.provisionalProfit)}</strong><span>{value.hasKnownCostEvidence ? "Eksik maliyetler hesaba katılmamıştır" : "Maliyet kanıtı olmadan kâr hesaplanmaz"}</span></div>
        <div><small>Geçici brüt marj</small><strong>{formatPercent(value.provisionalMargin)}</strong><span>{value.hasKnownCostEvidence ? "Kesin marj değildir" : "Maliyet kanıtı olmadan marj hesaplanmaz"}</span></div>
        <div><small>Doğrulanmış alt kapsam</small><strong>{formatInteger(value.confirmedLines)} satır</strong><span>{formatMoney(value.confirmedProfit)} kâr · {formatPercent(value.confirmedMargin)} marj</span></div>
        <div><small>Eksik maliyet kapsamı</small><strong>{value.missingLines == null ? "Bilinmiyor" : `${formatInteger(value.missingLines)} satır`}</strong><span>{formatMoney(value.missingNetSales)} net satış etkileniyor</span></div>
      </div>
    </section>
  );
}
