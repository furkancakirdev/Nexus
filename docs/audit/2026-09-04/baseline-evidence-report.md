# Marlin Nexus Baseline Kanıt Raporu

**Tarih:** 2026-09-04  
**Kapsam:** Local kaynak, canlı runtime, build-info/manifest/hash ve session artefaktlarının salt-okunur baseline karşılaştırması  
**Sonuç:** `BASELINE_BLOCKED_FOR_RELEASE`

## 1. Yöntem ve sınırlar

- CPM veya canlı Nexus üzerinde yazma, deploy, restart, veri silme ya da session artefaktı temizliği yapılmadı.
- Local dosya/hash, Git durumu, production build, canlı HTTP endpoint'leri ve `.temp_files` envanteri ayrı kanıt katmanları olarak toplandı.
- Credential taraması değerleri rapora yazmadan yalnız dosya yolu ve satır numarası düzeyinde sınıflandırıldı.
- Canlı kimlik doğrulaması gerektiren endpoint'ler için mevcut güvenli oturum kullanılmadığından build-info/readiness/module kimliği doğrulanmış kabul edilmedi.

## 2. Local kaynak kanıtı

| Alan | Değer |
|---|---|
| Branch | `codex/UI` |
| HEAD | `1ca60ea8def8bf22ee7a0997a4883bb64ca9a5ad` |
| Son commit | `1ca60ea Improve CPM audit usability and evidence reporting` |
| Working tree | **Dirty** |
| Tracked modified dosya | 11 |
| Tracked diff | 960 ekleme / 175 silme |
| Package | `marlin-nexus@0.0.0` |
| `package-lock.json` SHA-256 | `1456497A1ED277F54AE6B710463C6434094C2A82FB91B3BDCF03B44C3E3F86AC` |
| `compose.yaml` SHA-256 | `E2A578FDF45B32CB0BF5050A54C575182AC507D7C5EDEED4698B6F4DCB0FE189` |

Çalışma ağacında ayrıca çok sayıda untracked kaynak, test, doküman, `data/`, `work/`, `infra/`, `docs/audit/` ve `.temp_files/` girdisi bulunuyor. Bu nedenle `HEAD` tek başına mevcut local uygulama kaynak kimliği olarak kullanılamaz.

## 3. Local build ve dağıtım manifesti

`npm run build` sonucu:

- Vite: `6.4.3`
- Transform edilen modül: **6.779**
- Build sonucu: **başarılı**
- `dist` dosya sayısı: **281**
- `dist` toplam boyutu: **89.631.321 byte**
- Sıralı dist manifesti SHA-256: `47ACD367B4DB9453CECA9D2461F553C14ED668A4A45C256A74117F42775EC431`
- Örnek girişler ve SHA-256 değerleri build sırasında üretildi; tam dosya listesi bu raporun üretildiği çalışma ortamındaki `dist` dizininden yeniden üretilebilir.

Mevcut arşiv kanıtı:

| Artefakt | Boyut | SHA-256 | Son yazım |
|---|---:|---|---|
| `marlin-nexus-release.tar.gz` | 384.253 byte | `7C1664794C97723616BDE9116D1B65A5044DF1FB74927EC670AC172668BE478A` | 2026-08-31 23:01:26 +03:00 |
| `.temp_files/marlin-nexus-latest.tar.gz` | 550.301.263 byte | `B2FE17C13215379191BCF7C8CEC637DBE41B85705B617190F7D1D7F25C5D2931` | 2026-08-28 23:30:53 +03:00 |

Bu arşivlerin local `HEAD` veya canlı image ile aynı kaynak kimliğine sahip olduğu doğrulanmadı.

## 4. Canlı runtime kanıtı

Hedef: `https://192.168.12.11:4318`

| Endpoint | Sonuç | Kanıt yorumu |
|---|---|---|
| `/api/health` | HTTP 200 | `connected=true`, `mode=live`, `readOnly=true`, `database=Marlin_Uyg` |
| `/api/build-info` | HTTP 401 | Kimlik doğrulama gerekli; build/image kimliği alınamadı |
| `/api/readiness` | HTTP 401 | Kimlik doğrulama gerekli; resmi readiness alınamadı |
| `/api/modules` | HTTP 401 | Kimlik doğrulama gerekli; canlı modül matrisi alınamadı |

