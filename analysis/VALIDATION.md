# Marlin Nexus doğrulama kaydı

## Birleşik nihai fatura defteri · 28 Temmuz 2026

Dağıtım durumu: **Üretimde ve doğrulandı**.

- Üretim adresi: `http://192.168.12.11:4318`
- Dağıtılan commit: `13e0606`
- Üretim imajı: `sha256:355e7ec79febf67443e97cd6485a2882880b2cefbe89f8c8239dd2caa8758224`
- Geri dönüş imajı: `marlin-nexus-rollback:20260728-155832-7b8dba1`
- CPM bağlantısı: `live`, `readOnly: true`, `Marlin_Uyg`

### Finansal uzlaşı

Canlı üretim doğrulaması `qa/final-ledger/production-validation.json` dosyasına
kaydedildi. Özet, departman, denetim defteri ve atıf toplamları üç yılın
tamamında kuruş seviyesinde uzlaştı:

| Yıl | KDV hariç net satış | Hedefe atanan satış | İnceleme gerekli | Denetim satırı |
| --- | ---: | ---: | ---: | ---: |
| 2024 | 152.936.676,03 TL | 152.717.337,11 TL | 219.338,92 TL | 25.789 |
| 2025 | 238.357.967,21 TL | 238.155.493,57 TL | 202.473,64 TL | 29.834 |
| 2026 | 193.089.413,13 TL | 192.871.169,73 TL | 218.243,40 TL | 19.232 |

- Özet → departman, özet → denetim, hedef → atanmış departman ve aylık havuz
  → özet farkları her yıl `0,00 TL`.
- Geçici ekonomik satır, dönüştürülmüş perakende ekonomik satırı, Bircan
  sahipliği, müşteri-kartı sahipliği ve ayrılış sonrası Özlenen Gençoğlu
  sahipliği sayıları `0`.
- İnceleme gerekli satışlar hedef gerçekleşmesine zorla atanmadı; görünür
  inceleme tutarı toplam satış uzlaşısının içinde korunuyor.
- `SSP-00979` dışlama işareti korunuyor.

### Performans

Canlı üretim sonucu `qa/final-ledger/production-performance.json` dosyasındadır.
Her yılın SQL defterini zorla yenileyen soğuk ölçümler `77,6–95,1 saniye`
aralığındadır. Kullanıcının normal ekran akışını temsil eden sıcak önbellek
ölçümleri:

| Uç | p95 |
| --- | ---: |
| Özet | 126,75 ms |
| Departman analizi | 249,97 ms |
| Hedefler | 53,17 ms |
| Denetim defteri | 144,01 ms |
| Birleşik sıcak p95 | 241,61 ms |

Tüm sıcak uçlar `1.000 ms` kabul sınırının altında ve birleşik ölçüm `250 ms`
yönetim hedefini karşılıyor. İlk konteyner açılışındaki 2025/2026 ön ısıtması
yaklaşık 182 saniye sürdü; bu ilk yükleme süresidir, sıcak ekran gecikmesi
değildir.

### Arayüz doğrulaması

Staging üzerinde Özet, Satışlar, Departmanlar, Veri Denetimi, Hedef Takibi,
Ayarlar ve Onay & Kapanış sayfaları `1440×900`, `768×1024` ve `390×844`
boyutlarında doğrulandı. Toplam 21 görünümde sayfa yatay taşması, üst başlık
çakışması, kontrolsüz içerik taşması veya yüklemede takılma görülmedi.

- Üretim Ticari Sorumlular listesinde `S001`, `DBS003` ve `A3149` gibi cari
  kartlar yok.
- Mehmet Kara, Furkan Çakır ve Burak Çetinel tam adlarıyla Servis
  departmanında gösteriliyor.
- Veri Denetimi ilk görünümünde Belge, Stok/Hizmet, Satış Net, Satır
  Maliyeti, Brüt Kâr ve Doğrulama sütunlarının tamamı görünür.
- Üretim tarayıcı konsolunda hata veya uyarı oluşmadı.

### Operasyon notları

- Üretim öncesi kaynak, uygulama durumu ve eski imaj yedekleri korundu.
- Staging konteyneri, ara Nexus imajları ve geçici yükleme dizinleri dağıtım
  sonrasında kaldırıldı.
- Sunucu disk kullanımı `%94` seviyesinden `%90` seviyesine indirildi; doğrulama
  sonunda yaklaşık `4,0 GB` boş alan vardı.
- CPM yalnızca okunur veri kaynağıdır; doğrulama ve dağıtım sırasında CPM'e
  yazma yapılmadı.

## Önceki CPM dönüşüm analizi notu

## Değerlendirme

Paylaşım durumu: **Caveatlarla paylaşılabilir**.

## Doğrulanan hesaplar

- Canlı `/api/overview?year=2026` sonucu yeniden okunarak Ocak-Haziran ürün net satışı `126.055.729,93 TL` ve ürün brüt katkısı `48.790.154,11 TL` olarak bağımsız hesaplandı; kaydedilen analizle fark sırasıyla `0 TL` ve yuvarlama seviyesinde `0,001276 TL`.
- 2026 ilk yarı maliyet kapsamı canlı satır toplamlarından yeniden hesaplandı ve `%94,91` ile kaydedilen değer eşleşti.
- 2026 denetim durumları (`verified + configured + review + excluded`) `18.352` satıra eşit; denetim toplamıyla tam mutabakat var.
- Yıllık karşılaştırmada 2024 ve 2025 tam yıl, 2026 ise 16 Temmuz'a kadar kısmi dönemdir. Yıllık büyüme iddiası üretilmedi; büyüme karşılaştırmaları yalnız Ocak-Haziran eşit dönemleri arasında yapıldı.

## Zorunlu caveatlar

- Raporlanan kârlılık resmi/net şirket kârı değildir. Güncel bordro, genel muhasebe tahakkukları ve amortisman kaynakları CPM'de yeterli değil; çıktı “CPM kayıtlı ürün katkısı/faaliyet görünümü” olarak kullanılmalıdır.
- İŞÇİLİK, SRF, TSR, YOL ve BARNACLE maliyetleri gerçek gider yerine yönetimce tanımlanan pilot oranlara dayanır.
- Satıştan önce alımı bulunmayan satırlarda sonraki ilk alım kullanıldığı için geçmiş dönem maliyetleri yeni alımlar geldikçe yeniden şekillenebilir; bu satırlar ayrıca işaretlenmelidir.
- `ANONİM` marka grubu yüksek paya sahip olduğundan marka yoğunlaşması gerçek marka konsolidasyonundan etkilenebilir.
- Tedarikçi payı, satın alma harcaması değil; satış satırlarına eşlenen doğrulanmış maliyet atfıdır.
- API müşteri kodunu içeriyor fakat cari unvanını içermiyor. Müşteri yoğunlaşması kod bazında güvenilir; müşteri-segment politikaları için cari kart zenginleştirmesi gerekir.
- Kaynak belge bağlantısı yıllara göre yaklaşık `%76-%81`; kalan satırlar teklif-sipariş-servis dönüşüm hunisi analizini sınırlar.

## Kaynaklar

- `analysis/cpm-live-evidence-2026-07-16.json`
- `analysis/cpm-portfolio-analysis.mjs`
- Canlı salt-okunur Marlin Havuz API; CPM `Marlin_Uyg`, şirket `01`.
