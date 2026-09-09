# Canlı CPM–Nexus Mutabakat Kanıtı — 2026-09-01

## Kapsam ve güvenlik sınırı

Bu çalışma canlı CPM üzerinde yalnızca salt-okunur sorgularla ve Nexus yönetici ekranının gözlemlenmesiyle yapıldı. Kullanıcının belirttiği gibi CPM hesabının geniş yetkileri operasyonel engel kabul edilmedi; ancak hesabın teknik olarak SELECT-only olmadığı ayrı bir bulgu olarak korunur. Bu çalışmada hiçbir CPM yazma sorgusu, DDL, kayıt değişikliği veya deploy yapılmadı.

## Genel toplam

Canlı CPM recordset'leri Nexus'un canlı `buildFinalInvoiceLedger` dönüşümünden geçirildi. Dönem: şirket `01`, yıl `2026`. Nexus Sales ekranındaki tutarlar aynı canlı oturumda gözlemlendi.

| Metrik | CPM canlı ledger | Nexus Sales UI | Fark | Durum |
|---|---:|---:|---:|---|
| Brüt satış | 265.200.796,16 TL | 264.580.935 TL | 619.861,16 TL | Uyuşmuyor |
| İadeler | 2.380.829,99 TL | 2.380.830 TL | -0,01 TL | Yuvarlama ile uyumlu |
| İskontolar | 35.925.986,96 TL | 35.923.253 TL | 2.733,96 TL | Uyuşmuyor |
| Net satış | 226.893.979,21 TL | 226.276.852 TL | **617.127,21 TL** | **Uyuşmuyor** |

Nexus UI neti, ekranda görülen `264.580.935 - 2.380.830 - 35.923.253` hesabından elde edildi. CPM ledger'da 21.919 satır ve `excludedTestRows=0` raporlandı. Önceki kanıt setindeki bilinen test kapsamı yaklaşık 617.127 TL olduğundan, mevcut kanıt güçlü biçimde kapsam/harici kayıt-exclusion farkına işaret ediyor; ancak satır/fatura bazlı eşleştirme tamamlanmadan kök neden kesinleştirilmemelidir.

## Nexus ekran kapsamı farkı

| Ekran | Canlı gösterim | Yorum |
|---|---:|---|
| Overview net sales | €1.007.852 | Sales ekranıyla uyumlu görünüyor |
| Sales net sales | €1.007.852 | TRY netiyle yukarıdaki fark mevcut |
| Department net sales | €1.969.679 | Overview/Sales ile aynı kapsam değil; kritik kapsam tutarsızlığı |

EUR değerleri için doğrudan CPM ledger `eurEquivalent` ile birebir kıyas yapılmadı: canlı ledger çıktısında USD/GBP oranları eksik (`eurComplete=false`, `missingCurrencies=[USD, GBP]`) ve inceleme para biriminde 12.167.658,19 TL karşılığı bulunuyor. Bu nedenle EUR kök nedeni, aynı dönem ve aynı kur seti sabitlenerek ayrıca doğrulanmalıdır.

## Kişi bazlı canlı CPM ledger toplamları

Bu tablo mevcut canlı ledger dönüşümünün sahiplik dağılımıdır; tek başına kesin performans kanıtı değildir. Özellikle `Belirsiz` satırları ve sahiplik güveni ayrıca incelenmelidir.

| CPM kullanıcı kodu | Satır | Net satış (TL) | İade (TL) | Maliyet (TL) |
|---|---:|---:|---:|---:|
| MKARA | 5.280 | 53.012.168,75 | 0,00 | 67.434.600,17 |
| CBELIKIRIK | 2.989 | 39.283.501,90 | 3.347.741,53 | 24.416.377,96 |
| FURKAN | 2.642 | 36.958.938,90 | 0,00 | 37.846.164,20 |
| MAYAZ | 1.975 | 21.883.133,00 | 3.828,59 | 12.867.428,46 |
| BCETINEL | 1.681 | 19.306.317,79 | 0,00 | 16.910.232,34 |
| Belirsiz | 2.658 | 18.719.936,28 | 1.978.881,45 | 12.494.546,52 |
| EERDOGAN | 2.287 | 18.566.249,76 | 38.118,63 | 11.140.981,06 |
| AERIMLI | 1.369 | 11.289.013,48 | 9.205,23 | 7.675.320,45 |
| NTOKER | 910 | 7.276.731,90 | 16.054,56 | 4.532.916,53 |
| TSEMIZ | 128 | 597.987,45 | 0,00 | 1.676.584,00 |

