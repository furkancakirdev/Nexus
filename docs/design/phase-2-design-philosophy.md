# Marlin Nexus Faz 2 — Tasarım Felsefesi

Tarih: 2026-09-03  
Kapsam: Yönetim Karar Kokpiti için görsel katman ve bilgi hiyerarşisi ilkeleri.  
Durum: Onay bekliyor. Bu dokümanda kod, CSS, backend veya SQL değişikliği yoktur.

## 1. Ürün vaadi

Marlin Nexus, yöneticinin finansal durumu beş saniyede anlamasını, riskli alanı tek tıkla bulmasını ve karar vermeden önce kanıtın derinliğine inmesini sağlayan bir **Yönetim Karar Kokpiti** olacaktır.

Ana soru her ekranda görünür kalır:

> Şu an ne iyi, ne riskli ve benim sıradaki kararım ne?

Nexus bir veritabanı görüntüleyicisi değildir. CPM’den gelen ham veri yalnızca karar için gerekli bağlam kadar gösterilir; ayrıntı, kanıt ve teknik alanlar ikinci seviyede açılır.

## 2. Tasarım ilkeleri

### 2.1 Karar önce, ayrıntı sonra

Her ekranın üst bölümü yalnızca 3–4 birincil metrik taşır:

- yönetimin kararını değiştiren sonuç,
- hedefe veya plana göre durum,
- veri güveni / kapsam,
- bekleyen aksiyon.

Diğer metrikler detay paneli, satır açılımı veya ilgili alt görünüme taşınır. Bir ekranda görünen her öğe “Bu bilgi hangi kararı destekliyor?” sorusunu geçmelidir.

### 2.2 Beş saniyelik durum okuması

İlk bakışta aşağıdaki hiyerarşi izlenir:

1. **Durum:** İyi, dikkat, inceleme gerekli veya kullanılamıyor.
2. **Büyüklük:** Net satış, resmi kâr veya havuz gibi tekil ana değer.
3. **Sebep:** Hedef, maliyet kapsamı, onay veya veri eksikliği.
4. **Aksiyon:** İncele, filtrele, düzelt, onayla veya dışa aktar.

Renk tek başına anlam taşımaz; her durum metin etiketi ve ikonla birlikte yayınlanır.

### 2.3 Bir bakışta anlaşılır, gerektiğinde derinleşir

Progressive disclosure kullanılacaktır:

- **Seviye 1 — Kokpit:** karar özeti ve kritik uyarılar.
- **Seviye 2 — Analiz:** trend, karşılaştırma ve sınırlı kritik tablo.
- **Seviye 3 — Kanıt:** satır, belge, maliyet yöntemi, kur, kaynak ve audit ayrıntısı.

Teknik alan adları, SQL/CPM açıklamaları ve geniş sütunlar Seviye 3’e aittir; ana karar alanını kaplamaz.

### 2.4 Güven, görsel süslemeden önce gelir

Bir değer yayınlanmadan önce kapsamı ve birimi anlaşılır olmalıdır:

- “Brüt satış”, “net satış”, “resmi kâr”, “tahmini maliyet” birbirine karıştırılmaz.
- TL, EUR ve kaynak dövizi her zaman etiketli gösterilir.
- Kanıt eksikse `0` veya `%0,0` kullanılmaz; “Veri yetersiz”, “İnceleme gerekli” veya `—` kullanılır.
- Aynı metrik her ekranda aynı kanonik kaynaktan ve aynı formatlama katmanından render edilir.
- Kapsam oranı; satır kapsamı, TL ağırlıklı kapsam ve resmi maliyet kapsamı olarak ayrıştırılır.

Güvenli durum, görsel olarak daha az “dolu” görünse bile yanıltıcı kesinlikten üstündür.

### 2.5 Her uyarı bir iş akışının başlangıcıdır

Uyarı bileşeni şu dört parçayı zorunlu taşır:

- durum etiketi,
- kısa neden,
- etkilenen kapsam/tutar,
- tek birincil aksiyon.

Örnek: `22.061 satır inceleme gerekli` → `Denetimde incele`.

“Bekliyor” durumları yalnızca rozet olarak bırakılamaz. Toplu işler tek tıkla filtrelenmiş listeye ulaşır; işlem yetkisi yoksa bunun nedeni ve yetkili rolü gösterilir.

### 2.6 Ortak tarama ritmi

Tüm ana ekranlar aynı göz hareketini kullanır:

`Sayfa başlığı → durum/ana KPI’lar → birincil grafik veya tablo → uyarı ve aksiyon → ayrıntı`.

Navigasyon, başlık, yıl seçimi, kaynak rozeti ve durum dili ekranlar arasında sabit kalır. Kullanıcı her modülde yeni bir arayüz öğrenmez.

## 3. Yönetim ekranı hiyerarşisi

### Özet

Birincil: net satış, resmi/dağıtıma esas kâr, net havuz, veri güveni.  
İkincil: aylık trend, hedef tutan dönemler, personel parametreleri.  
Karar: “Dağıtım için hazır mıyız?”

### Satışlar

Birincil: net satış, maliyet kapsamı, resmi brüt kâr, en riskli dönem.  
İkincil: iade/iskonto kırılımı, döviz sepeti, ürün liste marjı.  
Karar: “Gelir ve marj resmi olarak ne kadar güvenilir?”

