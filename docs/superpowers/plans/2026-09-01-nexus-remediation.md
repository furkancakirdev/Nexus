# Nexus Audit Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the verified Nexus financial, visual, search, and access-control defects without changing CPM or weakening evidence requirements.

**Architecture:** Preserve CPM as a read-only source and make shared financial metric/EUR basket functions the single calculation boundary for overview, sales, reports, and department consumers. Fix consumers only after contract tests establish the canonical values; keep security cleanup and RBAC as separate release-gated slices.

**Tech Stack:** React, Vite, Recharts, Node.js/Express, MSSQL read-only integration, ESM, existing test runner.

**Spec:** `docs/audit/2026-08-31/final-report.md` and `docs/audit/2026-08-31/findings.md`

## Global Constraints

- CPM is strictly read-only; no INSERT, UPDATE, DELETE, target, personnel, approval, or settings write may be sent to CPM.
- Do not store credentials in source, tests, plans, logs, screenshots, or Lemma memory.
- Preserve the user-provided gross-margin and multi-currency model: Halkbank buying-rate evidence, currency baskets, fail-closed review bucket, and KDV-hariç net sales separation.
- Every production change requires a RED regression test before implementation and a GREEN focused test before moving to the next task.
- Do not claim live RBAC isolation until separate role test accounts exist.
- Do not enable an official financial mode or silently convert review/uncovered rows into confirmed values.

## File structure and boundaries

- Modify `shared/eurReporting.mjs` only for shared currency/metric behavior and its existing tests.
- Modify `server/ledgerApi.mjs` and `server/departmentAnalysis.mjs` only for API metric contracts and server-side search/filter behavior.
- Modify `src/SummaryPage.jsx`, `src/SalesPage.jsx`, `src/DepartmentAnalysisPage.jsx`, `src/AuditPage.jsx`, `src/ReportsPage.jsx`, and `src/styles.css` only for verified UI consumers and presentation defects.
- Add or extend focused tests in the repository's existing test locations; do not introduce a second test framework.
- Treat `reconcile_years.py`, `deploy_verify.py`, `cookies.txt`, and `secrets/` as security-sensitive artifacts; remove secret material without copying it into any replacement.
- Add no new CPM write path.

### Task 1: Establish canonical financial metric and EUR contract

**Files:**
- Create: `shared/financialMetric.mjs`
- Modify: existing tests covering `eurReporting`, ledger overview, and department analysis
- Test: add focused contract tests in the existing shared/server test locations

**Interfaces:**
- Consumes: ledger rows with signed KDV-hariç net sales, `financeV2`, product currency, document selling rate, and rate evidence.
- Produces: one stable financial contract with scope/status, signed TRY net sales/cost/profit, period-aware currency baskets, EUR net sales/cost/profit/margin, evidence counts, and reconciliation deltas; `shared/eurReporting.mjs` remains the lower-level currency primitive.

- [ ] Write failing tests proving the same synthetic ledger produces identical EUR net sales and EUR profit through overview and department aggregation.
- [ ] Run the focused tests and confirm they fail because the two paths expose different/incomplete metric fields.
- [ ] Implement the smallest shared normalization needed: preserve `INCELEME` separately, compute `eurMargin` from EUR profit/net sales, and carry currency-basket counts through aggregation.
- [ ] Run the focused tests and confirm equality, review-bucket preservation, and zero-denominator behavior.
- [ ] Run the existing server/shared test subset before continuing.

### Task 2: Fix financial UI consumers and calculation labels

**Files:**
- Modify: `server/ledgerApi.mjs` (thin canonical metric adapters only)
- Modify: `server/departmentAnalysis.mjs` (canonical metric projection only)
- Modify: `src/SalesPage.jsx`
- Modify: `src/DepartmentAnalysisPage.jsx`
- Modify: `src/AuditPage.jsx`
- Modify: `src/SummaryPage.jsx`
- Modify: `src/ReportsPage.jsx`
- Test: focused component/contract tests already used by the repository

**Interfaces:**
- Consumes: canonical metric fields from Task 1; route adapters must not reimplement financial arithmetic.
- Produces: EUR mode uses EUR values; audit rows expose calculated cost/profit; department general/month/department cards use the same margin and evidence fields.

- [ ] Write failing tests for F-015 (`topSalesMonth.eurNetSales` in EUR mode), F-018 (`unitCost × quantity` and gross profit), F-019 (`eurMargin`), and F-020 (`byCurrency`/evidence count).
- [ ] Run the focused tests and verify each failure reproduces the reported symptom rather than a test typo.
- [ ] Implement one consumer fix at a time, starting with F-015, then F-018, F-019, and F-020.
- [ ] Run focused tests after each consumer fix; do not bundle unrelated visual changes.
- [ ] Add a cross-screen assertion that the same selected period and currency cannot display conflicting net sales or margin values.

### Task 3: Correct chart rendering, contrast, text spacing, and responsive layout

**Files:**
- Modify: `src/ReportsPage.jsx`
- Modify: `src/SummaryPage.jsx`
- Modify: `src/DepartmentAnalysisPage.jsx`
- Modify: `src/styles.css`
- Test: browser/component regression coverage in the existing test setup

**Interfaces:**
- Consumes: populated metrics and canonical chart series.
- Produces: visible chart series with accessible legend/contrast, explicit loading/empty/error states, separated label/value text, and stable 390/768/desktop layouts.

- [ ] Write failing DOM/style tests for visible chart series, F-007 contrast, F-004/F-006 spacing, and 768 px header containment.
- [ ] Run the tests and verify they fail against the current CSS/markup.
- [ ] Implement theme-token chart colors, legend/accessible labels, explicit loading/empty states, and label/value layout primitives.
- [ ] Implement the smallest responsive header and long-name tooltip/accessible-label changes.
- [ ] Run focused UI tests and capture desktop, tablet, and mobile screenshots for visual comparison.

### Task 4: Make document search complete and honest

**Files:**
- Modify: `server/ledgerApi.mjs`
- Modify: `src/DepartmentAnalysisPage.jsx`
- Test: server route/department analysis tests and UI search tests

**Interfaces:**
- Consumes: year, department, status, depot, search, page, and page size query parameters.
- Produces: server-filtered/paginated detail rows over the complete selected-year economic ledger, with total counts and explicit empty states.

- [ ] Write a failing test searching a known old document outside the latest 500 rows.
- [ ] Run it and verify the current implementation returns zero incorrectly or exposes only the truncated page.
- [ ] Move filtering/search to the server while keeping pagination deterministic and bounded.
- [ ] Add a regression test for status/depot/search combinations and total count semantics.
- [ ] Run the focused route and UI tests.

### Task 5: Remove exposed secrets and enforce CPM least privilege

**Files:**
- Modify/remove secret-bearing helper artifacts: `reconcile_years.py`, `deploy_verify.py`, `cookies.txt`, `secrets/`
- Modify: deployment/configuration files that define CPM credentials, only if needed to reference an external secret source
- Test: repository secret scan and read-only DB permission verification

**Interfaces:**
- Consumes: deployment-provided credential file or secret manager reference.
- Produces: no credentials in tracked files/logs and a CPM connection that authenticates with a real SELECT-only account.

- [ ] Write a failing secret-scan check that detects the current plaintext credential patterns and insecure `curl -sk` usage.
- [ ] Run it and record the expected failure without printing secret values.
- [ ] Remove secret literals and insecure TLS bypasses; replace them with required environment/secret-file references and certificate verification.
- [ ] Add a safe connection preflight that verifies read-only intent and DB effective permissions without issuing writes.
- [ ] Run secret scan, configuration checks, and the existing read-only query fingerprint tests.
- [ ] Mark the production DB least-privilege gate blocked if the infrastructure account cannot be changed in this code task; do not claim it fixed.

### Task 6: Add role isolation and release gates

**Files:**
- Modify: `server/auth.mjs`
- Modify: API middleware/route tests and relevant UI capability handling
- Test: authenticated positive/negative role matrix using separate non-production test accounts

**Interfaces:**
- Consumes: user identity and role/capability source.
- Produces: explicit admin, read-only reporting, and operational capabilities enforced per API route and screen.

- [ ] Write failing tests for a read-only user denied settings/approval writes and an operational user denied unrelated financial/admin data.
- [ ] Run them and verify the current single-admin model fails the matrix.
- [ ] Implement the smallest governed user/role source and route capability checks; keep CPM read-only.
- [ ] Run the role matrix and full test suite.
- [ ] If separate test accounts are unavailable, leave this task pending with an explicit evidence gap.

### Task 7: Full verification and live read-only regression

**Files:**
- Modify: audit evidence under `docs/audit/2026-08-31/` only for verified results

- [ ] Run the focused tests for every completed task.
- [ ] Run the complete test suite and build in fresh processes.
- [ ] Repeat live desktop/tablet/mobile smoke checks and compare the corrected financial cards, charts, audit cost, department margin, and document search.
- [ ] Repeat CPM reconciliation with SELECT-only queries; verify no CPM writes and compare general/person totals.
- [ ] Update findings with status `fixed`, `partially fixed`, or `blocked` only where fresh evidence supports the label.
- [ ] Call Lemma `memory_add` for durable lessons and `session_end` with the actual outcome.

## 2026-09-01 yürütme durumu

Planın tarihsel checkbox'ları önceki turlardan kaldığı için fiili durum yalnız bu bölümdeki kanıtla değerlendirilmelidir:

- Task 1–4: kaynak ve regression testleriyle tamamlandı.
- Task 5: secret temizliği ve uygulama read-only kapıları tamamlandı; canlı CPM `sa` yetkisi yönetimce kabul edilmiş altyapı riski olarak açıkça kayıtlıdır.
- Task 6: uygulama rol/capability kapıları tamamlandı; ayrı non-production rol hesaplarıyla canlı kanıt açığı sürüyor.
- Task 7: kısmi; yerel suite/build ve canlı read-only finans mutabakatı tamamlandı. 2026-09-01 13:26:57Z canlı SELECT kanıtında bağımsız STKHAR satır kümesi ile final ledger ID kümesi 21.979/21.979 birebir eşleşti ve net fark kayan nokta seviyesinde kaldı. Ancak ardışık sorgular tek transaction snapshot'ında çalışmadı; candidate/cutover ve post-deploy UI parity açık.
- Task 7 candidate financial parity gate: tamamlandı. `release_runner.py` authenticated Overview/Department JSON kanıtını ortak scope, EUR net satış ve departman marjı açısından fail-closed doğruluyor; gerçek candidate runtime çalıştırması ve canlı deployment hâlâ yapılmadı.
- 2026-09-01 runner dilimi: teknik candidate readiness ile resmi finansal readiness ayrıştırıldı; yeni/ bilinmeyen readiness blocker'ları hâlâ fail-closed'dur.
- 2026-09-01 Stok Araştırması UI dilimi: belge kanıtı ile finansal maliyet doğrulaması ayrıştırıldı. Hareket satırı artık `Belge: ...` ve `Maliyet: ...` durumlarını ayrı gösteriyor; canlı bulguda görülen “Doğrulandı” yanlış güven sinyali için regression testi eklendi. UI sözleşmesi 12/12, tam suite 379/379 ve Vite build 6.773 modül geçti.
- 2026-09-01 inventory source sözleşmesi dilimi: `buildFinalInvoiceLedger` inventory evidence verilmediğinde açıkça `missing/blocked/not-collected` dönüyor ve injected source'u savunmacı kopyalıyor. Yeni CPM SQL recordset'i eklenmedi; fatura maliyeti inventory/WAC kanıtı olarak infer edilmiyor. İlgili testler 98/98, tam suite 381/381 ve Vite build 6.773 modül geçti.
- 2026-09-01 API sınır entegrasyon dilimi: gerçek Express app + gerçek ledger router + authenticated admin fixture ile `/api/readiness` ve `/api/inventory-research` üzerinde explicit `inventorySource` fail-closed sözleşmesi doğrulandı. `task6RoleIsolation` testi 5/5 geçti; canlı CPM veya deployment etkisi yok.
- 2026-09-01 candidate runtime tekrar kontrolü: Sol önerisiyle local Docker candidate doğrulaması seçildi; Docker CLI, bilinen binary yolları ve `com.docker.service` bulunamadığı için task erişim blocker'ı olarak kaldı. Server transport/cutover ve canlı parity tekrarına geçilmedi.
- 2026-09-01 canlı parity tekrar kontrolü: authenticated 2026 ekranında Satış net EUR `€1.008.524`, Departman Tümü net EUR `€1.970.351`; fark `€961.827`. Departman `€863.195 / €1.970.351` için `%0,0` marj gösteriyor; canlı parity ve canlı image/source alignment blocker'ı tazelendi. CPM/Nexus yazımı yapılmadı.
- 2026-09-01 local API parity regression dilimi: gerçek Express app/router üzerinde çok aylı-çok dövizli fixture ile Overview ve Department canonical EUR sonuçları bağımsız beklenen `€60 / €36 / %60` değerlerinde eşitlendi. Focused `task6RoleIsolation` 6/6, tam suite 383/383, build 6.773 modül; bu local kanıt canlı deployment yerine geçmez.

