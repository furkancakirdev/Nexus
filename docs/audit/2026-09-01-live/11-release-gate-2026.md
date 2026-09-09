# Kontrollü Release Kapısı — 2026-09-01

## Sonuç

Yerel test ve build kapıları başarılı olsa da mevcut `deploy.py` canlı release için güvenli ve doğrulanabilir değildir. Bu nedenle bu turda canlıya deploy yapılmadı.

## Kanıtlanmış engeller

- `deploy.py` içinde üretim SSH/Nexus kimlik bilgileri sabit metin olarak bulunuyor. Bu değerler rapora kopyalanmadı ve burada tekrar edilmiyor.
- SSH istemcisi `AutoAddPolicy()` kullanıyor; sunucu host key'i doğrulanmadan kabul ediliyor.
- Sağlık ve login kontrolleri `curl -sk` ile TLS sertifika doğrulamasını kapatıyor.
- Deploy adımı, arşiv açma ve `docker compose up -d --build` sonrası yalnızca sınırlı health/build/overview çıktısını kontrol ediyor; readiness, ortak ledger sürümü, authenticated read-only smoke kapsamı ve finansal blocker doğrulaması eksik.
- Script içinde başarısız ara adımlardan sonra güvenli rollback veya hedef doğrulama kapısı yok.
- Kaynakta yalnız `/api/health` rotası açıkça tanımlı; `/api/build-info` ve `/api/readiness` için çalışan route tanımı bulunamadı. Bu nedenle build kimliği ve readiness release kapıları şu an uygulanabilir bir API sözleşmesine bağlanmış değil.
- `compose.yaml` yalnız uygulama servisini ve CPM credential dosyasını bağlamaktadır; `infra/Caddyfile` içindeki TLS fullchain/private-key mount sözleşmesi Compose içinde görünmüyor. TLS'nin hangi servis tarafından ve hangi doğrulanmış mount'larla sunulduğu release preflight'ında kanıtlanmalı.

## Durum

| Kapı | Durum |
|---|---|
| Yerel testler | Geçti — 360/360 |
| Production build | Geçti — 6.773 modül |
| CPM yazma sınırı | Bu turda ihlal edilmedi |
| Deploy aracı güvenliği | **Başarısız** |
| Canlı parity deploy | Yapılmadı |

## 2026-09-01 uygulanan güvenli sözleşme dilimi

- Authenticated `/api/build-info` eklendi; build ID, sürüm, commit, image digest, CPM database/company ve izin kanıtı alanlarını açıkça taşır.
- Authenticated `/api/readiness?year=YYYY` eklendi; ledger/inventory durumunu ve finansal blocker'ları `ready` sonucu ile birlikte döndürür.
- Etkin CPM salt-okunur izin kanıtı belirtilmedikçe runtime `readOnly=false` ve `readOnlyEvidence=unverified` kalır; uygulama salt-okunur niyetini gerçek izin kanıtı gibi sunmaz.
- Yerel doğrulama: `npm test` **362/362**, `npm run build` **6.773 modül** başarılı.
- Canlı deploy yapılmadı; yeni endpoint'lerin canlı parity doğrulaması beklemede.

## 2026-09-01 immutable manifest dilimi

- `server/releaseManifest.mjs`, release ID, 40 karakterlik kaynak commit'i, immutable `sha256` image digest'ini, CPM hedefini, SSH host-key fingerprint'ini, TLS CA yolunu ve rollback image kimliğini fail-closed doğrular.
- `latest`, eksik fingerprint/CA veya rollback kimliği gibi mutable/eksik değerler reddedilir.
- TDD kanıtı: RED aşamasında modül eksikliği yakalandı; GREEN sonrası manifest testleri **3/3**, tam suite **365/365** geçti.
- Production build **6.773 modül** başarılıdır. Bu modül henüz deploy orkestrasyonu değildir ve canlı cutover gerçekleştirilmemiştir.

## 2026-09-01 preflight karar dilimi

- `server/releasePreflight.mjs`, manifest doğrulamasına ek olarak host-key, TLS, Compose hash, secret mount'ların salt-okunur olması, state yedeği, aday container, readiness ve rollback manifesti kanıtlarını zorunlu kılar.
- Herhangi bir kanıt eksik veya yanlışsa preflight `valid=false` ve açık blocker kodları döndürür.
- TDD kanıtı: RED aşamasında eksik modül yakalandı; GREEN sonrası preflight testleri **3/3**, tam test suite **368/368** geçti.
- Production build **6.773 modül** başarılıdır. Bu dilim ağ bağlantısı veya deploy gerçekleştirmez.

## 2026-09-01 checksum/rollback sözleşme düzeltmesi

- `server/releaseMetadata.mjs`, checksum referanslarını çalışma dizinine göre değil açıkça verilen checksum taban yoluna göre normalize eder. Böylece `backups/...` gibi göreli referanslar runner'ın hangi dizinden çalıştırıldığına bağlı kalmaz.
- Aynı modül rollback image metadata'sını fail-closed doğrular: rollback digest'i geçerli olmalı, manifestteki önceki release digest'iyle eşleşmeli ve aktif image digest'iyle aynı olmamalıdır.
- `server/releasePreflight.mjs` bu doğrulamayı artık gerçek preflight kapısına bağlar; eksik, aktif veya manifestten kopuk rollback image metadata'sı release'i durdurur.
- TDD kanıtı: metadata testleri ve preflight testleri **7/7** geçti; tam test suite **372/372** geçti; production build **6.773 modül** başarılı.
- Bu değişiklik yalnızca yerel doğrulama ve release sözleşmesidir; canlı hosta deploy edilmedi, CPM'e yazılmadı ve yedek/image/cache temizlenmedi.

## 2026-09-01 fail-closed runner yapılandırma dilimi

- Mevcut güvensiz `deploy.py` çalıştırılmadan ayrı `release_runner.py` eklendi. Runner bu ilk dilimde yalnızca release yapılandırmasını doğrular; ağ bağlantısı, arşiv yükleme, Docker cutover veya rollback çalıştırmaz.
- SSH password kullanımı, host-key auto-accept, eksik known-hosts/SSH key, TLS bypass, mutable image tag'i, eksik source commit/Compose hash ve eksik rollback manifesti bloklayıcıdır.
- Boş ortamla gerçek çalıştırma denemesi `RELEASE_PREFLIGHT_BLOCKED` ve exit code **2** üretti; bu, varsayılan fail-closed davranışın kanıtıdır.
- TDD kanıtı: `release_runner_test.py` **2/2** ve `py_compile` başarılı; mevcut JavaScript suite **372/372**, production build **6.773 modül** başarılı.
- Runner henüz canlı deploy orkestrasyonu değildir; üretime geçiş için immutable artifact yükleme, aday container doğrulaması, authenticated readiness/prewarm ve otomatik rollback adımları ayrıca uygulanmalı ve canlıya alınmadan önce izole doğrulanmalıdır.

## 2026-09-01 aday artifact/container doğrulama dilimi

- `release_runner.py`, aday container kanıtını doğrulayan fail-closed sözleşmeyle genişletildi: container çalışma durumu, build ID, kaynak commit, immutable image digest, readiness, ledger prewarm, authenticated smoke ve CPM read-only kanıtı beklenir.
- Kimlik veya runtime kanıtlarından biri uyuşmazsa açık blocker kodu üretilir; bu dilim yalnız kanıt doğrulaması yapar, SSH/Docker/CPM üzerinde işlem başlatmaz.
- TDD kanıtı: runner testleri **4/4**, boş ortam fail-closed kontrolü başarılı; tam JavaScript suite **372/372**, production build **6.773 modül** başarılı.
- Aday doğrulama sözleşmesi henüz canlı release kanıtı değildir; izole aday container’ın gerçekten oluşturulması ve authenticated endpoint/prewarm çıktılarının bu sözleşmeye bağlanması sonraki adımdır.

## 2026-09-01 izole aday ortamı erişim kontrolü

- Yerel çalışma makinesinde `docker` komutu bulunamadı (`docker is not recognized`); Docker client/daemon, local image listesi ve `docker compose config` doğrulanamadı.
- PATH dışındaki yaygın Docker Desktop konumları da salt-okunur kontrol edildi; `docker.exe`, `com.docker.cli.exe` ve `com.docker.service` için doğrulanabilir kurulum/servis bulunamadı.
- Bu nedenle izole aday container oluşturulmadı ve üretim hostunda aday container çalıştırılmadı. Aday release kanıtı için Docker erişilebilir bir doğrulama hostu veya kurumsal runner gereklidir.
- Bu, mevcut runner sözleşmesinin fail-closed davranışıyla uyumludur: aday image, readiness, prewarm ve authenticated smoke kanıtları olmadan release geçemez.

## 2026-09-01 aday doğrulama planı dilimi

- `release_runner.py`, doğrulama hostunda çalıştırılmak üzere yalnızca plan üreten `build_candidate_verification_plan` fonksiyonuyla genişletildi. Plan; immutable image inspect, aday container durumu ve CA doğrulamalı `/api/health`, `/api/build-info`, `/api/readiness?year=2026` kontrollerini sıralar.
- Üretilen komutlarda `--insecure`, `curl -k` veya parola bulunmadığı test edildi. Fonksiyon komutları çalıştırmaz; mevcut Docker blocker’ı nedeniyle canlı/aday hostta icra edilmedi.
- TDD kanıtı: runner testleri **5/5**, `py_compile` başarılı ve `git diff --check` yalnızca mevcut CRLF uyarılarını verdi.
- Aday doğrulama planı hazırdır; ancak Docker-capable onaylı host olmadan gerçek candidate evidence üretilemez ve release kapısı açılmaz.

## 2026-09-01 authenticated smoke/prewarm planı

- Aday planı authenticated login adımı, dışarıdan sağlanan JSON payload dosyası ve cookie jar path'iyle genişletildi; parolalar runner komutuna gömülmüyor.
- Plan artık 2025 ve 2026 readiness çağrılarını ayrı prewarm adımları olarak, ardından authenticated build-info ve readiness smoke kontrollerini içeriyor.
- Tüm HTTP komutları `curl --fail --silent --show-error --cacert` kullanır; `curl -k`, `--insecure` ve sabit parola yoktur.
- Runner testleri **5/5**, `py_compile` başarılı ve eksik ortam çalıştırması yine exit code **2** ile fail-closed kaldı.
- Plan yalnızca komut üretir; Docker bulunmadığı için hiçbir login, prewarm, endpoint çağrısı veya container işlemi çalıştırılmadı.

## 2026-09-01 kontrollü Docker build-cache temizliği

- Kullanıcı talebi ve ön envanter kanıtı doğrultusunda yalnızca kullanılmayan/reclaimable Docker build cache temizlendi: `docker builder prune -af`.
- Temizlik öncesi root disk **%97**, yaklaşık **1,1 GB** boş ve build cache reclaimable değeri yaklaşık **3,957 GB** idi. Temizlik sonrası root disk **%87**, yaklaşık **4,8 GB** boş; Docker build cache **937,8 MB**, reclaimable **0 B** olarak gözlendi.
- Temizlikte image, container, volume, host backup, uygulama `data` veya secret dosyası hedeflenmedi. Temizlik sonrası **10/10** container çalışır durumda; `marlin-profit-sharing`, `nexus-caddy` ve diğer servisler ayakta.
- Build cache yeniden üretilebilir ancak geri alınabilir bir yedek değildir; bu işlem rollback image veya backup retention ihtiyacını ortadan kaldırmaz.
- Bu işlem server Docker state'inde kontrollü bir silmedir; CPM verisine yazılmadı ve Nexus uygulama verisi değiştirilmedi. Disk kapasitesi iyileşti, ancak immutable artifact, aday container ve authenticated readiness kanıtları hâlâ eksik olduğundan release kapısı otomatik açılmadı.

## 2026-09-01 endpoint entegrasyon doğrulaması

- Anonim `/api/build-info` ve `/api/readiness` istekleri `401` döner.
- Yetkili reporting oturumu her iki endpoint'e erişebilir; CPM/izin kanıtı yokken readiness `ready=false` döner.
- Tam yerel doğrulama: `npm test` **368/368**, `npm run build` **6.773 modül** başarılı.
- Endpoint değişiklikleri canlıya aktarılmadı; canlı parity ve authenticated smoke hâlâ release sonrası kapıdır.

## 2026-09-01 canlı host salt-okunur preflight kanıtı

- SSH host ED25519 anahtarı mevcut ve fingerprint'i alınabildi; güvenli runner bunu sabitlenmiş known-host kaydıyla karşılaştırmalıdır.
- Caddy TLS sertifikası `CN=192.168.12.11`, SAN `IP Address:192.168.12.11`, iç Marlin root CA tarafından imzalı ve 2027-09-28 tarihine kadar geçerlidir. App ve Caddy TLS mount'ları canlı inspect çıktısında `rw=false` görünmektedir.
- `data` uygulama state mount'ı yazılabilir; CPM credential ve Nexus kullanıcı secret mount'ları `rw=false` görünmektedir. Release state/secret ayrımı bu nedenle korunmalıdır.
- Canlı root disk kullanımı **%97** ve boş alan yaklaşık **1,1 GB** olarak gözlendi. Image build/archive/rollback işlemi öncesi disk alanı kapısı eklenmeden release güvenli kabul edilmemelidir.
- Bu inceleme salt-okunur host komutlarıyla yapıldı; CPM ve Nexus kalıcı verilerine yazılmadı.

## 2026-09-01 disk kullanım sınıflandırması

- Docker image toplamı **14,77 GB**; Docker raporunda **12,17 GB reclaimable** görünüyor.
- Docker build cache **4,895 GB**; bunun **3,252 GB**'ı reclaimable görünüyor.
- `/home/serviceproadmin/backups` toplamı **6,2 GB**; uygulama içi `backups` yaklaşık **490 MB**.
- Nexus `data` toplamı **1,1 GB** ve büyük kısmı 2023–2026 ledger snapshot'larından oluşuyor.
- Salt-okunur yaş envanterinde host backup dizininde **61**, uygulama backup dizininde **23** dosya görüldü. Host yedekleri 2026-03-31 tarihli predeploy arşivlerinden 2026-08-31 23:01 tarihli `marlin-nexus-backup-20260831-230128.tar.gz` dosyasına kadar uzanıyor; uygulama içi yedeklerin en yenisi 2026-08-28 15:10 tarihli `source-pre-task15-20260828-121020.tgz`.
- Host tarafında aynı gün içinde çok sayıda yaklaşık **68,3 MB** yedek ve ayrıca yaklaşık **494–559 MB** arası büyük predeploy/source arşivleri bulunuyor. Bunlar otomatik olarak "artık" kabul edilemez; rollback kapsamı, yaş, bütünlük hash'i ve saklama süresi sahibi doğrulanmadan silinmemelidir.
- Aktif `marlin-profit-sharing` container'ı **12 saattir** çalışıyor ve image ID'si `sha256:89755523ac69...` olarak inspect edildi; image listesinde bunun `marlin-profit-sharing-marlin-profit-sharing:latest` ile ilişkili olduğu görüldü. Bu gözlem aktif container'ı tanımlar, ancak release manifesti/rollback zincirinin doğrulandığını kanıtlamaz.
- Docker'da **21 image** bulundu; **9** image aktif container'lar tarafından kullanılıyor. Aktif olmayan image/build-cache nesneleri reclaimable görünse de hangi rollback veya başka servis bağımlılığına ait oldukları doğrulanmadan prune edilmemelidir.
- Metadata/hash kontrolünde yalnızca bazı arşivler doğrulanabilir çıktı verdi: `source-pre-20260809-0225-stock.tgz` ve `source-release-20260811-223201-inventory-planning.tgz` için SHA-256 doğrulaması **OK**. 2026-07-28 ve 2026-08-28 source arşivlerinin checksum dosyaları ise göreli `./backups/...` / `backups/...` yolları içerdiğinden mevcut çalışma dizininden doğrulama **başarısız/kanıtsız** kaldı; bu, arşivin bozuk olduğunu değil, checksum sözleşmesinin konum-bağımlı olduğunu gösterir.
- `rollback-image-id.txt` mevcut ve bir rollback image ID'si içeriyor; ancak bu ID'nin aktif image, release manifesti ve çalıştırılabilir rollback prosedürüyle eşleştiği bu salt-okunur taramada kanıtlanmadı. Aktif container image ID'si `sha256:89755523ac69...` olarak ayrı gözlendi.
- Bu alanların hiçbiri retention/rollback kararı olmadan silinmedi veya temizlenmedi. Disk kullanımı release blocker olmaya devam ediyor.

