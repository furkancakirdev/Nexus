# CPM maliyet ve tarihsel kanıt araştırması — 9 Eylül 2026

## Doğrulanan kapsam

Kök checkout başlangıç commit'i: d864be6. Üretim görüntüsü yeniden okundu: marlin-profit-sharing:candidate-17fbbd2. CPM Marlin_Uyg üzerinde mevcut sunucu bağlantısı üzerinden parametreli SELECT sorguları çalıştırıldı. Kayıtlar bellekte işlendi, çıktıya yalnız toplulaştırılmış sayılar verildi. Bu çalışmada üretim dosyası, servis veya CPM kaydı değiştirilmedi.

Araştırma sorguları: `.temp_files/cpm-evidence-deep-20260909.mjs`. Sorgu adları aşağıdadır; kimlik bilgileri dosyada yer almaz. Çalıştırıcı sunucudaki mevcut bağlantı yapılandırmasını kullanır. Farklı sorgular ayrı zamanlarda çalıştırıldığı için sonuçlar tek transaction snapshot'ı olarak yorumlanmamalıdır.

## 1. Bulunan ve düzeltilen gerçek hesaplama hatası

`amount-currency-contract`: yabancı fiyat dövizi bulunan 8.495 pozitif alım/açılış satırının tamamında TUTAR = MIKTAR × BIRIMFIYAT (0,1 TL tolerans); 8.492 satırda ayrıca TUTAR = MIKTAR × FIYAT × FIYATDOVIZKUR doğrulandı. Kalan üç satırın yuvarlama/birim ayrıntısı ayrıca incelenmeli; bunlar ilk eşitliği sağlıyor.

Kullanıcının asıl planı ve mevcut CPM sözleşmesi de TUTAR−ISKONTO tutarını TL olarak tanımlar. Eski adaptör FIYATDOVIZCINS alanını net tutarın dövizi olarak etiketlediği için tarihsel zenginleştirme TL tutara yeniden kur uyguluyordu.

Düzeltme: net kaynak tutarı TRY, fiyat dövizi ve fiyat kuru ayrı kanıt alanları. Ürün dövizine tarihli Halkbank satış kuru dönüşümü mevcut ortak katmanda korunur. EUR raporlaması değişmedi. Sentetik regresyonda 3.600 TL yerine 144.000 TL üreten hata düzeldi.

`live-adapter-check`: yerel düzeltilmiş adaptör sunucuda stdin üzerinden, dosya yazmadan 300.636 gerçek satıra uygulandı. 49.640 geçerli maliyet satırı; yanlış tutar temeli 0; fiyat dövizi metadata'sı korunan EUR/USD/GBP satırı 8.495; pendingForeignCostRows 0. Bu, resmi WAC veya toplam finansal doğruluk onayı değildir.

## 2. 72 net maliyeti geçersiz satır

`invalid-cost-alternatives`: 25 satır tam iskontolu, 47 satır sıfır brüt tutarlı. Alternatif döviz neti, cari döviz neti, ALIMFIYAT, TUTAR2/3, promosyon işareti ve doğrudan kaynak belge bağlantısı pozitif maliyeti tamamlamadı. FYTHAR'da bu satırlara doğrudan fiyat bağlantısı yok. Dört satırın MIRSTKHAR geçmişinde eski pozitif tutar bulundu; sonradan değiştirilen tutar otomatik geri alınamaz.

STKMLY tablosu mevcut fakat boş. STKHMK maliyet geçmişi değil, ürün-cari eşlemesi alanları içeriyor.