## 2026-09-04 kapsam entegrasyonu ve uygulanacak aşamalar

Bu bölüm, önceki session'ların dağınık çıktıları yerine bu checkout'taki doğrulanabilir kaynakları esas alan güncel yürütme sırasıdır. `AGENTS.md` gereği CPM salt-okunur kalır; canlıya geçiş ancak tüm P0/P1 kapıları ve aşağıdaki kanıtlar tamamlandıktan sonra yapılır.

### Aşama 0 — Soy ağacı, temizlik ve baseline (ön koşul)
- [ ] `git status`, kaynak hash'i, mevcut canlı image/build-info ve plan/progress kayıtlarını tek bir baseline raporunda eşleştir.
- [ ] `.temp_files/`, `work/`, tarball, ekran görüntüsü ve session çıktılarında secret/cookie/credential taraması yap; yalnız bu görevde üretilen geçici artefaktları `.temp_files/` altında tut ve release kapsamına alma.
- [ ] Local-vs-live dosya/image farkını checksum + manifest ile çıkar; stale server source ile canlı image arasındaki farkı “kanıt yok” olarak işaretle, sessizce birleştirme yapma.
- [ ] Çıkış ölçütü: kaynak/artefakt soy ağacı, değişen dosya listesi ve açık blocker listesi.

### Aşama 1 — Finansal çekirdek ve ortak veri sözleşmesi
- [x] `schemaVersion: 2`, `byCurrency`, `eurEquivalent`, tarihsel kart/fiyat/kur kanıtı ve review nedenleri için merkezi ledger sözleşmesini koru.
- [ ] Hareketli ağırlıklı ortalama, negatif/yetersiz stokta alım adedi bazlı marj oranı ve iade maliyet devrini gerçek CPM snapshot'ı ile doğrula; doğrulanamayan satırları resmi KPI'a alma.
- [ ] Ürün brüt marjı ile gerçek fatura iskontosunu tüm API/UI sözleşmelerinde ayrı adlandır; EUR ana gösterim, native currency basket ve kullanılan kur tarihini her ekranda görünür kıl.
- [ ] Çıkış ölçütü: Overview/Sales/Department/Audit/Havuz aynı ledger revision ve EUR rate-set ile uzlaşıyor; eksik kanıt `blocked/review`.

### Aşama 2 — Canlı modül görünürlüğü ve erişim temizliği
- [x] Ortak module registry ile navigation, client router ve server API kapıları aynı kaynaktan yönetilecek.
- [ ] Canlı profile yalnız tam çalışan `Genel Bakış`, `Satış Analizi`, `Departman Analizi`, `Denetim`, `Stok`, `Havuz`, `Ayarlar` modüllerini aç; kullanılmayan/tamamlanmamış route, menü, shortcut ve API'leri devre dışı bırak.
- [ ] Local profile araştırma/preview modüllerini açıkça `pilot/local` etiketle; canlıda gizlemekle yetinme, doğrudan URL/API capability testleri ekle.
- [ ] Çıkış ölçütü: modül matrisi (local/live × route/menu/API), yetkisiz erişim negatif testleri ve boş/placeholder ekran kalmaması.

### Aşama 3 — Ayarlar ve yönetilebilir politika registry'si
- [x] Mevcut finans policy ve planlama ayarlarının revision-safe saklanması korunacak.
- [ ] Aktif modüllerin çalışma kurallarını tek bir ayar registry'sinde topla: EUR ana görünüm/rate-set, review kapsamı, marj ve havuz politikası, dönem/önceki yıl, stok görünümü, dashboard KPI tercihleri ve feature toggle'lar.
- [ ] Her toggle için varsayılan, yetki, audit nedeni, etkilediği ledger/API ve geri alma davranışı tanımla; kullanılmayan `exchangeRateRule` yalnız legacy read-only alan olarak gösterilsin.
- [ ] Çıkış ölçütü: ayar değişikliği atomik/revision-safe, client spoofing reddediliyor, persisted policy ile ledger fingerprint eşleşiyor.

### Aşama 4 — Paylaşılan Lego UI altyapısı
- [ ] Mevcut React/Vite yapısında küçük ve yeniden kullanılabilir primitive'ler oluştur: `PageShell`, `KpiCard`, `CurrencyValue`, `EvidenceBadge`, `DataTable`, `FilterBar`, `ChartCard`, `EmptyState`, `ReviewBanner`, `DetailDrawer`.
- [ ] Claymorphism tasarım token'larını (light/dark, responsive, WCAG AA) tek CSS/theme kaynağına bağla; ekran bazlı renk ve para formatı kopyalarını kaldır.
- [ ] Primitive'ler finans hesabı yapmaz; yalnız merkezi API sözleşmesini sunar. 1440/1024/768/390 px ve klavye/erişilebilirlik testleri zorunludur.
- [ ] Çıkış ölçütü: mevcut çalışan ekranlar primitive'leri kullanır, build/test temizdir, görsel regresyon kanıtı vardır.

### Aşama 5 — Departman Analizi ve Ticari Sorumlu drill-down
- [ ] Servis ve Yedek Parça sekmelerini aynı ekonomik ledger'dan zenginleştir: gelir kalemleri, satış/iade/iskonto/maliyet/kâr sepetleri, en çok satan ürünler ve hacimli müşteri tabloları/grafikleri.
- [ ] Ticari Sorumlular toplamı genişletilebilir detail drawer/table ile belge/ürün/departman/işlem kırılımını ve ownership evidence kalitesini göster; muhasebe/son modifier sahiplik olarak sayılmaz.
- [ ] Cross-depot, 91→85, inactive actor ve review-required satırlar ayrı etiketlenir; kişi performansı kanıt açığı varken resmi skor/leaderboard'a dönüşmez.
- [ ] Çıkış ölçütü: kişi/departman toplamları CPM SELECT snapshot'ı ile uzlaşıyor; toplam tıklaması denetlenebilir alt satırları açıyor.

### Aşama 6 — Yönetim odaklı Genel Bakış revizyonu
- [ ] Havuz merkezli yoğunluğu azalt; EUR ana KPI'lar (net satış, gerçek brüt kâr, brüt marj, review coverage, dönem karşılaştırması), departman trendleri, risk/kanıt kartları ve anlaşılır grafikler sun.
- [ ] Ayrıntılı ledger/işlem tablolarını Overview'dan çıkarıp ilgili modüllere bağla; her KPI için dönem, kur tarihi ve evidence tooltip'i göster.
- [ ] Çıkış ölçütü: Overview ile Sales/Department/Audit aynı seçili dönem ve ledger revision değerlerini gösteriyor; loading/empty/error durumları açık.

### Aşama 7 — Kapsamlı Stok muavin/defter
- [ ] Ürün kodu/adı, depo, döviz, tarih, belge ve hareket tipi ile bounded server-side arama/filtreleme/sayfalama ekle.
- [ ] Ürün detayında açılış, alış, satış, satış iadesi, alış iadesi, devir ve döviz değişimini kronolojik muavin olarak göster; miktar, native maliyet, EUR eşdeğeri, kur ve kanıt/review nedenini koru.
- [ ] WAC geçmişe dönük değişmez; gelecek alım geçmiş satışı değiştirmez; negatif/yetersiz stok satırları görünür review durumunda kalır.
- [ ] Çıkış ölçütü: seçili ürünün CPM hareketleri ile satır sayısı/tarih/sıra uzlaşıyor; finansal resmi maliyet kanıtı olmayan satırlar açıkça ayrışıyor.

### Aşama 8 — Entegre QA, local-vs-live parite ve kontrollü canlıya alma
- [ ] K1–K5 denetim planını çalıştır: statik kaynak taraması, tam test/build, API/auth/CSRF, responsive UI, console/network ve CPM SELECT-only mutabakatı.
- [ ] Local build manifest/hash, canlı image digest, module matrix, ledger revision ve Overview/Department/Sales/Stock/Havuz/Audit JSON çıktılarını aynı snapshot raporunda karşılaştır.
- [ ] P0: yanlış finans/CPM yazma/güvenlik; P1: canlı fonksiyon veya veri paritesi; P2: görsel/ikincil sözleşme. Açık P0/P1 varsa deploy yok; canlı erişilebilirlik release-ready sayılmaz.
- [ ] Authenticated health/readOnly/build-info/readiness/prewarm, rollback image/backup ve sıfır restart kanıtı olmadan cutover yapma. Deploy yalnız kullanıcı tarafından yetkilendirilen kontrollü adımda gerçekleştirilir.

