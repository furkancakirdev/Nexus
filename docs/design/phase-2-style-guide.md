# Marlin Nexus Faz 2 — Style Guide

Tarih: 2026-09-03  
Bağlı doküman: `docs/design/phase-2-design-philosophy.md`  
Durum: Tasarım spesifikasyonu. Uygulama kodu bu adımda değiştirilmemiştir.

## 1. Görsel karakter

Marlin Nexus; sakin, açık, kanıt odaklı ve finansal kararları öne çıkaran bir BI ürünü gibi davranır.

- Açık tema varsayılandır.
- Beyaz yüzeyler ve açık gri zeminler veri bloklarını birbirinden ayırır.
- Mavi yalnız navigasyon, bağlantı ve odak için kullanılır.
- Yeşil/kırmızı/amber yalnız durum veya finansal anlam taşıdığında kullanılır.
- Gölge dekorasyon değil, katman ayrımı için kullanılır.
- Yuvarlatma düşük ve düzenlidir; kartlar oyuncak gibi görünmez.
- Veri yoğunluğu azaltılır; her panel tek bir kararı destekler.

## 2. Renk token’ları

### Temel yüzeyler

| Token | Değer | Kullanım |
|---|---|---|
| `--page-bg` | `#F4F7FB` | Sayfa zemini |
| `--surface` | `#FFFFFF` | Kart, panel, tablo yüzeyi |
| `--surface-muted` | `#F7F9FC` | Tablo başlığı, ikincil blok |
| `--surface-info` | `#EFF6FF` | Bilgi mesajı |
| `--ink` | `#122B50` | Ana metin ve başlık |
| `--ink-secondary` | `#40536C` | İkincil metin |
| `--ink-muted` | `#5E7188` | Yardımcı açıklama; normal metinde AA hedefi korunur |
| `--line` | `#D7E0EA` | Sınır ve ayırıcı |
| `--navy` | `#063B7A` | Üst navigasyon |
| `--blue` | `#075FC9` | Birincil aksiyon, bağlantı, fokus |

### Durum renkleri

| Durum | Token | Ön plan | Kullanım |
|---|---|---|---|
| Hazır / pozitif | `--status-positive-bg` / `--status-positive` | `#E8F6EE` / `#146C43` | Resmi ve doğrulanmış olumlu sonuç |
| Dikkat | `--status-warning-bg` / `--status-warning` | `#FFF4DE` / `#925307` | Kullanılabilir fakat bağlam gerektiren sonuç |
| İnceleme gerekli | `--status-review-bg` / `--status-review` | `#FFF0F0` / `#A82F3A` | Kanıt eksikliği, karar blokajı |
| Nötr / bekliyor | `--status-neutral-bg` / `--status-neutral` | `#EEF2F7` / `#52657C` | Veri bekleniyor, henüz değerlendirilmedi |
| Salt okunur | `--status-readonly-bg` / `--status-readonly` | `#EAF2FB` / `#245A91` | CPM sınırı |

Durum metni her zaman ikon veya rozetle birlikte kullanılır. Kırmızı/yeşil tek başına anlam taşımaz.

### Kontrast kuralları

- Normal metin ve arka plan: minimum WCAG AA `4,5:1`.
- Büyük metin: minimum `3:1`.
- Kart, input ve tablo sınırı: görsel ayrım için minimum `3:1`.
- Yardımcı metin yalnız küçültülerek değil, renk ve satır aralığı ile okunabilir yapılır.
- Grafik serileri yalnız renkle ayırt edilmez; legend, çizgi tipi veya veri etiketi kullanılır.

## 3. Tipografi ölçeği

Font: mevcut ürünle uyumlu `Source Sans 3`, sistem yedeği `Segoe UI`.

| Stil | Boyut / satır | Ağırlık | Kullanım |
|---|---:|---:|---|
| `Display` | `32 / 38 px` | 700 | Sayfa başlığı; tek tane |
| `Section` | `20 / 26 px` | 700 | Ana panel başlığı |
| `Subsection` | `16 / 22 px` | 700 | Detay başlığı |
| `Body` | `14 / 21 px` | 400 | Açıklama ve tablo metni |
| `Body strong` | `14 / 21 px` | 600 | Sonuç ve önemli etiket |
| `Label` | `12 / 16 px` | 600 | Form ve KPI etiketi |
| `Caption` | `12 / 17 px` | 400 | Yardımcı metin; kontrast düşürülmez |
| `Overline` | `11 / 14 px` | 700 | Modül adı; harf aralığı sınırlı |

Kurallar:

- Finansal sayılar `font-variant-numeric: tabular-nums` kullanır.
- Sayı ve birim ayrılır: `228.509.988` + `TL`; birim sayının içine gizlenmez.
- Başlıklarda tamamı büyük harf kullanılmaz; yalnız overline katmanı istisnadır.
- `%0,0`, `0 TL` veya `€0` bilinmeyen değer yerine kullanılamaz.