## Kanıt sınırları ve sıradaki doğrulama

- Canlı container build'i `nexus-20260831-230128`, commit `4db39d8f38fc7bd87704520fd51db1170ee2cc02` olarak gözlendi. Çalışma alanındaki güncel HEAD ile bu commit arasında finansal/departman davranışını etkileyen `server/ledgerApi.mjs`, `server/departmentAnalysis.mjs`, `shared/financialMetric.mjs`, `src/SalesPage.jsx` ve `src/DepartmentAnalysisPage.jsx` dosyalarında toplam **1.477 satır** farkı vardır. Farklar canonical financial metric, EUR wiring, Department parity, Sales UI ve pagination düzeltmelerini içerir. Bu nedenle canlı Department–Sales farkı, güncel kaynak kodun tek başına doğrulanmış bug'ı olarak sınıflandırılamaz; canlı sürüm parity olmadan ekran karşılaştırması düşük güvenlidir.
- Genel net fark kanıtlandı; farkın hangi faturalar olduğu henüz kanıtlanmadı.
- 2026-09-01 tarihinde canlı CPM'de yalnızca `STKHAR` üzerinde aktif şirket `01` kayıtlarında `EVRAKNO='SSP-00979'` veya `SONKAYNAKEVRAKNO='SSP-00979'` arandı. Sonuç: `rows=0`, `netAmount=null`, tarih alanları boş. Bu nedenle silinmiş test kökü mevcut CPM'de doğrudan yeniden üretilemedi.
- Önceki kanıt setindeki 79 test satırının neti `617.127,34 TL` idi. Yeni canlı fark `617.127,21 TL`; aradaki 0,13 TL fark nedeniyle ilişki güçlü tarihsel korelasyondur, fakat mevcut canlı satır bazında kesin kök neden değildir.
- İlk sıradaki işlem, aynı satır anahtarlarıyla CPM ham recordset → ledger satırları ile Nexus Sales projection satırlarını karşılaştıran salt-okunur line-level reconciliation çıktısı üretmektir.
- Özellikle test/exclusion registry, `SSP-00979` güvenlik işareti, iptal/iade zinciri, tarih kapsamı ve canlı image/source parity birlikte kontrol edilmelidir.
- Department ekranının €1.969.679 göstermesi için kullanılan sorgu/filtre kapsamı Sales ile aynı döneme ve aynı belge statülerine indirgenmeden kişi toplamları kesin kabul edilmemelidir.

## 2026-09-01 line-level reconciliation devam kanıtı

