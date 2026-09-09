# EUR Raporlama Katmanı — Uygulama Planı (2026-08-29)

## Kapsam

Spek: `Desktop/NEXUS/Yeni Metin Belgesi (4).txt` §"EUR ana görünümü" ve §"Veri ve API sözleşmesi".
Kullanıcı kararı: **Gösterilen tüm veriler EUR cinsinden olacak**; çevrimler spek koşullarıyla yapılacak.

Bu plan, Aşama 3'ün raporlama bacağını mevcut birleşik defterin üzerine ekler. Hareketli ağırlıklı
ortalama motorunun tam yeniden inşası (Aşama 1–2) bu planın dışındadır; mevcut `financeV2`
maliyet kanıtları (ürün dövizi cinsinden `lineCostCurrencyExVat`) zaten EUR sepetine doğrudan girer.

## Çevrim kuralları (spek'e birebir)

1. Satış/iade/iskonto TRY tutarları, **belge tarihindeki Halkbank satış kuru** ile ürünün stok kartı
   dövizine çevrilir (spek satır 103). Kur kanıtı yoksa satır `INCELEME` sepetine düşer (fail-closed).
2. Döviz sepetleri (`byCurrency`) EUR/USD/GBP/TRY/INCELEME ayrı tutulur; doğrudan toplanmaz.
3. Sepet → EUR: **rapor günü Halkbank ALIŞ kurları** ile çapraz dönüşüm:
   `EUR = tutar × alış(P) / alış(EUR)` (spek satır 111). EUR sepette birebir.
4. Açık dönem: rapor günü kur setiyle dinamik. Onaylı dönem: dönemin son iş günü kur seti
   **dondurulur** ve onay snapshot'ında saklanır (spek satır 113).
5. Hafta sonu/tatil: en son önceki iş günü kuru; gecikme notu ekranda gösterilir (spek satır 114).
6. Maliyet: `financeV2.lineCostCurrencyExVat` (ürün dövizi) doğrudan sepete girer;
   `reviewReason` dolu satırlar EUR maliyete katılmaz (mevcut TL davranışıyla uyumlu).

## Dosyalar

| Dosya | Değişiklik |
|---|---|
| `shared/eurReporting.mjs` | YENİ. Saf fonksiyonlar: kur seti çözümleyici (hafta sonu geri düşmesi + gecikme notu), `toEur` çapraz dönüşüm, döviz sepeti, `decorateEur` |
| `shared/eurReporting.test.mjs` | YENİ. Entegrasyon karakterli birim testleri |
| `server/finalInvoiceLedger.mjs` | SQL: belge tarihi kur OUTER APPLY'i (`documentSellingRate`, `documentRateDate`) + recordset 5 (yıl başı→bugün tüm Halkbank kurları). `buildFinalInvoiceLedger`: `exchangeRates` girdisi, satıra `currencyNetAmount` alanı, ledger'a `exchangeRates` |
| `server/index.mjs` | `recordsets[4]` → `exchangeRates` |
| `server/ledgerApi.mjs` | `buildOverviewRows`: byCurrency sepet birikimi. Router: rapor günü/dondurulmuş kur seti seçimi, `eurEquivalent` süslemesi, yanıtlarda `eurRateSet` meta |
| `server/departmentAnalysis.mjs` | `addMetric`/`finalizeMetric`: byCurrency sepet |
| `server/approvalApi.mjs` | Onay snapshot'ına `exchangeRateSet` dondurma |
| `src/SalesPage.jsx`, `src/SummaryPage.jsx`, `src/DepartmentAnalysisPage.jsx` | EUR birincil görünüm, döviz sepeti ayrıntısı, kur seti göstergesi |
| `server/finalInvoiceLedger.test.mjs`, `server/ledgerV2Api.test.mjs` | SQL ve API sözleşme testleri genişletilir |

## Doğrulama ölçütleri

- `npm test` tam geçecek (mevcut 276 test kırılmayacak).
- SQL salt okunur: yalnız parametreli SELECT; DVZHAR/FYTKRT yazma yok.
- Hafta sonu rapor gününde kur seti bir önceki iş gününe düşer ve not üretir.
- Onaylı ay dondurulmuş kurla değişmez; açık ay rapor günü kuruyla değişir.
- Yerel canlı veri: `/api/overview` `eurEquivalent` dolu döner; `byCurrency` toplamı uzlaşır.
- Üretim build'i + masaüstü görsel kontrol (Satış, Özet, Departman sayfaları EUR gösterir).
- Üretim dağıtımı bu doğrulamalardan sonra yapılır.

## Riskler

- STKKRT.MKOD2 boş ürünler: fiyat listesi dövizine geri düşer; ikisi de yoksa satır INCELEME
  sepetinde kalır, EUR toplamı şişirmez.
- DVZHAR'da rapor günü için hiç kur yoksa (çok eski yıl + eksik veri) EUR görünümü
  `kur bulunamadı` durumuyla fail-closed kalır; uydurma kur üretilmez.
- Onay snapshot şemasına alan eklenmesi geriye uyumlu olmalı: eski snapshot'larda
  `exchangeRateSet` yoksa o ay açık dönem gibi rapor günü kuruyla görüntülenir.

## Kapsam dışı (bu plan'da değil)

- Hareketli ağırlıklı ortalama motorunun tam inşası ve açılış stok uzlaştırması (Aşama 1–2).
- Hedef/havuz dağıtım hesaplarının EUR'ya geçirilmesi (kalıcı TL tutarları ve personel
  dağıtımını etkiler; ayrı karar gerektirir). Hedef sayfaları TL kalır, EUR görünüm
  finansal analiz ekranlarıyla sınırlıdır.
