# Eksik kanıt etkisi yayını

Sürüm: evidence-20260909-1. Kullanıcı canlıya alma onayını bu oturumda açıkça verdi.

Kaynak tabanı d864be67bca87767973684bd10c9f72e91370b24 ve çalışma ağacındaki kapsamlı yama. Yeni commit oluşturulmadı; buildCommit taban commit'i gösterir, birebir yayın içeriğini artifact SHA256 belirler.

- Artifact SHA256: 33bf9ba2fbda97eeafd3cd7d1cbc4a90123ff406830185fdb58ef0336803cc79
- Docker image ID: sha256:8f13024bc1b85fcb85c231200adb427c629fdd3a94b4c24ea3705b21b027d328
- Yeni canlı container: a8fe805337903d14519bb64198b801c125bf8a9683f34870c362bba959d3983c
- Geri dönüş container adı: nexus-rollback-evidence-20260909-1
- Önceki image ID: sha256:25e5a80aba0ce174bbdc7b26ad666e89c2b46a0fe91bd5689caea781833fa4f2
- Sunucu release dizini: /home/serviceproadmin/apps/marlin-profit-sharing/releases/evidence-20260909-1

## Kapsam

TL net maliyete ikinci kur uygulanması düzeltildi. Null/boş miktar gerçek sıfırdan ayrıldı. Önceki yılların eşleşmemiş iadelerini resmi çağrı yıl sınırıyla dışlamıyor. Ürün-depo bazında ilk eksik maliyet/iade kaydından aynı gün ve sonraki ham satış hareketlerine tanısal etki haritası eklendi. Stok ekranında özet ve açılır ürün-depo tablosu bulunuyor.

Etki haritası tek başına kanıtlı WAC alt kümesi oluşturmaz. Depo transferi, açılış, tarihsel döviz ve liste fiyatı gibi başka engelleri çözmez. Resmi maliyet/kâr onayı açılmadı. Kullanıcı hedefinin kanıtlı alt kümede kâr gösterimi kısmı henüz tamamlanmadı; yayın bu araştırma görünümünü ve doğrulanmış hataların düzeltmesini içeriyor.

## Aday doğrulaması

CPM Marlin_Uyg bağlantısı salt-okunur; health 200, oturumsuz API 401, HTML ve dört asset 200, inventory-research/readiness/overview 200.

- Ham satış hareketi: 101.668
- Bilinen eksikten etkilenebilen: 31.992
- Bu eksiklerle doğrudan bağı saptanmayan: 69.676
- Etkilenen ürün-depo: 501
- Çözülmemiş kaynak satırı: 879 = 72 maliyet + 807 iade
- Kur bekleyen maliyet: 0
- Gerçek sıfır miktarlı hesap dışı satır: 16
- Finansal engeller: inventory-source-not-verified, official-cost-coverage-insufficient

Bu sayılar tüm kaynak yıllarını kapsar; ekonomik terminal faturalar tekilleştirilmiş satış toplamı değildir. 69.676 satır doğrulanmış maliyet kapsamı olarak sunulmaz.

## Test ve operasyon

702/702 test: npm test kapsamındaki 647 sunucu testi + ayrıca çalıştırılan 55 shared testi. Build hem yerelde hem sunucudaki Docker'da 6.781 modülle başarılı. Bağımsız Luna uygulama ve Astra son incelemesi tamamlandı. Kullanıcı değişiklikleri korunarak dar artifact hazırlandı; yerel data/secrets ve araştırma dökümleri pakete alınmadı.

Canlı geçiş sonrası health/HTTPS sertifikası/assetler/401 doğrulandı. Caddy, production Compose, secret mount'ları ve veri dizini korunarak eski Docker yapılandırması bellekte kopyalandı. Secret içerikleri komut veya dosyaya yazılmadı. Aday container kaynak tüketimini azaltmak için durduruldu, silinmedi. Eski canlı container durdurulmuş olarak geri dönüş için tutuluyor.

Canlı veri API kontrolünün nihai sonucu aşağıya eklenir. Tarayıcıda masaüstü/mobil görsel kontrol bu yayında yapılmadı; UI sözleşme testleri, build ve HTTPS asset doğrulaması yapıldı. Docker build çıktısında mevcut bağımlılıklar için 4 orta/2 yüksek npm audit uyarısı vardı; bu yayın bağımlılık sürümlerini değiştirmedi.

Nihai canlı doğrulama başarılı: HTTPS üzerinden inventory-research, readiness ve overview 200. Canlı etki sayıları adayla aynı: 101.668 = 31.992 + 69.676, 501 ürün-depo, 879 eksik kayıt. Build ID, image ID ve artifact SHA256 beklenen yayınla eşleşti. CPM connected/readOnly true; finansal ready false ve yalnız mevcut iki kanıt engeli korundu. İlk soğuk yüklemede ana ledger SQL yaklaşık 79 saniye, hareket SQL yaklaşık 7 saniye sürdü; ilk yükleme gecikmesi devam eden performans sınırıdır.
