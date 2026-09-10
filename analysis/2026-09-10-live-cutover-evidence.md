# Marlin Nexus — 2026-09-10 Canlı Cutover ve Parity Kanıtı

## Kapsam ve karar

Bu kayıt, kullanıcı tarafından yetkilendirilen canlı değişiklik sonrasındaki
teknik cutover, aynı-commit aday karşılaştırması ve finansal readiness sınırını
belgeler. CPM üzerinde yalnızca salt-okunur sorgular çalıştırılmıştır; CPM'ye
yazma yapılmamıştır.

Teknik canlı cutover: **doğrulandı**.

Son reconciliation düzeltmesi ve maliyet kanıtı fail-closed görünürlük düzeltmesi de canlıya alınmıştır: tutar karşılaştırması artık
ham IEEE-754 kayan nokta farkı yerine TL kuruş (minor-unit) eşitliğiyle yapılır.
Gerçek kuruş farkları yine görünür kalır. Maliyet kanıtı `review` durumundayken
TRY maliyet/kâr/marj değerleri artık sıfır veya geçici rakam gibi sunulmaz;
arayüzde `—` ve kanıt engeli gösterilir.

EUR kök neden düzeltmesi de uygulanmıştır: önceki canlı yapılandırmasında
`DVZHAR.BANKA=3` satırları modül etiketiyle Halkbank kabul ediliyordu. CPM
`BNKKRT` master kanıtı ise `ID=3 = İLLER BANKASI`, `ID=6 = HALK BANKASI`
göstermektedir. Modül/environment etiketi artık master banka adının yerine
geçemez.

Resmî WAC/kâr/havuz ve finansal canlıya hazır olma: **NO-GO / inceleme gerekli**.
Bu karar; stok hareket kaynağı, maliyet kapsamı ve 132 soy zinciri kanıtlanamayan
iade satırı kapanmadan değiştirilmemiştir.

001a595 yüzey kapatma diliminde Stok/Denetim/Havuz menü ve doğrudan sayfa
erişimi pasif registry üzerinden fail-closed tutulmuş, kanıt backend’leri
silinmemiştir. Aday ve canlı browser smoke’unda yalnız Genel Bakış, Satış
Analizi, Departman Analizi ve Ayarlar görünürdür.

## Kod ve imaj kimliği

Son canlı sürüm:

- Git commit: `001a595` (`chore: harden nexus release surfaces`)
- Push: `origin/codex/UI` başarılı (`fc76597..001a595`)
- Canlı build commit: `001a595`
- Canlı artifact SHA-256: `2d13f9de95fab5176bd070c417fe17479f0da1b6a0e69fd600a508823dc82432`
- Canlı image digest: `sha256:9b52747add3d6ecacbce0716d434bec297830b8cfe0d362d1818b04527d43f0e`
- Canlı kur kimliği: `CPM_RATE_BANK_CODE=6`, `CPM_RATE_SEMANTICS_VERIFIED=false`

Bir önceki canlı sürüm:

- Git commit: `fc76597` (`fix: hide profit without cost evidence`)
- Canlı artifact SHA-256: `07e3193c104a9fbc8528deb62405b465b140df9dc6f4d723db13db551028bc3e`
- Canlı image digest: `sha256:eb1996b904e0cfa935e7552a526facf6c717b38e5950f803f5d171d5ceca33ab`

- Git commit: `3790df4` (`fix: compare reconciliation in minor units`)
- Push: `origin/codex/UI` başarılı (`6bcac43..3790df4`)
- Önceki canlı artifact SHA-256: `98e04463243fb9017adfced43f667aebbcd7f95c7e04ac617e446656b026b0f7`
- Önceki canlı image digest: `sha256:3108d544c16524c3b2698ec65bbd7d78bfa38c647c5a03118ce0f83d6c3fe00d`

Önceki rollback noktası korunmuştur:

- Git commit: `4aa608e` (`feat: reconcile income scope and harden nexus control room`)
- Push: `origin/codex/UI` başarılı (`d864be6..4aa608e`)
- Rollback build commit: `4aa608e`
- Canlı artifact SHA-256: `68b06CE6C9EC100508056321EE2384B813A9FB7982C09065DB590EA6DFCC63B7`
- Rollback image digest: `sha256:9a0d14e6d35a70dec0f6d030ebc09d2867881efc6d5522b71d13665649a7102cf`
- `/api/health`: `connected=true`, `readOnly=true`, `readOnlyEvidence=verified-by-runtime`,
  veritabanı `Marlin_Uyg`, şirket `01`
- Container hardening: `ReadonlyRootfs=true`, `no-new-privileges=true`,
  `CapDrop=ALL`
- HTTPS kök sayfa: HTTP 200

## Aday ve canlı parity sınırı

Önceki aday ekranında görülen `€4.413.235` değeri, o ana ait rate payload’ı
korunmadığı için aynı veri kesitiyle tekrar üretilemedi. `3790df4` sürümündeki
aynı-commit aday/canlı parity `€8.586.030` olarak eşleşmişti; banka kimliği
düzeltmesinden (`072dc83`) sonra canlı tekrar doğrulandı. Sonraki
`fc76597` adayında maliyet kanıtı fail-closed davranışı izole olarak smoke edildi
ve aynı sürüm canlıya alındı:

| Kanıt | İzole aday | Canlı | Durum |
| --- | ---: | ---: | --- |
| KDV hariç net ciro, kaynak TRY | 236.266.796 TL | 236.266.796 TL | Aday/canlı smoke eşleşti |
| EUR net ciro | €4.411.663 | €4.411.663 | Aday/canlı smoke eşleşti; TCMB fallback görünür |
| Maliyet / kâr / marj | `—` | `—` | Kanıt yok; fail-closed |
| İade soy zinciri incelemesi | — | 132 | Canlı review-required |
| Placeholder taraması | — | Yok | Canlı geçti |
| Browser console error/warning | — | 0 / 0 (son canlı smoke) | Canlı geçti |

Canlı `/api/overview?year=2026` payload kanıtı:

- `canonicalMetric.try.netSales = 236207629.04000163`
- `fc76597` candidate/live build metadata: build `nexus-fc76597`, artifact SHA-256
  `07e3193c104a9fbc8528deb62405b465b140df9dc6f4d723db13db551028bc3e`, image
  digest `sha256:eb1996b904e0cfa935e7552a526facf6c717b38e5950f803f5d171d5ceca33ab`.
- Önceki `3790df4` response’ta `canonicalMetric.eurRevenue.netSales =
  8586030.379638923` idi; bu alan yanlış banka kimliğiyle üretilmişti ve
  resmi EUR kanıtı olarak kapatıldı.
- Önceki canlı response’ta görünen `54.8595`, `DVZHAR-14744/14745` satırı
  CPM `BNKKRT.ID=3` yani `İLLER BANKASI` kaynağına aittir; Halkbank olarak
  kullanılması geçersizdir.
- CPM master sorgusunda `BNKKRT.ID=6` `HALK BANKASI` olarak doğrulandı; aynı
  dönem için bu banka kimliğinde rate çifti bulunmadı. `072dc83` bu nedenle
  kaynağı doğrulanmamış kabul eder ve canlı yapılandırmada `TCMB fallback`
  ifadesini görünür bırakır.
- 9 aylık dönemlerin tamamı açık dönemlerde `reportDate` ile dinamik kur seçen
  mevcut sözleşmeyi kullanır.
- `reconciliation.scopeNetSales = 236207629.04000163`; eski ham float farkı
  yalnız IEEE-754 yuvarlama gürültüsüdür, muhasebe farkı değildir.
- `3790df4` sonrası aynı tutarlar kuruş biriminde eşitlenir: `difference=0`,
  `balanced=true`. Gerçek bir kuruş farkı için regresyon testi `balanced=false`
  ve farkı görünür bırakır.

