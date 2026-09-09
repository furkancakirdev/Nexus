# Nexus Uçtan Uca Denetim Raporu

Tarih: 31.08.2026  
Kapsam: Nexus canlı UI, kaynak kodu, Nexus CPM Denetim dışa aktarımı ve CPM'e salt-okunur doğrudan sorgu  
Sistem: CPM'den fatura ve maliyet verisi okuyarak yönetimsel satış, kârlılık, departman ve hedef raporları üreten Nexus yönetim paneli

## 1. Yönetici özeti

Nexus'un temel fatura hareketleri, CPM Denetim ekranı ve Satış ekranı arasında `excluded` test satırları ayrıştırıldığında kuruş seviyesinde uzlaşıyor. 21.913 ekonomik satır ve 5.709 benzersiz belge için CPM net hareketi 226.875.914,60 TL; 79 kapsam dışı test satırı çıkarıldığında karşılaştırılabilir net 226.258.787,26 TL ve Satış ekranındaki brüt-iade-iskonto hesabı ile aynıdır.

Bununla birlikte, Departman Analizi genel toplamının 1.969.422 EUR olması ve Yönetici Özeti/Satış toplamının yaklaşık 1.007.595 EUR olması açıklanmamış kritik bir kapsam farkıdır. Döviz, tarih, belge türü veya ledger kapsamı birebir tanımlanmadan bu iki ekran birlikte finansal gerçek kabul edilmemelidir.

En yüksek riskler: EUR modunda TL tutarın EUR etiketiyle gösterilmesi; Departman Analizi genel EUR marjının %0,0 gösterilmesi; kanıtlanmış maliyet satırında maliyet/kârın boş veya sıfır gösterilmesi; kişi bazlı tutarların %0 teyitli atıf kalitesine rağmen kesin sıralama gibi sunulmasıdır. Ayrıca üretim kimlik bilgilerinin kaynak yardımcı dosyalarında bulunması acil güvenlik olayı olarak ele alınmalıdır.

## 2. Öncelik sıralı hata listesi

Tam kanıt, tekrar üretme ve kaynak kökleri [`findings.md`](./findings.md) dosyasındadır.

### Kritik

- **F-002 — Ekranlar arası toplam ciro kapsamı uyuşmuyor.** Yönetici Özeti/Satış yaklaşık 1.007.595 EUR, Departman Analizi 1.969.422 EUR gösteriyor. Kaynakta iki ekran ayrı aggregation/EUR pipeline kullanıyor. Aynı yıl ve uygulama bağlamında bu farkın kapsam sözleşmesiyle açıklanması gerekir. Tekrar: aynı yılda iki ekranın genel toplamlarını karşılaştır. Çözüm: ortak kanonik ledger, tarih/durum/KDV/döviz dahillik sözleşmesi ve ekranlar arası mutabakat testi.
- **F-005 — EUR kur kanıtı hazır ve bekleniyor sinyalleri çelişkili.** Hedef Takibi'nde 8 dönem kur seti hazır denirken satırlar kanıt yok diyor. Tekrar: Hedef Takibi'ni aç ve üst banner ile aylık tabloyu karşılaştır. Çözüm: tek kanıt durumu state'i ve kanıt yoksa EUR sonucu göstermeme.
- **F-009 — Düz metin üretim kimlik bilgileri ve TLS doğrulamasını kapatan script'ler.** Tekrar: `reconcile_years.py`, `deploy_verify.py`, `cookies.txt` ve `secrets/` içeriğini incele. Çözüm: kimlik bilgilerini döndür, dosyalardan/geçmişten temizle, secret scan ekle, `curl -sk` kaldır.

### Yüksek

