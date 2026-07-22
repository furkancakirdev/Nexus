# Öğrenilen Dersler

- Ayrılan personelin kodu sonraki tarihli belge şablonlarında kalabilir. Ticari sahiplikte statik `SATICINO` veya hazırlayan alanı tek başına kullanılmamalı; gerçek işlem tarihi personelin geçerlilik aralığıyla birlikte doğrulanmalı ve tarih sınırının iki tarafı regresyon testiyle korunmalıdır.
- Ticari sahiplik olayları metin tip/no/müşteri anahtarına değil `rootId + lineageId + EVRBAS headerId` kimliğine bağlanmalıdır. `history-change` yalnız denetim olayıdır; makro sahibi, departmanı, sipariş numarası ve seçilen kanıt aynı doğrulanmış adaydan atomik gelmeli, eş düzey çatışmalar incelemeye alınmalıdır.
