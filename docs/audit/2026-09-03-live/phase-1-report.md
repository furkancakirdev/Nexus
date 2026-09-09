# Marlin Nexus Faz 1 — Eleştirel Görsel Denetim

Denetim tarihi: 2026-09-03  
Kapsam: canlı Nexus yönetim yüzeyi; 10 ana menü, Departmanlar alt görünümleri, Raporlar alt görünümleri, Görünüm Ayarları ve Havuz Kuralları modalları.  
Kanıt: aynı çalıştırmada yakalanan ekran görüntüleri ve DOM görünürlük kayıtları. CPM'e yazma yapılmadı.

## 1. Yönetici özeti — en kritik 5 bulgu

1. **Satışlar ekranı görsel olarak çökmüş durumda (Kritik).** Canlı görüntüde 7 KPI kartı, grafik ve tablo düzeni beklenen kart/grid görünümünü almıyor; içerik sol kenarda dikey bir metin akışı gibi görünüyor. Kaynakta `SalesPage.jsx` `control-kpis`, `sales-charts-layout` ve `control-table` sınıflarını kullanıyor; `styles.css` ise bunları tanımlamıyor, yalnızca `sales-kpis`, `sales-table` ve ilgili eski sözleşmeleri tanımlıyor. Bu doğrudan frontend CSS/JSX sözleşme hatasıdır.
2. **Aynı tutar “Net satış” etiketiyle farklı kapsamda yayınlanıyor (Kritik).** Özet KPI: `267.481.184 TL`; Satışlar net satış: `228.509.988 TL`; fark `38.971.196 TL`, Satışlar ekranındaki iadeler `2.383.414 TL` ve iskontolar `36.587.782 TL` toplamına birebir eşit. Özet bileşeni `totals.sales` değerini “Net satışlar” diye basarken anlatı içinde aynı değeri “brüt satış” diye adlandırıyor. İlk bakışta bu, frontend etiket/kaynak bağlama kusuru olarak düzeltilebilir.
3. **Maliyet kanıtı ve kapsamı ekranlar arasında güven vermiyor (Kritik).** Departmanlar `95,0%` ve `20.968 / 22.061` satır kapsamı gösterirken Satışlar `0 / 0` kapsam, Raporlar `22.061` satırın tamamını inceleme ve Havuz “ortalama doğrulanmış kapsam %11,6” diyor. Bunlar aynı kapsam metriği değilse açıkça adlandırılmalı; aynı olması gerekiyorsa API/kanonik veri sözleşmesi backend’e raporlanmalıdır.
4. **Karanlık tema varsayılan/kalıcı görünür durumda ve kritik metinler düşük kontrastlı.** Canlı root teması `dark`; zemin `rgb(17,24,39)`, panel `rgb(24,35,52)`. Ölçülen oranlar: gövde açıklaması `3,71:1`, panel açıklaması `3,31:1`, KPI alt metni `4,43:1`; normal boyutlu metin için WCAG AA olan `4,5:1` eşiğinin altında. Büyük beyaz başlıklar iyi ayrışıyor ancak finansal yoğunlukta ikincil metin okunabilirliği düşüyor.
5. **Onay ve veri inceleme akışları uyarı üretiyor ama karar aksiyonunu tamamlamıyor (Yüksek).** Onay ekranı 9 dönemi “Onay bekliyor” gösteriyor; seçili dönem paneli uzun beklemeden sonra yalnız “Onaylar okunuyor / Sunucu durumu yükleniyor” ve “Havuza dön” sunuyor. Raporlar’daki `228.509.988 TL / 22.061 satır inceleme` uyarısında doğrudan Denetim’e git CTA’sı yok. Stok Araştırması “Kaynak kullanılamıyor” durumunda; yeniden dene/kaynağı kontrol et aksiyonu yok.

## 2. Ekran/modül bazlı bulgu tablosu

