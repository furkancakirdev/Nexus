import React from "react";
import { StatusBadge } from "./StatusBadge.jsx";

const numFmt = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 });
const currFmt = (val, curr = "EUR") => {
  if (val === null || val === undefined || !Number.isFinite(val)) return "—";
  return `${numFmt.format(val)} ${curr}`;
};

export function LedgerView({
  transactions = [],
  productCurrency = "EUR",
  productCode = "",
  productName = "",
  className = "",
}) {
  if (!transactions.length) {
    return (
      <div className="nexus-ledger-empty">
        <p>Bu ürün için hareket kaydı bulunamadı.</p>
      </div>
    );
  }

  return (
    <div className={`nexus-ledger-card ${className}`}>
      <div className="nexus-ledger-card__header">
        <div>
          <h4 className="nexus-ledger-card__title">
            {productCode ? `${productCode} · ${productName || "Ürün"}` : "Stok Muavin Defteri"}
          </h4>
          <p className="nexus-ledger-card__sub">
            Kronolojik hareket sırası · Para birimi: <strong>{productCurrency}</strong>
          </p>
        </div>
        <span className="nexus-ledger-count">{transactions.length} hareket</span>
      </div>

      <div className="nexus-ledger-table-wrap">
        <table className="nexus-ledger-table">
          <thead>
            <tr>
              <th>Tarih</th>
              <th>İşlem Türü</th>
              <th>Belge No</th>
              <th>Depo</th>
              <th className="text-right">Giriş Miktarı</th>
              <th className="text-right">Çıkış Miktarı</th>
              <th className="text-right">Stok Bakiyesi</th>
              <th className="text-right">İşlem Birim Fiyatı</th>
              <th className="text-right">WAC Birim Maliyet</th>
              <th className="text-right">Stok Değeri</th>
              <th>Durum</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((item, idx) => {
              const isNegative = item.runningBalance < 0;
              const isPurchase = item.kind === "purchase" || item.kind === "opening" || item.inQty > 0;
              const isSale = item.kind === "sale" || item.outQty > 0;

              return (
                <tr
                  key={item.id || idx}
                  className={`nexus-ledger-row ${isNegative ? "nexus-ledger-row--negative" : ""}`}
                >
                  <td>{item.date || "—"}</td>
                  <td>
                    <span className={`nexus-type-tag nexus-type-tag--${item.kind || "other"}`}>
                      {item.kindLabel || item.kind || "Hareket"}
                    </span>
                  </td>
                  <td><strong>{item.documentNo || item.id || "—"}</strong></td>
                  <td>{item.depotCode || "—"}</td>
                  <td className="text-right text-success font-mono">
                    {item.inQty > 0 ? `+${numFmt.format(item.inQty)}` : "—"}
                  </td>
                  <td className="text-right text-danger font-mono">
                    {item.outQty > 0 ? `-${numFmt.format(item.outQty)}` : "—"}
                  </td>
                  <td className={`text-right font-mono font-bold ${isNegative ? "text-danger" : ""}`}>
                    {numFmt.format(item.runningBalance ?? 0)}
                  </td>
                  <td className="text-right font-mono">
                    {currFmt(item.unitPrice, item.currency || productCurrency)}
                  </td>
                  <td className="text-right font-mono text-primary font-bold">
                    {currFmt(item.runningWac, productCurrency)}
                  </td>
                  <td className="text-right font-mono">
                    {currFmt(item.runningValue, productCurrency)}
                  </td>
                  <td>
                    {isNegative ? (
                      <StatusBadge variant="danger" size="sm">Negatif Stok</StatusBadge>
                    ) : item.status ? (
                      <StatusBadge status={item.status} size="sm">{item.statusLabel || item.status}</StatusBadge>
                    ) : (
                      <StatusBadge variant="success" size="sm">Normal</StatusBadge>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
