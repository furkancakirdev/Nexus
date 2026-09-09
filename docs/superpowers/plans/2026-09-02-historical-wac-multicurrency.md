# Historical WAC and Multi-Currency Finance Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace purchase-selection cost estimates in Marlin Nexus with a verified, date-ordered CPM movement/WAC pipeline and an EUR-first multi-currency financial view.

**Architecture:** Keep CPM strictly read-only and separate extraction, source-contract validation, WAC transformation, and KPI consumption. The existing pure `buildOfficialMovementCosts` engine becomes the only cost authority after a verified source payload; missing opening, price, currency, or Halkbank evidence remains review-only and cannot enter official profit or pool totals. Legacy purchase-selection fields remain audit-only for comparison and rollback.

**Tech Stack:** React + JavaScript/ESM, Node test runner, Express, SQL Server via `mssql`, Docker.

**Spec:** User-provided “Marlin Nexus Ürün Brüt Marj ve Çoklu Döviz Maliyet Modeli” specification in the current conversation.

## Global Constraints

- CPM receives only parameterized SELECT/API/export reads; Nexus never writes to CPM.
- Do not execute CPM cost stored procedures; their output and side effects are not a verified source contract.
- Never backdate a future purchase cost to an earlier sale.
- Keep sales, returns, discounts, cost, profit, and pool amounts by source currency; EUR is the main display only after Halkbank buying-rate evidence.
- Missing or ambiguous opening/cost/price/rate evidence is review-only and excluded from official profit/pool.
- Preserve legacy results only as read-only comparison/audit evidence.
- Verify with RED/GREEN focused tests, full test suite, production build, authenticated smoke, and diff review.

---

### Task 1: CPM movement source contract and evidence gate

**Files:** `server/inventoryMovementSource.mjs`, `server/inventoryOpeningResearchSql.mjs`, `server/cpmReadOnly.mjs`, and their tests.

- [x] Add a failing contract test proving a future purchase is never used for an earlier sale and an opening row requires explicit verified evidence.
- [x] Run focused tests and confirm RED for the current source wiring.
- [x] Add only a fixed parameterized SELECT and validator wiring; never call CPM procedures.
- [x] Run focused tests and confirm GREEN.
- [x] Run live read-only SQL coverage checks for all years and record opening/currency/rate completeness. (STKHAR hareket kapsamı okundu; açılış/currency semantiği hâlâ doğrulanmadı.)

### Task 2: Integrate WAC into the canonical ledger

**Files:** `server/finalInvoiceLedger.mjs`, `server/index.mjs`, and focused tests.

- [x] Add a failing integration test showing a sale after two purchases uses the weighted average, while a sale before the second purchase uses the first average.
- [x] Run the focused test and confirm RED.
- [x] Add a pure, fail-closed adapter that attaches verified WAC output to canonical economic rows. (Canonical CPM movement loading remains.)
- [x] Wire verified movement evidence through the same read transaction and apply `buildOfficialMovementCosts`. (v23 runtime now reads movement, price, and rate candidates in one read-only transaction and applies the adapter only when the source contract is verified; live source remains candidate.)
- [x] Add explicit negative-stock margin fallback using purchase-derived product margin observations, including all sold quantity. (Only verified source + explicit observations/net revenue can activate it; missing evidence remains review-only.)
- [x] Run focused tests and confirm GREEN. (WAC adapter and canonical ledger boundary tests are green; promotion remains contract-gated.)

### Task 3: Historical product price and Halkbank EUR presentation

**Files:** new fixed SELECT loaders for historical rates/prices, `server/index.mjs`, `shared/financialCostModel.mjs`, `shared/financialMetric.mjs`, and focused tests.