| Ekran / bileşen | Spesifik bulgu | Kategori | Önem |
|---|---|---|---|
| Giriş | Güvenlik açıklaması küçük ve ikincil; hata/oturum süresi davranışı bu turda üretilemedi. | Tutarlılık | Orta |
| Özet / KPI alanı | 4 KPI iyi hizalanmış; ancak “Net satışlar” kartı brüt toplamı kullanıyor. 5 saniyelik karar için 0 TL havuzun nedenini kart üzerinde doğrudan açıklamıyor. | Veri Güveni / Bilgi Mimarisi | Kritik |
| Özet / Yazılı analiz | Aynı bölümde iki ayrı Ocak seçicisi görünüyor; hangisinin rapor dönemi, hangisinin karşılaştırma dönemi olduğu etiketsiz. “En güçlü kâr ayı Ocak (0 TL)” ifadesi veri yetersizliğini başarı/başarısızlık gibi sunuyor. | Bilişsel Yük / Veri Güveni | Yüksek |
| Özet / Dikkat Gerektirenler | 9 maliyet incelemesi, 15 hedef ve 22 personel parametresi tıklanabilir; bu alan aksiyon açısından iyi. Ancak kartlar öncelik sırasını önem derecesiyle ayırmıyor. | Aksiyon / Bilgi Mimarisi | Orta |
| Satışlar / KPI grid | 7 KPI var; CEO için 3–4 birincil metrik yerine tüm metrikler aynı ağırlıkta. Canlı görüntüde kart CSS’i uygulanmadığı için ikon, değer ve açıklama birbirinden kopuk. | Okunabilirlik / Bilişsel Yük | Kritik |
| Satışlar / trend grafiği | 5 seri, iki eksen ve 9 dönem aynı görselde; maliyet ve kâr kanıtı yokken grafik karar verisi gibi duruyor. JSX’in `sales-charts-layout` sınıfı için görünür grid kuralı yok. | Okunabilirlik / Bilişsel Yük | Kritik |
| Satışlar / Döviz Sepeti | `İNCELEME` satırı “EUR toplamına dahil edilmez” diyor, ancak aynı ekranın ana KPI’ları TL ile devam ediyor; aktif raporlama para birimi açıkça tekil değil. | Veri Güveni | Yüksek |
| Satışlar / aylık defter | 10 sütun: brüt, iade, iskonto, net, maliyet, kâr, 2 marj ve kapsam. Varsayılan CEO görünümü için fazla geniş; kritik sağ kolonlar ilk bakışta görünmüyor. | Bilişsel Yük / Okunabilirlik | Yüksek |
| Departmanlar / Genel Bakış | 6 KPI + 4 alt görünüm + 6 başlık; `Teyitli atıf %0,0` yanında `Kullanıcı eşlemesi %70,5` var. Kanıt kalitesi ile ticari performans aynı görsel ağırlıkta. | Bilişsel Yük / Veri Güveni | Yüksek |
| Departmanlar / Sorumlu, Ürün & Müşteri | “Ticari Sorumlular”, ürün ve müşteri blokları veri yoksa “bulunamadı” ile bitiyor; neden/sonraki adım yok. | Aksiyon / Empty state | Orta |
| Departmanlar / Belge Defteri | 11 sütunlu belge tablosu; Detay, teslimat ve kanıt aynı satırda. “İnceleme gerekli” satırı var fakat toplu inceleme/filtreye geçiş CTA’sı yok. | Bilişsel Yük / Aksiyon | Yüksek |
| Departmanlar / CPM Pilot İzleme | Yeni atıf akışı anlatılıyor, fakat gerçek pilot siparişleri bulunamadığında kanıt kapsamı ve ilk kurulum aksiyonu görünür değil. | Aksiyon / Veri Güveni | Orta |
| Veri Denetimi | 4 KPI + 7 filtre + 7 görünür sütun; filtreler uppercase küçük etiketlerle yoğun. 0 satırda dışa aktarma disabled, yenileme/bağlantı teşhisi yok. | Bilişsel Yük / Aksiyon | Yüksek |
| Veri Denetimi / tablo | Kritik `Satır maliyeti`, `Brüt kâr`, `Doğrulama` kolonları sağda; yatay kaydırma açıklaması olsa da ilk görünümde karar verisi görünmüyor. | Okunabilirlik | Kritik |
| Stok Araştırması | “Kaynak kullanılamıyor” ve “CPM defteri okunuyor” aynı akışta; 10 sütunlu boş tablo ve disabled CSV var. Kullanıcı neyi düzeltmesi gerektiğini anlayamıyor. | Aksiyon / Empty state | Yüksek |
| Havuz | 9 sütunlu aylık tablo, 5 adımlı hesap açıklaması ve yan özet aynı sayfada. 0 TL sonuç yanında satış/iade/iskonto/maliyet rakamları mevcut; hedef bandı nedeniyle sıfır olduğunu daha görünür anlatmalı. | Bilişsel Yük / Veri Güveni | Yüksek |
| Havuz / Havuz Kuralları modalı | Modal anlaşılır ve salt-okunur sınırını net belirtiyor; ancak “Yıl sonunda mahsup” gibi kritik kuralın etkisi örneklenmiyor. | Tutarlılık | Orta |
| Hedef Takibi | 4 KPI + 10 sütunlu tablo; 12 ayın gelecekteki ayları 0 TL ve “Dağıtım muaf” ile aynı yoğunlukta listeleniyor. Geçmiş/gelecek ayrımı görsel olarak zayıf. | Bilişsel Yük / Veri Güveni | Yüksek |
| Raporlar Merkezi | 9 alt sekme; her sekme aynı 5–6 sütunlu tablo şablonunu tekrar ediyor. 9 sekme CEO taramasını parçalıyor. | Bilgi Mimarisi | Yüksek |
| Raporlar / finansal kanıt | `İnceleme gerekli · KDV hariç` 228,5M TL ve 22.061 satır; doğrudan Denetim’e götüren buton yok. | Aksiyon | Kritik |
| Onay & Kapanış | 9 dönem onay bekliyor, 9 görünür veri riski; seçili panelde gerçek onay/reddet/düzelt aksiyonu görünmüyor ve “Onaylar okunuyor” durumu kalıcı. | Aksiyon | Kritik |
| Ayarlar | 5 ayar bölümü tek ekranda; save disabled ve reset aynı üst sırada, değişiklik kapsamı karar verici için açıklanmıyor. Görünüm modalındaki tema/yoğunluk tercihi ürünün finansal varsayılanıyla çelişiyor. | Bilişsel Yük / Tutarlılık | Yüksek |
| Görünüm Ayarları modalı | 5 tercih ve iki genel aksiyon tek drawer’da; tema “Koyu”, yoğunluk “Kompakt” seçili. Bu tercih canlı denetimde tüm ekranı ağırlaştırıyor. | Okunabilirlik / Tutarlılık | Yüksek |

