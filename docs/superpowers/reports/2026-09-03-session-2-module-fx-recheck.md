# Session 2 — 01-Döviz Kart modülünden tarihsel kur kanıtı

Tarih: 2026-09-03  
Sonuç: **SESSION_2_COMPLETE** (banka/kur kaynak kanıtı)  
Genel finansal readiness: **false** (envanter açılışı ve resmi WAC kapsamı ayrı blocker olarak korunuyor).

## Kaynak sözleşmesi

Kullanıcının eklediği `01-Döviz Kart` ekranı ile CPM read-only verisi çaprazlandı. Ekrandaki `03-Halk Bankası`, `0-Alış`, `1-Satış` etiketleri canlı verideki `BANKA=3`, `DOVIZTIP=0/1` alanlarıyla eşleşiyor. Bu modül sözleşmesi, `BNKKRT.ID=3` satırındaki farklı master adını (`İLLER BANKASI`) kur kaynağı adı olarak kullanmaktan daha doğrudan kanıttır.

Gerçek alanlar:

- `DVZHAR`: `ID`, `BANKA`, `DOVIZTIP`, `DOVIZTARIH`, `DOVIZCINS`, `DOVIZKUR` — günlük ana kur kaydı.
- `DVZDTY`: aynı kur alanları ve `GUNCELLEMETARIH` — modül indirme/revizyon detayı.
- `VW_DVZHAR_GUNCELKUR`: `DVZHAR` değerlerini ve `DVZDTY` son detay zamanını bağlayan modül görünümü.
- `STKHAR` fatura fiyatı: `FIYATDOVIZCINS`, `FIYATDOVIZKUR`.

## Görsel ve canlı kayıt kanıtı

Görseldeki sağ panel kayıtları canlı `DVZDTY` ile birebir bulundu:

| Detay ID | Tarih | Banka/tip | Döviz | Kur | Güncelleme |
|---:|---|---|---|---:|---|
| 15519 | 2026-09-03 | 03-Halk / 0-Alış | EUR | 54,4980 | 2026-09-02 17:41 |
| 15525 | 2026-09-03 | 03-Halk / 0-Alış | EUR | 55,5364 | 2026-09-03 08:56 |

Canlı `VW_DVZHAR_GUNCELKUR` aynı tarih için güncel modül değerlerini verdi: EUR `55,5364/56,6730`, GBP `64,0560/65,8770`, USD `47,8845/48,8645` (alış/satış). Bu değerler görselin sol paneliyle eşleşiyor.

## Tarihsel kapsam ve duplicate/conflict

`DVZHAR` ana günlük kayıtları 2022-09-09..2026-09-03 döneminde EUR/GBP/USD için alış-satış çiftleri sağlıyor. `DVZDTY` içinde aynı gün birden fazla indirme/revizyon kaydı bulunması beklenen audit tarihçesidir; 2026-09-03 EUR alışındaki 54,4980 → 55,5364 değişimi bunun doğrudan örneğidir. Ana kur seçiminde `DVZHAR` kullanılır, `DVZDTY` revizyon kanıtı olarak tutulur; bu satırlar sessizce toplanmaz.

Fatura günleri için modül kur kaynağıyla önceki geçerli tarih kuralı uygulandığında kapsam **5/5 döviz-kapsam grubunda %100** oldu:

| Kapsam/döviz | Gerekli gün | Kapsanan | Eksik |
|---|---:|---:|---:|
| Alım EUR | 296 | 296 | 0 |
| Alım USD | 156 | 156 | 0 |
| Satış EUR | 1.134 | 1.134 | 0 |
| Satış GBP | 443 | 443 | 0 |
| Satış USD | 1.056 | 1.056 | 0 |

Alım USD’de 2025-04-20 aynı gün kur satırı yoktu; açıkça seçilen önceki geçerli modül günü 2025-04-19’dur (alış 37,07; satış 39,62). Bugünkü kur, varsayılan kur, 1:1 veya sıfır kullanılmadı.

## Fatura satış kuru kullanım kanıtı

Fatura satırlarının `FIYATDOVIZKUR` değeri aynı tarih/dövizde `DVZHAR.DOVIZTIP=1` ile eşleşiyor. Daha önce alınan 24 örnek içinde örnekler: `STKHAR 189435 → EUR 20,332 / DVZHAR 5666`, `STKHAR 189696 → USD 19,022 / DVZHAR 5670`, `STKHAR 190233 → EUR 20,118 / DVZHAR 5678`.

## Fingerprint ve değişiklikler

- Modül ID/detail + görünüm + duplicate sorgusu: `08ff9602f00ed8a734cfaf0cceb5e3eb3a0f7676f133e6dfe56efff4df7c3592`, resultsets `[12,6,1,5120]`.
- Önceki geçerli gün kapsam sorgusu: `30f01dc05237ed53030ee3ba33377b174cfd6d6d7a6a98252e445933c3da5f93`, resultsets `[5,4]`.
- `server/cpmRateSource.mjs`: Döviz Kart modül kodu `3`, modül banka etiketi ve type `0/1` sözleşmesi eklendi.
- `server/index.mjs`/`compose.yaml`: modül banka adı ve `BANKA=3` yapılandırması taşındı; CPM read-only kaldı.
- `server/cpmRateAudit.mjs` ve testleri: modül kodu, revizyon duplicate/conflict ve kapsam ayrımı fail-closed şekilde güncellendi.

## Readiness

Banka/kur kanıtı artık tamamdır; ancak resmi finansal readiness otomatik açılmadı. `inventory-source-not-verified` ve `official-cost-coverage-insufficient` blocker’ları, envanter açılış/depo/lineage ve diğer WAC kanıtları tamamlanana kadar korunur. CPM’de INSERT/UPDATE/DELETE/prosedür çalıştırılmadı.
