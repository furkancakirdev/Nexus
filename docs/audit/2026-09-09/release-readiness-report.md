# Nexus Release Readiness ve Uçtan Uca Denetim — 2026-09-09

## 1. Yönetici özeti

Yerel uygulama katmanı üretim derlemesi yapılabilir durumda ve mevcut test sözleşmeleri geçiyor: `npm test` 650/650, `npm run build` başarılı, `node --check server/index.mjs` başarılı ve kaynak güvenlik taraması temiz. Aktif menü yedi modülle sınırlı (`summary`, `sales`, `departments`, `audit`, `inventory`, `ledger`, `settings`); eski Katkı/Performans rotası görünürlükten çıkarılmış.

Buna rağmen sistem **resmî finansal canlıya alma için hazır değildir**. CPM canlı bağlantısı, gerçek fatura toplamı parity kanıtı, en az üç kullanıcı/temsilci bazında karşılaştırma, doğrulanmış WAC açılış/devir kanıtı, immutable aday container ve güvenli rollback kanıtı bu çalışma alanında üretilmedi. Bu nedenle canlı toplamların CPM ile birebir eşleştiği veya kişi bazlı satışların doğrulandığı iddia edilemez; deploy yapılmadı.

Bu turda kanıtlanan ve düzeltilen ürün sözleşmesi hatası: Ayarlar ekranı, artık resmî hesaplamayı yönetmemesi gereken `exchangeRateRule` alanını kullanıcıya seçtiriyor ve ayar politikası bunu aktif ayar olarak normalize ediyordu. Alan artık legacy-only okunabilirlik sınırında; aktif UI WAC yöntemini salt okunur gösteriyor.

## 2. Denetim/test planı

### K1 — Modül ve erişim sözleşmesi
- `shared/moduleRegistry.mjs` ile menü/route görünürlüğünü karşılaştır.
- Capability bazlı erişim ve doğrudan URL guard’larını kontrol et.
- API rotalarını ve her modülün veri kaynağını eşleştir.
- Kullanılmayan modüllerin menü ve router’dan kaldırıldığını doğrula.

### K2 — Finansal ve veri doğruluğu
- Canonical ledger, net/brüt satış, iade ve maliyet alanlarını kontrol et.
- EUR projection, source-currency basket ve review/excluded durumlarının fail-closed davranışını kontrol et.
- Departman ve ticari sorumlu attribution kanıtını kontrol et.
- CPM canlı fatura toplamı ile aynı dönem Nexus toplamını; ardından kullanıcı bazında en az üç kişiyi karşılaştır.

### K3 — UI/UX ve işlev
- Overview, Sales, Departments, Audit, Inventory, Pool, Settings ekranlarını kontrol et.
- Loading/empty/error, mobil/koyu tema, grafik legend/seri görünürlüğü, tablo filtreleri ve genişleyen detayları kontrol et.
- Form, onay, ayar, logout ve doğrudan route davranışlarını kontrol et.

### K4 — Release ve güvenlik
- CPM read-only izin kanıtı, source provenance ve inventory official WAC kapıları.
- Build metadata, immutable image/artifact digest, host key, TLS CA, Compose hash, state backup, candidate smoke, rollback manifest.
- Secrets, TLS bypass ve güvensiz deploy helper taraması.

## 3. Kanıtlanan sonuçlar

| Alan | Sonuç | Kanıt |
|---|---|---|
| Yerel test suite | PASS | `npm test`: 650/650 |
| Production build | PASS | `npm run build` |
| Sunucu syntax | PASS | `node --check server/index.mjs` |
| Diff kontrolü | PASS | `git diff --check` (yalnız CRLF uyarıları) |
| Source security scan | PASS | `server/index.mjs`, `server/auth.mjs`: 0 finding |
| Modül registry | PASS | 7 aktif ekran; eski Katkı/Performans gizli |
| Capability/direct-route isolation | PASS | İlgili UI/session/auth sözleşme testleri |
| Canonical EUR/review fail-closed | PASS | Suite içindeki financial consumer/projection testleri |
| CPM gerçek parity | UNVERIFIED | Canlı CPM bağlantısı ve aynı dönem export/query sonucu yok |
| Kişi bazlı parity | UNVERIFIED | Canlı fatura ve temsilci bazlı karşılaştırma kanıtı yok |
| Official WAC readiness | BLOCKED | Inventory source/provenance/opening evidence kapıları |
| Immutable candidate/rollback | BLOCKED | Aday container, digest, rollback manifest ve authenticated smoke yok |
| Deployment | NO-GO | Release preflight kapıları kanıtlanmadı |

## 4. Öncelikli bulgular

### Kritik — Canlı finansal parity kanıtı yok
- **Nerede:** CPM ↔ Nexus ciro ve kişi bazlı satış toplamları.
- **Beklenti:** Aynı dönem, aynı KDV kapsamı, iade/iptal politikası ve para birimi ile birebir karşılaştırma.
- **Durum:** Bu çalışma alanında canlı CPM sorgusu/export’u çalıştırılmadı; genel toplam, fatura farkı ve kullanıcı farkı hesaplanamaz.
- **Çözüm:** Read-only CPM erişimi olan onaylı runner’da dönem snapshot’ı, fatura kimlikleri, gross/net/VAT/return ayrımı ve owner mapping export’u üret; Nexus canonical ledger ile belge anahtarı ve tutar bazında reconcile et. Fark listesi olmadan parity “geçti” sayılmamalı.