- [x] Add RED tests for same-day/previous-business-day rate selection, future-rate rejection, missing price review, and EUR conversion.
- [x] Run focused tests and confirm RED.
- [x] Add a fail-closed historical retail-price selector and a parameterized DVZHAR rate candidate query. (Runtime source wiring remains.)
- [x] Implement fixed SELECT loaders with coverage metadata; do not infer price currency from unrelated invoice fields. (Runtime wiring is live, while source status remains candidate.)
- [x] Connect historical price/rate evidence to product margin and EUR projections. (v23 runtime carries date-bounded evidence into `financeV2` and EUR projections; live CPM currently supplies 0 usable historical price/rate rows, so promotion remains fail-closed.)
- [x] Run focused tests and confirm GREEN. (Rate, price, EUR selector, and projection tests are green; incomplete source evidence remains unavailable.)

### Task 4: Consumer cutover and release gate

**Files:** `server/ledgerApi.mjs`, `src/App.jsx`, `src/AuditPage.jsx`, `src/DepartmentAnalysisPage.jsx`, `src/InventoryResearchPage.jsx`, `src/styles.css`, and focused tests.

- [x] Add RED tests proving legacy cost estimates cannot enter official cost/profit/pool and review rows remain visible.
- [x] Implement EUR-first labels, per-currency breakdowns, evidence badges, and explicit review totals. (Reports now separates source-currency baskets and shows the excluded review amount explicitly; EUR remains unavailable until evidence is complete.)
- [x] Run focused tests and confirm GREEN.
- [x] Run `npm test`, `npm run build`, and `git diff --check`. (Fresh run: 449/449 tests, 6,775 Vite modules, clean diff check.)
- [x] Deploy only the verified candidate; run authenticated health, readiness, exact reconciliation, WAC coverage, EUR parity, UI smoke, and rollback checks. (v20 candidate and production smoke passed; no browser tool was available for visual UI smoke, and EUR/WAC remain blocked by source evidence.)
- [x] Enable official finance only if every hard blocker is resolved; otherwise keep fail-closed and report exact missing coverage. (Hard blockers remain; official finance is correctly closed.)

## Self-review checklist

- [x] No task executes a CPM stored procedure or writes CPM.
- [ ] All WAC, price, and FX evidence is source-linked and date-bounded. (Code path is source-linked and date-bounded; live closure is blocked by missing CPM historical price/rate evidence and unverified source semantics.)
- [x] Legacy purchase selection is audit-only after Task 2. (Legacy purchase values no longer contribute to official cost, profit, pool, or verification status.)
- [x] Negative-stock behavior includes all sold quantity and never invents a margin without observations. (Implemented and regression-tested; live candidate source is still not verified.)
- [x] Official readiness remains separate from technical production availability.

## Live root-cause checkpoint — 2026-09-02

- Production v15 was queried with authenticated Node requests. January 2026 overview returned net sales `8,783,936.98 TL`, cost `0`, profit `0`, and the full amount in review; audit rows still exposed `bulkPurchase`, `priorPurchase`, and configured legacy methods.
- Source tracing identified the defect: `finalInvoiceLedgerSql` still selects `bulkPurchase/priorPurchase/nextPurchase`; the existing `buildOfficialMovementCosts` WAC engine is not called by the canonical ledger.
- Live CPM evidence shows the strongest opening candidate is `STKHAR` type 81: 6,663 of 6,666 active rows are dated 2022-12-31 in opening documents. This is not yet promoted to official evidence because later adjustment semantics and historical price/rate coverage remain to be proven.
- 2026-09-02 server read-only cross-check: active STKHAR type 81 contains 6,666 rows, 5,602 products and 5 depots; 6,665 rows have positive net opening value. The 2022-12-31 opening batch is a usable candidate seed, but one non-positive row and later stock adjustments still require product-level reconciliation.
- The movement candidate loader now reads from configurable `CPM_INVENTORY_START_DATE` (default `2022-12-31`) through the selected report-year end, so a 2026 WAC calculation can observe the historical seed and intervening purchases/sales. It also carries `SONKAYNAK*` return-origin fields. This is source plumbing only; candidate status remains fail-closed.
- Direction evidence in the same live read: type 81 and purchase types 9/609 use `GIRISCIKIS=0`; sale types 85/91 use `1`; type 18 returns use `0`. This supports the mapping but is not vendor documentation of the code semantics.
- Return lineage remains incomplete: 913 active type-18 rows exist; 780 have source type `0` with no source document/line, and only 109 point to sale types 17/85/91. Same-document/product/line matching finds 52 type-17, 18 type-85, and 37 of 39 type-91 links. Unlinked returns cannot be assigned an original sale-date WAC basis.
- Opening alternatives remain insufficient for a blanket official WAC gate: 2026 type-82 has mixed directions (2,109 rows with `0`, 1,470 with `1`), and only 239 of 758 rows match STKSYM by product/depot/quantity. STKSYM `DEVIR` has 27,196 rows across 7,461 products but no cost field, so it cannot independently provide opening value.

