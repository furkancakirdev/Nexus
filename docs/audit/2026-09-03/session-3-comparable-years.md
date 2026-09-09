# Session 3 — Karşılaştırılabilir iki yıl CPM/Nexus WAC kapsamı

**Tarih:** 2026-09-03  
**CPM:** `Marlin_Uyg`  
**Durum:** `SESSION_3_COMPLETE`  
**Inventory source:** `candidate` — `verified=false`, `eligibleForOfficialWac=false`  
**Resmi WAC gate:** Kapalı

## 1. Kapsam ve kesin dönemler

İncelenen iki dönem tam takvim yılı olarak kesinleştirildi:

- **2024:** `[2024-01-01, 2025-01-01)`; CPM ilgili `STKHAR` satırlarının gerçek tarihi `2024-01-01–2024-12-31`.
- **2025:** `[2025-01-01, 2026-01-01)`; CPM ilgili `STKHAR` satırlarının gerçek tarihi `2025-01-01–2025-12-31`.

2026 sorgu kapsamı `2026-01-01–2026-09-01`/`2026-08-07` ile devam eden dönemdir; tam yıl gibi kullanılmadı ve iki yıllık karşılaştırmaya alınmadı. `STKSYM DEVIR` 2024’te yalnız `2024-01-02–2024-10-31`, 2025’te `2025-01-02–2025-09-25` aralığında bulunduğu için yıllık payda yapılmadı; yalnız destekleyici/kısmi kaynak olarak raporlandı.

Tüm canlı sorgular `Marlin_Uyg` üzerinde parametreli `SELECT` veya SQL metadata okumasıdır. CPM’ye yazma, procedure çalıştırma, deploy, cleanup veya veri silme yapılmadı.

## 2. Açılış kanıtı kapsam tablosu

| Kaynak / grain | 2024 | 2025 | Yorum |
|---|---:|---:|---|
| `STKHAR` ilgili hareket satırı | 43.313 | 46.074 | Tam takvim yılı tarih filtresi |
| `STKHAR` ürün sayısı | 4.164 | 4.671 | Ürün kodu normalize edilerek |
| `STKHAR` depo sayısı | 8 | 11 | Depo birleştirilmedi |
| Pozitif miktarlı satır | 43.305 | 46.070 | `MIKTAR > 0` |
| Sıfır/negatif miktarlı satır | 8 | 4 | WAC’a alınmadı; review |
| Maliyet adayı (`81,82,9,609`) | 13.343 | 12.443 | `BIRIMFIYAT` alanı incelendi |
| Pozitif `BIRIMFIYAT` | 13.321 | 11.938 | Tek başına yeterli maliyet kanıtı sayılmadı |
| Eksik/sıfır maliyet | 22 | 505 | `unpriced`; sıfıra çevrilmedi |
| Strict cost included | 406 | 775 | Pozitif maliyet + ürün dövizi + satır döviz/kuru uyumu |
| Review / unpriced | 12.937 | 11.668 | Ürün dövizi eksik/uyumsuz, kur kanıtı eksik veya maliyet eksik |
| Strict covered oranı | **3,0%** | **6,2%** | `strict cost included / cost candidate`; resmi covered değildir |
| İlk güvenilir maliyet tarihi | 2024-01-02 | 2025-01-02 | Geçmişten maliyet taşınmadı |
| Taşınan kapanış WAC kapsamı | 0 | 0 | Önceki kapanış tüm stock key’lerde bağımsız kanıtlanmadı |
| Aday hesapta kullanılan ürün dövizleri | EUR, USD | EUR, USD | GBP kart kapsamı var; qualifying cost satırı yok |
| Finansal durum | `blocked` | `blocked` | Candidate hesap; resmi WAC uygunluğu yok |

`covered` oranı kasıtlı olarak tüm hareket satırlarının oranı gibi sunulmadı. Satış/iadelerin maliyetli görünmesi için önce aynı ürün+depo+para birimi anahtarında güvenilir WAC gerekir. Bu kanıt bulunmayan satışlar `review/opening-cost-unknown` olarak dışarıda kaldı.

