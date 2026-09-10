# Nexus Finansal Analiz ve Yönetim Deneyimi Dönüşüm Planı

**Durum:** Aktif kanonik plan  
**Kalıcı yürütme panosu:** `4ee715eb-d5f6-4122-93ea-ec56808deab0` — Nexus Finansal Analiz ve Yönetim Deneyimi Dönüşümü  
**Önceki plan:** `docs/superpowers/plans/2026-09-01-nexus-remediation.md`  
**Amaç:** Nexus'u yalnız satış ve kârlılık kararlarına odaklanan, tüm ekranları aynı ekonomik ledger ile uzlaşan, EUR ana görünüm kullanan ve güvenli biçimde yönetilebilen bir analiz sistemine dönüştürmek.

## 1. Karar özeti

Uygulama sırası veri doğruluğundan kullanıcı arayüzüne doğru ilerler:

1. Finansal terim ve kaynak veri sözleşmesini kesinleştir.
2. Kronolojik hareketli ortalama maliyet ile negatif stok davranışını doğrula.
3. EUR değerleme, dönem kapanışı ve kur kanıtı sözleşmesini tamamla.
4. Stok, Havuz ve Denetim ürün yüzeylerini güvenli biçimde devre dışı bırak.
5. Ortak finansal UI bileşen katmanını kur.
6. Genel Bakış ve Satış Analizi'ni kanonik metriklere geçir.
7. Servis ve Yedek Parça Satış departman analizlerini ve drill-down'larını kur.
8. Ayarlar'ı sürümlü ve denetlenebilir yönetim merkezine dönüştür.
9. Raporlar'ı satış-kârlılık karar yüzeyine dönüştür.
10. Entegre mutabakat, güvenlik, responsive QA ve kontrollü yayın kapısını tamamla.
11. Eski deploy ve veri artefaktlarını kanıtlı ve onaylı liste üzerinden temizle.

Finans çekirdeği tamamlanmadan finansal UI tüketicileri yeniden yazılmaz. UI bileşenleri finansal aritmetik yapmaz; API'nin sunduğu kanonik view-modeli gösterir.

## 2. Değişmez sınırlar

- CPM kesinlikle salt okunur kaynaktır. CPM'e ayar, hedef, onay, personel veya finans sonucu yazılmaz.
- Eksik maliyet, tarihsel döviz veya kur kanıtı sıfır kabul edilmez; ilgili sonuç `İnceleme` durumunda ve resmi toplam dışında kalır.
- EUR, USD, GBP ve TRY doğrudan toplanmaz. Her biri ayrı sepet olarak korunur; EUR ana görünüm yalnız kanıtlı çapraz dönüşümden üretilir.
- Ürün liste brüt marjı ile gerçek fatura brüt kâr/marjı ayrı kavramlardır.
- `stok`, `ledger/havuz` ve `audit/denetim` modüllerinin kapatılması finans çekirdeğinin, audit geçmişinin veya geri açma imkanının silinmesi değildir.
- Canlı deploy, container, volume, rollback image, onaylı dönem snapshot'ı, audit kanıtı veya iş verisi envantersiz silinmez.
- Kullanılmayan deploy/veri temizliği kullanıcıya sunulan kesin silme listesi ve geri dönüş kanıtından sonra yapılır. Daha önce ServicePro ile ilgili kaldırma izni verilmiş olsa da Nexus bağımlılık/rollback ilişkisi doğrulanmadan silme yapılmaz.
- Mevcut kirli çalışma ağacındaki kullanıcı/ajan değişiklikleri korunur; kapsam dışı dosyalar geri alınmaz veya yeniden formatlanmaz.

## 3. Kanonik finansal sözlük ve formüller

### 3.1 Satış terimleri

- **KDV hariç brüt satış:** İskonto ve iade öncesi fatura satış tutarı.
- **Gerçek fatura iskontosu:** `KDV hariç brüt satış − KDV hariç net fatura satışı`.
- **KDV hariç net satış:** Fatura iskontoları ve iadeler sonrası işaretli ekonomik satış tutarı.
- **Hareketli ortalama maliyet:** Satış tarihine kadar oluşan kronolojik ortalama birim maliyet × satılan miktar.
- **Gerçek brüt kâr:** `KDV hariç net fatura satışı − hareketli ortalama maliyet`.
- **Gerçek brüt marj:** `100 × gerçek brüt kâr ÷ KDV hariç net fatura satışı`.

