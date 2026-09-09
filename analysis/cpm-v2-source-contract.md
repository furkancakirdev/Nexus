# CPM V2 Salt Okunur Kaynak Sözleşmesi

Tarih: 29 Ağustos 2026

## Sınır

CPM, Marlin Nexus için yalnız salt okunur kaynak sistemidir. Bu sözleşme CPM tablosuna, görünümüne veya karta yazma yetkisi vermez. Kaynak alanı doğrulanmamışsa hesaplama varsayım üretmez.

## Mevcut ve doğrulanmış alanlar

| İş kavramı | Mevcut kaynak | Yerel alan | Durum |
|---|---|---|---|
| Ekonomik satış/iade satırı | `STKHAR` | `documentType`, `documentNo`, `documentDate`, `productCode`, `quantity`, `grossAmount`, `discountAmount`, `netAmount`, `vatAmount` | Mevcut |
| Aktif kayıt | `STKHAR.KAYITDURUM = 1` | Satır filtresi | Mevcut |
| Nihai alım faturası | `STKHAR`, tip 9/609 | `purchaseType`, `purchaseNo`, `purchaseDate`, `purchaseQuantity` | Mevcut |
| KDV hariç alım neti | `STKHAR.TUTAR - STKHAR.ISKONTO` | `purchaseNetAmount` | Mevcut |
| Tedarikçi | `CARKRT` | `purchaseAccountCode`, `purchasePartyName` | Mevcut |
| Gelen e-fatura iade kanıtı | `EFAGLN` not alanları | Alım adayını dışlama | Mevcut |
| Ürün açıklaması | `STKKRT` | `productName` | Mevcut |
| Belge zinciri | `STKHAR.SONKAYNAK*` | Kaynak belge alanları | Mevcut |

## V2 için doğrulanan alanlar (29 Ağustos 2026 — canlı şema keşfi tamamlandı)

| İş kavramı | Doğrulanmış kaynak | Yerel alan | Durum |
|---|---|---|---|
| Ürün dövizi | `FYTKRT` Şablon 1 (Genel Fiyat Listesi KDV Hariç) satırının `DOVIZCINS` alanı; kart dövizi (`STKKRT.DOVIZCINS`) doluysa aynı dövizli liste fiyatı öncelikli | `productCurrency` | **Doğrulandı** |
| KDV hariç döviz cinsinden perakende birim fiyat | `FYTKRT` Şablon 1, `TIP=2`, `BITTARIH='1900-01-01'`, `FIYAT>0`; ürün başına tek satır (KDVDH=0) | `retailUnitPriceCurrencyExVat` | **Doğrulandı** |
| Tarihsel FX kaynağı | `01-Döviz Kart` modülünün `DVZHAR` günlük kur kaydı; `BANKA=3` modül etiketi `03-Halk Bankası`, `DVZDTY` indirme detayı ile audit edilir | `exchangeRates` | **Doğrulandı** |
| Kur tarihi | Fatura tarihinde aynı gün kur; gün yoksa modülün önceki geçerli tarihli kuruna açık tarih zinciriyle düşülür | `exchangeDate` | **Doğrulandı** |
| Kur kaynak kimliği | `DVZHAR.ID` ve ilişkili `DVZDTY.ID` indirme detayı | `exchangeSourceId` | **Doğrulandı** |
| Tarihsel stok hareketi | Hareket anahtarı, tarih, giriş/çıkış, miktar | Güncel görünüm fallback olamaz | STKHAR sözleşmesi ayrıştırılacak |

### Doğrulama kanıtları

- **FYTKRT kapsamı**: 2026'da satılan 3017 üründen 3009'u (%99,7) Şablon 1'de mevcut. `STKKRT.DOVIZCINS` yalnız 8 kartta dolu olduğundan kart dövizi tek başına kaynak olamaz; fiyat listesi dövizi esas alındı.
- **DVZHAR kur eşleşmesi**: `01-Döviz Kart` ekranı ve aynı gün `DVZDTY` kayıtları `BANKA=3 / 03-Halk Bankası` etiketini, `DOVIZTIP=0-Alış` ve `1-Satış` semantiğini gösteriyor. `VW_DVZHAR_GUNCELKUR`, günlük ana değeri `DVZHAR`dan, son indirme zamanını `DVZDTY`dan bağlıyor.
- **DOVIZTIP semantiği**: Modül ekranı ve canlı detay verisiyle `0=Alış`, `1=Satış` doğrulandı. `BNKKRT.ID=3` adının farklı olması modül bankası değil, ayrı CPM master adlandırmasıdır; modül etiketi resmi modül kaynağı olarak korunur.
- **KDVDH semantiği**: `STKHAR`'da `TUTAR` her iki durumda da KDV hariçtir (`KDVDH=1` kayıtlarında `KDV = TUTAR × oran` ilişkisi doğrulandı); `purchaseNetAmount = TUTAR − ISKONTO` formülü korunur.

