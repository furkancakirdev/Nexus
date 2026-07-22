# CPM dönüşüm analizi doğrulama notu

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
