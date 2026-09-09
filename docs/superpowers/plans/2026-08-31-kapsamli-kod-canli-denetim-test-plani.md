# Marlin Nexus — Kapsamlı Kod + Canlı Denetim Test Planı

## Amaç

Kullanıcı kararları ve `Yeni Metin Belgesi (4).txt` spesifikasyonunu tek bir kabul matrisiyle kod tabanı, üretim API'si ve üretim arayüzünde karşılaştırmak. “Yerel test geçti” ile “canlıda doğru çalışıyor” kanıtlarını ayrı tutmak.

## Kanıt ilkeleri

- CPM yalnız salt-okunur kaynak olarak test edilir; hiçbir test CPM'ye yazma, ayar, kullanıcı, onay veya silme isteği göndermez.
- Her bulgu; gereksinim kimliği, beklenen davranış, yerel dosya/test kanıtı, canlı URL/ekran/API kanıtı ve durumuyla kaydedilir.
- Canlıda kalıcı Nexus mutasyonu yapılmaz; yalnız giriş, okuma, güvenli filtreleme, yenileme ve başarısız/negatif güvenlik kontrolleri kullanılır.
- Demo/pilot veri ile canlı CPM verisi ayrı etiketlenir; canlıda `mode`, `readOnly`, `database`, `generatedAt`, `ledgerVersion` ve `cacheStatus` kaydedilir.

## Test katmanları

### K1 — Statik gereksinim ve kaynak taraması

`Yeni Metin Belgesi (4).txt`, `AGENTS.md`, planlar ve thread arşivinden gereksinim kimlikleri çıkarılır. `rg` tabanlı tarama ile EUR/TL fallback'leri, `estimatedCost`, selector maliyetleri, hardcoded grafik renkleri, CPM yazma yolları ve eksik API alanları listelenir. Her statik bulgu davranış testiyle doğrulanmadan kapatılmaz.

### K2 — Saf model ve veri sözleşmesi

- WAC: açılış, alım, satış, iade, alış iadesi, gelecekteki alımın geçmiş satışı değiştirmemesi, negatif stok marj oranı, ürün izolasyonu, tarih/sıra bağları.
- V2 finans: `schemaVersion`, `byCurrency`, `eurEquivalent`, ürün dövizi, KDV hariç fiyat/maliyet, fatura iskontosu ile ürün brüt marjı ayrımı.
- Kur: Halkbank alış/satış yönü, hafta sonu geri düşme, dondurulmuş onaylı dönem, açık dönem rapor günü, eksik kur/fiyatta review.
- Ledger: 91→85 deduplikasyon, SSP-00979 dışlama, çapraz depo sahipliği, muhasebe/son modifier fallback reddi, audit karşılaştırmasının resmi maliyete sızmaması.

### K3 — API entegrasyon ve güvenlik

Her authenticated GET uçta aynı ledger sürümü ve para birimi uzlaşması; `ledger-refresh` için tek uçuş, cari+önceki yıl, hata halinde eski snapshot korunması, 15 dakika TTL ve stale-while-revalidate. Negatif testler: oturumsuz 401, yanlış CSRF 403, yanlış Origin 403, geçerli CSRF/Origin 2xx, unknown query/fingerprint reddi, CPM SQL'de persistent DML yok.

### K4 — UI davranış ve görsel kabul

Giriş/yenileme sonrası canlı veri; tüm navigasyon, sekme, filtre, arama, sayfalama, detay, güvenli yenileme ve geri dönüş kontrolleri. Her sayfada EUR ana gösterim, TL'nin yalnız açık bağlamlarda görünmesi, review/kanıt durumlarının görünür olması, 1440/1024/768/390 px taşma ve sticky kritik kolon kontrolü. Konsol ve ağ hataları sıfır olmalı.

### K5 — Canlı parite ve release kapısı

Yerel build hash/version ile `/api/build-info` karşılaştırılır. Authenticated `/api/health`, `/api/overview`, `/api/department-analysis`, `/api/department-targets`, `/api/audit-ledger`, `/api/inventory-research`, `/api/readiness` yanıtları kaydedilir. `inventorySource=verified` değilse bu bir başarısızlık değil, açık release blocker olarak raporlanır; yanlış maliyetle kapatılmaz.

## Kabul matrisi (özet)

| Kimlik | Gereksinim | Kod kanıtı | Canlı kanıt | Kabul |
|---|---|---|---|---|
| DATA-01 | CPM salt-okunur | guard/fingerprint testleri | audit log + negatif DML | geçmeli |
| DATA-02 | WAC resmi maliyet | financialCostModel + ledger testleri | financeV2 alanları | verified source şart |
| FX-01 | EUR ana görünüm/kur yönü | eurReporting testleri | tüm finans ekranları | geçmeli |
| FX-02 | ayrı döviz sepetleri | byCurrency sözleşmesi | API/UI uzlaşması | geçmeli |
| LED-01 | ortak ledger/version | cache testleri | uçlar arası version | geçmeli |
| LED-02 | 15 dk cache korunur | ledgerService testleri | hit/stale/refresh | geçmeli |
| AUTH-01 | login/session/CSRF/Origin | auth + UI contract | canlı pozitif/negatif | geçmeli |
| OWN-01 | ticari sahiplik | ownership/department testleri | detay kanıtı | geçmeli |
| UI-01 | tüm sayfa/işlevler | UI contract | click-through | geçmeli |
| UI-02 | mobil/görsel düzen | CSS contract/build | 1440/1024/390 | geçmeli |
| REL-01 | release metadata/readiness | release tests | build/readiness | blocker açıkça rapor |

## Çalıştırma sırası

1. K1 statik tarama ve gereksinim matrisi.
2. K2/K3 tam `npm test`, ek veri bozukluğu senaryoları ve API sözleşmeleri.
3. `npm run build`, `node --check`, diff/package secret taraması.
4. Canlı authenticated API smoke ve cache/version ölçümü.
5. Canlı UI tüm sayfa/etkileşim/görsel kontrolü; yalnız okuma ve güvenli yenileme.
6. Kod-canlı fark raporu; P0 (yanlış finans/CPM yazma/güvenlik), P1 (canlı fonksiyon bozuk), P2 (görsel/ikincil sözleşme) sınıflaması.

## Çıkış ölçütü

“Hazır” yalnız tüm P0/P1 kapanınca söylenir. Kaynak doğrulaması, WAC kanıtı, gerçek build metadata veya readiness eksikse sistem “canlı erişilebilir fakat release-ready değil” olarak raporlanır.