## Saf V2 giriş sözleşmesi

CPM okuma katmanı doğrulandıktan sonra saf finans modeline aşağıdaki alanları sağlar:

```js
{
  productCode,
  productCurrency,
  retailUnitPriceCurrencyExVat,
  purchaseDate,
  purchaseQuantity,
  purchaseNetAmountTryExVat,
  halkbankSellingRate,
  exchangeDate,
  exchangeSourceId
}
```

## Formüller

```text
unitCostTryExVat = purchaseNetAmountTryExVat / purchaseQuantity
unitCostCurrencyExVat = unitCostTryExVat / halkbankSellingRate
unitDiscountCurrencyExVat = retailUnitPriceCurrencyExVat - unitCostCurrencyExVat
productListGrossMarginPct = 100 * unitDiscountCurrencyExVat / retailUnitPriceCurrencyExVat
```

TRY paritesi yalnız satır düzeyinde `FIYATDOVIZCINS` boş ve `FIYATDOVIZKUR=1` kanıtı varsa `try-parity` olarak kaydedilir. Diğer para birimlerinde fatura tarihinde veya modülün tarihsel olarak kanıtladığı önceki geçerli günde `03-Halk Bankası` satış kuru kabul edilir. TCMB, bugünkü kur, ay sonu kuru veya 1:1 fallback kullanılmaz; tarih zinciri de yoksa satır `missing-exchange-rate` ile incelemeye kalır.

## Ortalama ve negatif stok kuralı

- Aynı `productCode + purchaseDate + exchangeSourceId` kanıtı tek marj gözlemidir.
- Geçerli ürün gözlemlerinin `productListGrossMarginPct` değerleri aritmetik olarak ortalanır; satış tutarıyla ağırlıklandırılmaz.
- Negatif stokta alım faturası adetleri kanıt havuzuna dahil edilir; bulunan ürün liste brüt marj oranı satılan tüm adetlere, eksiye düşen adetler dahil, eşit uygulanır.
- Eksik ürün fiyatı, döviz, kur, tarih, miktar veya kaynak kimliği sıfır maliyet üretmez; satır `review` olur.

## Yazma yasağı

Bu sözleşmeyle çalışan sorgular yalnız `SELECT`, geçici tablo ve salt okunur bağlantı kullanabilir. CPM üzerinde `INSERT`, `UPDATE`, `DELETE`, `MERGE`, DDL veya prosedürle yazma yasaktır.

## Açılış uzlaştırma için bekleyen salt-okunur kanıt

2026 WAC kapsamını artırmadan önce önceki yıl kapanışının hangi CPM kaynağında tutulduğu ve açılış satırlarının depo/düzeltme ilişkisi doğrulanmalıdır. `STKSYM` adı mevcut notlarda geçse de kolon sözleşmesi henüz doğrulanmış değildir; bu nedenle üretim SQL’ine varsayımsal bir `STKSYM` join'i eklenmemelidir. Gerekli keşif çıktısı ürün, depo, belge kimliği, tarih, miktar, TRY değer, ürün dövizi ve aktif/iptal semantiğini birlikte göstermelidir. Kanıt gelmeden yıllar arası hareketleri tek WAC akışında birleştirmek veya 66 mükerrer açılışı otomatik toplamak maliyet uydurma riski taşır.

### 2026-08-31 salt-okunur keşif sonucu

