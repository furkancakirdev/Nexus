# 2026-09-08 CPM tahsilat kaynağı keşfi

Bu çalışma yalnızca canlı sunucudaki mevcut Docker çalışma ortamında yapılan salt-okunur `SELECT` ve metadata okumalarının kanıt kaydıdır. CPM `Marlin_Uyg` üzerinde `INSERT`, `UPDATE`, `DELETE`, DDL, prosedür çağrısı, veri dışa aktarımı veya Nexus üretim durumu değişikliği yapılmadı.

## Amaç ve sınır

Amaç, 2026 satış belgelerinin hangi CPM kaynaklarında cari, banka veya kasa hareketleriyle izlenebildiğini görmekti. Bu çalışma satışın varlığını veya tahsilatın yapıldığını varsaymaz. Tahsilat kanıtı, maliyet/WAC kanıtından ayrı tutulur; bu keşif resmi kâr, marj, havuz veya readiness kapısını açmaz.

## Canlı şema kanıtı

| Kaynak | Gözlenen rol | Tahsilat köprüsü açısından anlamı |
|---|---|---|
| `CARKRT` | Cari kartı; cari kodu ve unvanı | Kimlik zenginleştirme; tek başına ödeme kanıtı değil |
| `CARHAR` | Cari hareketi; belge, cari, tarih, tutar, borç/alacak, karşı belge ve kullanılan tutar alanları | Fatura/cari hareketi için ana aday |
| `CARENT` | Kaynak belge → cari hareket kaydı; `KAYNAK...` alanları var | Faturanın cari hesaba işlendiğini gösteren ana aday |
| `BNKHAR` | Banka hareketi; tarih, yön, tutar ve banka hesap alanları | Banka hareketi adayı; fatura anahtarı bulunmadıkça tahsilat eşleşmesi değil |
| `EVRHAR` / `VW_EVRHAR` | Genel belge hareketi; kaynak ve karşı belge alanları var | Nakit/banka belgesi adayı; satış faturasıyla birebir bağ ayrıca kanıtlanmalı |
| `PROFIL_GUNLUNNAKITTAHSILAT` | Gün, temsilci ve nakit toplamı | Günlük nakit özeti; fatura seviyesinde dağıtım anahtarı yok |
| `VW_KASA` | Kasa cari kodu ve unvanı | Kasa hesabı tanımı; hareket satırı değil |

## 2026 eşleşme özeti

Taze canlı okumada 2026 aktif `STKHAR` satış belgeleri ile tam `belge tipi + belge no + cari kodu` anahtarı kullanıldı:

| Kaynak | Tip 17 | Tip 85 | Tip 91 | Yorum |
|---|---:|---:|---:|---|
| Satış belge sayısı | 2.869 | 685 | 2.207 | Satış kapsamı |
| `CARHAR` üzerinde aynı fatura/cari hareketi | 2.867 | 685 | 2.207 | Cari hesaba işlenme adayı |
| `CARENT.KAYNAK...` ile aynı faturaya bağlanan kayıt | 2.867 | 685 | 2.207 | Fatura → cari kayıt köprüsü |
| `CARHAR` üzerinde ödeme uygulama tutarı (`KULLANILANTUTAR`) | 0 | 0 | 0 | Tahsilat uygulaması kanıtı değil |
| `EVRHAR` kaynak/karşı belge ile aynı satışa bağlanan kayıt | 0 | 0 | 0 | Birebir tahsilat bağı bulunmadı |

Ek kontroller:

- 2026 `CARHAR` satış satırlarında karşı belge ve kaynak belge alanları dolu bir tahsilat bağlantısı göstermedi.
- `CARHAR` içinde bazı başka hareket tiplerinde kaynak veya karşı belge alanları bulunuyor; ancak bu kayıtlar 2026 tip 17/85/91 satışlarına tam anahtarla bağlanmadı.
- 2026 `EVRHAR` kapsamındaki kayıtlar hareket tipi 335, 342 ve 505 gruplarında görüldü; bunların satış faturalarına kaynak/karşı belge bağlantısı çıkmadı.
- `PROFIL_GUNLUNNAKITTAHSILAT` 2026 için iki günlük özet satırı döndürdü. Bu görünüm yalnız gün, temsilci ve toplam nakit taşıdığı için faturaya dağıtım kanıtı değildir.
- `BNKHAR` banka hareketlerinde `KARSIREFERANS` alanı mevcut olsa da incelenen 2026 kapsamındaki satırlarda fatura anahtarına bağlanan bir karşı referans görülmedi.

