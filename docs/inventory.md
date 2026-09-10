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

## 7. Sistem varlık kayıtları (SSOT çalışma tablosu)

Bu tablo, bu checkout'tan doğrulanabilen varlıkları ve henüz doğrulanamayan canlı ortam bilgisini birlikte gösterir. `Bilinmiyor` veya `Doğrulanmadı` değerleri açık takip maddesidir; varsayım olarak yorumlanmamalıdır.

### Uygulamalar, servisler ve depolar

| Varlık | Tür | Kaynak/konum | Sorumlu | Ortam | Durum ve kanıt |
|---|---|---|---|---|---|
| Marlin Nexus web istemcisi | React/Vite uygulaması | `src/`, `index.html`, `vite.config.mjs` | **Bilinmiyor** | Geliştirme + container build | Checkout'ta kaynak mevcut; canlı sürüm/owner doğrulanmadı |
| Nexus API ve uygulama sunucusu | Node.js ESM + Express 5 servisi | `server/index.mjs` ve `server/` | **Bilinmiyor** | Geliştirme + production container | API giriş noktası ve port 4318 kaynakta doğrulandı |
| Ortak domain kuralları | Paylaşılan kütüphane | `shared/` | **Bilinmiyor** | Build/runtime | Saf iş kuralları kaynakta doğrulandı |
| CPM makro entegrasyonu | Makro/kurulum artefaktı | `cpm-macros/merkezden-teslim/` | **Bilinmiyor** | CPM istemci ortamı | Dosyalar mevcut; dağıtım sahibi ve canlı versiyon doğrulanmadı |
| Araştırma ve doğrulama araçları | Analiz araçları | `analysis/` | **Bilinmiyor** | Operasyonel/analiz | Runtime dışı olduğu kaynakta belirtilmiş |
| QA kanıt paketi | Test/kanıt artefaktı | `qa/` | **Bilinmiyor** | Staging/production iddiası | Dosyalar mevcut; tarih, kaynak ve canlı karşılığı ayrıca doğrulanmalı |
| Git deposu | Kaynak kod deposu | `https://github.com/furkancakirdev/Nexus.git` | **Bilinmiyor** | Git/CI | Remote URL doğrulandı; branch koruma ve sahiplik doğrulanmadı |

### Sunucular, ağ uçları ve ortamlar

| Varlık | Adres/kimlik | Ortam | Sorumlu | Doğrulama durumu |
|---|---|---|---|---|
| Geliştirici istemci | `127.0.0.1:4317` | Geliştirme | **Bilinmiyor** | Vite config ve package script ile doğrulandı |
| Geliştirici/API sunucusu | `127.0.0.1:4318` | Geliştirme | **Bilinmiyor** | Server default ve Vite proxy ile doğrulandı |
| Nexus container | `marlin-profit-sharing:4318` | Compose/production adayı | **Bilinmiyor** | `compose.yaml` ve `Dockerfile` ile doğrulandı; canlıda çalıştığı doğrulanmadı |
| Caddy edge/reverse proxy | Host port `4318`, upstream `marlin-profit-sharing:4318` | Compose/production adayı | **Bilinmiyor** | `infra/Caddyfile` ve Compose ile doğrulandı |
| SSH deployment host | `192.168.12.11` (kullanıcı ve secret değerleri redakte) | **Doğrulanmadı** | **Bilinmiyor** | Görev talebinde verildi; bu checkout'ta canlı bağlantı kanıtı yok |
| Staging ortamı | **Bilinmiyor** | Staging | **Bilinmiyor** | QA artefaktları mevcut, gerçek host/URL ve release eşleşmesi doğrulanmadı |
| Production ortamı | **Bilinmiyor** | Production | **Bilinmiyor** | Canlı deployment, DNS, firewall ve monitoring bilgisi doğrulanmadı |

### Veritabanları ve veri depoları

