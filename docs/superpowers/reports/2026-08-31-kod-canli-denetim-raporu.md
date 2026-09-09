# Marlin Nexus — 2026-08-31 Kod + Canlı Denetim Raporu

## Sonuç

Canlı servis erişilebilir ve `readOnly=true`; ancak release-ready değildir. `/api/readiness?year=2026` HTTP 503 döndürüyor ve tek blocker `inventory-source-not-verified` / `inventorySourceStatus=missing`.

Bu çalışma diliminde canonical ledger çıktısına `totals.byCurrency`, `totals.eurEquivalent`, `totals.eurRateSet`, `totals.eurComplete` ve eksik kur listesi eklendi; App havuz görünümündeki maliyet hesabı da `estimatedCost` fallback’inden çıkarıldı. Settings ekranındaki değiştirilebilir kur seçicisi kaldırılıp sabit Halkbank alış kuru sözleşmesi gösterildi.

Sonraki güvenlik diliminde coverage readiness blocker’ı eklendi. Yabancı dövizli WAC satırlarında tarihsel alış-kuru katmanı henüz kurulmadığı için maliyet uydurulmuyor; satırlar `currency-wac-not-established` ile incelemede bırakılıyor. Bu build canonical finans olarak deploy edilmemelidir.

## 2026-08-31 devam dilimi — tarihsel döviz WAC katmanı

- WAC motoru artık açılış/alım katmanlarında `unitCostCurrencyExVat` ve ürün dövizini koruyor; satış ve iadeler bu katmanın maliyetini devralıyor.
- Foreign ürünlerde tarihsel döviz maliyeti yoksa `currency-wac-not-established` ile fail-closed inceleme uygulanıyor; satış tarihi kuru maliyet temeli olarak kullanılmıyor.
- CPM hareket SQL sözleşmesi, açılış/alım satırlarında ürün kartı dövizi ve hareket tarihine kadar en son Halkbank satış kurunu salt-okunur kanıt olarak taşıyacak şekilde güncellendi. Fingerprint koruması yenilendi.
- Yerel doğrulama: `npm test` 333/333, hedefli ledger/WAC testleri geçti; `npm run build` başarılı; `git diff --check` hatasız.
- CPM ağına doğrudan bağlantı bu ortamdan kurulamadı; SQL sözleşmesinin canlı çalıştırma kanıtı alınmadı. Deployment yapılmadı.
- Hareket kaynağı özeti artık ürün/açılış kapsamını, mükerrer açılışları, tarih aralığını ve yabancı döviz maliyet kanıtını raporluyor. Mükerrer açılış katmanı readiness üzerinde `inventory-opening-evidence-ambiguous` blocker’ı oluşturuyor.
- Son doğrulama: `npm test` 341/341 başarılı; `npm run build` başarılı; `git diff --check` hatasız.

### Canlı CPM salt-okunur sorgu doğrulaması

Nexus üretim konteynerinden güncel hareket sorgusu salt-okunur bağlantıyla çalıştırıldı: 6 recordset, 21.869 ekonomik satır, 147.325 hareket satırı, 7.487 ürün, 1.814 açılış kanıtlı ürün, 534 mükerrer açılışlı ürün ve 18.018 yabancı döviz maliyet kanıtlı hareket bulundu. Bu ölçüm `inventory-opening-evidence-ambiguous` ve yetersiz maliyet kapsamı blocker’larının canlı veride gerçek olduğunu doğruluyor. Deployment yapılmadı.

Bu bulgu üzerine açılış hareketi SQL’i `YEAR(h.EVRAKTARIH) = @year` ile sınırlandı; farklı rapor yıllarındaki devirler aynı WAC başlangıç havuzuna üst üste eklenmeyecek. Fingerprint yenilendi. Değişiklik henüz canlıya alınmadı; canlı ölçüm mevcut sürümün kanıtıdır.

