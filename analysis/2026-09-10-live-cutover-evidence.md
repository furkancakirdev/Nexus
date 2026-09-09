# Marlin Nexus — 2026-09-10 Canlı Cutover ve Parity Kanıtı

## Kapsam ve karar

Bu kayıt, kullanıcı tarafından yetkilendirilen canlı değişiklik sonrasındaki
teknik cutover, aynı-commit aday karşılaştırması ve finansal readiness sınırını
belgeler. CPM üzerinde yalnızca salt-okunur sorgular çalıştırılmıştır; CPM'ye
yazma yapılmamıştır.

Teknik canlı cutover: **doğrulandı**.

Resmî WAC/kâr/havuz ve finansal canlıya hazır olma: **NO-GO / inceleme gerekli**.
Bu karar; stok hareket kaynağı, maliyet kapsamı ve 132 soy zinciri kanıtlanamayan
iade satırı kapanmadan değiştirilmemiştir.

## Kod ve imaj kimliği

- Git commit: `4aa608e` (`feat: reconcile income scope and harden nexus control room`)
- Push: `origin/codex/UI` başarılı (`d864be6..4aa608e`)
- Canlı build commit: `4aa608e`
- Canlı artifact SHA-256: `68b06CE6C9EC100508056321EE2384B813A9FB7982C09065DB590EA6DFCC63B7`
- Canlı image digest: `sha256:9a0d14e6d35a70dec0f6d030ebc09d2867881efc6d5522b71d13665649a7102cf`
- `/api/health`: `connected=true`, `readOnly=true`, `readOnlyEvidence=verified-by-runtime`,
  veritabanı `Marlin_Uyg`, şirket `01`
- Container hardening: `ReadonlyRootfs=true`, `no-new-privileges=true`,
  `CapDrop=ALL`
- HTTPS kök sayfa: HTTP 200

## Aday ve canlı aynı-zamanlı parity

Önceki aday ekranında görülen `€4.413.235` değeri tekrar üretilemedi. Aynı
commit/imaj, aynı CPM ve aynı rapor dönemindeki yeni izole aday çalışmasında
canlı ile aynı değerleri verdi:

| Kanıt | İzole aday | Canlı | Durum |
| --- | ---: | ---: | --- |
| KDV hariç net ciro, kaynak TRY | 236.207.629 TL | 236.207.629 TL | Eşleşti |
| EUR net ciro | €8.586.030 | €8.586.030 | Eşleşti |
| İade soy zinciri incelemesi | 132 | 132 | Eşleşti |
| Placeholder taraması | Yok | Yok | Geçti |
| Browser console error/warning | 0 / 0 | Önceki canlı smoke'ta 0 / 0 | Geçti |

Canlı `/api/overview?year=2026` payload kanıtı:

- `canonicalMetric.try.netSales = 236207629.04000163`
- `canonicalMetric.eurRevenue.netSales = 8586030.379638923`
- EUR raporlama kuru: `54.8595`, tarih `2026-09-09`, kaynak kimliği
  `DVZHAR-14744/14745`
- 9 aylık dönemlerin tamamı aynı rapor-günü kur setini kullandı; bunun nedeni
  açık dönemlerde `reportDate` ile dinamik kur seçen mevcut sözleşmedir.
- `reconciliation.scopeNetSales = 236207629.04000163`; fark yalnız IEEE-754
  yuvarlama gürültüsüdür, muhasebe farkı değildir.

Eski `€4.413.235` ekranı için o ana ait EUR kur seti response payload olarak
kaydedilmediğinden, eski kesitin daha ince tarih/kur nedenini kanıtlayamıyoruz.
Bu nedenle eski değere spekülatif bir kök neden atanmadı; güncel aynı-zamanlı
aday-canlı parity kanıtı esas alındı.

## Cutover sırasında yaşanan host olayı

Cutover öncesi/çevresinde, bağımsız bir Docker cleanup olayı canlı uygulama,
Caddy ve aday container'larının tamamını `23:22:59–23:23:07` aralığında yok
etti. Cutover scriptinin kendi hata akışı olarak kanıtlanmadı. Kullanıcı
verisi ve release kaynakları disk üzerinde kaldı. Host crontab/systemd timer
kontrolünde bu cleanup'ı açıklayan bir kayıt bulunmadı; olay host operasyon
riskidir ve altyapı sahibi tarafından ayrıca incelenmelidir.

Kurtarma sırasında:

- Önceki sürüm kaynak ağacından rollback imajı yeniden oluşturuldu.
- `commit-4aa608e` canlı imajı yeniden oluşturuldu ve canlı container başlatıldı.
- Caddy ile uygulama ağı yeniden bağlandı; ilk 502 durumu bu ağ üyeliği
  düzeltmesiyle kapandı.
- Uygulama verisi silinmedi veya CPM'ye yazılmadı.

## Resmî finansal readiness sınırları

Teknik parity geçmesine rağmen aşağıdaki bulgular resmî finansal onayı kapalı
tutar:

- 22.716 satırın WAC/maliyet kanıtı mevcut canlı akışta resmî kapsama alınmış
  değildir; canlı görünür geçici TRY maliyet/kâr hesapları resmî sonuç değildir.
- 132 satış iadesinin orijinal satış soy zinciri bağımsız olarak kanıtlanamadı;
  hepsi `review-required` kalır. Bulunamayanlar geçmiş dönem kaynaklı olabilir,
  ancak kanıt gelmeden otomatik bağlanmaz.
- Stok hareket kaynağı ve açılış/devir soy zinciri tamamlanmadan WAC, resmî kâr,
  marj ve havuz açılmaz.
- EUR dönüşümü güncel aday-canlı parity içinde eşleşmiştir; geçmiş tarihli
  kur setleri ayrı bir kanıt olarak korunmalı, dinamik rapor günü kuruyla
  dondurulmuş dönem kurunun karıştırılmasına izin verilmemelidir.

## Sonraki güvenli adımlar

1. Host Docker cleanup olayının kök nedenini işletim/altyapı katmanında bul ve
   container yaşam döngüsü korumasını kalıcılaştır.
2. 132 iade için geçmiş dönem kaynakları ve bağımsız belge soy zincirini ara;
   kanıt bulunamazsa kayıtları review-required olarak bırak.
3. CPM stok hareketleri, açılış/devir ve WAC kanıtını tamamla; resmi maliyet
   kapısını ancak `financialStatus=ready` ve kapsama kanıtı sağlandığında aç.
4. Settings kapsamındaki eksik dinamik parametreleri ayrı ürün işi olarak
   tamamla; mevcut ayar ekranını tam matris olarak sunma.