### Kapsam dışı / açık kanıt boşlukları
- CPM'ye yazma, şema/procedure değişikliği, canlı veri silme ve secret değerlerini dosyaya/loga taşımak kapsam dışıdır.
- Canlı bağlantı, Halkbank kur alanları, fiyat listesinin KDV niteliği, tarihsel açılış/devir kaynağı ve ayrı rol hesapları doğrulanmadıkça resmi finansal readiness kapısı kapalıdır.
- Geçmiş session'ların çöp verisi için otomatik toplu silme yapılmaz; önce manifest/retention kararı ve geri alınabilir arşiv kanıtı gerekir.
- 2026-09-01 reconciliation etiket düzeltmesi: EUR görünümünde TRY tabanlı fark artık `TRY net fark` olarak açıkça etiketleniyor; SSR regression ve tam suite **384/384**, build 6.773 modül geçti. Canlı deployment yapılmadı.
- 2026-09-01 yerel release artefaktı: reconciliation etiketi ve local API parity düzeltmelerini içeren allowlist paket üretildi: [nexus-local-20260901-reconciliation-label.tar.gz](C:\Users\furkan.cakir\Documents\Marlin Nexus Releases\nexus-local-20260901-reconciliation-label.tar.gz). Bağımsız SHA-256 `67a6e2c168907aba04e4e9909829b3296d665bd655e1680fc9acdfb6ceed7461`, üye sayısı **119**, yasaklı kök **0**; `release_artifact_test.py` **5/5** geçti. Paket dirty working tree snapshot'ıdır; immutable commit/image lineage, candidate runtime ve deployment kanıtı değildir.
- 2026-09-01 candidate runtime preflight tekrarı: workstation kontrolünde Docker CLI **DOCKER_CLIENT_NOT_FOUND**, bilinen üç Docker binary yolu **yok**, `com.docker.service` **DOCKER_SERVICE_NOT_FOUND**. Candidate image/container, authenticated readiness ve UI parity kanıtı üretilemedi; server transport/cutover yapılmadı.
- 2026-09-01 immutable manifest preflight: local `HEAD` **43d1a8c9783166a9f99d291eb12122a09195b683**, fakat çalışma ağacı **67 dirty entry** içeriyor. Current Compose SHA-256 `d4414f0d8e0dd08198188492fa2986c91e10a0d1bc0552f86b21d37621d7ad49`, Dockerfile SHA-256 `338e3f0b6f8f25f23f95e5b20017c29ec3408315cf56da68d32a40b56728804c`, local artifact SHA-256 `67a6e2c168907aba04e4e9909829b3296d665bd655e1680fc9acdfb6ceed7461`. Repo içinde doğrulanabilir immutable release manifest bulunamadı; candidate image digest, rollback bağı ve pinned key-only transport hâlâ eksik. `release_runner_test.py` + `release_artifact_test.py` **20/20**, `py_compile` başarılı.
- 2026-09-01 release runner transport preflight: gerçek environment ile `validate_runner_config` sonucu **10 blocker** döndürdü: target, SSH key, known-hosts, host-key, TLS CA, release ID, source commit, image digest, Compose hash ve rollback manifest eksik/geçersiz. Bu nedenle bağlantı kurulmadı; password fallback ve upload kullanılmadı.
- 2026-09-01 Sol/Luna release-gate kararı: Mevcut validator ve parity kapıları eksik runtime/manifest/transport kanıtlarını doğru biçimde fail-closed reddediyor; aynı blocker'ları yeniden raporlayan yeni kod önerilmedi. Sıradaki gerçek ilerleme, onaylı Docker-capable izole candidate ortamının sağlanmasıdır. Bu ortam ve reviewed immutable source identity gelmeden placeholder manifest, dirty artifact'ın commit-derived sunumu, password SSH, server candidate veya cutover yapılmayacaktır.
- 2026-09-01 WSL runtime preflight: Windows'ta Docker/Podman/nerdctl yok; WSL Ubuntu içinde Docker CLI **29.7.2** var ancak `/var/run/docker.sock` yok. `docker context ls` içindeki `desktop-linux` context'i Windows named pipe gösteriyor; WSL'den `docker --context desktop-linux version` geçerli daemon kanıtı üretmeyip CLI panic verdi. Docker Desktop WSL entegrasyonu/daemon erişimi doğrulanmadan candidate çalıştırılmayacak.
- 2026-09-01 server Docker doğrulaması: Salt-okunur SSH ile server Docker daemon **29.3.0/29.3.0** doğrulandı. Production `marlin-profit-sharing` image ID `89755523ac69` ile çalışıyor; host port `4318` `nexus-caddy` tarafından yayınlanıyor. Image listesinde güncel reconciliation-label candidate bulunmuyor. Production container CPM credential ve Nexus kullanıcılarını `RW=false` mount ediyor, fakat `/app/data` production state'i `RW=true`; candidate için ayrı image/port/state gerekir. Upload veya container başlatma yapılmadı.
- 2026-09-01 server source inventory: `/home/serviceproadmin/apps/marlin-profit-sharing` altında source ve eski release arşivleri mevcut, ancak `.git` yok (`NO_GIT`). Server `compose.yaml` SHA-256 `6e20b326f1126938297ebc802e9bdd80f2b114c60e55d90740a18aaf4d07e14c`, Dockerfile SHA-256 `1e3abc9aca067d2cef4962a85f64c33868844b6fa87ce05fefc3cf3494c38311`; current local hash'lerle eşleşmiyor. Güncel reconciliation-label source/image'ın serverda bulunduğu doğrulanamadı. Candidate için güncel source/image'ın pinned key-only transport ile aktarılması veya serverda reviewed immutable source üzerinden build edilmesi gerekir.
- 2026-09-01 kritik source parity: server/local SHA-256 karşılaştırmasında `server/ledgerApi.mjs`, `server/departmentAnalysis.mjs`, `src/DepartmentAnalysisPage.jsx`, `src/styles.css` ve `server/uiContract.test.mjs` farklı çıktı; server source'ta `server/task6RoleIsolation.test.mjs` bulunamadı. Güncel API parity ve TRY reconciliation label düzeltmelerinin serverda olmadığı güçlü biçimde kanıtlandı; server source'tan doğrudan build yapılmayacak.
- 2026-09-01 server release archive inventory: Serverdaki en yeni görünen `marlin-nexus-release.tar.gz` (2026-08-31) içinden `server/ledgerApi.mjs`, `server/departmentAnalysis.mjs` ve `src/styles.css` hash'leri sırasıyla server source ile aynı (`70a3d538...39e3`, `93b7fed5...24e6`, `4d089004...42a3`) ve current local hash'lerden farklı çıktı. Arşivde `server/task6RoleIsolation.test.mjs` ve `server/uiContract.test.mjs` bulunmadı. Serverda güncel candidate archive olmadığı doğrulandı; yeni reviewed source/image aktarımı zorunlu.
- 2026-09-01 key-only transport preflight: local `.ssh` anahtarı `marlin_nexus_erp_20260813_ed25519` mevcut; public fingerprint `SHA256:a/BnjSpN2XJZ9qwysnS9PmgbfMeO8LovrwIY4O47JgU`. Pinned host/known_hosts, `BatchMode=yes`, `IdentitiesOnly=yes`, `PasswordAuthentication=no` ve `KbdInteractiveAuthentication=no` ile zararsız `true` komutu **Permission denied** döndü. Anahtar hedef `serviceproadmin` hesabında yetkili değil; upload/build/start kapısı server yöneticisinin public-key yetkilendirmesine kadar bloklu.
- 2026-09-01 authorized_keys doğrulaması: server `~/.ssh/authorized_keys` içinde local release public key'in base64 gövdesi aranarak salt-okunur kontrol edildi ve **RELEASE_KEY_ABSENT** döndü. Önceki key-only `Permission denied` sonucu böylece hedef hesapta public-key kaydı bulunmamasıyla desteklendi. `authorized_keys` değiştirilmedi.
- 2026-09-01 SSH key pair doğrulaması: private key'den türetilen fingerprint ile `.pub` fingerprint'i aynı: `SHA256:a/BnjSpN2XJZ9qwysnS9PmgbfMeO8LovrwIY4O47JgU` (`match=true`). Local anahtar çifti geçerli; kalan sorun yalnız server `authorized_keys` yetkilendirmesidir.
- Kalan tahmin: scoped candidate readiness için kabul edilmiş `cpm-extra-permissions` riski ayrıştırma ve candidate metadata doğrulaması tamamlanmalıdır. Tam finansal GO için resmi maliyet kapsamı, açılış stok kanıtı ve atomik provenance dahil en az 2 ana finansal kanıt task'ı sürüyor. `sa`/sysadmin efektif izinleri yönetim kararıyla kabul edilmiş risk olarak görünür kalır; Nexus'un CPM write yasağı, SELECT allowlist'i ve write-token guard'ları gevşetilmez.

## 2026-09-01 kabul edilmiş CPM izin riski ve release sözleşmesi

- Sol mimari incelemesi sonucunda `cpm-extra-permissions` yalnız açıkça konfigüre edildiğinde kabul edilmiş risk olarak readiness sonucuna taşınır; aksi durumda `read-only-boundary-failed` sert blokajı korunur.
- `buildRuntimeInfo` ve `buildReadinessPayload` kabul edilmiş riski ayrı alanda gösterir; `readOnly=false` ve `readOnlyEvidence=unverified` gerçeği değiştirilmez.
- Release runner candidate Compose ortamına `NEXUS_ACCEPTED_RISKS` değerini deterministik biçimde taşır. CPM SQL guard'ları, fingerprint allowlist'i ve Nexus write-token kontrolleri değişmemiştir.
- Doğrulama: release contract 12/12, Python runner 15/15, tam Node suite 393/393 ve Vite production build 6.775 modül başarılıdır. Mevcut server candidate eski metadata ile çalıştığı için bu yeni kabul-risk/build-id davranışı canlı candidate üzerinde henüz yeniden doğrulanmış sayılmaz.
- Sonraki runner uyumluluk düzeltmesi: `/api/readiness` gerçek response içindeki `runtime.buildId`, `runtime.connected`, `runtime.readOnly` ve `runtime.acceptedRisks` alanlarını doğrulayıcı artık okuyor; eski üst seviye alanlar için geriye dönük uyumluluk korunuyor. Python runner suite **16/16** ve `py_compile` başarılı.

## 2026-09-02 server Docker candidate readiness doğrulaması

- Key-only SSH transport başarılı oldu. Güncel allowlist artifact SHA-256 `8d0048a708f2a5e521c47c26e52ba51653eb366a153b5853482a8b65b1e2e692` server staging alanına aktarıldı ve aynı hash ile doğrulandı.
- Server Docker üzerinde `marlin-nexus-candidate:readiness-runner` image'ı build edildi; image digest `sha256:001c352331570800f00a0464d8dc50e06fd898d4f9b0e95aa3e5b98a8f4dcca4`. Candidate `127.0.0.1:5323` ve ayrı state ile çalıştı; `ReadonlyRootfs=true`, `no-new-privileges=true`.
- Authenticated health HTTP 200: `connected=true`, `mode=live`, `readOnly=true`, database `Marlin_Uyg`. Build-info beklenen release kimliğini döndürdü.
- Authenticated readiness: `ready=false`; `acceptedRisks=[cpm-extra-permissions]`; runtime `readOnly=false`, `readOnlyEvidence=unverified`; sert blokajlar yalnız `inventory-source-not-verified` ve `official-cost-coverage-insufficient`.
- Production container çalışır durumda ve ayrı kaldı; candidate port/state production ile çakışmadı. CPM ve production üzerinde DML/DDL/mutation yapılmadı.

## 2026-09-01 sonraki remediation dilimi: oturum ve KPI

- Oturum kapısı eklendi: unauthenticated root artık finansal/pilot dashboard yerine login ekranı gösteriyor; authenticated admin akışı mevcut CPM canlı verisini yüklemeye devam ediyor.
- Net satış KPI'ı `sales - returns - discounts` olarak düzeltildi. Brüt satış anlatısı ayrı bırakıldı; maliyet oranı ve rapor toplamları net satış kapsamına bağlandı.
- Focused testler: `sessionGate` **3/3**, `summaryMetrics` **2/2**. Tam suite **386/386**; Vite build **6.775 modül**.
- Server candidate `session-gate-net-sales`, artifact SHA-256 `cda37367f3afd99601428b51852eaabbca57264ea3c180dad3f31e5e86c101c3`, image digest `sha256:d37fa30ef0498c6c80f8003df5cb4abd2e9b586885a3b834b221c7539491ed71`, loopback port `5320` ile doğrulandı. Production ve CPM değişmedi.
- Authenticated UI smoke, `CPM canlı` ve `Net satışlar 227.409.750 TL` kanıtını verdi; reconciliation net değeri `227.409.749,56 TL` ile yuvarlama seviyesinde uyumlu. `department-targets` boş aday state'inde geçersiz ayar nedeniyle 400 dönüyor; bu hedef kurulum/empty-state işidir.
- Güncel kalan tahmin: release parity için yaklaşık **1 task** (sonraki candidate smoke + immutable release/read-only gate kaydı); resmi finansal GO için en az **3 task** (SELECT-only permission evidence, inventory/opening WAC evidence, izole snapshot/provenance ve final authenticated parity). Production cutover bu blocker'lar çözülmeden yapılmayacak.

## 2026-09-01 candidate inventory ve UI smoke checkpoint

- Candidate authenticated inventory endpoint'i HTTP 200 ve `readOnly=true` döndürdü; inventory source `missing/blocked/not-collected`, current stock `unavailable/current-stock-source-not-verified`, opening evidence `not-available` ve resmi aday sayısı 0.
- Candidate tarayıcı smoke'unda unauthenticated root ekranı API 401 sonrasında sentetik pilot fallback'i gösteriyor; canlı finansal veri göstermediği doğrulandı ancak açık login/session gate ihtiyacı kayda alındı.
- Bu dilimde kod değişikliği yapılmadı; mevcut fail-closed inventory sözleşmesi ve ayrı belge/maliyet etiketleri korunuyor. Candidate production'dan ayrı port/state ile çalışıyor.
- Fiili kalan tahmin: release parity için yaklaşık 1–2 task; tam finansal GO için en az 3 task (resmi SELECT-only permission evidence, inventory/opening WAC evidence, izole CPM snapshot/provenance ve son authenticated parity). Login/session gate ayrıca yüksek öncelikli remediation adayıdır.

## 2026-09-01 server candidate yürütme checkpoint'i