Alım, satış ve iade hareketleri de aynı rapor yılı filtresine alındı; WAC sözleşmesi artık “seçilen yıl açılışı + seçilen yıl hareketleri” şeklinde kapalı bir dönemdir. Yerel doğrulama bu değişiklik sonrası 337/337 test ve production build ile tekrarlandı.

Ana finans ekranlarındaki `estimatedCost` fallback’leri kaldırıldı; Sales, Summary ve Department Analysis artık yalnız canonical `cost` alanını kullanıyor. UI sözleşme testi bu sınırı koruyor.

Reports ekranı da artık resmi maliyet için yalnız `financeV2.lineCostTryExVat` + `costStatus=covered` kullanıyor; incelemedeki satırlar kâr toplamına alınmıyor.

Stok Araştırması ekranının kapsama ve toplam maliyet göstergeleri de legacy `lineCost` yerine `financeV2.costStatus` ve `financeV2.lineCostTryExVat` alanlarına bağlandı.

Finansal WAC kapsamı blokluyken aylık yönetim onayı artık sunucu tarafında 409 ile reddediliyor; departman hedef payload’ı `inventorySource` metadata’sını taşıyor. Böylece readiness blocker varken kapanış/onay akışı açılamıyor.

Deployment öncesi canlı GET kontrolünde doğru `/api/session/login` rotasıyla oturum açıldı; eski build `/api/readiness?year=2026` için `inventory-source-not-verified` döndürüyordu.

Kontrollü deployment tamamlandı: canlı sürüm `v2-control-room-20260831-153453`, `/api/health` canlı/salt-okunur, `/api/readiness?year=2026` kaynak `verified` ve blocker’lar `official-cost-coverage-insufficient` + `inventory-opening-evidence-ambiguous`. Overview, Department Analysis ve Audit Ledger aynı ledger sürümünü (`2026:1788179893275:1`) kullandı. Hatalı CSRF ve Origin POST istekleri canlıda 403 döndü. Sistem erişilebilir ancak finansal release-ready değildir.

Build metadata düzeltmesi için ikinci kontrollü deployment tamamlandı. Güncel canlı kimlik `nexus-20260831-154149`, sürüm `v2-control-room-20260831-154149`; health/readiness doğrulaması aynı blocker’ları korurken kaynak `verified` kaldı.

## Yerel kanıt

- `npm test`: 324/324 geçti.
- `git diff --check`: hata yok.
- CSRF regresyonu: cookie token ayrıştırması `.slice("nexus_csrf=".length)` ile doğrulandı.
- CPM fingerprint/guard testleri yalnız izinli, parametreli SELECT ve oturum-içi temp işlemlerini kabul ediyor.

## Canlı kanıt

- `/api/health`: 200, `connected=true`, `database=Marlin_Uyg`, `readOnly=true`.
- `/api/build-info`: 200, `version=v2-csrf-20260831-131149`, `readOnly=true`.
- `/api/readiness?year=2026`: 503, `ready=false`, `inventorySourceStatus=missing`.
- `/api/overview?year=2026`: 200; 2026 satırlarında `cost=0`, `v2CostCoveragePct=0`, satırlar review sepetinde.
- `/api/department-analysis?year=2026`: 200; departman çıktısında maliyet/profit değerleri mevcut ve overview ile aynı resmi maliyet kapsamını göstermiyor. Bu, canonical-ledger parity blocker'ıdır.
- `/api/department-targets`, `/api/audit-ledger`, `/api/audit-samples`, `/api/inventory-research`: authenticated 200.
- Geçerli CSRF + Origin ile ledger refresh başarılı; yanlış CSRF 403; oturumsuz istek 401.

## Açık P1/P2 bulguları

