# Marlin Nexus Birlesik Nihai Fatura Defteri Tasarimi

## Amac

Marlin Nexus icindeki Satislar, Departman Analizi, Veri Denetimi, Hedef Takibi, Havuz ve Onay ekranlarini tek bir ekonomik kaynaktan beslemek. Ekonomik sonuc yalniz nihai satis ve alim faturalarindan hesaplanacak; teklif, siparis, onay, irsaliye, perakende ve kullanici gecmisi belgeleri ise sahiplik ve izlenebilirlik icin kullanilacak.

CPM salt okunur kalir. Nexus ayarlari, hedefler, kimlik eslemeleri, sahiplik karar izleri ve aylik onaylar Nexus tarafinda saklanir.

## Secilen Mimari

Sunucu katmaninda yila gore uretilen bir `Nihai Fatura Defteri` bulunur. Defterdeki her ekonomik satir tek bir nihai satis veya iade satiridir. Genel toplamlar, departman toplamlari, hedef gerceklesmeleri ve havuz hesaplari ayni normalize edilmis satirlardan turetilir.

Defter su sorumluluklari ayirir:

- Ekonomik belge: ciro, iskonto, iade, maliyet ve kar hesabi.
- Ticari surec zinciri: belge sahipligi ve departman atamasi.
- Operasyonel rol: depo, teslim eden, kaydi yapan ve son degistiren kullanici.
- Yonetilen Nexus karari: ayar, kimlik eslemesi, dusuk guvenli atif, maliyet karari ve aylik onay.

## Ekonomik Belge Kurallari

### Satislar

- Tip `17` satis faturasi ve tip `85` irsaliyesiz fatura nihai ekonomik belgedir.
- Tip `91` pesin/perakende satis, daha sonra tip `17` veya `85` faturaya donusmemisse nihai ekonomik belge olarak kabul edilir.
- Bir tip `91` kaydi tip `17` veya `85` faturaya donustuyse ekonomik tutar yalniz sonraki faturadan alinir. Tip `91` sahiplik ve surec izi olarak korunur.
- Tip `18` satis iadesi net satisi azaltir. Bagli nihai satis faturasi bulunursa maliyet ve sahiplik o faturanin satis tarihindeki kanitindan devralinir.
- Baglantisiz tip `18` iade ekonomik olarak gorunur kalir; maliyet ve sahiplik dusuk guvenli inceleme kaydi olarak isaretlenir.
- Tip `13`, `14`, `15` ve `64` gibi teklif, siparis, irsaliye ve onay belgeleri ekonomik toplama girmez.
- `KOMISYON`, `GD-0187`, `GD-0079` ve `PDI` kartlari mevcut politika uyarinca dagitima esas kardan haric tutulur ve denetim ekraninda acikca etiketlenir.
- `SSP-00979` ve bagli kalintilari tarihsel test dislama kaydinda tutulur ve hicbir toplama girmez.

### Perakende Satis Modulu

Perakende akis ekonomik ve sahiplik acisindan ikiye ayrilir:

1. Bagimsiz perakende: Tip `91` sonraki bir faturaya donusmemisse nihai satis kabul edilir. Belge basligi, gercek kullanici gecmisi ve varsa kaynak siparis sahipligi kullanilir.
2. Faturaya donusen perakende: Tip `91` ekonomik olarak tekillestirilir; sonraki tip `17/85` tutari kullanilir. Tip `91` uzerindeki ticari kullanici ve onceki kaynak belgeler sahiplik zincirine katilir.

Birden fazla tip `91` kaydinin tek faturada birlestigi durumlar belge satiri seviyesinde eslestirilir. Eslesme belirsizse tutar yine yalniz nihai faturadan hesaplanir; kisi sahipligi zorlanmadan departman kaniti uretilir ve dusuk guven etiketi eklenir.

### Alimlar ve Maliyet

- Yalniz aktif tip `9` ve `609` nihai alim faturasi satirlari maliyet kaniti olabilir.
- Net birim maliyet `(fatura tutari - fatura iskontosu) / miktar` olarak hesaplanir.
- EFAGLN iade kaniti tasiyan tedarik belgeleri alim adayi olamaz.
- Satis iadesi, bagli oldugu asil satis tarihindeki maliyet temelini devralir.
- Mevcut toplu alim kurali korunur: satistan onceki bir yil icinde en az 10 satirli, en az yuzde 15 efektif iskontolu ve tahmini kalan miktari yeterli bir alim faturasi varsa `bulkPurchase` adayi onceliklidir.
- Uygun toplu alim yoksa satistan onceki son aktif alim faturasi; bu da yoksa satistan sonraki ilk aktif alim faturasi kullanilir.
- Secilen tedarikci, fatura numarasi, tarih, brut tutar, iskonto, KDV, net tutar ve maliyet yontemi denetim kaydinda saklanir.
- Dogrulanabilir maliyeti olmayan satis satiri ciroda gorunur, ancak ilgili net tutar dagitima esas kardan cikarilir.

## Belge Zinciri ve Sahiplik