- Authenticated `/api/reconciliation/invoices?year=2026` ve `/api/audit-ledger?year=2026&export=1` aynı snapshot üzerinde çalıştı: `ledgerVersion=2026:1788257427366:19`, `generatedAt=2026-09-01T10:10:27.366Z`, `readOnly=true`.
- Raw source özeti **21.929 satır / 226.914.454,42 TL**; kapsam içi economic source **21.850 satır / 226.297.327,08 TL**. Fark **79 satır / 617.127,34 TL**.
- 79 kapsam dışı satırın ürün bazlı kanıtı: `KOMİSYON` **49 satır / 275.252,51 TL**, `GD-0187` **19 / 174.999,96 TL**, `PDI` **10 / 92.276,92 TL**, `GD-0079` **1 / 74.597,95 TL**. Örnek belge `ME02026000000504` (type 17, `GD-0079`, 74.597,95 TL) ve `ME02026000003909` (type 17, `PDI`, 8.650,28 TL) audit export içinde `excludedIncome` olarak görünür.
- Nexus reconciliation özeti raw source ile kapsam içi kaynağı ayırıyor ve Nexus toplamıyla eşleştiriyor: Nexus **21.850 satır / 226.297.327,08 TL**, farklar floating-point seviyesinde (`netSales=0,000000715 TL`), durum `matched`, tolerans **0,01 TL**.
- Audit export’ta 21.929 stabil satır kimliğinde duplicate bulunmadı. Ancak bu endpoint `signedNetAmount` ve bağımsız CPM recordset satır anahtarını expose etmediğinden, CPM ham satır → ledger satırının birebir anahtar eşleşmesi bu adımda tamamlanmış değildir. Mevcut kanıt, toplam ve exclusion bazında güçlüdür; bağımsız satır eşleşmesi için CPM recordset kimliklerinin ayrı read-only export/diagnostic sözleşmesi gerekir.
- Bu nedenle genel TRY farkının nedeninin kapsam dışı gelir satırları olduğu artık sayısal olarak kanıtlanmıştır; EUR farkı ise önceki bölümde kanıtlanan aylık kur seti / rapor tarihi kur seti sözleşme farkıdır. Kişi bazlı finansal performans toplamları, ayrı statü sözleşmeleri ve bağımsız CPM satır eşleşmesi tamamlanmadan nihai kabul edilmemelidir.

## 2026-09-01 source-row provenance diagnostic dilimi

- `server/ledgerApi.mjs` içine salt-okunur `buildSourceRowProvenanceDiagnostic` ve `/api/reconciliation/invoices/source-rows?year=YYYY` endpoint'i eklendi. Endpoint mevcut canonical ledger satırlarını `STKHAR.ID` (`rootId`) olarak açıkça adlandırır; `signedNetAmount`, disposition ve `matchStatus` alanlarını taşır.
- Diagnostic, bağımsız CPM SELECT/export satırı verilmediğinde `status=unverified`, `evidenceMode=canonical-ledger-only`, `independentSourceRowsAvailable=false` ve her satır için `matchStatus=not-independently-verified` döndürür. Null veya duplicate `rootId` varsa `status=unavailable` olur; sentetik anahtar üretilmez.
- TDD kanıtı: önce kırmızı testte eksik export nedeniyle `buildSourceRowProvenanceDiagnostic` import hatası gözlendi; uygulama sonrası `server/invoiceReconciliation.test.mjs` 5/5 ve `server/ledgerService.test.mjs` 33/33 geçti. Endpoint reporting-read yetki listesine de eklendi.
- Bu değişiklik bağımsız CPM kanıtı üretmez ve henüz canlıya alınmamıştır. Nihai provenance kabulü için aynı snapshot ve kapsam koşullarıyla CPM'den parameterized salt-okunur SELECT/export alınarak `STKHAR.ID`, `TUTAR`, `ISKONTO`, `KDV`, `EVRAKTIP` ve satır sayısı bağımsız karşılaştırılmalıdır.

## 2026-09-01 canlı CPM bağımsız STKHAR SELECT kanıtı

- Sunucu Docker içindeki çalışan `marlin-profit-sharing` container'ından, CPM `Marlin_Uyg` / şirket `01` için yalnızca parameterized `SELECT` çalıştırıldı. Sorgu kapsamı: `STKHAR`, `YEAR(EVRAKTARIH)=2026`, `KAYITDURUM=1`, `EVRAKTIP IN (17,85,91,18)`, `MIKTAR>0`.
- Gözlem zamanı `2026-09-01T13:26:57.731Z` UTC: **21.979 satır**, type 17 **15.474**, type 18 **154**, type 85 **2.170**, type 91 **4.181**; null ID **0**, duplicate ID **0**. Bağımsız SELECT satır hash'i: `1684119596d9dcd6f460c93709ba52f162b4146d3163209f271b31edb3cad435`.
- Aynı container ve bağlantı içinde bağımsız SELECT sonucu mevcut `finalInvoiceLedgerSql` sonucu ile `STKHAR.ID` bazında karşılaştırıldı: canonical **21.979 satır**, raw-only **0**, canonical-only **0**. Bağımsız SELECT neti **228.026.876,9000008 TL**, canonical neti **228.026.876,90000063 TL**; fark yaklaşık **0,00000017 TL** ve kayan nokta seviyesindedir.
- Bağımsız SELECT’in yeniden hesaplanan neti: brüt satış **266.821.245,84000054 TL**, iadeler **2.380.829,9899999993 TL**, indirim **36.413.538,95000015 TL**, net **228.026.876,9000008 TL**.
- Bu kanıt önceki `ledgerVersion=2026:1788257427366:19` / 21.929 satırlık authenticated API snapshot’ından farklı bir güncel snapshot’tır. İki snapshot arasındaki fark için zaman-sınırlandırılmış transaction/export kanıtı henüz yoktur; eski ve yeni sayılar birleştirilmemelidir.
- Karşılaştırma iki ardışık read-only SELECT ile yapıldı; tek transaction snapshot izolasyonu kullanılmadı. Bu nedenle ID eşleşmesi güçlü canlı kanıt olsa da atomik snapshot garantisi değildir. Bir sonraki güvence aynı export zamanı/transaction isolation ile raw ve canonical çıktının birlikte mühürlenmesidir.

