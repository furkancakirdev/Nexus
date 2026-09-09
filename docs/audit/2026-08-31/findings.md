# Nexus canlı denetim bulguları — 2026-08-31

## F-001 — Dashboard trend grafiği veri göstermiyor

- Durum: İlk canlı incelemede doğrulandı.
- Öncelik: Yüksek (finansal karar ekranında görünürlük sorunu; toplam kartları mevcut olsa da trend analizi kullanılamıyor).
- Konum: Yönetici Özeti > Aylık Satış ve Kârlılık Trendi.
- Kanıt: `01-summary-desktop.png`.
- Gözlem: Ekran metni 2026 Ocak–Ağustos için €1.007.595 brüt satış ve €280.342 dağıtıma esas kâr gösteriyor; grafikte ay ve Y ekseni etiketleri var fakat satış/kâr serisi, çizgi, alan veya nokta görünmüyor.
- Teknik gözlem: Canlı DOM denetiminde grafiğin SVG eksen metinleri mevcut; veri serisi için circle sayısı 0 ve veri path’i görünür değil. Browser console error/warning kaydı bu kontrolde boş döndü.
- Tekrarlama: Nexus’a gir > Yönetici Özeti > sayfayı yükle > Aylık Satış ve Kârlılık Trendi bölümüne bak.
- Açık soru: Grafiğin veri serisi API/props seviyesinde mi boş geliyor, yoksa CSS/ölçekleme ile mi görünmez oluyor; bunu kaynak ve API çapraz kontrolünde kesinleştirilecek.

## F-002 — Departman Analizi toplamı Yönetici Özeti/Satış toplamıyla uyuşmuyor

- Durum: İlk canlı incelemede doğrulandı; kök neden henüz kesin değil.
- Öncelik: Kritik (aynı 2026 bağlamında görünen net satış göstergeleri arasında yaklaşık 961.827 EUR fark var).
- Konum: Departman Analizi > Genel Bakış.
- Kanıt: `03-departments-desktop.png` ve `01-summary-desktop.png`.
- Gözlem: Yönetici Özeti net satışları €1.007.595 gösteriyor. Departman Analizi 2026 geneli €1.969.422 gösteriyor. Departman tablosundaki €1.338.710 + €629.190 + €1.522 toplamı da €1.969.422’ye uzlaşıyor.
- Risk: Yönetim ekranları farklı ekonomik kapsam, dönem, kayıt çoğaltımı veya dönüşüm mantığı kullanıyor olabilir. Bu fark açıklanmadan finansal raporlama güvenilir kabul edilemez.
- Kaynak daraltması: Yönetici Özeti/Satış akışı `/api/overview` ile `buildOverviewRows` ve `decorateOverviewRowsEur` kullanıyor; Departman Analizi ayrı `/api/department-analysis` akışında `buildDepartmentAnalysis`, `finalizeMetric` ve ayrı EUR süslemesi kullanıyor. Her iki akış aynı CPM ledger kapsamını hedeflese de ortak bir KPI sözleşmesi kullanmıyor.
- Tekrarlama: Aynı oturumda Yönetici Özeti toplamını not et > Departman Analizi’ne geç > Genel Bakış toplamını ve departman satırlarını karşılaştır.
- Açık soru: İki ekranın ledger kapsamı, tarih aralığı, belge türleri, iade/transfer ve EUR kur seti API/kaynak seviyesinde karşılaştırılacak.

## F-003 — Departman Analizi aylık trend grafiği veri göstermiyor

- Durum: İlk canlı incelemede doğrulandı.
- Öncelik: Yüksek.
- Konum: Departman Analizi > Genel Bakış > Aylık Net Satış ve Kâr.
- Kanıt: `03-departments-desktop.png`.
- Gözlem: Kartlar ve alt karşılaştırma tablosu dolu olmasına rağmen aylık grafikte yalnız eksen/grid ve legend bulunuyor; veri serileri görünmüyor.
- Risk: Departman bazlı aylık karar ve dönem karşılaştırması kullanılamıyor; ayrıca F-001 ile benzer grafik veri bağlama sorunu olasılığı var.
- Tekrarlama: Nexus > Departman Analizi > Genel Bakış bölümüne git > Aylık Net Satış ve Kâr grafiğini incele.