### STKHAR tür dağılımı ve etki

| CPM tipi | Aday anlam | 2024 | 2025 | Hesap durumu |
|---:|---|---:|---:|---|
| 81, 82 | Açılış/devir adayı | 597 | 973 | Pozitif ve para birimi kanıtlıysa aday seed; eksikse `opening-cost-unknown` |
| 9, 609 | Alış adayı | 12.746 | 11.470 | Pozitif maliyet/kaynak dövizi varsa WAC katmanı |
| 17, 85, 91 | Satış adayı | 29.402 | 33.184 | Önceden güvenilir WAC varsa maliyetlenir |
| 18 | Satış iadesi adayı | 289 | 229 | Kaynak satış belge/line bağlantısı varsa ters kayıt |
| 10, 11, 610 | Semantiği doğrulanmamış | 279 | 218 | `unmapped`/karantina |

`purchaseReturn` için CPM’de doğrulanmış belge türü ve alış kaynak-lineage’ı yoktur; bu nedenle alış iadesi WAC’a dahil edilmedi. `GIRISCIKIS=0/1` yönü de alış/satış yönü olarak yorumlanmadı. Satış iadesi yalnız orijinal satış kimliği kanıtlanırsa adaydır.

## 3. Kaynakların gerçek anlamı ve alan kanıtı

| Kaynak | Kanıtlanan gerçek anlam | WAC kararı |
|---|---|---|
| `STKHAR` | Hareket tablosu: `MALKOD`, `DEPOKOD`, `EVRAKTARIH`, `EVRAKTIP`, `EVRAKNO`, `SIRANO`, `MIKTAR`, `BIRIMFIYAT`, `TUTAR`, `ISKONTO`, `FIYATDOVIZCINS`, `FIYATDOVIZKUR`, `DOVIZCINS`, maliyet/source kolonları | Tarihli hareket ve maliyet adayı; tip semantiği tam resmi sözleşme değil |
| `STKSYM` `MKOD4='DEVIR'` | Devir/snapshot tablosu; ürün, depo, tarih, belge/line ve miktar taşır; maliyet ve para birimi alanı yok | Miktar destek kaynağı; maliyet kaynağı değil |
| `VW_STOKDURUM` | Ürün/depo mevcut stok, giriş/çıkış, rezervasyon ve `STOKMIKTAR` görünümü; tarihsel maliyet/WAC yok | Current snapshot; tarihsel WAC’a dahil değil |
| `HAKKI_STOK_DEVIR` | `STKHAR`/`EVRAKTIP` tabanlı devir miktarı toplama görünümü; maliyet lineage yok | Miktar karşılaştırma adayı |
| `VW_STOK_DEVIR_MALIYET_AKTAR` | Devir miktarı ile güncel `STKKRT.NKOD1` + KDV/iskonto türetimi; tarihsel alış-lineage yok | Geçmiş maliyet olarak reddedildi |
| `STKMLY` | Canlıda satır yok | Official source olamaz |
| Session 2 CPM FX (`DVZHAR`/`DVZDTY`/`VW_DVZHAR_GUNCELKUR`) | `BANKA=3`, `DOVIZTIP=1`, `DOVIZCINS`, tarih ve Halkbank satış kuru sözleşmesi; EUR canonical gösterim korunuyor | Yalnız açık satır dövizi/kuru ve tarih kanıtı varsa dönüşüm; boş/1 parite yabancı döviz fallback’i değil |

`STKHAR` 2024/2025 ürün kartı döviz kapsamı `EUR`, `GBP`, `USD` ve kart dövizi eksik gruplarıdır. Strict aday WAC’ta kullanılan dövizler `EUR` ve `USD`’dir. GBP için ilgili maliyet türlerinde pozitif maliyet + satır dövizi + ürün kartı dövizi uyumlu örnek bulunmadı; GBP satırları covered yapılmadı.

## 4. Doğal anahtar / unmatched / conflict