Sıfır net satışta oran `null/—` olur; sıfır uydurulmaz.

### 3.2 Ürün liste brüt marjı

Alış faturası için:

`Net birim maliyet TL = (KDV hariç brüt alış − alış iskontoları) ÷ miktar`

Belge tarihindeki Halkbank satış kuru kullanılarak ürünün o tarihteki stok kartı dövizine çevrilir.

`Birim brüt kâr = KDV hariç döviz bazlı perakende liste fiyatı − KDV hariç döviz bazlı birim maliyet`

`Ürün liste brüt marjı = 100 × birim brüt kâr ÷ KDV hariç döviz bazlı perakende liste fiyatı`

Bu tutar **iskonto** değildir. Gerçek fatura iskontosu yalnız fatura brüt/net satış farkıdır.

### 3.3 Kronolojik maliyet

Her ürün + depo + tarihsel ürün dövizi anahtarında hareketler ekonomik tarih/sıra ile işlenir:

1. Açılış stoku miktar ve maliyet temelini kurar.
2. Uygun alış faturası net birim maliyeti ekler.
3. Yeni ortalama: `(eski stok değeri + yeni alış değeri) ÷ (eski miktar + yeni miktar)`.
4. Satış yalnız satış anındaki ortalamayı kullanır; gelecek alış geçmiş satışı değiştiremez.
5. Satış iadesi bağlı satışın maliyetini devralır.
6. Alış iadesi mümkünse bağlı alış katmanını aynı ürün/depo/döviz altında ters çevirir; bağ yoksa incelemeye düşer.
7. Tarihsel stok kartı dövizi değişince geçmiş hareketler değişmez.

### 3.4 Negatif stok

Stok satışla eksiye düşerse, ilgili ürün için uygun alış faturalarındaki marj gözlemleri alış miktarıyla ağırlıklandırılır:

`Ağırlıklı liste marjı = Σ(alış adedi × ürün liste brüt marjı) ÷ Σ(alış adedi)`

Bu oran satılan tüm adede, negatif kısım dahil, uygulanır. Bu yalnız **liste brüt marjı tahminidir**; gerçek fatura satışından hesaplanan gerçek brüt kârın yerine geçmez. Geçerli alış/marj kanıtı yoksa sonuç incelemeye düşer.

### 3.5 Manuel ve pilot maliyet

- Mevcut manuel maliyet kayıt yapısı korunur.
- UI'nın TL ve satış belge tarihiyle oluşturduğu manuel birim maliyet, belge tarihindeki Halkbank satış kuruyla tarihsel ürün dövizine çevrilir.
- Yönetim onayı gerekiyorsa onaysız manuel maliyet resmi sonuca girmez.
- Pilot kart maliyet oranı Ayarlar registry'sinden alınır ve ilgili net satışın kendi para biriminde uygulanır.

## 4. EUR ana raporlama sözleşmesi

- Ana ekran para birimi EUR'dur.
- Ekonomik satır önce kendi tarihsel ürün dövizinde tutulur.
- Ürün dövizinden EUR'ya rapor günü Halkbank **alış** kurları üzerinden çapraz dönüşüm yapılır.
- Açık dönemler rapor günü kur setiyle dinamik yeniden değerlenir.
- Yönetimce onaylanan geçmiş aylarda ve yıl sonunda son iş günü kur seti dondurulur.
- Hafta sonu/tatil gününde en son önceki iş günü kuru kullanılır; kullanılan kur tarihi ve gecikme/fallback işareti ekranda görünür.
- Tarihsel stok kartı döviz değişiminde taşınan stok eski döviz satış kuruyla TL'ye, yeni döviz satış kuruyla yeni dövize çevrilir; iki kur kanıtı saklanır.
- Hedef karşılaştırmasında cari dönem ve önceki yıl aynı rapor günü kur setiyle EUR'ya çevrilir; kur etkisi büyümeden ayrılır.
- Kapalı dönemin dondurulmuş sonucu daha sonraki kur değişikliğinden etkilenmez.