## Historical price source research checkpoint — 2026-09-02

- Server Docker üzerinden named-instance ile salt-okunur CPM bağlantısı doğrulandı (`192.168.12.17\MARLINSQL`, `Marlin_Uyg`, `encrypt=false`, credential dosyası container secret olarak okundu). İlk doğrudan `192.168.12.17:1433` denemesi hedefin sabit portta dinlemediğini gösterdi; uygulama bağlantı ayarındaki `instanceName=MARLINSQL` ile sorgular çalıştı.
- `STKKRT` aday sorgusu 2026 dönemi için pozitif ve tarihli fiyat satırı döndürmedi. Toplam kart sayısı 15.385, `TARIH1` dolu kart 15.385 olsa da pozitif `SATISFIYAT1` bulunan kart sayısı 38 ve tarihli pozitif satır sayısı 0 olarak gözlendi.
- Alternatif `MIRSTKKRT` tablosu 49.464 satır/11.286 ürün içeriyor; pozitif fiyatlı 1.331 satırın 1.330’unda `TARIH1=1900-01-01`. `CHANGETIME` değişiklik zamanıdır ve yürürlük tarihi sözleşmesi kanıtlanmadı; örnek ürün `012345D` aynı kısa oturumda 10→15→20→…→12 fiyat değişimleri göstermektedir. Resmi tarihsel fiyat kaynağı olarak kullanılamaz.
- `MARINTEK_FIYAT_AKTARIM` 11.139 ürün/satır içeriyor; kayıtların 10.308’i 2026-09-02 00:23–00:31 aktarım penceresindedir ve ürün başına tek sürüm vardır. Bu, tarihsel fiyat geçmişi değil güncel aktarım snapshot’ı kanıtıdır; resmi geçmiş fiyat kaynağı olarak kullanılmayacaktır.
- Sonuç: tarihsel perakende fiyat kapsamı hâlâ yetersizdir. STKKRT/MIRSTKKRT/MARINTEK adaylarını resmi WAC veya marj hesabına bağlamak fail-closed kuralını ihlal eder. `inventory-source-not-verified` ve `official-cost-coverage-insufficient` bloklayıcıları korunur.
- DVZHAR kur sorgusu banka master adıyla zenginleştirildi ve read-only fingerprint yenilendi. Canlı CPM’de `DVZHAR.BANKA=3` satırları `BNKKRT.ID=3 / İLLER BANKASI` ile eşleşiyor; `HALK BANKASI` kaydı `BNKKRT.ID=6` ve banka kodu `012`. Bu, mevcut `CPM_RATE_BANK_CODE` varsayılanı `3` için Halkbank iddiasını çürütür veya en azından doğrulanmamış bırakır. `DOVIZTIP=0/1` değerlerinin alış/satış anlamı da kaynak açıklaması olmadan resmi kabul edilmemelidir.
- Kur adaylarının banka adı artık kanıt paneline taşınmaktadır; ancak source status `candidate` ve financial status `blocked` olarak kalır. Resmi EUR dönüşümü için yönetim/vendor tarafından banka-id ve rate-type sözleşmesi doğrulanmalıdır.

## 2026-09-02 WAC candidate adapter and controlled cutover checkpoint