1. Üretim ledger loader gerçek opening/movement/currency/rate source vermiyor; resmi WAC canlıda doğrulanamıyor.
2. EUR ana görünüm tüm finans ekranlarında uygulanmamış; App/Goals/Approval/Reports yüzeylerinde TL/legacy alanlar kalmış.
3. Department analysis ile overview/approval/goal ekranları ortak `byCurrency` + `eurEquivalent` sözleşmesine tam bağlanmamış.
4. `lineCost` ve `uncoveredNetSales` alanlarının audit/inceleme kanıtı olarak kalan kullanımları ayrıca gözden geçirilmeli; ana finans ekranı fallback’leri kaldırıldı ve CPM Denetim resmi `financeV2` maliyetini kullanıyor.
5. Settings ekranında `exchangeRateRule` seçimi hâlâ görünüyor; karar gereği sabit Halkbank alış kuru olmalı.
6. Audit/management export’ları EUR sepeti, WAC kanıtı ve kontrol toplamını eksiksiz taşımıyor.
7. HR shell uygulama kabuğuna bağlanmamış ve `src/hr/api.js` mevcut olmayan `src/api.js` import’una sahip.
8. Canlı tarayıcı click-through ve 390px görsel kabulü bu koşuda tarayıcı bağlayıcısı kullanılamadığı için API kanıtıyla sınırlı kaldı; yeniden çalıştırılmalı.

## Karar

CPM’ye yazma yapılmadı. Canlı kabul testinde `CPM verisini yenile` isteğinin istemci tarafından CSRF başlığı olmadan gönderildiği yeniden üretildi; `App.jsx` isteğine `X-CSRF-Token` eklendi, regresyon testi yazıldı ve `npm test` 341/341 geçti. Kontrollü deployment `nexus-20260831-155650` ile tamamlandı; valid CSRF+Origin refresh isteği artık 403 yerine sunucu tarafından kabul edilip CPM/WAC yenilemesini başlatıyor (canlı CPM sorgusu 120 saniyeyi aşabildiği için UI bu sırada “yenileniyor” durumunda kalıyor). Buna rağmen `inventory-source=verified`, WAC/canonical ledger parity, EUR ana görünüm ve UI canlı kabulü tamamlanmadan “canlıya hazır” denmemeli.

## 2026-08-31 devam dilimi — satır dövizi kanıtı

- `resolveLineCurrency` ile boş `FIYATDOVIZCINS` + `FIYATDOVIZKUR=1` satırları yalnız satır seviyesinde `TRY` paritesi olarak kanıtlanıyor.
- Ürün kartı dövizi yabancıysa bu kanıt `line-product-currency-mismatch` inceleme nedeni taşıyor; resmi ürün dövizi ve WAC maliyeti sessizce TRY’ye çevrilmiyor.
- Kanıt `financeV2.lineCurrencyEvidence` alanında ledger çıktısına taşındı; satış, maliyet, EUR sepeti ve 15 dakikalık önbellek davranışı değiştirilmedi.
- Yerel doğrulama: `npm test` 347/347, `npm run build` başarılı, `git diff --check` hatasız.
- Kontrollü deployment tamamlandı: canlı build `nexus-20260831-164308`, sürüm `v2-control-room-20260831-164308`; `/api/overview?year=2026` canlı modda 8 satır döndürdü, `readOnly=true` korundu.
- Readiness finansal kapsam ve mükerrer açılış kanıtı nedeniyle bloklu kalıyor; bu fail-closed ve beklenen davranıştır. CPM’ye hiçbir yazma yapılmadı.

## 2026-08-31 devam dilimi — açılış uzlaştırma uygunluğu

- `buildAnnualOpeningStates` artık her ürünün uzlaştırma sonucunu `reconciliation.official` ile açıkça işaretliyor.
- Önceki kapanış ile CPM açılışı miktar/döviz açısından uyuşmuyorsa gözlenen toplam korunuyor, ancak resmi WAC’a aktarılabilir kabul edilmiyor.
- Rastgele `MIN/MAX` açılış seçimi yapılmadı; 66 mükerrer ürün için canlı blocker korunuyor.
- Yerel test ve build yeniden başarılı; kontrollü deployment `nexus-20260831-165017` tamamlandı ve canlı Overview doğrulandı.

