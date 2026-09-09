# P0 Kanıt Durumu — 2026-09-09

## Sonuç

Bu checkout'tan onaylı Docker/operasyon runner üzerinde canlı CPM snapshot'ı veya deploy çalıştırılamadı. Runner ve ortam fail-closed davranarak gerekli operasyon kimliklerini bekliyor; sahte snapshot, parity veya release kanıtı üretilmedi.

## Kanıtlanan durum

- `python -m unittest release_runner_test.py release_artifact_test.py`: 27/27 başarılı.
- `python release_runner.py`: `RELEASE_PREFLIGHT_BLOCKED`.
- Dönen bloklar: `target-missing`, `ssh-key-file-missing`, `known-hosts-file-missing`, `ssh-host-key-missing`, `tls-ca-invalid`, `release-id-missing`, `source-commit-invalid`, `image-digest-invalid`, `compose-config-hash-invalid`, `rollback-manifest-missing`.
- Ortamda aşağıdaki değişkenlerin tümü yok: `CPM_CREDENTIAL_FILE`, `NEXUS_SSH_KEY_FILE`, `NEXUS_KNOWN_HOSTS_FILE`, `NEXUS_SSH_HOST_KEY`, `NEXUS_TLS_CA_FILE`, `NEXUS_IMAGE_DIGEST`, `NEXUS_COMPOSE_CONFIG_HASH`, `NEXUS_PREVIOUS_IMAGE_DIGEST`.
- `release_runner.py` yalnız doğrulama ve incelemeye açık komut planı üretir; SSH/Docker/deploy çalıştırmaz.
- `analysis/sourceEvidenceDiscoveryRunner.mjs` injected adapter ister ve çıktıyı `liveEvidence: false` olarak işaretler; gerçek CPM bağlantısı değildir.

## P0 kapıları

| Kapı | Durum | Gerekli kanıt |
|---|---|---|
| Read-only CPM snapshot | BLOCKED | Onaylı runner, CPM credential mount, tek transaction snapshot artefact'ı |
| CPM/Nexus fatura parity | BLOCKED | Aynı dönem/ledger revision, fatura satırı ve toplam fark tablosu |
| Kişi bazlı parity | BLOCKED | CPM temsilci anahtarı ve Nexus attribution anahtarıyla tüm liste veya en az 3 kişi |
| Açılış/devir WAC kanıtı | BLOCKED | `STKHAR`/`STKSYM` açılış-devir satırları, ürün-depo-belge soy zinciri |
| Tarihsel kart dövizi/fiyatı | BLOCKED | Tarihe göre geçerli `STKKRT`/`FYTKRT`/`MIRFYTKRT` kanıtı ve geçerlilik sınırları |
| Halkbank kur kanıtı | BLOCKED | `DVZHAR`, banka kimliği 03, tarih ve satış kuru alanları |
| Immutable artifact | BLOCKED | Pinned source commit, artifact SHA256, image digest, compose hash |
| Candidate/readiness/prewarm | BLOCKED | Aday container kimliği, authenticated API çıktıları, build/read-only/parity eşleşmesi |
| Backup/rollback | BLOCKED | State backup hash, önceki release/image/artifact ile linked manifest |

## Mevcut kaynak kanıtlarının sınırı

`analysis/2026-09-09-cpm-financial-evidence-findings.md` ve `analysis/2026-09-09-evidence-release.md` geçmiş araştırma özetleridir; bu oturumun tek transaction snapshot'ı veya kullanıcı bazlı parity tablosu değildir. Bu nedenle bu dosyalar canlı P0 kapısı yerine geçmez.

## Devam koşulu

P1 Departments/Overview/Inventory geliştirmelerine başlanmayacak. Önce onaylı operasyon runner şu değerleri secrets dışında environment/path olarak sağlamalıdır: pinned SSH key + known_hosts + host key, TLS CA, CPM credential file mount, release/image/compose identity, previous release/image/artifact ve backup hedefi. Runner çalıştırıldığında snapshot, parity, WAC evidence, candidate, authenticated readiness/prewarm ve rollback manifest kanıtları aynı release ID altında saklanmalıdır.

**Release kararı: NO-GO. Deploy yapılmadı.**
