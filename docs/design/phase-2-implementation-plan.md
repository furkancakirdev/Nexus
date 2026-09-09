# Marlin Nexus Faz 2 — Uygulama Sırası ve İlk Mockup

Tarih: 2026-09-03  
Durum: Uygulama öncesi plan. Kod değişikliği yapılmamıştır.

## 1. Uygulama yaklaşımı

Değişiklikler tek seferde tüm ürüne yayılmayacak; her ekran küçük, geri doğrulanabilir bir dilim olarak ele alınacaktır.

Her dilimin kapanış ölçütleri:

- mevcut filtre, export, yetki ve navigasyon davranışı çalışır,
- backend/SQL/hesaplama dosyalarında değişiklik yoktur,
- aynı finansal alan mevcut kanonik kaynaktan render edilir,
- eksik veri sıfır gibi gösterilmez,
- masaüstü/tablet/mobile görünümü kontrol edilir,
- ilgili Faz 1 bulgusu yeniden gözlenerek kapanır,
- hedefli test, build ve diff incelemesi geçer.

## 2. Ekran bazlı uygulama sırası

### Dilim 0 — Ortak temel

**Kapsam:** CSS token’ları, açık tema varsayılanı, tipografi, spacing, durum rozetleri, buton ve aksiyon bileşenleri.  
**Neden:** Tüm ekranların aynı görsel ve durum dilini kullanmasını sağlar.  
**Risk:** Global CSS değişimi; mevcut sınıflar korunarak küçük eklemeler yapılmalı.  
**Doğrulama:** route smoke, tema tercihi, contrast ölçümü, responsive screenshot.

### Dilim 1 — Satışlar ekranı

**Kapsam:**

- `control-kpis` / `sales-kpis` sınıf sözleşmesini düzeltmek,
- KPI’ları 4 birincil + detay açılımı olarak düzenlemek,
- chart grid ve kart düzenini görünür hâle getirmek,
- “resmi / tahmini / inceleme” durumunu değer yanında yayınlamak,
- 10 sütunlu tabloyu 5 kritik kolon + detay drawer’a indirmek,
- TL/EUR ve KDV kapsamını başlıkta tekilleştirmek.

**Neden:** Canlı denetimde en belirgin görsel çökme ve finansal güven problemi burada.  
**Risk:** JSX sınıf değişikliği tablo/graph responsive davranışını etkileyebilir.  
**Doğrulama:** Satışlar snapshot, 1440/768/390 genişlikleri, canonical metric testleri, build.

### Dilim 2 — Özet ekranı

**Kapsam:** Net/brüt etiket düzeltmesi, 4 karar KPI’ı, uyarı kuyruğu ve doğrudan filtre bağlamı.  
**Risk:** Özetin mevcut navigasyon callback’leri korunmalı.  
**Doğrulama:** 267.481.184 TL brüt ve 228.509.988 TL net değerlerinin doğru etiketlerle görünmesi.

### Dilim 3 — Veri Denetimi

**Kapsam:** Kritik maliyet/kâr/doğrulama kolonlarının ilk görünümü; kalan alanlar detay drawer; retry ve empty state.  
**Risk:** Audit ayrıntısı kaybolmamalı.  
**Doğrulama:** 4–5 kolon ilk görünüm, tüm ayrıntıların drawer’da erişilebilirliği, export kapsamı.

### Dilim 4 — Onay ve Kapanış

**Kapsam:** Bekleyen dönem kuyruğu, risk filtresi, seçili dönem eylemleri ve yetkisiz durum.  
**Risk:** Yönetim onayının güvenlik/CSRF sınırı korunmalı.  
**Doğrulama:** Yetkili/yetkisiz görünüm, loading/error/retry, onay API smoke.

### Dilim 5 — Raporlar

**Kapsam:** 9 sekmeyi Gelir, Maliyet/Güven ve Dağıtım ailelerine indirme; her rapora tek CTA.  
**Risk:** Eski görünüm seçicileri ve export hedefleri korunmalı.  
**Doğrulama:** Her eski rapor görünümüne yeni IA’dan erişim.

### Dilim 6 — Departmanlar, Havuz, Hedef, Stok, Ayarlar

**Kapsam:** Ortak bileşenlerin kalan ekranlara yayılması, kapsam dili ve empty/error durumları.  
**Risk:** Departman sahipliği ve maliyet kanıtı anlamı görsel sadeleştirmede kaybolmamalı.  
**Doğrulama:** ekran bazlı Faz 1 bulgu matrisi, full test, build ve responsive smoke.

## 3. Dilim 1 mockup açıklaması — Satışlar

```text
┌──────────────────────────────────────────────────────────────┐
│ Gelir ve Kârlılık / Satışlar                 2026  CPM salt-okunur │
│ Satış Analizi ve Marj Defteri                                  │
│ [DURUM: İnceleme gerekli] 22.061 satır resmi maliyet bekliyor  │
├──────────────────────────────────────────────────────────────┤
│ [Net satış] [Maliyet kapsamı] [Resmi brüt kâr] [Riskli dönem]  │
│ 228,5M TL    Veri yetersiz    —                 9 dönem        │
├───────────────────────────────────┬──────────────────────────┤
│ Net satış trendi                  │ Karar kuyruğu             │
│ yalnız 1 ana seri + kapsam çizgisi│ [Denetimde incele]        │
│                                   │ [Kapsamı düşük dönemler]  │
├───────────────────────────────────┴──────────────────────────┤
│ Aylık finans özeti                                             │
│ Ay | Net satış | Resmi maliyet | Resmi kâr | Durum             │
│ Ayrıntıyı aç: iade, iskonto, kur, maliyet yöntemi, kaynak      │
└──────────────────────────────────────────────────────────────┘
```

### Mockup kararları

- Brüt satış, iade, iskonto ve resmi net satış aynı KPI satırında eşit ağırlıkta görünmez; net satış ana değerdir, brüt/iade/iskonto detaydır.
- Resmi maliyet yoksa kâr “0” değil `—` ve “İnceleme gerekli” olur.
- Grafik 5 serili çift eksenli kompozisyon yerine tek ana hacim serisi + durum açıklamasına sadeleştirilir.
- Tablo ilk görünümünde maliyet ve doğrulama görünür kalır.
- Her risk satırı Denetim’e yıl/ay/filtre bağlamıyla gider.

## 4. Dilim 1 için değişecek dosyalar

- `src/SalesPage.jsx`
- `src/styles.css`
- gerekirse yalnız UI contract testleri; backend/shared finans mantığına dokunulmaz.

## 5. Dilim 1 kabul kriterleri

1. Satışlar ekranı KPI kartları ve chart grid olarak görünür; sol kenarda dikey kırık akış kalmaz.
2. Net satış, resmi kâr, maliyet kapsamı ve risk durumu ilk viewport’ta okunur.
3. KDV hariç ve para birimi her finansal blokta açıkça yazılır.
4. Veri eksikliği `0`, `%0,0`, `€0` olarak gösterilmez.
5. 10 sütunlu tablo varsayılan görünümde 5 kritik kolona iner; ayrıntı kaybolmaz.
6. Mevcut filtreler, sıralama, navigasyon ve API çağrıları çalışmaya devam eder.
7. `npm test` ve `npm run build` geçer.

## Onay kapısı

Bu plan ve Satışlar mockup’ı uygulama öncesi sınırdır. Satışlar dilimini uygulamak için kullanıcı onayı gerekir. Onay verilmeden `src/SalesPage.jsx` veya `src/styles.css` değiştirilmez.