## 2026-08-31 devam dilimi — CPM Denetim dışa aktarım kanıtı

- CPM Denetim CSV dışa aktarımı ürün dövizi, satır dövizi, satır dövizi kanıt yöntemi ve inceleme nedenini taşır.
- Aynı dışa aktarım resmi WAC durumunu ve resmi WAC inceleme nedenini ayrı sütunlarda verir; doğrulanmamış satırlarda varsayımsal EUR dönüşümü üretilmez.
- Export maliyeti yalnız `financeV2.costStatus=covered` ve doğrulanabilir `lineCostTryExVat` olduğunda resmi maliyet olarak kullanır; diğer satırlar manuel/onaylı oran veya boş inceleme değeriyle açıkça ayrılır.
- Yerel doğrulama: `npm test` 352/352, `npm run build` başarılı, `git diff --check` hatasız.
- Kontrollü deployment tamamlandı: canlı build `nexus-20260831-181841`, sürüm `v2-control-room-20260831-181841`; `/api/overview` `mode=live`, 8 satır ve `readOnly=true` doğrulandı.
- Açık finansal blocker'lar değişmedi: `official-cost-coverage-insufficient` ve `inventory-opening-evidence-ambiguous`; sistem bu nedenle fail-closed çalışmaya devam ediyor.

## 2026-08-31 devam dilimi — canlı kabukta demo fallback izolasyonu

- Canlı tarayıcı kabul testinde CPM Denetim canlı satırları gösterirken ana kabuk yükleme bekleme süresinde demo satırlarını göstermeye devam ediyordu.
- `App.jsx` artık başlangıçta boş satır kümesi kullanıyor; loading/unavailable/error durumlarında pilot rakamları göstermiyor. Demo fallback yalnız API açıkça `mode=demo` döndürürse seçiliyor.
- UI sözleşme testi bu fail-closed görünüm kuralını koruyor.
- Yerel doğrulama: `npm test` 352/352, `npm run build` başarılı, `git diff --check` hatasız.
- Kontrollü deployment tamamlandı: canlı build `nexus-20260831-182844`, sürüm `v2-control-room-20260831-182844`; `/api/overview` `mode=live`, 8 satır, `readOnly=true`.

## 2026-08-31 devam dilimi — canlı CPM soğuk önbellek ölçümü

- Salt-okuma canlı loglarında ilk `final-invoice-ledger-v1` sorgusunun 79,5 saniye sürdüğü görüldü; bu, tarayıcı kabul testindeki uzun “CPM okunuyor” durumunu açıklıyor.
- 15 dakikalık türetilmiş önbellek ısındıktan sonra aynı oturumda overview 0,12 sn, departman analizi 0,73 sn, audit 0,16 sn ve stok araştırması 0,13 sn yanıt verdi.
- CPM’ye yazma yapılmadı; önbellek süresi veya WAC hesaplama davranışı değiştirilmedi. Sonraki adım soğuk yükleme ilerlemesini kullanıcıya açıkça göstermek ve uzun beklemede yanlış pilot veriye dönmemektir.

## 2026-08-31 devam dilimi — soğuk CPM yükleme UX’i

- İlk ledger sorgusu sürerken ana kabuk artık demo/pilot rakamları render etmiyor; veri durumu `loading` iken açıkça “CPM verisi hazırlanıyor” ve “İlk yükleme önbelleği oluşturuluyor” mesajları gösteriliyor.
- `unavailable` ve `error` durumlarında fail-closed ekranı kullanılıyor; pilot veya varsayımsal rakamlar gösterilmiyor. API `live` döndüğünde mevcut canlı sayfa görünümü korunuyor.
- 15 dakikalık önbellek, WAC hesaplama ve CPM salt-okunur sınırı değiştirilmedi.
- UI sözleşme regresyon testi eklendi. Yerel doğrulama: `npm test` 352/352, `npm run build` başarılı, `git diff --check` hatasız.
- Kontrollü deployment tamamlandı: canlı build `nexus-20260831-185103`; canlı health/read-only ve `/api/overview` canlı veri kanıtı deployment sonrası doğrulandı.