- Kullanıcı onayıyla mevcut public key server `serviceproadmin` hesabının `authorized_keys` dosyasına idempotent olarak eklendi. Strict key-only SSH doğrulaması artık başarılı; server Docker **29.3.0** döndü.
- Local artifact server `.release-incoming` staging alanına taşındı ve SHA-256 birebir eşleşti: `67a6e2c168907aba04e4e9909829b3296d665bd655e1680fc9acdfb6ceed7461`; boyut **381.387** byte.
- Artifact ayrı staging dizininden `marlin-nexus-candidate:reconciliation-label` image olarak build edildi. Image ID/digest: `sha256:482c4e7252ac8c0d633807abb9e52a576e8e47b848975e6ad8183ed4c0eea216`; build 6.773 modül ile tamamlandı.
- İlk candidate auth yapılandırmasında `NEXUS_ADMIN_USERNAME` eksik olduğu kaynak kod kanıtıyla bulundu; `nexus-users.json` kullanıcı kimliği `yonetici` olarak doğrulandı. Başarısız candidate container kaldırıldı, state dizini korundu ve candidate bu değişkenle yeniden başlatıldı.
- Candidate `127.0.0.1:5318` üzerinde ayrı state ve `read_only/tmpfs/cap_drop/no-new-privileges` kısıtlarıyla login kabul etti. Ancak CPM bağlantısı başarısız: health `connected:false, mode:demo`; readiness `503 cpm-not-connected`; log `192.168.12.17\\MARLINSQL - socket hang up`.
- Aynı CPM erişim durumu live container için de authenticated health/readiness kontrolünde görüldü. Server host TCP probe'u `192.168.12.17:1433` için `Connection refused` döndü. Candidate durduruldu; image, artifact ve ayrı state korunuyor. Production container çalışmaya devam ediyor.
- Sonuç: **server Docker candidate build tamamlandı; CPM bağlantı/financial parity gate BLOCKED**. CPM erişimi düzeltilmeden gerçek fatura ve kişi bazlı toplam doğrulaması yapılamaz.

## 2026-09-01 CPM SQL bağlantı düzeltmesi ve candidate parity

- Server host route `192.168.12.17 dev ens160 src 192.168.12.11` olarak doğrulandı. 1433/1434 kapalı/yanıtsız görünürken named-instance ve sabit port probe'ları ayrıştırıldı.
- Aynı CPM credential dosyasıyla salt-okunur `SELECT 1` probe'unda `192.168.12.17\\MARLINSQL` **NAMED_OK**; sabit 49152/49153 denemeleri başarısız çıktı. Bu, ağ rotasından çok uygulamanın SQL encryption seçeneklerini yanlış taşıdığını gösterdi.
- Kaynak kök neden: `server/index.mjs` CPM config içinde `CPM_SQL_ENCRYPT=false` mevcut olsa da `encrypt: true` sabitlenmişti. `server/cpmConnectionConfig.mjs` eklendi; encryption/trust ayarları artık environment değerini izliyor ve varsayılan güvenli davranış korunuyor.
- TDD regression: önce import hatasıyla RED, sonra `server/cpmConnectionConfig.test.mjs` **2/2 GREEN**. Tam suite **386/386**, Vite build **6.773** modül geçti.
- Güncel artifact `nexus-local-20260901-cpm-encryption-fix.tar.gz`: SHA-256 `3ea4067fb91051a0dca73ca72cbe8c0fe642e5c224d6e6ebf2b119100953d420`. Server image: `sha256:82aafee6cabd6a60b4924957a21cf44293b06f6de43c52f89788a1136f31147f`.
- Candidate `cpm-encryption-fix` ayrı state ve `127.0.0.1:5318` portuyla authenticated çalıştı; health `connected:true, mode:live, readOnly:true, database:Marlin_Uyg`.
- Candidate authenticated Overview ve Department net satışları birebir `227.409.749,56 TL`; her iki reconciliation `difference:0, balanced:true`. Bu candidate API parity kanıtıdır; EUR complete değil çünkü tüm maliyet kanıtı review'da.
- Candidate readiness finansal/kanıt blocker'larını doğru koruyor: `read-only-boundary-failed`, `inventory-source-not-verified`, `official-cost-coverage-insufficient`. Build-info identity artık `cpm-encryption-fix` ve image/artifact hash'leriyle eşleşiyor.
- Candidate durumu çalışır halde ayrı loopback portundadır; production `marlin-profit-sharing` **Up 20 hours** olarak değişmeden kalmıştır. CPM write yapılmadı.

## 2026-09-01 read-only evidence gate incelemesi

- `server/releaseContract.mjs` sözleşmesine göre runtime `readOnly` yalnız `CPM_EFFECTIVE_READ_ONLY=true` olduğunda `verified-by-runtime` olur; health endpoint'indeki `readOnly:true` tek başına yeterli değildir.
- Candidate ve production environment'larında `CPM_SQL_ENCRYPT`/`CPM_SQL_TRUST_SERVER_CERTIFICATE` mevcut, fakat `CPM_EFFECTIVE_READ_ONLY` yok. Candidate build-info bu nedenle `readOnly:false, readOnlyEvidence:unverified` döndürdü.
- `server/cpmReadOnly.mjs` etkin izin kanıtında `select:true`, `write:false` ve insert/update/delete/merge/alter/execute/grant/deny/revoke alanlarının false olmasını zorunlu kılıyor. SA hesabı kullanıldığı ve ek yetkiler kabul edildiği için bu kapı keyfi environment flag ile açılamaz.
- Sonuç: Bu blocker kod hatası değil, doğrulanmamış efektif DB izin kanıtıdır. Kanıtlı read-only SQL hesabı veya permission evidence sağlanmadan official financial GO açılmayacaktır.

## 2026-09-01 CPM efektif izin kanıtı

- Candidate container içinden, aynı CPM credential ile yalnız SELECT sorguları çalıştırıldı: `SUSER_SNAME()=sa`, `USER_NAME()=dbo`, `IS_SRVROLEMEMBER('sysadmin')=1`.
- `HAS_PERMS_BY_NAME` sonuçları: `SELECT=1`, `INSERT=1`, `UPDATE=1`, `DELETE=1`, `ALTER=1`, `EXECUTE=1`, `CONTROL=1`.
- Bu kanıt, bağlantı hesabının efektif olarak yazabilir/sysadmin olduğunu doğrular. Nexus uygulama SQL guard'ı yalnız approved SELECT sorgularını çalıştırsa da DB hesabı read-only değildir.
- Sonuç: `CPM_EFFECTIVE_READ_ONLY=true` ayarlanmayacak; `read-only-boundary-failed` gerçek ve geçerli bir release blocker'ıdır. Resmi GO için en az ayrı, doğrulanmış SELECT-only CPM hesabı veya yönetilmiş izin kanıtı gerekir.

## 2026-09-01 hedef ayarı boş-state remediation checkpoint'i

- `settings: null` yalnız persisted app-state adapter sınırında missing ayar olarak normalize edildi; `shared/targetPolicy.mjs` açık null bozuk değerleri reddetmeye devam ediyor.
- Önce RED olan sınır testi sonrasında focused **35/35**, tam suite **388/388**, build **6.775 modül** GREEN oldu.
- Server candidate `target-defaults`: artifact SHA-256 `7e2c497dd4e8c3f86943b04f9f90651bf0e896357647335f28601ad156f8397b`, image digest `sha256:35be12bd19703456f336c4a348f549a63e783919b65e9c31c8797502db2cafc9`, port `5321`.
- Prewarm sonrası authenticated hedef API 200/live, 24 satır ve varsayılan yüzde 10 büyüme / yüzde 5 stretch değerleriyle doğrulandı. İlk demo sonucu yanlış credential mount/env yollarından kaynaklanan runtime konfigürasyon hatasıydı; doğru mount/env ile health live oldu.
- Kalan tahmin: release parity için yaklaşık **1 task**; resmi finansal GO için en az **3 task**. Hedef ayarı yokken UI açıklaması ayrı orta öncelikli iyileştirmedir.

## 2026-09-01 release parity authenticated candidate checkpoint'i

- `target-defaults` server candidate'ında health, session, build-info, readiness, Overview, Department, Target ve reconciliation endpoint'leri authenticated olarak yeniden kontrol edildi.
- Sonraki salt-okunur server inspect'inde `marlin-nexus-candidate-target-defaults` container'ı running, `ReadonlyRootfs=true`, `no-new-privileges=true` ve beklenen image digest'iyle doğrulandı; loopback health HTTP 200/live/readOnly=true/Marlin_Uyg döndürdü. Bu runtime kanıtı CPM hesabının `sa/sysadmin` efektif yetkisini değiştirmediği için `read-only-boundary-failed` blocker'ı açık kaldı.
- Inventory araştırma ekranı için kaynak doğrulanmadığında resmi WAC/maliyet/havuz kapsamını açıkça ayıran uyarı eklendi. Yeni candidate `inventory-warning` üzerinde authenticated inventory endpoint'i HTTP 200 döndürse de `mode=unavailable`, kaynak `missing`, açılış kanıtı `not-available`, resmi aday `0` ve current stock `unavailable` kaldı; tam suite **389/389** geçti.
- Overview canonical net, Department Toplam net ve reconciliation net aynı: `227.409.749,56 TL`; kaynak gross/returns/discounts ve VAT alanları da kayda geçirildi.
- Owner toplamı `160.233.532,44 TL`, fark `67.176.217,12 TL` review kapsamı olarak korunuyor; tanımsız/review satışlar kişi performansına zorla atanmadı.
- Browser hedef ekranı canlı authenticated smoke ile `Nihai defter` ve 12 aylık satırları gösterdi; console error/warning yok.
- Release parity task'ı candidate seviyesinde **PASS**. Resmi finansal GO için en az **3 task** blocker'ı sürüyor: efektif SELECT-only permission evidence, inventory/opening WAC evidence ve izole snapshot/provenance ile final gate.

## 2026-09-01 taze inventory kaynak keşfi checkpoint'i

- Server candidate içinden salt-okunur SELECT sorguları ile CPM `Marlin_Uyg` içinde `dbo.STKHAR` (**416.965** aktif satır) ve `dbo.STKSYM` (**49.063** satır) doğrulandı.
- 2026'da STKHAR tip 81 yok; tip 82 **758** satır (**530/228** yön dağılımı). STKSYM tip 82 **6.465** satır, **4.470** ürün ve **5** depo içeriyor.
- STKSYM metadata'sında resmi WAC maliyet alanları doğrulanmadı. STKHAR maliyet alanları taşısa da tip 82 yön anlamı, pozitif net maliyet, ürün/depo/tarih/belge eşleştirmesi ve açılış kapsamı tamamlanmadı.
- Kaynak tablolarının varlığı kanıtlandı; uygulama recordset'leri hâlâ toplamıyor. WAC `verified` yapılmayacak. Resmi finansal GO için kalan blocker'lar: efektif SELECT-only kanıtı, tamamlanmış inventory/opening WAC sözleşmesi ve izole provenance ile final gate.

## 2026-09-01 tip 82 semantik checkpoint'i

- 2026 aktif STKHAR tip 82'de **100** belge: 35 çift yönlü, 45 yalnız yön 0, 20 yalnız yön 1. Net maliyet satırlarının 470'i pozitif, 288'i sıfır, negatif olan yok.
- Yön 0/1 anlamı dağılımdan çıkarılmayacak; yön 0'da 67, yön 1'de 221 sıfır maliyet satırı bulunuyor. STKSYM sayısal `DEVIR` belgeleri ile STKHAR `SSF-*` belgeleri doğrudan eşleşmedi.
- Sonraki uygulama adımı yön semantiğini varsaymak değil, CPM iş akışından veya güvenilir belge soy zincirinden ürün/depo/tarih/satır eşleştirmesini kanıtlamaktır. WAC recordset'i ve `inventorySource=verified` kapısı henüz açılmayacak.

## 2026-09-01 inventory satır eşleştirme checkpoint'i

- STKSYM 2026 tip 82'nin 6.465 satırından yalnız 6'sı STKHAR ile aynı ürün+depo+tarih gününde, yalnız 1'i aynı miktarla eşleşti. Tarihsiz ürün+depo+miktar araması 92 gevşek aday verdi.
- Miktar farklılığı görülen örnekler nedeniyle otomatik eşleştirme ve WAC açılışı yapılmadı. Bir sonraki gerekli kanıt CPM iş akışındaki belge soy zinciri veya güvenilir bir kaynak anahtarıdır.

## 2026-09-01 CPM başlık/soy zinciri checkpoint'i

- STKHAR tip 82 satırlarının EVRBAS başlık bağında ortak `EVRAKSN` ve `EVRAKGUID` doğrulandı; fakat 2026 tip 82 EVRBAS kayıtlarında kaynak, karşı belge, ikinci belge ve toplu belge ilişkisi yok. EVRHAR tip 81/82 satırı da yok.
- Bu nedenle STKHAR iç satır–başlık kimliği kullanılabilir olsa da STKSYM DEVIR'den upstream bağ kurulamıyor. `EVRAKSN`/`EVRAKGUID` için STKSYM karşılığı veya CPM iş akışı belgesi bulunmadan WAC recordset'i eklenmeyecek.

