# Session 5 — kişi bazlı CPM / Nexus satış uzlaştırması

**Durum: `SESSION_5_BLOCKED`**  
**Çalışma tarihi:** 2026-09-03  
**Kapsam:** 2026, `STKHAR` ekonomik satırları (17, 85, 91, 18), şirket 01, aktif kayıt, miktar > 0.

## Sonuç özeti

CPM bağımsız satırları ile Nexus `audit-ledger` kök kimlikleri aynı hareketli kaynaktan okunuyor. Önceki atomik yakalamada 22.094/22.094 satır eşleşti; yeni canlı okumada CPM ve audit 22.095 satıra ulaştı. Güncel audit filtresi neti 228.788.610,21 TL = 22.878.861.021 kuruş, analiz kapsamı ise 228.171.482,87 TL = 22.817.148.287 kuruştur. İstekler arasında yeni satır oluşabildiği için kişi farkları tek bir sabit snapshot kanıtı değildir.

Buna rağmen kişi bazlı uzlaşma tamamlanamadı:

- CPM `EVRBAS.SATICINO` 22.095/22.095 satırda boş; bağımsız kaynakta doğrudan teyitli ticari sahip kanıtı yok.
- CPM'deki hazırlayan/giren/değiştiren kullanıcılar operasyonel aktördür; özellikle BIRCAN'ın iade satırlarında görünmesi ticari sahiplik kanıtı değildir.
- `department-analysis` görünümünün 22.016 satır / 228.171.482,87 TL olması, `audit-ledger` içindeki 79 `excluded-income` satırının 617.127,34 TL kapsam dışı tutulmasından kaynaklanıyor; bu fark tanımlı ve kapsam uzlaşması sağlanıyor, artık blokaj değil.
- 22.095 satırın tamamı B2B değildir. CPM'de müşteri kodu `DBS%` ölçütüyle 3.209 satır / 1.225 belge / 44.117.790,38 TL = 4.411.779.038 kuruş B2B'dir; kalan 18.890 satır / 4.546 belge / 184.682.899,81 TL bu ölçüte göre B2B değildir. Geçmişinde tip-14 B2B siparişi bulunan 5.247 satır / 1.713 belge / 57.823.320,46 TL ayrıca ayrı bir lineage ölçüsüdür; bu sayı terminal B2B sayısına eklenmemelidir.
- Kâr için CPM bağımsız maliyet kanıtı yok. Canlı owner satırlarında `grossProfit` dolu satır sayısı 0; Nexus kârı bu nedenle bağımsız CPM kârı olarak sunulamaz.

Tüm TL tutarları iki ondalık minor-unit biçimine dönüştürüldü; örneğin 228.785.657,08 TL = 22.878.565.708 kuruş.

## Nexus ownerTotals vs CPM kaynak aktörü

CPM sütunu, `SATICINO → EVRAKHAZIRLAYAN → GIRENKULLANICI → DEGISTIRENKULLANICI` alanlarının ilk dolu değeridir. Bu, uzlaştırma için bağımsız aktör karşılaştırmasıdır; **confirmed ticari sahiplik değildir**. Fark sütunu `Nexus - CPM aktör` olarak hesaplandı.

| Kod / kişi | Nexus ownerTotals net | Nexus belge | Nexus kâr | CPM kaynak aktörü net | CPM iade | Fark | Kanıt durumu |
|---|---:|---:|---:|---:|---:|---:|---|
| MKARA / Mehmet Kara | 52.845.083,47 | 469 | 29.446.264,03 | 50.149.135,69 | 0,00 | +2.695.947,78 | inferred; kişi kanıtı yok |
| FURKAN / Furkan Çakır | 36.864.433,26 | 354 | 17.229.740,90 | 44.810.042,97 | 0,00 | -7.945.609,71 | inferred; kişi kanıtı yok |
| CBELIKIRIK / Can Belikırık | 25.225.910,63 | 920 | 8.407.313,37 | 37.410.077,82 | 0,00 | -12.184.167,19 | inferred; `CBELİKIRIK` normalize edildi |
| BCETINEL / Burak Çetinel | 19.306.317,79 | 108 | 10.462.575,72 | 10.384.119,76 | 0,00 | +8.922.198,03 | inferred; kişi kanıtı yok |
| EERDOGAN / Emre Erdoğan | 10.939.308,19 | 612 | 3.911.834,61 | 18.326.408,84 | 0,00 | -7.387.100,65 | inferred; kişi kanıtı yok |
| AERIMLI / Alperen Erimli | 9.077.288,13 | 397 | 2.825.877,29 | 10.305.587,27 | 0,00 | -1.228.299,14 | tarihsel/inactive |
| MAYAZ / Metin Ayaz | 3.907.327,40 | 249 | 1.626.766,55 | 24.330.695,88 | 0,00 | -20.423.368,48 | aktif Yedek Parça; CPM sahibi doğrudan doğrulanmadı |
| NTOKER / N. Toker | 2.061.447,18 | 130 | 585.004,31 | 7.088.685,21 | 0,00 | -5.027.238,03 | tarihsel/inactive |
| TSEMIZ / Tuğrul Semiz | 597.987,45 | 17 | 387.028,85 | 380.981,28 | 0,00 | +217.006,17 | tarih bazlı bölüm ataması |