## 5. Kanonik veri akışı ve sınırlar

```text
CPM read-only adapter
  → normalize edilmiş ekonomik hareketler
  → kronolojik maliyet / iade / tarihsel döviz motoru
  → kanonik finansal ledger
  → dönem ve raporlama kur seti
  → kanonik finans view-model
  → Overview / Sales / Department / Reports
```

- `shared/financialCostModel.mjs`: saf maliyet, marj gözlemi, iade ve negatif stok kuralları.
- `shared/financialMetric.mjs`: satış/iskonto/net satış/maliyet/kâr/marj, döviz sepetleri ve EUR toplulaştırma.
- `shared/eurReporting.mjs`: kur seti, çapraz dönüşüm, açık/kapalı dönem davranışı.
- `server/ledgerApi.mjs`: veri okuma ve ince adaptör; hesap kurallarını tekrar etmez.
- `server/departmentAnalysis.mjs`: aynı ledger üzerinde yalnız departman/kişi/müşteri/ürün gruplama ve sahiplik kanıtı.
- React sayfaları: aritmetik değil sunum, filtre ve drill-down orchestrasyonu.

## 6. Aktif ürün yüzeyleri

Aktif analiz deneyimi:

1. Genel Bakış
2. Satış Analizi
3. Departman Analizi
4. Raporlar
5. Ayarlar

Geçici olarak devre dışı:

- Stok
- Havuz
- Denetim

Devre dışı modüller menü, default page seçimi, deep-link, session modül listesi ve doğrudan API düzeyinde fail-closed kapatılır. Yalnız UI'dan gizlemek yeterli değildir.

## 7. Sayfa bilgi mimarisi

### 7.1 Genel Bakış

- EUR net satış
- EUR gerçek brüt kâr
- Gerçek brüt marj
- Gerçek fatura iskontosu
- Dönemsel satış/kâr/marj trendi
- Servis ve Yedek Parça Satış karşılaştırması
- Hedefe gidiş ve sabit-kur yıllık karşılaştırma
- EUR/USD/GBP/TRY ayrı sepet özeti

Belge doğrulama adedi, işlenen satır sayısı gibi operasyonel sayaçlar yönetim KPI kartı olmayacak. Eksik kanıt varsa ilgili finansal değerin yanında kısa durum ve inceleme bağlantısı gösterilecek.

### 7.2 Satış Analizi

- Brüt satış → gerçek iskonto → net satış köprüsü
- Net satış → WAC maliyet → gerçek brüt kâr köprüsü
- Dönem, departman, kişi, müşteri, ürün ve döviz filtreleri
- Trend, yoğunlaşma, iskonto ve marj dağılımları
- Ürün liste brüt marjı ile gerçekleşen satış marjı karşılaştırması
- Belge/satır ayrıntısı yalnız drill-down içinde

### 7.3 Departman Analizi

Yalnız iki kanonik departman vardır:

- **Servis**
- **Yedek Parça Satış**

Ortak metrikler: EUR brüt/net satış, gerçek iskonto, WAC maliyet, gerçek kâr/marj, liste marjı, hedef ve sabit-kur yıllık kıyas, döviz sepeti uzlaşması.

Servis özel analiz adayları, yalnız kaynak veri kanıtlıysa:

- Hizmet/iş emri gelir türleri
- Müşteri ve araç/servis segmentleri
- Servis danışmanı ticari sahipliği
- Tekrar iş/müşteri eğilimi
- İskonto ve gerçekleşen marj sapması
- Aylık hız, hedef açığı ve basit açıklanabilir run-rate öngörüsü

Yedek Parça Satış özel analiz adayları, yalnız kaynak veri kanıtlıysa:

- Ürün ailesi, marka ve müşteri kırılımı
- Satış adedi, satış hızı ve gelir yoğunlaşması
- İskonto ile gerçekleşen marj ilişkisi
- Liste marjı ve gerçekleşen marj sapması
- Aylık hız, hedef açığı ve açıklanabilir run-rate öngörüsü

Drill-down: departman → kanıtlı ticari sorumlu → müşteri/ürün → belge/satır.

Muhasebe aktörü, kaydı giren kullanıcı veya son değiştiren kullanıcı tek başına satış sahibi kabul edilmez. Kanıtlanamayan sahiplik kişi performansından ayrı tutulur.

### 7.4 Raporlar

- Dönem, departman, kişi, müşteri ve ürün karşılaştırmaları
- Chart, tablo ve export aynı view-model ve aynı filtre fingerprint'ini kullanır
- EUR ana değerler ve ayrı döviz sepetleri birlikte sunulur
- Yalnız satış/kârlılık karar metrikleri görünür

## 8. Ortak UI bileşen sistemi

Mevcut claymorphism kit ve tokenları korunur; yeni UI kütüphanesi eklenmez. Ortak bileşenler:

- `FinancialKpiCard`
- `CurrencyBasketPanel`
- `SalesBridgeChart`
- `ProfitBridgeChart`
- `MetricTrendChart`
- `ComparisonChart`
- `AnalysisFilterBar`
- `FinancialDataTable`
- `DrilldownDrawer`
- `DataState` (loading/empty/error/review)
- `RateEvidenceBadge`

Tüm bileşenler light/dark, WCAG AA, klavye, reduced-motion ve mobil/masaüstü davranışını destekler. Para birimi ve oranlar erişilebilir metin etiketleriyle gösterilir; bilgi yalnız renkle aktarılmaz.

## 9. Profesyonel Ayarlar yönetim merkezi

Ayar kategorileri:

1. Raporlama ve döviz
2. Maliyet ve marj
3. Dönem kapanışı ve kur dondurma
4. Hedefler ve karşılaştırma
5. Departman ve ticari sahiplik
6. Kullanıcı, rol ve yetki
7. Görünüm ve erişilebilirlik

Registry her ayar için anahtar, tip, sınır/enum, varsayılan, açıklama, kategori, yetki, bağımlılık ve hassasiyet metadata'sı taşır. UI bu registry'den üretilir.

Kalıcı ayar sözleşmesi:

- Sunucu tarafı kalıcılık; tarayıcı `localStorage` tek gerçeklik kaynağı değildir.
- `schemaVersion`, `revision`, `fingerprint`.
- Optimistic concurrency ve çakışma mesajı.
- Değişiklik önizlemesi ve alan bazlı diff.
- Actor, timestamp, gerekçe ve audit geçmişi.
- Kritik maliyet/kur/kapanış değişikliklerinde yönetim onayı.
- Önceki revision'a kontrollü rollback.
- Secret veya altyapı credential değerleri API/UI payload'ına çıkmaz.

Havuz, dağıtım, stok ve denetim modüllerine özgü kontroller aktif Ayarlar yüzeyinden kaldırılır; gerekiyorsa geçmiş revision uyumluluğu için migration katmanında tutulur.

## 10. Uygulama görevleri ve bağımlılıkları

| Sıra | Kart | Bağımlılık | Bitti sayılma koşulu |
|---|---|---|---|
| 1 | F1 Finansal sözleşme | — | Kanonik terim ve fail-closed kontrat testleri |
| 2 | F2 Kronolojik maliyet | F1 | WAC/iade/negatif stok/tarihsel döviz testleri |
| 3 | F3 EUR ve kapanış | F2 | Kur, fallback, frozen period ve sabit-kur hedef testleri |
| 4 | P1 Modül kapatma | — | Menü/deep-link/API testleri; veri korunur |
| 5 | U1 Ortak UI | F3 | Responsive/a11y ve aritmetiksiz bileşen sözleşmesi |
| 6 | U2 Overview + Sales | U1 | Ekranlar arası finansal parity |
| 7 | D1 Departman analizi | U2 | Departman/kişi/drill-down ve ledger uzlaşması |
| 8 | S1 Ayarlar | P1 + F3 | Registry, revision, audit, RBAC, rollback testleri |
| 9 | U3 Raporlar | U2 + D1 | Chart/table/export parity |
| 10 | Q1 Entegre QA | S1 + U3 | Tam test/build/mutabakat/güvenlik/release gate |
| 11 | C1 Temizlik | S1 + U3 | Envanter + kullanıcı onayı + health/rollback kanıtı |

