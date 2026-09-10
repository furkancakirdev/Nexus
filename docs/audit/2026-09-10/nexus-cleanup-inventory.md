# Nexus cleanup inventory — 2026-09-10

## Scope

Salt-okunur envanter. Bu kayıt herhangi bir deploy, veri veya doküman silme işlemi yapmaz.

## Findings

- `deploy/` klasörü mevcut değil; bu checkout içinde kaldırılacak ayrı bir deploy paketi bulunamadı.
- Kalıcı bakım script'i olarak `scripts/quality-gates.mjs` bulundu.
- `data/` altında `hr-state.json.tmp.*` biçiminde geçici bir state dosyası bulundu. İşletimsel sahiplik, aktif süreç ve geri yükleme gereksinimi doğrulanmadan silinmemeli.
- `docs/` altında çok sayıda audit, ekran görüntüsü, release, rollback ve tarihsel plan kanıtı bulunuyor. Bunlar finansal kanıt zinciri olabilir; toplu silme yapılmamalı.
- `work/` altında önceki oturum/worktree/artifact-build çıktıları ve `live_audit_dump.json` bulunuyor. Hangi worktree'nin aktif veya geri dönüş için gerekli olduğu doğrulanmadan silinmemeli.
- `ServicePro`/`servicepro` referansları çeşitli kaynak ve dokümanlarda geçiyor. Nexus çalışma zamanı bağımlılığı, deploy bağı ve kullanıcı sahipliği doğrulanmadan kaldırılmamalı.

## Safe next action requiring explicit approval

Ayrı bir temizlik değişikliği ancak kullanıcı şu kapsamı açıkça onayladıktan sonra hazırlanmalı:

1. Hangi `work/` oturum/artifact klasörleri arşivlenecek veya silinecek?
2. `data/hr-state.json.tmp.*` geçici dosyası için saklama/backup kararı nedir?
3. Hangi `docs/audit` kanıtları kalıcı kayıt olarak korunacak?
4. `ServicePro` referansları yalnız dokümanlardan mı, yoksa çalışma zamanı/deploy yapılandırmasından da mı kaldırılacak?

## Explicit scope approval — 2026-09-10

### Approved reversible archive scope

The following generated QA/work outputs may be moved as a single reversible archive (no permanent deletion):

- `work/screenshots/*.png`
- `work/screenshots/browser_audit_report.json`
- `work/inspect_overview.py`
- `work/test_all_pages.py`
- `work/test_browser_load.py`
- `work/browser_audit.py`
- `work/inspect_inv_prod.py`
- `work/inspect_inventory.py`
- `work/inspect_audit.py`
- `work/check_live.py`
- `work/audit_live_numbers.py`
- `work/dump_live_state.py`
- `work/verify_live.py`
- `work/session_7_finalize_evidence.py`
- `work/session_7_fresh_snapshot.py`

Archive must preserve relative paths, timestamps, and a manifest/hash. Archive destination and retention are now confirmed: `.archives/nexus-qa-20260910/nexus-qa-20260910.zip`, retained for 90 days until 2026-12-09T08:40:20Z. Manifest and archive SHA-256 evidence are in `.archives/nexus-qa-20260910/manifest.json` and `.archives/nexus-qa-20260910/archive-hash.json`. The ZIP was expanded and all 32 source-file hashes matched; source files remain in place and no deletion occurred.

### Explicitly excluded from deletion or archive

- `work/live_audit_dump.json` and `work/live_numbers.json` (live audit evidence; retain pending owner/retention decision).
- `work/nexus-live-20260904.tar.gz` (rollback/recovery candidate; retain until an immutable replacement is approved).
- `work/clean-checkout-*`, `work/session-*`, `work/session-*-fresh-*`, and `work/session-*-image-context-*` source snapshots/worktrees (ownership and rollback provenance not yet established).
- All `docs/audit/**`, release reports, accessibility evidence, financial reconciliation evidence, and plan files.
- Any `data/**` state, database export, business/user data, or unknown `ServicePro` runtime/deploy reference.
- Permanent project tooling such as `scripts/quality-gates.mjs`.

### Deletion scope

**None approved.** No permanent deletion is authorized by this inventory.

Until an archive destination/retention period and ownership for excluded artifacts are confirmed, keep all artifacts and only keep Nexus product surfaces disabled through the module registry/API fail-closed gates.

## 2026-09-10 Q1/C1 checkpoint

- Local release gate after the latest financial/UI changes: `npm test` **705/705**, `npm run build` successful, affected-file `node --check` successful, and `git diff --check` has no whitespace errors (only existing CRLF warnings).
- The reversible QA archive and manifest/hash evidence listed above remain the only approved cleanup action. Source files remain in place; no permanent deletion, deploy mutation, volume removal, CPM write, or production cutover was performed.
- Current working-tree outputs (`work/`, `premium-*.json`, `test-output.txt`, `patch.py`, generated archives and cache directories) remain unowned/unclassified for cleanup purposes and are not deletion candidates. User ownership, retention, rollback, and reproducibility evidence are still required before any additional cleanup.