## F-004 — Stok araştırması tanı özetinde metinler birbirine yapışıyor

- Durum: İlk canlı incelemede doğrulandı.
- Öncelik: Orta.
- Konum: Stok Araştırması > Açılış kanıtı tanısı.
- Kanıt: `04-inventory-desktop.png`.
- Gözlem: Tanı özeti “Resmi adaya uygun 0Exact-key 0Yalnız miktar 5Çatışma 0Maliyet eksik 0Eşleşmeyen 6.434” biçiminde boşluksuz/ayraçsız render ediliyor.
- Risk: Yönetici, sayıların hangi etikete ait olduğunu güvenilir biçimde okuyamıyor; kanıt kalitesi ekranı yanlış yorumlanabilir.
- Tekrarlama: Nexus > Stok Araştırması > Açılış kanıtı tanısı bölümünü aç.
- Öneri: Her metriği ayrı label/value bileşeninde render et; responsive görünümde kartlara böl; sayıların binlik ayraç ve açıklamalarını koru.

## F-005 — Hedef ekranı kur kanıtı hazır bilgisiyle çelişiyor

- Durum: İlk canlı incelemede doğrulandı; teknik kök neden açık.
- Öncelik: Kritik (EUR hedef karşılaştırması kanıtsız bırakılıyor ve karar ekranı çelişkili sinyal veriyor).
- Konum: Hedef Takibi.
- Kanıt: `07-goals-desktop.png` ve canlı DOM.
- Gözlem: Üst bilgi “Halkbank alış kuru · 8 dönem kur seti hazır” diyor; buna rağmen gerçekleşme kartında “EUR kanıtı bekleniyor” ve aylık tabloda her satırda “—Kur kanıtı yok” gösteriliyor.
- Risk: Kullanıcı EUR karşılaştırmasının kullanılabilir olup olmadığını anlayamıyor; kur kanıtı olmayan hedef sonuçları finansal karar için yanlış güven veya gereksiz blokaj yaratabilir.
- Tekrarlama: Hedef Takibi’ne git > üst EUR raporlama bandını kontrol et > Gerçekleşme ve Gerçekleşme · EUR kolonlarını kontrol et.

## F-006 — Kanıt bilgilendirme banner’larında metin ayracı eksik

- Durum: İlk canlı incelemede birden fazla ekranda doğrulandı.
- Öncelik: Orta.
- Konum: Hedef Takibi ve Onay & Kapanış EUR kanıtı banner’ları; Raporlar Merkezi KPI metinleri.
- Kanıt: `07-goals-desktop.png`, `09-approval-desktop.png`, `08-reports-desktop.png`.
- Gözlem: “EUR raporlama kanıtıHalkbank alış kuru”, “EUR onay kanıtıHalkbank alış kuru” ve Raporlar Merkezi’nde “Net satış · EUR1.007.595 EUR” gibi metinler görsel olarak bitişik render ediliyor.
- Risk: Başlık/değer/kaynak ayrımı kayboluyor; finansal kanıt mesajları profesyonel ve güvenilir görünmüyor.
- Öneri: Inline metinleri ayrı bloklara ayır; CSS gap/margin ve responsive wrap testi ekle.

## F-007 — Raporlar Merkezi marka grafiği koyu temada okunmuyor

- Durum: Tam sayfa canlı ekran, DOM ve console denetimiyle doğrulandı.
- Öncelik: Orta.
- Konum: Raporlar Merkezi > Yönetim Özeti > En Yüksek Net Satışlı Markalar.
- Kanıt: Tam sayfa canlı ekran; DOM'da 20 bar geometrisi (`.recharts-bar-rectangle`) ve 20 `path` mevcut, console error/warning yok.
- Gözlem: Grafik eksenleri ve marka isimleri görünüyor; veri barları DOM'da oluşuyor ancak `#0a3972` / `#16884e` dolgu renkleri koyu grafik zemininde yeterli kontrast vermediği için kullanıcıya neredeyse boş grafik gibi görünüyor.
- Tekrarlama: Raporlar Merkezi'ni aç > verinin yüklenmesini bekle > Yönetim Özeti sekmesinde marka grafiğine bak.
- Kök neden: `src/ReportsPage.jsx` içindeki sabit koyu bar renkleri koyu tema zeminine göre tema uyumlu değil; grafikte seri legend'i de yok.
- Öneri: Tema token'larından kontrastı doğrulanmış renkler kullan; barlara/legend'e erişilebilir seri adı ekle; koyu tema minimum kontrast ve screenshot regression testi koy.