## 3. Veri Tutarsızlıkları

| Metrik | Ekran A | Ekran B/C | Fark | Kök neden tahmini |
|---|---|---|---:|---|
| Net satış | Özet KPI: **267.481.184 TL** | Satışlar net satış ve Raporlar inceleme tutarı: **228.509.988 TL** | **38.971.196 TL** | **Frontend kesin:** Özet `totals.sales` değerini “Net satışlar” diye etiketliyor; fark Satışlar iadeleri `2.383.414` + iskontoları `36.587.782` ile birebir eşit. Özet kartı “Brüt satışlar” olmalı veya net hesap render edilmelidir. |
| Brüt satış | Özet anlatı: **267.481.184 TL brüt satış** | Havuz satışlar toplamı: **267.481.184** | 0 | Aynı brüt kaynak kullanılıyor; sorun değer değil, Özet KPI etiketinin “Net satışlar” olması. |
| Maliyet | Havuz: **22.864.193 TL** | Satışlar: **— / 0 kapsam**, Raporlar: **0 TL maliyet + 22.061 inceleme satırı** | Semantik olarak büyük | **Backend/API sözleşmesi veya frontend tüketici ayrışması:** Havuz legacy/özet maliyet tahminini gösteriyor olabilir; Satışlar ve Raporlar resmi kanıt kapısını fail-closed uyguluyor. UI’de “tahmini maliyet” ile “resmi kanıtlı maliyet” ayrımı yapılmadan birlikte sunulmuş. Backend’e raporlanmalı; frontend yalnız etiket/kapsam ayrımını düzeltebilir. |
| Maliyet kapsamı | Departmanlar: **%95,0 — 20.968 / 22.061** | Havuz: **%11,6 ortalama doğrulanmış kapsam**; Satışlar: **0 / 0** | Aynı isimli sinyalde çelişki | **Backend/API veya metrik tanımı:** satır sayısı kapsamı, ağırlıklı TL kapsamı ve kanıtlı resmi kapsam birbirine karışmış olabilir. Tek bir `coverageScope` ve açıklama olmadan karar verilemez; backend bulgusu. |
| Brüt kâr / net marj | Satışlar: **—**, aylık satırda **€0 / %0,0** | Departmanlar: **0 TL / %0,0**; Havuz: **0** | Değerler kısmen eşleşiyor ama anlamı belirsiz | Maliyet kanıtı eksikken 0 gösterimi kullanıcıyı “kâr yok” sonucuna iter. Canonical katman null/inceleme durumunu destekliyor; **frontend render kusuru**: `0` ve `%0,0` yerine “Veri yetersiz / resmi kâr yayınlanmıyor” gösterilmeli. |
| Para birimi | Özet, Havuz, Hedef, Departman çoğunlukla **TL** | Raporlar KPI’larında **EUR**, Satışlar döviz sepetinde kaynak dövizleri ve bazı satırlarda **€0** | Tek bir ekranlar arası ana birim yok | **Frontend sunum/IA:** EUR yalnız tam kanıt varsa aktif olmalı; TL, EUR ve kaynak dövizi her kartta kapsam etiketiyle ayrılmalı. API’nin EUR fail-closed davranışı korunmalı. |
| Onay bekleyen dönem | Onay ekranı: **9** | Özet dikkat alanı: maliyet incelemesi **9**; doğrudan onay sayısı CTA ile eşlenmiyor | Kavramsal eşleme belirsiz | **Frontend bilgi mimarisi:** “maliyet incelemesi” ile “yönetim onayı” ayrı işler; aynı sayı tesadüfen eşit olsa bile ortak badge gibi sunulmamalı. |

