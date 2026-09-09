# Marlin Nexus Depo ve Çalışma Ortamı Envanteri

> Doğrulama tarihi: 2026-09-09  
> Kapsam: Bu checkout'taki kaynak dizinleri, paket/komut tanımları, ortam değişkenleri ve deployment yapılandırması. Secret değerleri bilerek kaydedilmemiştir.

## 1. Ürün ve çalışma modeli

- **Ürün:** Marlin Nexus; CPM verisini salt-okunur bağlantıyla satış, kârlılık, hedef, havuz, HR ve denetim görünümlerine sunan web uygulaması.
- **İstemci:** React 19 + Vite 6, JavaScript/ESM ve JSX.
- **Sunucu:** Node.js ESM üzerinde Express 5; giriş noktası `server/index.mjs`.
- **Veri erişimi:** `mssql` ile SQL Server CPM; bağlantı `readOnlyIntent: true` ve uygulama kuralları yalnız parametreli SELECT sorgularına izin verir.
- **Uygulama durumu:** Nexus'a ait durum dosyaları yerel `data/` altında tutulur; CPM'e yazılmaz.
- **Varsayılan portlar:** Vite istemcisi `127.0.0.1:4317`; API Node sunucusu `127.0.0.1:4318`. Vite `/api` isteklerini 4318'e proxy'ler.

## 2. Kaynak ve operasyon dizinleri

| Dizin/dosya | Sorumluluk |
|---|---|
| `src/` | React istemcisi, sayfalar, UI bileşenleri, istemci API ve stiller |
| `src/hr/` | HR shell ve attendance/employees/leave/overtime/payroll ekranları |
| `src/components/` | Ortak layout ve UI bileşenleri |
| `server/` | Express API, auth/capability, CPM read-only erişimi, ledger, release/readiness ve Nexus state |
| `server/hr/` | HR API, HR store ve HR alt modülleri |
| `shared/` | İstemci/sunucu arasında kullanılan saf iş kuralları ve modeller |
| `analysis/` | Araştırma/validasyon/benchmark araçları; üretim runtime'ı değildir |
| `cpm-macros/` | CPM makro entegrasyonu ve canlı kurulum rehberleri |
| `public/` | Statik raporlar ve yayınlanabilir varlıklar |
| `qa/` | Staging/production validation JSON'ları, performans kanıtları ve ekran görüntüleri |
| `infra/Caddyfile` | TLS sonlandırma, gzip ve API reverse proxy yapılandırması |
| `.github/workflows/ci.yml` | Pull request/master CI kalite kapısı |
| `docs/` | Kalıcı proje dokümanları; bu envanter `docs/inventory.md` içindedir |
| `tasks/lessons.md` | Tekrar kullanılabilir proje dersleri |
| `data/` | Runtime'da oluşturulan uygulama/HR state ve ledger snapshot'ları; Git'e dahil edilmemelidir |
| `secrets/` | CPM credential ve Nexus kullanıcı secret mount'ları; Git'e dahil edilmemelidir |
| `.temp_files/` | Geçici inceleme/çıktı alanı; kalıcı SSOT değildir |

### Yayın artifact kapsamı

`release_artifact.py` allowlist'i yalnızca `dist`, `public`, `server`, `shared`, `src` dizinlerini ve `Dockerfile`, `compose.yaml`, `index.html`, `package-lock.json`, `package.json`, `vite.config.mjs` dosyalarını artifact'e alır. `.git`, `.cache`, `data`, `node_modules`, `secrets` ve `tmp` kökleri yasaktır.

## 3. Paketler ve çalışma komutları

Manifest: `package.json` (`name: marlin-nexus`, `version: 0.0.0`, `private: true`, `type: module`). Kilitli paket dosyası: `package-lock.json`.

### Runtime bağımlılıkları

- `react` 19.2.0, `react-dom` 19.2.0
- `express` ^5.2.1
- `mssql` ^12.7.0
- `recharts` ^3.9.1
- `@tabler/icons-react` ^3.44.0
- `vite` 6.4.3
- `@vitejs/plugin-react` 5.0.4

### Development bağımlılıkları ve override

- `concurrently` 10.0.4
- `postcss` override: 8.5.18

### NPM komutları

| Komut | İşlev |
|---|---|
| `npm install` | Bağımlılıkları kurar |
| `npm run dev` | `concurrently` ile istemci ve sunucuyu birlikte başlatır |
| `npm run client` | Vite'ı `127.0.0.1` üzerinde başlatır |
| `npm run server` | `node server/index.mjs` çalıştırır |
| `npm test` | `node --test server/*.test.mjs` ile server testlerini çalıştırır |
| `npm run build` | Vite production bundle üretir |
| `npm run preview` | Vite production preview'ını `127.0.0.1` üzerinde başlatır |
| `node --check server/index.mjs` | Sunucu sözdizimini doğrular |

