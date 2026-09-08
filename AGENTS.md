# Marlin Nexus — Ajan Çalışma Rehberi

Bu dosya, Marlin Nexus deposunun kalıcı ve proje-özel kurallarının tek gerçeklik kaynağıdır. Görev özeti, geçici plan, model tercihi ve tek kullanımlık notlar buraya yazılmaz.

## Kapsam ve öncelik

- Bu dosya kök checkout ve altındaki normal çalışma dizinleri için geçerlidir.
- Daha aşağıdaki bir `AGENTS.md` yalnızca kendi alt ağacına özgü ek kural koyabilir; bu dosyadaki güvenlik ve veri sınırlarını gevşetemez.
- Worktree kopyaları bu dosyaya bağlanır. Kopya ile bu dosya arasında fark oluşursa kök dosya düzeltilir; aynı kurallar çoğaltılmaz.
- `node_modules`, `.git` ve geçici paket çıktıları proje politikası değildir.

## Değişmez sınırlar

- CPM kesinlikle salt okunurdur. `INSERT`, `UPDATE`, `DELETE`, DDL, prosedür çağrısı veya dolaylı yazma yapılmaz; yeni sorgular parametreli `SELECT` olmalıdır.
- Nexus durumu CPM’den ayrıdır. Uygulama ayarları, pilot verisi, maliyet kararları, onaylar, denetim olayları ve ledger görüntüleri Nexus’un yönetilen depolarında tutulur.
- Kimlik doğrulama, capability, same-origin, CSRF, güvenlik başlıkları ve üretimde fail-closed davranış gevşetilmez.
- Canlı CPM’de yazma etkisi olan test, temizlik, CRUD denemesi veya deney yapılmaz. İzole test laboratuvarı açıkça doğrulanmadan kopya CPM istemcisi de güvenli test ortamı sayılmaz.
- Üretime deploy, push, canlı veri değişikliği, secret işlemi veya dış sisteme yazma kullanıcı istemeden yapılmaz.
- Secret, parola, token, oturum cookie’si, kişisel veri veya özel mesaj içeriği kaynak koda, fixture’a, log’a, ekran görüntüsüne ya da kalıcı dokümana yazılmaz.
- Finansal satış, maliyet, sahiplik, departman, hedef, havuz ve dağıtım sonuçları kaynak belge ve kanıt durumuyla birlikte açıklanır. Kanıt yoksa sonuç `—`, provisional veya review-required olarak kalır; sıfır ya da kesin sonuç varsayılmaz.
- Kişi analitiği; doğrulanmamış kimlik, mesaj hacmi, duygu, görünürlük, kişilik, sadakat, son değiştirici veya ham cevap hızından performans puanı üretmez.
- Mevcut ürün Marlin Nexus’tur; ayrı bir ürünle değiştirilmez. Değişiklikler küçük, geriye dönük uyumlu ve istenen kapsamla sınırlı tutulur.

## Çalışma biçimi

- Önce yalnızca görevin gerektirdiği dosyaları, çağıranları ve ilgili sözleşmeleri oku. Basit bir düzeltmede tüm repo haritasını veya ilgisiz dokümanları okutma.
- Üç veya daha fazla adıma, veri akışı değişikliğine, entegrasyona veya mimari karara giren işlerde kapsam, hedef dosyalar, riskler ve doğrulama ölçütleri kısa bir planla netleştirilir.
- Bağımsız araştırma veya doğrulama işleri ayrılabilir; ortak dosyalarda çakışma yaratılmaz ve her alt iş kanıtlanabilir çıktı üretir.
- Beklenmeyen test kırılması, güvenlik bulgusu veya kapsam sapmasında yaklaşımı zorlamak yerine durumu raporla, nedeni belirle ve planı güncelle.
- Model adı, model değiştirme ve uzun elden teslim prosedürleri proje kuralı değildir. Zor mimari veya güvenlik kararlarında danışmanlık alınabilir; son değerlendirme, değişiklik, test ve doğrulama bu çalışma akışında kalır.
- Geçici dosyalar yalnız `.temp_files/` altında tutulur. Kalıcı dersler yalnız tekrar kullanılabilir olduğunda `tasks/lessons.md` dosyasına eklenir.