Anahtar: **ürün + depo + tarih + belge no + satır no**; maliyet grain’i buna para birimini de ekler.

| Kontrol | 2024 | 2025 | Karar |
|---|---:|---:|---|
| `STKSYM DEVIR` satırı | 9.018 | 11.739 | Kısmi destek kaynağı |
| Ürün+depo+tarih kesişimi | 113 | 13 | Unmatched/conflict adayı |
| Aynı miktarlı kesişim | 21 | 2 | Quantity-only; maliyet karşılaştırması yok |
| Exact doğal anahtar | 0 | 0 | Açılış eşleşmesi kanıtlanmadı |
| STKHAR doğal kimlik duplicate grubu | 0 | 0 | Bu kontrolde duplicate yok |
| STKHAR pozitif maliyet conflict grubu | 0 | 0 | Aynı doğal kimlikte min/max maliyet çakışması yok |
| STKSYM doğal kimlik duplicate grubu | 0 | 0 | Bu kontrolde duplicate yok |

Ürün/depo bazlı örnek unmatched kayıtları (2024): `00530/YTM`, `00530/50/YTM`, `0130-4434/YTM`, `04030/YTM`, `104211-42100/YTM`, `104500-55710/YTM`; aynı tarihte STKSYM belge `235` satırları ile STKHAR belge `235` satırları vardır ancak line ve/veya miktar farklıdır. Bu, belge numarasının tek başına doğal bağ olmadığını gösterir. 2025’te 13 ürün+depo+tarih kesişiminin yalnız 2’si miktarla da kesişmiş, exact anahtar yine 0’dır.

**Miktar eşleşip maliyet eşleşmeyenler:** 2024’te 21, 2025’te 2 quantity-only kesişim vardır. `STKSYM` maliyet/para birimi taşımadığı için bu satırlarda sayısal cost mismatch üretmek mümkün değildir; hepsi maliyet kanıtı yokluğu nedeniyle karantinadadır. Bu durum `conflict=0` diye yorumlanmamıştır. Kod matcher’ı iki tarafta pozitif maliyet bulunduğunda `cost-conflict`, sıfır/boş maliyette `missing-cost-evidence` üretir.

## 5. CPM satırı → Nexus aday hesap örnekleri

Aşağıdaki örnekler, satırdaki pozitif `BIRIMFIYAT`, ürün kartı dövizi, `FIYATDOVIZCINS` ve `FIYATDOVIZKUR` aynı olduğunda hesaplayıcının ilk güvenilir WAC seed’ini gösterir. `Nexus aday WAC`, ürün dövizi birim maliyetidir; TRY karşılığı `BIRIMFIYAT × CPM satır satış kuru` ile gösterilmiştir. Bunlar resmi WAC sonucu değildir.