- **F-001/F-003:** Yönetici Özeti ve Departman Analizi trend grafikleri kartlar doluyken veri serisi göstermiyor. Ekranı aç, grafik alanını kontrol et. API veri şeması, SVG render ve browser smoke testi birlikte düzeltilmeli.
- **F-008:** `SummaryPage.jsx` hook kullanıyor ancak import sözleşmesi kaynakta eksik görünüyor; canlı bundle ile kaynak sürümünün ayrışması da kontrol edilmeli.
- **F-011:** Kişi sıralamasında teyitli atıf %0,00 iken tutarlar kesin performans sonucu gibi sunuluyor. Teyitli/varsayımsal/inceleme etiketlerini satır seviyesine indir.
- **F-014:** CPM bağlantısı uygulama seviyesinde salt-okunur niyet taşısa da DB hesabı `sa`. Gerçek SELECT-only login/rolüne geç.
- **F-015:** Satış trendinde Nisan için `€40.947.942` gösteriliyor; kaynakta EUR modunda TL `netSales` EUR formatlayıcıya veriliyor. EUR modunda `eurNetSales` kullan.
- **F-018:** CPM Denetim'de kanıtlı satır maliyeti `—`, detay hesabı `0 TL`; aynı kayıt Stok Araştırması'nda 10.279,85 TL maliyet gösteriyor. Kanonik maliyet/kâr alanlarını ortak hesap fonksiyonundan üret.
- **F-019:** Departman genel EUR marjı %0,0; doğru oran yaklaşık %43,8. `eurMargin` genel/departman metric'lerine eklenmeli.
- **F-021:** Belge Defteri sadece en güncel 500 satırı arıyor; eski bilinen belge 0 sonuç veriyor. Arama/filtre server-side olmalı.
- **F-022:** Kaynakta tek admin hesabı ve tek capability modeli var. Farklı rol hesabıyla canlı negatif test yapılamadı; role-based erişim doğrulanamadı.

### Orta / Düşük

- **F-004:** Stok tanı özeti boşluksuz metin render ediyor.
- **F-006:** Kanıt banner'larında ayraç/gap eksik.
- **F-010:** Uzun kişi, müşteri ve ürün adları tooltip olmadan kırpılıyor.
- **F-012:** İlk yüklemede pilot/boş durum ile canlı veri durumu kısa süre çelişiyor.
- **F-013:** CPM Denetim ham toplamı ile Satış kapsamı arasındaki `excluded` farkı başlıkta yeterince görünür değil.
- **F-016:** 768 px tablet genişliğinde header kurum adı taşıyor.
- **F-017:** EUR KPI'larında `EUR` soneki ve `€` öneki karışık kullanılıyor.
- **F-007:** Raporlar marka grafiğinde 20 bar DOM'da mevcut ancak koyu temada kontrast yetersiz olduğu için görsel olarak neredeyse boş görünüyor; tema uyumlu renk ve legend gerekli.

## 3. CPM vs Nexus veri karşılaştırması

### Genel toplam

| Karşılaştırma | Tutar | Sonuç |
|---|---:|---|
| CPM Denetim ham net hareketi | 226.875.914,60 TL | 21.913 satır; 79 test satırı dahil |
| `excluded` test satırları | 617.127,34 TL | 79 satır; Satış kapsamı dışı |
| CPM karşılaştırılabilir net | 226.258.787,26 TL | Ham net - excluded |
| Nexus Satış: brüt - iade - iskonto | 226.258.787,26 TL | Kuruş seviyesinde eşleşiyor |
| Nexus Yönetici Özeti net satış | yaklaşık 1.007.595 EUR | Satış kapsamıyla aynı ledger/döviz sözleşmesi ayrıca belgelenmeli |
| Nexus Departman Analizi geneli | 1.969.422 EUR | Yönetici Özeti'nden 961.827 EUR daha yüksek; kök neden açıklanmadı |

### Kişi bazlı toplamlar

Doğrudan CPM'den üretilen net tutarlar, Nexus Sorumlu sıralamasıyla kuruş seviyesinde eşleşiyor. Farklar yalnızca ekran yuvarlamasıdır.

| Kullanıcı | CPM net | Nexus | Fark |
|---|---:|---:|---:|
| MKARA | 52.688.508,63 TL | 52.688.509 TL | 0,37 TL |
| CBELIKIRIK | 39.245.083,48 TL | 39.245.083 TL | 0,48 TL |
| FURKAN | 36.937.822,52 TL | 36.937.823 TL | 0,48 TL |
| MAYAZ / Tanımsız kullanıcı | 21.881.333,01 TL | 21.881.333 TL | 0,01 TL |
| BCETINEL | 19.306.317,79 TL | 19.306.318 TL | 0,21 TL |
| EERDOGAN | 18.588.403,56 TL | 18.588.404 TL | 0,44 TL |
| AERIMLI | 11.289.013,48 TL | 11.289.013 TL | 0,48 TL |
| NTOKER | 7.276.731,90 TL | 7.276.732 TL | 0,10 TL |
| TSEMIZ | 597.987,45 TL | 597.987 TL | 0,45 TL |