## 2026-09-01 efektif CPM izin checkpoint'i

- Server candidate üzerinden yalnız SELECT izin sorgusu ile `sa`/`dbo`, `sysadmin=1` ve database/object seviyesinde write izinlerinin açık olduğu yeniden doğrulandı: database INSERT/UPDATE/DELETE/ALTER/EXECUTE/CONTROL=1; STKHAR INSERT/UPDATE/DELETE=1.
- Authenticated candidate readiness `ready=false`, `readOnly=false`, `readOnlyEvidence=unverified` ve `read-only-boundary-failed` döndürdü. Health'in `readOnly=true` olması yalnız uygulama niyetidir.
- Bu task için yeni CPM hesabı veya izin değişikliği yapılmadı. SELECT-only hesap kanıtı gelene kadar resmi finansal GO mümkün değil.

## 2026-09-02 transaction provenance foundation checkpoint'i

- Sol mimari danışmanlığının ardından `server/sourceProvenance.mjs`, CPM kaynak satırları ile canonical satırları kimlik ve sabit iki ondalık ekonomik değer üzerinden deterministik karşılaştıran fail-closed saf temel olarak eklendi.
- `server/cpmTransaction.mjs`, CPM okuma callback'lerini tek açık isolation seviyeli transaction içindeki tek request üzerinden çalıştırır; başarılı/başarısız akışlarda commit sunmaz, rollback ve cleanup uygular.
- TDD kanıtı: yeni transaction testi önce `ERR_MODULE_NOT_FOUND` ile RED, implementasyon sonrası focused **4/4**, tam Node suite **401/401**, Vite build **6.775 modül** GREEN oldu.
- Bu checkpoint canlı CPM provenance endpoint'ine henüz bağlanmadı. Bu nedenle `inventory-source-not-verified`, açılış/WAC ve resmi finansal GO blocker'ları aynen açıktır; sıradaki iş transaction runner'ı canonical + bağımsız STKHAR okumasına bağlamaktır.

## 2026-09-02 transaction provenance orchestration checkpoint'i

- `server/cpmProvenance.mjs`, canonical ve bağımsız kaynak loader'larını aynı transaction içindeki aynı request/read executor üzerinden sıralı çalıştıran sözleşme olarak eklendi. Aynı `mssql.Request` üzerinde eşzamanlı query başlatılmıyor.
- Rowset bulunamadığında sonuç fail-closed `unavailable` kalıyor; orchestration katmanı kendiliğinden `verified` veya WAC readiness üretmiyor.
- TDD/verification: focused transaction + provenance testleri **6/6**, tam Node suite **403/403**, Vite build **6.775 modül** GREEN oldu.
- Gerçek canlı bağlama için bağımsız STKHAR sorgusunun canonical perakende dışlamalarıyla aynı ID kümesini kanıtlaması ve yeni query fingerprint allowlist'e alınması hâlâ gereklidir. WAC ve resmi finansal GO blocker'ları açıktır.

## 2026-09-02 bağımsız STKHAR aday sorgusu checkpoint'i

- `server/sourceProvenanceSql.mjs` parametreli, yalnızca aktif 2026 terminal hareketlerini okuyan sabit alanlı aday source sorgusunu tanımlar; fingerprint `8e5079912142ed04df94904d2b895d8f7a7802cddc390aa9c8567aa65b25e504` olarak allowlist'e eklendi.
- Sorgu `server/cpmReadOnly.mjs` yapısal guard'ından geçiyor ve `source-provenance-candidates-v1` kimliğiyle değiştirilemez sözleşmeye bağlandı.
- TDD/verification: yeni ve mevcut CPM read-only testleri dahil tam suite **405/405**, Vite build **6.775 modül** GREEN oldu.
- Bu sorgu canonical 91→85/perakende dışlamalarını yeniden üretmediği için yalnızca aday karşılaştırma girdisidir; canlı provenance `verified`, WAC veya resmi GO kapısını açmaz. Bir sonraki iş canonical dışlama eşdeğerliğini sağlayan kaynak sorgusu veya güvenilir satır-ID köprüsüdür.

## 2026-09-02 provenance API wiring checkpoint'i

- `server/index.mjs`, canonical ledger ve bağımsız STKHAR aday loader'larını tek transaction orchestration katmanına bağladı; her iki sorgu da mevcut `executeCpmReadOnlyQuery` allowlist sınırından geçiyor.
- `/api/reconciliation/invoices/source-rows` route'u transaction sonucu varsa bunu `mode=live` ile döndürüyor; loader yoksa önceki canonical-only fail-closed fallback korunuyor.
- API contract testi, injected provenance sonucunun ledger finansal metriklerini değiştirmediğini doğruluyor. Tam suite **406/406**, build **6.775 modül** GREEN.
- Aday STKHAR sorgusu canonical perakende dışlamalarını eşdeğer üretmediğinden canlı sonuç `mismatch` olabilir; bu beklenen tanı sonucudur ve WAC/readiness kapısını açmaz.

## 2026-09-02 canonical-ID kaynak yeniden okuma checkpoint'i

- `sourceProvenanceByCanonicalIdsSql`, canonical ledger satır kimliklerini `@canonicalIdsJson` parametresiyle STKHAR'dan aynı transaction içinde yeniden okur. Kaynak ekonomik alanları canonical sonucu yeniden türetmeden karşılaştırılır.
- `server/index.mjs` canonical sorgu sonrasında yalnız yeni ID JSON parametresini ekler; aynı `mssql.Request` üzerinde `company` parametresi yeniden tanımlanmaz.
- Yeni sorgunun fingerprint'i `a07fcaca27f54d3a521874a9821931b1c17e57012cff62def25221d9625b7416` olarak read-only allowlist'e eklendi.
- Tam suite **407/407**, Vite build **6.775 modül** GREEN. Bu kanıt canonical satırların kaynak değerlerini doğrular; canonical-dışı STKHAR satırlarını kapsamadığı için tek başına WAC/readiness açmaz.

## 2026-09-02 kaynak kapsamı ayrıştırma checkpoint'i

- `buildSourceCoverageEvidence`, exact canonical-ID kaynak yeniden okumasını geniş STKHAR aday kümesiyle karşılaştırarak canonical dışında kalan veya canonical için eksik aday satırları ayrı metadata olarak raporlar.
- Exact value evidence ile broad candidate coverage birbirine karıştırılmadı; coverage `incomplete` olsa bile canonical değer kanıtı finansal metrikleri değiştirmiyor.
- Orchestration üçüncü, sıralı read olarak coverage loader'ını destekliyor. Tam suite **409/409**, build **6.775 modül** GREEN.
- Coverage sorgusu hâlâ canonical 91→85 semantik eşdeğerliğini kanıtlamaz; WAC ve resmi readiness kapıları açık kalır.

## 2026-09-02 provenance readiness gate checkpoint'i

- `server/releaseReadiness.mjs`, provenance payload'ı açıkça verilmişse hem `status=verified` hem `coverage.status=complete` şartını arıyor; aksi durumda `source-provenance-unverified` blocker'ı üretiyor.
- `server/releaseContract.mjs` provenance alanını readiness payload'ına taşıyor. Provenance kontrolü başarısız olsa da readiness endpoint'i çalışmaya devam ediyor ve fail-closed blocker döndürüyor.
- Bu gate CPM `sa` risk istisnasını değiştirmiyor; WAC, açılış ve resmi finansal uygunluk bağımsız blocker olarak kalıyor.
- Tam suite **410/410**, Vite build **6.775 modül** GREEN. Kalan tek kritik kanıt, canonical dışlama semantiğini ve source kapsamını canlı veride tamamlamaktır.

## 2026-09-02 provenance-readiness artifact checkpoint'i

- Güncel çalışma ağacı için server candidate artifact'ı üretildi: `C:\Users\furkan.cakir\Documents\Marlin Nexus Releases\nexus-local-20260902-provenance-readiness.tar.gz`.
- Artifact SHA-256: `10839d73c6e3b73f58a67babde194b1b51ad5b19bbbe89fc172785d2ad49163c`.
- Artifact allowlist yalnızca uygulama kaynaklarını içeriyor; CPM credential/state/runtime klasörleri dahil edilmedi.
- Bu adım production deployment yapmadı. Server Docker candidate smoke ve authenticated provenance/readiness sonucu henüz alınmadı.

## 2026-09-02 aday runtime provenance ve readiness doğrulama checkpoint'i

- Aday runtime'da `mssql.Transaction.begin()` için string izolasyon seviyesi hatası bulundu ve `sql.ISOLATION_LEVEL.READ_COMMITTED` ile düzeltildi. Ardından readiness'in ağır canonical ledger sorgusunu tekrar çalıştırmaması için mevcut ledger snapshot'ı provenance karşılaştırmasına taşındı; source ve coverage SELECT'leri tek salt-okunur transaction/request içinde kaldı.
- MarlinSQL `OPENJSON` desteklemediği için canonical-ID JSON SQL filtresi üretim adayı üzerinde reddedildi. Geniş, parametreli STKHAR aday SELECT'i tek kez okunup `sourceRowId` ile snapshot `rootId` kümesine uygulama tarafında ayrıştırıldı; readiness yanıtından ham 22.004 satırlık rowset'ler çıkarıldı.
- Aday artifact SHA-256 `1e6884a21bd6b822a285172ad62ecef8a4d4c27c64238b922c66300669e2b258`; aday image digest `sha256:943b5635f1572b9f5217334783613d081bdb24952ef87af8e251abfa37a3e130`. Container `rootfs=true`, CPM health `connected=true/readOnly=true` olarak doğrulandı.
- Authenticated 2026 readiness: provenance `verified`; canonical/source satır sayısı `22.004/22.004`; eksik, ekstra, duplicate, null, malformed ve net fark sayaçlarının tamamı `0`; broad coverage `complete`. Readiness yalnız `inventory-source-not-verified` ve `official-cost-coverage-insufficient` nedeniyle `false` kaldı. `cpm-extra-permissions` açıkça kabul edilmiş risk olarak raporlandı; production deploy yapılmadı.
- Final verification: tam Node suite **412/412**, Vite build **6.775 modül** GREEN. Resmi finansal GO için inventory movement/WAC/opening evidence ve CPM effective SELECT-only kanıtı hâlâ gereklidir.

## 2026-09-02 inventory opening research planı (Sol kararı)

- Sol, verified WAC kaynağı üretmek yerine ayrı authenticated read-only `/api/research/inventory-opening-evidence` endpoint'inin uygulanmasını önerdi. Aday STKHAR tip 82 ve STKSYM DEVIR kanıtı bu endpoint'te kalacak; ledger snapshot, WAC hesapları ve readiness blocker'ları değişmeyecek.
- Endpoint yıl ve `sampleLimit` (1–100) ile sınırlı, sabit/parametreli SELECT sorguları kullanacak; SQL Server uyumluluğu için `OPENJSON` ve `STRING_AGG` kullanılmayacak. Müşteri ve serbest ticari metin örneklenmeyecek.
- STKHAR `TUTAR-ISKONTO` netini ve yön kodunu olduğu gibi taşıyacak; yön 0/1 inbound/outbound olarak yorumlanmayacak. STKSYM `NKOD1/2/3` maliyet olarak kullanılmayacak; eksik soy zinciri ve maliyet semantiği candidate/review kalacak.
- Uygulama sırası: saf candidate payload için RED/GREEN testleri; fiziksel kolonları yeniden varsaymadan mevcut doğrulanmış STKHAR/STKSYM alanlarıyla bounded query contract; authenticated candidate route smoke; tam suite/build/diff doğrulaması. Başarı ölçütü daha iyi blocker kanıtıdır, WAC `verified` değildir.

## 2026-09-02 inventory opening research checkpoint'i