## 2026-09-01 kalan image retention kararı

- Build cache temizliği sonrası Docker image alanı **10,99 GB**, reclaimable image alanı **8,391 GB** olarak kaldı; dangling image listesi boş, container ve volume reclaimable alanı **0 B**.
- Aktif container image'ları ayrı doğrulandı; `marlin-profit-sharing` aktif image ID'si `sha256:89755523ac69...` ve tüm 10 container çalışır durumda.
- Kalan reclaimable image'ların önemli bölümü adlandırılmış `marlin-nexus-rollback:*`, `marlin-profit-sharing:rollback-*` ve eski release/source etiketleridir. Bazı release ve rollback etiketleri aynı image ID'sini paylaşsa da tüm rollback zincirinin yöneticisi ve restore prosedürü kanıtlanmış değildir.
- Bu nedenle hiçbir image silinmedi veya tag kaldırılmadı. Image cleanup için release retention tablosu, son doğrulanmış rollback noktası ve image digest sahipliği ayrıca belirlenmelidir; yanlış image temizliği release geri dönüşünü riske atabilir.

## 2026-09-01 image cleanup retention guard

- `docker_cleanup.py`, Docker image silme adaylarını yalnız açıkça onaylanmış digest’lerden üretir. Aktif image’lar, rollback etiketi taşıyan image’lar ve allowlist dışında kalan image’lar korunur.
- Allowlist boşsa veya bilinmeyen digest içeriyorsa plan blocker üretir; modül Docker komutu çalıştırmaz.
- TDD kanıtı: cleanup ve runner testleri toplam **7/7**, Python derleme başarılı. Server image’ları için allowlist/retention onayı bulunmadığından hiçbir image silme komutu çalıştırılmadı.

## 2026-09-01 güvenli release artifact paketleme dilimi

- `release_artifact.py`, mevcut güvensiz deploy helper’dan bağımsız, açık allowlist ile yerel release arşivi üretir. Yalnız `src`, `server`, `shared`, `public` ve gerekli build dosyaları dahil edilir.
- `data`, `secrets`, `.git`, `node_modules`, `dist`, cache/tmp ve symlink içerikleri arşive alınmaz; path traversal ve arşiv hedefinin kaynak kökü içine düşmesi reddedilir.
- Üretilen arşiv için SHA-256 digest döndürülür; arşiv üyeleri deterministik sıralanır.
- TDD kanıtı: artifact, cleanup ve runner testleri toplam **9/9**, Python derleme başarılı. Bu turda yalnız yerel test fixture’ları oluşturuldu; production server’a upload veya deploy yapılmadı.
- Sonraki transport dilimi, bu digest’i pinned SSH host key ve CA doğrulamasıyla aktaracak; mevcut `deploy.py` hâlâ çalıştırılmamalıdır.

## 2026-09-01 pinned SSH artifact aktarım dilimi

- `release_runner.py`, artifact SHA-256 doğrulaması, key-only `scp` aktarımı ve remote SHA-256 doğrulaması için non-executing plan üretir.
- Aktarım planı `StrictHostKeyChecking=yes`, `UserKnownHostsFile`, `IdentitiesOnly=yes` ve explicit `-i` SSH key kullanır; host-key fingerprint biçimi geçersizse fail-closed olur.
- `sshpass`, parola, `StrictHostKeyChecking=no`, `curl -k` ve `--insecure` kullanılmadı.
- TDD kanıtı: release artifact, cleanup ve runner testleri toplam **11/11**, Python derleme başarılı. Plan yalnızca üretildi/test edildi; servera upload, Docker cutover veya CPM yazımı yapılmadı.
- Gerçek aktarım için pinned known-hosts dosyası, SSH key erişimi, artifact manifesti ve hedefte yeterli boş alanın operasyonel olarak doğrulanması gerekir.

## 2026-09-01 immutable release manifest ve hedef kapasite kapısı

- `release_artifact.py`, release ID/build/source commit, immutable image ve compose digest’leri, artifact SHA-256, CPM database/company, pinned SSH host key, TLS CA ve önceki release’in image/artifact digest’lerini tek bir manifest sözleşmesinde toplar.
- Manifest doğrulaması; eksik rollback artifact digest’ini, mutable image tag’ini, geçersiz commit/digest’i, TLS `--insecure`/`-k` kullanımını ve eksik CPM/SSH kanıtını fail-closed blocker olarak raporlar.
- `validate_target_capacity`, aday artifact alanı ile korunacak rollback rezervinin toplamını hedefteki kullanılabilir byte ile karşılaştırır; yetersiz alanı `target-disk-insufficient` olarak engeller.
- TDD kanıtı: artifact/cleanup/runner testleri toplam **14/14**, `py_compile` başarılı ve `git diff --check` yalnızca mevcut CRLF uyarılarını verdi.
- Bu dilimde manifest dosyası servera aktarılmadı, image/container değiştirilmedi, deploy/cutover yapılmadı ve CPM’e yazılmadı. Gerçek hedef kapasitesi ve aday manifesti operasyonel kanıtla doğrulanana kadar release **NO-GO** kalır.

## 2026-09-01 runner-manifest birleşik release kapısı

- `release_runner.py`, runner yapılandırmasını immutable manifest ile karşılaştıran `validate_release_gate` kapısını ekledi.
- Release ID, source commit, image digest ve compose hash uyuşmazlıkları ayrı blocker kodlarıyla raporlanır; manifest doğrulaması ve aday+rollback kapasite kontrolü aynı sonuçta birleşir.
- TDD kanıtı: runner testleri **9/9**, artifact/cleanup/runner birleşik testleri **16/16**, `py_compile` başarılı.
- Bu yalnız yerel sözleşme doğrulamasıdır. Runner hâlâ komut üretir; servera upload, Docker cutover, canlı image silme ve CPM yazma yapılmadı.

## 2026-09-01 aday doğrulama önkoşul kontrolü

- Yerel çalışma ortamında Docker istemcisi bulunmadı (`DOCKER_CLIENT_NOT_FOUND`); bu nedenle immutable image inspect, aday container başlatma, readiness, prewarm ve authenticated smoke kanıtları bu makinede üretilemez.
- Allowlist paketleyici mevcut çalışma ağacından yerel bir arşiv üretebildi: **119 üye**, **376.999 byte**, SHA-256 `fd258120628bdf9d909e912fea728201406111ad2dce6960cc42e9e9ad90b677`; yasaklı `data/secrets/.git/node_modules/dist` kökü bulunmadı.
- Bu SHA-256 yalnızca yerel artifact paketleme kanıtıdır; image digest’i, çalışır aday container’ı veya canlı readiness/read-only kanıtını temsil etmez.
- Sonuç: release **NO-GO**. Bir sonraki operasyonel gereksinim, Docker-capable onaylı doğrulama hostu ve pinned SSH/CA kanıtlarıdır. Bu kontrolde servera upload, container çalıştırma, cutover ve CPM yazımı yapılmadı.

## 2026-09-01 yerel Docker aday image doğrulaması

- Docker Desktop daemon doğrulandı: client/server **29.7.2**, Compose **v5.4.0**, context `desktop-linux`, storage driver `overlayfs`.
- İlk build, mevcut terminal PATH’inde credential helper bulunmadığı için durdu; helper’ın kurulu olduğu doğrulandı ve kalıcı config değişikliği yapılmadan yalnız build sürecinin PATH’i düzeltildi.
- İlk Docker context **741,10 MB** seviyesine çıktığı için build durduruldu. Kök neden `.worktrees`, `.wrongstack`, `.temp_files` ve QA/rapor artifact’lerinin context’e girmesiydi. `.dockerignore` allowlist yaklaşımıyla context son build’de **1,50 MB** oldu.
- Yerel aday image başarıyla üretildi: ID `sha256:40f2fcb09568f644b8c0a3c564a473149cc799b36771467d70d816d329167083`, boyut **90.625.544 byte**, runtime kullanıcı `node`. Container içindeki `server/index.mjs` syntax kontrolü başarılı.
- Image build içindeki Vite üretim derlemesi **6.773 modül** geçti; çalışma ağacındaki tam Nexus testleri **372/372** başarılı.
- `npm ci` çıktısı **2 dependency vulnerability** bildirdi: **1 moderate, 1 high**. Otomatik `npm audit fix` çalıştırılmadı; etki ve yükseltme kararı ayrı dependency güvenlik task’ıdır.
- Bu image yalnız yerel candidate kanıtıdır. CPM bağlantılı uygulama container’ı çalıştırılmadı; authenticated readiness, CPM read-only ve finansal parity kanıtları hâlâ üretilmedi. Servera upload/deploy/cutover ve CPM yazımı yapılmadı; release **NO-GO**.

## 2026-09-01 izole candidate runtime ve health auth düzeltmesi

- İlk izole candidate smoke testinde `/api/health` beklenmedik şekilde **401** döndü. Kök neden, health istisnasının yalnız ikinci capability middleware’inde bulunması; ilk authentication middleware’inin health’i korumaya devam etmesiydi.
- `server/index.mjs` health istisnasını ilk auth katmanına taşıdı; regresyon testi `server/task6RoleIsolation.test.mjs` anonim health beklentisini **200** olarak sabitledi.
- Dockerfile ve Compose release metadata argümanlarını/ortam alanlarını taşıyacak şekilde güncellendi: build ID, build version, source commit ve runtime image digest. Compose sözleşmesi `docker compose config --quiet` ile geçerli bulundu.
- Güncel local candidate image build edildi; build context **10,87 KB**, Vite üretim derlemesi **6.773 modül**.
- İzole runtime smoke sonucu: `/api/health` **200**; login **200**; anonim `/api/build-info` **401**; authenticated `/api/build-info` **200** ve build metadata/digest görünür; readiness **200 / ready=false**.
- Readiness’te kalan blocker’lar yalnız `cpm-not-connected` ve `inventory-source-not-verified` oldu. Build kimliği, image digest’i ve runtime read-only kanıtı artık eksik değil.
- Full Nexus test suite **373/373** ve production build **6.773 modül** başarılı. Geçici candidate container durduruldu; server upload/deploy/cutover ve CPM yazımı yapılmadı. Release **NO-GO** olmaya devam ediyor.

## 2026-09-01 güncel attributionStatus candidate doğrulaması

- Güncel `server/ledgerApi.mjs` değişikliğiyle aday image yeniden üretildi: `marlin-nexus-candidate:nexus-local-20260901-status`.
- Image digest: `sha256:d5feabd222c8182645c19cda20e4fbda4c1055e5a43e1ebb9d13b750df647555`; build ID `nexus-local-20260901-status`; source commit `43d1a8c9783166a9f99d291eb12122a09195b683`.
- İzole container smoke: health **200**, login **200**, build-info **200** ve metadata doğru. Readiness **200 / ready=false**; beklenen blocker’lar izolasyon ortamında CPM bağlantısı, read-only kanıtı, inventory source ve image digest eksikliğidir.
- İzole candidate container durduruldu ve kaldırıldı. Sunucu Docker’ına image upload/cutover yapılmadı; CPM’e yazılmadı.

## 2026-09-01 release aktarım önkoşulu doğrulaması

- Yerel pinned SSH kaydı bulundu: `192.168.12.11` ED25519 fingerprint `SHA256:eJqd6jPjoZ8A6wlCJbAKiRwKVBviGP+yskdUTrW9hq4`.
- Sunucu `/` kapasitesi: **38.095.777.792 byte**, boş **5.060.628.480 byte**, kullanım **%87**. Güncel aday image boyutu **90.626.702 byte**; salt kapasite açısından aday image + mevcut rollback image için alan yeterli görünür, ancak release manifestindeki zorunlu reserve değeri henüz tanımlı değildir.
- Aktif server image: `sha256:89755523ac69f7e76d1cd58ea1ae19d1f090f649f643e66d503ecf16843fe197`; mevcut rollback image: `sha256:9c438f56ddb3c73ddaada9eb5c25de5063b8cf49de3bc8f4be861f0c1df526c2`.
- Yerel çalışma alanında immutable release manifesti, artifact SHA-256/transfer paketi, pinned known-hosts dosyasının release’e bağlanmış kopyası ve rollback manifesti bulunmadı. Bu nedenle güvenli aktarım preflight’ı **BLOCKED**; servera upload veya cutover başlatılmadı.

## 2026-09-01 candidate artifact ve manifest üretimi

- Allowlist tabanlı artifact üretildi: `C:\Users\furkan.cakir\Documents\Marlin Nexus Releases\nexus-local-20260901-status.tar.gz`, boyut **377.342 byte**, SHA-256 `1178ecfa99bd202074d9306a4139ccf73f444c9ce52ba275968681d2a342015d`.
- Archive üyeleri `Dockerfile`, `compose.yaml`, `package*.json`, `server`, `shared`, `src` ve mevcut `public/reports` allowlist’iyle sınırlı kaldı; `data`, `secrets`, `.git`, `node_modules` ve diğer yasak kökler dahil edilmedi.
- Candidate manifest validator sonucu: `tls-ca-invalid`, `rollback-manifest-missing`, `rollback-artifact-digest-missing`. Bunlar gerçek eksik kanıtlardır; TLS CA yolu ve önceki release artifact hash’i bilinmeden manifest geçerli kabul edilmedi.
- Artifact yerel olarak oluşturuldu ve doğrulandı; servera upload, image import, container değişikliği ve CPM yazımı yapılmadı.

## 2026-09-01 TLS CA ve rollback kanıtı incelemesi

- Server Caddy gerçekten `/home/serviceproadmin/.marlin-nexus-pki/server.crt` ve karşılık gelen private key ile TLS sunuyor; sertifikanın issuer’ı `Marlin Nexus Internal Root CA`.
- Doğru kök CA `/home/serviceproadmin/.marlin-nexus-pki/root-ca.crt`; `openssl verify -CAfile root-ca.crt server.crt` sonucu **OK**. Kök CA SHA-256: `685db8842a6beb364d82f502a676c487585a5a76fea035d4293346a244edf108`.
- `/home/serviceproadmin/apps/marlin-profit-sharing/secrets/nexus-erp-ca.crt` farklı bir sertifikadır (`Marlin Nexus ERP Private CA`); Nexus HTTPS için CA olarak kullanılamaz. Bu ayrım, önceki `tls-ca-invalid` blocker’ını somutlaştırır.
- Serverda eski release arşivleri ve `source-release-20260811-223201-inventory-planning.tgz.sha256` sidecar’ı bulunuyor; sidecar kendi arşiviyle eşleşiyor. Ancak bu arşivin aktif production release veya mevcut rollback image’ına bağlı olduğu kanıtlanmadı; rollback manifesti hâlâ eksik.
- Sonuç: Doğru CA yolu artık server tarafında kanıtlandı, fakat yerel transfer manifestine güvenli biçimde bağlanmış CA kopyası ve rollback release/artifact ilişkisi olmadan **upload/cutover BLOCKED** kalır.

## 2026-09-01 canlı imageDigest metadata tutarsızlığı

- Canlı container environment’ında `NEXUS_IMAGE_DIGEST=sha256:a5a7a0eb6c90f2acdbace109b0d8aee2d109c81f161523806a7d659ed5aeb4ab` bulunuyor; aynı SHA-256 serverdaki `release-20260831-112850.tar.gz` artifact’ine ait.
- Docker daemon’ın çalışan image kimliği ise `sha256:89755523ac69f7e76d1cd58ea1ae19d1f090f649f643e66d503ecf16843fe197`; repo digest de aynı `897555...` değeridir.
- Bu nedenle canlı `/api/build-info` içindeki `imageDigest` gerçek çalışan Docker image digest’i değil, artifact hash’i taşıyor. Metadata adı ve değeri ayrıştırılmadığı için release kimliği doğrulaması yanlış pozitif üretebilir.
- Öncelik: **Yüksek**. `artifactSha256` ile gerçek `imageDigest` ayrı alanlar olarak bağlanmalı; deploy/preflight gerçek Docker image ID/repo digest’ini endpoint metadata’sıyla birebir karşılaştırmadan geçmemelidir. Bu kanıt nedeniyle upload/cutover yapılmadı.

