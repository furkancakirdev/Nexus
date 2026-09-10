import React from "react";
import { formatCurrencyAmount } from "../../utils/formatters.js";

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
          <strong>{formatCurrencyAmount(eurTotal, "EUR")}</strong>
        </div>
        {entries.map(([currency, value]) => (
          <div key={currency} className="nexus-currency-basket__item">
            <small>{currency}</small>
            <strong>{formatCurrencyAmount(value, currency)}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