README ayrıca `.env.example` kopyalanmasını ve `npm install`/`npm run dev` sırasını belirtir. CI'da `npm ci --ignore-scripts`, `npm audit --audit-level=high`, `npm test` ve `npm run build` çalıştırılır.

## 4. Ortam değişkenleri

Aşağıdaki liste `server/`, `compose.yaml`, `release_runner.py`, `.env.example` ve release sözleşmelerinde yapılan kaynak taramasından çıkarılmıştır. Secret/parola değerleri listelenmez.

### Uygulama, ağ ve state

| Değişken | Kullanım/default |
|---|---|
| `HOST` | API bind adresi; default `127.0.0.1`, Compose `0.0.0.0` |
| `PORT` | API portu; default `4318` |
| `APP_STATE_FILE` | Nexus uygulama state dosyası; default `<repo>/data/app-state.json` |
| `HR_STATE_FILE` | HR state dosyası; default `<cwd>/data/hr-state.json` |
| `LEDGER_SNAPSHOT_DIR` | Ledger snapshot dizini; Compose `/app/data/ledger-snapshots` |
| `BUILD_ID` | Build kimliği/release kanıtı; Compose default `dev-local` |
| `NEXUS_BUILD_VERSION` | Build sürümü; Compose default `local` |
| `NEXUS_BUILD_COMMIT` | Kaynak commit kimliği; Compose default `unknown` |
| `NEXUS_IMAGE_DIGEST` | Immutable image digest; Compose default `unknown` |
| `NEXUS_PREWARM_YEARS` | Başlangıç prewarm yılları |

### Kimlik doğrulama ve uygulama güvenliği

| Değişken | Kullanım |
|---|---|
| `NEXUS_AUTH_USERS_FILE` | Auth kullanıcı dosyası; Compose secret path `/run/secrets/nexus-users.json` |
| `NEXUS_USERS_FILE` | Uygulama kullanıcı dosyası; Compose `/app/data/nexus-users.json` |
| `NEXUS_ADMIN_USERNAME` | Yönetici kullanıcı adı; Compose default `yonetici` |
| `NEXUS_ADMIN_PASSWORD_SHA256` | Yönetici parolasının SHA-256 özeti; production Compose'ta zorunlu |
| `NEXUS_SESSION_SECRET` | Oturum secret'ı; production Compose'ta zorunlu |
| `NEXUS_PUBLIC_ORIGIN` | Public origin; production Compose'ta zorunlu |
| `NEXUS_AUTH_REQUIRED` | Auth zorunluluğu; Compose `true` |

### CPM SQL bağlantısı ve veri kapsamı

| Değişken | Kullanım/default |
|---|---|
| `CPM_SQL_SERVER` | SQL Server; `.env.example` `192.168.12.17` |
| `CPM_SQL_INSTANCE` | SQL instance; `.env.example` `MARLINSQL` |
| `CPM_SQL_DATABASE` | Veritabanı; `.env.example` `Marlin_Uyg` |
| `CPM_SQL_COMPANY` | Şirket kodu; default `01` |
| `CPM_SQL_USER` / `CPM_SQL_PASSWORD` | Alternatif credential yöntemi; birlikte verilirse kullanılır |
| `CPM_CREDENTIAL_FILE` | İki satırlı kullanıcı/parola dosyası; Compose `/run/secrets/cpm-credentials.txt` |
| `CPM_SQL_ENCRYPT` | SQL TLS encryption; connection config default `true`, Compose `false` |
| `CPM_SQL_TRUST_SERVER_CERTIFICATE` | Sertifika güveni; default `false` |
| `CPM_EFFECTIVE_READ_ONLY` | Effective read-only deployment bayrağı; Compose `true` |
| `CPM_INVENTORY_START_DATE` | Inventory hareket başlangıç tarihi; default `2022-12-31T00:00:00.000Z` |
| `CPM_INVENTORY_SOURCE_CONTRACT_VERIFIED` | Inventory kaynak sözleşmesi doğrulama bayrağı |
| `CPM_RATE_BANK_CODE` | Kur kaynağı banka kodu; default Halk Bank sabiti |
| `CPM_RATE_MODULE_BANK_NAME` | Modül banka adı filtresi |
| `CPM_RATE_BUYING_TYPE` / `CPM_RATE_SELLING_TYPE` | Alış/satış kur tipi; default `0`/`1` |
| `CPM_RATE_SEMANTICS_VERIFIED` | Kur semantiği doğrulama bayrağı |