## 2026-09-01 image/artifact metadata düzeltmesi

- `server/releaseContract.mjs` artık `NEXUS_ARTIFACT_SHA256` değerini ayrı `artifactSha256` alanında yayımlıyor; `imageDigest` yalnız `NEXUS_IMAGE_DIGEST` / `IMAGE_DIGEST` alanından okunuyor.
- `compose.yaml` artifact SHA için ayrı `NEXUS_ARTIFACT_SHA256` runtime alanını taşıyor; mevcut `NEXUS_IMAGE_DIGEST` alanı gerçek Docker image digest’i olarak kalıyor.
- TDD kanıtı: release contract odaklı test **3/3**, tam Nexus suite **374/374**, production build **6.773 modül** başarılı.
- Güncel candidate image yeniden üretildi: `marlin-nexus-candidate:nexus-local-20260901-digestfix`, digest `sha256:371b7e6d6fb189c0c98dc85cdb1363f6e1ec92e420a00b5593a9283552c97550`.
- Bu düzeltme yalnızca lokal source/aday image seviyesindedir. Canlı container’a deploy edilmedi; canlı metadata hatası production’da düzeltilmiş kabul edilmemelidir.
- Image ile aynı güncel source’dan artifact yeniden üretildi: `C:\Users\furkan.cakir\Documents\Marlin Nexus Releases\nexus-local-20260901-digestfix.tar.gz`; SHA-256 `976b10f6a4030c7bd74ce036a42cb0286c5c76d0b13ac4e98a462ce120f10a7c`.

## 2026-09-01 server Docker ve canlı CPM read-only kanıtı

- Production server Docker envanteri salt-okunur incelendi: `marlin-profit-sharing` yaklaşık 13 saattir ayakta; toplam **10/10** container çalışır durumda. Mevcut release ve rollback image etiketleri korunuyor.
- `marlin-profit-sharing` mount incelemesi: `/app/data` `rw=true`; CPM credential ve Nexus users secret mount’ları `rw=false`. Bu turda hiçbir mount’a yazılmadı.
- Server içindeki authenticated Nexus smoke: login **200**; `/api/health` **200**, `connected=true`, `database=Marlin_Uyg`, `readOnly=true`; `/api/build-info` **200** ve canlı build `nexus-20260831-230128`, commit `4db39d8f38fc7bd87704520fd51db1170ee2cc02`, image digest `sha256:a5a7a0eb6c90f2acdbace109b0d8aee2d109c81f161523806a7d659ed5aeb4ab`.
- Aynı canlı oturumda `/api/readiness?year=2026` **503** döndü. Blocker’lar: `official-cost-coverage-insufficient` ve `inventory-opening-evidence-ambiguous`; inventory source verified görünse de resmi maliyet kapsamı ve açılış kanıtı release’i açmaya yetmiyor.
- Canlı `/api/reconciliation/invoices?year=2026` son snapshot’ında CPM kaynak ve Nexus ekonomik kapsamı birebir dengeli: kaynak net **226.296.007,46 TL**, Nexus net **226.296.007,46 TL**, fark yaklaşık **0,000001 TL**; gross/return/discount farkları da kayan nokta seviyesinde.
- Aynı snapshot’ta ledger neti **226.913.134,80 TL**, kapsam dışı net **617.127,34 TL**, kapsam dışı **79 satır** ve kodlar `KOMISYON`, `GD-0187`, `GD-0079`, `PDI`. Bu tutar Nexus ekonomik toplamından bilinçli olarak dışlanıyor; kapsam kararının yönetim tarafından onaylanması gerekir.
- İlk department-analysis çağrısı geçici bağlantı hatası verdi; aynı canlı oturumda tekrarlandığında başarılı oldu. Bu nedenle kişi/departman kanıtı artık endpoint düzeyinde mevcut, ancak maliyet ve açılış kanıtı blocker’ları nedeniyle mevcut release **NO-GO**.

## 2026-09-01 canlı kişi bazlı satış kanıtı

- Department-analysis canlı endpoint’i ikinci denemede `status=200`, `mode=live`, ledger version `2026:1788254333589:18` döndürdü. Departman net satışları: Servis **111.614.981,38 TL**, Yedek Parça Satış **114.434.147,58 TL**, İnceleme Gerekli **246.878,50 TL**.
- Maliyet kapsamı: Servis **%46,20** (4.717/10.211 satır), Yedek Parça Satış **%32,86** (3.820/11.624), İnceleme Gerekli **%14,29** (2/14). Bu düşük kapsama, readiness maliyet blocker’ının sayısal kanıtıdır.
- Aynı CPM kaynaklı ledger’ın audit satırlarıyla üç kişi kontrol edildi:

| Kişi | Nexus ownerTotals | Audit ham owner toplamı | Fark | Farkın kanıtlanan nedeni |
|---|---:|---:|---:|---|
| Mehmet Kara | 52.688.508,63 TL | 53.012.168,75 TL | 323.660,12 TL | Ham audit toplamı `signedNetSales` değeridir; fark, audit `verificationStatus` alanı ile Nexus'un `attributionStatus` kapsamının aynı olmamasından kaynaklanır. Aynı statü sözleşmesiyle yeniden karşılaştırılmalıdır. |
| Furkan Çakır | 36.937.822,52 TL | 36.958.938,90 TL | 21.116,38 TL | Ham audit toplamı `signedNetSales` değeridir; fark, audit `verificationStatus` alanı ile Nexus'un `attributionStatus` kapsamının aynı olmamasından kaynaklanır. Aynı statü sözleşmesiyle yeniden karşılaştırılmalıdır. |
| Burak Çetinel | 19.306.317,79 TL | 19.306.317,79 TL | 0,00 TL | Fark yok |

- Kaynak kod ve canlı kalite çıktısı owner toplamı kapsamını açıkça tanımlıyor: `attributionStatus !== review`, `batchRisk=false` ve `commercialOwner` dolu satırlar. Canlı kalite çıktısı 207.848.422,02 TL atanmış, 18.447.585,44 TL inceleme kapsamı dışında bırakılmış gösteriyor. Audit export ise ayrı bir `verificationStatus` alanı yayımlıyor (`verified`, `configured`, `review`, `excluded`); bu alanlar birebir eşlenmediği için ham audit toplamını ownerTotals ile doğrudan karşılaştırmak geçerli bir doğrulama değildir. Bu iki statü sözleşmesi tek bir kanonik alanda birleştirilmeden kişi bazlı performans toplamı kesin kabul edilmemelidir.
- Bu karşılaştırma aynı server CPM ledger’ından üretilen audit ve department görünümlerinin parity kontrolüdür; bağımsız bir CPM export’u değildir. Bağımsız CPM export/DB satır karşılaştırması ayrıca yapılmadıkça kişi toplamları finansal nihai kanıt sayılmamalıdır.

## Önerilen sıradaki işlem

Deploy yardımcı akışı güvenli hale getirilmelidir: kimlik bilgileri dosyadan/etkileşimli güvenli kanaldan okunmalı, host key sabitlenmeli, TLS doğrulaması açık kalmalı, hedef/build/readiness/prewarm ve authenticated read-only smoke kapıları zorunlu hale getirilmeli, başarısızlıkta rollback davranışı tanımlanmalıdır. Bu düzeltme tamamlanmadan mevcut script çalıştırılmamalıdır.

## 2026-09-01 aktif release arşivi ve rollback bağının doğrulanması

- Rollback kaynak arşivinin sidecar checksum kanıtı geçerli: `source-pre-task15-20260828-121020.tgz.sha256` içeriğindeki SHA-256 ile arşivin canlı hesaplanan SHA-256 değeri `8a2cade6e8b6d1df3ef1760ee42fb28d11df6587177508e8fef2ffba08950665` olarak birebir eşleşti.
- Aktif production image içindeki `package.json` ve `server/index.mjs` dosyalarının hash’leri, serverdaki `release-20260831-112850.tar.gz` arşivinden çıkarılan aynı dosyalarla birebir eşleşti. Bu, arşiv ile çalışan imaj arasında kısmi içerik kanıtıdır.
- Aynı aktif imajda yeni `server/releaseContract.mjs` dosyası bulunmuyor; dolayısıyla lokal `artifactSha256`/gerçek `imageDigest` ayrıştırması canlıya taşınmış değil.
- Aktif ve rollback Docker image label’larında yalnız Compose yönetim label’ları var; source release hash’i, artifact SHA-256, build commit’i veya rollback manifest ilişkisini doğrulayan özel label yok.
- Sonuç: aktif arşiv için kısmi dosya eşleşmesi ve rollback arşivi için geçerli checksum var; ancak immutable release manifesti ve image/artifact/rollback zinciri kurulmadığından release kimliği tam doğrulanmış sayılamaz. Upload/cutover yine **BLOCKED** ve production **NO-GO**.

## 2026-09-01 eski operasyon yardımcıları güvenlik temizliği

- RED testi, kökteki eski `deploy.py`, `deploy_check.py` ve `schema_probe9.cjs`–`schema_probe21.cjs` dosyalarında sabit CPM/SSH kimlik bilgisi, TLS doğrulama bypass'ı ve geçici cookie kullanımını kanıtladı; test değerleri veya sırlar rapora taşınmadı.
- Bu dosyalar production release kapsamındaki gerekli uygulama kaynakları değildir ve güvenli `release_runner.py`/manifest doğrulama akışını kullanmıyordu. Secret taşıyan eski yardımcılar kaldırıldı; yerine credential veya cookie kopyalanmadı.
- GREEN kanıtı: `server/task5Security.test.mjs` **5/5** geçti. Tarayıcı yalnız scoped helper listesinde çalıştırıldı; geçici çalışma klasörleri ve CPM verisi taranmadı/değiştirilmedi.
- CPM bağlantı hesabının efektif SELECT-only yetkisi hâlâ canlı kanıtla doğrulanmış değildir; bu nedenle least-privilege release blocker'ı kapanmış sayılmaz. Production deploy/cutover **NO-GO** olmaya devam ediyor.

## 2026-09-01 Task 5 güvenlik kapısı doğrulaması

- Güvenlik temizliği sonrası odaklı Task 5 testi **5/5**, tam Nexus test suite **375/375** geçti.
- Kapatılan kapsam: eski sabit credential/TLS bypass yardımcıları kaldırıldı; yeni güvenli release runner ve manifest doğrulaması kullanılmadan production operasyonu yapılamayacak duruma getirildi.
- Açık kapsam: canlı CPM bağlantısının efektif principal ve SELECT-only izin kanıtı bu task içinde değiştirilemez; mevcut canlı kanıt `sa`/yazılabilir yetki sınırının yönetim ve altyapı tarafında düzeltilmesini gerektirir. Bu nedenle least-privilege blocker'ı **blocked**, genel release **NO-GO**.
- Bu taskta server Docker, production container, CPM verisi ve CPM şeması değiştirilmedi. Kaldırılan dosyalar eski untracked operasyon yardımcılarıydı; yeni credential veya cookie dosyası oluşturulmadı.

## 2026-09-01 canlı CPM Denetim UI smoke ve overflow düzeltmesi

- Authenticated canlı UI’da `CPM Denetim` ekranı açıldı; kritik ilk görünüm kolonları `Satış net KDV hariç`, `Satır maliyeti KDV hariç`, `Brüt kâr KDV hariç` ve `Doğrulama` DOM’da görünür bulundu.
- Canlı tarayıcı ölçümü: viewport **1280×720**, document genişliği **1265/1265**; ancak `.panel.audit-workspace` **1033/1082** ve `.audit-filters` **1033/1082** client/scroll genişliğiyle yatay overflow üretiyordu. Console warning/error gözlenmedi.
- Lokal düzeltme: `.audit-filters` grid kolonları `minmax(0,2fr) repeat(6,minmax(0,1fr)) auto` ve `min-width:0` sözleşmesine taşındı; ekonomik tablo için mevcut yatay scroll/sağ kritik kolon davranışı korunuyor.
- TDD kanıtı: UI contract RED aşamasında overflow sözleşmesi eksikliği yakalandı; GREEN sonrası `server/uiContract.test.mjs` **11/11**, tam test suite **375/375**, production build **6.773 modül** başarılı.
- Düzeltme yalnız lokal çalışma ağacındadır; canlı container’a deploy/cutover yapılmadı. Canlı dar viewport ölçümü için browser viewport override capability mevcut olmadığından 390/768 piksel canlı ekran kanıtı bu turda alınamadı.

## 2026-09-01 canlı finansal ekranlar arası parity bulgusu

- Authenticated canlı smoke sırasında aynı yıl/şirket bağlamında ekranlar arasında gözle görülür EUR toplam farkı bulundu: Yönetici Özeti **€1.007.869**, Satış ve Kârlılık **€1.007.869**, Departman Analizi **€1.969.696**.
- Departman ekranı aynı anda `Esas brüt kâr €862.976` ve `Net marj %0,0` gösterdi. `862.976 / 1.969.696` yaklaşık **%43,8** olduğundan `%0,0` değeri kanıtlanmış bir UI/data parity hatasıdır.
- Kaynak incelemesi, Departman API decorator’ının kanonik EUR değerini `eurEquivalent` alanına taşımasına rağmen `eurMargin` alanını eski metric değerinde bırakabildiğini gösterdi. Lokal düzeltme `eurMargin: canonicalMetric.eurMargin` aktarımını ekledi; RED→GREEN odak test kanıtı **18/18**.
- EUR net satıştaki **€961.827** farkın kök nedeni bu turda kesinleştirilmedi. Olası dönem/kapsam/kur farklarından biri varsayılmadı; canlı endpoint payload’larının aynı ledger snapshot ve aynı rate-set ile ham alan seviyesinde karşılaştırılması gerekiyor.
- Console warning/error üretilmedi. Düzeltme production’a deploy edilmedi; parity farkı ve canlı deployment doğrulaması açık blocker olarak kaldı.

## 2026-09-01 canlı CPM efektif yetki kanıtı

- Aktif Nexus container içinden, mevcut CPM bağlantı parametreleri kullanılarak yalnızca tek bir metadata `SELECT` sorgusu çalıştırıldı; DDL/DML veya kalıcı veri değişikliği yapılmadı.
- Sonuç: `principal=sa`, `original_login=sa`, `database_name=Marlin_Uyg`, `is_sysadmin=1`, `is_db_owner=1`.
- Veritabanı izinleri: `SELECT=1`, `INSERT=1`, `UPDATE=1`, `DELETE=1`, `ALTER=1`, `EXECUTE=1`. Bu, uygulamanın `readOnlyIntent=true` ayarından bağımsız olarak efektif bağlantı hesabının yazılabilir ve yönetici seviyesinde olduğunu kanıtlar.
- Sonuç: CPM sorgu koruması ve uygulama niyeti salt-okunur olsa da altyapı hesabı least-privilege değildir. Ayrı SELECT-only CPM hesabı, credential rotasyonu ve yeniden doğrulama yapılmadan bu blocker kapatılamaz; production **NO-GO**.

## 2026-09-01 yönetim kararı: CPM `sa` yetki istisnası

- Yönetim, CPM `sa` hesabının `SELECT` dışı yetkilerinin bulunmasını bu proje için kabul edilen bir altyapı riski olarak onayladı. Bu nedenle `least-privilege` eksikliği artık bu çalışmanın release blocker'ı olarak kullanılmayacaktır.
- Bu karar, Nexus'un CPM'e yazma yetkisini kullanmasına izin vermez. Uygulama sınırı değişmeden korunur: yalnız allowlist'teki salt-okunur sorgular/API okumaları, `readOnly=true` sözleşmesi, lokal geçici tablo sınırı ve CPM mutation guard'ları geçerlidir. Yeni kod aynı read-only sınırına uymak zorundadır.
- Önceki `principal=sa`, `is_sysadmin=1`, `is_db_owner=1`, `INSERT/UPDATE/DELETE/ALTER/EXECUTE=1` kanıtı tarihsel teknik bulgu olarak saklanmıştır; yönetim kararı bunu ortadan kaldırmaz, yalnızca kabul edilmiş risk olarak yeniden sınıflandırır.
- Genel production durumu yine **NO-GO**'dur; kalan bağımsız blocker'lar resmi maliyet kapsamının yetersizliği, açılış stok kanıtının belirsizliği ve canlı release/image parity doğrulamasının henüz tamamlanmamış olmasıdır.