## Sonuç

Bu turda doğrulanan şey, faturaların cari hesaba işlendiğidir; tahsilatın hangi banka/kasa hareketiyle kapandığı değildir. Bu nedenle:

- 2026 satışlarının tahsil edildiği sonucu üretilmemelidir.
- 2026 satışlarının tahsil edilmediği sonucu da üretilmemelidir.
- Tahsilat durumu `unverified / inceleme gerekli` kalmalıdır.
- Satış, maliyet, WAC, kâr, marj ve havuz hesapları bu keşif nedeniyle değiştirilmemelidir.
- `CARHAR` veya `CARENT` tutarları banka/kasa tahsilatı gibi yeniden yorumlanmamalıdır.

## Sıradaki güvenli dilim

1. Yeni bir salt-okunur tahsilat kanıt sorgusu, fatura anahtarını (`tip + no + cari`) ve yalnız tam kaynak/karşı belge referanslarını ayrı recordset olarak döndürmeli.
2. `EVRHAR` tip 335/342/505 ile `BORCALACAK` ve `ISLEMTIP` anlamları CPM ekranı veya üretici sözleşmesiyle doğrulanmadan tahsilat tipi diye adlandırılmamalı.
3. Tam anahtar bulunmayan banka/kasa hareketleri yalnız `candidate`, `unverified` veya `review-required` olarak sınıflanmalı; tutar/tarih benzerliği kesin eşleşmeye çevrilmemeli.
4. Bu köprü doğrulanmadan kişi puanı, tahsil edilebilir kâr veya tahsilata dayalı havuz metriği açılmamalı.

Bu sınırı koruyan saf kanıt modeli `server/settlementEvidence.mjs` ve
`server/settlementEvidence.test.mjs` dosyalarında hazırlandı. Model üretim
API'sine henüz bağlanmadı; bunun nedeni canlı kaynakta doğrulanmış fatura →
banka/kasa tahsilat recordset'inin henüz bulunmamış olmasıdır.

## Salt-okunur sorgu sözleşmesi doğrulaması

`server/settlementEvidenceSql.mjs` dosyasında dört recordset'li bir aday CPM
sorgu taslağı bulunuyor. Bu dosya yerel geçici tablo ve `INSERT` kullandığı için
kesin SELECT-only sözleşmesi değildir; `settlement-evidence-v1` sorgusu mevcut
çalışma zamanında `request.query` çağrısından önce karantinaya alınır.

Aşağıdaki sayılar önceki bir aday çalışma notundan taşınan tarihsel sonuçlardır;
bu turda canlı Docker/CPM üzerinde yeniden çalıştırılmış kanıt değildir:

- 5.761 aktif satış faturası recordset'i döndü.
- 11.518 `CARENT`/`CARHAR` cari işlenme kaydı döndü.
- Tam belge anahtarlı banka/cari/belge tahsilat adayı: 0.
- Faturaya bağlanmamış banka/günlük nakit özet kovası: 627.

Bu tarihsel sonuç cari hesaba işlenme olduğunu gösterir; fatura seviyesinde
banka/kasa tahsilat bağına ilişkin güncel kanıt oluşturmaz. 627 sayısı ham
tahsilat sayısı değil, faturaya bağlanmamış özet aday kovasıdır. Sorgu mevcut
API veya UI'ya bağlanmadı; resmi tahsilat, kâr, marj, WAC ve havuz kapıları
açılmadı.

Bu rapor bir veri düzeltmesi veya üretim yayını değildir; canlı baseline korunmuştur.
