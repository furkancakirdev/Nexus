export function netSalesForRow(row = {}) {
  return Number(row.sales || 0) - Number(row.returns || 0) - Number(row.discounts || 0);
}