## A) Okunabilirlik / kontrast özeti

- Koyu mod canlıda aktif. Başlık ve nav kontrastı güçlü; ikincil metinler değil.
- Ölçülen normal metin oranları: gövde açıklaması `3,71:1` (AA altında), panel açıklaması `3,31:1` (AA altında), KPI açıklaması `4,43:1` (4,5 AA eşiğinin hemen altında).
- Grafik çizgileri genel olarak görünür; ancak Satışlar ekranındaki broken layout nedeniyle grafik alanı ilk bakışta doğru bileşen olarak algılanamıyor. Çok serili çift eksenli grafik, veri yokken çizgi/0 değerlerini karar sinyali gibi gösteriyor.
- Denetim tablosunda sağdaki maliyet/kâr/doğrulama alanları yatay scroll arkasında. Bu, önceki “kritik sağ kolonların ilk görünmemesi” bulgusunu canlıda doğruluyor.

## B) Aksiyon boşlukları

| Uyarı/durum | Mevcut durum | Olması gereken tek tık aksiyon |
|---|---|---|
| `9 dönem maliyet incelemesi var` | Özetten Denetim’e gider; iyi örnek | Denetim’e aynı yıl + “İnceleme gerekli” filtresiyle git |
| `İnceleme gereken tutar: 228.509.988 TL · 22.061 satır` | Raporlar’da CTA yok | “Denetimde incele” |
| `9 dönem Onay bekliyor` | Onay ekranında durum etiketi; onay aksiyonu görünmüyor | “Bekleyenleri aç”, dönem seç, toplu/tekli “İncele → Onayla/Reddet” |
| `Görünür veri riski: 9` | KPI olarak var, açıklama var | “Riskli dönemleri filtrele” |
| `Kaynak kullanılamıyor` | Stok Araştırması’nda pasif durum | “Bağlantıyı yeniden dene” + neden + salt-okunur bağlantı durumu |
| `CPM okunuyor… / Sunucu durumu yükleniyor` | Uzun bekleme halinde kalıyor | “Yenile”, son deneme zamanı, hata nedeni ve ilgili kaynağa git |
| `0 TL / %0,0` maliyet-kâr alanları | Veri yetersizliği 0 gibi sunuluyor | “Kapsam eksik — resmi kâr yayınlanmıyor” + Denetim’e git |
| `Tüm veriyi indir` disabled / `CSV İndir` disabled | Neden açıklanmıyor | “Veri hazır değil; yeniden dene” veya disabled nedeni tooltip/metin |