Nitelikli sınır: toplamlar matematiksel olarak doğru olsa da atıf kalitesi %0 teyitli, %91,85 çıkarımsal ve 18.447.585,44 TL inceleme durumunda. Bu nedenle performans sonucu olarak kesinleştirilmeden “aday/inceleme” etiketi kullanılmalıdır.

## 4. Quick win vs kapsamı büyük iyileştirmeler

### Quick win

- Ortak EUR formatlayıcı ve `topSalesMonth.eurNetSales` düzeltmesi.
- `eurMargin` ve aylık `byCurrency` agregasyon testleri.
- Audit satırında `calculatedCost`/`grossProfit` alanlarını kanonik hesap fonksiyonuna bağlama.
- Banner, KPI ve stok tanı metinlerinde ayrı label/value bileşenleri.
- Grafikler için veri yok, yükleniyor ve hata durumlarını ayırma.
- `excluded` kapsamını tüm toplam kartlarında gösterme.
- Header tablet breakpoint ve ad tooltip'leri.

### Kapsamlı emek

- Yönetici Özeti, Satış ve Departman Analizi için tek kanonik ekonomik ledger ve ortak dönem/döviz sözleşmesi.
- Tüm Belge Defteri filtrelerini server-side yapma ve indeksleme.
- Teyitli/varsayımsal/inceleme atıf modelini performans ekranlarına taşıma.
- Gerçek RBAC ve role-specific API veri kapsamı.
- CPM için SELECT-only DB hesabı, secret rotation ve güvenli TLS/credential pipeline.

## 5. Genel sistem iyileştirme önerileri

1. Her finansal KPI için dönem, belge türü, durum, KDV, para birimi, kur kaynağı ve kapsam dışı satır politikasını ekranda açıkça gösterin.
2. Tek bir `MetricContract` ile net satış, kâr, marj ve döviz kanıtını tüm modüllerde aynı hesaplatın.
3. Her dashboard için API fixture, CPM mutabakatı, filtre/pagination, responsive screenshot ve browser console/network smoke test'lerini CI kapısı yapın.
4. Kişi performans ekranlarında atıf güven seviyesini tutarın yanında gösterin; teyitsiz veriyi resmi performans olarak sunmayın.
5. Üretim erişimlerini kaynak koddan tamamen çıkarın, credential döndürme sonrası geçmiş arşivleri tarayın ve CPM entegrasyonunu DB izinleriyle gerçekten salt-okunur hale getirin.

## Doğrulama sınırları

## 2026-09-02 güncel kapanış özeti

Güncel kod/test ve izole server candidate doğrulaması sonucunda F-001, F-002, F-003, F-008, F-009, F-011, F-015, F-018, F-019, F-020 ve F-021 için düzeltme kanıtı bulunmaktadır. F-004, F-005, F-006, F-007, F-010, F-012 ve F-013 için kod/regresyon kanıtı mevcut olmakla birlikte bu turda yeni viewport ekran görüntüsü alınmadığından canlı görsel kapanışları `partial` bırakılmıştır.

F-014 çözülmemiş ancak kullanıcı tarafından açıkça kabul edilmiş `sa`/CPM geniş yetki riski olarak kalır. F-022 için RBAC capability matrisi ve negatif testler GREEN olsa da production’da ayrı gerçek rol hesapları bulunmadığından canlı kanıt eksiktir. Bu iki konu “tamamen çözüldü” olarak raporlanmamıştır.

Son server candidate kanıtı: artifact SHA-256 `1e6884a21bd6b822a285172ad62ecef8a4d4c27c64238b922c66300669e2b258`; canonical/source provenance `22.004/22.004`, mismatch sayaçları `0`, net fark `0` kuruş, coverage `complete`. Readiness yalnız `inventory-source-not-verified` ve `official-cost-coverage-insufficient` nedeniyle `false` kalmıştır. Production deployment yapılmamış, CPM’ye yalnız salt-okunur sorgular gönderilmiştir.

- Farklı roller için canlı negatif erişim testi yapılamadı; ayrı test hesapları gerekli.
- Raporlar Merkezi grafik kanıtı tam sayfa ve DOM denetimiyle alındı; veri barlarının mevcut, ancak koyu temada düşük kontrastlı olduğu doğrulandı.
- CPM sorguları salt-okunur `SELECT` olarak çalıştırıldı; CPM'de hiçbir yazma yapılmadı.
- Brüt marj ve çoklu döviz maliyet modeli, kullanıcının sağladığı model metni ve kaynak kodundaki kanıt sözleşmeleriyle değerlendirildi; model dışı yeni bir finansal varsayım yapılmadı.
