# Session 3 — CPM açılış stok kanıtı

**Tarih:** 2026-09-03  
**Kapsam:** `Marlin_Uyg`, aktif CPM kayıtları, 2026 açılış/devir araştırması  
**Karar:** `SESSION_3_BLOCKED`

## Sonuç

CPM’de ürün-depo-tarih kimliğiyle açılış miktarını ve tarihsel maliyetini birlikte doğrulayan resmi bir kaynak kanıtlanamadı. `STKSYM` devir satırları miktar taşır fakat maliyet ve para birimi alanı içermez. `STKHAR` tip 82 satırları maliyet adayı taşır; ancak `STKSYM` ile doğal anahtar, miktar ve upstream belge/lineage eşleşmesi kurulamadı. Eksik maliyetler sıfıra çevrilmedi.

Bu nedenle inventory source yalnızca **candidate**, resmi WAC kapısı ise **kapalı** tutuldu.

## Kanıt kapsamı

| Kaynak | Gerçek anlam / alan kanıtı | 2026 canlı kapsamı | Sonuç |
|---|---|---:|---|
| `STKHAR` tip 82 | Hareket tablosu; ürün `MALKOD`, depo `DEPOKOD`, tarih `EVRAKTARIH`, belge/line, yön `GIRISCIKIS`, miktar `MIKTAR`, `BIRIMFIYAT`, `TUTAR`, `ISKONTO`, `FIYATDOVIZCINS`, `DOVIZCINS`, maliyet ve kaynak-lineage kolonları | 758 satır / 627 ürün / 7 depo; 2026-01-07–2026-09-01 | Maliyet adayı; resmi açılış kaynağı değil |
| `STKSYM` `MKOD4='DEVIR'` | Devir/snapshot tablosu; ürün, depo, tarih, belge/line ve `MIKTAR`; maliyet veya para birimi kolonu yok | 6.439 satır / 4.469 ürün / 4 depo; 2026-01-13–2026-08-07 | Miktar adayı; maliyet kanıtı değil |
| `VW_STOKDURUM` | Ürün/depo mevcut stok görünümü; giriş, çıkış, rezervasyon, kullanılabilir ve `STOKMIKTAR`; tarihsel maliyet/WAC kolonu yok | Negatif mevcut stok: 0 satır / 0 ürün / 0 depo | Snapshot; açılış maliyet kaynağı değil |
| `HAKKI_STOK_DEVIR` | `VW_STKHAR` tip 81 miktarını toplar; maliyet alanı yok | Önceki canlı keşifte 5.602 ürün / 99.373,9 miktar | Miktar karşılaştırma adayı |
| `VW_STOK_DEVIR_MALIYET_AKTAR` | Miktarı devir hareketinden, maliyeti güncel `STKKRT.NKOD1` ve KDV/iskonto türetiminden alır | Önceki canlı keşifte 5.252 ürün / 97.580,9 miktar / 4.483.632,4383 türetilmiş değer | Tarihsel lineage olmadığı için candidate |

View tanımları `sys.sql_modules` salt-okunur metadata sorgusuyla da kontrol edildi: `VW_STOKDURUM` `STOKMIKTAR` içeriyor, maliyet/WAC içermiyor; maliyet view’ı `NKOD1` ve maliyet ifadeleri içeriyor; `HAKKI_STOK_DEVIR` `STKHAR`/`EVRAKTIP` ve stok miktarı üzerinden çalışıyor.

Canlı oturum `Marlin_Uyg` ve `readOnlyIntent=true` ile açıldı. Bağlantı principal’ı `sa` olarak görüldü; etkin SQL yazma yetkilerinin `SELECT-only` olduğu ayrıca kanıtlanmadı. Bu, resmi gate’i açmak için ek bir yetki kanıtı blocker’ıdır.

## Açılış alanları ve karantina

`STKHAR` tip 82 için canlı özet:

- 470 satırda pozitif `BIRIMFIYAT`, 288 satırda sıfır/eksik maliyet adayı vardır.
- 758 satırın `FIYATDOVIZCINS` alanı boştur; işlem para birimi (`DOVIZCINS`) de açılış maliyeti için doldurulmuş bir kanıt değildir.
- 758 satırda `MALIYETKOD` boş ve `MALIYETSIRANO=0` gözlendi; kaynak belge/lineage bağı kurulamadı.
- Miktar negatifliği tip 82’de 0’dır; ancak sıfır/eksik maliyet satırları yine karantinadadır.

`STKSYM` için:

- 4.566 pozitif, 1.873 sıfır miktar satırı vardır; negatif miktar 0’dır.
- Para birimi ve maliyet alanı bulunmadığı için `NKOD1` veya herhangi bir snapshot değeri maliyet olarak kullanılmadı.
- 254 ürün birden fazla depoda görünür; `STKHAR` tip 82’de de 28 ürün çoklu depodadır. Depolar birleştirilmedi.

Matcher artık `non-positive-quantity`, `missing-product`, `missing-depot`, `missing-opening-date`, `missing-unit-cost` ve `missing-currency` nedenlerini ayrı karantina verisi olarak taşır.

## Doğal anahtar uzlaştırması

Doğal anahtar: **ürün + depo + tarih + belge no + satır no**. Canlı tam nüfus karşılaştırması `STKSYM DEVIR` ile `STKHAR` tip 82 arasında şu sonucu verdi:

| Kontrol | Sonuç |
|---|---:|
| STKSYM devir satırı | 6.439 |
| Ürün + depo + tarih kesişimi | 6 |
| Ürün + depo + tarih + miktar kesişimi | 1 |
| Tam doğal anahtar eşleşmesi | 0 |
| Ürün + depo + miktar, tarih serbest | 1.435 |

Tarih kesişimindeki ürün/depo satırları:

| Ürün | Depo | Tarih | STKSYM belge/line/miktar | STKHAR belge/line/miktar | Sınıf |
|---|---|---|---|---|---|
| `2020TM` | `MRK` | 2026-02-10 | 306 / 107 / 13 | `SSF-00737` / 5 / 2 | Unmatched; belge/line ve miktar farklı |
| `129474-33050M` | `MRK` | 2026-03-05 | 311 / 412 / 1 | `SSF-00743` / 11 / 1 | **Quantity-only**; belge/line farklı |
| `BE12/TF` | `MRK` | 2026-08-07 | 327 / 1 / 14 | `SSF-00826` / 2 / 2 | Unmatched; belge/line ve miktar farklı |
| `BE10/TF` | `MRK` | 2026-08-07 | 327 / 23 / 6 | `SSF-00826` / 4 / 1 | Unmatched; belge/line ve miktar farklı |
| `XTS0814/2` | `MRK` | 2026-08-07 | 327 / 72 / 25 | `SSF-00826` / 5 / 1 | Unmatched; belge/line ve miktar farklı |
| `XTS0814/3` | `MRK` | 2026-08-07 | 327 / 73 / 11 | `SSF-00826` / 3 / 1 | Unmatched; belge/line ve miktar farklı |

### Miktar eşleşip maliyet eşleşmeyen kayıtlar

Canlı `STKSYM` şemasında maliyet/para birimi kolonu olmadığı için bu nüfusta ölçülebilir bir **cost mismatch** sayısı üretmek doğru değildir. Tek miktar-eşleşen satır `129474-33050M / MRK / 2026-03-05 / qty=1`’dir; doğal belge/line eşleşmesi yoktur ve STKSYM tarafında karşılaştırılabilir maliyet yoktur. Bu satır quantity-only olarak karantinadadır.

Kod düzeyinde, her iki kaynakta da pozitif maliyet varsa aynı doğal anahtarda farklı maliyet `cost-conflict` olarak ayrıca sınıflandırılır; sıfır maliyet geçerli maliyet sayılmaz. Böyle bir canlı STKSYM maliyet alanı bulunmadığından resmi maliyet çatışması iddiası yapılmadı.

## Hareketlerin açılışa etkisi

Bilinen aday eşlemesi ve 2022-12-31–2027-01-01 canlı hareket kapsamı:

| CPM tipleri | Aday anlam | Satır |
|---|---|---:|
| 9, 609 | Purchase adayı | 15.925 + 26.889 |
| 17, 85, 91 | Sale adayı | 63.709 + 14.429 + 23.104 |
| 18 | Sales return adayı | 914 |
| 10, 11, 610 | Semantiği doğrulanmamış / unmapped | 381 + 418 + 10 |

`purchaseReturn` için CPM’de doğrulanmış belge türü ve upstream alış-lineage’ı bulunmadığından kayıtlar resmi etkiye alınmadı. Satış iadesi de yalnız açık kaynak satış belge/line bağlantısı varsa aday olarak bağlanıyor; belirsiz iadeler karantinada kalıyor. `GIRISCIKIS=0/1` yön kodlarının WAC giriş/çıkış semantiği ayrıca doğrulanmadı. Bu nedenle alış, satış, satış iadesi ve alış iadesinin resmi açılış maliyetine etkisi hesaplanmadı; yalnız candidate movement-impact özeti üretildi.

## Inventory source readiness

```text
status: candidate
verified: false
eligibleForOfficialWac: false
officialEligibleCount: 0
decision: SESSION_3_BLOCKED
```

Korunan blocker’lar:

- `inventory-source-not-verified`
- `official-cost-coverage-insufficient`
- `opening-lineage-unverified`
- `cost-semantics-unverified`
- `direction-semantics-unverified`
- `effective-read-only-permission-evidence-missing`

CPM’de hiçbir INSERT/UPDATE/DELETE/procedure/cutover çalıştırılmadı. Resmi WAC gate’i açılmadı.

## Kod ve test değişiklikleri

- `openingEvidenceMatcher`: ürün-depo-tarih-belge-line anahtarında `cost-conflict`, null-preserving para birimi/maliyet alanları ve explicit karantina nedenleri.
- `inventoryMovementSource`: ürün+depo anahtarında opening/purchase/sale/saleReturn/purchaseReturn etkisi; bilinmeyen hareket türleri ayrı tutuluyor.
- `inventoryOpeningResearch` ve SQL: `BIRIMFIYAT`, iki para birimi alanı, maliyet lineage alanları ve kaynak belge alanları null-preserving biçimde taşınıyor; `STKSYM` maliyet alanı olarak yorumlanmıyor.
- CPM read-only fingerprint registry güncellendi; sorgular yalnız parametreli `SELECT`/metadata okumalarıdır.
- Odak testleri: **45/45 GREEN**.

Sonraki güvenli adım, CPM yönetimi tarafından tarihsel açılış maliyeti ve belge-lineage sözleşmesinin doğrulanmasıdır; bu kanıt gelmeden resmi WAC hesabına geçilmemelidir.