## Backend’e iletilecek bulgular

1. Departman kapsamı `%95,0`, Havuz doğrulanmış kapsamı `%11,6` ve Sales/Raporlar resmi kapsamı `0/0` aynı resmi kanıt alanını temsil ediyorsa API kontratı düzeltilmeli; temsil etmiyorsa isim ve kapsam sınıfları API’de açıkça taşınmalı.
2. Havuz maliyeti `22.864.193 TL` yayınlanırken resmi kâr tüketicileri maliyeti yok sayıyorsa, tahmini maliyet ile resmi kanıtlı maliyetin backend response alanlarında ayrıştırılması korunmalı ve tüm tüketiciler aynı kanonik alanı kullanmalı.
3. Onay ekranının dönem snapshot/approval durumunu sürekli “okunuyor” bırakması canlı backend yükleme/endpoint hatasıysa izlenebilir hata durumu ve retry sözleşmesi sağlanmalı.

## Frontend’de düzeltilebilir bulgular

- `SalesPage.jsx` sınıflarını mevcut CSS sözleşmesiyle hizalamak veya yeni sınıfları eksiksiz tanımlamak.
- Özet KPI etiketini brüt/net doğru bağlamak; tek merkezi para ve null/inceleme render katmanı kullanmak.
- `%0,0`, `€0` ve `0 TL` gibi veri yetersizliği çıktısını dürüst empty/review state’e çevirmek.
- Raporlar, Onay, Stok ve Denetim uyarılarına bağlamsal CTA eklemek.
- Koyu temayı varsayılan olmaktan çıkarmak; minimum AA kontrast token’ları uygulamak.
- 9 Rapor sekmesini karar odaklı gruplamak; geniş tabloları 4–5 kritik varsayılan sütun + detay paneline indirmek.

## Kanıt dosyaları

Bu çalıştırmada yakalanan ekran görüntüleri `docs/audit/2026-09-03-live/` altındadır: `01-summary.png`, `02-Satışlar.png`, `03-Departmanlar.png`, `04-Veri-Denetimi.png`, `05-Stok-Araştırması.png`, `06-Havuz.png`, `07-Hedef-Takibi.png`, `08-Raporlar.png`, `09-Onay-and-Kapanış.png`, `10-Ayarlar.png`, `11-appearance-modal.png`, `12-pool-policy-modal.png`.

## Faz sınırı

Faz 1 tamamlandı. Faz 2’ye geçilmedi; tasarım sistemi, redesign, CSS/JS değişikliği veya backend değişikliği yapılmadı. Kullanıcı onayı bekleniyor.