- `buildCpmWacMovementCandidates` now converts live STKHAR candidate rows into a review-only WAC input shape: numeric CPM IDs are preserved, type 81/9/609 net unit cost is derived as `(grossAmount - discountAmount) / quantity`, and returns are linked only when the source sale line is unique.
- The WAC state engine now keys stock by `productCode + depotCode`; a same-product cross-depot sale no longer consumes another depot's stock. Missing/ambiguous source evidence remains review-only.
- The adapter is wired into the same read-only ledger transaction, but `inventorySource.status=candidate` and `financialStatus=blocked` are deliberately preserved. It cannot attach official `financeV2` fields until `contractVersion=1` and verified source evidence are supplied.
- Local RED/GREEN and full validation after this slice: focused financial/movement tests **42/42**, full Node suite **444/444**, Vite build **6.775 modules**.
- Server Docker candidate `wac-candidate-v17` was built from artifact SHA-256 `1a7b22162b9a704599a693017f6b769b496c5bda68bd023811ca937dee912351`, image digest `sha256:fcb2348ffbd4be25e22807f360376dfc420cdc4519d4d00c18aec6b08106864`, and validated authenticated against live CPM. Stale candidate containers were removed; production v15 was retained as `marlin-profit-sharing-rollback-v15-20260902`.
- Controlled production cutover completed to v17 with `ReadonlyRootfs=true`, `no-new-privileges=true`, `CapDrop=ALL`, and CPM credential mount read-only. Live authenticated health is `connected=true`, `mode=live`, `readOnly=true`, database `Marlin_Uyg`.
- Live post-cutover movement evidence: **150,711** candidate movements; **72** invalid cost rows; **16** invalid movement rows; **806** unlinked returns; **2,627** multi-depot products. Readiness remains `false` with `inventory-source-not-verified` and `official-cost-coverage-insufficient`; official WAC/finance was not enabled.
- Live post-cutover invoice reconciliation remains balanced at exact accounting precision: 2026 source/Nexus rows **22,007/22,007** and minor-unit differences **0**; raw floating-point display deltas are below one micro-unit.

## 2026-09-02 rate-wiring correction and v18 production checkpoint

- Root cause fixed: CPM `DVZHAR` candidate rows were read but never propagated to the ledger snapshot's `exchangeRates` field, so the EUR reporting layer received an empty index. `server/cpmRateSource.mjs` now performs an explicit, source-contract-gated normalization of same-day buying/selling pairs and `finalInvoiceLedger` preserves the normalized rows.
- The live CPM bank cross-check found only `BANKA=3 / İLLER BANKASI` rows for 2022-12-31 through 2026-09-30 (`DOVIZTIP=0/1`, 3 currencies, 3,521 rows per type); no Halkbank rows were found under the observed `BNKKRT.ID=6`. The default was therefore corrected from `3` to `6`, and `CPM_RATE_SEMANTICS_VERIFIED=false` keeps EUR promotion fail-closed until the vendor/management contract identifies a real Halkbank source and type semantics.
- Regression coverage: full Node suite **449/449**, Vite build **6,775 modules**, `git diff --check` clean.
- Server candidate `rate-wiring-v18` was authenticated against live CPM, matched invoice reconciliation at **22,007/22,007** with exact minor-unit differences **0**, and passed health/read-only/image identity checks. Production was cut over to `marlin-nexus-candidate:rate-wiring-v18`; v17 remains `marlin-profit-sharing-rollback-v17-20260902`.
- Production readiness remains intentionally `false` only for `inventory-source-not-verified` and `official-cost-coverage-insufficient`; no release identity or runtime blocker remains. Official finance must stay closed until Halkbank rate evidence, historical price evidence, opening/depot grain, and canonical return/91→85 lineage are verified.

## 2026-09-02 fresh live verification checkpoint