## F-008 — SummaryPage mevcut kaynakta hook import’u olmadan derleniyor

- Durum: Kaynak kod denetiminde doğrulandı; canlı dağıtım kök nedeni olarak henüz doğrulanmadı.
- Öncelik: Yüksek.
- Konum: `src/SummaryPage.jsx`.
- Kanıt: Kaynak dosya `useState` ve `useMemo` kullanıyor ancak React import satırında bu iki hook görünmüyor; `npm run build` bunu yakalamıyor çünkü bu bir runtime/çalışma zamanı sözleşmesi.
- Risk: Bu kaynak sürümü doğrudan çalıştırılırsa Yönetici Özeti açılışta ReferenceError ile çökebilir. Canlı ekranın çalışması, canlı bundle’ın çalışma ağacındaki dosyayla aynı olduğunu kanıtlamaz.
- Öneri: Hook’ları açıkça import et; runtime smoke testinde SummaryPage açılışını zorunlu kontrol et; CI’da browser smoke test ekle.

## F-009 — Denetim/deploy yardımcı dosyalarında üretim kimlik bilgileri düz metin bulunuyor

- Durum: Çalışma ağacı kaynak incelemesinde doğrulandı.
- Öncelik: Kritik.
- Konum: `reconcile_years.py`, `deploy_verify.py`.
- Kanıt: Dosyalarda SSH/Nexus erişim parolaları doğrudan komut ve bağlantı parametresi olarak yer alıyor; ayrıca `cookies.txt` ve `secrets/` çalışma ağacında mevcut.
- Risk: Repo arşivi, paylaşım, log, yedek veya yanlışlıkla commit edilmesi halinde üretim ve CPM erişimi açığa çıkabilir. Bu denetim kapsamındaki canlı erişim için kullanılan kimlik bilgilerinin de ifşa edilmiş kabul edilmesi gerekir.
- Öneri: Parolaları derhal döndür; dosyalardan kaldır; credential file/secret store kullan; secret scanning ve pre-commit/CI engeli ekle; mevcut commit ve arşiv geçmişini güvenlik incelemesine al.
- Ek risk: `deploy_verify.py` ve `reconcile_years.py` HTTPS isteklerinde `curl -sk` kullanıyor. Bu yöntem sertifika doğrulamasını kapatır; güvenli doğrulama olmadan canlı sonuç kanıtı kabul edilmemeli.

## F-010 — Kişi ve müşteri sıralamalarında adlar görsel olarak kırpılıyor

- Durum: İlk canlı incelemede doğrulandı.
- Öncelik: Orta.
- Konum: Departman Analizi > Sorumlu, Ürün & Müşteri.
- Kanıt: `11-owner-rankings-desktop.png`.
- Gözlem: Uzun kullanıcı/müşteri/ürün adları kart içinde `...` ile kesiliyor; tam ad yalnızca görünür ek açıklama veya tooltip ile erişilebilir değil.
- Risk: Aynı ada sahip veya benzer isimli cari/ürünlerde doğru kişiyi ayırt etmek zorlaşıyor.
- Öneri: Tam metin tooltip/accessible label ekle; kartta kodu daha görünür göster; tablo görünümünde satır detayına erişim sağla.

## F-011 — Kişi satışları teyitli sahiplik olmadan kesin görünümlü sunuluyor