## 2026-09-01 ham EUR parity kök nedeni

- Aynı authenticated server oturumunda `/api/overview?year=2026` ve `/api/department-analysis?year=2026` çağrıları aynı `ledgerVersion=2026:1788257427366:19`, aynı `generatedAt=2026-09-01T10:10:27.366Z`, aynı yıl ve `readOnly=true` metadata'sı ile döndü. TRY kapsamı da aynı ekonomik ledger'ı gösteriyor: department `totals.netSales=226.297.327,08 TL`; reconciliation kapsamındaki bağımsız ekonomik net `226.296.007,46 TL` (79 kapsam dışı satırın farkı ayrıca korunuyor).
- Buna rağmen ham endpoint EUR net satışları farklıdır: Overview satırlarının aylık EUR toplamı **1.007.869,464867 EUR**; Department `totals.eurEquivalent.netSales` **1.969.695,992055 EUR**; fark **961.826,527188 EUR** (**%95,43**).
- Canlı container kodu salt-okunur incelendiğinde farkın nedeni doğrulandı: Overview `decorateOverviewRowsEur` içinde her ayın `byCurrency` sepetini o aya çözülen kur setiyle (`resolveMonthRateSet`) çeviriyor; Department `decorateMetricEur` ise `analysis.totals` için `month=null` olduğundan tek bir `buildRateSet(rateIndex, reportDate)` ile tüm toplam sepetini rapor gününün kuruyla çeviriyor. Bu iki farklı zaman bazlı kur yöntemi, aynı TRY ledger için farklı EUR toplamı üretmektedir.
- Bu nedenle fark; aynı snapshot içinde eksik/mükerrer fatura olduğuna dair kanıt değildir, fakat ekranlar arası EUR KPI sözleşmesi tutarsızdır ve yönetici raporlamasında kritik güven sorunu yaratır. Farkın bireysel faturaları, canlı API'nin `canonicalMetric`/satır bazlı kur kanıtını expose etmemesi nedeniyle bu endpoint sözleşmesi üzerinden tek tek listelenemedi; kök neden kaynak kod seviyesinde kesin olarak kanıtlandı.
- Lokal aday kaynakta Department toplamı da dönem anahtarlarına göre canonical `aggregateFinancialMetric` ile hesaplanacak şekilde düzeltildi; bu değişiklik production'a taşınmadı. Canlı düzeltme sonrası aynı snapshot ile Overview ve Department toplamları için hem TRY hem EUR parity testi zorunludur.

## 2026-09-01 lokal parity düzeltmesi doğrulaması

- Parity ve ilgili ledger testleri yeniden çalıştırıldı: `server/task2FinancialConsumers.test.mjs` + `server/ledgerService.test.mjs` **51/51** geçti.
- Tam Nexus test suite **376/376** geçti.
- Production build `vite build` **6.773 modül** ile başarılı tamamlandı.
- Bu doğrulama yalnız çalışma ağacındaki aday source içindir; canlı container yeniden başlatılmadı, image upload/cutover yapılmadı. Canlı EUR parity kanıtı, düzeltme deploy edilip authenticated endpoint smoke tekrarlandıktan sonra yeniden alınmalıdır.

## 2026-09-01 candidate readiness sözleşmesi düzeltmesi

- Sol danışmanlığı ve Luna'nın kaynak doğrulaması sonucunda `release_runner.py` içindeki kök neden belirlendi: aday doğrulaması `readiness=true` şartını finansal hazır olma ile teknik aday çalışırlığını ayırmadan uyguluyordu. Bilinen finansal blocker'lar adayın teknik smoke testini gereksiz yere reddediyordu.
- Runner artık `expected.allowed_readiness_blockers` ile açıkça izin verilen finansal blocker listesini alır. Readiness başarısız olsa bile yalnızca bu listedeki blocker'lar gözleniyorsa aday teknik olarak geçebilir; bilinmeyen blocker, boş blocker listesi veya eksik kanıt fail-closed biçimde `candidate-readiness-failed` üretir.
- RED→GREEN kanıtı: yeni regression testi önce beklenen `candidate-readiness-failed` hatasıyla kırıldı, minimal düzeltme sonrası geçti. Python runner suite **10/10**, `py_compile`, JavaScript suite **376/376** ve production build **6.773 modül** başarılıdır.
- Bu değişiklik readiness blocker'larını kaldırmaz ve canlı deployment yapmaz. Resmi maliyet kapsamı yetersizliği ile açılış stok kanıtı belirsizliği devam ettiği sürece finansal kullanım ve release readiness **NO-GO** kalır.
- Sonraki sıralı işler: (1) Docker-capable izole candidate üzerinde digest/auth/TLS/prewarm/read-only smoke, (2) authenticated TRY/EUR/UI parity ve canlıya kontrollü geçiş kararı, (3) bağımsız CPM source-row identity/provenance diagnostic. Release parity için yaklaşık **3 task**, tam finansal GO için resmi maliyet ve açılış kanıtı dahil yaklaşık **5 task** kalmıştır.

## 2026-09-01 readiness payload kanıt parserı ve candidate erişim blocker'ı

- `release_runner.py` içine `validate_readiness_payload` eklendi. Parser; authenticated JSON içindeki build kimliği, bağlantı kanıtı, `readOnly`, HTTP status, `ready` ve blocker kümesini birlikte doğrular.
- `ready=false` yalnız HTTP **503** ve beklenen finansal blocker kümesinin tam eşleşmesiyle kabul edilir. Bilinmeyen, eksik veya boş blocker kümesi; yanlış status; build/bağlantı/read-only uyumsuzluğu fail-closed reddedilir. Bu, finansal readiness'i `true` yapmaz.
- RED→GREEN kanıtı: yeni parser testi önce import/eksik davranış nedeniyle başarısız oldu; implementasyon sonrası parser testi ve runner suite **11/11** geçti, `py_compile` başarılıdır.
- Bu workstation'da Docker daemon/CLI bulunmadığı için `docker version` ve aday image `docker image inspect` çalıştırılamadı. Mevcut tarball'ın varlığı image daemon kimliği kanıtı değildir; izole candidate container kanıtı üretilemedi.
- Compose incelemesinde candidate için benzersiz container/project adı, ayrı loopback portu, ayrı geçici state dizini ve immutable `image@sha256` seçimi eksik/uygulanmamış görünmektedir. Bu nedenle candidate doğrulama ve canlı cutover taskı açık blocker olarak kalır.

## 2026-09-01 candidate compose override sözleşmesi

- `release_runner.py` içine `build_candidate_compose_override` eklendi. Helper yalnız yapılandırılmış bir Compose override sözlüğü üretir; Docker/Compose çalıştırmaz ve dış sisteme bağlanmaz.
- Üretilen candidate; `repository@sha256:digest`, release'ten türetilen benzersiz container adı, `127.0.0.1:<ayrı-port>:4318`, `restart=no`, ayrı `/app/data`, `:ro` CPM credential mount, `read_only`, `/tmp` tmpfs, `cap_drop=ALL` ve `no-new-privileges` alanlarını taşır.
- Production portu 4318, mutable image repository/tag, bozuk digest, relative state path ve geçersiz portlar fail-closed reddedilir. Secret içerikleri helper'a alınmaz; yalnız host path referansı kullanılır.
- TDD kanıtı: candidate override testleri RED import hatasıyla başladı, implementasyon sonrası ilgili testler **2/2**, runner suite **13/13**, JavaScript suite **376/376** geçti; Python derlemesi başarılıdır.
- Docker CLI/daemon bu workstation'da bulunmadığı için override'ın gerçek Compose merge sonucu veya candidate container davranışı doğrulanmadı. Bu nedenle candidate deployment ve canlı cutover hâlâ açık task/blocker'dır.

## 2026-09-01 server Docker salt-okunur preflight

- SSH ile `192.168.12.11` serverına bağlanıldı; yalnız salt-okunur Docker ve socket kontrolleri çalıştırıldı. Container başlatma/durdurma, Compose, pull, prune, rm veya CPM sorgusu yapılmadı.
- Docker daemon sürümü **29.3.0**. `marlin-profit-sharing` production container'ı çalışır durumda ve `sha256:89755523ac69f7e76d1cd58ea1ae19d1f090f649f643e66d503ecf16843fe197` image ID'sini kullanıyor. Rollback/candidate image olarak kullanılabilecek yerel candidate digest server image listesinde bulunmadı.
- `4318` portu `nexus-caddy` tarafından production'a publish edilmiş durumda; candidate aynı portu kullanamaz. Candidate ayrı loopback portu ve ayrı Compose/container adı kullanmalıdır.
- Server Docker disk görünümü: 21 image / 10.99 GB, 10 aktif container, **8.391 GB reclaimable** image alanı; root filesystem kullanımı **%82,5**. Bu alanlar silinmedi; aktif/rollback image koruması olmadan cleanup yapılmayacak.
- Production container mount'ları salt-okunur incelendi: `/app/data` `rw`, CPM credential `:ro`, Nexus user secret `:ro`. Candidate production state'ini paylaşamaz; ayrı state path zorunludur.
- Sonuç: server Docker adımı için daemon ve port bilgisi doğrulandı, fakat immutable candidate image aktarımı ve pinned SSH key/known-hosts ile artifact transport kanıtı yok. Bu nedenle candidate başlatma ve canlı cutover **henüz yapılmadı**.
## 2026-09-01 artifact transport manifest kapısı

- Yerel candidate artifact `nexus-local-20260901-digestfix.tar.gz` yeniden hash'lendi: **976b10f6a4030c7bd74ce036a42cb0286c5c76d0b13ac4e98a462ce120f10a7c**. Tar arşivi allowlist dışı yasak kök (`.git`, `data`, `dist`, `node_modules`, `secrets`, `tmp`) içermiyor.
- Yerel commit `43d1a8c9783166a9f99d291eb12122a09195b683`, fakat çalışma ağacı **64** değişiklik/ekleme içeriyor. Bu nedenle artifact'ın temiz immutable source snapshot'ına bağlı olduğu henüz kanıtlanamaz.
- SSH private key dosyası ve `known_hosts` mevcut. Hedef `192.168.12.11` için ED25519 fingerprint `SHA256:eJqd6jPjoZ8A6wlCJbAKiRwKVBviGP+yskdUTrW9hq4` olarak doğrulandı; key'in hedefte non-interactive release yetkisi ayrıca kanıtlanmadı.
- Previous release artifact hash'i ile aktif/rollback image ilişkisini taşıyan tam manifest zinciri mevcut kanıtlarla tamamlanamadı. Bu nedenle key-only transfer planı üretilebilir olsa da upload başlatılmadı.
- Password SSH ile aktarım yapılmayacaktır; bu, runner'ın key-only/pinned host sözleşmesini ve denetlenebilir release zincirini bozar. Transport kapısı **BLOCKED**, production **NO-GO** olarak korunuyor.

## 2026-09-01 rollback image/archive salt-okunur incelemesi

- Server'daki rollback image dar `docker inspect` formatıyla doğrulandı: image ID `sha256:9c438f56ddb3c73ddaada9eb5c25de5063b8cf49de3bc8f4be861f0c1df526c2`, tag `marlin-nexus-rollback:task15-20260828-121020-pre`, oluşturulma zamanı `2026-08-28T00:46:01+03:00`.
- Rollback image'da yalnız Docker Compose yönetim label'ları görüldü; release ID, source commit, artifact SHA veya rollback manifest bağlantısını kanıtlayan özel label bulunmadı.
- `backups/source-pre-task15-20260828-121020.tgz.sha256` sidecar'ı doğru parent dizinden çalıştırıldığında arşivi **OK** doğruladı. İlk çalıştırma relative path nedeniyle başarısız oldu; bu durum checksum komutunun çalışma dizinine bağımlılığını gösterir, arşiv bozukluğu kanıtı değildir.
- Archive bütünlüğü ve image varlığı ayrı ayrı kanıtlandı; ancak rollback image'ın bu arşivden üretildiği veya aynı previous release ID'ye ait olduğu kanıtlanmadı. Bu nedenle previous-release manifesti, rollback lineage ve transport kapısı **BLOCKED** kalır.
- İnceleme salt-okunurdu; image/archive/container/CPM üzerinde değişiklik yapılmadı.

## 2026-09-01 kaynak-artifact ve rollback manifest doğrulaması

- Candidate artifact'ın arşiv üyeleri mevcut çalışma ağacındaki aynı dosyalarla hash bazında karşılaştırıldı: **114** dosya eşleşti, **5** dosya farklı çıktı. Farklı dosyalar: `server/ledgerApi.mjs`, `server/task2FinancialConsumers.test.mjs`, `server/task5Security.test.mjs`, `server/uiContract.test.mjs`, `src/styles.css`.
- Bu sonuç, artifact SHA-256'sının geçerli olduğunu ancak tarball'ın mevcut dirty çalışma ağacının birebir artifact'ı olmadığını kanıtlar. `HEAD=43d1a8c...` yalnız repository ancestry bilgisidir; artifact'ın yalnız bu committen üretildiği söylenemez.
- Candidate image digest'i, artifact SHA'sı ve rollback source archive SHA'sı birbirinin yerine kullanılamaz. Candidate image serverda bulunmadığı için artifact→image zinciri; rollback image ile rollback archive arasında release ID/artifact bağı bulunmadığı için rollback zinciri doğrulanamadı.
- Sol danışmanlığı ve Luna doğrulaması sonucu geçerli release manifesti üretmek yerine eksik alanları açıkça gösteren **blocked evidence record** yaklaşımı korundu. Upload, cleanup, container değişikliği ve cutover yapılmadı.

## 2026-09-01 güncel çalışma ağacı artifact snapshot'ı

- Eski tarball'ın güncel tree ile 5 dosya farkı göstermesi üzerine, mevcut çalışma ağacından yeni allowlist artifact üretildi: `C:\Users\furkan.cakir\Documents\Marlin Nexus Releases\nexus-local-20260901-current-tree.tar.gz`.
- Yeni artifact: **377.690 byte**, **119** üye, archive SHA-256 `8d18de442b56bb7ad88c64bdfb68ea4122452f8f733fb4b77a9ffe8948c89bf7`.
- Artifact üyeleri ile mevcut çalışma ağacı dosya hash'leri **119/119** eşleşti; eksik veya farklı dosya yok. Sıralı member manifest SHA-256: `d3b069eb2b6b02524ed073af6e9916b0169059f03347c6308f8063209b3d45ed`.
- Packager ve runner testleri toplam **18/18** geçti; Python derlemesi başarılıdır. Bu işlem yalnızca yerel evidence snapshot'ı üretti.
- Snapshot hâlâ `sourceState=dirty-working-tree` niteliğindedir. `HEAD` ile temiz commit bağı, candidate Docker image digest'i, build identity, previous release artifact ve rollback manifest zinciri kanıtlanmadığı için bu artifact release-ready değildir; upload/cutover **BLOCKED** kalır.

## 2026-09-01 pinned SSH key yetkilendirme kontrolü

- Hedef host fingerprint'i pinned `known_hosts` ile doğrulanmış olsa da, release runner ile aynı seçenekler kullanılarak (`BatchMode=yes`, `IdentitiesOnly=yes`, `StrictHostKeyChecking=yes`, explicit key ve known-hosts) yapılan zararsız non-interactive SSH `true` testi **exit code 255** ile `Permission denied (publickey,password)` döndü.
- Sonuç: host kimliği doğrulanmıştır; fakat `serviceproadmin` hesabı için kullanılan public key'in hedefte yetkili olduğu kanıtlanmamıştır. Daha önce interaktif password SSH ile bağlantı kurulabilmesi key-only release kanalının geçtiği anlamına gelmez.
- Password fallback kullanılmayacaktır. Yetkili server yöneticisinin public key'i hedef hesabın `authorized_keys` dosyasına eklemesi, sahiplik/izinleri doğrulaması ve aynı pinned BatchMode testinin exit code 0 ile tekrarlanması gerekir.
- Bu bir repo kodu blocker'ı değil, yetkili dış sistem yapılandırmasıdır. Artifact üretimi ve yerel kanıt korunmuştur; upload, candidate başlatma, cleanup ve cutover yapılmadı.

## 2026-09-01 yerel candidate runtime kontrolü