| Varlık | Tür | Konum/yapılandırma | Veri sahibi | Yazma sınırı / durum |
|---|---|---|---|---|
| CPM veritabanı | Microsoft SQL Server | `CPM_SQL_SERVER`, `CPM_SQL_INSTANCE`, `CPM_SQL_DATABASE`; örnek değerler `.env.example` ve Compose'ta | **Bilinmiyor** | Uygulama sözleşmesi salt-okunur; gerçek sunucu erişimi ve şema envanteri doğrulanmadı |
| Nexus uygulama durumu | JSON dosya deposu | `APP_STATE_FILE`, varsayılan `data/app-state.json` | **Bilinmiyor** | Nexus'a ait ayar/onay/audit state'i; backup ve owner doğrulanmadı |
| HR uygulama durumu | JSON dosya deposu | `HR_STATE_FILE`, `server/hr/hrStore.mjs` | **Bilinmiyor** | Pilot/uygulama verisi; gerçek HR master kaynağı **Bilinmiyor** |
| Ledger snapshot'ları | Dosya tabanlı snapshot | `LEDGER_SNAPSHOT_DIR`, Compose `/app/data/ledger-snapshots` | **Bilinmiyor** | Retention, restore prosedürü ve owner **Bilinmiyor** |
| Credential dosyaları | Secret mount | Compose `/run/secrets/...` | **Bilinmiyor** | İçerik bu envantere alınmaz; rotation ve secret store owner'ı **Bilinmiyor** |

### Entegrasyonlar ve dış bağımlılıklar

| Entegrasyon | Yön/protokol | Kullanım | Sorumlu | Doğrulama durumu |
|---|---|---|---|---|
| CPM SQL Server | Nexus → SQL Server / `mssql` | Raporlama, ledger, stok ve finans kanıtı | **Bilinmiyor** | Parametreli read-only erişim kaynakta doğrulandı; canlı bağlantı ve SLA doğrulanmadı |
| TCMB fallback | Nexus → HTTP dış kaynak | Tarihsel kur fallback'i | **Bilinmiyor** | `server/tcmbRateSource.mjs` mevcut; endpoint erişimi, kota ve sözleşme doğrulanmadı |
| Caddy TLS | Edge → Nexus container | TLS sonlandırma ve reverse proxy | **Bilinmiyor** | Host-mounted sertifika/key bekleniyor; sertifika sahibi/yenileme süreci **Bilinmiyor** |
| GitHub Actions | GitHub → CI runner | Audit, test ve production build | **Bilinmiyor** | `.github/workflows/ci.yml` doğrulandı; deploy adımı yok |
| SSH release kanalı | Release runner → deployment host | Release/rollback operasyonu | **Bilinmiyor** | Release değişkenleri ve sözleşmeleri kaynakta var; host key, erişim ve yetki doğrulanmadı |

## 8. Bilinmeyenler ve doğrulama sahipleri

Aşağıdaki maddeler production onayı öncesi kapatılmalıdır:

1. Her uygulama, servis, veritabanı ve entegrasyon için teknik ve iş sahibinin atanması (**sahip: Bilinmiyor**).
2. Staging ve production host adları, DNS, firewall, monitoring, backup ve erişim listelerinin doğrulanması (**sahip: Bilinmiyor**).
3. CPM SQL Server gerçek instance/schema, read-only kullanıcı, şema değişikliği sahibi ve bakım penceresinin doğrulanması (**sahip: Bilinmiyor**).
4. TLS sertifika/key sahibi, yenileme yöntemi ve süresinin doğrulanması (**sahip: Bilinmiyor**).
5. TCMB fallback kullanım izni, endpoint/kota/SLA ve kesinti davranışının doğrulanması (**sahip: Bilinmiyor**).
6. QA artefaktlarının hangi commit ve ortama ait olduğunun release manifestiyle eşleştirilmesi (**sahip: Bilinmiyor**).

## 9. İnceleme ve sign-off