`/api/health` canlı servisin erişilebilir ve runtime cevabında read-only olarak işaretli olduğunu kanıtlar; tek başına çalışan image digest’i, kaynak commit’i, ledger revision’ı, modül kapsamını veya release readiness’i kanıtlamaz.

**Canlı image/build-info karşılaştırması:** `BLOCKED — authenticated build-info veya container/image digest kanıtı yok.`

## 5. Session ve artefakt envanteri

`.temp_files` altında toplam:

- **27.458 dosya**
- **1.719.463.950 byte** (yaklaşık 1,72 GB)

Öne çıkan klasörler:

| Kök | Dosya | Boyut | Son yazım |
|---|---:|---:|---|
| `12ui-diagnostics` | 26.484 | 373.865.302 byte | 2026-08-28 01:02:49 +03:00 |
| `release-task15-20260828-r1` | 617 | 622.018.000 byte | 2026-08-28 15:08:52 +03:00 |
| `release-task15-20260828-r3` | 295 | 3.673.514 byte | 2026-08-28 15:09:37 +03:00 |
| `erp-audit-2026-08-22` | 12 | 1.566.844 byte | 2026-08-22 11:45:17 +03:00 |
| `service-revenue-release` | 9 | 221.207 byte | 2026-08-15 18:35:25 +03:00 |
| `service-revenue-remote` | 4 | 199.292 byte | 2026-08-15 18:35:25 +03:00 |

Bu envanter session/release çıktılarının birbirinden bağımsız kopyalar ürettiğini ve en az 1,72 GB yerel artefakt biriktiğini kanıtlar. Temizlik veya arşiv silme yapılmadı.

## 6. Credential-pattern taraması

Cache, `node_modules` ve sandbox cache dizinleri hariç **1.758** metin/konfigürasyon dosyası tarandı.

- **31 dosyada** credential veya credential-benzeri pattern eşleşmesi bulundu.
- Eşleşmelerin önemli bölümü eski CPM araştırma scriptleri ve `release-task15` payload kopyalarıdır.
- Pattern eşleşmesi değerlerin bu rapora taşındığı anlamına gelmez; fakat artefaktların release kapsamına alınmaması ve güvenli retention/temizlik kararı verilmesi gerektiğini gösterir.
- Credential değerleri rapora, loga veya kalıcı belleğe yazılmadı.

## 7. Local–live karşılaştırma matrisi

| Kanıt | Local | Live | Eşleşme |
|---|---|---|---|
| Kaynak commit | `1ca60ea...` + dirty değişiklikler | Authenticated build-info alınamadı | **Doğrulanamadı** |
| Frontend build | 6.779 modül, başarılı | Canlı build bilgisi 401 | **Doğrulanamadı** |
| Dist manifest | SHA-256 `47AC...C431` | Canlı manifest alınamadı | **Doğrulanamadı** |
| Image digest | Local image kanıtı yok | Canlı image digest alınamadı | **Doğrulanamadı** |
| Runtime sağlık | Local build başarılı | HTTP 200, live/readOnly | Kısmi |
| Modül matrisi | Kaynak registry mevcut | `/api/modules` 401 | **Doğrulanamadı** |
| Readiness | Local release runner/preflight mevcut | `/api/readiness` 401 | **Doğrulanamadı** |
| Artefakt soy ağacı | 27.458 dosya / 1,72 GB | Sunucu artefakt listesi yok | **Doğrulanamadı** |

## 8. Authenticated canlı kanıt denemesi (2026-09-04)

Canlı uçlar için güvenli oturum oluşturma ön koşulları kontrol edildi:

- `POST /api/session/login` auth akışı kaynakta doğrulandı; başarılı giriş `nexus_session` HttpOnly ve `nexus_csrf` cookie üretir.
- Çalışma ortamında `NEXUS_ADMIN_USERNAME`, `NEXUS_ADMIN_PASSWORD`, `NEXUS_ADMIN_PASSWORD_SHA256`, `NEXUS_PUBLIC_ORIGIN` ve `NEXUS_SESSION_SECRET` değişkenlerinin tamamı **UNSET** bulundu.
- Proje içinde `cookies.txt` veya mevcut güvenli canlı session cookie dosyası bulunamadı.
- Kullanıcı tarafından önceki mesajda paylaşılan parola bu rapora, komut satırına, dosyaya veya kalıcı belleğe aktarılmadı.
- Sonuç: authenticated `/api/build-info`, `/api/readiness` ve `/api/modules` çağrıları bu çalışma alanından güvenli biçimde yürütülemedi; üç endpoint için önceki HTTP 401 kanıtı geçerliliğini koruyor.

