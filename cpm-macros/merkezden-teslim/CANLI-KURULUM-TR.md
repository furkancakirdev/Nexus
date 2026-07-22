# Canli CPM Makro Kurulumu

Bu talimat yalnizca kullanicinin mevcut GENEL ve BASLA makro yedeklerinin geri yuklenebilir oldugunu dogruladigi kontrollu deneme icindir.

Ilk asamada kod `MARLIN_NEXUS_DRY_RUN = true` durumundadir. Bu mod `DataObject.Save` cagirmadigi icin makro belgeyi veritabanina kaydetmez. Ekrandaki deneme belgesini yine de `Iptal Et` ile kapatmak gerekir.

## Kullanilacak Kodlar

1. GENEL makrosunun sonuna eklenecek kod: `LibMarlinNexusOwnership.js`
2. BASLA makrosunun icine eklenecek kod: `BASLA-addition.js`

Yeni bir kutuphane makrosu olusturmayin. Fonksiyonlari mevcut `GENEL` makrosunun sonuna eklemek, mevcut Sales Order yukleme sirasi icin daha belirgin ve geri alinabilir bir yoldur.

## 1. Hazirlik

1. Acik tum `Satis Siparisi` pencerelerini kapatin.
2. GENEL ve BASLA yedeklerinin CPM disinda da mevcut oldugunu kontrol edin.
3. CPM ana ekranindan `Islemler > Araclar > Makrolar` bolumunu acin.
4. Kodlari once GENEL'e, sonra BASLA'ya kaydedin. Bu sira onemlidir.

## 2. GENEL Makrosu

1. Makro listesinden `GENEL` kaydini secin.
2. Kod alaninin en sonuna gidin.
3. Son satirdan sonra yeni bir bos satir acin.
4. `LibMarlinNexusOwnership.js` dosyasinin tamamini yapistirin.
5. Ilk satirlardaki ayarin aynen boyle kaldigini dogrulayin:

```javascript
var MARLIN_NEXUS_DRY_RUN = true;
```

6. GENEL makrosunu kaydedin.

Bu adim tek basina ekranda buton olusturmaz. BASLA kaydedilmeden yeni fonksiyonlar cagrilmaz.

## 3. BASLA Makrosu

1. Makro listesinden `BASLA` kaydini secin.
2. Asagidaki mevcut buton blogunu bulun:

```javascript
var btnListeFiyatiGetir1Tumu = TdxBarButton.Create(BarManager);
```

3. Bu butonun kapanis `}` satirindan sonra, `// stok kart arama sayfasi eventleri` yorumundan once yeni bir bos satir acin.
4. `BASLA-addition.js` dosyasinin tamamini buraya yapistirin.
5. Kodun mevcut `try { ... } catch (e) { ... }` blogunun icinde kaldigini kontrol edin.
6. BASLA makrosunu kaydedin.
7. Makro penceresini kapatin.

## 4. Kayitsiz Duman Testi

1. `Satis Siparisi` ekranini yeniden acin.
2. `Araclar` grubunda `Merkezden Teslim` butonunun gorundugunu kontrol edin.
3. `Yeni` ile kayitsiz bir siparis baslatin.
4. Gercek bir musteri ve tek bir urun satiri secin. Bu belgeyi kaydetmeyecegiz.
5. `Merkezden Teslim` butonuna basin.
6. Onay penceresinin basinda `DENEME MODU: Belge kaydedilmeyecek` yazisini arayin.
7. Onaylayin.
8. Su mesaj gelmelidir: `DENEME BASARILI: Alanlar ekranda hazirlandi, belge kaydedilmedi.`
9. `Kaydet` dugmesine basmayin.
10. `Iptal Et` ile belgeyi kapatin ve gerekirse degisiklikleri kaydetmeme secenegini onaylayin.

Bu asamada buton gorunmezse, teknik hata cikarsa veya CPM normal acilmazsa aktivasyona gecmeyin; dogrudan `Geri Donus` bolumunu uygulayin.

## 5. Gercek Kaydi Etkinlestirme

Kayitsiz duman testi tamamen basarili olduktan sonra:

1. Satis Siparisi penceresini kapatin.
2. Makrolardan `GENEL` kaydini acin.
3. Eklediginiz kodun basindaki yalnizca su satiri degistirin:

```javascript
var MARLIN_NEXUS_DRY_RUN = false;
```

4. GENEL'i kaydedip makro penceresini kapatin.
5. Satis Siparisi ekranini yeniden acin.
6. Ilk gercek denemeyi yalnizca gercekten merkezden teslim edilecek bir Servis siparisinde yapin.
7. Onay penceresinde ticari sorumlu, `SERVIS`, `MRK`, musteri ve satir sayisini kontrol edin.
8. Islem sonunda verilen Evrak No'yu kaydedin.
9. Bu Evrak No uzerinden `EVRBAS.SATICINO`, `STKHAR.MASRAFKOD` ve `STKHAR.DEPOKOD` salt okunur kontrol edilmeden ikinci bir kayit yapmayin.

## Beklenen Yetkiler

- `FURKAN`, `BCETINEL`, `MKARA`: butonu kullanabilir.
- Diger kullanicilar: islem engellenir ve belge kaydedilmez.
- Baska bir ticari sorumlu bulunan siparis: sahiplik degistirilmez ve belge kaydedilmez.

## Geri Donus

1. Acik Satis Siparisi pencerelerini kapatin.
2. Makrolardan once `BASLA` kaydini acip yedek BASLA iceriginin tamamini geri yukleyin ve kaydedin.
3. Ardindan `GENEL` kaydini acip yedek GENEL iceriginin tamamini geri yukleyin ve kaydedin.
4. Makro penceresini kapatip Satis Siparisi ekranini yeniden acin.
5. `Merkezden Teslim` butonunun artik gorunmedigini ve mevcut butonlarin normal calistigini kontrol edin.

GENEL kaydedilirken hata alinirsa BASLA'ya kod eklemeyin. BASLA kaydedildikten sonra ekran acilmazsa ana menudeki makro yoneticisinden yedek BASLA'yi once geri yukleyin.