- Yerel Windows oturumunda `docker` komutu PATH üzerinde bulunamadı; Docker Desktop servisi ve bilinen Docker binary yolları da mevcut değildi. Bu nedenle candidate container başlatılamadı ve runtime/readiness sonucu üretilmedi.
- Salt-okunur statik release kontrolleri çalıştırıldı: `release_runner_test.py` **13/13**, `release_artifact_test.py` **5/5** başarılı.
- Bu sonuç candidate image'ın çalıştığını veya finansal readiness'i kanıtlamaz. Server'a upload/candidate başlatma/cutover, key-only SSH yetkisi çözülmeden yapılmadı.

## 2026-09-01 CPM test lab erişilebilirlik kontrolü

- `C:\Users\furkan.cakir\Documents\Marlin Test Lab\STATUS.md` mevcut ve son güncellemesi **2026-07-20 11:15 Europe/Istanbul**. İçeriği VM/SQL 2016 lab kurulumunun o tarihte tamamlandığını gösteren tarihsel kanıttır; bugünkü çalışma durumunu kanıtlamaz.
- Güncel salt-okunur host kontrolünde `Test-NetConnection 172.29.216.2 -Port 15976` için ping ve TCP bağlantısı başarısız oldu.
- `Get-VM -Name Marlin-SQL2016-Lab` çağrısı Windows Hyper-V yetkisi nedeniyle reddedildi: mevcut oturumda VM state okunamadı.
- Sonuç: izole CPM lab snapshot/provenance probe'u **BLOCKED**. Bu durum production değişikliği, `ALTER DATABASE`, CPM yazımı veya password SSH kullanımıyla aşılmayacaktır. Gerekli sonraki kanıt, host yöneticisinin VM state/endpoint erişimini sağlaması ve `Marlin_Uyg_TEST` üzerinde yetkili salt-okunur metadata erişimidir.

## 2026-09-01 canlı authenticated EUR parity tekrar kontrolü

- Canlı Nexus authenticated browser oturumu ile 2026 seçili şirket/yıl bağlamında Yönetici Özeti, Satış ve Kârlılık ve Departman Analizi ekranları salt-okunur incelendi. CPM bağlantı durumu etkin, ekran build'i `v2.4.0` olarak göründü.
- Yönetici Özeti EUR net satış: **€1.007.898**. Satış ve Kârlılık ekranında aynı toplam ve aynı EUR bağlamı görüldü.
- Departman Analizi toplam EUR net satış: **€1.969.724**; esas brüt kâr: **€862.985**; üst kart net marjı: **%0,0**. Alt karşılaştırma satırlarında Servis **€1.338.698 / €680.738 / %50,9**, Yedek Parça Satış **€629.505 / €182.068 / %28,9**, İnceleme **€1.522 / €179 / %11,7** gösterildi.
- Yönetici Özeti ile Departman Analizi arasındaki canlı EUR net satış farkı yaklaşık **€961.826** seviyesinde yeniden gözlendi. Bu, mevcut canlı image/build'in local period-aware canonical metric düzeltmesini taşımadığını destekler; production deploy/cutover yapılmadı.
- Departman ekranına ilk geçişte yaklaşık 1,2 saniyelik ara durumda “Bağlantı bekleniyor”, “Gerçek departman rakamları henüz okunamıyor” ve sıfır kartları göründü; yaklaşık 4 saniye sonra canlı değerler geldi. Bu geçici loading state kalıcı veri kaybı olarak sınıflandırılmadı, ancak authenticated smoke sırasında bekleme/ara durum kanıtı olarak kaydedildi.
- Sonuç: authenticated live UI parity **FAIL/BLOCKED**. TRY/EUR ekranlar arası parity ve canlı build alignment doğrulanmadan release/cutover yapılmayacaktır.

## 2026-09-01 server Docker candidate inventory kontrolü

- Sunucu Docker daemon’una salt-okunur SSH oturumu ile erişildi. Çalışan Nexus container’ı `marlin-profit-sharing-marlin-profit-sharing` image’ını kullanıyor; image ID `sha256:89755523ac69f7e76d1cd58ea1ae19d1f090f649f643e66d503ecf16843fe197`, build metadata `nexus-20260831-230128`, source commit `4db39d8f38fc7bd87704520fd51db1170ee2cc02` olarak doğrulandı.
- Container durumu `running`, Docker healthcheck tanımı yok (`HEALTH=none`). Son loglarda CPM health ve final-invoice read-only sorguları başarılı; bu log kanıtı UI parity veya resmi finansal readiness kanıtı değildir.
- Nexus image listesinde çalışan image dışında eski release/rollback image’ları bulundu; mevcut local çalışma ağacının yeni candidate image digest’i listede yok. Bu nedenle local düzeltmelerin server Docker’a taşındığı kanıtlanamadı.
- Salt-okunur inceleme sırasında container, image, volume, network, CPM ve host dosyalarında değişiklik yapılmadı. Candidate upload/start/recreate/cutover **BLOCKED**; pinned key-only transport ve immutable candidate manifest zinciri tamamlanmadan password SSH release taşıması yapılmayacaktır.

## 2026-09-01 son UI düzeltmesi candidate artifact doğrulaması

- Son CPM Audit sticky-cost düzeltmesini içeren local allowlist artifact üretildi: `C:\Users\furkan.cakir\Documents\Marlin Nexus Releases\nexus-local-20260901-audit-sticky-cost.tar.gz`.
- Archive **119** üyeden oluşuyor; archive içindeki dosyaların çalışma ağacı hash karşılaştırması **119/119** eşleşti; yasaklı kök veya symlink **0** bulundu.
- Artifact SHA-256: `6af838349df2fe1611de2b4e839f65559bfe2538518eec41cb966ecd304cf655`.
- Bu yalnızca kaynak artifact bütünlüğü kanıtıdır. Image digest’i, temiz commit ilişkisi, server upload doğrulaması, candidate runtime/readiness veya canlı UI parity kanıtlamaz. Artifact `sourceState=dirty-working-tree` olduğu için release-ready kabul edilmedi; servera aktarılmadı.

## 2026-09-01 server Docker kapasite preflight kontrolü

- Server root filesystem salt-okunur kontrolünde toplam **40.895.807.488 byte**, kullanılan **33.725.452.288 byte**, boş **5.059.993.600 byte** ve kullanım **%87** görüldü.
- Docker daemon salt-okunur metadata: Docker **29.3.0**, storage driver `overlayfs`, Docker root `/var/lib/docker`, **4 CPU**, yaklaşık **7,75 GiB** host belleği.
- `docker system df`: 21 image / 9 aktif / toplam 10,99 GB image alanı; 8,391 GB reclaimable image alanı; 10 container ve 7 volume aktif. Reclaimable image’lar silinmedi.
- Fiziksel boş alan, bilinen local artifact boyutundan büyük olsa da resmi candidate+rollback `requiredBytes/reserveBytes` değerleri immutable manifestte mevcut olmadığı için `target-capacity` kapısı otomatik kapatılmadı. Exact kapasite hesabı manifest ve candidate image doğrulamasıyla tekrarlanmalıdır.
- Bu kontrol salt-okunurdu; Docker image/container/volume/network, host dosyaları ve CPM üzerinde değişiklik yapılmadı.

## 2026-09-01 server release manifest ve Compose parity kontrolü

- Server release klasöründe çeşitli tarihli release/rollback arşivleri ve checksum sidecar’ları bulundu; immutable release manifest dosyası bulunamadı.
- Server aktif `compose.yaml` SHA-256: `6e20b326f1126938297ebc802e9bdd80f2b114c60e55d90740a18aaf4d07e14c`.
- Current local `compose.yaml` SHA-256: `D4414F0D8E0DD08198188492FA2986C91E10A0D1BC0552F86B21D37621D7AD49`.
- Hash farkı, serverdaki aktif compose dosyasının current local candidate compose sözleşmesiyle aynı olmadığını kanıtlar; bu durum tek başına dosyanın hatalı olduğunu kanıtlamaz ancak candidate preflight’taki compose parity kapısını açık bırakır.
- Server `Dockerfile` SHA-256’i de local current `Dockerfile` ile farklıdır. Manifest, candidate image digest’i ve compose hash birlikte doğrulanmadan upload/recreate/cutover yapılmayacaktır.
- İnceleme salt-okunurdu; server release arşivleri, manifestler, compose dosyaları ve Docker kaynakları değiştirilmedi.

## 2026-09-01 Docker healthcheck tasarım gap’i

- Aktif server container’ında Docker `HEALTHCHECK` tanımı yok. Kaynak `server/index.mjs` içinde `/api/health` route’u `pool.request().query("SELECT DB_NAME() AS databaseName")` çağırıyor; yani endpoint yalnız process canlılığını değil CPM bağlantısını da ölçüyor.
- Bu endpoint’i Compose healthcheck olarak periyodik çalıştırmak, her health poll’da CPM’e ek SELECT yükü ve potansiyel uzun SQL beklemeleri oluşturabilir. Bu nedenle kanıtsız biçimde `/api/health` healthcheck olarak eklenmedi.
- Ayrı bir process/liveness endpoint’i veya kontrollü healthcheck periyodu/timeout sözleşmesi tasarım kararı gerektirir. Mevcut durum release blocker’dan ayrı bir gözlemlenebilirlik gap’idir; candidate runtime doğrulamasında container running ve authenticated `/api/health` kanıtları ayrıca toplanmalıdır.

## 2026-09-01 candidate financial parity gate

- Sol read-only mimari değerlendirmesi sonrası Compose, Dockerfile ve `/api/health` değiştirilmedi. Bunun yerine `release_runner.py` içine Decimal tabanlı `validate_candidate_financial_parity` eklendi.
- Candidate verification planı, login sonrasında authenticated CA doğrulamalı `/api/overview?year=...` ve `/api/department-analysis?year=...` JSON capture adımlarını içeriyor. Satış ekranı aynı Overview backing endpoint’ini kullandığı için ayrı bir finansal hesap endpoint’i eklenmedi.
- Validator; `http_status=200`, `mode=live`, `readOnly=true`, seçili yıl, EUR, ortak ledger/scope metadata’sı, EUR net satış eşitliği (0,01 tolerans), departman brüt kâr-marj tutarlılığı ve eksik/non-numeric kanıtları fail-closed denetliyor.
- Regression kanıtı: canlıda gözlenen yaklaşık **1.007.898 EUR** ile **1.969.724 EUR** farkı ve **%0,0** aggregate marj testte reddediliyor; geçerli/yuvarlama sınırı ve eksik kapsam fixture’ları kabul kriterlerine göre test edildi.
- TDD/verification: Python runner+artifact testleri **20/20**, Python derleme başarılı, Nexus full suite **378/378**, Vite production build **6.773 modül** başarılı.
- Güncel local parity-gate artifact’ı: `C:\Users\furkan.cakir\Documents\Marlin Nexus Releases\nexus-local-20260901-financial-parity-gate.tar.gz`; **119/119** hash eşleşmesi, yasaklı üye **0**, SHA-256 `32321179b45f370b6932cdfb5f698eb1fa1811a8c82ee80a783428f7bb40b235`.
- Bu kod/gate değişikliği gerçek candidate runtime kanıtı değildir. Serverda image yok, pinned key-only transport ve immutable manifest zinciri yok; ayrıca resmi maliyet/açılış kanıtı blocker’ları korunuyor. Release/cutover **NO-GO**.

## 2026-09-01 readiness 503 capture düzeltmesi

- Candidate verification planındaki readiness/prewarm çağrıları `curl --fail` kullanıyordu. Bilinen finansal blocker’lar readiness’i beklenen HTTP 503’e düşürdüğünde bu seçenek JSON gövdesini kanıt toplamadan kesebilirdi.
- Düzeltme: yalnız readiness/prewarm capture komutları `--fail` olmadan, yine `--cacert` ve cookie ile çalışacak şekilde ayrıştırıldı. Health, login, Overview, Department ve build-info çağrıları 2xx dışını fail-closed durdurmaya devam ediyor.
- Runner contract regression sonucu: readiness komutlarında `--fail` yok, CA doğrulaması korunuyor. Python artifact+runner testleri **20/20**, `py_compile`, full Nexus suite **378/378** ve Vite build **6.773 modül** başarılı.
- Son güncel local artifact: `C:\Users\furkan.cakir\Documents\Marlin Nexus Releases\nexus-local-20260901-readiness-capture-gate.tar.gz`; **119** üye, SHA-256 `2bec3f2a6ed4d5f7bf32612ab0512fdaa05bb28eadb8785bd15e2c5fe5d084b2`.
- Bu tooling düzeltmesi gerçek candidate readiness/parity kanıtı üretmez; Docker-capable candidate runtime, immutable manifest ve pinned key-only transport olmadan release/cutover **NO-GO** kalır.

## 2026-09-01 canlı Stok Araştırması resmi maliyet/açılış kanıtı kontrolü

- Aynı authenticated canlı oturumda **Stok Araştırması** açıldı; ekran başlığı `Stok Kartı ve Hareket Defteri`, kaynak rozeti `CPM canlı · salt okunur` ve ürün listesi **86** kayıt olarak yüklendi. İlk geçişte görülen 0 kayıt yalnız yükleme ara durumuydu; yaklaşık 4,5 saniye sonra canlı liste ve tanı geldi.
- `Açılış kanıtı tanısı` bölümü `Tanı mevcut` gösteriyor; ancak sayısal kanıt dağılımı **Resmi adaya uygun: 0**, **Exact-key: 0**, **Yalnız miktar: 5**, **Çatışma: 0**, **Maliyet eksik: 0**, **Eşleşmeyen: 6.434**. Bu canlı ekran kanıtı resmi WAC açılış adayının bulunmadığını ve eşleşmeyen satır hacminin yüksek olduğunu gösterir; resmi açılış kanıtı blocker'ı kapanmış sayılamaz.
- Seçili ilk ürün `GM59333` için ürün özeti **1 hareket**, **854,24 USD** KDV hariç perakende fiyatı, **Son Döviz Birim Maliyeti: —**, **Ürün Liste Brüt Marjı: —**, **0 benzersiz fatura gözlemi** gösterdi. Aynı ürünün hareket satırı `17/PRK-38836`, miktar **−2**, birim maliyet **15.317,02 TL**, liste marjı **%48,8**, alım kanıtı `9/DNP2024000002656`, Halkbank kuru **35,04 TL** ve satır durumu **Doğrulandı** olarak göründü.
- Bu satırda belge/alış kanıtı durumu “Doğrulandı” iken döviz maliyeti `—`, ürün üst özetinde maliyet ve marj `—` kalıyor. Bu, belge doğrulaması ile finansal maliyet doğrulamasının kullanıcıya ayrıştırılmadığını; satır durum etiketinin resmi maliyetin doğrulandığı şeklinde yanlış anlaşılabileceğini gösteren bir UX/veri-sözleşmesi bulgusudur. Kaynak kodunda satır etiketi `verificationStatus`, üst özet kapsamı ise `financeV2.costStatus` üzerinden hesaplanıyor; iki sinyal aynı şeyi ifade etmiyor.
- Sonuç: canlı resmi maliyet kapsamı ve açılış kanıtı **FAIL/BLOCKED**. `official-cost-coverage-insufficient` ve `inventory-opening-evidence-ambiguous` blocker'ları korunmalıdır. Bu kontrol yalnızca GET/ekran okumasıdır; CPM veya Nexus verisinde değişiklik yapılmadı.

## 2026-09-01 stok hareketi doğrulama etiketi düzeltmesi

- Canlı denetimde görülen belge kanıtı ile finansal maliyet kapsamı karışıklığını gidermek için `InventoryResearchPage` içinde iki ayrı durum etiketi üretildi: `Belge: ...` ve `Maliyet: ...`.
- `verificationStatus=verified` artık tek başına finansal doğrulama anlamına gelmiyor. `financeV2.costStatus=covered` değilse kullanıcıya `Maliyet: İnceleme gerekli` gösteriliyor; yalnızca covered durumda `Maliyet: Kapsandı` yazıyor.
- Regression test önce beklenen nedenle kırmızıya düştü (eksik `getFinancialValidationLabel`), ardından yeşile döndü. UI sözleşmesi **12/12**, tam Nexus testleri **379/379**, Vite production build **6.773 modül** başarılı ve `git diff --check` temizdir.
- Güncel local artifact: `C:\Users\furkan.cakir\Documents\Marlin Nexus Releases\nexus-local-20260901-inventory-status-semantics.tar.gz`; **119** üye, SHA-256 `9cb327b1108f1f8f3a925e19560e8f81ed78457ad8457cb4c2a8097713eb2f77`.
- Bu düzeltme canlıya aktarılmadı; server candidate image, pinned key-only transport ve immutable manifest zinciri hâlâ eksik. CPM salt-okunur sınırı korunmuştur.

