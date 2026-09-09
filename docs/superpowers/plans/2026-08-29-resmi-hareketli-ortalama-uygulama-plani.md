# Resmi Hareketli Ortalama Maliyet Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resmi maliyeti tarihsel ürün hareketlerinden üretip tüm finansal tüketicilere tek V2 satır sözleşmesiyle taşımak ve CPM Denetim'de karar sütunlarını başlangıçta görünür kılmak.

**Architecture:** `shared/financialCostModel.mjs` ürün hareketlerini saf biçimde sıralayıp her satıra resmi maliyet sonucu verir. `server/finalInvoiceLedger.mjs` CPM'nin salt okunur ekonomik satırlarını bu motora uyarlar ve yalnız resmi sonucu `financeV2` içine yazar; mevcut kanıt-seçimi audit karşılaştırması olarak korunur. Overview, departman, hedef/havuz ve EUR katmanı halihazırda tükettiği `financeV2` alanlarını resmi değer olarak kullanır.

**Tech Stack:** JavaScript ESM, Node test runner, Express, React, Vite, MSSQL salt okunur CPM bağlantısı.

**Spec:** `docs/superpowers/specs/2026-08-29-resmi-hareketli-ortalama-maliyet-tasarimi.md`

## Global Constraints

- CPM bağlantısı salt okunur kalır; yalnız parametreli `SELECT` kullanılır.
- Ham CPM satırları ve paylaşılmış diziler yerinde değiştirilmez.
- Eksik kanıt sıfır maliyet değildir: satır `review` olur ve resmi kâr/havuza girmez.
- Satış, iade, iskonto, maliyet, kâr ve havuz kaynak dövizlerinde ayrı kalır; EUR yalnız Halkbank alış kuruyla rapor eşdeğeridir.
- Testler gerçek CPM düzensizliklerini kapsar: null tarih, iade, 91→85 zinciri, eksik köken, negatif stok ve çapraz depo.
- Kullanıcıya ait mevcut ilgisiz değişiklikler, geçici dosyalar, gizli bilgiler ve dağıtım artefaktları değiştirilmez.

---

### Task 1: Resmi hareket maliyeti sonucu

**Files:**
- Modify: `shared/financialCostModel.mjs`
- Test: `server/financialCostModel.test.mjs`

**Interfaces:**
- Consumes: `{ id, productCode, kind, date, quantity, unitCostTryExVat?, originalSaleId? }[]`.
- Produces: `buildOfficialMovementCosts(movements)` satırları `{ officialLineCostTryExVat, officialCostStatus, stockQuantity, stockValueTryExVat, weightedUnitCostTryExVat }` ile döndürür.

- [ ] **Step 1: Açılış/alım/satış resmi maliyet RED testi yaz**

```js
const rows = buildOfficialMovementCosts([
  { id: "O", productCode: "P", kind: "opening", date: "2026-01-01", quantity: 10, unitCostTryExVat: 100 },
  { id: "S", productCode: "P", kind: "sale", date: "2026-01-02", quantity: 4 },
  { id: "P", productCode: "P", kind: "purchase", date: "2026-01-03", quantity: 10, unitCostTryExVat: 120 },
]);
assert.equal(rows[1].officialLineCostTryExVat, 400);
assert.equal(rows[2].weightedUnitCostTryExVat, 112.5);
```

- [ ] **Step 2: RED testini çalıştır**

Run: `node --test server/financialCostModel.test.mjs`
Expected: `buildOfficialMovementCosts is not a function`.

- [ ] **Step 3: En küçük saf hareket motorunu uygula**

```js
export function buildOfficialMovementCosts(movements = []) {
  // kopyalanmış ürün hareketlerini tarih/id sırasıyla işle;
  // opening/purchase ağırlığı günceller, sale mevcut ortalamayı tüketir.
}
```

- [ ] **Step 4: GREEN testini çalıştır**

Run: `node --test server/financialCostModel.test.mjs`
Expected: PASS.

- [ ] **Step 5: İade, eksik açılış ve negatif stok RED/GREEN testlerini ekle**

```js
assert.equal(returnRow.officialLineCostTryExVat, -400);
assert.equal(reviewSale.officialCostStatus, "review");
assert.equal(negativeSale.officialCostStatus, "review");
```

- [ ] **Step 6: Görevi focused testlerle doğrula**

Run: `node --test server/financialCostModel.test.mjs`
Expected: PASS.

### Task 2: Birleşik defterin resmi maliyet uyarlaması

**Files:**
- Modify: `server/finalInvoiceLedger.mjs`
- Test: `server/finalInvoiceLedger.test.mjs`

**Interfaces:**
- Consumes: CPM ekonomik satırları ve mevcut zincir/iade kimlikleri.
- Produces: Her ekonomik satır için resmi `financeV2.lineCostTryExVat`, `lineCostCurrencyExVat`, `costMethod: "movingWeightedAverage"` veya görünür `reviewReason`; eski seçilmiş alım kanıtı audit alanlarında korunur.

- [ ] **Step 1: Gelecek alımın geçmiş satışı değiştirmediği RED entegrasyon testini yaz**

```js
const result = buildFinalInvoiceLedger({ economics: [opening, januarySale, februaryPurchase] });
assert.equal(rowByNo(result, "S-1").financeV2.lineCostTryExVat, 400);
assert.equal(rowByNo(result, "S-1").financeV2.costMethod, "movingWeightedAverage");
```

- [ ] **Step 2: RED testini çalıştır**

Run: `node --test server/finalInvoiceLedger.test.mjs`
Expected: FAIL because the selected purchase path is still the official V2 cost.