- Authenticated production verification completed against `marlin-profit-sharing` after the v18 cutover: `/api/health` returned `connected=true`, `mode=live`, `readOnly=true`, database `Marlin_Uyg`; `/api/readiness` returned `ready=false` with only the two expected financial blockers.
- Fresh CPM SELECT-only summary confirmed `DVZHAR` contains only bank ID `3 / İLLER BANKASI`, with `3,521` rows for each of rate types `0` and `1`; no observed bank ID `6 / HALK BANKASI` rate rows exist. `STKKRT` contains `15,385` cards but only `38` positive `SATISFIYAT1` values overall and `0` positive dated rows in the 2026 window.
- Fresh invoice reconciliation remains `matched`: `22,007` source rows and `22,007` Nexus rows; gross sales, returns, discounts, and net sales all reconcile to zero minor-unit difference.
- Release conclusion: technical production is live and verified, but official WAC/EUR finance cannot be enabled without external source-contract evidence for Halkbank/rate semantics plus historical prices, opening/depot grain, and return lineage. No CPM write was performed.

## 2026-09-02 historical financial evidence v23 production checkpoint

- v23 artifact `nexus-local-20260902-historical-finance-v23.tar.gz` was built from the verified working tree with SHA-256 `c013b7908d1cdf97904ea05400eeb950b4b977566dbc7b0ce4fe6c0087e890ac`.
- Server Docker image `marlin-nexus-candidate:historical-finance-v23` has digest `sha256:ec81dcc2dfe690ad476642380991eda128e1c244921f133d4852a7108fbda76e`; production container `marlin-profit-sharing` is running this image with `ReadonlyRootfs=true`, `CapDrop=ALL`, `no-new-privileges=true`, and the CPM credential mounted read-only. v22 is retained as `marlin-profit-sharing-rollback-v22-20260902-current`.
- Authenticated live smoke passed: login `200`; health returned `connected=true`, `mode=live`, `readOnly=true`, database `Marlin_Uyg`; runtime build id/version identify v23; browser Raporlar view loaded without console errors and visibly showed the source-currency evidence panel and excluded review total.
- Authenticated live reconciliation remains `matched`: 2026 source/Nexus rows `22,007/22,007`; source net sales `228,101,385.28000072`, Nexus net sales `228,101,385.28`; exact minor-unit differences for gross, returns, discounts, and net sales are all `0`.
- The live financial gate remains correctly fail-closed: readiness `false` with only `inventory-source-not-verified` and `official-cost-coverage-insufficient`; candidate inventory evidence reports `candidateRowCount=151,605`, `candidateMovementCount=150,711`, `priceCandidateRowCount=0`, `rateCandidateRowCount=0`, and `historicalEvidenceReview={review:49,369, covered:0}`. No official WAC, EUR margin, profit, or pool amount was promoted.
- Full post-change verification: `npm test` **459/459**, `npm run build` **6,775 modules**, and `git diff --check` completed without errors. CPM remained read-only throughout; the cutover health probe uses the external HTTPS route and does not alter CPM.

## 2026-09-03 remaining-gate recheck

- Production recheck through server Docker returned HTTP `200` from the external HTTPS health route with `connected=true`, `mode=live`, `readOnly=true`, and database `Marlin_Uyg`.
- The active production container is still v23 (`sha256:ec81dcc2dfe690ad476642380991eda128e1c244921f133d4852a7108fbda76e`) with `ReadonlyRootfs=true`; the v22 rollback container remains stopped and available.
- The only unchecked plan item is intentionally not closed: official WAC/EUR evidence cannot be certified until CPM supplies a date-bounded historical retail-price source, verified Halkbank bank/rate semantics, and reconciled opening/depot/return lineage. Reclassifying current snapshots or candidate rows as official would violate the approved model.

## 2026-09-02 negative-stock fallback v20 controlled release