- Durum: İlk canlı incelemede doğrulandı; iş kuralı ihlali olup olmadığı kaynak sözleşmesiyle ayrıca değerlendirilecek.
- Öncelik: Yüksek.
- Konum: Departman Analizi > Sorumlu, Ürün & Müşteri.
- Kanıt: `11-owner-rankings-desktop.png` ve canlı DOM.
- Gözlem: KPI “Teyitli atıf %0,0” derken alt açıklama “Kullanıcı eşlemesi: 207.811.202 TL” gösteriyor ve sıralamada kişi bazlı satış tutarları kesin sıralama gibi sunuluyor. Ayrıca “Tanımsız kullanıcı (MAYAZ)” listeleniyor.
- Risk: Kullanıcılar bu tutarları kesin satış temsilcisi performansı sanabilir. Kullanıcı bazlı CPM mutabakatı yapılmadan bu değerler karar için güvenilir değildir.
- Öneri: Her kişi satırında teyitli/çıkarımsal/inceleme durumunu görünür göster; teyitsiz toplamları “aday/inceleme” olarak ayır; CPM fatura bazlı mutabakat tamamlanmadan resmi performans etiketi kullanma.

Doğrudan CPM doğrulaması (31.08.2026): Nexus sunucusundaki `final-invoice-ledger-v1` salt-okunur sorgusu ile 21.913 CPM satırı yeniden çekildi ve Nexus’un aynı filtreleri uygulanarak kişi toplamları üretildi. Ekrandaki dokuz kişi toplamının tamamı doğrudan CPM sonucu ile kuruş seviyesinde eşleşti; örnekler MKARA `52.688.508,63 TL`, CBELIKIRIK `39.245.083,48 TL`, FURKAN `36.937.822,52 TL`, BCETINEL `19.306.317,79 TL`. Ancak kaynak kalite sonucu teyitli atıf `%0`, çıkarımsal eşleştirme `207.811.201,82 TL` (`%91,85`) ve inceleme `18.447.585,44 TL` olduğundan, toplamlar matematiksel olarak doğru olsa da temsilci performansı olarak “kesin” etiketlenmemelidir.

## F-014 — CPM bağlantısı salt-okunur niyet taşıyor ancak DB hesabı yazma yetkili

- Durum: Doğrudan CPM bağlantı denetiminde doğrulandı.
- Öncelik: Yüksek.
- Konum: Nexus → CPM SQL bağlantı yapılandırması / üretim container’ı.
- Kanıt: Üretim container’ında `CPM_SQL_USER`/credential dosyası ile bağlantı kurulurken oturum hesabı `sa` olarak doğrulandı. Uygulama `readOnlyIntent: true` gönderiyor ve sorgu katmanı yalnızca izinli fingerprint’li, yazma içermeyen SQL’i kabul ediyor; ancak bu ayar DB hesabının INSERT/UPDATE/DELETE yetkisini kaldırmaz.
- Risk: Uygulama katmanındaki koruma atlanırsa veya yeni bir sorgu yolu eklenirse CPM üzerinde yüksek etkili değişiklik riski oluşur.
- Öneri: Ayrı, gerçek salt-okunur CPM login/rolü kullan; yalnız gerekli tablo/view SELECT izinlerini tanımla; `sa` kullanımını kaldır; bağlantı testinde DB izinlerini release gate olarak doğrula.

## F-015 — Satış trendinde en yüksek dönem TL tutarı EUR etiketiyle gösteriliyor

- Durum: Canlı ekran ve kaynak kod karşılaştırmasında doğrulandı.
- Öncelik: Yüksek.
- Konum: Satış ve Kârlılık > “En yüksek dönem” özeti.
- Kanıt: `02-sales-desktop.png`, canlı DOM ve `src/SalesPage.jsx` içindeki `topSalesMonth`/`reportMoney` kullanımı.
- Gözlem: Ekran `En yüksek dönem · Nisan · €40.947.942` gösteriyor; aynı ekranın genel EUR net satışı yaklaşık `€1.007.595`, aylık EUR değerleri ise on binler seviyesinde. Kaynak kodda `topSalesMonth.netSales` TL değeri seçiliyor, fakat `eurActive` açıkken bu değer `formatEur` ile EUR biçiminde etiketleniyor.
- Beklenen: EUR modu açıkken `topSalesMonth.eurNetSales` veya kanıtlı EUR karşılığı gösterilmeli; TL modu açıkken mevcut `netSales` kullanılmalı.
- Risk: Yönetici en yüksek ayı yaklaşık 40 milyon EUR sanabilir; bu doğrudan finansal karar ve güven riskidir.
- Öneri: Değer alanı ile formatlayıcıyı aynı para birimi sepetinden üret; TL/EUR için ayrı test ekle; yanında kaynak para birimini açıkça göster.