### Kritik — Resmî WAC açılış/devir kanıtı eksik
- **Nerede:** Inventory source, opening evidence, historical price/currency/rate provenance.
- **Beklenti:** En eski yıl açılışı, sonraki yıl devir uzlaştırması ve tarihsel Halkbank kurları doğrulanmış olmalı.
- **Durum:** Release readiness `inventory-source-not-verified`, `official-cost-coverage-insufficient` ve gerektiğinde `source-provenance-unverified` ile fail-closed.
- **Çözüm:** CPM’de açılış/devir belge soy ağacını ve tarihsel kart/fiyat kayıtlarını doğrula; her ürün-depo-döviz anahtarı için WAC evidence coverage üret.

### Kritik — Güvenli release/rollback kanıtı eksik
- **Nerede:** `server/releasePreflight.mjs`, release runner ve operasyonel host.
- **Beklenti:** pinned SSH host key, CA doğrulamalı TLS, immutable artifact/image digest, candidate authenticated smoke, state backup ve linked rollback manifest.
- **Durum:** Yerel Docker/candidate ve canlı authenticated prewarm kanıtı yok; önceki release belgelerinde de bu kapıların NO-GO kaldığı kayıtlı.
- **Çözüm:** Docker-capable onaylı runner ile yalnız planlanmış fail-closed release runner’ı kullan; parola gömülü eski `deploy.py` çalıştırılmamalı.

### Yüksek — Ayarlar sözleşmesi ile kesin model çelişkisi (düzeltildi)
- **Nerede:** `src/SettingsPage.jsx`, `shared/settingsPolicy.mjs`.
- **Önce:** `exchangeRateRule` seçilebilir ve normalize edilebilir durumdaydı.
- **Sonra:** Alan aktif sözleşmeden çıkarıldı; legacy input yok sayılıyor; UI WAC’ı salt okunur gösteriyor.
- **Doğrulama:** Proof PASS, focused 15/15, full 650/650.

### Orta — UI canlı görsel/browser kanıtı bu turda yeniden üretilemedi
- **Nerede:** tüm aktif ekranlar.
- **Durum:** Önceki audit artefact’ları ve UI contract testleri mevcut; bu oturumda canlı tarayıcı/console/network capture çalıştırılmadı.
- **Çözüm:** Aday container hazırlandıktan sonra 390/768/desktop ve light/dark smoke capture; console/network başarısızlıklarının sıfırlandığını kanıtla.

## 5. CPM vs Nexus karşılaştırma tablosu

Bu turda canlı CPM değerleri alınmadığı için sayısal tablo **UNVERIFIED** bırakılmıştır; sayı uydurulmamıştır.

| Karşılaştırma | CPM | Nexus | Fark | Durum / gerekli kanıt |
|---|---:|---:|---:|---|
| Seçili dönem toplam gross ciro | — | — | — | Aynı invoice scope + KDV politikası gerekli |
| Seçili dönem toplam net ciro | — | — | — | Canonical ledger ile belge kimliği eşleştirme gerekli |
| İade/iptal toplamı | — | — | — | CPM belge türü ve Nexus return policy gerekli |
| Kullanıcı/temsilci 1 | — | — | — | Owner evidence + invoice listesi gerekli |
| Kullanıcı/temsilci 2 | — | — | — | Owner evidence + invoice listesi gerekli |
| Kullanıcı/temsilci 3 | — | — | — | Owner evidence + invoice listesi gerekli |

## 6. Uygulama iş paketleri

1. **P0 — Live parity evidence:** Read-only CPM snapshot, dönem/kapsam sözleşmesi, invoice-level diff ve kişi bazlı reconciliation.
2. **P0 — Official WAC evidence:** Opening/devir, tarihsel kart dövizi/fiyatı ve Halkbank satış kuru kanıtı; coverage/review raporu.
3. **P0 — Release runner execution:** Immutable artifact/image, candidate container, authenticated readiness/prewarm, backup, rollback manifest; NO-GO ise deploy yok.
4. **P1 — Departments/owner drill-down:** Ticari sorumlu toplamına tıklayınca belge/ürün/müşteri/işlem alt kırılımı ve evidence status.
5. **P1 — Overview revision:** EUR ana KPI’ları, source-currency basket, review/excluded scope ve ortak ledger revision göstergesi.
6. **P1 — Inventory ledger:** Ürün arama, kronolojik alım/satım/devir/iade muavin görünümü; WAC kanıtı olmayan satırların açık ayrımı.
7. **P2 — Component architecture:** Yeni bağımlılık eklemeden mevcut kart/tablolar/grafikler için tekrar kullanılabilir UI primitive’leri; modern tema dönüşümü yalnız ekran sözleşmeleri ve erişilebilirlik testleriyle.

## 7. Go/No-Go kararı

**NO-GO.** Yerel kod kalitesi kapıları geçmesine rağmen canlı CPM parity, official WAC evidence ve immutable release/rollback kanıtı yok. Canlıya alma için yukarıdaki P0 iş paketleri tamamlanmadan deploy veya “finansal sonuçlar doğrulandı” beyanı yapılmamalıdır.
