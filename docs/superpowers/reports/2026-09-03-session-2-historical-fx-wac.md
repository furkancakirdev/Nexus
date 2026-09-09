# Session 2 — CPM tarihsel EUR/WAC kur kanıtı

> Superseded by `2026-09-03-session-2-module-fx-recheck.md`. This historical snapshot used the BNKKRT master label as the module identity; the 01-Döviz Kart screen and DVZDTY module records provide the authoritative module-level contract.

Tarih: 2026-09-03  
Durum: **SESSION_2_BLOCKED**  
Yöntem: CPM bağlantısı yalnızca parametrik/okuma amaçlı `SELECT`; kalıcı değişiklik, prosedür veya geçici tablo kullanılmadı.

## Sonuç

Halkbank kimliği CPM master verisinde kanıtlanmıştır: `BNKKRT.ID=6`, `BANKAKOD=012`, `BANKAAD=HALK BANKASI`. Ancak canlı `DVZHAR` içinde `BANKA=6` için gözlenen tarihsel kur satırı **0**'dır. Gözlenen kur satırları `BANKA=3`, `BNKKRT.ID=3`, `BANKAKOD=004`, `BANKAAD=İLLER BANKASI` kaynağına aittir. Bu nedenle ID3 satırları Halkbank diye yeniden adlandırılamaz ve resmi EUR/WAC readiness açılmaz.

## Kur kaynak sözleşmesi

Canlı alan doğrulaması:

- `DVZHAR`: `ID`, `BANKA`, `DOVIZTIP`, `DOVIZTARIH`, `DOVIZCINS`, `DOVIZKUR` ve audit alanları.
- `DVZDTY`: aynı kur alanları ve `GUNCELLEMETARIH`; tip açıklaması sağlayan bir ad/etiket alanı bulunmadı.
- `BNKKRT`: `ID`, `BANKAKOD`, `BANKAAD` ve banka master alanları.
- Fatura fiyat kuru: `STKHAR.FIYATDOVIZCINS` ve `STKHAR.FIYATDOVIZKUR`. WAC aday sorgusu bu alanlara düzeltildi; `STKHAR.DOVIZCINS/DOVIZKUR` fatura fiyat kuru olarak kullanılmıyor.

Beklenen sözleşme `BANKA=6`, alış `DOVIZTIP=0`, satış `DOVIZTIP=1` olarak yapılandırılmıştır. ID6 için satır bulunmadığından banka-kur sözleşmesi doğrulanmamıştır. ID3 için tip 1'in satış faturası kuru olarak kullanıldığına dair operasyonel eşleşme vardır, fakat `DOVIZTIP` anlamı kaynak etiketiyle kanıtlanmamıştır.

## Fatura tarih kapsamı

| Kapsam | Döviz | Fatura satırı | Gerekli gün | Tarih aralığı | ID3 tam çift | ID6 tam çift |
|---|---:|---:|---:|---|---:|---:|
| Alım | EUR | 1.228 | 296 | 2022-11-03..2026-08-25 | 296 | 0 |
| Alım | USD | 710 | 156 | 2023-01-02..2026-08-24 | 155 | 0 |
| Satış | EUR | 79.651 | 1.134 | 2023-01-02..2026-09-03 | 1.134 | 0 |
| Satış | GBP | 829 | 443 | 2023-01-05..2026-09-02 | 443 | 0 |
| Satış | USD | 16.161 | 1.056 | 2023-01-03..2026-09-03 | 1.056 | 0 |

TRY/parite kontrolünde boş `FIYATDOVIZCINS` satırları ayrıca incelendi; belge türleri 9/17/18/85/91/609 için sırasıyla boş ve `FIYATDOVIZKUR=1` satırlarının tamamı aynı gün parite koşulundaydı: `14.375/14.375`, `2.397/2.397`, `874/874`, `321/321`, `1.924/1.924`, `26.898/26.898`. Bu, yabancı döviz eksikliğini 1:1'e çevirmek için kullanılmadı.

