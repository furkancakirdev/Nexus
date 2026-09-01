# Task 6 — Rol izolasyonu kapanış raporu

## Kapsam ve kaynaklar

Task 6 için repo içinde `task-6-brief.md` bulunamadı. Bu rapor, `docs/superpowers/plans/2026-09-01-nexus-remediation.md` içindeki Task 6 maddeleri ve Sol önerisi esas alınarak hazırlanmıştır. Değişiklik yalnızca küçük, fail-closed rol izolasyonu dilimidir; Task 7 ve HR kapsamı açılmamıştır.

## Uygulanan dilim

- Dört atomik capability merkezi olarak tanımlandı: `reporting:read`, `operations:read`, `approvals:manage`, `settings:manage`.
- `admin` dört capability’ye sahip; reporting yalnızca raporlama okumasına, operational yalnızca operasyon okumasına sahip.
- Eksik veya tanımsız capability/rota default-deny davranışıyla reddediliyor.
- Auth sırası korunuyor: authenticate → CSRF/Origin → authorize → handler.
- `createApp` ile gerçek Express kompozisyonu test edilebilir hale getirildi; router, state store, health handler ve identity provider injection destekleniyor.
- Session login/read/logout API’ye bağlandı; API router’larından önce auth middleware çalışıyor; health auth gerektiriyor.
- Bilinen admin/hash/session-secret fallback’leri kaldırıldı; production auth için açık session secret ve kimlik sağlayıcı/çevre yapılandırması gerekiyor.
- App-state ve approval yazmaları UI’da ortak `apiFetch` yolunu kullanıyor.
- HR router mevcut `server/index.mjs` kompozisyonunda unmounted durumda bırakıldı; bu Task 6’da genişletilmedi.
- CPM salt okunur sınırı, CPM erişimsiz ve credentials/deploy olmadan korundu.

## Doğrulama

### RED

İlk `node --test server/task6RoleIsolation.test.mjs` çalıştırmasında yeni capability modülü ve `createApp` seam’i mevcut olmadığı için test suite beklenen şekilde kırıldı. Bu, mevcut tek-admin/unwired kompozisyonun kanıtıdır.

### Focused/related

Komut:

```text
node --test server/task6RoleIsolation.test.mjs server/auth.test.mjs server/authBoundary.test.mjs server/approvalApi.test.mjs server/approvalUiContract.test.mjs server/cpmReadOnly.test.mjs server/task5Security.test.mjs server/settingsPolicy.test.mjs server/uiContract.test.mjs
```

Sonuç: 47 test, 46 geçti, 1 kaldı.

Kalan hata mevcut Task 5 CPM fingerprint fixture uyuşmazlığıdır: `production fingerprint registry executes the three approved queries` → `fingerprint-mismatch`. Bu Task 6’da değiştirilmedi veya gevşetilmedi.

### Full suite

Komut: `npm test`

Sonuç: 360 test, 355 geçti, 5 kaldı.

Kalanlar:

- CPM approved-query fingerprint mismatch
- default labor pilot cost beklentisi
- department/target ortak cache beklentisi
- department target 500-row regression fixture’ında `501`/`250.5` farkı
- eksik V2 kanıtı ayı için `null`/`0` beklenti farkı

### Build ve diff

- `npm run build`: geçti, 6773 modül dönüştürüldü.
- `git diff --check`: geçti; `git diff --cached --check`: geçti.

## Kanıt sınırı

Live separate-account verification blocked: ayrı non-production admin/reporting/operational hesaplarıyla canlı doğrulama yapılmadı. Bu nedenle Task 6 canlı RBAC izolasyonu olarak değil, injected identity-provider fixture’larıyla lokal olarak doğrulanmış uygulama dilimi olarak raporlanır.

CPM/production erişimi, credential kullanımı, deploy ve Task 7 canlı çalışmaları yapılmadı.
