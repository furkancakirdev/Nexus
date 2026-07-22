# Marlin Nexus

CPM verisini salt okunur bağlantıyla kullanan satış, kârlılık, hedef ve havuz yönetimi uygulaması.

## Çalıştırma

1. `.env.example` dosyasını `.env` olarak kopyalayın.
2. `CPM_CREDENTIAL_FILE` değerini kullanıcı/şifre dosyasına yönlendirin.
3. `npm install`
4. `npm run dev`
5. `http://127.0.0.1:4317` adresini açın.

## Güvenlik

- CPM bağlantısı `readOnlyIntent` ile açılır.
- CPM API uçları yalnız parametreli `SELECT` sorguları çalıştırır.
- Personel, ayar, manuel maliyet ve onay kayıtları ayrı uygulama durumunda tutulur.
- CPM üzerinde ekleme, güncelleme veya silme yapılmaz.

## İş kuralları

- Maliyet önceliği: e-Fatura iade kanıtı bulunmayan satıştan önceki son gerçek alım, satıştan sonraki ilk gerçek alım, pilot kart oranı, manuel maliyet kararı.
- CPM tip 9/609 tek başına maliyet doğrulaması değildir. EFAGLN açıklamasında müşteri iadesi olduğu görülen belgeler maliyet adayından çıkarılır; bağlı satış iadeleri orijinal satış tarihindeki maliyeti devralır.
- Manuel maliyetlerin kesin havuza girmeden önce Yönetim onayı gerektirip gerektirmediği Ayarlar'dan belirlenir.
- Personel dağıtımı katsayı ağırlıklı veya eşit seçilebilir; süre/çalışma oranı çarpanı yoktur.
- Bireysel hedef kullanılmaz. Birleşik skor şirket ve bağlı olunan departmanın ortak sonucundan oluşur.
- Onay tek aşamalıdır ve Yönetim tarafından verilir. 2026 öncesi yıllar tarihsel veri olarak gösterilir.
- DBS ile başlayan cari kodlar bayi kabul edilir.

## Raporlama

- Özet sayfası tarih aralığı ve rapor türü seçilebilen yazılı analiz üretir.
- Departman Analizi, mevcut toplu satış hesabını değiştirmeden Servis ve Yedek Parça Satış sonuçlarını net satış, maliyet, esas brüt kâr, marj, müşteri, ürün, ticari sorumlu ve teslimat deposu açısından ayırır.
- Departman atfında açık CPM departman alanı ve kaynak sipariş sorumlusu önceliklidir. Belgeyi kaydeden kullanıcı ile depo yalnız kanıt/teslimat bağlamıdır; daha güçlü ticari sahiplik kanıtını geçersiz kılamaz.
- Departman Analizi içindeki CPM Pilot İzleme sekmesi, yeni satış siparişlerinde `SATICINO`, `MASRAFKOD`, `DEPOKOD` ve `SONKAYNAK*` alanlarının doluluk ve aktarım durumunu gösterir.
- Raporlar Merkezi marka, bayi, kanal/modül, teknik servis, maliyet, iskonto/iade, veri güveni ve havuz dağılımını gösterir.
- CPM Denetim tüm filtrelenmiş veya filtresiz sonuçları CSV olarak dışa aktarır.

## İlk gerçek departman testi

1. CPM'de yeni ve gerçek bir Satış Siparişi açın; silinen kuru-deneme numarası `SSP-00979` tekrar kullanılmamalıdır.
2. Ticari sorumlu, `SERVIS` departmanı ve gerçek teslimat deposunu makro akışıyla kaydedin.
3. Nexus'ta `Departmanlar > CPM Pilot İzleme` bölümünde `Şimdi kontrol et` seçeneğini kullanın.
4. Siparişin `Analize hazır` göründüğünü; sorumlu, departman ve deponun doğru olduğunu doğrulayın.
5. İrsaliye/fatura oluşturulduktan sonra kaynak sipariş bağlantısını, departman cirosunu ve toplu rapor uzlaşma göstergesini tekrar kontrol edin.

## Kontrol

`npm run build` üretim derlemesini, `node --check server/index.mjs` sunucu sözdizimini doğrular.
