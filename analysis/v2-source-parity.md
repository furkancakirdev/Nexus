# Marlin Nexus V2 Kaynak Paritesi

Tarih: 29 Ağustos 2026

## Amaç

Canlıdaki görünür V2 göstergelerini yerel çalışma ağacındaki hesaplama yollarıyla karşılaştırmak ve doğrulanmamış bir canlı davranışın eski yerel kaynakla ezilmesini önlemek.

## Yerel kimlik

- Dal: `master`
- Başlangıç commit'i: `4db39d8`
- Uygulama paketi: `marlin-nexus@0.0.0`
- Başlangıç doğrulaması: `npm test` ile 261 test geçti.
- CPM bağlantısı: `readOnlyIntent: true`, uygulama adı `Marlin Nexus ReadOnly`; kimlik bilgisi yalnız ortam değişkeni veya `CPM_CREDENTIAL_FILE` üzerinden okunuyor.

## Canlı–yerel karşılaştırma

| Yüzey | Canlı gözlem | Yerel kaynak | Parite durumu |
|---|---|---|---|
| Genel Bakış | Net satış V2, brüt kâr V2, ürün liste brüt marjı ve maliyet/kur kanıtı göstergeleri var. | `src/SummaryPage.jsx` ve `src/App.jsx` eski `estimatedCost`/`uncoveredNetSales` toplamlarını kullanıyor. | Eşleşmiyor |
| Satış Analizi | Eski brüt satış/iade/iskonto/maliyet alanları görünür. | `src/SalesPage.jsx` kârı `netSales - estimatedCost - uncoveredNetSales` ile yeniden hesaplıyor. | Eski yol doğrulandı |
| Departman Analizi | Departman toplamları ve kanıt sekmeleri var. | `server/departmentAnalysis.mjs` maliyet ve kapsam dışı satışı kendi topluyor. | V2 ortak model yok |
| CPM Denetim | Alım faturası, satır maliyeti ve doğrulama kanıtı var. | `server/finalInvoiceLedger.mjs` 9/609 alım kanıtını seçiyor; ürün dövizi, perakende fiyatı ve Halkbank satış kuru 29 Ağustos 2026 yamasıyla eklendi (FYTKRT Şablon 1 + DVZHAR). | **Eşitlendi** |
| Stok | Birden fazla eski planlama, alarm ve marka modülü çalışıyor. | Bu çalışma ağacında canlı stok uygulamasının karşılığı olan `src/InventoryPage.jsx` yok. | Kaynak eksik |
| Giriş | Canlı oturum bozulmaması için çıkış yapılmadı. | Yerel React kaynağında giriş bileşeni yok; yalnız giriş CSS sınıfları var. Canlı kimlik doğrulama katmanı bu checkout dışında. | Kaynak eksik |

## Canlı kimlik kapısı

Canlı arayüz salt okunur incelendi; ancak canlı build commit/hash bilgisi kullanıcı arayüzünden doğrulanamadı. Tarayıcı içinden doğrudan API açma istemci tarafından engellendi. Bu nedenle aşağıdaki işlemler henüz kapalıdır:

- Canlı stok modüllerini yerel kaynakta varsayımla silmek.
- Yerel `dist` çıktısını canlıya dağıtmak.
- Canlı V2 hesaplamasını yerel eski toplamlarla değiştirmek.

Canlı build kimliği ve stok kaynak dosyaları doğrulanınca bu belgeye hash ve dosya eşleştirme tablosu eklenecek.

## Güvenli uygulama sınırı

Kaynak paritesi tamamlanana kadar yalnız şu çalışmalar yapılabilir:

1. Girdileri açık olan saf V2 finans modelini testlerle geliştirmek.
2. Mevcut SQL'in kanıtladığı 9/609 alım faturası alanlarını değişmeden kullanmak.
3. Eksik CPM alanlarını `source-contract-missing` olarak incelemeye bırakmak.
4. Görsel yenilemeyi yerel prototipte uygulayıp canlı dağıtım yapmamak.

`VW_STOKDURUM` yalnız güncel miktar, rezervasyon ve bekleyen sipariş bağlamıdır; tarihsel stok hareketi, tarihsel maliyet veya ticari sahiplik kaynağı değildir.

