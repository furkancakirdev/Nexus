# Marlin Nexus — Kod Tabanı ve Çalışma Alanı Envanteri

**Envanter tarihi:** 2026-09-09  
**Kapsam:** Bu checkout/worktree içindeki uygulama, test, veri erişimi, UI ve deployment yüzeyleri.  
**Güvenlik notu:** Bu dokümanda parola, token, kullanıcı sırrı veya credential dosyası içeriği tutulmaz.

## 1. Çalışma alanı özeti

- Uygulama: React 19 + Vite 6 istemcisi, Node.js ESM + Express 5 sunucusu.
- Paket yöneticisi: npm (`package.json`, `package-lock.json`).
- Çalışma ağacı: `src/`, `server/`, `shared/`, `analysis/`, `qa/`, `docs/`, `public/`.
- İncelenen ana kaynak kümeleri: `src` 37 dosya, `server` 112 dosya, `shared` 15 dosya, `analysis` 4 dosya, `qa` 25 artefakt.
- CPM erişimi salt-okunur tasarlanmıştır; Nexus’a ait durum `server/stateStore.mjs` ve yapılandırılmış uygulama depolarında tutulur.

## 2. Alan ve sorumlu dosyalar

| Alan | Sorumlu dosya/dizinler | Rol ve sınır |
|---|---|---|
| Frontend giriş | `index.html`, `src/main.jsx`, `src/App.jsx` | React root, StrictMode, oturum akışı, ana sayfa yönlendirme ve uygulama kabuğu. |
| Frontend sayfaları | `src/SummaryPage.jsx`, `src/SalesPage.jsx`, `src/ReportsPage.jsx`, `src/DepartmentAnalysisPage.jsx`, `src/InventoryResearchPage.jsx`, `src/AuditPage.jsx`, `src/ApprovalPage.jsx`, `src/GoalsPage.jsx`, `src/SettingsPage.jsx` | Özet, satış, rapor, departman, stok araştırma, denetim, onay, hedef ve ayar ekranları. |
| İK frontend | `src/hr/` (`HrShell.jsx`, `*Page.jsx`, `api.js`) | Çalışan, izin, puantaj, fazla mesai ve bordro ekranları ile `/api/hr` istemci çağrıları. |
| UI / tema | `src/styles.css`, `src/components/layout/NexusShell.jsx`, `src/components/layout/NexusShell.css`, `src/components/ui/` | Global stiller, shell/layout ve tekrar kullanılabilir `StatusBadge`, `MetricCard`, `DataTable`, `FilterToolbar`, `ChartCard`, `LedgerView` bileşenleri. Grafikler `recharts`, ikonlar `@tabler/icons-react` kullanır. |
| Frontend yardımcıları | `src/api.js`, `src/sessionGate.js`, `src/utils/formatters.js`, `src/summaryMetrics.js`, `src/distribution.js`, `src/departmentEvidencePresentation.js` | CSRF/oturumlu API çağrısı, capability tabanlı navigasyon, biçimlendirme ve sunucu projeksiyonlarının sunumu. |
| Backend giriş/orchestrator | `server/index.mjs` | Express uygulaması, auth boundary, CPM pool/okuma akışı, ledger/approval router montajı, static `dist` sunumu ve health/readiness uçları. |
| API / router | `server/ledgerApi.mjs`, `server/approvalApi.mjs`, `server/hr/router.mjs`, `server/ledgerService.mjs` | Overview, ledger, audit, reconciliation, inventory research, department targets, approval ve İK API uçları. `server/index.mjs` router’ları birleştirir. |
| Kimlik ve yetki | `server/auth.mjs`, `server/authBoundary.mjs`, `server/capabilities.mjs`, `shared/moduleRegistry.mjs`, `src/sessionGate.js` | Session/CSRF, üretim auth sınırı, capability politikası ve modül görünürlüğü. Varsayılan yaklaşım fail-closed’tur. |
| CPM veri erişimi | `server/cpmConnectionConfig.mjs`, `server/cpmReadOnly.mjs`, `server/cpmTransaction.mjs`, `server/sqlReadRetry.mjs`, `server/*Sql.mjs` | Parametreli SELECT allow-list, salt-okunur transaction, bağlantı yapılandırması ve deadlock retry. CPM’ye yazma yapılmamalıdır. |
| Finans / ledger | `server/finalInvoiceLedger.mjs`, `server/ledgerService.mjs`, `server/ledgerApi.mjs`, `server/exchangeRateSet.mjs`, `server/officialRateResolver.mjs`, `shared/financialCostModel.mjs`, `shared/eurReporting.mjs`, `shared/financialMetric.mjs` | Nihai fatura ledger’ı, WAC/maliyet kanıtı, EUR projeksiyonu, kur setleri ve finansal KPI sözleşmeleri. |
| Envanter / maliyet araştırması | `server/inventoryMovementSource.mjs`, `server/inventoryOpeningResearch.mjs`, `server/inventoryOpeningResearchSql.mjs`, `server/inventoryResearchApi.mjs`, `shared/historicalFinancialEvidence.mjs`, `shared/historicalPrice.mjs` | Kronolojik hareket, açılış/devir araştırması, maliyet ve tarihsel finans kanıtı; araştırma verisi resmi WAC kanıtından ayrı tutulur. |
| Kur kaynakları | `server/cpmRateSource.mjs`, `server/tcmbRateSource.mjs`, `server/officialRateResolver.mjs` | CPM/Halkbank adayları, TCMB fallback ve kaynak/kanıt durumunun çözümü. |
| Nexus uygulama durumu | `server/stateStore.mjs`, `server/hr/hrStore.mjs`, `server/hr/documentStore.mjs`, `shared/settingsPolicy.mjs`, `shared/employeePolicy.mjs` | Nexus ayarları, onaylar, audit olayları, İK pilot/depo durumu ve belge saklama sınırları. CPM’den ayrıdır. |
| Domain/shared kurallar | `shared/` | Saf/deterministik finans, EUR, tarihsel fiyat, ayar, çalışan ve hedef politikaları; framework/SDK bağımlılığı içermez. |
| Testler | `server/**/*.test.mjs`, `shared/*.test.mjs`, `src/*.test.mjs`, `server/hr/**/*.test.mjs` | Unit, API sözleşmesi, güvenlik, read-only SQL, ledger/finans, RBAC, UI sözleşmesi ve deployment/preflight testleri. |
| Analiz / kanıt araçları | `analysis/` | Ledger doğrulama ve performans araçları; üretim runtime kodu değildir. `analysis/VALIDATION.md` kullanım notlarını içerir. |
| QA artefaktları | `qa/final-ledger/` | Staging/production validation ve performance JSON’ları ile desktop/tablet/mobile ekran görüntüleri. |
| Deployment | `Dockerfile`, `compose.yaml`, `vite.config.mjs`, `.env.example`, `server/release*.mjs`, `server/deploymentContract.test.mjs`, `server/releasePreflight*.mjs` | Çok aşamalı Node image, Compose uygulaması + Caddy edge, release metadata/readiness/preflight sözleşmeleri. |
| Kalıcı dokümantasyon | `README.md`, `AGENTS.md`, `docs/superpowers/`, `tasks/lessons.md` | Çalıştırma, güvenlik sınırları, proje kuralları ve tasarım/uygulama planları. |

