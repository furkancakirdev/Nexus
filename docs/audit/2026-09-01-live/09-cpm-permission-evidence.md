# Canlı CPM izin kanıtı

Tarih: 2026-09-01  
Kapsam: Marlin Nexus üretim container'ı içindeki bağlantı kimliği ve efektif CPM izinleri  
Yöntem: SSH üzerinden `marlin-profit-sharing` container'ında, credential değerleri ekrana yazdırılmadan salt-okunur metadata sorgusu

## Gözlenen sonuç

```text
principal=sa
original_login=sa
database_name=Marlin_Uyg
is_sysadmin=1
is_db_owner=1
db_select=1
db_insert=1
db_update=1
db_delete=1
db_alter=1
db_execute=1
```

Sonuç: Üretim CPM bağlantısı uygulama niyeti `readOnlyIntent` taşısa da efektif kimlik ve izinler SELECT-only değildir. Bu kritik release blocker'ıdır. Credential rotasyonu ve ayrı SELECT-only CPM hesabı kanıtlanmadan finansal üretim onayı verilmemelidir.

## Ek yapılandırma kanıtı

- Container: `marlin-profit-sharing`, çalışır durumda.
- Build: `nexus-20260831-230128`, commit `4db39d8f38fc7bd87704520fd51db1170ee2cc02`.
- CPM credential dosyası container'a `ro` mount edilmiştir; bu, DB hesabının efektif izinlerini sınırlamaz.
- Canlı build commit'i mevcut çalışma ağacındaki güncel remediation commit'inden geridedir; deploy yapılmamıştır.
- Hiçbir INSERT, UPDATE, DELETE, DDL veya CPM yazma sorgusu çalıştırılmamıştır.
