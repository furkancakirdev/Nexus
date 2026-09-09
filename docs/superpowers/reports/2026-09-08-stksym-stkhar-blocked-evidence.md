# BLOCKED EVIDENCE — STKSYM–STKHAR açılış/WAC ilişkisi

Tarih: 2026-09-08  
Dal: `codex/UI`  
HEAD: `17fbbd2daf69c59ff24ca198dab36ca326fbb067`  
Karar: **BLOCKED EVIDENCE**

## Kapsam ve sınır

Bu rapor yalnız mevcut önceki canlı CPM salt-okunur SELECT kanıtını, mevcut
araştırma sözleşmesini ve güncel saf kod/test davranışını değerlendirir.
CPM'ye yazma, production deploy/restart/recreate, secret okuma veya dış
sisteme yazma yapılmadı. `shared/` finans dosyaları değiştirilmedi.

Son canlı açılış kanıtı `docs/audit/2026-09-03/session-3-opening-evidence.md`
içindeki 2026-09-03 tarihli okumadır. Bu oturumda yeni canlı sorgu çalıştırılmadı;
bu nedenle aşağıdaki nüfus sayıları **son bilinen canlı kanıt**, 2026-09-08
anlık nüfus doğrulaması değildir.

## Son bilinen canlı kapsam

| Kaynak | Kapsam | Kanıt rolü |
|---|---:|---|
| `STKSYM`, `MKOD4='DEVIR'` | 6.439 satır / 4.469 ürün / 4 depo | Miktar/devir adayı; maliyet kaynağı değil |
| `STKHAR`, tip 82 | 758 satır / 627 ürün / 7 depo | Hareket ve maliyet adayı; `STKSYM` ile soy zinciri kurulamadı |
| `STKHAR`, tip 81 | 2026'da satır yok | 2026 açılışı olarak kullanılamaz |

## Eksen bazlı kanıt matrisi

| Eksen | Gözlenen kanıt | Sonuç |
|---|---|---|
| Ürün | Ürün kodu alanları iki kaynakta mevcut; ürün bazında yakınlık ölçüldü. | Ürün eşleşmesi tek başına soy zinciri değildir. |
| Depo | `DEPOKOD` mevcut; `STKSYM` 4, `STKHAR` tip 82 7 depo içeriyor; çoklu depo satırları var. | Aynı ürünün depoları birleştirilemez; depo eşleşmesi gerekli ama yeterli değil. |
| Tarih | Ürün+depo+tarih kesişimi yalnız 6 satır verdi. | Tarih yakınlığı belge/lineage kanıtı değildir. |
| Belge/satır | Tam doğal anahtar `ürün+depo+tarih+belge no+satır no` karşılaştırmasında eşleşme 0. `STKSYM` örnekleri sayısal belge/line, `STKHAR` tip 82 örnekleri `SSF-*` belge kimlikleri taşıyor. | Upstream belge/satır bağı kanıtlanmadı. |
| Miktar | Ürün+depo+tarih+miktar kesişimi 1; tarih serbest ürün+depo+miktar adayları daha geniş. | Miktar eşitliği veya benzerliği exact eşleşme sayılamaz. |
| Yön | `STKHAR` tip 82 yönleri 0/1; yön 0/1'in açılış/devir/düzeltme anlamı sözleşmeyle doğrulanmadı. | Yön semantiği bloke. |
| Döviz | `STKSYM` tarafında doğrulanmış maliyet/döviz alanı yok; `STKHAR` alanları aday olarak mevcut. | Döviz sürekliliği ve kaynak eşleşmesi kanıtlanmadı. |
| Maliyet | `STKHAR` tip 82'de pozitif `TUTAR-ISKONTO` taşıyan satırlar var; `STKSYM` ile karşılaştırılabilir maliyet kanıtı yok. | Sonraki alım veya snapshot değeri geçmiş satış maliyeti yapılamaz. |

Örnek canlı karşılaştırmalarında aynı ürün/depo/tarih gününde belge, satır ve
miktar farklılıkları görüldü: `2020TM` (13 vs 2), `BE12/TF` (14 vs 2),
`BE10/TF` (6 vs 1), `XTS0814/2` (25 vs 1), `XTS0814/3` (11 vs 1).
`129474-33050M` için miktar 1 eşit olsa da belge/satır farklıdır; bu yalnız
`quantity-only` adaydır.