- Local release artifact `nexus-local-20260902-negative-stock-fallback-v20.tar.gz` was created from the allowlist with 142 members; SHA-256 is `69bcb47b11e16956502cfb60a1f1d9c1f09c53955ad90ed2080b2210d19163ed`.
- Server Docker built image `marlin-nexus-candidate:negative-stock-fallback-v20` and validated it in an isolated candidate container before cutover. Candidate authenticated smoke passed health, exact reconciliation, review-only KPI projection, and runtime security checks.
- Production was cut over to v20 without publishing a competing host port; `nexus-caddy` continues to own 4318. v19 is retained as `marlin-profit-sharing-rollback-v19-20260902`.
- Fresh post-cutover authenticated smoke: login **200**; health `connected=true`, `mode=live`, `readOnly=true`, database `Marlin_Uyg`; reconciliation **22,007/22,007** with exact minor-unit differences `{grossSales:0, returns:0, discounts:0, netSales:0}`; 2026 overview has nine rows with `profit=0`, `margin=null`, and review net sales `228,101,385.28`.
- Runtime security remains `ReadonlyRootfs=true`, `CapDrop=ALL`, `no-new-privileges=true`, and CPM credential/users mounts are read-only. Official readiness remains `false` only for `inventory-source-not-verified` and `official-cost-coverage-insufficient`.

## 2026-09-02 sales KPI fail-closed correction and v19 cutover

- A live API check exposed a consumer bypass: `SalesPage` used `canonicalMetric.try.profit` for its top KPI even when `canonicalMetric.status=INCELEME`. This could display review-only sales as 100% profit when cost evidence was absent.
- `src/SalesPage.jsx` now projects the annual TRY metric through `projectCanonicalMetric`; incomplete cost evidence keeps net sales visible but returns null cost/profit/margin for the official KPI. A regression test covers this boundary.
- Fresh local validation: focused consumer suite **20/20**, full Node suite **450/450**, Vite build **6,775 modules**, and `git diff --check` clean.
- Server Docker candidate and production v19 verification passed: authenticated login/health, `readOnly=true`, image/artifact identity, exact invoice reconciliation **22,007/22,007** with zero minor-unit differences, and monthly KPI `profit=0`, `margin=null`, with review net sales separately exposed. v18 remains as `marlin-profit-sharing-rollback-v18-20260902`.

## 2026-09-02 negative-stock fallback integration checkpoint

- `buildOfficialMovementCosts` now invokes the existing negative-stock margin fallback only when the source is verified and the caller supplies explicit product/depot observations plus a finite KDV hariç net sale amount.
- The fallback applies the unique-observation arithmetic mean to the full sold quantity, including the negative portion; the result carries `costMethod=negativeStockMarginFallback`, `appliedMarginPct`, `appliedQuantity`, and `negativeQuantity` for auditability.
- `buildCpmWacMovementCandidates` now carries `grossAmount - discountAmount` as `netAmountTryExVat` for valid sale candidates. Invalid or missing sale amounts are omitted and cannot create an invented cost.
- Local validation after this slice: focused financial/movement tests **46/46**, full Node suite **454/454**, Vite build **6,775 modules**, and `git diff --check` clean. Production v19 has not yet been replaced by the v20 artifact for this slice.

## 2026-09-02 UI contrast and label-spacing v22 controlled release

- Live Edge smoke exposed two visual defects: dark-theme summary attention text on a white panel, and inventory product buttons falling back to browser-default styling with unreadable text. v21 added theme-safe panel/button styles and removed the default button appearance.
- Fresh live Edge evidence after v21: summary panel/background `rgb(24,35,52)` with readable `rgb(230,238,248)` text; inventory button `appearance=none`, dark surface, readable text; desktop, tablet (`768x1024`), and mobile (`390x844`) had no document/body overflow or header overlap; browser console error/warning count was `0`.
- The same smoke found product code/name rendered without visual separation. A RED/GREEN UI contract test added `.inventory-product strong { margin-right: 0.35rem; }`; focused UI contract suite is now **18/18**.
- v22 artifact: [nexus-local-20260902-ui-contrast-v22.tar.gz](C:\Users\furkan.cakir\Documents\Marlin Nexus Releases\nexus-local-20260902-ui-contrast-v22.tar.gz), SHA-256 `cbd3236ef5e9f77396d6b6db207aa004223dfea0d24e83c1984403d72cce0110`, source commit `43d1a8c9783166a9f99d291eb12122a09195b683`.
- Server Docker built and authenticated candidate-smoked `marlin-nexus-candidate:ui-contrast-v22`; candidate health/readiness/reconciliation passed. Production was cut over to v22 with v21 retained as `marlin-profit-sharing-rollback-v21-20260902`; active container uses read-only rootfs, `CapDrop=ALL`, `no-new-privileges`, and CPM credential mount `ro`.
- Fresh v22 production smoke: login **200**; health `connected=true`, `mode=live`, `readOnly=true`, database `Marlin_Uyg`; build-info image digest `sha256:6c34b12b381cf67102a1cec75f7ab313ec96ca466cc8626970a7e34b77ba7317`; readiness remains `false` only for the two expected financial evidence blockers; invoice reconciliation remains **22,007/22,007** with exact minor-unit differences `{grossSales:0, returns:0, discounts:0, netSales:0}`.
- No CPM write was executed. Official WAC/EUR finance remains fail-closed; the five evidence-dependent checklist items above remain open.