- `server/inventoryOpeningResearchSql.mjs` ile STKHAR tip 82 ve STKSYM DEVIR için dört sabit, parametreli SELECT allowlist'e alındı. STKHAR net tutarı `TUTAR-ISKONTO` olarak taşınıyor; STKSYM alanlarından maliyet veya yön anlamı çıkarılmıyor.
- Canlı aday smoke sırasında MarlinSQL'in `rowCount` alias'ını keyword olarak yorumladığı doğrulandı (SQL 156). Alias `[rowCount]` olarak düzeltildi; Date nesneleri ISO gününe normalize edildi ve STKSYM bounded sample sayısının gerçek toplam sanılmaması için tam özet sorgusu eklendi.
- Server Docker candidate yeniden kuruldu: artifact SHA-256 `aa51cedd2129cdc2645f09a7ba02b9c0c5c2e515cd2f6aa273fad183bbf9afe4`, image digest `sha256:6e4b296f75f0ba057d545cfa6282415508a17fe2b778d9a045b81b26946fedef`. Authenticated CPM smoke `connected=true`, `readOnly=true`, database `Marlin_Uyg`.
- 2026 aday verisi: STKHAR type 82 **758** satır, 627 ürün, 7 depo; yön kodları 0/1: 530/228; STKSYM DEVIR **6.439** satır, 4.469 ürün, 4 depo; 4.566 pozitif ve 1.873 sıfır miktarlı satır. Açılış eşleşmesi sample üzerinde 0 exact, 0 quantity-only, 0 conflict, 5 unmatched; official eligible `0`. Bu veriler candidate-only kalıyor.
- Authenticated readiness provenance `verified`, coverage `complete`; readiness hâlâ yalnız `inventory-source-not-verified` ve `official-cost-coverage-insufficient` blocker'ları nedeniyle `false`. Production deploy veya CPM yazması yapılmadı.
- Final verification: tam Node suite **418/418**, Vite build **6.775 modül**, `git diff --check` GREEN. Sol’un ayrı candidate endpoint ve fail-closed önerisi kabul edilerek uygulandı.

## 2026-09-02 CPM Denetim yatay erişim checkpoint'i

- `AuditPage.jsx` içine tabloyla senkronize üst yatay scrollbar eklendi. Kritik `Satır maliyeti`, `Brüt kâr` ve `Doğrulama` kolonları dar görünümde erişilebilir kalıyor; mevcut sticky kolon davranışı korunuyor.
- İlk deneme UI contract testinde RED oldu; markup, ref senkronizasyonu ve `aria-label` eklendikten sonra UI contract **14/14** GREEN oldu. Scroll listener cleanup ve veri yenilendiğinde başlangıç senkronizasyonu uygulanıyor.
- Browser candidate portuna SSH tüneliyle erişim, Browser Use izolasyonu nedeniyle `ERR_CONNECTION_REFUSED` olarak doğrulanamadı; bu nedenle canlı screenshot kanıtı alınamadı. Kaynak/contract kanıtı mevcut, gerçek ekran görsel doğrulaması açık takip maddesidir.
- Tam Node suite **418/418**, Vite build **6.775 modül**, `git diff --check` GREEN. CPM veya production üzerinde yazma/deploy yapılmadı.

## 2026-09-02 CPM Denetim candidate paket checkpoint'i

- UI değişikliği candidate artefact'a paketlendi: `nexus-local-20260902-audit-scroll.tar.gz`, SHA-256 `e2fbe229e84ceacf7a7f94cc91e517dc851583f8aedb42e7973cbb4a7b8998e0`.
- Server Docker candidate image yeniden oluşturuldu: `sha256:a957892b933c76e4c97a4335299683c57b52bdc7f52441a525651d4b8eb69073`; container `running`, health `connected=true/readOnly=true`, database `Marlin_Uyg`.
- Browser Use candidate portuna bağlanamadığı için screenshot/UI runtime görsel kabulü alınamadı; bu nedenle görsel task kaynak-test ve candidate build seviyesinde doğrulanmış, ekran screenshot doğrulaması açık kalmıştır.

## 2026-09-02 CPM Denetim kontrast ve runtime doğrulama checkpoint'i

- Canlı aday Docker üzerinden authenticated Browser doğrulaması yapıldı. Masaüstü ve 390px mobil görünümde `CPM canlı · salt okunur`, 22.006 satır, 228.170.883 TL net hareket ve ekonomik kolon başlıkları gözlemlendi.
- Masaüstü screenshot'ında koyu temada tablo satır metinlerinin düşük kontrastlı olduğu kanıtlandı; `audit-table` için koyu tema `strong` metin rengi `#dbe8f5`, ikincil metin rengi `#a9b8cb` olarak düzeltildi. Mobil görünümde KPI kartlarının tek kolona indiği ve tablo bölümünün dikey akışta erişilebilir olduğu doğrulandı.
- UI kontrat RED/GREEN sonrası **14/14**, tam Node suite **418/418**, Vite build **6.775 modül** ve `git diff --check` GREEN.
- Güncel UI screenshot kanıtları: `docs/audit/2026-09-02/02-audit-desktop-after-contrast.png`, `03-audit-mobile-table.png`, `04-audit-mobile-table-right.png`. Browser console error/warn çıktısı kaydedilmedi.
- Server Docker candidate güncellendi: artifact `nexus-local-20260902-audit-contrast-v2.tar.gz`, SHA-256 `46c34ec9e0e95be07d79eb4715ffb3e4e6f1837f74f08e8da7dc0bf5315276dd`; image digest `sha256:4bbdc2ff99c3017081a79a7516f0868ab2463b953c2df789e242bb02e05ea00b`. Container `running`, `rootfs=true`, `no-new-privileges=true`, CPM health `connected=true/readOnly=true`, database `Marlin_Uyg`.
- Production deploy yapılmadı; CPM üzerinde hiçbir yazma işlemi yapılmadı. Audit UI görsel doğrulama task'ı tamamlandı. Resmi finansal GO için `inventory-source-not-verified` ve `official-cost-coverage-insufficient` blocker'ları devam ediyor.

## 2026-09-02 CPM Denetim kaynak filtresi düzeltme checkpoint'i

- Canlı aday parity kontrolünde Özet net satışı `227.553.755 TL`, Denetim Merkezi tüm kaynak net hareketi `228.170.883 TL` olarak görüldü; ekranlar arasında `617.128 TL` fark gözlendi. Kapsamların farklı olabileceği için farkın kök nedeni henüz kesinleştirilmedi.
- Kod incelemesi kesin bir filtre kusuru gösterdi: `auditRow()` tüm satışları `invoice` etiketliyordu. Tip 17 satış faturası satırları `provisional`, tip 85/91 satırları `invoice`, tip 18 iadeleri `return` olarak ayrıştırıldı.
- Yeni regression testi ile üç kaynak filtresi izole fixture üzerinde doğrulandı. Odak test **19/19**, tam suite **419/419**, Vite build **6.775 modül**, `git diff --check` GREEN.
- Düzeltme server Docker candidate'a taşındı: artifact `nexus-local-20260902-audit-source-filter-v3.tar.gz`, SHA-256 `5bfae32a6d9ce505be53aed4a0045b3d823ce5b14795b78d202d66e226abaef6`; image digest `sha256:b11c6bb33a6ac8d5f6c294393ba6417f7222069ea7b0273983c1ae050f9f2ec3`. Health `connected=true/readOnly=true/database=Marlin_Uyg`, rootfs read-only ve no-new-privileges korunuyor.
- Aday yeniden kurulumundan sonra authenticated finans ekranı prewarm süresince veri yüklemede kaldı; yeni source-filter sayıları canlıda tekrar alınamadı. Bu nedenle `617.128 TL` farkın giderildiği iddia edilmiyor; canlı filtre parity doğrulaması sıradaki açık alt task'tır.

## 2026-09-02 CPM Denetim canlı kaynak filtresi parity checkpoint'i

- Yeniden kurulan adayda authenticated Browser ölçümü tamamlandı; console error/warn çıktısı boş kaldı.
- 2026 kaynak kapsamları: tümü **22.006 satır / 228.170.883 TL**; Nihai fatura **6.375 / 52.570.693 TL**; Kapanmış/aktarılmış **15.477 / 177.981.020 TL**; Satış iadesi **154 / -2.380.830 TL**. Satış kaynakları eksi iadeler toplamı, tüm Audit net hareketine eşittir.
- Önceki filtre hatasının candidate üzerinde düzeldiği doğrulandı: tip 17 satırları artık provisional filtresinde, tip 85/91 satırları invoice filtresinde görünmektedir.
- Özet net satış **227.553.755 TL** ile Audit tüm net hareketi arasındaki yaklaşık **617.128 TL** fark, Audit’teki 79 `Kapsam dışı` satırın eklenmesiyle açıklanıyor; Audit ekranı integer formatında bu alt toplamı **617.127 TL** gösteriyor. Aradaki yaklaşık 1 TL için ham ondalık API/export kanıtı bu turda alınamadı; kesin kuruş eşitliği açık kaldı.
- Sonuç: kaynak filtresi toplama kusuru giderildi; genel KPI farkı büyük ölçüde kapsam sözleşmesi farkıdır. UI’nin “net hareket” ile “net satış” ayrımını daha açık etiketlemesi önerilir. Production/CPM yazımı yapılmadı.

## 2026-09-02 exact decimal parity follow-up checkpoint'i

- Kesin kuruş doğrulaması için authenticated `/api/audit-ledger?...&verification=excluded&export=1` JSON navigasyonu denendi. In-app Browser, API JSON navigasyonunu `ERR_BLOCKED_BY_CLIENT` ile engelledi; çerez okunmadı ve parola başka kanala taşınmadı.
- Bu nedenle Audit’te gösterilen yuvarlanmış **617.127 TL** ile ekran farkı olan yaklaşık **617.128 TL** arasındaki alt-ondalık fark doğrulanamadı. Bu, mevcut kanıt sınırı olarak açık bırakıldı; değer tahmin edilmedi.
- Candidate health, source filtreleri ve kod/test düzeltmesi önceki checkpoint'lerde doğrulanmış durumda. Exact raw API/export erişimi sağlanana kadar genel finansal GO açılmayacak.

## 2026-09-02 Audit kapsam açıklığı checkpoint'i

- Audit KPI kartına `kapsam dışı dahil` açıklaması ve kapsam dışı net tutarı için iki ondalıklı görünüm eklendi. Böylece Audit net hareketinin Özet net satışından neden farklı olabileceği kullanıcıya açıkça gösteriliyor.
- UI kontratı **14/14**, tam Node suite **419/419**, Vite build **6.775 modül** GREEN.
- Candidate artifact SHA-256 `297df92478c161587d726bc6501829c0bc1a63a680ad2a2e35234d0aaf402a69`; image digest `sha256:0e1a078e6e32c4e12cc5ddf7d29b2640cc4c8ae3b3f4e48523ab6fdadaff7b7d`. İlk health isteği container startup sırasında reset oldu; 5 saniye sonra `connected=true/readOnly=true/database=Marlin_Uyg`, `rootfs=true`, `no-new-privileges=true` doğrulandı.
- Raw ham ondalık API/export kanıtı Browser politika engeli nedeniyle hâlâ açık; UI farkının ana kapsam açıklaması tamamlandı ancak kesin kuruş parity iddia edilmiyor.

## 2026-09-02 açılış kanıtı örneklem kapsamı checkpoint'i

- Açılış kanıtı tanısının `sampleLimit` ile sınırlı STKSYM/STKHAR satırlarında hesaplandığı doğrulandı; önceki UI başlığı bu sayıların tam CPM nüfusu olduğu izlenimini verebiliyordu.
- Payload artık `scope: "sample"`, `sampleLimit` ve `sampleRowCount` metadatasını taşıyor. UI tanıyı `Örneklem tanısı · en fazla N satır` olarak etiketliyor ve sayıların tüm CPM nüfusunu temsil etmediğini belirtiyor.
- Resmi WAC/readiness davranışı değiştirilmedi; aday tanı hâlâ resmi maliyet kapsamını doğrulamaz ve `inventory-source-not-verified` blocker'ı korunur.
- Hedef testler **20/20** GREEN. Full suite ve production build bu checkpoint'in kapanış doğrulamasıdır; CPM yazımı ve production deploy yapılmadı.
- Güncel paket server Docker staging'e aktarıldı: artifact `nexus-local-20260902-opening-scope-v5.tar.gz`, SHA-256 `4c3b3e80e9362e022d5ecaa457d72c21801bcd40af9507d01495113f723cd6e0`; candidate image ID `sha256:9d24472f0df61260647790ee68c57227ba2337ab9215e410264e2693d94dd8f4`.
- Ayrı server candidate `marlin-nexus-candidate-opening-scope-v5` loopback `127.0.0.1:5325` üzerinde running olarak oluşturuldu. Health `connected=true`, `mode=live`, `readOnly=true`, `database=Marlin_Uyg`; `ReadonlyRootfs=true` ve `no-new-privileges=true` doğrulandı. Production container çalışır durumda bırakıldı.