### Departmanlar

Birincil: departman net satış karşılaştırması, atıf güveni, inceleme tutarı, çapraz-depo uyarısı.  
İkincil: sorumlu, ürün, müşteri ve belge kanıtı.  
Karar: “Sonuç kime ve hangi kanıtla ait?”

### Veri Denetimi

Birincil: inceleme satırı, doğrulanan satır, kapsam dışı satır, bekleyen aksiyon.  
İkincil: belge türü, maliyet yöntemi, iade ve kaynak alanları.  
Karar: “Hangi veri kararı bloke ediyor?”

### Stok Araştırması

Birincil: seçili ürün, hareket durumu, maliyet kanıtı, kaynak bağlantısı.  
İkincil: kronolojik belge ve hareket ayrıntısı.  
Karar: “Bu ürünün maliyet zinciri yeterli mi?”

### Havuz

Birincil: dağıtıma esas resmi sonuç, net dağıtılabilir havuz, veri güveni, hedef bandı.  
İkincil: aylık katkı, iade/iskonto/maliyet kırılımı, kural açıklaması.  
Karar: “Havuz hesaplanabilir ve dağıtıma hazır mı?”

### Hedef Takibi

Birincil: yıllık hedef, gerçekleşme, hedef tutan dönem, net havuz.  
İkincil: önceki yıl, eşik, fark, bant ve oran.  
Karar: “Hangi departman/dönem hedef bandını açıyor?”

### Raporlar

Birincil: raporun tek ana sonucu, veri güveni, kapsam, önerilen aksiyon.  
İkincil: marka, bayi, kanal, servis, maliyet ve havuz kırılımları.  
Karar: “Bu rapordan hangi yönetim kararı çıkar?”

### Onay & Kapanış

Birincil: onay bekleyen dönem, riskli dönem, resmi net havuz, seçili dönemin durumu.  
İkincil: ledger snapshotı, departman payları, geçmiş kayıt.  
Karar: “Bu dönem onaylanabilir mi, yoksa hangi kanıt eksik?”

### Ayarlar

Birincil: aktif politika, değişiklik durumu, CPM salt-okunur sınırı, son kayıt.  
İkincil: personel, oran, maliyet ve hedef ayrıntıları.  
Karar: “Bir kuralı değiştirmek güvenli ve yetkili mi?”

## 4. Durum dili

| Durum | Anlam | Kullanım |
|---|---|---|
| Hazır | Veri ve yetki yeterli | İşlem yapılabilir |
| Dikkat | Sonuç kullanılabilir, önemli bağlam var | İnceleme önerilir |
| İnceleme gerekli | Kanıt eksik veya belirsiz | Resmi kâr/havuz kararını bloke eder |
| Veri bekleniyor | Dönem henüz tamamlanmamış | Tahmin gibi sunulmaz |
| Kullanılamıyor | Kaynak/bağlantı yanıt vermiyor | Retry ve teşhis gösterilir |
| Salt okunur | CPM’e yazma yapılmaz | Kaynak sınırı ve güven mesajı |

`0`, `%0,0`, `€0` yalnızca gerçek matematiksel sıfır kanıtlı olduğunda kullanılabilir; bilinmeyen değer yerine kullanılamaz.

## 5. Kapsam ve değişmezler

- CPM read-only kalır.
- SQL, backend hesaplama, finansal kanıt kuralları ve yetkilendirme değiştirilmez.
- Tasarım katmanı mevcut kanonik finans metriğini tüketir; yeni paralel hesaplama yapmaz.
- Pilot personel verisi “pilot” olarak işaretlenmeye devam eder.
- Onay ve dağıtım işlemleri yönetim yetkisi olmadan görünür olsa bile çalıştırılamaz.
- Faz 1’deki maliyet kapsamı çelişkileri frontend’de gizlenmez; alan adları ve kapsamları görünür kılınır, backend bulguları ayrı tutulur.

## 6. Başarı ölçütleri

Faz 2 uygulaması ancak şu koşullarda başarılı sayılacaktır:

1. Yönetici, Özet ekranında 5 saniye içinde durum, ana tutar, risk ve sıradaki aksiyonu söyleyebilir.
2. Aynı metrik, ekranlar arasında aynı sayı ve birimle görünür veya farklı kapsam açıkça yazılır.
3. Veri eksikliği hiçbir ekranda yanıltıcı sıfır/kâr marjı olarak görünmez.
4. Her bekleyen/eksik/inceleme durumu birincil aksiyona sahiptir.
5. Denetim tablosunun ilk görünümünde kritik maliyet, kâr ve doğrulama bilgisi erişilebilirdir.
6. Koyu tema ve normal metinler en az WCAG AA kontrast hedefini karşılar.
7. Filtre, export, yetki ve CPM salt-okunur davranışları korunur.

## Sonraki adım

Bu felsefe onaylanırsa sıradaki teslimat **Style Guide** olacaktır: açık tema token’ları, durum renkleri, tipografi ölçeği, grafik kuralları, grid/spacing sistemi ve standart aksiyon bileşeni.

Faz 2 uygulamasına henüz başlanmamıştır.