## 2026-09-03 historical price evidence v25 production checkpoint

- Root cause fixed: live CPM `STKKRT` current price slots were zero for the representative `15W40-5L` card, while date-bounded price evidence existed in `FYTKRT` and `MIRFYTKRT`. The candidate query now reads active `FYTKRT` rows and `MIRFYTKRT UPDATESTATUS=0` audit rows, keeps `KDVDH=0` candidates as VAT-exclusive, and carries `MIRFYTKRT.CHANGEDATE` as an optional validity end.
- Live CPM SELECT-only execution of the new query returned **43,692** rows for **13,564** products: `FYTKRT=17,447`, `MIRFYTKRT=26,245`; **42,339** rows remained after the product-currency evidence adapter. The representative `15W40-5L` March 2023 applied price `58.56 EUR` matched the bounded `MIRFYTKRT` period ending 2023-07-09.
- Root cause fixed for runtime latency: historical price selection now builds a product+currency index once instead of filtering and sorting all price rows for every movement. This reduced authenticated candidate readiness from a 300-second timeout to HTTP 200 in **54 seconds**.
- Local verification after the fix: full Node suite **460/460**, Vite build **6,775 modules**, and `git diff --check` completed without errors.
- Artifact `nexus-local-20260903-historical-price-evidence-v25.tar.gz` SHA-256 is `01d9acf5fdd26beea8df30f0521f6538ce3317f957bb90d84e86a92d8d51a8e0`; server image `marlin-nexus-candidate:historical-price-evidence-v25` identity is `sha256:a06183691203d767ff13edd8ebab0b7d6ad561a548506dcaa0c00d676cf3bed9`.
- Controlled production cutover completed to v25; v23 remains as `marlin-profit-sharing-rollback-v23-20260903`. Fresh authenticated production smoke passed login **200**, health **200** (`connected=true`, `mode=live`, `readOnly=true`, `database=Marlin_Uyg`), build identity, and invoice reconciliation **22,007/22,007** with exact minor-unit differences `{grossSales:0, returns:0, discounts:0, netSales:0}`.
- Fresh production readiness remains deliberately `false` with only `inventory-source-not-verified` and `official-cost-coverage-insufficient`. Inventory evidence now reports `candidateRowCount=151,605`, `candidateMovementCount=150,711`, `priceCandidateRowCount=43,692`, `historicalPriceRowCount=42,339`, `historicalExchangeRateCount=0`, `historicalEvidenceReviewCounts={review:49,369, covered:0}`, and `rateCandidateRowCount=0`. Official WAC/EUR finance was not enabled because live `DVZHAR` still exposes no verified Halkbank rate rows and opening/depot/cost lineage remains unverified. CPM remained read-only throughout.

## 2026-09-03 Session 2 historical FX contract recheck