**Önceki deneme durumu:** `AUTHENTICATED_LIVE_EVIDENCE_BLOCKED` (oturum girdisi yoktu).

### Güncel authenticated canlı çağrı (2026-09-04)

Geçici yönetici oturumu komut satırında bellekte oluşturuldu; cookie dosyaya yazılmadı ve yanıt gövdelerine cookie/token eklenmedi. Aynı oturumla yapılan salt-okunur GET sonuçları:

| Endpoint | HTTP | Redakte edilmiş kanıt |
|---|---:|---|
| `POST /api/session/login` | 200 | Oturum açıldı; kimlik bilgileri ve cookie değerleri raporlanmadı. |
| `GET /api/build-info` | 200 | `buildId=nexus-20260831-230128`; `buildVersion=v2-control-room-20260831-230128`; `buildCommit=4db39d8f38fc7bd87704520fd51db1170ee2cc02`; `imageDigest=sha256:a5a7a0eb6c90f2acdbace109b0d8aee2d109c81f161523806a7d659ed5aeb4ab`; `artifactSha256=null`; `database=Marlin_Uyg`. |
| `GET /api/readiness` | 200 | `ready=false`; blockers: `read-only-boundary-failed`, `source-provenance-unverified`, `inventory-source-not-verified`, `official-cost-coverage-insufficient`; runtime `connected=true`, `readOnly=false`, `readOnlyEvidence=unverified`; build ID yukarıdakiyle eşleşiyor. |
| `GET /api/modules` | 403 | Yanıt gövdesi redakte edildi; canlı oturum route capability/policy engeline takıldı (`API rotası için yetki politikası tanımlı değil`). |
| `POST /api/session/logout` | denendi | Geçici oturum sonlandırma denendi; CSRF reddi nedeniyle kalıcı oturum kanıtı tutulmadı. |

**Güncel kanıt durumu:** `AUTHENTICATED_LIVE_EVIDENCE_COLLECTED_WITH_RELEASE_BLOCKERS`

Önemli fark: `/api/health` önceki `readOnly:true` çıktısına rağmen authenticated `/api/readiness` runtime kanıtı `readOnly:false` ve `readOnlyEvidence=unverified` döndürüyor. Bu tutarsızlık release öncesi çözülmesi gereken P0 güvenlik/veri bütünlüğü bulgusudur.

## 9. 2026-09-04 remediation baseline sonucu

### Runtime read-only kök nedeni ve local düzeltme

- `/api/health` önceki canlı image'da bağlantı başarılı olduğunda `readOnly:true` değerini sabit bildiriyordu.
- `/api/readiness` ise `buildRuntimeInfo()` içindeki `CPM_EFFECTIVE_READ_ONLY` değerini kullanıyordu; canlı image'da bu env kanıtı yoktu ve `readOnly:false/readOnlyEvidence=unverified` üretildi.
- Local düzeltme: health ve readiness aynı `buildRuntimeInfo()` kaynağına bağlandı; `compose.yaml` içine `CPM_EFFECTIVE_READ_ONLY: "true"` açıkça eklendi. Bu düzeltme CPM'nin gerçek SQL yetkisini tek başına kanıtlamaz; yalnız runtime sözleşmesini tutarlı hale getirir.

### Modül capability/policy düzeltmesi

- Local'de `shared/moduleRegistry.mjs` oluşturuldu; yedi aktif modülün navigation ve server matrisi tek kaynaktan üretiliyor.
- `/api/modules` authenticated GET route'u eklendi ve `reporting:read` capability policy'sine bağlandı.
- Local UI/auth sözleşme testleri ve tam Node test koşusu: **501/501 geçti**; production build başarılı, `git diff --check` temiz.
- Canlı image hâlâ `buildCommit=4db39d8f38fc7bd87704520fd51db1170ee2cc02` / `imageDigest=sha256:a5a7a0eb...5aeb4ab` bildirdiği için bu local düzeltmenin canlıda etkin olduğu iddia edilemez. Yeni image dağıtılmadan `/api/modules` authenticated matrisi yeniden toplanamaz.