EUR yanlış banka kimliği kanıtı:

- CPM salt-okunur `BNKKRT` sonucu: `3 / İLLER BANKASI`, `6 / HALK BANKASI`.
- CPM salt-okunur `DVZHAR` sonucu: `14744/14745`, `54.8595/57.999`, banka ID 3;
  bu satırlar artık Halkbank kanıtı olarak kullanılmıyor.
- Canlı son smoke: `236.207.629 TL` kaynak TRY, `€4.410.271` EUR net satış,
  gross `€5.174.677`, iade `€43.449`, iskonto `€720.957`; EUR satırları
  `CPM öncelikli · TCMB fallback karşılığı` olarak etiketleniyor.
- Önceki `€4.413.235` kesitinin rate payload’ı saklanmadığı için bu değere
  kalan `€2.964` fark için dönemsel bir neden atanmadı. Bu fark açık bir
  tarihsel-provenance TODO’sudur; `€8.586.030` ise yanlış banka kimliğiyle
  üretilen hatalı kesit olarak kapatılmıştır.

Son canlı tarayıcı smoke kanıtı:

- Genel Bakış/Satış: `236.266.796 TL`, `€4.411.663`, maliyet/kâr/marj `—`,
  `132 iade bağlantısı incelenmeli`
- Maliyet kanıtı: `Doğrulanabilir maliyet kanıtı bulunamadı`; maliyet olmadan kâr
  veya marj hesaplanmadı.
- Tema: `dark`, body arka planı `rgb(15, 23, 42)`
- Loading: tamamlandı; placeholder (`undefined/null/NaN/lorem ipsum`): yok
- Satış Analizi ve Ayarlar route smoke: açıldı, loading/placeholder yok
- Console error/warning: `0 / 0`

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
- Son canlı container `release-001a595` olarak çalışıyor; `fc76597`, `072dc83`, `3790df4` ve
  `4aa608e` sürümleri rollback imaj/container noktaları olarak korunuyor.
- Uygulama verisi silinmedi veya CPM'ye yazılmadı.

## Resmî finansal readiness sınırları

Teknik parity geçmesine rağmen aşağıdaki bulgular resmî finansal onayı kapalı
tutar:

- 22.716 satırın WAC/maliyet kanıtı mevcut canlı akışta resmî kapsama alınmış
  değildir; canlı UI maliyet/kâr/marjı `—` göstererek fail-closed kalmaktadır.
- 132 satış iadesinin orijinal satış soy zinciri bağımsız olarak kanıtlanamadı;
  hepsi `review-required` kalır. Bulunamayanlar geçmiş dönem kaynaklı olabilir,
  ancak kanıt gelmeden otomatik bağlanmaz.
- Stok hareket kaynağı ve açılış/devir soy zinciri tamamlanmadan WAC, resmî kâr,
  marj ve havuz açılmaz.
- EUR dönüşümü artık yanlış banka kimliğiyle açılmaz; mevcut canlı değer TCMB
  fallback olarak etiketlidir. Halkbank rate çifti ve `DOVIZTIP=0/1` semantiği
  bağımsız kaynakla doğrulanmadan EUR resmi rapor kanıtı sayılmamalıdır.

## Sonraki güvenli adımlar

1. Host Docker cleanup olayının kök nedenini işletim/altyapı katmanında bul ve
   container yaşam döngüsü korumasını kalıcılaştır.
2. 132 iade için geçmiş dönem kaynakları ve bağımsız belge soy zincirini ara;
   kanıt bulunamazsa kayıtları review-required olarak bırak.
3. CPM stok hareketleri, açılış/devir ve WAC kanıtını tamamla; resmi maliyet
   kapısını ancak `financialStatus=ready` ve kapsama kanıtı sağlandığında aç.
4. Settings kapsamındaki eksik dinamik parametreleri ayrı ürün işi olarak
   tamamla; mevcut ayar ekranını tam matris olarak sunma.