- Live `INFORMATION_SCHEMA` metadata confirms the relevant source fields: `DVZHAR(ID, BANKA, DOVIZTIP, DOVIZTARIH, DOVIZCINS, DOVIZKUR, ...)`, `BNKKRT(ID, BANKAKOD, BANKAAD, ...)`, and invoice price currency/rate in `STKHAR.FIYATDOVIZCINS/FIYATDOVIZKUR`. The older `STKHAR.DOVIZCINS/DOVIZKUR` fields are not used for invoice-price FX evidence.
- `BNKKRT` identifies `ID=6, BANKAKOD=012, BANKAAD=HALK BANKASI`; `ID=3, BANKAKOD=004, BANKAAD=İLLER BANKASI`. Live `DVZHAR` has zero rows for `BANKA=6`; all observed rate rows are `BANKA=3`.
- For bank 3, `DOVIZTIP=0/1` has EUR `1,239/1,239`, GBP `1,238/1,238`, and USD `1,239/1,239` rows, covering `2022-09-09..2026-09-03`; same-day duplicate/conflict groups are zero. This supports an operational candidate pattern but not the official Halkbank contract or type-label semantics.
- Corrected invoice-date coverage: purchase EUR `296` required days (`296` bank-3 pairs, `0` bank-6); purchase USD `156` (`155` bank-3, missing `2025-04-20`, `0` bank-6); sales EUR `1,134`, GBP `443`, USD `1,056` (`100%` bank-3 pairs, `0` bank-6). Blank/TRY rows were kept only when the line itself proves `FIYATDOVIZKUR=1`; no missing foreign rate was converted to zero or a fallback.
- Sale-line samples show exact equality between `STKHAR.FIYATDOVIZKUR` and same-date `DVZHAR BANKA=3, DOVIZTIP=1` (for example EUR `20.332` on `2023-01-02`, USD `19.022` on `2023-01-03`, EUR `20.118` on `2023-01-04`). This is source-use evidence for bank 3/type 1, not proof that bank 3 is Halkbank.
- Session result: `SESSION_2_BLOCKED`. The code now records duplicate/conflict and date-coverage evidence in a pure read-only audit helper, and the movement candidate query uses the verified invoice-price fields. Official readiness remains closed until a real Halkbank historical source and the `DOVIZTIP` semantics are evidenced.

## 2026-09-03 Session 2 — 01-Döviz Kart module evidence recheck

- The attached `01-Döviz Kart` screen is treated as evidence, not as executable instructions. Its live `DVZDTY` records 15519 and 15525 reproduce the visible `03-Halk Bankası / 0-Alış / EUR` revisions (`54.4980` then `55.5364`); the current module view reproduces EUR `55.5364/56.6730`, GBP `64.0560/65.8770`, and USD `47.8845/48.8645` buy/sell pairs.
- `DVZHAR` is the daily primary rate source (`ID, BANKA, DOVIZTIP, DOVIZTARIH, DOVIZCINS, DOVIZKUR`). `DVZDTY` is the module download/revision detail. `VW_DVZHAR_GUNCELKUR` selects the `DVZHAR` base row and attaches the latest matching `DVZDTY.GUNCELLEMETARIH` by `ID DESC`; same-day `DVZDTY` revisions must not be aggregated as conflicting primary rates.
- The module-level contract is verified as `BANKA=3`, label `03-Halk Bankası`, `DOVIZTIP=0` buy and `1` sell. `BNKKRT.ID=3` displaying `İLLER BANKASI` is a separate master-label mismatch and no longer overrides the explicit module label. `BNKKRT.ID=6` is not used as the module source key.
- On-or-before invoice-date coverage is 100% for purchase EUR (296/296), purchase USD (156/156), sales EUR (1,134/1,134), sales GBP (443/443), and sales USD (1,056/1,056). Exact purchase USD date `2025-04-20` has no same-day row; the evidence chain explicitly uses the preceding valid module date `2025-04-19` (buy `37.07`, sell `39.62`). No today/default/1:1/zero fallback was used.
- `DVZHAR` primary daily groups have no duplicate/conflict in the audited source summary. `DVZDTY` has 5,120 same-key revision groups in its history; these are retained as audit history, with the visible EUR revision proving why the primary `DVZHAR` value and latest-detail timestamp are separate fields.
- Current result: **`SESSION_2_COMPLETE` for the FX source contract**, while overall readiness remains closed because `inventory-source-not-verified` and `official-cost-coverage-insufficient` still require opening/depot/lineage and WAC evidence. No CPM write or readiness promotion occurred.