### TCMB fallback ve release runner

| Değişken | Kullanım/default |
|---|---|
| `NEXUS_TCMB_HISTORICAL_DATE_CAP` | Tarihsel fallback tarih üst sınırı; boşsa sınırsız |
| `NEXUS_TCMB_FALLBACK_ENABLED` | TCMB fallback; default etkin |
| `NEXUS_TCMB_HTTP_ATTEMPT_CAP` | HTTP deneme üst sınırı; default `64` |
| `NEXUS_TCMB_DEADLINE_MS` | Fallback süre bütçesi; default `15000` ms |
| `NEXUS_HOST` / `NEXUS_USER` | Release hedefi |
| `NEXUS_SSH_KEY_FILE` / `NEXUS_KNOWN_HOSTS_FILE` / `NEXUS_SSH_HOST_KEY` | SSH doğrulama materyali |
| `NEXUS_TLS_CA_FILE` | TLS CA dosyası |
| `NEXUS_RELEASE_ID` / `NEXUS_SOURCE_COMMIT` | Release kimliği ve kaynak commit'i |
| `NEXUS_COMPOSE_CONFIG_HASH` | Compose config hash'i |
| `NEXUS_PREVIOUS_RELEASE_ID` / `NEXUS_PREVIOUS_IMAGE_DIGEST` | Rollback referansı |
| `NEXUS_ACCEPTED_RISKS` | Açıkça kabul edilmiş risk listesi |
| `NEXUS_PASSWORD` | Release runner tarafından okunur; password auth reddedilir |
| `NEXUS_AUTO_ACCEPT_HOST_KEY` | Host key otomatik kabulü; `true` ise runner reddeder |

## 5. Container ve deployment yapılandırması

### Docker

- `Dockerfile`: Node 22 Alpine multi-stage build.
- Build aşaması `npm ci`, `npm run build`, ardından `npm prune --omit=dev` çalıştırır.
- Runtime aşaması yalnız `package.json`, production `node_modules`, `server`, `shared` ve `dist` kopyalar; `/app/data` oluşturulur ve süreç `node` kullanıcısıyla çalışır.
- Runtime default'ları `NODE_ENV=production`, `HOST=0.0.0.0`, `PORT=4318` şeklindedir.
- `EXPOSE 4318`; entrypoint `node server/index.mjs`.

### Compose

- `marlin-profit-sharing`: Uygulama container'ı, restart `unless-stopped`, `/app/data` bind mount ve iki read-only secret mount.
- `nexus-caddy`: Caddy 2.8, uygulamaya bağımlı, host port `4318` yayınlar; `infra/Caddyfile` ile yapılandırılır.
- Caddy TLS sertifika/key dosyalarını host path'lerinden read-only mount eder ve `marlin-profit-sharing:4318` adresine reverse proxy yapar.
- `NEXUS_PUBLIC_ORIGIN`, `NEXUS_SESSION_SECRET` ve `NEXUS_ADMIN_PASSWORD_SHA256` Compose interpolation ile zorunludur.

### CI

`.github/workflows/ci.yml` yalnız `master` branch push ve pull request'lerinde çalışır; Ubuntu 24.04, Node 24, 10 dakika timeout, `contents: read` izni ve concurrency cancellation kullanır. Kalite kapısı dependency audit, test ve production build'dir; ayrı deploy adımı yoktur.

## 6. Doğrulanmış risk/notlar

- `.env.example` CPM SQL ayarlarını ve credential-file yöntemini gösterir; gerçek `.env` `.gitignore` içindedir.
- Compose'ta `CPM_SQL_ENCRYPT=false` tanımlıdır; bu değer production ağında ayrıca güvenlik kararı olarak gözden geçirilmelidir.
- CI Node 24, Docker runtime Node 22 kullanır; sürüm farkı release öncesi doğrulanmalıdır.
- README yalnız server testlerini çalıştırır; Python release testleri (`release_runner_test.py`, `release_artifact_test.py`) NPM test komutuna dahil değildir.
- `compose.yaml` `data/` ve `secrets/` host yollarını bekler; bu dosyaların bootstrap/permission prosedürü ayrıca operasyon dokümanında tutulmalıdır.
- `infra/Caddyfile` `auto_https off` kullanır; TLS sertifika yönetimi host-mounted dosyalara bağlıdır.
- Envanterde secret içerikleri, credential dosyası yollarının gerçek değerleri ve kişisel/üretim verileri saklanmamıştır.