## 2026-09-02 stok araştırması erişilebilirlik ve kaynak rozeti checkpoint'i

- `InventoryResearchPage` kaynakta mevcut olmasına rağmen ana navigasyona bağlı değildi; bu nedenle kullanıcı sayfaya erişemiyordu. `Stok Araştırması` menüsü ve `activePage === "inventory"` render dalı eklendi.
- Canlı candidate smoke sırasında 93 ürün/hareket verisi yüklenirken üst rozetin `Kaynak kullanılamıyor` demesi bulundu. Sorun, mevcut hareket araştırması ile doğrulanmamış resmi WAC kaynağının aynı `mode` alanında sunulmasından kaynaklanıyordu.
- Rozet artık hareket satırları mevcut fakat resmi kaynak doğrulanmamışsa `CPM hareket araştırması · WAC kapalı`, gerçekten veri yoksa `Kaynak kullanılamıyor` gösteriyor. Resmi WAC/maliyet/havuz hesabı açılmadı.
- TDD hedefi ve tam doğrulama GREEN: tam Node suite **422/422**, Vite build **6.776 modül**. Server candidate artifact `nexus-local-20260902-inventory-badge-v7.tar.gz`, SHA-256 `754bfbe7c5f1b9b4defb26ba6461d271677dc00708d391c7d0c8d00595c26e5b`; image ID `sha256:b0c560411b354ff4a930c8c7f1e86d67e8ac64b8146a0e9bf7e40469d3c8c0de`.
- Candidate `marlin-nexus-candidate-inventory-badge-v7` loopback `127.0.0.1:5327` üzerinde authenticated UI ile doğrulandı; production ve CPM değişmedi.

## 2026-09-02 stok açılış tanısı entegrasyon checkpoint'i

- `InventoryResearchPage` artık `/api/research/inventory-opening-evidence?year=2026&sampleLimit=20` salt-okunur endpoint'ini çağırıyor; hareket araştırması ile açılış tanısı birbirinden bağımsız yükleniyor.
- Canlı ilk denemede isteklerin yarışması bulundu: hareket isteği geç döndüğünde tanı sonucu `null` ile eziliyordu. TDD regression kontrolü ile hareket sonucu mevcut tanıyı koruyacak şekilde düzeltildi.
- Tam Node suite **422/422**, Vite build **6.776 modül**, `git diff --check` GREEN.
- Server Docker candidate artifact `nexus-local-20260902-opening-diagnostics-v9.tar.gz`, SHA-256 `1bfb580f8b067f4fe0a5adb1e2dee5213edc0b01337430bbf549d48ae28f7ec7`; image manifest digest `sha256:269c6f23a45f040bcae74485dccba6bd23555ded128d1b8004d1b74c549b1b00`.
- Candidate `marlin-nexus-candidate-opening-diagnostics-v9` `127.0.0.1:5329` üzerinde running, rootfs read-only ve `no-new-privileges` ile çalıştı; `/api/health` `connected=true`, `mode=live`, `readOnly=true`, `database=Marlin_Uyg` döndürdü.
- Authenticated Browser kanıtı: ekran `Örneklem tanısı · en fazla 20 satır`, `Tanı mevcut`, `Resmi adaya uygun 0`, `Exact-key 0`, `Yalnız miktar 0`, `Çatışma 0`, `Maliyet eksik 0`, `Eşleşmeyen 20` gösterdi. UI ayrıca örneklemin tüm CPM nüfusunu temsil etmediğini ve WAC kararını değiştirmediğini açıkça belirtiyor.
- Bu task tamamlandı. Resmi WAC ve finansal GO blocker'ları (`inventory-source-not-verified`, `official-cost-coverage-insufficient`, exact decimal parity) devam ediyor; production deploy ve CPM yazımı yapılmadı.

## 2026-09-02 Audit kesin ondalık gösterim checkpoint'i

- Audit KPI kartındaki kapsam dışı net tutar artık zorunlu iki ondalıkla gösteriliyor; örnek `617127.456` değeri `617.127,46 TL`, negatif `-0.01` değeri `−0,01 TL` olarak doğrulandı.
- Yeni UI kontratı GREEN; tam Node suite **423/423**, Vite build **6.776 modül**, `git diff --check` GREEN.
- Server Docker candidate `marlin-nexus-candidate-precise-audit-v10` oluşturuldu; artifact SHA-256 `c1ca6a109f85330374be3f56443d0df6b03c7e307b556bf4bbffdc68ee0e95ff`, image manifest digest `sha256:811f6f008e66f7ea86527e6cef8b364c6d7c25d7f28ef0a5ecb38313b2e8089d`.
- Candidate health `connected=true`, `mode=live`, `readOnly=true`, `database=Marlin_Uyg`; container rootfs read-only ve `no-new-privileges=true`.
- Authenticated Browser’da `Kapsam dışı: 0,00 TL` formatı görüldü. CPM cold prewarm 45 saniyede devam ettiği için gerçek Audit satır toplamı bu turda alınamadı; bu nedenle exact CPM parity hâlâ doğrulanmamış kabul ediliyor.
- UI precision task tamamlandı. Kalan ana task tahmini **3**: raw exact decimal CPM parity, resmi WAC/açılış-kapsam kanıtı ve resmi maliyet kapsamı. Production deploy ve CPM yazımı yapılmadı.

## 2026-09-02 prewarm sonrası canlı Audit parity checkpoint'i

- v10 candidate cold prewarm tamamlandı; Docker loglarında 2026 ve 2025 ledger prewarm sonuçları yaklaşık **201.496 ms** olarak kaydedildi. Container running ve restart sayısı 0.
- Authenticated Browser’da aynı 2026 dönemi için Özet net satış **227.658.732 TL**, Audit net hareket **228.275.859 TL**, Audit kapsam dışı tutarı **617.127,34 TL** ve **22.016 sonuç** görüldü.
- Görsel olarak farkın ana kapsam açıklamasıyla uyumlu olduğu doğrulandı; ancak Audit net hareket değeri hâlâ integer gösterildiği için `617.127,34 TL` ile toplamın ekrandaki yuvarlanmış farkı arasında kesin kuruş parity iddia edilmedi.
- Bu checkpoint canlı finans ekranının prewarm sonrası çalıştığını kanıtlar; ham CPM export/API satırlarının Browser politika engeli nedeniyle alınamaması exact source-row parity blocker'ını açık bırakır.

## 2026-09-02 açılış eşleştirme alan uyumu checkpoint'i

- Kod incelemesi ve RED test, normalize edilmiş CPM alanlarının (`movementDate`, `openingDate`, `documentNumber`, `lineNumber`, `MALKOD`, `DEPOKOD`) eşleştirici tarafından okunmadığını ortaya çıkardı; bu nedenle canlı tanı örnekleri yapay biçimde `null/unmatched` görünüyordu.
- Eşleştirici ve STKSYM normalizasyonu düzeltildi; tanı örnekleri artık gerçek CPM kimliği, ürün, depo, tarih ve belge alanlarını koruyor. Eşleşme maliyet kanıtı yoksa `missing-cost-evidence` olarak kalıyor.
- Odak açılış/matcher testleri **11/11**, tam suite **425/425**, build **6.776 modül** GREEN.
- Server candidate v11 artifact SHA-256 `1ef6b454a5e5fe2feed31bb622d3d6124f818c893e076f25ce2c7a0b42674e20`; image manifest digest `sha256:c9364252ef896dfc265c3ca8ef83781ea4ba59ea2b1274dbe9a8ae3d5988f1ac`.
- v11 authenticated GET kanıtı: `scope=sample`, `sampleLimit=20`, `sampleRowCount=40`, ilk gerçek örnek `symId=51356`, `productCode=0030947404`, `depotCode=MRK`, `date=2026-01-13`; sınıf dağılımı örneklemde `unmatched=20`, resmi uygun kayıt `0`.
- Resmi WAC/readiness blocker'ı korunuyor; kaynak satırlarının tamamının dönem/kayıt semantiği ve maliyet kanıtı ayrıca doğrulanmadan resmi maliyete bağlanmadı. CPM ve production yazımı yapılmadı.

## 2026-09-02 minor-unit parity ve Audit sticky kolon checkpoint'i

- Uzlaştırma API’si `exactMinorUnitDifferences` alanını ekledi; kaynak ve Nexus kanonik net satışları metin tabanlı, yarım-kuruşu muhasebe yuvarlamasıyla işleyen BigInt minor-unit karşılaştırmasıyla raporluyor. Kanonik `row.netSales` pilot kartlarını zaten içerdiği için ikinci kez eklenmiyor.
- İlk v12/v14 canlı adaylarında bulunan 8/4 kuruş farkının nedeni yuvarlama/kanonik toplam sözleşmesi olarak ayrıştırıldı; v15 authenticated smoke sonunda 21.957 satırda `grossSales=0`, `returns=0`, `discounts=0`, `netSales=0` exact minor-unit farkı görüldü. Float alanlardaki yaklaşık `6,85e-7` fark yalnız gösterim/IEEE-754 artığıdır.
- Audit tablosunda maliyet, brüt kâr ve doğrulama kolonları geniş ekranda sağa sticky (`cost right:265px`, `profit right:160px`, `validation right:0`), dar ekranda normal akışta; filtre grid’i `minmax(0,...)` ile taşma riskini azaltıyor. Dark theme güçlü metin renkleri eklendi.
- Odak testleri GREEN; tam suite **428/428**, Vite build **6.775 modül**, `git diff --check` GREEN. v15 server candidate artifact SHA-256 `e17231f65022d339df3f5ebe50301fb4eca2fa8ff08cf3b7ded571fd07e95dac`, image manifest digest `sha256:65947dba053cf7d43631a2cf9d8dee8beabbf1481125013712bc755898b8c319`; authenticated health live/connected/readOnly=true/Marlin_Uyg.
- Resmi WAC ve bağımsız source-provenance kapsamı açılmadı; CPM ve production yazımı/deploy’i yapılmadı. Kalan ana GO taskları: doğrulanmış inventory/WAC kaynağı ve efektif SELECT-only CPM kanıtı ile son release gate.

## 2026-09-02 CPM WAC view keşfi checkpoint'i

- Salt-okunur `INFORMATION_SCHEMA`/`sys.sql_modules` keşfinde `dbo.VW_STOKDURUM` bulundu; kolonları ürün/depo ve stok giriş-çıkış/miktar alanlarıdır, maliyet veya WAC alanı içermez. Bu nedenle mevcut stok görünümü doğrudan WAC kaynağı değildir.
- `dbo.VW_STOK_DEVIR_MALIYET_AKTAR` ve `dbo.HAKKI_STOK_DEVIR` bulundu. Canlı tanım `VW_STKHAR` içindeki `EVRAKTIP='081'` miktarını topluyor; maliyeti ise tarihsel alış hareketinden değil `STKKRT.NKOD1` güncel fiyatından, KDV indirimi ve `MRLISK` iskonto oranlarından türetiyor. View ayrıca şirket/depo/tarihsel fiyat tarihi ve stable opening-line lineage taşımıyor.
- Canlı salt-okunur özet: `VW_STKHAR` tip 81 **6.666** satır / **99.373,9** miktar; `HAKKI_STOK_DEVIR` **5.602** ürün / **99.373,9** miktar; maliyetli view **5.252** ürün / **97.580,9** miktar / türetilmiş değer **4.483.632,4383**. Bu kapsam farkı ve güncel fiyat formülü, view’ı modeldeki tarihsel açılış WAC’ı için güvenilir kanıt yapmıyor.
- `STKMLY` canlıda satır döndürmedi; mevcut `VW_STOK_DEVIR_MALIYET_AKTAR` yalnızca denetim adayı olarak değerlendirilmeli. Resmi WAC kapısı açılmadı; Nexus CPM’ye yazmadı.
- Sonuç: WAC sorunu kodla “çözülebilecek” bir mapping bug değil, CPM’de tarihsel maliyet/soy zinciri sözleşmesinin eksik veya doğrulanmamış olmasıdır. Kalan ana tasklar: yetki riskini kabul edilmiş konfigürasyonla son gate’e taşımak ve yönetim/CPM’den tarihsel açılış maliyet sözleşmesini doğrulamak.