Nihai faturadan kaynak belgelere dogru su akis izlenir:

`Teklif -> Satis Siparisi -> Siparis Onayi -> Irsaliye -> Fatura`

Perakende akis icin su kollar da izlenir:

`Kaynak talep/siparis -> Tip 91` veya `Kaynak talep/siparis -> Tip 91 -> Tip 17/85`

Kaynak baglantilari satir seviyesinde `SONKAYNAK...` alanlariyla geriye dogru en fazla sekiz adim izlenir. Her belge icin EVRBAS basligi, MIREVRBAS giris/degisiklik gecmisi ve EVRONY onay gecmisi okunur.

### Kanit Onceligi

1. CPM satis siparisi makrosuyla kaydedilen acik departman ve ticari sorumlu.
2. Kaynak teklif/siparis uzerindeki, belge tarihinde gecerli ve gercek islem gecmisiyle desteklenen ticari sorumlu.
3. Teklif, siparis veya onay belgesindeki en erken gercek giris/degisiklik kullanicisi.
4. Zincirdeki tum gecerli ticari kullanicilar ayni departmandaysa departman mutabakati.
5. Ayni cari, urun ve yakin tarihli bagli B2B belge kaniti.
6. Kanit bulunamazsa depo yalniz yardimci ipucu olur; dusuk guvenli departman atamasi acikca etiketlenir.

Bircan Colak muhasebe kullanicisidir. Fatura kaydi, son degisiklik veya muhasebe onayi sahipligi devralmaz. Sistem, yonetim ve sayi iceren cari kart kodlari ticari kullanici olamaz.

Ozlenen Gencoglu icin yonetimin bildirdigi yaklasik ayrilis bilgisi nedeniyle gecici bitis tarihi `2024-06-30` kabul edilir. Bu tarihten sonraki belgelerde sablon alaninda `OGENCOGLU` bulunmasi sahiplik kaniti sayilmaz. Gercek MIREVRBAS islemi bulunan guncel kullanici esas alinir. Yonetim kesin ayrilis tarihini saglarsa tarih etkili kimlik kaydi guncellenir.

Tugrul Semiz, `2026-05-25` tarihine kadar Servis/Yatmarin; `2026-05-26` ve sonrasinda Yedek Parca Satis/Merkez Ofis olarak atanir. Ayrilmis personelin gercek calisma donemindeki tarihsel satislari silinmez veya baska kisiye aktarilmaz.

### Adlar ve Kimlikler

Arayuzde ana deger tam ad ve soyaddir; CPM kodu ikincil bilgi olarak gosterilir. Tam ad once CPM icindeki dogrulanabilir kullanici kaynagindan, bulunamazsa Nexus kimlik esleme kaydindan okunur. Kodun kendisi tam ad gibi gosterilmez. Eksik esleme `Tanimsiz kullanici (KOD)` olarak gorunur ve Ayarlar'daki kimlik esleme listesine eklenir.

## Departman Hedefleri ve Dagitim

Hedefler yalniz `Servis` ve `Yedek Parca Satis` departmanlari icin aylik hesaplanir. Personel hedefi veya personel performans puani kullanilmaz.

Her departman ve ay icin:

```text
hedef = onceki yil ayni ay nihai net satis * (1 + hedef buyume orani)
buyume esigi = hedef * (1 + hedef ustu esik orani)
```

Varsayilan hedef buyume orani yuzde 10'dur ve departman bazinda ayarlanabilir. Hedef ustu esik orani da departman bazinda ayarlanabilir.

- Gerceklesme hedefin altindaysa dagitim orani sifirdir.
- Gerceklesme hedefe esit veya ustunde, buyume esiginin altindaysa temkinli oran uygulanir.
- Gerceklesme buyume esigine esit veya ustundeyse buyume orani uygulanir.
- Mevcut canli temkinli oran yuzde 3 ve buyume orani yuzde 8 korunarak yeni ayarlara tasinir.
- Departmanin aylik dagitilabilir tutari, maliyeti dogrulanmis aylik departman kari uzerinden hesaplanir ve risk rezervi dusulur.
- Yillik havuz, uygun departman-ay havuzlarinin toplami olur.
- Her departmanin havuzu yalniz o departmandaki uygun personele esit veya katsayi agirlikli dagitilir. Bireysel hedef, hedef puani veya performans carpani uygulanmaz.

## Ayarlar ve Ekranlar

### Ayarlar

`Hedefler ve Dagitim` bolumu su alanlari icerir:

- Servis hedef buyume orani.
- Servis hedef ustu buyume esigi.
- Yedek Parca Satis hedef buyume orani.
- Yedek Parca Satis hedef ustu buyume esigi.
- Temkinli dagitim orani.
- Buyume dagitim orani.
- Risk rezervi.
- Esit veya katsayi agirlikli personel dagitim yontemi.

Sirket/departman agirliklari, gerceklesme puanlari, asgari hedef puani, azami performans carpani, degerlendirme olcegi ve eski bireysel hedef alanlari kaldirilir. Kayit sirasinda eski anahtarlar yonetilen ayar dosyasindan temizlenir; maliyet, personel katilimi ve mevcut oranlar korunur.

