import React from "react";
import { formatEur, formatMoney } from "../../utils/formatters.js";

const currencyFormatter = new Intl.NumberFormat("tr-TR", {
  maximumFractionDigits: 2,
});

function formatCurrency(value, currency) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  if (currency === "EUR") return formatEur(value);
  if (currency === "TRY") return formatMoney(value);
  return `${currencyFormatter.format(Number(value))} ${currency}`;
}

/**
 * Renders already-computed currency totals; conversion and reconciliation stay in the view-model.
 */
export function CurrencyBasket({
  title = "Döviz sepeti",
  eurTotal = null,
  currencies = {},
  status = null,
  className = "",
}) {
  const entries = Object.entries(currencies || {}).filter(([, value]) => value !== null && value !== undefined);

  return (
    <section className={`nexus-currency-basket ${className}`} aria-label={title}>
      <div className="nexus-currency-basket__header">
        <h3>{title}</h3>
        {status && <span className="nexus-currency-basket__status">{status}</span>}
      </div>
      <div className="nexus-currency-basket__grid">
        <div className="nexus-currency-basket__eur">
          <small>EUR ana görünüm</small>
          <strong>{formatCurrency(eurTotal, "EUR")}</strong>
        </div>
        {entries.map(([currency, value]) => (
          <div key={currency} className="nexus-currency-basket__item">
            <small>{currency}</small>
            <strong>{formatCurrency(value, currency)}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