## 3. Router ve başlıca API yüzeyleri

- Uygulama girişinde `server/index.mjs` Express’i oluşturur, `/api/session/login` rotasını ve auth middleware’ini kurar; ardından ledger ve approval router’larını bağlar.
- Ledger yüzeyi `server/ledgerApi.mjs` içindedir. Başlıca uçlar: `/api/overview`, `/api/ledger-refresh`, `/api/department-targets`, `/api/audit-ledger`, `/api/audit-samples`, `/api/reconciliation/invoices`, `/api/reconciliation/raw-invoices`.
- Onay yüzeyi `server/approvalApi.mjs` içindedir: `/api/approvals`, `/api/approvals/:year/:month`, reopen akışı.
- İK router’ı `server/hr/router.mjs` ile `/api/hr` altında çalışan, belge, izin, puantaj, fazla mesai ve bordro uçlarını sağlar.
- İstemci çağrıları normal API isteklerinde `src/api.js` üzerinden CSRF ve same-origin credentials sözleşmesini kullanır.

## 4. Tema ve frontend build mimarisi

- React giriş zinciri: `index.html` → `src/main.jsx` → `src/App.jsx`.
- Global CSS `src/main.jsx` tarafından `src/styles.css` ile yüklenir; shell’e özgü stiller `src/components/layout/NexusShell.css` içindedir.
- `vite.config.mjs` React plugin’ini, `127.0.0.1:4317` client server’ını, `/api` → `127.0.0.1:4318` proxy’sini ve `recharts`/ikon manual chunk’larını tanımlar.
- Mevcut manifestte shadcn/ui, Tremor veya Magic UI paketi yoktur; yeniden kullanılabilir UI omurgası mevcut yerel `src/components/ui/` bileşenleridir.