- [ ] **Step 3: CPM ekonomik satırlarını official movement girdisine dönüştür**

```js
const officialCosts = buildOfficialMovementCosts(toOfficialMovements(economicRows));
const official = officialCosts.get(economicStableId);
```

- [ ] **Step 4: Resmi `financeV2` değerlerini sadece doğrulanmış hareket sonucundan üret**

```js
financeV2: official.status === "covered"
  ? buildOfficialFinanceV2(row, official, productEvidence)
  : reviewFinanceV2(row, official.reviewReason)
```

- [ ] **Step 5: GREEN ve mevcut defter regresyonlarını çalıştır**

Run: `node --test server/finalInvoiceLedger.test.mjs`
Expected: PASS.

### Task 3: Tek resmi maliyet tüketimi ve EUR sözleşme testi

**Files:**
- Modify: `server/ledgerApi.mjs`
- Modify: `server/departmentAnalysis.mjs`
- Modify: `server/ledgerV2Api.test.mjs`
- Modify: `server/departmentAnalysis.test.mjs`
- Test: `shared/eurReporting.test.mjs`

**Interfaces:**
- Consumes: Official `financeV2` satırları.
- Produces: Overview, departman analizi, hedef/havuz girdisi ve döviz sepeti aynı resmi maliyet/kapsamı taşır.

- [ ] **Step 1: Overview ve departmanın legacy seçilmiş maliyet yerine resmi maliyeti kullandığı RED testlerini yaz**

```js
assert.equal(overview.cost, 400);
assert.equal(department.totals.cost, 400);
assert.equal(overview.byCurrency.EUR.cost, 10);
```

- [ ] **Step 2: RED testlerini çalıştır**

Run: `node --test server/ledgerV2Api.test.mjs server/departmentAnalysis.test.mjs shared/eurReporting.test.mjs`
Expected: FAIL if any consumer falls back to `estimatedCost` or selected purchase cost.

- [ ] **Step 3: Yalnız resmi `financeV2` maliyetinin kullanıldığını uygula**

```js
const covered = financeV2?.costMethod === "movingWeightedAverage"
  && financeV2.reviewReason == null;
```

- [ ] **Step 4: Onaylı dönem kur seti ve inceleme sepetini koru**

```js
assert.equal(result.eurEquivalent.reviewNetSales, 0);
assert.equal(result.eurFrozen, true);
```

- [ ] **Step 5: Focused consumer testlerini çalıştır**

Run: `node --test server/ledgerV2Api.test.mjs server/departmentAnalysis.test.mjs shared/eurReporting.test.mjs`
Expected: PASS.

### Task 4: CPM Denetim karar sütunları

**Files:**
- Modify: `src/AuditPage.jsx`
- Modify: `src/styles.css`
- Test: `src/App.test.mjs` or a new UI contract test in `src/AuditPage.test.mjs`

**Interfaces:**
- Consumes: 7 sütunlu mevcut audit tablosu.
- Produces: 1024 px ekran altında ürün bağlamını ayrıntı satırında korurken satır maliyeti, brüt kâr ve doğrulama ilk görünümde kalır.

- [ ] **Step 1: Dar görünümde ürün sütununun ikincil olduğunu doğrulayan RED contract testini yaz**

```js
assert.match(source, /audit-table__product-context/);
assert.match(css, /@media \(max-width: 1100px\)[\s\S]*audit-table__product-context/);
```

- [ ] **Step 2: RED testini çalıştır**

Run: `node --test src/AuditPage.test.mjs`
Expected: FAIL because the priority class is absent.

- [ ] **Step 3: Ürün hücresine öncelik sınıfı ekle ve 1100 px altında bu hücreyi gizle**

```jsx
<td className="audit-table__product-context">...</td>
```

```css
@media (max-width: 1100px) {
  .audit-table__product-context { display: none; }
  .audit-table { min-width: 638px; }
}
```

- [ ] **Step 4: Focused UI contract testini çalıştır**

Run: `node --test src/AuditPage.test.mjs`
Expected: PASS.

- [ ] **Step 5: Yerel tarayıcıda 1024×900 görünüm doğrulaması yap**

Expected: Cost, gross profit and validation headers are visible without horizontal scroll; product remains in expanded detail.

### Task 5: Uçtan uca doğrulama ve değişiklik hijyeni

**Files:**
- Modify: `docs/superpowers/specs/2026-08-29-resmi-hareketli-ortalama-maliyet-tasarimi.md`
- Modify: `docs/superpowers/plans/2026-08-29-resmi-hareketli-ortalama-uygulama-plani.md`

- [ ] **Step 1: Tam test paketini çalıştır**

Run: `npm test`
Expected: 0 failures.

- [ ] **Step 2: Üretim derlemesini çalıştır**

Run: `npm run build`
Expected: exit code 0.

- [ ] **Step 3: Değişiklik sınırını incele**

Run: `git diff --check && git diff -- shared/financialCostModel.mjs server/finalInvoiceLedger.mjs server/ledgerApi.mjs server/departmentAnalysis.mjs src/AuditPage.jsx src/styles.css`
Expected: Bu plan dışına taşan üretim kodu değişikliği yok.

- [ ] **Step 4: Plan ve spek kabul ölçütlerini kanıtla işaretle**

```markdown
- [x] Gelecek alım geçmiş satış maliyetini değiştirmez.
- [x] İnceleme satırı resmi kâr/havuza girmez.
- [x] Dar CPM Denetim görünümünde karar sütunları görünür.
```