## 2026-09-02 canlı WAC kaynak sözleşmesi yeniden doğrulama checkpoint'i

- v11 server candidate authenticated read-only route üzerinden 2026 CPM özetleri yeniden alındı: STKHAR tip 82 **758** satır, **627** ürün, **7** depo; yön 0/1 **530/228**; net maliyet pozitif/sıfır **470/288**. STKSYM DEVIR **6.439** satır, **4.469** ürün, **4** depo; pozitif/sıfır miktar **4.566/1.873**.
- `sampleLimit=100` ile açılış tanısı **200** satır üzerinde çalıştı: exact-key **0**, quantity-only **0**, conflict **0**, missing-cost **0**, unmatched **100**, resmi adaya uygun **0**. İlk örnek CPM alanlarını gerçek değerlerle taşıyor (`symId=51356`, ürün `0030947404`, depo `MRK`, tarih `2026-01-13`, miktar `0`) ve `no-source-row-match` olarak sınıflanıyor.
- Bu canlı kanıt STKSYM DEVIR ile STKHAR tip 82 arasında güvenilir ürün/depo/tarih/miktar veya upstream belge bağı olmadığını gösterir; yön 0/1 ve `TUTAR-ISKONTO` WAC semantiği olarak yorumlanmadı. `inventory-source-not-verified` ve `official-cost-coverage-insufficient` blocker'ları doğru biçimde devam ediyor.
- CPM ve production yazımı yapılmadı; sonraki task ham CPM/Nexus parasal parity kanıtının sabit kuruş/minor-unit karşılaştırmasıdır.

## 2026-09-02 tarihsel alış maliyeti adayının semantik doğrulaması checkpoint'i

- Aday Docker içinden CPM’e yalnızca `SELECT` sorguları ile `VW_STKHAR` üzerinde salt-okunur keşif yapıldı. Tip 9: **15.925** satır (2023-01-01–2026-08-31), tip 609: **27.276** satır (2022-07-20–2026-08-31); her iki tipte de `BIRIMFIYAT` ve `_MALIYETTARIH` büyük ölçüde dolu.
- Bu alanlar tarih/ürün/miktar/birim fiyatı taşısa da tip 9/609’un satın alma maliyeti adayı olduğu; müşteri iadesi, transfer, konsolidasyon ve gerçek giriş belgesi ayrımının tamamı için CPM kaynak sözleşmesi henüz kanıtlanmadı. Örnek tip 609 satırlarında `MALIYETKOD` boş ve `MALIYETSIRANO=0`; bu nedenle `_MALIYETTARIH` tek başına WAC soy zinciri değildir.
- `VW_STOK_DEVIR_MALIYET_AKTAR` ayrıca reddedildi: maliyeti tarihsel hareketten değil güncel `STKKRT.NKOD1` fiyatı + KDV/iskonto formülünden türetiyor. `SMM_TARIHLI_MALIYET` tarihli maliyet prosedürü mevcut olsa da çalıştırılmadı; prosedürün üretim tablolarına yazma ihtimali ve çıktısının WAC sözleşmesi bu salt-okunur denetimde doğrulanmadı.
- Sonuç: alış satırları resmi WAC için umut verici ham kanıt, fakat resmi finans modüllerini canlıda açmak için yeterli değil. `inventory-source-not-verified` ve `official-cost-coverage-insufficient` blocker’ları korunuyor; Nexus CPM’e yazmadı ve production deploy yapılmadı.

## 2026-09-02 CPM tarihli maliyet prosedürü güvenlik ve doluluk checkpoint'i

- CPM metadata’sı salt-okunur `sys.sql_modules` sorgusuyla incelendi; `SMM_TARIHLI_MALIYET` prosedürü `SPAPP_SMM` çağırıyor ve `@GUNCELLE=0` gönderiyor.
- `SPAPP_SMM` hesaplamayı geçici `#MALIYETDURUM` tablolarında yapıyor; kalıcı `STHMLY`, `STKMLY` veya `BUTSTH` tablolarına doğrudan INSERT/UPDATE/DELETE yaptığına dair tanım kanıtı bulunmadı. Buna rağmen prosedür dinamik SQL, MLYPRM konfigürasyonu ve bağlı maliyet yordamları kullanıyor; çalıştırılmadan güvenli Nexus API sözleşmesi sayılamaz.
- Canlı tablo doluluğu: `STHMLY=0`, `STKMLY=0`, `BUTSTH=0`. Dolayısıyla CPM’nin tarihli maliyet rapor prosedürü mevcut olsa da Nexus’un bağlanabileceği doğrulanmış, kalıcı ve yeniden üretilebilir tarihsel WAC satır kaynağı kanıtlanmadı.
- Sonuç: prosedür çağrısı eklenmedi ve çalıştırılmadı; yalnızca sabit, parametreli `SELECT` okumaları kullanıldı. Resmi WAC/maliyet/kâr/havuz modülleri kapalı, CPM ve production değişmedi.

## 2026-09-02 mevcut tamamlanmış kapsamın canlıya alınması checkpoint'i

- Kullanıcı onayıyla v15 candidate image production `marlin-profit-sharing` container’ına kontrollü olarak geçirildi. Önceki container silinmedi; `marlin-profit-sharing-rollback-20260902` adıyla durdurulmuş rollback hedefi olarak korundu.
- Canlı image digest: `sha256:65947dba053cf7d43631a2cf9d8dee8beabbf1481125013712bc755898b8c319`. Container `ReadonlyRootfs=true`, `CapDrop=[ALL]`, `no-new-privileges=true`, restart count `0`.
- Canlı health: `connected=true`, `mode=live`, `readOnly=true`, database `Marlin_Uyg`.
- Authenticated canlı reconciliation smoke: login HTTP **200**, reconciliation HTTP **200**, status **matched**; 2026 gross/returns/discounts/net exact minor-unit farklarının tamamı **0**.
- Yerel doğrulama: Node testleri **428/428**, Vite production build **6.775 modül**, `git diff --check` başarılı.
- Resmi WAC/maliyet/kâr/havuz kapıları canlıda fail-closed bırakıldı; doğrulanmamış CPM maliyet kaynağı canlı resmi finans sonucu olarak kullanılmıyor. CPM’e yazma yapılmadı.

## 2026-09-03 Session 3 CPM açılış kanıtı checkpoint'i

- Salt-okunur canlı CPM araştırması `Marlin_Uyg` üzerinde tamamlandı. `STKHAR` tip 82: **758** satır / **627** ürün / **7** depo; tarih **2026-01-07–2026-09-01**; pozitif `BIRIMFIYAT` **470**, sıfır/eksik maliyet **288**; açılış para birimi alanı doldurulmuş bir kanıt değildir ve maliyet lineage alanları **0** dolu satırdır.
- `STKSYM` `MKOD4='DEVIR'`: **6.439** satır / **4.469** ürün / **4** depo; tarih **2026-01-13–2026-08-07**; pozitif miktar **4.566**, sıfır miktar **1.873**, negatif miktar **0**. Şema maliyet veya para birimi taşımıyor.
- Tam nüfus eşleştirmesinde ürün+depo+tarih kesişimi **6**, aynı miktarlı kesişim **1**, doğal anahtar (ürün+depo+tarih+belge+line) **0** oldu. Tek miktar-only satırı `129474-33050M / MRK / 2026-03-05 / qty=1`; belge/line farklı ve STKSYM tarafında karşılaştırılabilir maliyet yok. Ölçülebilir canlı cost-conflict üretilemedi; bu durum sıfır conflict olarak yorumlanmadı.
- `VW_STOKDURUM` tanımı ürün/depo mevcut stok ve rezervasyon görünümüdür; tarihsel maliyet/WAC taşımaz. Canlı negatif mevcut stok: **0** satır / **0** ürün / **0** depo. `VW_STOK_DEVIR_MALIYET_AKTAR` güncel `STKKRT.NKOD1` tabanlı maliyet türetir; resmi tarihsel açılış kaynağı olarak reddedildi.
- Bilinen hareket adayları korunuyor: 9/609 alış, 17/85/91 satış, 18 satış iadesi. 10/11/610 ve alış iadesi semantiği doğrulanmadığı için unmapped/karantina; `GIRISCIKIS` yönü WAC semantiği olarak yorumlanmadı.
- Matcher artık null-preserving maliyet/para birimi alanlarını, `cost-conflict` sınıfını ve ürün-depo-tarih kimlik karantinasını taşır. Movement-impact yardımcı özeti ürün+depo grain’inde alış/satış/iki iade türünü ayırır; resmi WAC’a bağlanmaz.
- Odak testleri **45/45 GREEN**. Session 3 sonucu: **`SESSION_3_BLOCKED`**. `inventory-source-not-verified`, `official-cost-coverage-insufficient`, `opening-lineage-unverified`, `cost-semantics-unverified`, `direction-semantics-unverified` ve etkin SELECT-only yetki kanıtı blocker’ları korunuyor. CPM yazımı, procedure çalıştırma ve resmi WAC gate açılması yapılmadı.

## 2026-09-03 Session 3 kapsam revizyonu — karşılaştırılabilir yıllar checkpoint'i

- Kullanıcı kapsam revizyonuyla tam tarihsel açılış maliyeti blocker'ını kaldırdı. İncelenen kesin dönemler `[2024-01-01,2025-01-01)` ve `[2025-01-01,2026-01-01)` olarak sabitlendi. 2026 devam eden dönem olduğundan karşılaştırmaya alınmadı.
- Salt-okunur doğrudan CPM `STKHAR` kapsamı doğrulandı: 2024 **43.313** satır / **4.164** ürün / **8** depo; 2025 **46.074** satır / **4.671** ürün / **11** depo. `STKSYM DEVIR` kısmi kaldı: 2024 **9.018** / **6.100** / **3** / son tarih 2024-10-31; 2025 **11.739** / **6.609** / **3** / son tarih 2025-09-25.
- `STKHAR` maliyet adayları 2024’te **13.343** satır (**13.321** pozitif, **22** eksik/sıfır), 2025’te **12.443** (**11.938** pozitif, **505** eksik/sıfır). Strict ürün-döviz + satır döviz/kuru uyumlu candidate maliyet satırı **406/775**; strict oran **%3,0/%6,2**. Eksikler sıfır maliyet yapılmadı.
- Doğal anahtar duplicate/conflict kontrolleri 2024/2025 için `STKHAR` ve `STKSYM` tarafında **0** duplicate grubu ve pozitif maliyet doğal-grain conflict için **0** grup verdi. `STKSYM`→`STKHAR` exact doğal anahtar **0/0**; ürün+depo+tarih kesişimi **113/13**, aynı miktarlı kesişim **21/2** ve maliyetsiz quantity-only karantinasıdır.
- `shared/financialCostModel.mjs` içine `buildComparableYearWac` eklendi. Model yalnız ürün+depo+para birimi anahtarında kapanış WAC taşır; unknown opening `opening-cost-unknown`, maliyetsiz alış `unpriced`, tahmini negatif-stok maliyeti covered dışıdır; candidate hesap satırları `financialStatus=blocked` kalır. Testler unknown opening, depot/currency isolation ve fallback dışlamasını kapsar.
- Session 2 CPM FX kaynağı (`DVZHAR`/`DVZDTY`/`VW_DVZHAR_GUNCELKUR`, `BANKA=3`, `DOVIZTIP=1`) ve EUR canonical gösterim korundu. Live candidate örnekleri 12 ürün, çoklu depo ve EUR/USD dövizleri ile rapora yazıldı; GBP kart kapsamı bulunmasına rağmen qualifying cost satırı olmadığından covered yapılmadı.
- Sonuç: revize edilen iki yıllık kapsam ve sınırlamalar kanıtlı olduğu için **`SESSION_3_COMPLETE`**. Bu, inventory source’un official olduğu veya resmi WAC gate’inin açıldığı anlamına gelmez: `status=candidate`, `verified=false`, `eligibleForOfficialWac=false`, `financialStatus=blocked` korunuyor.
- Doğrulama: odak financial cost **33/33**, tam suite **490/490**, Vite build **6.775 modül**, `git diff --check` exit code 0. CPM yazımı/procedure/deploy/cleanup/veri silme yapılmadı. Rapor: `docs/audit/2026-09-03/session-3-comparable-years.md`; plan: `docs/superpowers/plans/2026-09-03-session-3-comparable-years.md`.
