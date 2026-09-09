# Marlin Nexus Faz 2 — Bilgi Mimarisi Haritası

Tarih: 2026-09-03  
Bağlı dokümanlar: `phase-2-design-philosophy.md`, `phase-2-style-guide.md`  
Durum: Tasarım spesifikasyonu. Kod değişikliği yapılmamıştır.

## 1. Yeni üst navigasyon

Mevcut 10 ana menü öğesi aynı anda gösterilmek yerine 5 karar alanında gruplanır:

```text
Yönetim Kokpiti
├── Genel Bakış
├── Gelir ve Kârlılık
│   ├── Satışlar
│   └── Raporlar
├── Kanıt ve Operasyon
│   ├── Departmanlar
│   ├── Veri Denetimi
│   └── Stok Araştırması
├── Hedef ve Dağıtım
│   ├── Hedef Takibi
│   ├── Havuz
│   └── Onay ve Kapanış
└── Yönetim
    └── Ayarlar
```

Ana navigasyonda yalnızca 5 grup görünür. Grup açıldığında alt sayfa seçimi yapılır; aktif alt sayfa ve kapsam başlıkta açıkça yazılır. Mevcut deep-link/route davranışı varsa korunur.

## 2. Eski yapı → yeni yapı

| Eski ekran | Yeni alan | Yeni rol | Varsayılan görünür içerik |
|---|---|---|---|
| Özet | Yönetim Kokpiti / Genel Bakış | Yönetici durum özeti | 4 KPI, riskler, net karar |
| Satışlar | Gelir ve Kârlılık / Satışlar | Gelir ve marj kanıtı | Net satış, kapsam, resmi kâr, riskli dönem |
| Raporlar | Gelir ve Kârlılık / Raporlar | Boyut bazlı karar raporu | Seçili rapor + sonuç + CTA |
| Departmanlar | Kanıt ve Operasyon / Departmanlar | Ticari sahiplik | Departman karşılaştırması ve atıf güveni |
| Veri Denetimi | Kanıt ve Operasyon / Veri Denetimi | Finansal kanıt | İnceleme kuyruğu ve kritik 5 kolon |
| Stok Araştırması | Kanıt ve Operasyon / Stok Araştırması | Ürün maliyet zinciri | Ürün arama, kanıt durumu, hareket özeti |
| Hedef Takibi | Hedef ve Dağıtım / Hedef Takibi | Hedef gerçekleşmesi | Departman hedefi ve riskli dönemler |
| Havuz | Hedef ve Dağıtım / Havuz | Dağıtım uygunluğu | Resmi havuz, bant, bloke nedeni |
| Onay & Kapanış | Hedef ve Dağıtım / Onay ve Kapanış | Yönetim kararı | Bekleyen dönemler ve onay kuyruğu |
| Ayarlar | Yönetim / Ayarlar | Politika ve yetki | Aktif politika, değişiklik durumu, son kayıt |

## 3. Ortak sayfa şablonu

Her yeni ekran aynı iskeleti kullanır:

```text
[Üst grup]  [Sayfa başlığı]                         [Yıl] [Kaynak]
[Durum özeti: hazır / dikkat / inceleme / bekliyor]

[KPI 1] [KPI 2] [KPI 3] [KPI 4]

[Birincil analiz paneli]              [Aksiyon kuyruğu]

[Kritik tablo: 4–5 kolon]

[Ayrıntıyı aç / tüm kanıtı gör]
```

Her sayfanın başlığında yıl, veri kaynağı ve finansal kapsam bulunur. Kullanıcı aynı veri kümesini incelerken yıl ve kapsam sessizce değişmez.

## 4. Ekran bazlı bilgi hiyerarşisi

### Genel Bakış

**Birincil:**

- Net satış — brüt değil, doğru etiketli.
- Resmi dağıtıma esas sonuç.
- Net dağıtılabilir havuz.
- Veri güveni ve kritik bloke nedeni.

**İkincil:** aylık trend, hedef bandı, departman özeti.  
**Kuyruk:** inceleme, onay, veri bekleme.  
**Drill-down:** ilgili Satışlar, Denetim, Hedef veya Onay görünümü.

