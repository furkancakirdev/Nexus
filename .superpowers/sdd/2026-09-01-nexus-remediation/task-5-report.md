# Task 5 — Secret cleanup and CPM least-privilege boundary

Tarih: 2026-09-01

## Kapsam sonucu

- Exact kullanıcı artefaktları kaldırıldı: `reconcile_years.py`, `deploy_verify.py`, `cookies.txt` ve `secrets/` (`secrets/nexus-users.json` dahil).
- Bu artefaktların içerikleri kopyalanmadı, loglanmadı veya rapora yazılmadı. Kaldırma öncesi yolların mevcut olduğu doğrulandı; kaldırma sonrası dört yol da yok.
- `server/securityScan.mjs` yalnızca yol, satır ve bulgu türü döndürür; eşleşen credential değerlerini döndürmez.
- `server/index.mjs` CPM bağlantısında `encrypt: true` ve `trustServerCertificate: false` kullanır. `readOnlyIntent: true` korunmuştur.
- `server/cpmReadOnly.mjs` içine saf `evaluateCpmReadOnlyPreflight` eklendi. Read-only intent, kimlik ve SELECT-only etkin yetki kanıtı açıkça bulunmadan izin vermez; SQL veya yazma çağrısı çalıştırmaz.
- Mevcut CPM query guard ve production query fingerprint kayıtları değiştirilmedi.

## Test ve doğrulama kanıtı

- RED: ilk `node --test server/task5Security.test.mjs` çalıştırması, scanner modülü henüz mevcut olmadığı için exit 1 verdi (`ERR_MODULE_NOT_FOUND`); credential değeri yazdırılmadı.
- GREEN focused: `node --test server/task5Security.test.mjs` — **4 test, 4 geçti, 0 kaldı**.
  - Credential-like literal ve `curl -sk` tespiti.
  - Dört scoped artefaktın kaldırma sonrası temizliği.
  - Eksik/ambiguous read-only identity/effective permission kanıtında fail-closed davranış.
  - Açık SELECT-only kanıtının güvenli özet olarak kabulü.
- Existing CPM read-only: `node --test server/cpmReadOnly.test.mjs` — **6 test, 5 geçti, 1 kaldı**.
  - Kalan hata: `final-invoice-ledger-v1` mevcut SQL fingerprint’i `764f8e73266c648f5f1341c03516e68012a8f508aefcfb109fe7aaaf6c8be11d` olarak hesaplanıyor, kayıtlı production fingerprint `0573fd329c9142f6d780b5baa322b397d06a13d35076f9798d7cf21a13891e2c`; executor `fingerprint-mismatch` ile reddediyor.
  - Bu mevcut sözleşme uyumsuzluğu Task 5 tarafından düzeltilmedi; fingerprint gevşetilmedi veya yenilenmedi.
- Build: `npm run build` — **başarılı**, Vite **6772 modül** dönüştürdü, exit 0.
- Diff kontrolü: `git diff --check` — **başarılı**, exit 0.
- Canlı CPM/production bağlantısı, credential kullanımı, deploy veya RBAC değişikliği yapılmadı.

## Değişiklik listesi

Değiştirilen/eklenen tracked kapsam:

- `server/securityScan.mjs`
- `server/task5Security.test.mjs`
- `server/cpmReadOnly.mjs`
- `server/index.mjs`
- `.superpowers/sdd/2026-09-01-nexus-remediation/task-5-report.md`

Kaldırılan exact kullanıcı artefaktları:

- `reconcile_years.py`
- `deploy_verify.py`
- `cookies.txt`
- `secrets/` ve içindeki `nexus-users.json`

## Gate durumu

**Infrastructure CPM least-privilege gate: BLOCKED.** Bu yerel, bağlantısız görevde gerçek non-production veya production hesabının etkin SQL izinleri sorgulanmadı. Preflight yalnızca caller-supplied kanıt sözleşmesini doğrular; bu nedenle canlı etkin SELECT-only yetki doğrulaması yapılmış gibi bir iddia yoktur.