## Duplicate, conflict ve missing listesi

- ID3 `DOVIZTIP=0/1`: EUR `1.239/1.239`, GBP `1.238/1.238`, USD `1.239/1.239` satır; kapsam `2022-09-09..2026-09-03`. Aynı gün duplicate/conflict grup sayısı **0**.
- ID6: tüm incelenen kur tipleri ve dövizler için satır sayısı **0**; bu nedenle 296 EUR + 156 USD alım günü ve 1.134 EUR + 443 GBP + 1.056 USD satış günü kapsamı eksiktir.
- ID3 eksik fatura günü: alım USD, **2025-04-20**. Satış kapsamlarında ID3 için eksik gün yoktur.
- Çelişkili aynı-gün kur kaydı bulunmadı; ID6 için veri yokluğu, duplicate yokluğu anlamına gelmez ve sözleşme kanıtı sayılmaz.

## Fatura tarihindeki satış kuru kullanım kanıtı

`STKHAR.FIYATDOVIZKUR = DVZHAR.DOVIZKUR` olacak şekilde aynı fatura tarihi, döviz, `BANKA=3`, `DOVIZTIP=1` eşleştirmesi yapıldı. Düzeltilmiş sorgu 24 örnek kayıt döndürdü. Örnekler:

| STKHAR ID | Belge tipi | Tarih | Döviz/kur | DVZHAR ID | Tip/banka |
|---:|---:|---|---|---:|---|
| 189435 | 91 | 2023-01-02 | EUR / 20,332 | 5666 | 1 / 3 |
| 189696 | 91 | 2023-01-03 | USD / 19,022 | 5670 | 1 / 3 |
| 190233 | 85 | 2023-01-04 | EUR / 20,118 | 5678 | 1 / 3 |

Bu kanıt, mevcut uygulama verisinin ID3/type1 satırlarıyla eşleştiğini gösterir; Halkbank ID6 veya vendor tip semantiğini kanıtlamaz.

## Sorgu fingerprint ve row count kanıtı

- Üretim aday sorgusu `exchange-rate-candidate-v1`: `c95d7d6c082fb056811120210db8e1ed92c60d68854ff7cceae3714557a09ad6`.
- Düzeltilmiş tüm kapsam sorgusu (`FIYATDOVIZCINS/FIYATDOVIZKUR`): `35f4c22b4815f7fff46d5b63574e17d8c2c7c10d3c9d7efaa8ecbb0e43abf29b`; resultset row counts `[21, 2, 6, 24]`.
- Duplicate/pair/missing özet sorgusu: `579042a29236ce8144b91d43ca17af54c0b4338937423f01c15fe54dd172547d`; özet row count `9`.
- Önceki `STKHAR.DOVIZCINS/DOVIZKUR` sorguları yalnız teşhis amaçlıdır ve doğru fatura fiyat alanlarıyla değiştirildi; resmi kapsam kanıtı olarak kullanılmamalıdır.

## Kod, test ve readiness etkisi

- `server/cpmRateAudit.mjs`: duplicate/conflict ayrımı, banka kimliği, tarih-gün kapsamı ve eksik günleri fallback'siz fail-closed değerlendiren saf yardımcı eklendi.
- `server/cpmRateAudit.test.mjs`: duplicate/conflict, TRY paritesi, eksik banka satırı ve yanlış banka adı testleri eklendi.
- `server/inventoryOpeningResearchSql.mjs`: hareket adayında `FIYATDOVIZCINS/FIYATDOVIZKUR` kullanımı düzeltildi.
- `server/inventoryOpeningResearchSql.test.mjs`: gerçek fatura fiyat alanları ve eski alanların kullanılmaması için regression kontrolü eklendi.
- Finansal readiness **false/kapalı** bırakıldı; `inventory-source-not-verified` ve `official-cost-coverage-insufficient` blocker'ları korunuyor. Eksik kur satırları maliyete, sıfıra veya varsayılan kura dönüştürülmedi.
