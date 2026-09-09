# Aşama 0/1 Ön Envanter — 2026-09-04

## Kapsam

Bu kayıt yalnızca yerel metadata ve erişilebilirlik kanıtıdır. CPM’ye sorgu/yazma yapılmadı; üretim state’i, secret içeriği veya parola bu belgeye alınmadı. Henüz dosya silinmedi, çalışma ağacı resetlenmedi, commit/push/deploy yapılmadı.

## Yerel çalışma alanı

| Alan | Kanıt |
|---|---:|
| Branch | `codex/UI` |
| HEAD | `1ca60ea8def8bf22ee7a0997a4883bb64ca9a5ad` |
| Tracked değişiklik | 12 dosya |
| Untracked giriş | 79 |
| Tekil untracked dosya | 68 |
| `work/session-*` klasörü | 11 |
| `.temp_files` dosyası | 27.459 |
| Git worktree | 8 |

## Worktree başlıkları

- Ana çalışma ağacı: `codex/UI` / `1ca60ea8def8bf22ee7a0997a4883bb64ca9a5ad`
- `codex/financial-recovery-d91-20260903`
- `codex/nexus-clean-lineage-20260903`
- `codex/unified-final-invoice-ledger`
- `feature/nexus-security-modernization-20260802`
- `fix/dependency-security-20260801`
- `wstack/ap/discovery-52f9b4`
- Ayrık detached worktree: `d14e4197530865a4d0b611faad0bf21dddfaefa2`

## İlk sınıflandırma

- **Kanonik aday:** Ana branch üzerindeki kaynak ve testler; benzersiz diff/hash incelemesi tamamlanmadan kesinleştirilmeyecek.
- **Birleştirilecek aday:** Diğer branch/worktree’lerdeki kaynak/test değişiklikleri; commit ve dosya bazlı karşılaştırma gerekli.
- **Yeniden üretilebilir aday:** `dist`, `.temp_files`, loglar, `__pycache__`, release arşivleri ve test çıktıları.
- **Kalıcı state adayı:** `data/`, audit/approval/manual-cost/frozen-rate içerikleri; session temizliği kapsamında silinmeyecek.
- **Silme adayı/bilinmiyor:** `work/session-*` ve eski kopyalar; benzersiz katkı ve state ayrımı yapılmadan silinmeyecek.

## Canlı erişim

- Önceki baz çizgi: `/api/health` HTTP 200, `connected=true`, `mode=live`, `readOnly=true`, database `Marlin_Uyg`.
- Bu oturumdaki yeni health denemesi: `https://192.168.12.11:4318/api/health` için 20 saniyede timeout.
- Sonuç: canlı erişim sürekliliği ve canlı sunucu dosya/build paritesi **doğrulanamadı**. Yetkili erişim yeniden sağlanmadan canlı veriler hakkında sonuç çıkarılmayacak.

## Sonraki kanıt işi

1. Untracked/tracked dosyalar için secret içeriği toplamadan güvenli hash/size manifesti oluştur.
2. Branch/worktree benzersiz commit ve diff sınıflandırmasını tamamla.
3. `data/` ve audit/state alanlarını geçici artefaktlardan ayır.
4. Canlı erişim geri geldiğinde yalnız metadata ve auth’lı read endpoint’leriyle local/live paritesini çıkar.