Kanban kart kimlikleri `4ee715eb-d5f6-4122-93ea-ec56808deab0` panosunda kalıcıdır; ilerleme orada güncellenir.

## 11. Test ve mutabakat stratejisi

Her üretim değişikliği önce RED regresyon testi, sonra GREEN odak test ile ilerler. Minimum kapılar:

- Finans formül ve terminoloji testleri
- Kronolojik hareket sırası ve gelecek alış izolasyonu
- Satış/alış iadesi bağlı maliyet tersleme
- Negatif stok adet-ağırlıklı liste marjı
- Manuel/pilot maliyet ve onay durumu
- Tarihsel ürün dövizi değişimi
- Rapor günü alış kuru ve belge günü satış kuru ayrımı
- İş günü fallback ve frozen-period immutability
- Para birimi sepetleri ↔ EUR mutabakatı
- Overview ↔ Sales ↔ Department ↔ Reports parity
- Chart ↔ tablo ↔ export parity
- Auth/RBAC ve devre dışı modül deep-link/API reddi
- Ayar revision conflict, audit ve rollback
- Light/dark, mobil/masaüstü, klavye ve reduced-motion
- Full `npm test`, `npm run build`, `git diff --check`

Canlı CPM mutabakatı tek snapshot/fingerprint altında yapılır. Aynı anda değişen canlı feed farklı zamanlarda okunup tek sonuçmuş gibi birleştirilmez.

## 12. Yayın ve geri dönüş

- Yerel test/build başarısı canlı yayın yetkisi değildir.
- Kullanıcı ayrıca canlı yayın talep ettiğinde immutable aday artefakt/image hazırlanır.
- Adayda authenticated smoke, health, financial reconciliation ve role erişim kontrolleri çalışır.
- Aktif container/image değiştirilmeden rollback hedefi hazır tutulur.
- Açık P0/P1 veya resmi maliyet/EUR readiness blocker'ı varsa cutover yapılmaz.
- Cutover sonrası health, finansal parity ve restart sayısı kanıtlanır.

## 13. Temizlik politikası

Temizlik son aşamadır ve iki bölümlüdür:

1. **Envanter:** path/image/container/volume, owner, son kullanım, canlı referans, veri sınıfı, boyut, yeniden üretilebilirlik, retention ve rollback ihtiyacı.
2. **Uygulama:** kullanıcıya gösterilmiş kesin silme listesi onaylandıktan sonra yalnız kanıtlı kullanılmayan artefaktlar kaldırılır.

Korunacaklar: aktif release, en az bir doğrulanmış rollback hedefi, onaylı dönem kur setleri/snapshot'ları, audit ve reconciliation kanıtı, kullanıcı/iş verisi, kaynağı belirsiz artefaktlar.

## 14. Açık riskler

- Resmi tarihsel WAC için önceki araştırmada maliyet/açılış kapsamı yetersiz kalmıştır; kaynak kanıtı tamamlanmadan resmi kâr/marj yayımlanamaz.
- Halkbank tarihsel alış/satış kurunun kapsamı ve kaynak semantiği her dönem için kanıtlanmalıdır.
- Servis'e özel araç/iş emri veya danışman analizleri, CPM'de doğrulanmış ilişki yoksa sonraki alt karta ayrılır; tahmin edilmez.
- Ticari sahiplik kanıtı eksikse kişi performansı resmi değildir.
- Çalışma ağacı çok sayıda mevcut değişiklik içerir; her kart dar dosya kapsamı ve diff incelemesiyle yürütülür.

## 15. Plan değişiklik kuralı