### Gelir ve Kârlılık / Satışlar

**Birincil:** net satış, resmi maliyet kapsamı, resmi brüt kâr, en riskli dönem.  
**İkincil:** iade/iskonto, kaynak dövizi, ürün liste marjı.  
**Tablo varsayılanı:** Ay, Net satış, Resmi maliyet, Resmi kâr, Durum.  
**Detay:** brüt satış, iade, iskonto, marjlar, maliyet yöntemi, satır kanıtı.

### Gelir ve Kârlılık / Raporlar

Raporlar dokuz eşit sekme olarak değil, üç rapor ailesi olarak sunulur:

1. **Gelir:** Yönetim özeti, Marka, Bayi, Kanal/Modül, Teknik Servis.
2. **Maliyet ve güven:** Alım ve Maliyet, İskonto ve İade, Veri Güveni.
3. **Dağıtım:** Havuz Dağılımı.

Her rapor ailesinde bir rapor seçilir. Ekranın üstünde aynı anda yalnız seçili raporun sonucu ve tek önerilen CTA görünür.

### Kanıt ve Operasyon / Departmanlar

Alt sekmeler korunur ancak “bakış modu”na dönüşür:

- **Genel:** departman sonucu, atıf güveni, çapraz depo uyarısı.
- **Sorumlular:** ticari sahip, ürün ve müşteri kırılımı.
- **Belgeler:** belge defteri ve satır kanıtı.
- **Pilot:** yeni CPM atıf akışı ve pilot kayıtları.

Varsayılan görünüm yalnız Genel’dir; diğerleri ikincil görünüm olarak açılır.

### Kanıt ve Operasyon / Veri Denetimi

**Birincil KPI:** inceleme kuyruğu, doğrulanan, dışlanan, iade kontrolü.  
**Varsayılan filtre:** yalnız inceleme gerekli + aktif yıl.  
**Varsayılan tablo:** Detay, Belge, Stok/Hizmet, Net satış, Kâr/Doğrulama.  
**Detay drawer:** maliyet, KDV, kur, alım faturası, iade bağlantısı, kaynak kanıtı.

Maliyet, kâr ve doğrulama ilk yatay görünümde erişilebilir olur; 11+ kolon varsayılan olarak gösterilmez.

### Kanıt ve Operasyon / Stok Araştırması

Akış ürün listesinden değil, tek bir araştırma görevi üzerinden başlar:

1. Ürün kodu/adı ile ara.
2. Kaynak durumu: hazır, okunuyor, kullanılamıyor.
3. Seçili ürünün maliyet kanıtı ve hareket özeti.
4. Gerekirse hareket detay drawer’ı.

Boş durumda “ürün seçilmedi”, “hareket bulunamadı” ve “kaynak kullanılamıyor” birbirinden ayrılır.

### Hedef ve Dağıtım / Hedef Takibi

**Birincil:** yıllık hedef, gerçekleşme, hedef tutan dönem, havuz etkisi.  
**Varsayılan tablo:** Ay, Hedef, Gerçekleşme, Bant, Havuz etkisi.  
**Detay:** önceki yıl, eşik, fark, oran.  
Gelecek aylar ayrı “veri bekleniyor” grubu olarak gösterilir; geçmiş dönemlerle aynı satır yoğunluğunda karıştırılmaz.

### Hedef ve Dağıtım / Havuz

**Birincil:** resmi dağıtıma esas sonuç, dağıtılabilir tutar, hedef bandı, veri bloke nedeni.  
**Varsayılan tablo:** Ay, Resmi sonuç, Oran, Havuz katkısı, Durum.  
**Detay:** satış/iade/iskonto/maliyet kırılımı ve hesap kuralı.

Tahmini değer ve resmi değer aynı kartta yan yana gösterilmez; biri seçili raporlama kapsamı olarak görünür.

### Hedef ve Dağıtım / Onay ve Kapanış

Bu ekran bir rapor değil, bir **iş kuyruğu** olur:

1. Bekleyen dönem sayısı.
2. Riskli dönem sayısı.
3. Seçili dönemin karar özeti.
4. `İncele`, `Onayla`, `Reddet` veya `Düzeltme iste` aksiyonu.

Onay yetkisi yoksa buton yerine `Yönetici onayı gerekir` açıklaması görünür. Veri hazır değilse onay butonu yerine kanıtı tamamlama CTA’sı görünür.

### Yönetim / Ayarlar

Beş ayar bölümü korunur fakat görev bazlı sunulur:

- Personel ve paylar.
- Politika ve havuz.
- Maliyet ve veri.
- Hedefler ve dağıtım.
- Onay ve yetki.

Sol menüde yalnız aktif bölümün özeti görünür; sağ panelde değişiklik önizlemesi ve son kayıt durumu kalır. Görünüm Ayarları ürün karar ayarlarından ayrıdır.

## 5. Çapraz ekran drill-down haritası

| Kaynak sinyal | Birincil CTA | Hedef |
|---|---|---|
| İnceleme gerekli satır | Denetimde incele | Veri Denetimi + aktif filtre |
| Maliyet kapsamı düşük | Kapsamı gör | Veri Denetimi veya Stok Araştırması |
| Departman atfı belirsiz | Atıf kanıtını gör | Departmanlar / Belgeler |
| Hedef bandı riski | Hedefi incele | Hedef Takibi / ilgili departman |
| Havuz onayı bekliyor | Dönemi aç | Onay ve Kapanış / ilgili dönem |
| Kaynak kullanılamıyor | Yeniden dene | Aynı ekran, hata/son deneme durumu |
| Rapor inceleme tutarı | İncele | Veri Denetimi / ilgili kapsam |

CTA hedefi yalnız navigasyon yapmaz; yıl, dönem, filtre ve seçili kapsamı da taşır.

## 6. Sütun görünürlüğü politikası

| Görünüm | Varsayılan kolon sayısı | Kural |
|---|---:|---|
| CEO/özet | 0 tablo veya 4 KPI | Ayrıntı tabloya taşınır |
| Analiz | 4–5 | Karar için yeterli kolon |
| Operasyon | 6–7 | Filtre ve durum görünür |
| Kanıt detayı | 10+ | Drawer veya ayrı audit görünümü |

“Sütunları yönet” kontrolü tablo başlığında yer alır. Seçim local preference olarak saklanabilir; resmi veri kapsamını değiştirmez.

## 7. Yetki ve güven sınırı

- Navigasyon gruplaması yetki kontrolünü değiştirmez.
- Salt-okunur CPM rozeti tüm veri ekranlarında aynı yerde kalır.
- Yönetim onayı yalnız yetkili rolde görünür/çalışır.
- Personel verisi “Pilot veri” etiketiyle ayrılır.
- Dışa aktarma yalnız seçili kapsamı ve rapor para birimini açıkça belirtir.
- UI yeniden gruplansa da API, SQL ve hesaplama katmanı aynı kalır.

## 8. Başarı ölçütleri

1. Kullanıcı 10 ayrı menü yerine 5 karar alanından hedef ekrana ulaşabilir.
2. Her uyarı bir hedef ekran ve filtre bağlamı taşır.
3. Raporlar’daki 9 görünüm aynı anda görünmez; rapor ailesi + seçili rapor modeli kullanılır.
4. Kritik tablolarda ilk görünüm 4–5 karar kolonunu içerir.
5. Mobilde tablolar satır kartı/drawer olarak okunur; yatay sayfa taşması oluşmaz.
6. Navigation sadeleşirken hiçbir yetki, filtre, export veya salt-okunur kuralı kaybolmaz.

## Sonraki adım

Bilgi mimarisi tamamlandı. Sıradaki teslimat ekran bazlı uygulama sırası ve her adım için küçük plan/mockup açıklamasıdır. İlk uygulama dilimi olarak Satışlar ekranındaki CSS sözleşmesi ve finansal üst hiyerarşi önerilmektedir.