## 2026-09-01 inventory source sözleşmesi ve readiness fail-closed düzeltmesi

- Sol read-only mimari incelemesi sonrası yeni CPM SQL recordset'i eklenmedi. Mevcut dört-recordset'li final fatura sorgusu ve salt-okunur sınırı korunmuştur.
- `buildFinalInvoiceLedger` artık `inventorySource` verilmediğinde açık sözleşme döndürüyor: `status=missing`, `financialStatus=blocked`, `reviewReason=inventory-movement-source-not-collected`, `evidence.status=not-collected`.
- Fatura satırlarında maliyet kanıtı bulunması bu alanı `verified` yapmıyor. Ayrı ve doğrulanmış CPM stok hareketi/açılış kaynağı verilmeden resmi WAC kanıtı varsayılmıyor.
- Injected inventory source için savunmacı kopyalama regression testi eklendi; canonical invoice satırlarının inventory source yerine geçemediği test edildi.
- Doğrulama: ilgili testler **98/98**, tam Nexus suite **381/381**, Vite production build **6.773 modül**, SQL metni değişmedi ve CPM'ye yazma yapılmadı.
- Güncel local artifact: `C:\Users\furkan.cakir\Documents\Marlin Nexus Releases\nexus-local-20260901-inventory-source-contract.tar.gz`; **119** üye, SHA-256 `db532846adf3f76415b6243116d61ee750ca5ed4a05b4618ac99532c123c6c97`.
- Bu yalnızca sözleşme/readiness güvenlik dilimidir; canlıdaki **0 resmi aday / 5 yalnız miktar / 6.434 eşleşmeyen** açılış kanıtı blocker'ını çözmez. Candidate runtime, transport ve resmi CPM stok kanıtı hâlâ beklenmektedir.

## 2026-09-01 inventory source API sınır entegrasyon kanıtı

- Gerçek Express uygulaması, gerçek ledger router'ı ve authenticated admin fixture ile `server/task6RoleIsolation.test.mjs` içinde sınır testi eklendi.
- Inventory evidence içermeyen ledger üzerinden `/api/readiness?year=2026` `status=missing`, `financialStatus=blocked`, `reviewReason=inventory-movement-source-not-collected` sözleşmesini ve `inventory-source-not-verified` ile `official-cost-coverage-insufficient` blocker'larını korudu.
- Aynı oturumda `/api/inventory-research?year=2026` `readOnly=true`, `mode=unavailable`, `evidence.status=not-collected`, `openingEvidenceDiagnostics.status=not-available` ve `currentStock.reason=current-stock-source-not-verified` döndürdü.
- Bu test canlı CPM kanıtı değildir; Nexus fail-closed sözleşmesinin API sınırlarında kaybolmadığını kanıtlar. CPM'e yazma ve canlı deployment yapılmadı.

## 2026-09-01 sıradaki candidate runtime kapısı tekrar kontrolü

- Sol read-only danışmanlığı, release-parity zincirinde sıradaki güvenli görevi local Docker candidate runtime doğrulaması olarak sınıflandırdı. Server transport, canlı parity tekrarı ve izole CPM provenance probe'u bu adımdan önce seçilmedi.
- Salt-okunur workstation kontrolünde `Get-Command docker` sonucu **DOCKER_CLIENT_NOT_FOUND**; bilinen Docker binary yollarında dosya bulunmadı ve `com.docker.service` servisi **DOCKER_SERVICE_NOT_FOUND** döndü.
- Sonuç: local candidate image/container digest, build identity, authenticated readiness veya prewarm kanıtı bu turda üretilemedi. Task **BLOCKED (Docker runtime erişimi yok)** olarak kaldı; bu, uygulama hatası kanıtı değildir.
- Server Docker, production container/state, password SSH, canlı port ve CPM üzerinde hiçbir değişiklik yapılmadı.

## 2026-09-01 canlı authenticated finansal parity tekrar kontrolü

- Yeni authenticated in-app browser oturumunda 2026 seçili dönemiyle **Satış ve Kârlılık** ekranı `Net satışlar · EUR = €1.008.524`, `Esas Brüt Kâr · EUR = €280.611`, `Net kâr marjı = %27,8` ve `Maliyet / Kur Kapsamı = %29,8 (5.672 / 19.029)` gösterdi.
- Aynı canlı oturumda **Departman Analizi / Tümü / 2026 geneli** ekranı `Net satış · EUR = €1.970.351`, `Esas brüt kâr · EUR = €863.195`, `Net marj = %0,0` ve `Maliyet kapsamı = %39,0 (8.543 / 21.900)` gösterdi.
- Net satış farkı **€961.827**'dir (`1.970.351 - 1.008.524`); bu nedenle iki ekran aynı ekonomik kapsamı ve EUR dönüşümünü göstermemektedir. Departman kartındaki `%0,0` de kendi görünen değerleriyle aritmetik olarak uyumsuzdur: `863.195 / 1.970.351 ≈ %43,8`.
- Departman komut çubuğu aynı zamanda **“Net fark 0 TL”** gösterirken EUR net satışlar arasında fark vardır. Bu ifade, TL reconciliation ile EUR presentation parity'sini birbirine karıştıran ikinci bir kullanıcı güveni problemidir.
- Kaynak kodu mevcut çalışma ağacında `DepartmentAnalysisPage` canonical `eurEquivalent` alanını kullanıyor ve `aggregateDepartmentMetric` ile ortak EUR metric üretmeyi hedefliyor. Canlı ekranın farklı sonucu, mevcut canlı image/source parity'sinin güncel çalışma ağacından geride olduğunu güçlü biçimde gösterir; canlı root-cause düzeltmesi deploy edilmeden kesin kaynak satırı kök nedeni ilan edilmemelidir.
- Browser console'da warning/error görülmedi. Bu kontrol yalnızca GET ve ekran okumasıdır; CPM/Nexus verisi değiştirilmedi. Canlı finansal parity **FAIL/BLOCKED**, release **NO-GO** kalır.

## 2026-09-01 local API parity regression kapısı

- Sol danışmanlığıyla aynı çok aylı/çok dövizli ledger fixture'ı gerçek Express app ve gerçek ledger router üzerinden `/api/overview` ile `/api/department-analysis` uçlarına verildi.
- Fixture'da dönem kur setleri bilerek farklı seçildi; bağımsız beklenen sonuç **€60 net satış**, **€36 kâr**, **%60 marj** olarak doğrulandı. Her iki API aynı `ledgerVersion` ve aynı canonical TRY/EUR sonuçlarını döndürdü.
- Regression testi önce yanlış elle beklenen değer nedeniyle kırmızıya düştü; CPM sözleşmesinde `signedNetSales` değerinin TRY tabanı olduğunu düzelttikten sonra **6/6** geçti. Tam Nexus suite **383/383**, Vite build **6.773 modül** başarılıdır.
- Sonuç: güncel çalışma ağacında ortak canonical EUR hesaplama ve API parity kapısı yeşildir. Bu local kaynak kanıtı canlı image'ın düzeltildiğini kanıtlamaz; canlı fark **€961.827** ve release **NO-GO** olarak korunur.

## 2026-09-01 reconciliation para birimi etiketi düzeltmesi

- Canlı parity tekrarında EUR görünümü açıkken `Net fark 0 TL` etiketi, TRY tabanlı reconciliation ile EUR sunumunu yeterince ayırmıyordu.
- `DepartmentAnalysisPage` içine `formatReconciliationDifference` sözleşmesi eklendi. Fark değeri EUR görünümünde artık `TRY net fark ... TL`, kanıt yoksa `Uzlaşma kanıtı bekleniyor` olarak gösteriliyor; hesaplama ve reconciliation değeri değiştirilmedi.
- SSR regression testi önce eksik export nedeniyle kırmızıya düştü, ardından düzeltmeyle geçti. Tam suite **384/384**, Vite build **6.773 modül**, `git diff --check` temizdir.
- Bu yalnızca local kaynak/UI düzeltmesidir. Canlı image/source parity doğrulanmadığı için canlı ekranın düzeldiği kabul edilmez; CPM yazımı ve deployment yapılmadı.

## 2026-09-01 reconciliation/parity yerel release artefaktı

- Güncel çalışma ağacının yalnızca release allowlist'inde bulunan `public`, `server`, `shared`, `src` ve kök release dosyaları paketlendi; `.git`, `data`, `dist`, `node_modules`, `secrets` ve `tmp` içerilmedi.
- Artefakt: [nexus-local-20260901-reconciliation-label.tar.gz](C:\Users\furkan.cakir\Documents\Marlin Nexus Releases\nexus-local-20260901-reconciliation-label.tar.gz), **119** üye, bağımsız doğrulamada yasaklı üye **0**, SHA-256 `67a6e2c168907aba04e4e9909829b3296d665bd655e1680fc9acdfb6ceed7461`.
- `release_artifact_test.py` **5/5** geçti; üretim kaynak doğrulaması ve paket checksum'ı birbirinden bağımsız kontrol edildi. Bu paket, dirty working tree'den alınmış yerel snapshot'tır; immutable source commit, image digest, server parity veya canlı deployment kanıtı değildir.
- CPM ve Nexus üzerinde yazma yapılmadı; servera aktarım/cutover yapılmadı. Release **NO-GO**: canlı EUR parity farkı, Docker candidate runtime yokluğu, resmi maliyet/açılış kanıtı ve immutable manifest zinciri blocker olarak korunuyor.

## 2026-09-01 candidate runtime preflight tekrarı

- Salt-okunur workstation preflight sonucu: Docker CLI **DOCKER_CLIENT_NOT_FOUND**, kontrol edilen bilinen Docker binary yolları mevcut değil ve `com.docker.service` **DOCKER_SERVICE_NOT_FOUND**.
- Bu nedenle candidate image/container başlatma, authenticated readiness/prewarm, image digest ve UI parity kanıtları bu turda doğrulanamadı.
- Server Docker’ın önceki salt-okunur incelemesinde mevcut olduğu görülmüş olsa da candidate image sunucuda yoktur; pinned key-only SSH ve immutable manifest zinciri doğrulanmadan aktarım/cutover yapılmayacaktır.
- CPM, Nexus üretim durumu, server container/image/volume/network ve host dosyalarında değişiklik yapılmadı. Candidate runtime taskı **BLOCKED (Docker runtime erişimi yok)** olarak kaldı.

## 2026-09-01 immutable release manifest preflight

- Salt-okunur local identity kontrolünde `HEAD` commit’i `43d1a8c9783166a9f99d291eb12122a09195b683`; çalışma ağacı ise **67 dirty entry** içeriyor. Bu nedenle mevcut artefakt commit-tabanlı immutable release olarak doğrulanamaz.
- Current local hash kanıtları: `compose.yaml` SHA-256 `d4414f0d8e0dd08198188492fa2986c91e10a0d1bc0552f86b21d37621d7ad49`, `Dockerfile` SHA-256 `338e3f0b6f8f25f23f95e5b20017c29ec3408315cf56da68d32a40b56728804c`, reconciliation-label artefaktı SHA-256 `67a6e2c168907aba04e4e9909829b3296d665bd655e1680fc9acdfb6ceed7461`.
- Repo taraması doğrulanabilir bir immutable release manifest dosyası bulmadı. Candidate image digest, previous-release/rollback manifest bağı ve pinned key-only SSH transferi bulunmadığı için upload/cutover kapısı açılamadı.
- `release_runner_test.py` ve `release_artifact_test.py` birlikte **20/20** geçti; `release_runner.py` ve `release_artifact.py` Python derlemesi başarılı. Bunlar yalnızca statik sözleşme kanıtıdır; server candidate runtime veya canlı parity kanıtı değildir.
- Salt-okunur kontrol; CPM, Nexus production, server ve release arşivlerinde değişiklik yapmadı. Release **NO-GO** korunuyor.

## 2026-09-01 release runner transport preflight

- `release_runner.py` yapılandırması gerçek environment üzerinden salt-okunur değerlendirildi. `validate_runner_config` sonucu 10 blocker döndürdü: `target-missing`, `ssh-key-file-missing`, `known-hosts-file-missing`, `ssh-host-key-missing`, `tls-ca-invalid`, `release-id-missing`, `source-commit-invalid`, `image-digest-invalid`, `compose-config-hash-invalid`, `rollback-manifest-missing`.
- Bu sonuç, pinned key-only transport için gerekli değerlerin bu oturumda runner environment’ına sağlanmadığını kanıtlar. SSH bağlantısı, parola fallback’i, SCP/upload veya cutover denenmedi.
- Static config validation uygulamanın fail-closed davranışını doğrular; hedefte public-key yetkisi, candidate image veya server manifest zinciri hakkında yeni olumlu kanıt üretmez.
- CPM ve Nexus production değişmedi. Release **NO-GO** korunuyor; transport taskı yapılandırma/manifest erişimi sağlanana kadar **BLOCKED**.

## 2026-09-01 Sol/Luna release-gate kararı

- Sol read-only değerlendirmesi, mevcut validatorların eksik runtime, transport, identity, capacity ve rollback kanıtlarını zaten doğru biçimde fail-closed reddettiğini doğruladı. Aynı blocker'ları yeniden ifade eden yeni kod/kontrat katmanı eklenmedi.
- Kabul edilen en küçük sonraki adım: **onaylı Docker-capable izole candidate ortamının sağlanması**. Bu ortam olmadan gerçek candidate image digest'i ve authenticated readiness/parity kanıtı üretilemez.
- Candidate aşamasına geçiş için reviewed immutable source identity, exact image/artifact/Compose/Dockerfile/build kimlikleri, isolated runtime, read-only boundary, fail-closed readiness, Overview–Department EUR parity ve margin consistency kanıtları gerekir.
- Bu girdiler sağlanmadan placeholder manifest, dirty artifact'ın commit-derived sunumu, password SSH, server candidate, cleanup veya cutover yapılmayacaktır. CPM salt-okunur ve finansal readiness blocker'ları bağımsızdır.

## 2026-09-01 WSL alternatif runtime preflight

- Windows tarafında `docker`, `podman`, `nerdctl` ve `colima` komutları bulunmadı. WSL Ubuntu dağıtımında Docker CLI **29.7.2** bulundu.
- Ubuntu içindeki varsayılan Docker endpoint'i `unix:///var/run/docker.sock`; socket mevcut olmadığı için daemon bağlantısı kurulamadı. `docker context ls` ayrıca `desktop-linux` context'ini `npipe:////./pipe/dockerDesktopLinuxEngine` olarak gösterdi.
- WSL'den `docker --context desktop-linux version` çalıştırıldığında geçerli server version yerine Docker CLI panic çıktısı oluştu. Bu, candidate runtime veya image kanıtı değildir; WSL entegrasyonu etkin/sağlıklı kabul edilmedi.
- Hiçbir Docker image/container/volume/network, WSL ayarı, server, Nexus production veya CPM değiştirilmedi. Candidate runtime taskı **BLOCKED (çalışır Docker daemon doğrulanamadı)** olarak kaldı.

## 2026-09-01 server Docker candidate yolu doğrulaması