- `STKHAR` tip 82 devirleri 2023-01-19–2026-08-31 aralığında 3.578 aktif satır içeriyor; 2.772 satırda pozitif `TUTAR` kanıtı var. Bazı güncel devir satırlarında miktar bulunmasına rağmen tutar sıfır.
- `STKHAR` tip 82 satırlarında `DEPOKOD` mevcut (örnek: `MRK`); aynı ürünün birden fazla depo/devir satırını rastgele seçmek güvenli değil.
- `STKSYM` üzerinde `MKOD4='DEVIR'` kayıtları 2022–2026 yıllarında mevcut (2026: 6.439 satır). Bu tablo önceki kapanış/devir adayı olabilir, ancak `NKOD1/NKOD2/NKOD3` alanlarının maliyet semantiği ve `KAYITDURUM`/iptal ilişkisi henüz doğrulanmadı.
- Sonuç: `STKSYM` doğrudan resmi WAC maliyeti olarak kullanılmamalı; önce ürün+depo+tarih+belge+değer/döviz uzlaşmasıyla ayrı bir kanıt recordset’i olarak keşfedilmelidir.
- Yeni keşifte `STKSYM` üzerinde `KAYITDURUM` kolonu bulunmadı; sorgu bu nedenle aktiflik filtresi uygulayamıyor. 2026 `DEVIR` satırlarının 6.439'unda `NKOD1` dolu, ancak örneklerde `NKOD1` miktara çok yakın ve `NKOD2/NKOD3` sıfır; bu alanlar maliyet tutarı olarak kabul edilemez. `STKSYM` şu an yalnız stok/depo devir adayıdır, resmi WAC maliyet kanıtı değildir.
- `STKHAR` tip 82 için doğrulanan maliyet alanı `TUTAR - ISKONTO`: 2026'da 756 aktif satırın 469'unda pozitif net maliyet var; `NKOD1/2/3` tüm yıllarda maliyet kanıtı olarak boş. Bu nedenle tip 82 WAC açılışı yalnız pozitif net `TUTAR` taşıyan satırlardan kurulmalı; tutarsız/boş tutarlı açılışlar review kalmalıdır.
- 2026 satış ürünleriyle yapılan salt-okunur eşleştirmede 3.019 ürünün 256'sında 2026 pozitif maliyetli açılış, 709'unda 2025 ve öncesinden pozitif devir adayı, 2.054'ünde ise hiçbir açılış kanıtı bulundu. Bu 709 aday doğrudan 2026 açılışı sayılamaz; son devir tarihinden 2026-01-01'e kadar tüketim ve depo uzlaşması ayrıca hesaplanmalıdır.
- 709 önceki devir adayının devir tarihi sonrası ve 2026 öncesi hareketleri salt-okunur toplandığında 385 üründe pozitif bakiye, 62 üründe sıfır bakiye, 262 üründe negatif bakiye bulundu. Pozitif bakiye grubu bile tek başına resmi açılış değildir; depo kırılımı, hareket kaynağı ve maliyet/döviz sürekliliği ayrıca doğrulanmalıdır. Negatif bakiye ürünleri kesinlikle WAC açılışına alınmamalıdır.
- 385 pozitif adayın 355'i tek depo, 30'u çoklu depo görünümünde; 377'si yabancı dövizli, 8'i TRY kartlı, bilinmeyen döviz yok. Tek depo olması maliyet kanıtını tek başına doğrulamaz; yabancı dövizli adaylarda devir tarihindeki ürün dövizi ve Halkbank alış/satış kuru ayrıca eşleştirilmelidir.
- Önceki aday denetimdeki `BNKKRT` master adı ile 01-Döviz Kart modülündeki banka etiketi karıştırılmıştı. Taze Session 2 modül kanıtında `DVZHAR/DVZDTY.BANKA=3` satırları ekranın açık `03-Halk Bankası` etiketiyle eşleşmektedir; `BNKKRT.ID=3` adının `İLLER BANKASI` olması ayrı master adlandırmasıdır. Modül sözleşmesi `BANKA=3`, `03-Halk Bankası`, `DOVIZTIP=0/1` olarak kaynaklandırıldı; eski ID6-only blocker'ı superseded edildi. WAC açılışı yine envanter/depo/lineage kanıtı tamamlanana kadar kapalıdır.
- Aktif `FYTKRT` (Şablon 1, `TIP=2`, süresiz ve pozitif fiyat) eşleştirmesinde önceki devir adayı ürünlerin 701'i tek fiyat dövizine sahip göründü; 701'inde aktif kart dövizi de tekil kaldı. 2026 satış satırı dövizi 692 üründe tekil, 17 üründe eksik/çoklu göründü. Bu 17 ürün satış dövizi uzlaşana kadar review kapsamındadır; fiyat listesi tekilliği resmi WAC maliyet kanıtı değildir.

### 2026-08-31 satış dövizi uyuşmazlıkları

Belge seviyesinde incelemede bazı ürünlerin satış satırlarında döviz alanı boş, bazılarında EUR ve USD birlikte bulundu. Örnekler: `229826`, `5W/40-4LT`, `COOLANT-PRO-5L`, `GM34969`, `SRF` ve `TSR`. Bu satırlar ürün kartı veya fiyat listesi dövizine zorla eşitlenmeyecek; satış satırının kendi döviz kanıtı eksik/çelişkili kaldığı sürece WAC maliyeti review olacaktır.