Yeni kullanıcı gereksinimleri bu dosyaya ve aynı Kanban panosuna delta olarak eklenir. Finansal tanım, güvenlik sınırı veya veri silme kuralını değiştiren yeni talep ilgili bağımlılıkları yeniden değerlendirir; tamamlanmış görevler sessizce geçersiz sayılmaz. Her oturum başlangıcında bu plan, Kanban durumu ve `.superpowers/sdd/2026-09-01-nexus-remediation/progress.md` birlikte okunur.

## 16. 2026-09-10 doğrulama ve kapanış durumu

- Güncel yerel doğrulama: `npm test` **693/693**, `npm run build` başarılı ve `git diff --check` exit `0`; diff kontrolünde yalnız çalışma ağacı LF/CRLF dönüşüm uyarıları vardır.
- `src` erişilebilirlik denetimi 26 dosyanın tamamını taradı ve **0 bulgu** verdi. `src` güvenlik hotspot taramasındaki tek SQL bulgusu devre dışı `AuditPage.jsx` içindeki JSX `<select>` ifadesinin yanlış pozitif sınıflandırılmasıdır; dosyada SQL/DB çağrısı yoktur.
- F1/F2/F3, P1, U1/U2/U3, D1 ve S1 teknik kapsamı uygulandı. Kanban verifier sonuçları ayrı worker'ın `npm`/`git` komut politikasına takıldığı için `needs_human` kalır; yerel başarı verifier başarısı gibi işaretlenmez.
- Stok/Havuz/Denetim verisi silinmedi; registry, navigasyon ve doğrudan API yüzeyleri fail-closed kapatıldı. `docs/audit/2026-09-10/nexus-cleanup-inventory.md` yalnız salt-okunur envanterdir ve kullanıcı talimatıyla silme uygulaması iptal edilmiştir.
- Canlı CPM mutabakatı yeniden denendi; `createCpmPoolProvider` yine önceden yapılandırılmış credential env/file bulamadığı için tek `SNAPSHOT` transaction başlamadan fail-closed durdu (`preconfigured-cpm-credentials-unavailable`). Parola veya credential içeriği çıktıya yazılmadı; bu nedenle canlı fingerprint/row-count özeti üretilmedi ve sahte sonuç plana eklenmedi.
- Authenticated production-like smoke kanıtı: rol izolasyonu **6/6**, aktif UI/erişim/hata sözleşmeleri **41/41**, release readiness/preflight **16/16**, CPM read-only transaction/pool sınırları **14/14** geçti. Overview ↔ Department EUR parity, kapalı modül deep-link/API reddi, login/logout, 401/403/ready-false ve fail-closed hata durumları fixture snapshotlarıyla doğrulandı.
- Geniş çalışma ağacında kapsam dışı olarak yalnız raporlanan gruplar: HR/izin/mesai/payroll dosyaları, operasyonel audit/release dokümanları, generated `work/`/archive/temporary çıktıları, CI/quality tooling ve `csv-parse`/`multer` bağımlılıkları. Testler geçtiği için bunlarda regresyon düzeltmesi yapılmadı ve kullanıcı değişiklikleri geri alınmadı.
- `SettingsPage.jsx` ve `DepartmentAnalysisPage.jsx` güvenlik taramasındaki SQL bulguları JSX template-string/aria-label yanlış pozitifleridir; bu dosyalarda SQL/DB çağrısı yoktur. Sunucu ve state-store taramaları temizdir.

## 17. 2026-09-10 kullanıcı delta'sı ve F3 yeniden doğrulama

Kullanıcı; tüm ekranlarda satış, gerçek iskonto, WAC maliyet, gerçek brüt kâr/marj ve ayrı döviz sepetlerinin tek kanonik ledger'dan gösterilmesini; yalnız Servis ve Yedek Parça Satış departmanlarının kanıtlı drill-down analizlerini; Stok/Havuz/Denetim yüzeylerinin veri silmeden kapatılmasını; registry tabanlı profesyonel Ayarlar'ı; son aşamada kanıtlı ve onaylı temizlik yapılmasını teyit etti. Bu delta mevcut sıralamayı değiştirmez: F3 kırmızı kapı kapanmadan U2/D1/S1 ileri geliştirmeleri resmi olarak tamamlanmış sayılmaz.

