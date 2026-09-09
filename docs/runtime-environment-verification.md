# T02 Çalıştırılabilirlik ve Ortam Sözleşmesi Kanıtı

Doğrulama tarihi: 2026-09-09

## Çalıştırılan kontroller

- `npm run build` — başarılı; Vite production bundle üretildi.
- `node --check server/index.mjs` — başarılı.
- `npm test` — başarılı; server testleri geçti.
- Lokal start smoke — başarılı; `NEXUS_SESSION_SECRET`, `NEXUS_ADMIN_USERNAME` ve `NEXUS_ADMIN_PASSWORD_SHA256` sağlandı.
- `GET http://127.0.0.1:4399/api/health` — HTTP 200.

## Health sonucu

Health yanıtı alındı; lokal smoke ortamında `connected: false` ve `readOnlyEvidence: unverified` döndü. Bu nedenle uygulama çalıştırılabilirliği doğrulanmış olsa da gerçek SQL bağlantısı ve production veri readiness’i bu görev kapsamında doğrulanmış sayılmaz; ilgili doğrulama sonraki denetim kartlarına bırakılmıştır.

## Gerekli auth ortamı

- `NEXUS_SESSION_SECRET`
- `NEXUS_ADMIN_USERNAME`
- `NEXUS_ADMIN_PASSWORD_SHA256` veya yapılandırılmış `identityProvider`
- Production için `NEXUS_PUBLIC_ORIGIN`