Belge/depo kırılımında uyuşmazlıkların çoğu tip 17 satış faturalarında MRK ve YTM depolarında; tip 85 ve 91 satırlarında da MRK/YTM örnekleri var. Bu nedenle depo bilgisi ticari döviz kanıtının yerine kullanılamaz; aynı ürün ve depo içinde belge satırı dövizi korunarak uzlaştırma yapılmalıdır.

Aktif FYTKRT fiyat listesiyle karşılaştırmada 17 uyuşmazlık ürününün 10'unda tekil fiyat dövizi var, 7'sinde fiyat kaydı çoklu/ayrıştırılamadı. Toplam 1.984 satış satırının 1.775'i fiyat döviziyle eşleşirken 153'ü döviz alanı boş kaldı; hiçbir ürünün tüm satış satırları fiyat döviziyle eksiksiz eşleşmedi. Fiyat listesi bu nedenle yalnız yardımcı kanıt, satış satırı dövizi ise zorunlu birincil kanıt olarak kalmalıdır.

Boş `FIYATDOVIZCINS` satırlarının tamamında `FIYATDOVIZKUR=1` bulundu; Session 2 ile bu durum yalnız satır düzeyinde `try-parity` kanıtı olarak işlenir. Yabancı ürün kartı sessizce TRY'ye çevrilmez ve eksik yabancı kur fallback'e dönüştürülmez.

## Üretim bağlantısı engeli (31 Ağustos 2026)

Canlı host üzerindeki mevcut CPM credential'ı ile yalnız yetki kanıtı sorgusu çalıştırıldığında efektif veritabanı izinleri `INSERT=1`, `UPDATE=1`, `DELETE=1`, `ALTER=1`, `CONTROL=1` olarak döndü. Yönetim bu `sa`/sysadmin durumunu bu kapsam için **kabul edilmiş altyapı riski** olarak onayladı; bu karar Nexus'un CPM'ye yazmasına izin vermez. Nexus uygulaması CPM'ye yalnız onaylı SELECT/API okumaları göndermeli, uygulama salt-okunur kapıları korunmalı ve `readOnlyEvidence=unverified` açıkça raporlanmalıdır. Bu nedenle bu bulgu artık tek başına scoped candidate deployment'ı durduran sert blokaj değildir; WAC/açılış ve provenance kanıtı eksikleri yine sert blokajdır.

### 2026-09-01 server candidate ile taze salt-okunur kaynak keşfi