F3 remediation: `server/ledgerApi.mjs:resolveMonthRateSet` artık açık approval kaydı olmayan geçmiş ayları ay sonu Halkbank alış kur setiyle otomatik dondurur; açıkça `locked:false` verilen dönemler rapor gününde dinamik kalır; saklı V2 snapshot, legacy fallback ve malformed snapshot fail-closed davranışları korunur. `server/ledgerRateSnapshot.test.mjs` otomatik tarihsel kapanış ve güncel ay dinamik değerleme regresyonlarını içerir.

Yerel kanıt: F3 odak testleri 9/9 ve kur/approval/EUR testleri 42/42 geçti; tam `npm test` exit 0, `npm run build` exit 0, `node --check` ve `git diff --check` başarılıdır (yalnız mevcut CRLF uyarıları). Kanban verificationReport dış doğrulaması yeniden çalıştırılmadığı için kartın harici doğrulama durumu henüz otomatik olarak Done kabul edilmez.

Aktif yüzey sadeleştirmesi: `src/SalesPage.jsx` Döviz Sepeti görünümünden satır sayısı sütunu ve Maliyet/Kur Kapsamı operasyonel KPI'ı kaldırıldı; `src/SummaryPage.jsx` güven durumundaki Maliyet kapsamı yüzdesi kaldırıldı. İnceleme durumu finansal toplam dışında tutulduğunu belirten kısa durum olarak korunur; kanıt verisi ve backend ledger silinmez. `server/uiContract.test.mjs` bu görünürlük sınırını doğrular.

D1 department slice: `server/departmentAnalysis.mjs` aynı kanonik ledger üzerinden `topProductsByDepartment.service` ve `.parts` ürün yoğunlaşmalarını üretir. Departman UI'sı seçili Servis/Yedek Parça görünümünde bu sıralamayı EUR net satış, gerçek kâr ve marj ile gösterir; `server/departmentAnalysis.test.mjs` partition ve `server/departmentEurContract.test.mjs` UI sözleşmesini doğrular. Bu slice kişi sahipliği kanıtı veya yeni tahmin metriği üretmez.

S1/U3 görünürlük ve yönetim slice'ları: `shared/settingsPolicy.mjs` tüm registry toggle'ları için boolean tip, kategori, varsayılan, `settings:manage` yetkisi ve `sensitive:false` metadata'sı üretir; Settings toggle DOM'u bu metadata'yı taşır. Reports/Summary/Sales görünür tablolarından operasyonel satır/dönem/hareket sayaçları kaldırıldı; EUR net satış, maliyet, gerçek kâr, marj, iskonto/iade ve kısa inceleme durumu korunur. Yerel tam suite **705/705**, build, syntax ve diff kontrolleri başarılıdır.

Q1 yerel release gate: tam `npm test` **705/705**, production build, tüm etkilenen dosyalarda syntax ve `git diff --check` geçti. Güvenlik AST taraması server/shared/Summary/Sales/Reports/Settings dosyalarında temizdir; DepartmentAnalysisPage'deki 5 uyarı JSX template-string/inline-style interpolasyonlarının SQL yanlış pozitifidir ve dosyada SQL/DB çağrısı yoktur. F3 yerel acceptance gate GREEN kabul edilerek plan ilerletildi; Kanban external verificationReport bu oturumda yeniden çalıştırılamadığı için harici durum ayrıca beklemede tutulur, kod planının ilerlemesini bloke etmez.

C1 cleanup gate: `docs/audit/2026-09-10/nexus-cleanup-inventory.md` mevcut reversible QA arşivini, manifest/hash kanıtını ve kalıcı silme kapsamının **None approved** olduğunu kaydeder. Çalışma ağacı, canlı audit kanıtları, rollback adayları, data state ve ServicePro referansları silinmedi; yeni üretilen/atanmamış çıktılar yalnız envanterlendi. Kullanıcı sahiplik/retention/rollback kararı olmadan ek temizlik uygulanmayacak.