- **Envanter hazırlayan:** Codex çalışma ajanı (kaynak checkout incelemesi)
- **Hazırlama tarihi:** 2026-09-09
- **Kapsam:** Repository/configuration evidence only; canlı SSH, CPM ve Nexus UI doğrulaması bu dokümanda iddia edilmez.
- **Güvenlik durumu:** Görevde verilen kullanıcı adı/parolalar kalıcı dokümana kopyalanmamış; mevcut sırların rotate edilmesi ayrı aksiyondur.
- **Teknik inceleyen:** **Bilinmiyor — sign-off bekleniyor**
- **Ürün/veri sahibi:** **Bilinmiyor — sign-off bekleniyor**
- **Operasyon/production sahibi:** **Bilinmiyor — sign-off bekleniyor**
- **Karar:** `PENDING_REVIEW`; üç sorumlu atanıp açık maddeler doğrulanmadan production-ready kabul edilmez.

## 10. Erişim doğrulama kaydı (2026-09-09)

Bu kayıt yalnızca bağlantı ve erişim kanıtını içerir; kullanıcı parolası, private key, cookie, token veya response body saklanmamıştır. Kontroller read-only yapılmış, sunucuya veya uygulama verisine yazılmamıştır.

| Kontrol | Sonuç | Kanıt / sınırlama |
|---|---|---|
| SSH TCP erişimi (`192.168.12.11:22`) | **Başarılı** | Windows `Test-NetConnection` portu erişilebilir gösterdi |
| SSH yetkilendirme | **Başarılı** | `ssh -o BatchMode=yes -o NumberOfPasswordPrompts=0` ile mevcut makine anahtarı kullanılarak `serviceproadmin` oturumu açıldı; yalnızca sabit bir probe çıktısı alındı |
| Nexus HTTPS TCP erişimi (`192.168.12.11:4318`) | **Başarılı** | Windows `Test-NetConnection` portu erişilebilir gösterdi |
| Nexus web arayüzü HTTP yanıtı | **Başarılı** | `curl -k` ile `HTTP/1.1 200 OK`; `Server: Caddy`, `X-Powered-By: Express` başlıkları görüldü |
| Kimliksiz session API kontrolü | **Beklenen şekilde reddedildi** | `GET /api/session` `HTTP/1.1 401 Unauthorized` döndürdü; auth sınırı çalışıyor |
| TLS sertifika doğrulaması | **Tamamlanmadı** | Windows Schannel strict kontrolü `CRYPT_E_NO_REVOCATION_CHECK` ile başarısız oldu. `-k` kullanımı yalnızca erişilebilirliği kanıtlar; sertifika güvenini kanıtlamaz |
| Yetkili web login | **Bekliyor** | Bu kontrolde parola gönderilmedi. UI login, onaylı credential injection yöntemi ve MFA/rotation politikası doğrulanınca ayrı test edilmelidir |

### Erişim ön koşulları ve açık aksiyonlar

1. SSH host key fingerprint'i güvenilir bir kanaldan doğrulanmalı ve kalıcı `known_hosts` kaydıyla eşleştirilmelidir; `StrictHostKeyChecking=accept-new` yalnız bu geçici kontrolde kullanılmıştır.
2. Windows istemcisinde sertifika revocation/CA zinciri doğrulaması tamamlanmalı; sertifikanın SAN'ı, geçerlilik süresi ve yenileme sahibi teyit edilmelidir.
3. Yetkili UI login için parola metin olarak paylaşılmamalı; onaylı secret store veya güvenli interactive injection kullanılmalı ve test sonrası oturum/cookie temizlenmelidir.
4. SSH hesabının least-privilege kapsamı, MFA durumu, audit kaydı ve production host üzerindeki yetkileri operasyon sahibi tarafından onaylanmalıdır.
5. CPM veritabanı erişimi bu görevde denenmemiştir; ayrı, read-only ve şema/credential doğrulama prosedürü olmadan canlı DB bağlantısı yapılmamalıdır.