CPM aktör listesinde ayrıca `BIRCAN` (25.551.814,65 TL net, 2.383.413,55 TL iade, 1.037 belge), `SYSTEM` (51.060,84 TL, 2 belge) ve `TSEMİZ` yazım varyantı (379.622,77 TL, 11 belge) vardır. BIRCAN ve SYSTEM ticari sahip değildir; `TSEMİZ` ve `TSEMIZ` aynı kimliğe normalize edilmelidir. CPM'de `SATICINO` dolu satır sayısı 0'dır.

## 22.095 satırın kaynağı ve MAYAZ belge zinciri

Bağımsız CPM sorgusu `SIRKETNO='01'`, 2026 tarihi, `KAYITDURUM=1`, `EVRAKTIP IN (17,85,91,18)` ve `MIKTAR>0` filtresiyle `STKHAR` üzerinden çalıştırıldı. Bu nedenle 22.095, B2B işlemlerinin sayısı değil; satış faturası, iade, nihai fatura ve perakende hareketlerinin ekonomik ledger satır sayısıdır. B2B siparişleri tip-14 olarak bu satırların geçmişinde yer alabilir, fakat kendi başına ikinci ekonomik satış satırı değildir.

MAYAZ için CPM'de doğrudan satır kanıtı bulundu: 2026-05-20 tarihli `ME02026000002027` / `DBS003` satırında `EVRAKHAZIRLAYAN=MAYAZ`, `GIRENKULLANICI=MAYAZ`, `DEGISTIRENKULLANICI=BIRCAN`; `SATICINO` boştur. Aynı okumada `ME02026000002019` / `DBS012` satırlarında hazırlayan ve giren MAYAZ, değiştirense bazı satırlarda MAYAZ'dır. Bu kanıt Metin Ayaz'ın Yedek Parça personeli olarak kayda dahil edilmesini destekler; son modifier veya header aktörü tek başına confirmed ticari sahiplik değildir.

Satır-5 için geçmiş ve sonraki belge kontrolü: `STKHAR.ID=764584`, `ME02026000003950` (tip 17, müşteri `DBS023`) → geçmişte `FI02026000000167` (tip 15) → `B2B-05714` (tip 14) zinciri satır anahtarıyla birebir çözüldü. Bu terminal satırın aynı kaynak anahtarını gösteren sonraki ekonomik belgesi yoktu. Dolayısıyla bu örnekte B2B siparişi, irsaliye ve fatura tek ekonomik akış olarak izleniyor; tekrar sayılmıyor.

## Manuel satır kanıtları

Bu satırlar CPM'den doğrudan okunmuştur. `directOwner` boş olduğundan aşağıdaki aktörler confirmed owner değil, yalnızca kaynak aktör kanıtıdır.

| Kişi | CPM satırı | Belge / tarih | Tür / müşteri / ürün | Net | Aktör alanları | Sonuç |
|---|---:|---|---|---:|---|---|
| Can Belikırık | 683486 | ME02026000000001 / 2026-01-02 | 17 / 1836 / ED0035450980-S | 49.980,99 | hazırlayan=giren=değiştiren `CBELİKIRIK`; source 14 `B2B-03882` | operasyonel aktör, confirmed değil |
| Can Belikırık | 683487 | ME02026000000001 / 2026-01-02 | 17 / 1836 / ED0053650020-S | 8.761,96 | aynı belge ve aktör zinciri | aynı ekonomik belge; mükerrer owner sayımı yapılmamalı |
| Furkan Çakır | 683695 | PRK-31463 / 2026-01-05 | 17 / 3471 / 129150-35170 | 426,79 | hazırlayan=giren `FURKAN`, modifier `BIRCAN`; source 64 `SP003940` | modifier satıcı değildir |
| Furkan Çakır | 683696 | PRK-31463 / 2026-01-05 | 17 / 3471 / 119802-55810 | 734,33 | aynı belge ve aktör zinciri | aynı ekonomik belge |
| Mehmet Kara | 684055 | ME02026000000075 / 2026-01-16 | 17 / S001 / İŞÇİLİK | 2.059,40 | hazırlayan=giren `MKARA`, modifier `BIRCAN`; source 64 `SP003943` | muhasebe modifier'ı owner değildir |
| Mehmet Kara | 669397 | ME02026000000147 / 2026-01-26 | 17 / A3508 / ED0021752800-S | 3.153,38 | hazırlayan=giren `MKARA`, modifier `BIRCAN`; source 64 `SP003821` | kaynak aktör kanıtı, confirmed değil |

## Precedence, aktör dışlama ve 91→85 kontrolü