- Server Docker daemon salt-okunur SSH ile doğrulandı: client/server **29.3.0/29.3.0**.
- Production container `marlin-profit-sharing` çalışıyor ve image ID `89755523ac69`; `nexus-caddy` host port `4318` yayınlıyor. Güncel local reconciliation-label candidate image server image listesinde bulunmuyor.
- Production container mount kanıtı: `/run/secrets/cpm-credentials.txt` ve `/run/secrets/nexus-users.json` `RW=false`; `/app/data` ise production state olarak `RW=true`. Server Docker kullanımı teknik olarak mümkün olsa da candidate ayrı state/port ve güncel image gerektirir.
- Bu kontrol server Docker kullanılmadığı anlamına gelmez; candidate'ın serverda güvenli başlatılabilmesi için önce pinned key-only transport, immutable manifest/image kimliği ve kontrollü ayrı çalışma alanı gerekir. Password SSH ile upload/build/start yapılmadı.
- CPM, production Nexus container/image/volume/network ve host dosyaları değiştirilmedi. Candidate runtime durumu **BLOCKED (candidate image ve güvenli transport yok)**.
- 2026-09-01 server source inventory: `/home/serviceproadmin/apps/marlin-profit-sharing` altında source ve eski release arşivleri mevcut, ancak `.git` yok (`NO_GIT`). Server `compose.yaml` SHA-256 `6e20b326f1126938297ebc802e9bdd80f2b114c60e55d90740a18aaf4d07e14c`, Dockerfile SHA-256 `1e3abc9aca067d2cef4962a85f64c33868844b6fa87ce05fefc3cf3494c38311`; current local hash'lerle eşleşmiyor. Güncel reconciliation-label source/image'ın serverda bulunduğu doğrulanamadı. Candidate için güncel source/image'ın pinned key-only transport ile aktarılması veya serverda reviewed immutable source üzerinden build edilmesi gerekir. Upload/build/start yapılmadı.

## 2026-09-01 kritik source parity dosya karşılaştırması

- Server/local SHA-256 karşılaştırması şu dosyaların farklı olduğunu gösterdi: `server/ledgerApi.mjs`, `server/departmentAnalysis.mjs`, `src/DepartmentAnalysisPage.jsx`, `src/styles.css` ve `server/uiContract.test.mjs`.
- Server source'ta `server/task6RoleIsolation.test.mjs` bulunamadı. Bu dosya farkı/eksikliği, güncel API parity regression ve role-isolation kanıtlarının server source'ında bulunmadığını gösterir.
- Sonuç: Mevcut server source veya eski image üzerinden build almak güncel reconciliation label/API parity düzeltmelerini taşımaz. Güncel reviewed source/image'ın pinned key-only transport ile aktarılması veya serverda immutable source üzerinden build edilmesi gereklidir.
- 2026-09-01 server release archive inventory: Serverdaki en yeni görünen `marlin-nexus-release.tar.gz` (2026-08-31) içinden `server/ledgerApi.mjs`, `server/departmentAnalysis.mjs` ve `src/styles.css` hash'leri server source ile birebir eşleşti ve current local hash'lerden farklı çıktı. Arşivde `server/task6RoleIsolation.test.mjs` ve `server/uiContract.test.mjs` bulunmadı. Bu arşiv güncel candidate değildir; güncel reviewed source/image aktarımı zorunludur.

## 2026-09-01 key-only release transport yetki testi

- Local `.ssh` altında `marlin_nexus_erp_20260813_ed25519` private key ve public key mevcut. Public key fingerprint'i `SHA256:a/BnjSpN2XJZ9qwysnS9PmgbfMeO8LovrwIY4O47JgU` olarak hesaplandı; private key içeriği okunmadı.
- Host known_hosts doğrulamasıyla, `BatchMode=yes`, `IdentitiesOnly=yes`, `PasswordAuthentication=no` ve `KbdInteractiveAuthentication=no` seçenekleriyle yalnızca zararsız `true` komutu çalıştırıldı. Sonuç: **Permission denied (publickey,password)**, exit code **1**.
- Bu, anahtarın localde bulunmadığını değil, hedef `serviceproadmin` hesabında yetkili olmadığını kanıtlar. Parola fallback’i kullanılmayacaktır.
- Server yöneticisi public key’i hedef hesabın `authorized_keys` dosyasına ekleyip aynı key-only testini exit code 0 ile doğrulayana kadar güncel source/image upload, server Docker candidate build/start ve cutover yapılamaz. CPM ve production değişmedi.
- Server `~/.ssh/authorized_keys` içinde local release public key'in base64 gövdesi salt-okunur `grep` ile arandı; sonuç **RELEASE_KEY_ABSENT**. Bu, key-only testindeki yetki hatasını doğrudan destekler. `authorized_keys` dosyasına ekleme yapılmadı; public key'in server yöneticisi tarafından yetkilendirilmesi ve ardından aynı strict testin exit code 0 dönmesi bekleniyor.
- Private key'den türetilen fingerprint ile local `.pub` fingerprint'i aynı çıktı: `SHA256:a/BnjSpN2XJZ9qwysnS9PmgbfMeO8LovrwIY4O47JgU` (`match=true`). Local key pair geçerli; transport blocker'ı yanlış local key değil, server `authorized_keys` yetkisidir.
- Bu karşılaştırma salt-okunurdu; source, image, container, volume, network, host dosyaları ve CPM değiştirilmedi. Upload/build/start/cutover yapılmadı.

## 2026-09-01 server Docker candidate build ve CPM bağlantı gate'i

- Kullanıcı onayıyla release public key `serviceproadmin` hesabına eklendi. Pinned known_hosts ve `PasswordAuthentication=no` ile strict key-only SSH artık başarılı; Docker server version **29.3.0**.
- Güncel local artifact server `.release-incoming` alanına SCP ile taşındı. Local/server SHA-256 aynı: `67a6e2c168907aba04e4e9909829b3296d665bd655e1680fc9acdfb6ceed7461`; server boyutu **381.387** byte.
- Server Docker üzerinde `marlin-nexus-candidate:reconciliation-label` image build edildi. Immutable image ID/digest: `sha256:482c4e7252ac8c0d633807abb9e52a576e8e47b848975e6ad8183ed4c0eea216`; image size **90.631.784** byte. Build sırasında npm audit çıktısı **2 vulnerabilities (2 moderate, 1 high)** olarak raporlandı; candidate release kararından bağımsız ayrı dependency bulgusudur.
- Candidate ilk açılışta `Kimlik sağlayıcı yapılandırılmalıdır` hatası verdi. Kaynak kod (`server/auth.mjs`) `NEXUS_ADMIN_USERNAME` + `NEXUS_ADMIN_PASSWORD_SHA256` çiftini zorunlu fallback olarak gösteriyor; server `nexus-users.json` içindeki kullanıcı kimliği salt-okunur sorguyla `yonetici` olarak doğrulandı. Candidate `NEXUS_ADMIN_USERNAME=yonetici` ile yeniden başlatıldı ve login başarılı oldu.
- Candidate ayrı container/state ve `127.0.0.1:5318` portuyla çalıştı; production `marlin-profit-sharing` container'ı değişmedi. Authenticated candidate health `{"connected":false,"mode":"demo","readOnly":true}`; readiness `503` ve blocker `cpm-not-connected` döndü.
- Candidate logunda CPM hedefi `192.168.12.17\\MARLINSQL` için `socket hang up` görüldü. Aynı server host TCP probe'u `192.168.12.17:1433` için `Connection refused` döndü. Live container authenticated readiness'i de `cpm-not-connected` ve `inventory-source-not-verified` döndürdü; bu nedenle candidate/live kaynak parity'si CPM bağlı olmadan doğrulanamaz.
- Candidate kaynak tüketmemesi için durduruldu (`Exited (137)` stop sonucu); image ve artifact korunuyor. CPM, production container, production state, port `4318` ve veritabanı değiştirilmedi.
- Sonuç: **candidate image build PASS; candidate runtime/auth PASS; CPM bağlantısı ve finansal parity BLOCKED; release/cutover NO-GO**.

## 2026-09-01 CPM encryption kök nedeni ve güncel candidate kanıtı

- Server’dan yapılan salt-okunur named-instance probe `192.168.12.17\\MARLINSQL` için `SELECT 1` sonucunu **NAMED_OK** verdi. Aynı credential ile 49152/49153 sabit port probe'ları `ESOCKET` oldu.
- Kaynak incelemesi `server/index.mjs` içinde `CPM_SQL_ENCRYPT=false` environment değerinin ignore edilerek `encrypt:true` kullanıldığını kanıtladı. Bu nedenle SQL bağlantısı `socket hang up` ile kapanıyordu.
- `server/cpmConnectionConfig.mjs` ile `CPM_SQL_ENCRYPT` ve `CPM_SQL_TRUST_SERVER_CERTIFICATE` environment değerleri deterministik boolean olarak bağlandı. `server/cpmConnectionConfig.test.mjs` RED import failure sonrası **2/2** geçti; tam JavaScript suite **386/386**, Vite build **6.773** modül geçti.
- Yeni artifact server’a taşındı ve hash eşleşti: `3ea4067fb91051a0dca73ca72cbe8c0fe642e5c224d6e6ebf2b119100953d420`. Candidate image digest: `sha256:82aafee6cabd6a60b4924957a21cf44293b06f6de43c52f89788a1136f31147f`.
- Candidate `cpm-encryption-fix` ayrı state/loopback port ile çalıştı. Authenticated health: `connected:true`, `mode:live`, `readOnly:true`, `database:Marlin_Uyg`; login `yonetici` ile başarılı.
- Candidate Overview ve Department aynı 2026 datasetinde net satış olarak `227.409.749,56 TL` döndürdü; iki endpoint reconciliation `difference:0`, `balanced:true`. Önceki canlı ekran farkı bu candidate’da tekrarlanmadı.
- Candidate tüm satırları maliyet kanıtı açısından `INCELEME` scope'unda tuttu; Overview canonical EUR complete değil. Readiness 200 transport değil, finansal/kanıt blocker'larıyla sonuçlandı: `read-only-boundary-failed`, `inventory-source-not-verified`, `official-cost-coverage-insufficient`.
- Build-info candidate kimliği artık doğru: `buildId/buildVersion=cpm-encryption-fix`, commit `43d1a8c...`, image ve artifact hash eşleşiyor. Ancak runtime `readOnlyEvidence=unverified` olduğu için official financial GO açılmadı.
- Candidate loopback üzerinde çalışıyor; live `marlin-profit-sharing` container'ı **Up 20 hours** ve değişmedi. CPM’de SELECT dışı işlem yapılmadı. Release/cutover **NO-GO**, candidate API parity **PASS**.

## 2026-09-01 read-only evidence gate sonucu

- `server/releaseContract.mjs` runtime kanıtını yalnız `CPM_EFFECTIVE_READ_ONLY=true` ile `verified-by-runtime` kabul ediyor. Candidate ve live container environment'larında bu değişken bulunmadı; yalnız SQL encryption/trust ayarları mevcut.
- Bu nedenle candidate `/api/build-info` `readOnly:false`, `readOnlyEvidence:"unverified"` döndürdü; readiness blocker'ı `read-only-boundary-failed` olarak korundu.
- `server/cpmReadOnly.mjs` izin kanıtı için SELECT=true, write=false ve insert/update/delete/merge/alter/execute/grant/deny/revoke=false ister. CPM bağlantı hesabı SA olduğundan, `readOnlyIntent=true` veya kullanıcının salt-okunur kullanım niyeti efektif izin kanıtının yerine geçmez.
- `CPM_EFFECTIVE_READ_ONLY` değerini kanıtsız şekilde true yapmak gate bypass olur ve yapılmadı. Kanıtlı read-only SQL hesabı veya yetki çıktısı sağlanana kadar finansal GO **NO-GO** kalır.
- Candidate çalışır durumda ve `127.0.0.1:5318` loopback ile sınırlı; production container/state/CPM değişmedi.

## 2026-09-01 CPM efektif permission probe sonucu

- Candidate içinden mevcut CPM credential ile salt-okunur permission probe çalıştırıldı. Sonuç: `loginName=sa`, `databasePrincipal=dbo`, `isSysadmin=1`.
- Aynı sorguda `HAS_PERMS_BY_NAME` sonuçları: `canSelect=1`, `canInsert=1`, `canUpdate=1`, `canDelete=1`, `canAlter=1`, `canExecute=1`, `canControl=1`.
- Bu, CPM hesabının yalnız SELECT yetkili olmadığını ve efektif yazma/yönetim yetkisi taşıdığını doğrudan kanıtlar. Kullanıcının Nexus tarafında SELECT dışı işlem istememesi, DB permission evidence yerine geçmez.
- `CPM_EFFECTIVE_READ_ONLY=true` ayarlanmadı; aksi halde release gate yanlış pozitif açılırdı. `read-only-boundary-failed` blocker'ı doğrulanmış durumdadır.
- Candidate ve live production değişmedi; probe yalnız SELECT sorgularından oluştu. Release/cutover **NO-GO**.

## 2026-09-01 oturum kapısı ve net satış KPI düzeltmesi

- TDD ile `src/sessionGate.test.mjs` önce import hatasıyla RED, uygulama eklendikten sonra **3/3 GREEN** oldu. `src/sessionGate.js`, kimlik doğrulanmadan finansal uygulama kabuğunun gösterilmesini engelliyor; kimliksiz durumda yalnız giriş ekranı ve CPM salt-okunur sınırı görünür.
- TDD ile `src/summaryMetrics.test.mjs` önce import hatasıyla RED, net satış yardımcı fonksiyonu eklendikten sonra **2/2 GREEN** oldu. Gerçek toplam hesabı `266.201.384,28 - 2.380.829,99 - 36.410.804,73 = 227.409.749,56 TL` olarak doğrulandı.
- Tam JavaScript suite **386/386**, Vite production build **6.775 modül** geçti. `git diff --check` whitespace hatası üretmedi; mevcut CRLF uyarıları dışında sorun yok.
- Güncel aday artifact'i `nexus-local-20260901-session-gate-net-sales.tar.gz`; SHA-256 `cda37367f3afd99601428b51852eaabbca57264ea3c180dad3f31e5e86c101c3`. Server Docker image digest'i `sha256:d37fa30ef0498c6c80f8003df5cb4abd2e9b586885a3b834b221c7539491ed71`; aday `127.0.0.1:5320` loopback, ayrı state ve production'dan ayrı container ile çalışıyor.
- Authenticated browser smoke kanıtı: login sonrası `CPM canlı`, `Net satışlar 227.409.750 TL`, `9 dönem verisi`; console error/warning **0**. Aynı aday API'si source gross `266.201.384,28 TL`, net satış `227.409.749,56 TL` döndürüyor; kart artık gross değil net değeri gösteriyor.
- Aday açılışında CPM ledger prewarm tamamlanmadan uzun yüklenme gözlendi; prewarm tamamlandıktan sonra aynı akış başarıyla yüklendi. Kalıcı spinner olarak sınıflandırılmadı; prewarm/loading gözlemlenebilirliği ayrı UX iyileştirmesi olarak açık kaldı.
- `department-targets?year=2026` authenticated çağrısı HTTP **400**, `mode=invalid`, `Geçersiz departman hedef ayarı` ve boş satır döndürdü. Dashboard yüklenmesini engellemedi; hedef ayarları için ayrı orta öncelikli bulgudur.
- CPM ve production üzerinde yazma yapılmadı; production container/cutover değiştirilmedi. `sa`/`sysadmin` efektif izin kanıtı ve resmi maliyet/açılış stok kanıtı blocker'ları devam ettiği için release **NO-GO**.

## 2026-09-01 candidate inventory-research ve UI smoke

- Candidate `cpm-encryption-fix` üzerinde authenticated `GET /api/inventory-research?year=2026` HTTP **200** döndü; payload `readOnly=true`, `mode=unavailable`.
- Kaynak kanıtı fail-closed: `inventorySource.status=missing`, `financialStatus=blocked`, `reviewReason=inventory-movement-source-not-collected`, `evidence.status=not-collected`.
- Açılış stok tanısı candidate'da `status=not-available`, `officialEligibleCount=0`, `exactKeyCount=0`, `quantityOnlyCount=0`, `conflictCount=0`, `missingCostCount=0`, `unmatchedCount=0`; `currentStock.status=unavailable`, `reason=current-stock-source-not-verified`.
- Candidate UI authenticated session olmadan `/` sayfasında yalnız demo/pilot verisini (`Pilot veri`, 1.025.450.000 TL) gösterdi; finansal API çağrıları 401 aldığı için bu rakamların CPM canlı verisi olmadığı doğrulandı. Tarayıcı console error/warning kaydı gözlenmedi.
- Bu durum doğrudan veri sızıntısı kanıtı değildir; gösterilen değerler fallback/demo verisidir. Ancak oturum açmadan ürün kabuğunun ve sentetik finansal rakamların gösterilmesi, canlı veri ile pilot verinin karıştırılmasına açıktır. Login/session gate ayrı bir yüksek öncelikli UX/güven işi olarak kaydedildi; bu turda uygulanmadı.
- Candidate endpoint kanıtı `docs/audit/2026-09-01-live/candidate-inventory-2026.json` dosyasına kaydedildi. CPM ve production state değişmedi; yalnız SELECT tabanlı okuma yapıldı.
- Sonuç: candidate API/UI smoke **kısmi PASS**; resmi maliyet/açılış stok kanıtı ve release **NO-GO**.

