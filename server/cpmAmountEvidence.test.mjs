import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCpmWacMovementCandidates } from './inventoryMovementSource.mjs';
import { buildHistoricalFinancialEvidence } from '../shared/historicalFinancialEvidence.mjs';

test('resmi ledger çağrısı eski iadeleri yıl sınırıyla hesap dışına çıkarmaz', () => {
  const source = readFileSync(new URL('./index.mjs', import.meta.url), 'utf8');
  const calls = [...source.matchAll(/buildCpmWacMovementCandidates\(\{([\s\S]*?)\}\)/g)];
  assert.ok(calls.length > 0);
  for (const call of calls) assert.doesNotMatch(call[1], /excludeUnlinkedReturnBeforeYear/);
});

test('önceki yılın eşleşmemiş iadesi taşınan maliyet için incelemede kalır', () => {
  const candidate = buildCpmWacMovementCandidates({ rows: [
    { id: 'old-return', productCode: 'product', depotCode: 'depot', documentType: 18,
      movementDate: '2025-12-31', quantity: 1 },
    { id: 'sale', productCode: 'product', depotCode: 'depot', documentType: 85,
      movementDate: '2026-01-02', quantity: 1, grossAmount: 200, discountAmount: 0 },
  ] });
  assert.equal(candidate.reviewCounts.unlinkedReturnRows, 1);
  assert.equal(candidate.reviewCounts.excludedUnlinkedReturnRows, 0);
  assert.equal(candidate.unlinkedReturnYearCounts['2025'], 1);
});

for (const priceCurrency of ['EUR', 'USD', 'GBP']) {
  test(`CPM ${priceCurrency} fiyatlı alışın TL net tutarına ikinci kur uygulanmaz`, () => {
    const candidate = buildCpmWacMovementCandidates({ rows: [{
      id: 'purchase', productCode: 'product', depotCode: 'depot', documentType: 9,
      movementDate: '2026-02-10', quantity: 2, grossAmount: 8000, discountAmount: 800,
      unitPrice: 4000, currency: priceCurrency, currencyRate: 40, cardCurrency: priceCurrency,
    }] });
    const evidence = buildHistoricalFinancialEvidence({
      movements: candidate.movements,
      priceRows: [{ productCode: 'product', cardCurrency: priceCurrency, priceCurrency,
        effectiveDate: '2026-02-01', priceExVat: 120, priceVatExempt: true }],
      exchangeRates: [{ rateDate: '2026-02-10', rateCurrency: priceCurrency,
        halkbankBuyingRate: 39, halkbankSellingRate: 40, exchangeSourceId: 'test-rate' }],
    });
    assert.equal(evidence.movements[0].unitCostTryExVat, 3600);
    assert.equal(evidence.movements[0].unitCostCurrencyExVat, 90);
    assert.equal(candidate.movements[0].costEvidence.sourceCurrency, 'TRY');
    assert.equal(candidate.movements[0].costEvidence.priceCurrency, priceCurrency);
    assert.equal(candidate.movements[0].costEvidence.priceRate, 40);
    assert.equal(candidate.reviewCounts.pendingForeignCostRows, 0);
  });
}

test('CPM TL tutarı bilinse de ürün dövizi kuru eksikse döviz maliyeti üretilmez', () => {
  const candidate = buildCpmWacMovementCandidates({ rows: [{
    id: 'purchase', productCode: 'product', depotCode: 'depot', documentType: 9,
    movementDate: '2026-02-10', quantity: 2, grossAmount: 8000, discountAmount: 800,
    currency: 'EUR', currencyRate: 40, cardCurrency: 'EUR',
  }] });
  const evidence = buildHistoricalFinancialEvidence({ movements: candidate.movements, priceRows: [], exchangeRates: [] });
  assert.equal(evidence.movements[0].unitCostTryExVat, 3600);
  assert.equal(evidence.movements[0].unitCostCurrencyExVat ?? null, null);
});

for (const quantity of [null, undefined, '', ' ']) {
  test(`Eksik miktar sıfır hareket olarak dışlanmaz: ${JSON.stringify(quantity)}`, () => {
    const candidate = buildCpmWacMovementCandidates({ rows: [{
      id: 'purchase', productCode: 'product', depotCode: 'depot', documentType: 9,
      movementDate: '2026-02-10', quantity, grossAmount: 100, discountAmount: 0,
    }] });
    assert.equal(candidate.reviewCounts.invalidMovementRows, 1);
    assert.equal(candidate.reviewCounts.excludedNonMovementRows, 0);
  });
}