## F-016 — Tablet genişliğinde kurum adı header dışına taşıyor

- Durum: 768×1000 tablet viewport’unda görsel olarak doğrulandı.
- Öncelik: Orta.
- Konum: Uygulama üst header’ı / marka alanı.
- Kanıt: `13-summary-tablet-768.png`.
- Gözlem: Üstteki “Marlin Yatçılık Ltd. Şti.” marka metninin bir parçası ayrıca sol içerik alanına taşmış ve `...k Ltd. Şti.` şeklinde kırpılmış görünüyor; bu, KPI kartlarının hizasında görsel gürültü oluşturuyor.
- Beklenen: Marka alanı tek bir header bölgesinde kalmalı; tablet breakpoint’inde metin kısaltılmalı veya kontrollü taşma uygulanmalı.
- Risk: Sayfa yapısı bozulmuş ve başka içeriklerin de viewport dışında kaldığı izlenimi oluşuyor.
- Öneri: Header grid/flex min-width ve overflow kurallarını düzelt; 768 px ve 1024 px breakpoint’lerinde marka alanı için görsel regresyon testi ekle.

## F-017 — Raporlar KPI’larında EUR gösterimi tutarsız

- Durum: Canlı Raporlar Merkezi ekranında doğrulandı.
- Öncelik: Düşük.
- Konum: Raporlar Merkezi üst KPI kartları.
- Kanıt: Canlı DOM: net satış `1.007.595 EUR`, hesaplanan kâr `€280.342`.
- Gözlem: Aynı para birimi iki farklı biçimde gösteriliyor; birinde sayı sonuna `EUR`, diğerinde başına `€` sembolü kullanılmış.
- Risk: Finansal rapor görünümünde biçim standardı ve hızlı karşılaştırma güveni zayıflıyor.
- Öneri: EUR için tek bir format standardı seç ve tüm ekranlarda ortak para formatlayıcı kullan.

## F-018 — Doğrulanmış satırda maliyet boş, detay formülü sıfır gösteriyor

- Durum: Canlı CPM Denetim satırında doğrulandı.
- Öncelik: Yüksek.
- Konum: CPM Denetim Merkezi > ilk fatura satırı > Detayı aç.
- Kanıt: Canlı DOM; satır `17/ME02026000003922`, stok `GM85929`, doğrulama `Faturayla doğrulandı`. Ana tabloda satır maliyeti ve brüt kâr `—` görünüyor. Detayda seçilen alım belgesi `9/DNP2025000002934`, birim maliyet `10.279,85 TL` olmasına rağmen “Maliyet doğrulama ve brüt kâr” alanı `1 × 10.279,85 = 0 TL` gösteriyor.
- Kaynak kökü: `server/ledgerApi.mjs` içindeki `auditRow()` çıktısı `unitCost` ve `lineCost` alanlarını koruyor, ancak UI’nin kullandığı `calculatedCost` ve `grossProfit` alanlarını üretmiyor. `src/AuditPage.jsx` ise bu iki alanı doğrudan okuyor; bu nedenle kanıtlı maliyet satırında tablo `—`, detay hesaplaması da `0 TL` oluyor.
- Çapraz kanıt: Aynı `GM85929` ve `17/ME02026000003922` kaydı Stok Araştırması ekranında `10.279,85 TL` birim maliyet ve `%49,3` liste brüt marjı ile doğru gösteriliyor. Sorun CPM verisinin yokluğu değil, CPM Denetim sunum sözleşmesindeki alan eşleşmesi.
- Beklenen: Miktar × birim maliyet `10.279,85 TL` satır maliyeti olarak gösterilmeli; brüt kâr da satış neti `15.878,59 TL` eksi maliyet üzerinden hesaplanmalı veya maliyetin neden hesaba alınmadığı açıkça belirtilmeli.
- Risk: Kullanıcı aynı satırda geçerli alım belgesi ve maliyet kanıtı görmesine rağmen maliyetin sıfır/boş olduğunu sanabilir; kârlılık kararları yanlış etkilenebilir.
- Öneri: `unitCost`, `calculatedCost`, V2 maliyet ve gösterim alanlarının tek kanonik hesap fonksiyonundan üretilmesini sağla; doğrulanmış satır için maliyet/brüt kâr sözleşme testi ekle.