Çözüm: tam iskontolu 25 satır için bedelsiz alım olup olmadığı belgeyle doğrulanmalı. Bedelsiz olduğu kanıtlanırsa sıfır değerli gerçek stok girişi ayrı bir kural olarak miktara dahil edilmelidir; tüm sıfır maliyetleri otomatik kabul etmek yanlış olur. Diğer 47 satır için e-fatura/supplier kaynak belgesi ve masraf dağıtımı araştırılmalı. Dört değişiklik geçmişi adayında değişim nedeni ve güncel belge esas alınmalı. Kaynak bulunamazsa mevcut Nexus yönetim onaylı maliyet karar mekanizmasına kaynak belge, tarih, miktar, döviz ve revizyonla karar eklenmesi gerekir. Bu araştırma hiçbir karar kaydı oluşturmadı.

## 3. 16 hareket ve 807 iade

Canlı adaptör: geçersiz hareket 0, gerçek sıfır miktarlı ekonomik olmayan satır 16. Ek düzeltme: null/boş miktar JavaScript tür dönüşümüyle sıfır sayılmıyor, incelemede kalıyor.

807 iadenin 678'inin geçmiş yıllarda olması çözüm değildir; miktar ve maliyet sonraki yıla taşınabilir. Resmi ledger çağrısından yıl bazlı otomatik dışlama kaldırıldı. 2026 içindeki önceki tanısal sayı 129; toplam tarihsel yükümlülük 807 olarak korunmalı.

`return-mirror-bridges`: kaynak numarası olmayan 2026 iadeleri 112; MIRSTKHAR geçmişinde desteklenen kaynak belge bağı 0; irsaliye/sipariş numarası 0; seri numarası yalnız 1. Tarihsel yıllarda da mirror kaynak bağlantısı bulunmadı.

`return-type16-forward-links`: tip 16 kaynağına işaret eden 17 güncel iadenin tip 17/85/91 terminal satışına ileri kaynak bağlantısı 0. Tip 16 satış olarak varsayılamaz.

Önceki oturumdaki 69 tekil/27 belirsiz/16 adaysız benzerlik eşleşmesi bu çalışmada tekrar ölçülmedi ve doğrulanmış iade bağlantısı değildir. Uygulanacak köprü; şirket, hesap, ürün/birim, belge, satır, tarih, depo transferi, iade miktarı tüketimi ve terminal tekilleştirme denetimi gerektirir. Bir satışa toplam satılan miktardan fazla iade bağlanmamalıdır. Kaynak yoksa yönetim onaylı, gerekçeli Nexus eşleşme kararı gerekir; sadece benzerlik otomatik onay oluşturmaz.

## 4. Tarihsel fiyat için yeni kaynak: FYTHAR

`price-history-volume`: FYTHAR 197.907 satır / 7.070 ürün; 108.076 pozitif KDV hariç fiyat. Bunlar ağırlıklı satış süreci belgelerine bağlı fiyat uygulama kayıtlarıdır. Alım/açılış türlerine doğrudan tam belge-satır bağı bulunmadı.

`fythar-historical-candidate-coverage`: tam belge+hesap+ürün+satır üzerinden bağlanan şablon 1, TIP 2, geçerli ve KDV hariç fiyatların tarihleri kullanıldığında 49.640 alım/açılış satırının 10.398'inde önceki bir belge fiyatı adayı mevcut. Bu sayı ilave kapatılabilir açık sayısı değildir; zaten bilinen fiyatlarla örtüşür.

`missing-price-candidate-overlap`: yalnız ilk önceki fiyat tarihi esas alınan basitleştirilmiş taramada 29.402 satırın önceki liste fiyatı bulunmuyor. Bunların 115'inde önceki FYTHAR belge fiyatı adayı var (2023:3, 2024:15, 2025:84, 2026:13). Bu tarama döviz çelişkisi, geçerlilik aralığı ve tüm üretim seçici koşullarını uygulamaz; önceki 32.157 kapsamıyla aynı metrik değildir. 115 kesin kapanış vaadi değildir.