**Erişim kararı:** `SSH_AUTHENTICATED`, `WEB_REACHABLE`, `AUTH_BOUNDARY_CONFIRMED`, `TLS_TRUST_PENDING`, `UI_LOGIN_NOT_ATTEMPTED`.

## 11. Credential exposure and remediation record (2026-09-09)

### Scan result

- The task request contained plaintext SSH, database, and web administrator credentials. They were treated as compromised input and were not copied into the repository, logs, command arguments, or this document.
- Tracked repository scanning found credential **references** but no matching plaintext values for the supplied passwords. `compose.yaml`, `server/index.mjs`, `server/auth.mjs`, and `release_runner.py` use environment variables, secret mounts, or file paths rather than committed values.
- The allowlist in `release_artifact.py` excludes `data/`, `secrets/`, and other forbidden roots from release archives.
- Untracked working-tree artifacts were observed (`data/`, `.temp_files/`, `work/`, `__pycache__/`, and generated archives/reports). They are not release inputs; they must be reviewed and removed or quarantined by the workspace owner before sharing the checkout.

### Live host metadata (values intentionally not read)

- `/home/serviceproadmin/apps/marlin-profit-sharing/erp.env` exists with mode `600`, owned by `serviceproadmin`; it contains secret-bearing variable names including the Nexus session secret and administrator password hash. Contents were not printed or copied.
- `/home/serviceproadmin/tmp/servicepro-locksync/docker-compose.yml` exists with mode `664` and contains credential-bearing service configuration names. Its broader group-readable mode requires owner review; contents were not copied.
- `/home/serviceproadmin/.bash_history` exists with mode `600` and is large enough to require sensitive-history review. Matching command output was not persisted.
- The running container environment did not expose credential variable names through the read-only process probe; this does not prove the absence of Docker-mounted secrets or encrypted host configuration.

### Remediation status

| Control | Status | Evidence / blocker |
|---|---|---|
| Prevent new repository commits of runtime secrets | **Applied** | `.gitignore` now excludes `.env.*`, `data/`, `secrets/`, and `.temp_files/`; `.env.example` remains allowed |
| Keep release archives free of secret roots | **Applied** | `release_artifact.py` allowlist and forbidden-root checks already exclude `data/`, `secrets/`, `.git`, `node_modules`, and `tmp` |
| Move live secrets to an approved secret store | **Blocked** | No approved secret-store destination, operator, access policy, or migration window was provided; existing `erp.env` remains host-managed until an authorized migration |
| Rotate exposed SSH/database/web credentials | **Blocked** | Rotation would change production access and requires system owners plus a safe rollback plan; no mutation was performed |
| Verify old credentials are invalid | **Not performed** | Cannot claim invalidation without completing the authorized rotation and testing each credential through a non-logging verification path |
| Review shell history and untracked artifacts | **Pending owner action** | Requires deciding retention/legal/audit requirements before deletion or redaction; no user-owned files were deleted |

### Required authorized follow-up

1. Assign an operations owner and approved secret-store location for SSH keys, CPM credentials, Nexus session secret, administrator password hash, TLS key, and ERP credentials.
2. Rotate each credential through that store, restart only the affected services in an approved window, and verify health/readiness without printing values.
3. Test the old credentials explicitly as rejected (`SSH` key revocation, CPM login failure, Nexus admin login failure, and any ERP credential failure) and retain only status/timestamp evidence.
4. Review and redact or securely delete shell history and untracked generated artifacts according to the owner-approved retention policy.
5. Re-run tracked-file secret scanning and release-archive validation after rotation; require sign-off before production-ready status.

**Credential security decision:** `NEW_COMMIT_EXPOSURE_REDUCED`, `ROTATION_BLOCKED_PENDING_AUTHORIZATION`, `OLD_CREDENTIAL_INVALIDATION_UNVERIFIED`.