## F-019 — Departman genel toplamında EUR net marj `%0,0` gösteriliyor

- Durum: Canlı ekran ve kaynak kod karşılaştırmasında doğrulandı.
- Öncelik: Yüksek.
- Konum: Departman Analizi > üst KPI “Esas brüt kâr”.
- Kanıt: Canlı DOM’da genel toplam için net satış `€1.969.422`, esas brüt kâr `€862.926` olmasına rağmen `Net marj %0,0` yazıyor. Alt departmanlarda marjlar `%50,9`, `%28,9` ve `%11,7` olarak dolu.
- Kaynak kökü: `src/DepartmentAnalysisPage.jsx` genel toplamda `data.totals` kullanıyor ve `selectedMetric.eurMargin ?? 0` okuyor. `server/ledgerApi.mjs` içindeki EUR süslemesi `eurEquivalent` üretiyor fakat `eurMargin` üretmiyor. `sumMetrics()` aylık seçimlerde marj hesaplıyor; genel toplam/department seçiminde bu hesap çalışmıyor.
- Beklenen: `€862.926 / €1.969.422 ≈ %43,8` net EUR marj gösterilmeli.
- Risk: Yönetici genel toplam marjını sıfır sanabilir; kârlılık kararı yanlış yönlenir.
- Öneri: EUR süslemesinde veya ortak metric normalizasyonunda `eurMargin` hesapla; genel toplam, departman ve aylık seçimler için aynı KPI sözleşme testini ekle.

## F-020 — Aylık EUR göstergesi döviz sepeti sayısını `0` gösteriyor

- Durum: Canlı Departman Analizi’nde dönem `Mayıs` seçilerek doğrulandı.
- Öncelik: Orta.
- Konum: Departman Analizi > dönem filtresi ve EUR kanıt rozeti.
- Kanıt: Mayıs seçiliyken KPI’lar `€361.057` net satış ve `€157.455` kâr gösteriyor; aynı kontrolde `EUR · 0 döviz sepeti · Halkbank alış kuru` yazıyor.
- Kaynak kökü: Aylık seçimde `sumMetrics()` EUR tutarlarını topluyor fakat `byCurrency` sepetlerini toplamıyor; `currencyEvidenceCount` boş/eksik sepet üzerinden `0` hesaplıyor.
- Risk: Kullanıcı EUR toplamının kur kanıtı olmadığını veya hesaplanamadığını düşünebilir; finansal kanıt sinyali ile tutar sinyali çelişir.
- Öneri: Aylık metric toplamasına `byCurrency` sepetlerini dahil et veya aylık görünümde bu rozeti göstermeyip gerçek kanıt sayısını kullan.

## F-021 — Departman Belge Defteri yalnızca en güncel 500 satırda arama yapıyor

- Durum: Canlı arama ve kaynak kod ile doğrulandı.
- Öncelik: Yüksek.
- Konum: Departman Analizi > Belge Defteri.
- Kanıt: Ekran açıkça `500 satır gösteriliyor · API en güncel 500 satırı getirir` diyor. CPM’de mevcut ve 2026 başındaki `17/ME02026000000001` belgesi arandığında sonuç `0 satır` ve `Filtrelere uyan ekonomik satır bulunamadı` oluyor.
- Beklenen: Arama, seçili yılın tüm ekonomik satırları üzerinde sunucu tarafında çalışmalı veya kullanıcıya gerçek kapsamı ve doğrudan belge sorgulama seçeneğini sağlamalı.
- Risk: Kullanıcı eski faturaları, eski kişi atıflarını veya geçmiş maliyet kanıtlarını bu ekrandan bulamıyor; “kayıt yok” mesajı yanlış yorumlanabilir.
- Öneri: Arama/filtreleri API’ye taşı; sayfalama ile tüm sonuçları erişilebilir kıl; sonuç yok mesajında “yalnızca son 500 satır tarandı” uyarısı göster.