- `dbo.STKHAR` ve `dbo.STKSYM` tabloları CPM `Marlin_Uyg` içinde gerçekten mevcut. `STKHAR` aktif satır kapsamı **416.965** (2016-04-11–2026-09-01); `STKSYM` kapsamı **49.063** (2022-12-28–2026-08-07).
- 2026 için `STKHAR` tip **81** satırı yoktur; tip **82** için **758** aktif satır vardır: yön 0'da **530**, yön 1'de **228**. Tip 81 kayıtları 2022–2025 ile sınırlıdır (2025'te 2 satır). Bu nedenle 2026 açılışı tip 81 varmış gibi varsayılamaz.
- 2026 `STKSYM` tip **82** kapsamı **6.465** satır, **4.470** ürün ve **5** depodur. `STKSYM` metadata'sında miktar, ürün, depo, tarih ve belge alanları bulundu; resmi WAC maliyeti olarak kullanılabilecek `BIRIMFIYAT/TUTAR/ISKONTO` alanları bu tablo sözleşmesinde doğrulanmadı.
- `STKHAR` tip 81 örneklerinde ürün, depo, miktar, `BIRIMFIYAT`, `FIYATDOVIZCINS`, `FIYATDOVIZKUR`, `TUTAR` ve `ISKONTO` birlikte mevcut; örnek tip 81 satırları yön 0 ve EUR maliyet/kuru taşımaktadır. Tip 82 için de aynı alanlar bulunur, fakat yön 0/1'in açılış/devir/düzeltme anlamı iş kuralı olarak ayrıca doğrulanmalıdır.
- Sonuç: gerçek kaynak artık kanıtlandı, fakat resmi WAC'a bağlama hâlâ **NO-GO**. Uygulama STKHAR/STKSYM recordset'lerini toplamıyor; tip 82 yön semantiği, ürün+depo+tarih+belge eşleşmesi, pozitif `TUTAR-ISKONTO` maliyet kuralı ve 2026 açılış kapsamı tamamlanmadan kaynak `verified` yapılamaz.

### 2026-09-01 tip 82 belge/yön eşleşmesi için taze kanıt

- 2026 aktif `STKHAR` tip 82 kapsamı belge seviyesinde **100** farklı belgeye ayrılıyor: **35** belgede hem yön 0 hem yön 1, **45** belgede yalnız yön 0, **20** belgede yalnız yön 1 bulundu.
- Aynı kapsamda **470** satırda pozitif `TUTAR-ISKONTO`, **288** satırda sıfır, **0** satırda negatif net maliyet bulundu. Yön 0'da **67** sıfır maliyetli, yön 1'de **221** sıfır maliyetli satır var.
- 2026 örneklerinde yön 0 satırları çoğunlukla pozitif maliyet taşırken yön 1 satırları çoğunlukla sıfır maliyet taşıyor; ancak aynı belgede iki yönün bulunması ve bazı yön 0 satırlarının da sıfır maliyetli olması, bu gözlemi iş kuralı kanıtı yapmaz.
- `STKSYM` tip 82 belgeleri, örneklerde sayısal belge numarası ve `MKOD4=DEVIR` taşırken 2026 `STKHAR` tip 82 belgeleri `SSF-*` numaraları taşıyor; basit `EVRAKNO` eşleşmesi **0** sonuç üretti. Ürün+depo+tarih+satır eşleştirmesi ve belge soy zinciri ayrıca tanımlanmalıdır.
- Sonuç: yön 0'ın giriş, yön 1'in çıkış veya düzeltme olduğu varsayılamaz. Bu kanıt yalnızca maliyet adaylarının yönlere göre ayrıştığını gösterir; WAC `verified` yapılmayacak ve yeni SQL recordset'i eklenmeyecektir.

### 2026-09-01 ürün/depo/tarih/miktar eşleştirme kontrolü

- 2026 STKSYM tip 82'deki **6.465** satır ile 2026 aktif STKHAR tip 82 satırları karşılaştırıldı. Aynı ürün+depo+tarih gününde yalnız **6** STKSYM satırı bir STKHAR satırıyla eşleşti; aynı miktar koşulu da eklendiğinde yalnız **1** satır kaldı.
- Tarih koşulu kaldırılıp yalnız ürün+depo+miktar kullanıldığında **92** aday eşleşme bulundu. Bu eşleşme tarihi ve belge soy zincirini kaybettiği için resmi açılış/WAC kanıtı değildir.
- Örneklerde aynı ürün+depo+tarih gününde miktarlar da farklıdır (ör. STKSYM `2020TM` 13 adet, STKHAR 2 adet; STKSYM `BE12/TF` 14 adet, STKHAR 2 adet). Bu nedenle miktar yakınlığı veya ürün kartı eşleşmesiyle otomatik maliyet devri yapılmayacaktır.
- Sonuç: mevcut tablolar arasında doğrulanmış stabil bir açılış anahtarı bulunamadı. WAC kaynağı ve `openingEvidenceDiagnostics.officialEligibleCount` resmi uygunluk olarak açılmayacaktır.

### 2026-09-01 CPM başlık/soy zinciri kontrolü

- 2026 tip 82 STKHAR satırları EVRBAS başlıklarına `SIRKETNO + EVRAKTIP + EVRAKNO` ile bağlandığında aynı belge içindeki yön satırları ortak `EVRAKSN` ve `EVRAKGUID` taşır. Bu anahtarlar STKHAR satır–başlık bağını destekler.
- 2026 tip 82 EVRBAS kapsamı **124** başlık/belgedir; **124** farklı `EVRAKSN` ve **124** farklı `EVRAKGUID` bulunur. `EVRAKNO2/3`, kaynak belge, karşı belge ve toplu belge alanlarında dolu kayıt bulunmadı.
- EVRHAR tablosunda tip 81 veya tip 82 için kayıt bulunmadı. Bu nedenle satır seviyesinde ek kaynak/karşı belge soy zinciri EVRHAR üzerinden kurulamadı.
- Sonuç: STKHAR içindeki satır–başlık kimliği kanıtlanmış olsa da STKSYM `DEVIR` satırını bu başlığa bağlayan upstream anahtar bulunamadı. `EVRAKSN`/`EVRAKGUID` STKSYM tarafında karşılığı kanıtlanmadan WAC açılışı yapılamaz.