### Temiz checkout ve build parity

- Local çalışma dalı `codex/UI`, HEAD `1ca60ea8def8bf22ee7a0997a4883bb64ca9a5ad`; çalışma ağacı dirty.
- Canlı build commit'i local HEAD ile eşleşmiyor; canlı image digest'i de local candidate artifact ile doğrulanmış eşleşmeye sahip değil (`artifactSha256=null`).
- Sonuç: temiz checkout oluşturulup immutable candidate manifest üretilmeden release parity **başarısız** kabul edilir.

### CPM salt-okunur blocker değerlendirmesi

- Local CPM guard ve read-only contract testleri başarılıdır; bunlar canlı CPM kimliği/etkin izin kanıtı değildir.
- Canlı readiness halen `source-provenance-unverified`, `inventory-source-not-verified` ve `official-cost-coverage-insufficient` blocker'larını döndürmektedir.
- Bu blocker'lar, doğrulanmış canlı CPM salt-okunur bağlantısı, tarihsel hareket/açılış kanıtı ve tam maliyet kapsamı olmadan kapatılmamıştır. Yanlış maliyet üretmemek için snapshot veya selector maliyeti resmi WAC kanıtı yerine kullanılmamıştır.

**Güncel release durumu:** `LOCAL_REMEDIATION_VERIFIED_LIVE_IMAGE_STALE_CPM_EVIDENCE_BLOCKED`

## 10. Candidate image / release parity yeniden kontrolü (2026-09-04)

- Docker daemon erişimi bu çalışma ortamında yok: `docker version` named-pipe bağlantısı kurulamadı (`dockerDesktopLinuxEngine` bulunamadı).
- Bu nedenle yeni container image veya immutable image digest oluşturulmadı; canlı deploy yapılmadı.
- Local üretim build'i daha önce başarılıdır; ancak checkout dirty olduğundan bu çıktı tek başına release artifact'i değildir.
- `release_runner_test.py` + `release_artifact_test.py`: **27/27 geçti**. Runner fail-closed sözleşmesi doğrulandı; ağ/deploy işlemi yapmadı.
- Mevcut canlı build-info ile local düzeltme arasında parity kanıtı üretilemedi. Canlı image eski commit/digest taşıyor.
- Sonuç: `/api/modules` authenticated canlı matrisi yeniden toplanamaz; runtime read-only düzeltmesi canlıda etkin kabul edilemez.

## 11. Sunucu candidate oluşturma kapısı (2026-09-04)

- Sunucuda izole candidate oluşturmak için gereken güvenli release değişkenleri işlem ortamında bulunmuyor: hedef/kullanıcı, SSH key, known-hosts, host fingerprint, TLS CA ve immutable release manifest alanları `UNSET`.
- Local Docker daemon da erişilebilir değil; bu makinede image build/digest üretilemedi.
- Parola ile SSH, host-key otomatik kabulü, TLS doğrulama bypass'ı veya production container üzerinde doğrudan mutation yapılmadı.
- Bu nedenle candidate image üretimi, canlı `/api/modules` authenticated matrisi ve local↔live digest parity kanıtı **açık release kapısı** olarak kalıyor.

## 12. Blocker ve önerilen sonraki kanıt

1. Authenticated, salt-okunur `/api/build-info`, `/api/readiness` ve `/api/modules` çağrıları aynı rapor günü snapshot'ında alınmalı.
2. Canlı container image digest'i ve build-info içindeki source commit/image/release ID alanları local aday manifestiyle karşılaştırılmalı.
3. Local dirty tree release adayı olarak kullanılmamalı; temiz checkout veya açıkça hash'lenmiş candidate artifact üretilmeli.
4. `.temp_files` için manifest + retention kararı alınmalı; credential-pattern içeren eski payload'lar release paketlerine dahil edilmemeli.
5. Ayrı rol hesabı ve authenticated UI/API smoke kanıtı olmadan RBAC parity kabul edilmemeli.
6. Bu rapor tamamlanmış bir deploy veya release onayı değildir.

## Karar

**Durum: Canlı erişilebilir, ancak baseline tamamlanmış ve release-ready değil.**  
Canlı image/build-info, local kaynak ve manifest arasında doğrulanmış birebir eşleşme bulunmadığı için cutover yapılmamalıdır.