## 2026-08-31 devam dilimi — Summary yazılı EUR anlatımı

- Summary ekranındaki seçilebilir yönetim/satış/kârlılık/maliyet metinleri EUR kanıtı varken artık EUR eşdeğerlerini kullanıyor; iade ve iskonto kalemleri ayrı EUR kanıtı olmadığı için TL bağlamında açıkça bırakıldı.
- Yeni UI sözleşme testi ile bu davranış korundu.
- Yerel doğrulama: `npm test` 357/357, `npm run build` başarılı, `git diff --check` hatasız.
- Kontrollü deployment tamamlandı: canlı build `nexus-20260831-191458`, `/api/overview` `mode=live`, 8 satır, `readOnly=true`.

## 2026-08-31 devam dilimi — koyu tema yüzey tamamlama

- Statik renk taramasında kalan KPI kartı, tooltip, hesap adımı, filtre, form, audit sayfalama ve işlem butonu yüzeyleri bulundu.
- Bu yüzeyler koyu kontrol odası arka planı, açık metin ve ortak sınır değişkenlerine taşındı; uyarı yüzeyleri de koyu amber kontrastına alındı.
- UI kontratına altı yüzey için regresyon kontrolü eklendi.
- Yerel doğrulama: `npm test` 357/357, `npm run build` başarılı, `git diff --check` hatasız.
- Kontrollü deployment tamamlandı: canlı build `nexus-20260831-192105`, `/api/overview` `mode=live`, 8 satır, `readOnly=true`.

## 2026-08-31 devam dilimi — üst kabuk ve EUR/TRY görünümü

- Marka kabuğu `NEXUS` + Marlin balığı olarak sadeleştirildi; şirket adı `Marlin Yatçılık Ltd. Şti.` yapıldı ve `KONSOLİDE` etiketi kaldırıldı.
- EUR/TRY paritesi artık backend kur setindeki güncel Halkbank alış kurundan gösteriliyor; sabit 47,1263 metni kaldırıldı.
- Bildirim ve yardım ikonları açılır bilgi panellerine bağlandı; indirme ikonu kaldırıldı.
- Yerel doğrulama: `npm test` 362/362, `npm run build` başarılı, `git diff --check` hatasız.
- Kontrollü deployment tamamlandı: canlı build `nexus-20260831-194024`, `/api/overview` `mode=live`, 8 satır, `readOnly=true`.

## 2026-08-31 devam dilimi — canlı doğrulama aracının rota düzeltmesi

- `deploy_verify.py` eski `/api/auth/login` yerine gerçek `/api/session/login` rotasını ve Unicode kaçışlı yönetici kimliğini kullanacak şekilde düzeltildi.
- Canlı doğrulama artık authenticated health/build/readiness yanıtı alıyor: `connected=true`, `mode=live`, `readOnly=true`, `database=Marlin_Uyg`, `inventorySourceStatus=verified`.
- Readiness blocker'ları doğru şekilde görünür: `official-cost-coverage-insufficient` ve `inventory-opening-evidence-ambiguous`.

## 2026-08-31 devam dilimi — canlı API parite smoke kapsamı

- `deploy_verify.py` authenticated salt-okunur smoke kapsamını Overview, Department Analysis, department targets, audit ledger ve inventory research uçlarına genişletti.
- Canlı kontrolde ana ledger uçlarının tümü aynı `ledgerVersion=2026:1788193588744:1` ve `cacheStatus=hit` değerini taşıdı; Overview 8, hedefler 24 ve Audit 10 satır döndürdü.
- Inventory Research 100 satırla canlı yanıt verdi; readiness ve health `readOnly=true` / `mode=live` olarak kaldı.
- CPM’ye yazma çağrısı yapılmadı. Finansal readiness blocker'ları değişmedi.