## 2026-09-01 boş hedef ayarı adapter düzeltmesi ve server candidate doğrulaması

- Kök neden: persisted app-state ayar dosyası yokken `settings: null` döndürüyor; hedef politikası açık `null` değerini bozuk ayar olarak reddediyor. Genel politika doğrulaması gevşetilmedi; yalnız gerçek state adapter sınırında persisted `null` eksik ayar olarak normalize edildi.
- Önce RED olan state sınır testi sonrasında focused ledger/state testleri **35/35**, tam suite **388/388**, Vite build **6.775 modül** geçti. Açık bozuk nested/root ayar testleri korunuyor.
- Artifact `nexus-local-20260901-target-defaults.tar.gz`; SHA-256 `7e2c497dd4e8c3f86943b04f9f90651bf0e896357647335f28601ad156f8397b`. Server candidate image manifest digest'i `sha256:35be12bd19703456f336c4a348f549a63e783919b65e9c31c8797502db2cafc9`.
- `target-defaults` candidate ayrı state ve `127.0.0.1:5321` loopback portunda çalıştı. CPM ledger prewarm yaklaşık **200.667 saniye** sürdü; 2026/2025 satır sayıları **21.979 / 29.834**.
- Prewarm sonrası authenticated `/api/department-targets?year=2026` HTTP **200**, `mode=live`, **24** satır döndürdü; ilk satır varsayılan `growthPct=10`, `stretchPct=5` taşıdı. Health `connected=true`, `mode=live`, `readOnly=true`, database `Marlin_Uyg`.
- İlk demo sonucu yanlış credential mount/env yollarından kaynaklanan aday konfigürasyon hatasıydı; production'dan ayrıydı ve düzeltildi. CPM ve production üzerinde yazma/cutover yapılmadı.

## 2026-09-01 release parity son authenticated candidate kontrolü

- `target-defaults` candidate'da authenticated endpoint özeti: health HTTP 200/live/readOnly=true/database `Marlin_Uyg`; session HTTP 200; build-info HTTP 200 ve build ID/version `target-defaults`; readiness HTTP 200 fakat beklenen finansal blocker'larla kaldı.
- Overview canonical metric net satış `227.409.749,5600007 TL`; Department “Toplam” net satış `227.409.749,5600007 TL`; reconciliation source net satış `227.409.749,5600007 TL`. Üç kaynak aynı scope'ta kayan nokta seviyesinde birebir eşleşti.
- Reconciliation source toplamları: gross `266.201.384,28 TL`, returns `2.380.829,99 TL`, discounts `36.410.804,73 TL`, net `227.409.749,56 TL`, VAT `43.038.604,36 TL`, invoice total incl. VAT `270.448.353,92 TL`, 21.900 satır. Bu değerler CPM'e yalnız SELECT tabanlı aday bağlantısından okundu.
- Department toplamı 21.900 satır ve net `227.409.749,56 TL`; commercial owner toplamı `160.233.532,44 TL`. Aradaki `67.176.217,12 TL`, review kapsamındaki atıfsız/inceleme satışlarıdır; kişi toplamlarına sessizce dağıtılmamıştır.
- Authenticated browser smoke: `CPM canlı`, `Net satışlar 227.409.750 TL`, `9 dönem verisi`; Hedef Takibi ekranı `Nihai defter`, Servis yıllık hedef/gerçekleşme ve 12 aylık tabloyu gösterdi. Console error/warning **0**.
- Bu dilimle release parity candidate kanıtı **PASS**; resmi finansal release **NO-GO** olmaya devam ediyor: `read-only-boundary-failed`, `inventory-source-not-verified`, `official-cost-coverage-insufficient`. Production ve CPM mutation yapılmadı.

## 2026-09-01 candidate runtime ve read-only sınırının son kontrolü

- Server üzerinde salt-okunur SSH inspect ile `marlin-nexus-candidate-target-defaults` container'ı **running=true**, `ReadonlyRootfs=true` ve `no-new-privileges:true` olarak yeniden doğrulandı. Image ID'si beklenen `sha256:35be12bd19703456f336c4a348f549a63e783919b65e9c31c8797502db2cafc9` ile eşleşiyor.
- Aynı server oturumunda loopback `127.0.0.1:5321/api/health` çağrısı HTTP **200** ve `connected=true`, `mode=live`, `readOnly=true`, database `Marlin_Uyg` döndürdü. Daha önce kaydedilen 2025/2026 prewarm kanıtı da mevcut: **29.834 / 21.979** satır.
- Bu runtime güvenlik kanıtı, CPM SQL hesabının efektif yetkisini SELECT-only yapmaz. CPM hesabı için mevcut salt-okunur SELECT kanıtı `principal=sa`, `is_sysadmin=1`, `INSERT/UPDATE/DELETE/ALTER/EXECUTE=1` sonuçlarını içerdiğinden `readOnlyEvidence=unverified` ve `read-only-boundary-failed` korunmuştur.
- Sonuç: candidate runtime kanıtı **PASS**, uygulama SQL guard'ı **PASS**, CPM efektif permission gate'i **NO-GO**. Bu kontrol sırasında container, image, CPM veya production state değiştirilmedi.

## 2026-09-01 inventory kanıt görünürlüğü düzeltmesi ve candidate kontrolü

- Inventory araştırma ekranında kaynak doğrulanmadığında üst seviyede açık uyarı gösterilecek şekilde düzeltme yapıldı: satırlar yalnızca denetim araştırmasıdır; resmi WAC, maliyet ve kâr havuzuna dahil değildir. Belge doğrulaması ile finansal maliyet kapsamı satır seviyesinde ayrı kalır.
- TDD kanıtı: yeni UI sözleşme testi önce beklenen export eksikliği nedeniyle RED oldu; minimal helper ve görünür uyarı sonrasında GREEN oldu. Tam test suite **389/389**, production build **6.775 modül** ile başarılı.
- Yeni artifact `nexus-local-20260901-inventory-warning.tar.gz`, SHA-256 `9962955f7a2c93aad1e4b61fd415abb0d0995e7ee032c25c50560afd0d6fae79`; server candidate image digest `sha256:9bc341814e1405a42472f852d6041c313b6d4de07d5293e3910f67777d3e92c7`.
- Ayrı server candidate `marlin-nexus-candidate-inventory-warning` loopback `127.0.0.1:5322` üzerinde çalıştırıldı. Authenticated inventory kontrolü HTTP **200** döndürdü; `readOnly=true`, `mode=unavailable`, `inventorySource.status=missing`, `financialStatus=blocked`, `evidence.status=not-collected`, `openingEvidenceDiagnostics.status=not-available`, `officialEligibleCount=0`, `currentStock.status=unavailable` ve 100 denetim satırı görüldü.
- Sonuç: UI yanlış güven izlenimini azaltma düzeltmesi **PASS**; gerçek inventory/opening WAC kaynağı hâlâ toplanmadığı için `inventory-source-not-verified` ve `official-cost-coverage-insufficient` blocker'ları korunuyor. Production ve CPM mutation yapılmadı.

## 2026-09-01 taze CPM inventory kaynak keşfi

- Server candidate içinden yalnız SELECT ile CPM `Marlin_Uyg` metadata ve aggregate sorguları çalıştırıldı. `dbo.STKHAR` gerçekten mevcut: **416.965** aktif satır, tarih aralığı 2016-04-11–2026-09-01. `dbo.STKSYM` gerçekten mevcut: **49.063** satır, tarih aralığı 2022-12-28–2026-08-07.
- 2026 `STKHAR` tip 81 satırı **0**; tip 82 satırı **758** (**530** yön 0, **228** yön 1). `STKSYM` tip 82 2026 kapsamı **6.465** satır, **4.470** ürün ve **5** depo.
- `STKSYM` keşfinde miktar/ürün/depo/tarih/belge alanları bulundu; resmi WAC maliyeti için gerekli `BIRIMFIYAT`, `TUTAR`, `ISKONTO` alanları bu tablo sözleşmesinde doğrulanmadı. `STKHAR` maliyet alanlarını taşır, ancak tip 82 yön semantiği ve eşleştirme kuralları kanıtlanmış değildir.
- Bu keşif “kaynak yok” varsayımını kapatır; “kaynak sözleşmesi tamamlandı ve WAC'a bağlanabilir” sonucunu vermez. `inventory-source-not-verified` ve `official-cost-coverage-insufficient` blocker'ları korunur. CPM ve production üzerinde mutation yapılmadı.

## 2026-09-01 tip 82 yön semantiği ve belge eşleşmesi kontrolü

- 2026 aktif STKHAR tip 82 için **100** belge görüldü: **35** çift yönlü, **45** yalnız yön 0, **20** yalnız yön 1. Satırların **470**'i pozitif, **288**'i sıfır, **0**'ı negatif `TUTAR-ISKONTO` taşıyor.
- Yön 0'da **67**, yön 1'de **221** sıfır maliyet satırı bulundu. Bu nedenle yön 0/1 için giriş-çıkış/devir anlamı yalnız maliyet dağılımından çıkarılamaz.
- STKSYM örnekleri sayısal belge numarası ve `MKOD4=DEVIR` taşırken STKHAR 2026 tip 82 örnekleri `SSF-*` belge numarası taşıyor; doğrudan belge numarası join'i eşleşme vermedi. Ürün/depo/tarih/satır soy zinciri kanıtı tamamlanmadan WAC kaynağı verified yapılamaz.
- Sonuç: yeni kanıt blocker'ları azaltmadı; `inventory-source-not-verified` ve `official-cost-coverage-insufficient` korunuyor. CPM ve production mutation yapılmadı.

## 2026-09-01 inventory satır eşleştirme sonucu

- STKSYM 2026 tip 82'nin **6.465** satırından yalnız **6** tanesi STKHAR tip 82 ile aynı ürün+depo+tarih gününde, yalnız **1** tanesi aynı miktarla birlikte eşleşti.
- Tarih kaldırılarak ürün+depo+miktar eşleşmesi arandığında **92** aday bulundu; bu gevşek adaylar belge soy zinciri taşımadığı için resmi WAC kanıtı sayılamaz.
- Aynı gün eşleşen örneklerde miktar farklılığı görüldü; örneğin `2020TM` için STKSYM 13, STKHAR 2 ve `BE12/TF` için STKSYM 14, STKHAR 2. Otomatik WAC bağlama yapılmadı.
- Sonuç: doğrulanmış stabil açılış anahtarı bulunamadı; inventory kaynak ve maliyet blocker'ları korunuyor. CPM ve production mutation yapılmadı.

## 2026-09-01 CPM başlık ve soy zinciri kanıtı

- STKHAR tip 82 satırları EVRBAS'a şirket + belge tipi + belge numarasıyla bağlandığında aynı belgedeki yönler ortak `EVRAKSN`/`EVRAKGUID` taşıyor. Bu, STKHAR satır–başlık kimliğini doğruluyor.
- 2026 EVRBAS tip 82'de **124** başlık, **124** seri ve **124** GUID var; kaynak/karşı belge, ikinci belge numarası ve toplu belge alanları dolu değil. EVRHAR tip 81/82 kapsamı boş.
- Sonuç: STKHAR iç kimliği var, fakat STKSYM DEVIR'den bu başlıklara bağlanan upstream anahtar bulunamadı. `inventory-source-not-verified` ve `official-cost-coverage-insufficient` korunuyor; mutation yapılmadı.

## 2026-09-01 efektif CPM izin ve candidate readiness yeniden kontrolü

- Server Docker candidate içinden yalnız SELECT tabanlı izin sorgusu çalıştırıldı. CPM bağlantısı `loginName=sa`, `databaseUser=dbo`, database `Marlin_Uyg`, `isSysadmin=1` döndürdü.
- Database seviyesinde SELECT/INSERT/UPDATE/DELETE/ALTER/EXECUTE/CONTROL değerlerinin tamamı **1**; STKHAR object seviyesinde SELECT/INSERT/UPDATE/DELETE değerlerinin tamamı **1**. Bu hesap efektif SELECT-only değildir.
- Candidate health HTTP **200** ve `connected=true`, `readOnly=true` döndürdü; bu uygulama bağlantı niyetidir ve DB hesabının yetkisini değiştirmez. Authenticated readiness HTTP **200** içinde `ready=false`, `read-only-boundary-failed`, `inventory-source-not-verified`, `official-cost-coverage-insufficient` ve `build-id-missing` blocker'ları görüldü; runtime `readOnly=false`, `readOnlyEvidence=unverified`.
- Sonuç: uygulama fail-closed davranışı doğrulandı; ayrı efektif SELECT-only CPM hesabı/kanıtı sağlanana kadar finansal release **NO-GO**. CPM, candidate ve production üzerinde mutation yapılmadı.

## 2026-09-01 yönetimce kabul edilen CPM izin riski — release sözleşmesi güncellemesi

- Önceki canlı kanıt (`sa`/`sysadmin`, database ve STKHAR write izinleri açık) teknik olarak hâlâ doğrudur. Yönetim bu altyapı durumunu bu görev kapsamındaki candidate için **kabul edilmiş risk** olarak onayladı; bu, Nexus'un CPM'ye yazabileceği anlamına gelmez.
- Readiness sözleşmesi artık yalnız `NEXUS_ACCEPTED_RISKS=cpm-extra-permissions` açıkça yapılandırılmışsa bu bulguyu `acceptedRisks` alanında taşır; `readOnly=false` ve `readOnlyEvidence=unverified` aynen kalır. Yapılandırma yoksa `read-only-boundary-failed` sert blokajı devam eder.
- Sol önerisiyle Luna tarafından release contract ve candidate Compose propagation uygulandı. CPM SELECT allowlist/write guard'larında değişiklik yoktur.
- Kanıt: release contract **12/12**, Python runner **15/15**, tam Node suite **393/393**, Vite build **6.775 modül**. Eski server candidate henüz yeni image/metadata ile yeniden kurulmadığından canlı candidate readiness güncel davranış için **yeniden doğrulanmamıştır**.
- Sonuç: scoped candidate için `sa` yetkisi artık ayrı kabul edilmiş risk; WAC kaynağı, açılış/provenance ve yeni candidate metadata kanıtı çözülmeden resmi finansal release **NO-GO**.
- Runner contract kontrolünde ayrıca bir uyumsuzluk düzeltildi: gerçek `/api/readiness` cevabındaki nested `runtime` metadata artık doğrulanıyor; kabul edilmiş risk listesi yoksa `readOnly=false` yine hata üretir. Nested contract regression testi dahil Python runner **16/16** geçti; eski server candidate bu düzeltmeyle yeniden çalıştırılmadı.

## 2026-09-02 güncel server candidate authenticated readiness kanıtı

- Key-only SSH transport başarılı oldu. Güncel artifact server staging alanına aktarıldı; local/server SHA-256 **8d0048a708f2a5e521c47c26e52ba51653eb366a153b5853482a8b65b1e2e692** ile eşleşti.
- Güncel image `sha256:001c352331570800f00a0464d8dc50e06fd898d4f9b0e95aa3e5b98a8f4dcca4` ile server Docker’da build edildi. Candidate ayrı `127.0.0.1:5323` portunda, ayrı state, read-only root filesystem ve `no-new-privileges` ile çalıştı.
- Authenticated health HTTP **200**: `connected=true`, `mode=live`, `readOnly=true`, database `Marlin_Uyg`. Authenticated build-info `nexus-20260902-readiness-runner` ve beklenen commit/artifact/image kimliklerini döndürdü.
- Authenticated readiness HTTP **200**: `ready=false`; `acceptedRisks=[cpm-extra-permissions]`; runtime `readOnly=false`, `readOnlyEvidence=unverified`; blocker listesi yalnız `inventory-source-not-verified` ve `official-cost-coverage-insufficient`.
- Bu kanıt scoped candidate release sözleşmesini **PASS** eder; resmi finansal readiness hâlâ **NO-GO**. Production container ayrı ve çalışır durumda kaldı; CPM’de yazma yapılmadı.