## Teknoloji ve kod kuralları

- Proje React + JavaScript/ESM ve Node.js tabanlıdır. Açık ihtiyaç olmadıkça TypeScript dönüşümü, framework değişimi veya genel amaçlı katman eklenmez.
- CPM’den veri çıkarma, ham satır doğrulama, belge soy zinciri, sahiplik çözümleme, departman analizi, maliyet ve KPI hesaplama ayrı sorumluluklardır.
- Dönüşüm ve iş kuralları mümkün olduğunca saf ve deterministik fonksiyonlardır; girdi nesneleri yerinde değiştirilmez.
- Para, oran, tarih, belge türü ve kimlik alanları sınırda doğrulanır; örtük tür dönüşümüne güvenilmez.
- API ve durum yazmalarında mevcut revision, yetki ve çatışma semantiği korunur. CPM yazma sınırı ile Nexus’un yetkili kendi durum yazması birbirine karıştırılmaz.
- DRY, KISS ve YAGNI uygulanır. İlgisiz refaktör, toplu biçimlendirme, dosya taşıma ve erken optimizasyon yapılmaz.

## Finans ve adalet kuralları

- İade, konsolide belge ve cross-depot vakaları tek ekonomik vaka mantığıyla ve kaynak kanıtıyla ele alınır; tip 91 → 85 zinciri çift sayılmaz.
- Maliyet kanıtı olmayan veya WAC kapsamı yetersiz olan dönemler resmi maliyet/kâr/havuz kararı için fail-closed kalır.
- Ticari sahip, teslimat/depo operatörü, belgeyi kaydeden, onaylayan ve son değiştiren ayrı rollerdir. Depo veya son değiştirici tek başına ticari sahiplik kanıtı değildir.
- Çalışan kimlik eşlemesi, peşin tahsilat uzlaştırması ve gerekli örneklem incelemesi tamamlanmadan kişi puanlaması kapalı kalır.
- Yönetim onayı gerektiren kapanış ve dağıtım işlemleri otomatikleştirilmez. Pilot çalışan verisi gerçek HR kaynağı doğrulanana kadar açıkça pilot olarak etiketlenir.

## Doğrulama ve tamamlanma

- Kod değişikliğinde etkilenen testler, gerekli `npm run build`, uygun `node --check` ve diff incelemesi çalıştırılır.
- İş kuralı değişikliklerinde eksik tarih/null, iade veya negatif miktar, konsolide belge, tanımsız aktör, inactive çalışan, cross-depot, kaynak dışlama ve revision çatışması gibi ilgili düzensizlikler kapsanır.
- API değişikliklerinde yetkisiz, capability eksik, geçersiz girdi ve hata durumları kontrol edilir.
- UI değişikliklerinde ilgili sözleşme testleri, üretim build’i ve gerektiğinde masaüstü/dar ekran smoke kontrolü yapılır.
- Salt dokümantasyon değişikliğinde test/build zorunlu değildir; Markdown, yollar, komutlar ve diff doğrulanır ve çalıştırılmayan kontroller raporlanır.
- “Tamamlandı” yalnız istenen kapsam doğrulanmış, ilgili kullanıcı değişiklikleri korunmuş, uygun kontroller çalıştırılmış ve kalan riskler açıkça belirtilmişse denir.

## Korunan Marlin kararları