### Hedef Takibi

Hedef Takibi salt izleme ekranidir. Her departman icin onceki yil ayni ay satisi, hedef, buyume esigi, cari yil gerceklesmesi, fark, gerceklesme yuzdesi, secilen dagitim bandi ve olusan havuzu gosterir. Bu sayfada ayar girisi veya personel puani bulunmaz.

### Katki ve Performans

Katki & Performans sayfasi ve ana menu baglantisi kaldirilir. Evrak zinciri ve kullanici kaniti gibi faydali inceleme ogeleri Departman Analizi sahiplik detayina tasinir. Arka plandaki satis-vakasi baglanti yetenegi birlesik defterin sahiplik cozumlemesinde kullanilabilir.

### Veri Denetimi

Maliyet, brut kar ve dogrulama sutunlari ilk gorunumde kalir. Tablo gereksiz genislemeyi azaltir; ekonomik belge, sahiplik ve alim kaniti ayrintilari acilir satirda gosterilir.

## Aylik Onay ve Kapanis

Her ay ayri bir yonetim onay kaydidir. Onay kaydi su anlik goruntuyu saklar:

- Ay ve yil.
- Iki departmanin hedef, buyume esigi, gerceklesme ve bandi.
- Nihai net satis, maliyet, kar, uygulanan oran, rezerv ve havuz.
- Maliyet kapsami ve sahiplik guveni.
- Onaylayan, onay tarihi, yeniden acma bilgisi ve veri anlik goruntu ozeti.

Onaylar tarayici localStorage alaninda degil Nexus yonetilen durum dosyasinda tutulur. Eski tarayici onaylari varsa istemci bir defaya mahsus Nexus'a tasir. Onay sonrasi kaynak veri veya ayar degisirse anlik goruntu farki gosterilir ve donem yeniden inceleme gerektirir. Yonetim onayi ve yeniden acma islemleri denetim kaydina yazilir.

## Performans ve Onbellek

- Yillik nihai fatura defteri icin tek sorgu ve tek-ucuslu (`single-flight`) bellek onbellegi kullanilir.
- Genel toplam, departman, hedef ve denetim API'leri ayni defteri yeniden kullanir.
- Guncel yil ve onceki yil sunucu baslangicinda arka planda hazirlanir.
- Kullaniciya son basarili defter hemen sunulur; suresi dolan veri arka planda yenilenir.
- Elle yenileme yeni sorguyu tetikler fakat ayni yil icin ikinci paralel CPM sorgusu acmaz.
- Ayrinti satirlari sayfalanir; ana ekran ilk yuklemede tum defteri tasimaz.
- App durum ayari yil degisiminde tekrar tekrar cekilmez.
- CPM baglantisi veya yenileme basarisizsa son basarili anlik goruntu, zaman damgasi ve uyariyla sunulur.

Hedef, sicak ekran gecislerini bir saniyenin altina indirmektir. Soguk yenileme suresi, uygulama sonu testinde mevcut 42-46 saniyelik tabanla karsilastirilir.

## Veri Guveni ve Hata Davranisi

- Tum ekonomik ekranlarin yil toplami ayni defter toplami ile uzlasmak zorundadir.
- Departman toplamlari, inceleme/dusuk guven dahil, genel nihai net satis toplamiyla esit olmalidir.
- Gecici evrak tutarlari ekonomik toplama girerse otomatik test basarisiz olur.
- Bir faturaya donusen tip `91` tekrar ekonomik toplama girerse otomatik test basarisiz olur.
- Gecersiz tarihteki ayrilmis personel sahiplik kazanirsa otomatik test basarisiz olur.
- BIRCAN, sistem kodlari veya cari kart kodlari ticari sahip listesine girerse otomatik test basarisiz olur.
- CPM'e yalniz SELECT sorgulari gonderilir.

## Test ve Canliya Alma

Uygulama test odakli ilerler:

1. Nihai fatura secimi, perakende tekillestirme ve iade baglantisi testleri.
2. Nihai alim faturasi ve maliyet aday sirasi testleri.
3. B2B zinciri, makro sahipligi, Bircan dislama, Ozlenen tarih siniri ve Tugrul tarih etkili departman testleri.
4. Hedef alti, temkinli bant ve buyume bandi sinir testleri.
5. Departman ici personel dagitimi ve bireysel hedefsiz model testleri.
6. Aylik onay anlik goruntusu ve yeniden acma testleri.
7. 2024, 2025 ve 2026 genel/departman uzlastirma testleri.
8. Masaustu ve mobil arayuz goruntuleri, tablo tasmasi ve tarayici konsol kontrolu.
9. Canli paket yedegi, geri donus imaji, saglik kontrolu ve salt okunur CPM dogrulamasi.

Ilk gercek CPM makro siparisi yeni bir belge numarasiyla ayrica dogrulanir. Silinmis `SSP-00979` yalniz dislama guvenlik kaydi olarak kalir.