| Yıl | Ürün | Depo | CPM tip/tarih | Döviz | Miktar | CPM birim maliyet | Kur | Nexus aday WAC | TRY karşılığı |
|---:|---|---|---|---|---:|---:|---:|---:|---:|
| 2024 | `04030` | DPO | 9 / 2024-03-08 | EUR | 10 | 1.370,259044 | 34,4806 | 1.370,259044 EUR | 47.247,353993 |
| 2024 | `80162` | MRK | 82 / 2024-01-02 | EUR | 2 | 516,0592 | 32,2537 | 516,0592 EUR | 16.644,818619 |
| 2024 | `X00058062` | TSH | 82 / 2024-01-18 | EUR | 19 | 7.213,2278736 | 32,4024 | 7.213,2278736 EUR | 233.725,894852 |
| 2024 | `5266616` | YTM | 82 / 2024-05-04 | EUR | 0,3 | 899,01616 | 33,7976 | 899,01616 EUR | 30.384,588569 |
| 2024 | `0185-5835` | DPO | 9 / 2024-01-20 | USD | 40 | 988,18902 | 30,6891 | 988,18902 USD | 30.326,631654 |
| 2024 | `ACH-102` | TSH | 82 / 2024-01-04 | USD | 35 | 1.027,873 | 29,3678 | 1.027,873 USD | 30.186,368689 |
| 2025 | `MAR1130` | DPO | 82 / 2025-03-21 | EUR | 3 | 277,26426 | 40,6248 | 277,26426 EUR | 11.263,805110 |
| 2025 | `1G89604140` | MRK | 9 / 2025-01-03 | EUR | 2 | 371,8865 | 36,6010 | 371,8865 EUR | 13.610,630865 |
| 2025 | `5266622` | TSH | 82 / 2025-02-17 | EUR | 10 | 2.207,5075512 | 37,2852 | 2.207,5075512 EUR | 82.307,360548 |
| 2025 | `198517332` | DPO | 82 / 2025-03-21 | USD | 2 | 660,352 | 37,5200 | 660,352 USD | 24.776,407040 |
| 2025 | `503580069` | MRK | 82 / 2025-01-15 | USD | 1 | 464,730944 | 34,9948 | 464,730944 USD | 16.263,116644 |
| 2025 | `GM32809` | TSH | 9 / 2025-11-14 | USD | 160 | 2.053,3661875008 | 42,7725 | 2.053,3661875008 USD | 87.730,070361 |

Bu örnekler en az 10 ürünü, birden fazla depoyu ve hesaplamada kullanılan EUR/USD dövizlerini kapsar. Ürün, depo ve döviz anahtarları hesaplayıcıda ayrı tutulur; aynı ürünün başka deposu veya başka dövizi seed olarak kullanılamaz.

## 6. Kod/test değişiklikleri

- `shared/financialCostModel.mjs`: `buildComparableYearWac` eklendi. Yıl aralığını açıkça uygular; önceki kapanışı yalnız `ürün\u001fdepo\u001fdöviz` anahtarında seed eder; unknown opening’i validation’a maliyet varmış gibi sokmaz; `negativeStockMarginFallback` sonucu covered yapmaz; `costStatus` ve `reviewReason` üretir; candidate hesapların `financialStatus` değerini `blocked` tutar.
- `server/financialCostModel.test.mjs`: unknown opening, aynı ürünün farklı depo/dövizinin karışmaması ve negatif stok tahmininin covered olmaması için testler eklendi.
- Önceki Session 3 matcher/source değişiklikleri korunuyor: doğal anahtar, null-preserving cost/currency, `cost-conflict`, hareket yönü/iadelerin karantinası ve ürün+depo hareket etkisi.
- Plan: `docs/superpowers/plans/2026-09-03-session-3-comparable-years.md`.

Doğrulama:

- Odak financial cost testleri: **33/33**.
- Tam Node suite: **490/490**, exit code 0.
- Vite build: **6.775 modül**, exit code 0.
- `git diff --check`: exit code 0; yalnız mevcut LF/CRLF dönüşüm uyarıları.

## 7. Inventory source readiness ve sınırlamalar

```text
status: candidate
verified: false
eligibleForOfficialWac: false
financialStatus: blocked
decision: SESSION_3_COMPLETE
```

`SESSION_3_COMPLETE`, tam tarihsel açılış maliyetinin kanıtlandığı anlamına gelmez. Revize edilen hedef olan 2024/2025 CPM kapsamı, tarih aralığı, kaynak anlamı, karantina sayıları, strict aday maliyet kapsamı ve ürün-depo-döviz örnek hesapları kanıtlı şekilde tamamlandı. Eksik açılış maliyeti bu oturumun tek başına blocker’ı değildir; fakat hiçbir eksik maliyet resmi `covered` kapsamına alınmamıştır.

Resmi WAC için hâlâ ayrı kapalı durumlar: CPM inventory source sözleşmesinin official olarak doğrulanmaması, `STKSYM` ile açılış lineage eşleşmesinin 0 olması, tip/yön/alış iadesi semantiğinin tamamlanmaması ve etkin SELECT-only yetkisinin ayrıca kanıtlanmamış olmasıdır.