- Ticari departmanlar `Servis` ve `Yedek Parça Satış`tır; Yatmarin, Servis merkezidir. Konsolide satış/havuz hesabı korunur, departman görünümü ayrı bir mercek olarak eklenir.
- Ticari sahiplikte en erken sorumlu satış süreci belgesi/kullanıcısı; fatura son değiştiricisi, depo operatörü veya belgeyi kaydeden kişiden daha güçlü kanıttır.
- `BIRCAN` muhasebe rolüdür; yalnız hazırlayan/değiştirici olduğu için ticari sahip yapılamaz. Rakam içeren cari/hesap kodları çalışan sayılmaz.
- İnceleme gerektiren yakın belge ipuçları yalnız denetlenebilir adaydır; kesin sahiplik veya doğrulanmış kapsam değildir. Inactive çalışanların tarihsel işi silinmez veya sessizce başka kişiye aktarılmaz.
- Tip 91 → 85 bağlantısı tek ekonomik vakadır ve çift sayılmaz. Tip 91 tek başına tahsilat kanıtı değildir; güncel ekonomik metrikler aktif güncel terminal belgelerinden üretilir.
- Satın alma belge türü 9/609 tek başına maliyet kanıtı değildir. İade kanıtları maliyet adaylarından dışlanır; satış iadesi orijinal satış tarihindeki maliyet temelini devralır.
- Uygun tedarik alımında `bulkPurchase` adayı önce değerlendirilir: önceki bir yıl, en az 10 satır, en az %15 efektif iskonto, iade dışı kanıt ve sonraki satışlardan sonra yeterli tahmini miktar.
- `SSP-00979` kuru çalışma siparişidir; Nexus dışlama kaydında tutulur ve hiçbir analitik katkıya izin verilmez.
- Doğrulanmış HR kaynağı yoksa çalışan kayıtları pilot veridir. Kişi düzeyi puan; kimlik eşlemesi, peşin tahsilat uzlaştırması ve gerekli örneklem incelemesi tamamlanmadan kapalıdır.
- Mail yalnız ayrı doğrulanmış, en az yetkili ve salt-okunur tasarımla; WhatsApp yalnız şirket kontrollü, açıkça yetkilendirilmiş iş gruplarıyla ve resmi/gözetimli bağlantıyla işlenir. Özel sohbet veya kişisel cihaz oturumu kazınmaz.
- `İç yazışma` içeriği müşteriye açılmaz. Mesaj hacmi, CC, duygu, kişilik, sadakat ve ham cevap süresi performans ölçütü değildir; yalnız kaynak bağlantılı iş olayları kanıt olarak kullanılabilir.
- Kapanış ve dağıtım onayı yönetim yetkisindedir. Resmî WAC, kâr, havuz ve dağıtım kararları kanıt kapsamı yetersizse fail-closed kalır.

## Kaynak ve çalışma alanı

- `src/`: istemci ve ortak UI
- `server/`: API, güvenlik, CPM okuma, ledger ve Nexus durumu
- `shared/`: ortak saf iş kuralları
- `analysis/`: araştırma ve kanıt araçları; üretim çalışma zamanı değildir
- `tasks/lessons.md`: kalıcı, tekrar kullanılabilir dersler
- `.temp_files/`: geçici inceleme ve üretilmiş çıktılar; kalıcı SSOT değildir

## Codex Astra + Luna orkestrasyonu

- Çok dosyalı, birden fazla modülü etkileyen, araştırma/uygulama/doğrulama ayrımı gerektiren veya kullanıcının alt ajan istediği görevlerde `astra-orchestrator` skill'i kullanılabilir.
- Plus plan kurulumunda kök orkestratör ve rutin alt ajanlar GPT-5.6 Luna'dır; kök Luna işi koordine eder, bütünleştirir ve son doğrulamayı yapar.
- `explorer` ve `researcher` salt-okunur kanıt toplar; `worker` yalnızca açıkça atanmış dar kapsamı değiştirir; `tester` hedefli doğrulama yapar; `reviewer` bağımsız son inceleme yapar.
- Alt ajanlara CPM yazma, üretime deploy, secret işlemi veya dış sisteme yazma yetkisi verilmez. Mevcut Marlin güvenlik, read-only CPM, finansal kanıt ve fail-closed kuralları her zaman önceliklidir.
- Orkestrasyon küçük tek dosya düzeltmelerinde zorunlu değildir; gereksiz paralellik ve aynı dosyada eşzamanlı yazım yapılmaz.