## F-022 — Yetkilendirme tek yönetici rolüne sabitlenmiş

- Durum: Kaynak kod seviyesinde doğrulandı; farklı rol hesabı verilmediği için canlı rol izolasyonu ayrıca çalıştırılamadı.
- Öncelik: Yüksek.
- Konum: `server/auth.mjs` oturum oluşturma ve yetki middleware’i.
- Kanıt: Giriş başarılı olduğunda payload her zaman `displayName: "Yönetici"` ve `capabilities: ["nexus:admin"]` ile oluşturuluyor. Kimlik doğrulama yalnız `NEXUS_ADMIN_USERNAME` ve tek parola özeti üzerinden yapılıyor; middleware de yalnızca `nexus:admin` olmayan kullanıcıları `/api/app-state` ve `/api/approvals` için engelliyor.
- Beklenen: Kullanıcı/rol kaynağı, en az yönetici, salt-okunur rapor kullanıcısı ve operasyonel kullanıcı gibi yetki seviyelerini ayırmalı; her API ve ekran veri kapsamını role göre kısıtlamalı.
- Risk: Sisteme giriş yapabilen tek kullanıcı modeli tüm CPM finansal, kişi, maliyet ve onay verilerine erişiyor; çalışan bazlı veri minimizasyonu ve görev ayrılığı sağlanamıyor.
- Öneri: RBAC/ABAC modeli ve kullanıcı kaynağı ekle; API endpoint’lerini capability bazında koru; yönetici dışı hesaplarla negatif erişim testleri ekle. Canlı doğrulama için farklı yetkili test hesapları gerekir.

## F-012 — İlk yükleme anında sistem durumu ile içerik durumu geçici olarak çelişiyor

- Durum: Canlı yeniden yükleme sırasında gözlendi ve 4 saniye sonra düzeldi.
- Öncelik: Orta.
- Konum: Uygulama kabuğu ve Yönetici Özeti ilk yükleme.
- Kanıt: Aynı canlı oturumdaki ardışık DOM gözlemleri.
- Gözlem: İlk durumda sol panel “Güvenli pilot modu”, KPI havuzu `0 TL` ve hedef `0/0` iken içerik “CPM canlı · salt okunur” ve €1.007.595 gösteriyordu. Yaklaşık dört saniye sonra “CPM bağlantısı etkin”, 3.219.777 TL ve 15/24 görüldü.
- Risk: Kullanıcı kısa süreliğine gerçek veri ile pilot/boş veri sinyalini aynı ekranda görür; ekran görüntüsü veya hızlı karar yanlış olabilir.
- Öneri: Veri yüklenirken KPI’ları göstermeyip tek bir loading state kullan; kaynak badge’i ile içerik verisi aynı state makinesinden üret.

## F-013 — CPM Denetim ve Satış ekranı kapsam farkı yeterince görünür değil

- Durum: İlk aritmetik şüphe düzeltildi; kapsam farkı kanıtlandı.
- Öncelik: Orta.
- Konum: Satış ve Kârlılık > KPI kartları; CPM Denetim > dışa aktarım/toplamlar.
- Kanıt: Canlı DOM ve `cpm-denetim-2026-tum-veri.csv` (31.08.2026 23:28:16 oluşturulmuş).
- CPM Denetim ham imzalı neti tip 17 + tip 85 + tip 91 − tip 18 = `226.875.914,60 TL`.
- Dışa aktarımda `excluded` durumundaki 79 test satırı `619.861,56 TL` brüt, `2.734,22 TL` iskonto ve `617.127,34 TL` net içeriyor.
- Bu satırlar çıkarıldığında kanonik net `226.258.787,26 TL` oluyor; Satış ekranının brüt `264.564.332,42 TL`, iade `2.380.829,99 TL` ve iskonto `35.924.715,17 TL` değerleri tam olarak aynı neti üretiyor.
- Risk: Kullanıcı iki ekranı yan yana karşılaştırdığında gerçek bir veri hatası varmış gibi algılayabilir; kapsam dışı satırların hangi ekranlarda dahil edildiği ilk bakışta anlaşılmıyor.
- Öneri: Her toplamda satır kapsamını, `excluded` tutarını ve “karşılaştırılabilir net” değerini açıkça göster; CPM Denetim dışa aktarımına dahil/hariç kapsam filtresini başlıkta taşı.