## Soy zinciri ve tüketim etkisi

Önceki canlı diagnostikte `STKSYM` satırlarının sonraki aynı ürün/depo satışları
ile örtüşmesi bulundu; bu yalnız tüketim adayıdır. Satış örtüşmesi, STKSYM
satırını geçmiş maliyet kaynağına dönüştürmez. Tip 91 → 85 ekonomik zinciri
ayrı kurallara tabidir ve bu raporda sentetik eşleşme yapılmamıştır.

## Resmi WAC kararı

Kanıt, ürün/depo/tarih düzeyinde bazı yakınlıklar gösterse de belge/satır
soy zinciri, yön semantiği, döviz sürekliliği ve karşılaştırılabilir maliyet
kanıtı birlikte tamamlanmamıştır. Bu nedenle resmi uygunluk kapalıdır:

```text
officialEligibleCount = 0
eligibleForOfficialWac = false
status = candidate
decision = BLOCKED EVIDENCE
```

Bu karar eşiği düşürülerek, miktar/tarih benzerliğiyle, sentetik belge bağıyla
veya sonraki alımı geçmiş satış maliyeti yaparak değiştirilemez.

## Güncel kod/test doğrulaması

- `server/inventoryOpeningResearch.mjs`: araştırma payload'ı `status: candidate`,
  `eligibleForOfficialWac: false` ve `officialEligibleCount: 0` döndürüyor.
- `server/openingEvidenceMatcher.mjs`: `exact-key`, `quantity-only`,
  `document-date-depot-conflict`, `cost-conflict`, `missing-cost-evidence` ve
  `unmatched` sınıflarını ayırıyor; resmi uygunluk özeti daima 0 kalıyor.
- `npm test -- --runInBand`: **559/559 geçti**.
- `npm run build`: **başarılı**, 6.779 modül dönüştürüldü.
- `git diff --check`: hata yok; mevcut CRLF dönüşüm uyarıları var.

## Kanıtlanan / değiştirilen / blokeli / doğrulanamayan

### Kanıtlanan

- Gerçek branch, HEAD ve mevcut değişiklikler başlangıçta kaydedildi.
- Kök `AGENTS.md` okundu ve CPM salt-okunur sınırı korundu.
- Önceki canlı araştırmada tam doğal anahtar eşleşmesi 0 ve miktar-eşleşen
  tek adayın belge/satır kimliği farklı olduğu görüldü.
- Güncel kod resmi WAC uygunluğunu fail-closed tutuyor.
- Mevcut test suite ve production build başarılı.

### Değiştirilen

- Yalnız bu rapor eklendi:
  `docs/superpowers/reports/2026-09-08-stksym-stkhar-blocked-evidence.md`
- CPM, production, secret, dış sistem ve `shared/` finans dosyalarına değişiklik
  yapılmadı.

### Blokeli

- `STKSYM` → `STKHAR` upstream belge/satır soy zinciri.
- Tip 82 yön kodu semantiği.
- STKSYM tarafında maliyet/döviz kanıtı ve maliyet sürekliliği.
- 2026 açılışının tam nüfus ve depo bazında resmi WAC'a uygunluğu.

### Doğrulanamayan

- 2026-09-08 anlık CPM nüfusu; son canlı kanıt 2026-09-03 tarihli.
- `STKSYM` devir satırlarının üretici/CPM sözleşmesindeki resmi anlamı.
- Her aday için doğrulanmış maliyet ve döviz soy zinciri.

## Sonraki oturuma devir

CPM yönetimi tarafından doğrulanmış bir belge/satır anahtarı ve yön/maliyet/
döviz sözleşmesi sağlanana kadar kod entegrasyonu yapılmamalı. Sonraki güvenli
adım, yalnız parametreli SELECT ile aynı kapsamın güncel nüfusunu ve bu yeni
sözleşmenin exact key sonuçlarını yeniden ölçmektir; kanıt tamamlanmazsa bu
rapordaki `0/false` kararı korunmalıdır.