## 12. Reproducible baseline (2026-09-09)

All checks below were run without deploying, mutating production, writing to CPM, or printing secret values.

| Check | Exact command / procedure | Result | Notes |
|---|---|---|---|
| Production frontend build | `npm run build` | **PASS** | Vite 6.4.3; 6,783 modules transformed; build completed in 4.44s; output written to `dist/` |
| Server test suite | `npm test` | **PASS** | 670 tests passed, 0 failed, 0 skipped; command is `node --test server/*.test.mjs` |
| Shared/client supplementary suite | `node --test shared/*.test.mjs src/*.test.mjs` | **FAIL (1)** | 69 passed, 1 failed; `shared/financialMetric.test.mjs:64` expects `400`, received `1300` at line 98. This is a reproducible baseline failure and remains unmodified. |
| Python release/deployment contracts | `python -m unittest -v release_runner_test.py release_artifact_test.py` | **PASS** | 27 tests passed; immutable artifact, release gate, candidate, TLS, host-key, password-auth, and allowlist contracts validated |
| Server syntax | `node --check server/index.mjs` | **PASS** | No syntax errors |
| Lint | No command configured; no ESLint/Biome configuration found | **NOT AVAILABLE** | `package.json` has no lint script and repository has no root lint configuration; do not infer lint success |
| Type-check | No command configured; no `tsconfig*.json` found | **NOT AVAILABLE** | Project is JavaScript/ESM; no TypeScript compiler contract exists |
| Public web health | `Invoke-WebRequest https://192.168.12.11:4318/api/health -SkipCertificateCheck -Method Get` | **PASS** | HTTP 200 JSON; `-SkipCertificateCheck` means TLS trust chain was not validated |
| Public web root | `Invoke-WebRequest https://192.168.12.11:4318/ -SkipCertificateCheck -Method Get` | **PASS** | HTTP 200 HTML |
| Unauthenticated session boundary | `Invoke-WebRequest https://192.168.12.11:4318/api/session -SkipCertificateCheck -Method Get` | **PASS** | HTTP 401 as expected |
| Unauthenticated readiness boundary | `Invoke-WebRequest https://192.168.12.11:4318/api/readiness -SkipCertificateCheck -Method Get` | **PASS (boundary only)** | HTTP 401; authenticated readiness payload was not requested because no approved login secret injection was available |

### Baseline reproduction

From the repository root, install locked dependencies with `npm ci`, then run the commands in the table. The supplementary suite is intentionally separate from `npm test` because it is not included by the package script. For the live probes, use an approved TLS trust configuration instead of `-SkipCertificateCheck` when validating certificate correctness; the current probe verifies reachability and route behavior only.

### Baseline limitations and known failures

- The single supplementary test failure is recorded, not hidden: `existing overview and department boundaries reconcile with the canonical contract` currently returns `1300` where the fixture expects `400`.
- No lint or type-check result can be claimed because neither tool is configured in this JavaScript repository.
- `/api/health` is publicly reachable and healthy; `/api/session` and `/api/readiness` correctly require authentication. Authenticated readiness, browser smoke, CPM connectivity, and production deployment validation remain unverified in this run.
- The Python release tests validate local contracts only. No artifact transfer, container restart, production deployment, or rollback was performed.
- Build output in `dist/` and pre-existing untracked artifacts are workspace outputs; they are not production evidence until an immutable release process records their identity and digest.

**Baseline decision:** `BUILD_PASS`, `SERVER_TESTS_PASS`, `RELEASE_CONTRACTS_PASS`, `SUPPLEMENTARY_SUITE_BLOCKED_1_FAILURE`, `LINT_UNAVAILABLE`, `TYPECHECK_UNAVAILABLE`, `PUBLIC_HEALTH_PASS`, `AUTHENTICATED_READINESS_UNVERIFIED`.