## 4. Spacing ve grid

Temel birim: `4 px`.

| Token | Değer | Kullanım |
|---|---:|---|
| `--space-1` | `4 px` | İkon–etiket yakınlığı |
| `--space-2` | `8 px` | Kontrol içi boşluk |
| `--space-3` | `12 px` | Hücre ve küçük kart içi |
| `--space-4` | `16 px` | Kart/panel içi standart |
| `--space-5` | `20 px` | Bölüm içi ayrım |
| `--space-6` | `24 px` | Panel ve başlık ayrımı |
| `--space-8` | `32 px` | Büyük bölüm ayrımı |
| `--space-10` | `40 px` | Sayfa ritmi |

Grid:

- Maksimum içerik genişliği: `1440 px`.
- Sayfa yatay padding: desktop `32 px`, tablet `24 px`, mobile `16 px`.
- Ana kokpit: 12 kolon; kritik KPI’lar 3 veya 4 kolon.
- İkincil içerik: 8/4 veya 7/5 kolon.
- Mobile’da tek kolon; yatay sayfa taşması yasak.
- Kartlar arasında standart boşluk `16 px`; panel içi bölüm aralığı `24 px`.

## 5. Kartlar ve KPI’lar

### KPI kartı

Bir KPI kartı yalnızca şunları içerir:

1. kısa etiket,
2. tek ana değer,
3. birim/kapsam,
4. en fazla bir açıklayıcı alt satır.

Önerilen ölçü: minimum yükseklik `112 px`, iç boşluk `16 px`, radius `10 px`, sınır `1 px`.

Özet ekranında varsayılan olarak en fazla 4 KPI görünür. Diğerleri “Detayları aç” ile erişilir.

KPI durumları:

- Değer mevcut ve kanıtlıysa değer + birim.
- Değer mevcut fakat resmi değilse değer + `Tahmini` veya `İnceleme gerekli`.
- Değer bilinmiyorsa `—` + neden.
- Sıfır yalnız gerçek sıfırsa gösterilir.

## 6. Grafik kütüphanesi kuralları

### Ortak

- Grafik paneli beyaz yüzeyde, `--line` grid ile başlar.
- Grid çizgileri yardımcıdır; veri serisinden daha güçlü görünemez.
- Y ekseni birimi başlıkta ve tooltip’te açıkça yazılır.
- Tooltip aynı anda en fazla 4 seri gösterir; diğer seriler açılır ayrıntıya taşınır.
- Eksik veri `0` çizilmez; boş nokta ve “Kanıt yok” durumu kullanılır.
- Grafik başlığı karar cümlesi değil, ölçümün adıdır; yorum ayrı insight bloğunda verilir.

### Bar grafik

- Kategori karşılaştırması ve aylık satış için.
- Aynı metriğin serileri tek renk ailesinde; farklı anlamlar farklı renk ailesinde.
- Bar genişliği ve aralığı tüm modüllerde sabit kalır.

### Çizgi grafik

- Trend ve oran için.
- Resmi değer düz çizgi, karşılaştırma veya tahmin kesik çizgi.
- Nokta yalnız hover/fokus veya az veri noktasında görünür.

### Alan grafik

- Yalnız tek ana hacim serisini vurgulamak için.
- Opaklık `0,12–0,20`; alan dolgu kılavuz çizgilerini kapatamaz.

### Çift eksen

- Varsayılan tercih değildir.
- Kullanılacaksa eksen etiketleri ve seri birimleri grafik başlığının yanında yazılır.
- TL/EUR veya para ile yüzde aynı grafikte “tek toplam” gibi gösterilemez.

## 7. Tablo sistemi

### Varsayılan görünüm

- CEO görünümünde 4–5 kritik kolon.
- İleri detaylar “Sütunları yönet” veya satır detay paneliyle açılır.
- İlk kolon kimlik/ay; sağ kolon karar/değer.
- Kritik maliyet, kâr ve doğrulama kolonları masaüstünde sticky veya başlangıçta görünür olur.
- Mobile’da tablo yerine satır kartı + detay drawer kullanılır.

### Tablo başlığı

- Başlıklar cümle biçiminde, `12 px / 600`.
- Birim kolon başlığında veya başlık alt satırında görünür: `Net satış` / `KDV hariç`.
- Aynı sütunda TL ve EUR karıştırılamaz.
- Sıralama ve filtre aktifse kontrolün neyi değiştirdiği yanında yazılır.

### Boş ve inceleme satırları

- Boş tablo: neden + veri kapsamı + retry/filtre aksiyonu.
- İnceleme satırı: amber/kırmızı durum, neden ve `İncele` aksiyonu.
- Dışlanan satır: neden görünür; toplamdan çıkarıldığı belirtilir.