## 2026-08-31 devam dilimi — canlı güvenlik negatif kontrolleri

- Authenticated smoke betiğine oturumsuz Overview (`401`), yanlış Origin refresh (`403`) ve yanlış CSRF refresh (`403`) kontrolleri eklendi.
- Canlı sonuçlar beklenen güvenlik sınırlarıyla uyumlu; geçerli salt-okunur GET yüzeyleri `mode=live` ve cache hit olarak çalışmaya devam ediyor.
- Herhangi bir geçerli yazma/CPM mutasyon çağrısı yapılmadı.

## 2026-08-31 devam dilimi — EUR hedefleri, rapor/onay görünürlüğü ve koyu yüzey denetimi

- Departman hedef API'si artık aylık EUR gerçekleşme, önceki yıl EUR temeli ve EUR hedef alanlarını taşıyor; Goals ekranı bunları kur kanıtı yoksa açıkça inceleme durumunda gösteriyor.
- Reports ve Approval ekranları resmi ledger `eurEquivalent` verisini kullanarak EUR kâr/net satış eşdeğerini ve dönem kur kanıtını görünür kılıyor; TL yalnız bağlamsal değer olarak kalıyor.
- Modal, onay, audit, hedef ve veri yüzeyleri için koyu kontrol odası renk sözleşmesi eklendi; açık arka planlı yüzeyler ve okunabilirlik regresyon testi kapsama alındı.
- Overview canlı yüklemede yalnız API `mode=demo` ise pilot fallback kullanıyor; soğuk CPM yüklemesinde yanlış 0/pilot finans gösterimi engellendi.
- Yerel doğrulama: `npm test` 356/356, `npm run build` başarılı, `git diff --check` hatasız.
- Kontrollü deployment tamamlandı: canlı build `nexus-20260831-190747`, sürüm `v2-control-room-20260831-190747`; `/api/overview` `mode=live`, 8 satır ve `readOnly=true` doğrulandı.
- 15 dakikalık ledger önbelleği ve CPM salt-okunur sınırı korunmuştur. Finansal release blocker'ları (WAC kapsamı/açılış uzlaştırması) kapanmadığı için sistem canlı erişilebilir ancak release-ready değildir.

## 2026-08-31 devam dilimi — canlı kapsamlı salt-okuma QA

- `nexus-20260831-190641` canlı sürümünde yeni tarayıcı sekmesiyle Summary yeniden yüklendi. Cache sıcak olduğu için gerçek soğuk 90 saniyelik sorgu senaryosu tetiklenemedi; gözlem aralığında `CPM verisi hazırlanıyor` ve `Pilot veri` metinleri görünmedi, canlı CPM etiketi ve EUR KPI'ları göründü.
- Salt-okuma sayfa gezintisinde Satış ve Kârlılık, Departman Analizi, Stok Araştırması (80 ürün), CPM Denetim (21.913 satır), Havuz, Hedef Takibi, Raporlar, Onay & Kapanış, Ayarlar ve Yönetici Özeti erişilebilir bulundu. Raporlar ve Onay ekranlarındaki kısa loading durumu sonrasında canlı içerik, EUR kanıtı ve kur setleri göründü.
- 390×844 responsive ölçümünde `innerWidth=390`, `scrollWidth=375`; yatay taşma yok. Tarayıcı konsolunda error/warn kaydı bulunmadı.
- CPM’ye yazma, refresh POST, ayar kaydı veya maliyet override işlemi yapılmadı. Mobil menünün kapalı durumunda doğrudan nav tıklaması sayfa değiştirmedi; menü açılarak yapılacak mobil tıklanabilirlik kabulü ayrı açık nokta olarak kaydedildi.

## 2026-08-31 devam dilimi — canlı readiness kapsam kırılımı

