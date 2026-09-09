# Marlin Nexus Yetki ve Veri Sahipliği Matrisi

> Doğrulama tarihi: 2026-09-09
> Kaynaklar: `server/auth.mjs`, `server/capabilities.mjs`, `server/index.mjs`, `shared/moduleRegistry.mjs`, `src/sessionGate.js`.

## Roller ve yetkiler

| Rol | Yetkiler | Erişebildiği modüller | Veri sahipliği |
|---|---|---|---|
| `admin` | `reporting:read`, `operations:read`, `approvals:manage`, `settings:manage` | Genel Bakış, Satış, Departman, Denetim, Stok, Havuz, Ayarlar | Sistem ayarları, onay kayıtları ve tüm raporlama görünümü |
| `reporting` | `reporting:read` | Genel Bakış, Satış, Departman, Denetim, Havuz | Raporlama ve denetim verilerinde salt okunur erişim |
| `operational` | `operations:read` | Stok | Operasyon/stok araştırma verilerinde salt okunur erişim |
| bilinmeyen rol | Yok; varsayılan deny | Hiçbir modül | Veri sahipliği yok |

## Kimlik doğrulama ve ortak sınırlar

- `NEXUS_SESSION_SECRET` zorunludur; session cookie HMAC ile imzalanır.
- Kimlik sağlayıcı ya açık `identityProvider` ile ya da `NEXUS_ADMIN_USERNAME` + `NEXUS_ADMIN_PASSWORD_SHA256` ile yapılandırılmalıdır.
- Korumalı API istekleri geçerli session ister; mutasyonlarda CSRF cookie/header eşleşmesi ve `NEXUS_PUBLIC_ORIGIN` kontrolü uygulanır.
- Capability bulunmayan kullanıcıya endpoint middleware’i `403` döndürür; tanımsız API rotası fail-closed olarak reddedilir.

## Endpoint, izin sahibi ve reddedilme davranışı

| Endpoint kapsamı | İşlem | Gerekli capability | Veri sahibi | Reddedilme davranışı |
|---|---|---|---|---|
| `/api/session/login` | POST | Public login | Kimlik sağlayıcı | Geçersiz kimlikte `401`; session oluşturulmaz |
| `/api/session`, `/api/session/logout` | GET/POST | Authenticated session | Session sahibi | Session yoksa `401`; logout cookie’leri temizler |
| `/api/overview`, `/api/reconciliation/*`, `/api/department-analysis`, `/api/department-targets`, `/api/audit-ledger`, `/api/audit-samples`, `/api/build-info`, `/api/readiness`, `/api/research/inventory-opening-evidence` | GET | `reporting:read` | Finansal/raporlama veri sahibi | Eksik capability `403`; session yoksa `401`; kaynak belirsizse veriyi review/quarantine olarak taşır |
| `/api/modules` | GET | Modül görünürlüğü politikası | Ürün/erişim sahibi | Capability’siz veya tanımsız kapsam `403`; yalnız izinli modüller döner |
| `/api/sales-cases`, `/api/inventory-research` | GET | `operations:read` | Operasyon/stok veri sahibi | Eksik capability `403`; session yoksa `401` |
| `/api/approvals` ve `/api/approvals/:year/:month` | GET/PUT/POST reopen | `approvals:manage` | Finans onay sahibi | Eksik capability `403`; stale/invalid kaynak onayı reddeder; CSRF/Origin hatası `403` |
| `/api/app-state` | PUT | `settings:manage` | Sistem yöneticisi | Eksik capability `403`; CSRF/Origin hatası `403`; geçersiz payload reddedilir |
| `/api/ledger-refresh` | Mutasyon/refresh | `approvals:manage` | Finansal ledger sahibi | Eksik capability `403`; session/CSRF başarısızsa işlem çalışmaz |
| `/api/hr/employees*` | GET/POST/PUT | HR uygulama yetkisi ayrıca doğrulanmalı | İK veri sahibi | HR capability sözleşmesi ve negatif testler release öncesi zorunlu; mevcut global middleware kapsamı ayrıca incelenmeli |

## Kabul kontrolleri

1. Her rol yalnızca matristeki modülleri görür; bilinmeyen rol varsayılan deny olur.
2. Her mutasyon endpoint’i session + CSRF + Origin sınırından geçer.
3. Capability eksikliği `403`, session eksikliği `401` döndürür.
4. Finansal, stok veya onay kanıtı eksik/çelişkiliyse sistem değer uydurmaz; review/quarantine durumunu korur.
5. HR endpoint’leri için açık capability eşlemesi ve test kanıtı release öncesi ayrıca tamamlanmalıdır.

## Açık risk

`shared/moduleRegistry.mjs` yedi modül tanımlarken `App.jsx` ayrıca Reports ve Approval ekranlarını render eder. Bu görünürlük/router/API sözleşme uyumsuzluğu T06/T08 kapsamında ayrıca kapatılmalıdır; bu kartta mevcut davranış değiştirilmemiştir.