## 8. Butonlar ve aksiyonlar

### Birincil

- Mavi dolu yüzey, beyaz metin.
- Sadece ekranın tek ana ilerletici aksiyonu için.
- Etiket fiil ile başlar: `İncele`, `Onayla`, `Düzelt`, `Dışa aktar`.

### İkincil

- Beyaz yüzey, mavi metin, sınır.
- Yardımcı veya alternatif aksiyonlar.

### Tehlikeli / geri dönüşü zor

- Kırmızı yalnız reddetme, iptal veya geri dönüşü zor işlem için.
- Destructive işlem onayından önce etkilenen dönem/tutar açıkça yazılır.

### İkon buton

- En az `36 × 36 px`, mobile’da `44 × 44 px`.
- Her ikon butonun erişilebilir etiketi vardır.
- Tooltip etiketsiz ikonların tek açıklaması olamaz.

## 9. Standart aksiyon bileşeni

Her uyarı şu anatomiyi kullanır:

```text
[durum rozeti]  Başlık
                Etkilenen tutar/satır ve kısa neden
                [Birincil aksiyon]  [İkincil: ayrıntı]
```

Örnekler:

- `İnceleme gerekli` · `22.061 satırda resmi kâr yayınlanmıyor` · `Denetimde incele`
- `Onay bekliyor` · `9 dönem yönetim kararı bekliyor` · `Bekleyenleri aç`
- `Veri bekleniyor` · `Ekim dönemi henüz tamamlanmadı` · `Dönem kurallarını gör`
- `Kullanılamıyor` · `Stok kaynağı yanıt vermiyor` · `Yeniden dene`

## 10. Modal, drawer ve detay

- Modal yalnız kısa karar/kurala ayrılır; tam tablo modal içine konmaz.
- Drawer ekran bağlamını koruyarak satır veya ayıntıyı açar.
- Modal başlığında eylemin kapsamı ve kapatma yolu görünür.
- Escape, dış alana tıklama ve kapatma butonu desteklenir.
- Açılan panel odak yönetimini ve anlamlı başlık etiketini korur.

## 11. Yüklenme, hata ve empty state

### Yükleniyor

- İçerik alanının iskeleti korunur; tüm ekran “boş” görünmez.
- Mesaj: `2026 finansal verileri okunuyor…`
- 3 saniyeyi aşan beklemede son deneme zamanı ve `Yenile` görünür.

### Hata

- Teknik hata kullanıcıya ham stack/log olarak gösterilmez.
- Mesaj; etki, neden olasılığı ve sonraki aksiyonu söyler.
- Örnek: `Maliyet kanıtı alınamadı. Resmi kâr ve havuz yayınlanmıyor. Denetimde tekrar dene.`

### Empty state

- Neden: veri yok, filtre sonucu yok, kaynak yok veya veri bekleniyor ayrılır.
- Her empty state en az bir sonraki adımı içerir; aksiyon yoksa neden açıkça belirtilir.

## 12. Responsive davranış

- Desktop: 1440×900 karar görünümü.
- Tablet: 768×1024; 2 kolon KPI, 2 kolon panel.
- Mobile: 390×844; tek kolon, yatay sayfa taşması yok.
- Geniş tablolar sticky kritik kolon + detay drawer olarak yeniden akar.
- Grafikler yüksekliği korunarak küçülür; legend grafiği ezmez.
- Nav mobilde açıkça açılır/kapanır; ana içerik üstüne kontrolsüz binmez.

## 13. Uygulama öncelikleri

1. Token’lar ve açık tema.
2. Ortak KPI, durum rozeti, buton ve aksiyon bileşenleri.
3. Satışlar ekranındaki CSS/JSX sınıf sözleşmesi.
4. Denetim tablosunda kritik kolonların ilk görünümü.
5. Özet ve Satışlar için merkezi para/metric render katmanı.
6. Raporlar ve Onay akışlarında CTA’lar.
7. Departman, Havuz, Hedef, Stok ve Ayarlar ekranlarının aynı dilde uygulanması.

Her adım sonrası fonksiyon, veri kaynağı, yetki, responsive görünüm ve Faz 1 bulgu kapanışı ayrı doğrulanır.

## 14. Uygulama dışı kararlar

- SQL, backend hesaplama veya CPM akışları bu style guide ile değiştirilmez.
- Yeni finansal hesaplama eklenmez.
- Kapsam çelişkileri gizlenmez; yalnız gösterim ve etiketleme iyileştirilir.
- Personel performans puanı veya yeni yönetim yetkisi tasarlanmaz.

## Sonraki adım

Style Guide tamamlandı. Sıradaki teslimat, 9 sekmenin yeni karar odaklı bilgi mimarisi haritasıdır: eski yapı → yeni yapı, birincil/ikincil içerik ve drill-down ilişkisi.
