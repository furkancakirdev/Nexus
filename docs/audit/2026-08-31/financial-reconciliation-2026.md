# 2026 finansal ara mutabakatı — 31.08.2026 canlı denetimi

## Kaynak ve kapsam

- Nexus canlı `CPM Denetim` ekranından indirilen dışa aktarım: `cpm-denetim-2026-tum-veri.csv`.
- Oluşturulma zamanı: 31.08.2026 23:28:16.
- Satır sayısı: 21.913.
- Benzersiz belge kimliği: 5.709 (`belge türü + belge no`).
- Tutarlar CSV’de nokta ondalık formatında parse edildi; Türkçe binlik parse edilmedi.

## CSV belge türü toplamları

| Tip | Satır | KDV hariç net | KDV hariç brüt | KDV dahil |
|---:|---:|---:|---:|---:|
| 17 | 15.429 | 176.881.884,29 TL | 205.242.372,36 TL | 209.832.173,29 TL |
| 18 | 154 | 2.380.829,99 TL | 2.664.770,74 TL | 2.856.995,77 TL |
| 85 | 2.170 | 13.445.626,59 TL | 15.539.480,17 TL | 16.134.466,45 TL |
| 91 | 4.160 | 38.929.233,71 TL | 44.402.341,45 TL | 46.698.111,98 TL |

## Kanıtlanan sonuç

İmzalı net hareket hesabı:

`Tip 17 + Tip 85 + Tip 91 − Tip 18 = 226.875.914,60 TL`

Nexus CPM Denetim ekranı bunu yuvarlayarak `226.875.915 TL` gösteriyor. Bu nedenle CPM Denetim özeti ile kendi dışa aktarımı arasında bu metrikte yaklaşık kuruş yuvarlama dışında fark yok.

## Satış ekranı kapsam uzlaştırması

Satış ve Kârlılık ekranı şu değerleri gösteriyor:

- Brüt satış: `264.564.332 TL`
- İade: `2.380.830 TL`
- İskonto: `35.924.715 TL`

Bu üç değerle hesaplanan net satış `226.258.787 TL` olur. Ham CPM Denetim net hareketi ile görülen `617.127,60 TL` fark, dışa aktarımda `excluded` olarak işaretlenen 79 test satırından kaynaklanır. Bu satırların toplamı `619.861,56 TL` brüt, `2.734,22 TL` iskonto ve `617.127,34 TL` net tutardır. Hariç bırakıldıklarında kanonik net `226.258.787,26 TL` olur ve Satış ekranıyla kuruş seviyesinde eşleşir.

Sonuç: Satış ekranının brüt−iade−iskonto aritmetiğinde kanıtlanmış hata yoktur. Ancak CPM Denetim ham toplamı ile Satış kapsamı arasındaki `excluded` farkı kullanıcıya yeterince görünür değildir.

## Kişi bazlı kapsam sınırı

İlk CPM Denetim CSV’sinde satış temsilcisi/ticari sorumlu alanı bulunmuyordu. Bunun üzerine üretim Nexus sunucusundaki izinli `final-invoice-ledger-v1` sorgusu, CPM veritabanına doğrudan bağlanılarak salt-okunur şekilde çalıştırıldı. Sorgu 21.913 ekonomik satır, 42.830 lineage satırı ve 99.210 aktör olay satırı döndürdü.

| CPM/Nexus sorumlu | CPM’den hesaplanan net | Nexus ekranı | Fark |
|---|---:|---:|---:|
| Mehmet Kara (MKARA) | 52.688.508,63 TL | 52.688.509 TL | 0,37 TL yuvarlama |
| Can Belikırık (CBELIKIRIK) | 39.245.083,48 TL | 39.245.083 TL | 0,48 TL yuvarlama |
| Furkan Çakır (FURKAN) | 36.937.822,52 TL | 36.937.823 TL | 0,48 TL yuvarlama |
| Tanımsız kullanıcı (MAYAZ) | 21.881.333,01 TL | 21.881.333 TL | 0,01 TL yuvarlama |
| Burak Çetinel (BCETINEL) | 19.306.317,79 TL | 19.306.318 TL | 0,21 TL yuvarlama |
| Emre Erdoğan (EERDOGAN) | 18.588.403,56 TL | 18.588.404 TL | 0,44 TL yuvarlama |
| Alperen Erimli (AERIMLI) | 11.289.013,48 TL | 11.289.013 TL | 0,48 TL yuvarlama |
| N. Toker (NTOKER) | 7.276.731,90 TL | 7.276.732 TL | 0,10 TL yuvarlama |
| Tuğrul Semiz (TSEMIZ) | 597.987,45 TL | 597.987 TL | 0,45 TL yuvarlama |

Sonuç: Görünen dokuz kişi toplamı doğrudan CPM’den türetilen aynı iş kuralı ile eşleşmektedir. Fakat atıf kalitesi `%0` teyitli, `%91,85` çıkarımsal ve `18.447.585,44 TL` inceleme durumundadır; bu nedenle değerler matematiksel olarak doğru, fakat performans kararı için kanıt seviyesi sınırlıdır. Ayrıca bağlantı hesabı `sa` olduğundan teknik olarak gerçek DB salt-okunur yetkilendirmesi bulunmamaktadır.