## 2026-09-01 atomik snapshot probe sonucu

- CPM `Marlin_Uyg` üzerinde salt-okunur sistem metadata sorgusu çalıştırıldı: `snapshot_isolation_state_desc=OFF`, `is_read_committed_snapshot_on=false`.
- Aynı veritabanında `SNAPSHOT` isolation ile transaction başlatma denemesi SQL Server tarafından reddedildi: snapshot isolation veritabanında etkin değil. `ALTER DATABASE` çalıştırılmadı; CPM üzerinde hiçbir ayar veya veri değiştirilmedi.
- Sonuç: production üzerinde atomik raw-vs-canonical evidence koşusu şu an **NO-GO**. `REPEATABLE READ` phantom satırları engellemediği için eşdeğer kabul edilmedi; `SERIALIZABLE` ise uzun ledger sorgusunda CPM yazma işlemlerini key-range lock ile bloke etme riski taşıyor.
- Sol değerlendirmesiyle uyumlu güvenli sıra: önce izole CPM test restore/lab üzerinde `SNAPSHOT + unchanged finalInvoiceLedgerSql + local temp index` uyumluluk probe'u; ancak bu geçerse tek kullanımlık fail-closed evidence runner. Normal production `loadFinalInvoiceLedger` transaction davranışı değiştirilmemeli.

## 2026-09-01 izole CPM lab erişilebilirlik kontrolü

- `C:\Users\furkan.cakir\Documents\Marlin Test Lab\STATUS.md` ve `Sql2016-VM-Database-Migration-Result.json` içindeki VM/SQL kanıtları **2026-07-20** tarihli tarihsel kayıtlardır. Bu kayıtlar o tarihte `Marlin_Uyg_TEST`, `Marlin_Sec_TEST`, DBCC ve isolation kontrollerinin geçtiğini gösterir; bugünkü VM state, endpoint dinleme durumu veya SNAPSHOT ayarını kanıtlamaz.
- Bugünkü yerel oturumda `Get-VM -Name Marlin-SQL2016-Lab` ve `Get-VMNetworkAdapter` yetki politikası hatasıyla çalışmadı. `172.29.216.2:15976` için ICMP ping yanıtı alınmadı; ICMP/ulaşım engeli olasılığı nedeniyle bu sonuç VM kapalı şeklinde yorumlanmadı.
- Native `Marlin_Sec` backup eksikliği CPM istemci/workflow testlerini bloke eder; yalnız `Marlin_Uyg_TEST` üzerinde SQL-level snapshot probe'u için doğrudan önkoşul değildir. Probe'un güncel blocker'ı VM/SQL endpoint erişiminin doğrulanamamasıdır.
- Gerekli en küçük erişim: Hyper-V VM/network/endpoint durumunu okuyabilen yönetici doğrulaması ve `Marlin_Uyg_TEST` üzerinde metadata + final-ledger SELECT çalıştırabilen lab hesabı. Production backup, production `ALTER DATABASE` ve CPM test belgesi bu task için gerekli değildir.