- Sunucu tarafı authenticated salt-okunur doğrulamada readiness HTTP 503 döndürdü; finansal durum `blocked` ve iki blocker korundu: `official-cost-coverage-insufficient` ile `inventory-opening-evidence-ambiguous`.
- Inventory kaynağı canlı ve salt-okunur olarak doğrulandı: `movementRows=29.414`, `products=3.547`, `opening=393`.
- Açılış kanıtında `duplicateOpeningProductCount=66`, ekonomik etkili mükerrer açılışta `economicDuplicateOpeningProductCount=46` bulundu.
- Resmi WAC kapsamı `%27,4`: `coveredLines=5.994`, `reviewLines=15.919`; net satış kapsamı `%23,5`. Bu nedenle readiness fail-closed davranışı doğru ve release-ready ilanı yapılamaz.
- `readOnly=true` ve canlı ledger sözleşmesi korundu; doğrulama sırasında CPM’ye yazma, refresh POST, ayar veya maliyet kaydı yapılmadı.

## 2026-08-31 devam dilimi — Departman EUR ana görünümü

- Departman karşılaştırma kartları ve yönetim karşılaştırma tablosunun net satış, maliyet ve brüt kâr alanları kanıtlı EUR eşdeğerini kullanacak şekilde düzeltildi.
- İade ve iskonto değerleri EUR karşılığı API sözleşmesinde bulunmadığından kaynak TL olarak açıkça etiketlendi; çapraz depo operasyon metriği de TL bağlamında bırakıldı.
- Yerel doğrulama: `npm test` 365/365, `npm run build` başarılı, `git diff --check` hatasız.
- Kontrollü deployment tamamlandı: canlı build `nexus-20260831-194954`, `/api/overview` `mode=live`, 8 satır ve `readOnly=true`.
- Canlı authenticated smoke: `/api/health` bağlı, `/api/department-analysis` canlı, ana ledger uçlarında ortak `ledgerVersion=2026:1788195180763:1` ve `cacheStatus=hit`; güvenlik negatifleri 401/403 beklenen sonuçları verdi.

## 2026-08-31 devam dilimi — canlı Departman UI kabulü

- Canlı Departman Analizi ekranında EUR kur kanıtı, EUR net satış/kâr KPI'ları ve karşılaştırma tablosu doğrulandı; iade/iskonto TL bağlamı açık etiketli.
- Dönem filtresi Mayıs'a değiştirildi; Belge Defteri sekmesi ve arama alanı erişilebilir bulundu.
- Bildirim ve Yardım üst-kabuk panelleri açıldı; indirme butonu bulunmadı.
- 390×844 viewport ölçümünde `innerWidth=390`, `scrollWidth=375`, yatay taşma yok. Tarayıcı konsolunda error/warn kaydı bulunmadı.
- Testler salt-okuma kapsamındadır; CPM’ye yazma veya kalıcı ayar değişikliği yapılmadı.

## 2026-08-31 devam dilimi — canlı finans sayfaları gezinme taraması

- Canlı navigasyonla Satış ve Kârlılık, Havuz, Hedef Takibi, Raporlar, Onay & Kapanış ve Ayarlar ekranları ayrı ayrı açıldı.
- Her ekranda başlık ve EUR bağlamı görünür; gezinme sırasında hata/uyarı oluşmadı.
- Bu tarama yalnız görüntüleme ve sekme/navigasyon işlemleridir; CPM ve Nexus kalıcı verilerine yazma yapılmadı.

## 2026-08-31 devam dilimi — canlı filtre ve modal etkileşimleri

- Yönetim Özeti rapor seçicisi kârlılık raporuna değiştirildi; dönem seçicisiyle birlikte EUR anlatı korunmuştur.
- Satış ve Kârlılık ekranında maliyet kapsamı ve satış sıralaması filtreleri değiştirildi; aylık tabloda EUR net satış/maliyet/kâr değerleri korunmuştur.
- Görünüm Ayarları modalı açıldı ve kapatıldı; koyu tema, kompakt yoğunluk, başlangıç sayfası, yüksek kontrast ve hareket azaltma seçenekleri görünür bulundu.
- Etkileşimler salt-okuma kapsamındadır; Ayarları kaydet, CPM yenileme ve herhangi bir yazma işlemi çalıştırılmadı.

