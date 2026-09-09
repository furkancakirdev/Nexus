# Marlin Nexus Kritik Kullanıcı Akışları

> Doğrulama tarihi: 2026-09-09
> Kaynaklar: `src/App.jsx`, `src/sessionGate.js`, `shared/moduleRegistry.mjs`, `server/index.mjs` ve ilgili sayfa/API modülleri.

| Akış | Kullanıcı amacı | Ekran | API/servis | Veri etkisi | Beklenen sonuç / kabul kriteri |
|---|---|---|---|---|---|
| Oturum açma | Sisteme güvenli giriş | LoginPage | `POST /api/session/login`, `GET /api/session` | Session/cookie oluşturulur; iş verisi değişmez | Geçerli kullanıcı uygulamaya yönlenir; geçersiz giriş açık hata verir; parola/session bilgisi UI’da sızmaz |
| Oturum kapatma | Oturumu sonlandırma | NexusShell/logout | `POST /api/session/logout` | Session/cookie temizlenir | Kullanıcı login ekranına döner; korumalı API’ler yeniden yetkisiz kalır |
| Yönetici özeti | Dönemsel şirket/departman özetini görmek | SummaryPage | Summary API çağrıları, `GET /api/department-targets?year=...` | Salt okunur ledger/hedef verisi | Loading, empty, 401/403 ve server error durumları ayrışır; sayısal özet yalnız kanıtlı veriyi gösterir |
| Satış ve vaka inceleme | Satış belgeleri ve vaka zincirini incelemek | SalesPage | Satış/case API’leri | Salt okunur satış/lineage verisi | Filtrelenen kayıtlar doğru dönem ve yetki kapsamındadır; belirsiz kaynaklar review olarak görünür |
| Departman analizi ve hedefler | Departman performansını ve hedef dağıtımını incelemek | DepartmentAnalysisPage | Department/target API’leri | Salt okunur ledger, hedef ve dağıtım görünümü | Departman toplamları, hedef havuzları ve dağıtım toplamları birbirini tutar; eksik finansal kanıt sıfıra çevrilmez |
| Aylık onay | Seçili ayın resmi finansal görünümünü onaylamak | ApprovalPage | `GET /api/approvals?year=...`, `PUT /api/approvals/:year/:month`, `POST .../reopen` | Onay snapshot’ı ve audit olayı yazılır | Yalnız güncel ve doğrulanmış kaynak/kur kanıtı onaylanır; stale/legacy/invalid durumlar açıkça ayrılır; başarısız işlem eski onayı silmez |
| Denetim defteri | Hesaplama ve kaynak kanıtını denetlemek | AuditPage | `GET /api/audit-ledger?...` | Salt okunur audit/provenance | Export ve satır detayları aynı filtre kapsamını kullanır; belirsiz kaynaklar confirmed gibi gösterilmez |
| Stok araştırması | Açılış stok/WAC/kaynak kanıtını araştırmak | InventoryResearchPage | `GET /api/inventory-research?...`, `GET /api/research/inventory-opening-evidence?...` | Salt okunur aday/kanıt teşhisi | Candidate ve official kaynaklar ayrıdır; örneklem sınırı görünür; eksik maliyet/kimlik review durumuna düşer |
| Rapor/export | Denetim veya finans çıktısı almak | ReportsPage | `GET /api/audit-ledger?year=...&export=1` | Salt okunur export | Export hatası kullanıcıya açık bildirilir; boş sonuç ile teknik hata ayrılır |
| Ayarlar ve çalışan/override yönetimi | Sistem politikasını yönetmek | SettingsPage | App-state API, `PUT /api/app-state` | Settings, çalışan ve cost override kalıcılaşır | Yetkisiz kullanıcı mutasyonu reddedilir; CSRF/idempotency korunur; başarısız kaydetme mevcut durumu silmez |
| İK çalışan kayıtları | Çalışanları listelemek/düzenlemek | HR ekranları | `GET/POST/PUT /api/hr/employees...` | Çalışan kayıtları değişir | Capability kontrolü yapılır; duplicate/invalid kayıt reddedilir; başarılı değişiklik yeniden okunarak doğrulanır |

## Global kabul kontrolleri

1. Her akış için authenticated/unauthenticated ve capability sınırı tanımlıdır.
2. Her veri okuma akışı loading, empty, forbidden ve server-error durumlarını ayrı gösterir.
3. Mutasyon akışları başarısız olduğunda mevcut başarılı snapshot’ı silmez ve audit etkisini doğru raporlar.
4. Finansal veya stok kanıtı eksik/çelişkili olduğunda sistem sıfır veya uydurma değer üretmek yerine `review`/`quarantine` durumunu korur.
5. `src/sessionGate.js` ile `shared/moduleRegistry.mjs` menü/route/API kapsamı karşılaştırılmalıdır; registry dışında render edilen Reports/Approval ekranları release öncesi ayrıca doğrulanmalıdır.