## 5. Test, build ve çalışma komutları

Komutlar `package.json` ve `README.md` ile doğrulanmıştır:

| Komut | Amaç | Son doğrulama |
|---|---|---|
| `npm install` | Bağımlılıkları `package-lock.json` ile kurar. | Manifestte tanımlı. |
| `npm run dev` | `concurrently` ile client ve server’ı birlikte başlatır. | Manifestte tanımlı. |
| `npm run client` | Vite client’ı `127.0.0.1:4317` üzerinde başlatır. | Manifest ve `vite.config.mjs`. |
| `npm run server` | Node/Express sunucusunu başlatır. | Manifest. |
| `npm run build` | Production Vite derlemesini `dist/` içine üretir. | **Başarılı**; Vite 6.4.3, 6783 modül. |
| `npm run preview` | Üretilen Vite çıktısını preview eder. | Manifest. |
| `npm test` | `node --test server/*.test.mjs` çalıştırır. | **Başarılı**; 659 test geçti, 0 başarısız. |
| `node --check server/index.mjs` | Server giriş dosyası sözdizimi kontrolü. | **Başarılı**. |
| `node --test shared/*.test.mjs src/*.test.mjs` | Shared ve istemci tarafı ESM testlerini ayrıca çalıştırır. | **Başarılı**; 68 test geçti, 0 başarısız. `package.json` script’i değildir. |

## 6. Deployment akışı

1. `Dockerfile` Node 22 Alpine build aşamasında `npm ci`, `npm run build` ve production dependency prune çalıştırır.
2. Runtime image içine `server/`, `shared/`, `dist/` ve production `node_modules` kopyalanır; süreç `node server/index.mjs` ile `4318` portunda, `node` kullanıcısıyla başlar.
3. `compose.yaml` uygulama container’ını `marlin-profit-sharing` adıyla ve Caddy edge container’ını `nexus-caddy` adıyla tanımlar.
4. Caddy yapılandırması `infra/Caddyfile` olarak Compose tarafından beklenir ve bu checkout’ta mevcuttur; TLS sonlandırma, gzip ve `marlin-profit-sharing:4318` reverse proxy’si tanımlıdır. `auto_https off` nedeniyle host-mounted sertifika/key ve release öncesi TLS doğrulaması zorunludur.
5. Compose, CPM credential ve Nexus user dosyalarını read-only secret mount olarak bekler; gerçek secret içerikleri bu dokümana veya repoya yazılmamalıdır.
6. Release sözleşmesi ve preflight kodu: `server/releaseContract.mjs`, `server/releaseManifest.mjs`, `server/releaseMetadata.mjs`, `server/releasePreflight.mjs`, `server/releaseReadiness.mjs`.

## 7. Envanter bulguları ve açık noktalar

- Build ve mevcut Node test komutu çalışır durumda; bu sonuç yalnızca mevcut checkout’taki otomatik testleri kanıtlar, canlı CPM erişimini veya production browser smoke testini kanıtlamaz.
- `server/` içinde finans, ledger, CPM read-only ve release readiness için kapsamlı test kümeleri mevcut; test runner manifestte yalnız `server/*.test.mjs` glob’ını doğrudan çalıştırır.
- `infra/Caddyfile` bu çalışma ağacında mevcut ve Compose tarafından bağlanıyor; TLS sertifika/key mount’ları ile `auto_https off` davranışı release öncesi doğrulanmalıdır. Yerel dosyanın varlığı tek başına canlı deployment kanıtı değildir.
- UI tarafında yerel bileşen kütüphanesi vardır; `shadcn/ui`, Tremor ve Magic UI bağımlılıkları manifestte görünmüyor.
- `analysis/` araçları ve `qa/` ekran/JSON artefaktları runtime kodundan ayrıdır; kanıt olarak kullanılmadan önce tarih, ortam ve kaynak kapsamı kontrol edilmelidir.
- `AGENTS.md` gereği CPM salt-okunur, secret’lar kalıcı dosyalara yazılmaz ve finansal sonuçlar kanıt yoksa fail-closed/review-required kalır.