## 2026-08-31 devam dilimi — Havuz, hedef, rapor, onay ve audit etkileşimleri

- Havuz ve Hedef Takibi ekranları açıldı; EUR bağlamı görünür.
- Raporlar Merkezi'nde Marka, Bayi, Kanal/Modül, Teknik Servis, Alım/Maliyet, İskonto/İade, Veri Güveni ve Havuz Dağılımı sekmelerinin tamamı tıklanarak aktif görünüm doğrulandı; her sekmede EUR bağlamı korundu.
- Onay & Kapanış ekranı canlı ve EUR kanıtı görünür durumda.
- CPM Denetim Merkezi'nde belge araması `GM85929` ile filtrelendi ve satır detay kanıtı açıldı; denetim ekranı salt-okunur kaldı.

## 2026-08-31 devam dilimi — fatura cirosu ve kişi sahipliği uzlaştırması

- Salt-okunur `GET /api/reconciliation/invoices?year=YYYY` uç noktası eklendi. CPM'nin resmi fatura toplamları ile Nexus aylık özetleri; brüt satış, iade, iskonto ve net satış için kuruş toleransıyla karşılaştırılıyor. Kapsam dışı gelir belgeleri resmi uzlaştırmadan ayrı tutuluyor.
- Canlı doğrulama build'i `nexus-20260831-230128` üzerinde 2024, 2025 ve 2026 yıllarının üçü de `status=matched` döndürdü. Farkların en büyüğü 2024 brüt satışta yaklaşık `0,0000023 TL`; tüm farklar `0,01 TL` toleransının altında.
- 2024 resmi net satışı `152.936.676,03 TL`, 2025 resmi net satışı `238.357.967,21 TL`, 2026 resmi net satışı `226.258.787,26 TL` olarak Nexus ile uzlaştı. Kapsam dışı gelirler ayrıca raporlandı: sırasıyla `408.503,42 TL`, `369.022,49 TL`, `617.127,34 TL` net.
- Departman analizine `ownerTotals`, `ownerAssignedNetSales` ve `ownerUnassignedNetSales` alanları eklendi. Kişi toplamları yalnız doğrulanabilir ticari sahipliği olan ve inceleme/batch-risk dışı satırlardan oluşuyor; Bircan gibi muhasebe/son değiştirici aktörler sıralamaya alınmıyor, belirsiz tutar ayrı gösteriliyor.
- Yerel doğrulama: `npm test` 378/378 geçti, `npm run build` başarılı, JavaScript sözdizimi kontrolü başarılı. `git diff --check` yalnız mevcut CRLF/trailing-whitespace uyarıları verdi; yeni işlevsel hata vermedi.
- Canlı sağlık ve güvenlik kontrolleri başarılı: `connected=true`, `mode=live`, `readOnly=true`, `database=Marlin_Uyg`; oturumsuz Overview `401`, yanlış Origin/CSRF yenileme `403`. Ana veri uçları ortak ledger sürümü ve cache hit ile yanıt verdi.
- Canlı kişi sahipliği özeti 9 doğrulanabilir sahip ve `207.811.201,82 TL` atanmış net satış gösterdi; `18.447.585,44 TL` net satış inceleme/atanmamış olarak ayrıldı. Bu ayrım kişi toplamlarının yalnız kanıtlı ticari sahiplikten oluştuğunu doğrular.
- Release-readiness fail-closed olarak kaldı: `official-cost-coverage-insufficient` ve `inventory-opening-evidence-ambiguous` blocker'ları çözülmeden resmi maliyet/kâr dağıtımı için sistem release-ready ilan edilmemelidir. CPM'ye hiçbir yazma işlemi yapılmadı.
