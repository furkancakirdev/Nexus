# Resmi Hareketli Ortalama Maliyet Tasarımı

## Amaç

Marlin Nexus'un resmi kâr, departman, havuz ve kapanış maliyetini ürün bazında tarih sıralı hareketli ağırlıklı ortalamadan üretmek; CPM'yi yalnız salt okunur kanıt kaynağı olarak tutmak.

## Kararlar

- Resmi maliyet, her ürünün doğrulanmış açılış miktarı/değeri ile başlar; uygun alımlar ortalama maliyeti günceller ve satışlar yalnız kendi tarihindeki ortalamayı tüketir.
- Satış iadesi, eşleşen orijinal satışın resmi maliyetini ters işaretle devralır. Alış iadesi, bağlı alım katmanı doğrulanabildiğinde stoğu/değeri ters hareketle düzeltir; eşleşme yoksa satır incelemeye kalır.
- Negatif stokta tanımlı ürün-marjı fallback'i yalnız eksik fiziksel maliyet kanıtını görünür kılmak için kullanılır; hiçbir satır sıfır maliyetle örtülü biçimde resmileştirilmez.
- Mevcut toplu alım, önceki alım ve sonraki alım seçimi denetim karşılaştırma kanıtı olarak korunur; resmi maliyet, kâr, havuz veya kapanış toplamına girmez.
- Açılış, hareket, tarihsel ürün dövizi, perakende fiyatı veya Halkbank kuru doğrulanamayan satırlar `review` olur ve resmi kâr/havuzdan dışlanır.
- EUR, USD, GBP ve TRY ekonomik tutarları kendi tarihi ürün dövizinde ayrı tutulur. EUR görünümü yalnız Halkbank alış kuru ile rapor eşdeğeridir; onaylı aylar ilgili ay sonu kur setini saklar.

## Sınırlar

- CPM'de yalnız parametreli `SELECT` sorguları çalıştırılır; yazma, DDL ve prosedür çağrısı yasaktır.
- Ürün liste brüt marjı, eşit ağırlıklı ürün analitiğidir; gerçek fatura net satışı eksi resmi maliyet ile üretilen kârın yerine geçmez.
- Departman sahipliği, 91→85 ekonomik zinciri, iade kökeni ve SSP-00979 dışlama kuralları mevcut birleşik defter davranışını korur.

## Başarı ölçütleri

- Aynı ürünün gelecekteki alımı, geçmiş satış maliyetini değiştiremez.
- Açılış + alım + satış + iade senaryoları resmi satır maliyeti, stok miktarı ve stok değerinde uzlaşır.
- Eksik kaynak satırı sıfır maliyet üretmeden inceleme sepetine düşer.
- Overview, departman, hedef/havuz ve EUR sepeti aynı resmi `financeV2` satır maliyetini tüketir.
- CPM Denetim ekranında 1024 px genişlikte maliyet, brüt kâr ve doğrulama sütunları ilk tabloda görünür olur.