## 2026-09-02 kapanış doğrulaması

Bu bölüm, yukarıdaki ilk canlı bulguların güncel çalışma ağacı ve izole server candidate kanıtıyla yeniden sınıflandırılmasıdır. `fixed`, mevcut kod/regresyon testi ve uygun olduğunda candidate kanıtı ile doğrulanmış durumu; `partial`, kod/test düzeltmesi bulunmasına rağmen canlı görsel veya production hesabı kanıtının eksik olduğunu; `accepted-risk/blocked`, kapsam dışında bırakılmaması gereken gerçek açığı belirtir.

| Bulgu | Güncel durum | Kanıt |
|---|---|---|
| F-001, F-003 | fixed | Chart görünürlüğü, hata/boş/loading durumları ve responsive chart sözleşmeleri tam suite içinde GREEN. |
| F-002 | fixed for canonical metric scope | Ortak canonical metric ve cross-screen parity testleri GREEN; CPM candidate provenance 22.004/22.004 satırda sıfır ekonomik fark verdi. |
| F-004, F-006, F-007, F-010, F-012, F-013 | partial | Kod ve UI contract regresyonları mevcut; bu kapanış turunda her viewport için yeni ekran görüntüsü alınmadı. Canlı görsel kapanış için desktop/tablet/mobile smoke tekrarı gerekir. |
| F-005 | partial | EUR evidence state sözleşmesi ve fail-closed gate mevcut; canlı Hedef Takibi ekranının yeni kanıt görüntüsü bu turda alınmadı. |
| F-008 | fixed | Summary hook/runtime sözleşmesi build ve testlerle doğrulandı. |
| F-009 | fixed in repository scope | Secret scan ve deployment helper testleri temiz; production credential rotation geçmişi ayrıca altyapı sahibi tarafından doğrulanmalıdır. |
| F-011 | fixed for presentation policy | Owner totals teyitli/çıkarımsal/inceleme ayrımını koruyor; teyitli sahiplik yoksa performans sonucu olarak sunulmuyor. |
| F-014 | accepted-risk / not remediated | CPM bağlantısı candidate üzerinde uygulama read-only; DB hesabı hâlâ `sa` ve geniş yazma yetkili. Kullanıcı bu riski açıkça kabul etti; gerçek least-privilege hesabı oluşturulmadı. |
| F-015, F-018, F-019, F-020 | fixed | Financial consumer contract testleri GREEN; EUR alanı, audit calculated cost/gross profit, EUR margin ve currency-basket evidence doğrulandı. |
| F-021 | fixed | Server-side search/pagination ve eski belge arama regresyonları GREEN. |
| F-022 | partial / production evidence gap | `admin`, `reporting`, `operational` capability matrisi ve negatif testler GREEN; production identity provider varsayılanı hâlâ tek admin hesabı, ayrı gerçek rol hesaplarıyla canlı kanıt yok. |

### Güncel candidate finansal/readiness kanıtı

- Artifact SHA-256: `1e6884a21bd6b822a285172ad62ecef8a4d4c27c64238b922c66300669e2b258`.
- Aday container rootfs read-only ve CPM health `connected=true`, `readOnly=true`.
- 2026 canonical/source provenance: `22.004/22.004` satır; missing/extra/duplicate/null/malformed sayaçları `0`; net fark `0` kuruş; coverage `complete`.
- Readiness yalnız `inventory-source-not-verified` ve `official-cost-coverage-insufficient` nedeniyle `false`. Production deployment yapılmadı; CPM’ye DML/DDL gönderilmedi.

Bu nedenle tüm bulguların tamamen kapandığı iddia edilmemelidir: F-014 kabul edilmiş fakat çözülmemiş risk, F-022 production hesap kanıtı bekleyen bulgu, F-004/F-005/F-006/F-007/F-010/F-012/F-013 ise canlı görsel yeniden doğrulama bekleyen bulgulardır. Resmi finansal GO için inventory movement/WAC/opening evidence kapıları da açıktır.