Üretim fiyat sorgusu ayrıca TIP/şablon/müşteri kapsamını ve gerçek BASTARIH/BITTARIH ile kayıt değişim tarihini denetlemeli. Mevcut sorgu değiştiren tarihi başlangıç olarak kullanıyor, FYTKRT BITTARIH'ini taşımıyor; tüm fiyat listelerini okuyabiliyor. Bunlar eksik kanıttan ayrı doğruluk inceleme başlıklarıdır. FYTHAR ancak liste türü, KDV, döviz, belge zamanı ve geçerliliği doğrulandıktan sonra kontrollü geçmiş fiyat adayı olabilir. Güncel fiyat eski yıllara yayılamaz.

## 5. Uygulanabilir tamamlanma sırası

1. Bu çalışmadaki TL çift kur ve eksik miktar düzeltmesini release adayına dahil et; sunucu üzerinde tam API/readiness karşılaştırması yap. Canlı adaptör kontrolü API release testi yerine geçmez.
2. CPM hareket sözleşmesini tüm ekonomik hareketler için tamamla: tip 91 dönüşümlerinin terminal tekilleştirmesi, alım iadeleri, tip 82 giriş/çıkış ve depo transferi, açılış ve yıllar arası bakiye. Tek bir ortam değişkenini true yapmak kanıt değildir.
3. Ürün-depo bazında etki haritası üret: 72 maliyet ve 807 iadenin hangi sonraki satışların maliyetini bozduğu. Bağımsız doğrulanmış stok zincirleri ile etkilenmiş zincirleri ayır; genel toplam eksik kapsamı saklamasın.
4. Fiyat kapsamını liste türü ve geçerlilik semantiğiyle düzelt; FYTHAR'ın 115 adayını aynı üretim seçicisiyle değerlendir. Kalan dönemler için e-fatura/kurum fiyat listesi arşivi ya da salt-okunur geçmiş CPM yedeği gerekir.
5. Gerçekleşen satış kârını, liste fiyatına göre ürün marjından ayrı kanıt durumlarıyla sun. Asıl kullanıcı planı bu iki metriği zaten ayırıyor. Normal stok satışında kanıtlı maliyet ve net fatura tutarı yeterli olabilir; negatif stok marj yönteminde tarihsel liste fiyatı zorunludur. EUR ve ürün dövizi kanıtı ayrıca korunmalı. Mevcut global kapı sadece fiyat eksiği nedeniyle bağımsız kanıtlı alt kümeyi de engelleyebiliyor; bu ayrım uygulama gerektirir, bu çalışmada kapı açılmadı.
6. Arşivden bulunamayan maliyet/iade için mevcut yetkili Nexus karar sürecini kaynak ve revizyonla tamamla. Yönetim onayı otomatik üretilmez. Geçmiş veriyi temelsiz doldurmak yerine doğrulanmış açılış tarihinden ileri hesaplama, yönetimin seçebileceği kapsamlı alternatiftir; eski yıllar eksik olarak kalır.

## Doğrulama ve sınırlar

İlk düzeltmeden sonra server+shared 696/696 test başarılı; carry çağrısı değişikliğinden sonra etkilenen 69/69 test başarılı. Build 6.781 modül başarılı. Sözdizimi ve diff kontrolleri geçti. Yeni regresyon dosyası teslimde ayrıca dahil edilmelidir; henüz commit/stage yapılmadı. Bağımsız Luna incelemesi çift kur düzeltmesini doğruladı; önerdiği resmi caller regresyon testi eklendi. Ek testin sonucu oturum son doğrulamasında raporlanır.

Son ek doğrulama: resmi caller kontrolünü de içeren `server/cpmAmountEvidence.test.mjs` 10/10 başarılı; diff kontrolü temiz.

Tam sistem kapanışı henüz sağlanmadı. Resmi maliyet/kâr/havuz kapıları korunuyor. Üretim release'i değiştirilmedi. Araştırmanın önemli sonucu, eksik kaynaklara ek olarak düzeltilebilir yazılım hatalarının da bulunmasıdır.