Kodda doğrulanan precedence: `macro-source-order` (confirmed ve atomik owner+department) → aynı belge tip 13/14'te doğrulanmış `SATICINO` → upstream history (`MIREVRBAS`, inferred) → aynı bölüm uzlaşısı → yakın belge ipucu (review) → depot fallback (review) → review/unassigned. Aynı seviyedeki çelişkili kanıt review'a gider.

- BIRCAN, SYSTEM, ADMIN, SA ve sayısal/müşteri benzeri kodlar ticari owner dışı tutuluyor.
- Son modifier yalnızca audit aktörü; owner precedence'e tek başına giremiyor.
- `MAYAZ` artık `Metin Ayaz`, aktif `parts/Yedek Parça` personeli olarak kod kimliğine eşlendi. Bu düzeltme onu audit/personel kapsamından dışlamaz. Ancak CPM `SATICINO` boş olduğu ve mevcut kanıt header/history aktörü olduğu için performans sıralamasında confirmed owner olarak gösterilmemelidir; kanıt `ownerEvidenceTotals` altında korunmalıdır.
- `OGENCOGLU`, `AERIMLI`, `NTOKER` tarihsel sahiplik olarak tutuluyor; aktif performans gibi yorumlanmamalı. `TSEMIZ` departmanı 2026-05-25 öncesi service, 2026-05-26 sonrası parts.
- Bağımsız CPM satırlarında `type85` için 2.161 satırın `SONKAYNAKEVRAKTIP=91` akışına bağlı olduğu, toplam 2.170 type85 ve 4.237 type91 satır bulunduğu görüldü. Nexus kodunda tek ekonomik ledger ve `batchRisk` dışlama kuralı var; canlı kalite `batchRiskAmount=0` gösteriyor. Ancak 91→85 kök kimlik seti ile `department-analysis` projection farkı 79 satır nedeniyle tam “mükerrer yok” kanıtı bu snapshot'ta tamamlanmış sayılmamalıdır.

Farkların temsilî belge kökleri: `ME02026000000001` (Can, iki satır), `PRK-31463` (Furkan, üç satır), `ME02026000000075` ve `ME02026000000147` (Mehmet). Bunlar farkın root cause'unu gösteriyor: CPM'de doğrudan owner alanı boş, header aktörü operasyonel; Nexus upstream/history ve kimlik kurallarıyla inferred atama yapıyor. Tam fatura-düzeyi fark listesi için atomik, doğrudan CPM owner alanı veya aynı root/lineage/header anahtarıyla dışa aktarılabilir owner kanıtı gerekiyor.

## Kod/test düzeltmesi

`server/departmentAnalysis.mjs` artık:

- `topOwners` ve `ownerTotals` için yalnızca `attributionStatus === "confirmed"` ve `identityMappingRequired !== true` satırlarını kullanıyor;
- eski atanmış/inferred görünürlüğü `ownerEvidenceTotals` altında koruyor;
- `quality.ownerPerformanceNetSales` ile kesin performans kapsamını açıkça veriyor.

`server/departmentAnalysis.test.mjs`, `server/ownershipResolver.test.mjs` ve `server/departmentEvidencePresentation.test.mjs` MAYAZ eşlemesini ve inferred owner'ın sıralamadan çıkarılmasını kapsıyor. İlgili hedef testler 49/49 geçti. Canlı image v25'e deploy yapılmadı; bu nedenle canlı API'de eski `Tanımsız kullanıcı (MAYAZ)` etiketi deployment'a kadar görülebilir.

## Açık blokajlar ve karar

1. Bağımsız CPM kişi sahibi kanıtı yok (`SATICINO` boş) — **High / confidence high**.
2. CPM aktörleri operasyonel alanlarla karışıyor; BIRCAN iade örneği — **High / confidence high**.
3. Canlı veri akışı nedeniyle farklı isteklerde snapshot atomikliği — **Medium / confidence medium**; kapsam farkı tanımlı (`excludedRows=79`, `excludedNetAmount=617.127,34 TL`), fakat kişi uzlaşması için tek snapshot yine gerekli.
4. CPM maliyet kanıtı yok; kişi kârı doğrulanamaz — **High / confidence high**.
5. CPM bağlantısı read-only sorgu disipliniyle kullanıldı; SQL principal'ın least-privilege olduğu ayrıca doğrulanmadı.

MAYAZ kimlik eşlemesi ve B2B/lineage yanlış kapsamlandırması yerelde düzeltildi. Doğrudan CPM `SATICINO` sahibi ve bağımsız CPM maliyet kanıtı hâlâ bulunmadığından bu çözüm kişi performansını confirmed hale getirmiyor.

Bu nedenle `SESSION_5_COMPLETE` verilemez. `SESSION_5_BLOCKED` korunmalıdır. Devam için önce atomik snapshot/canonical owner export, doğrudan owner alanının doldurulması veya onaylı owner mapping tablosu ve bağımsız maliyet kaynağı gerekir.
