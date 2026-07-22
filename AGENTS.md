# Prototype Instructions

Run the local server yourself and open the preview in the in-app browser. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

## Global ERP Analytics ve Hedef Takip Kuralları

- Önce planla: Üç veya daha fazla adım, veri akışı değişikliği, yeni entegrasyon veya mimari karar içeren her işte uygulamadan önce kapsam, dosyalar, doğrulama ölçütleri ve riskler yazılı bir planla netleştirilir. Doğrulama adımları da plana dahildir.
- Bir şey ters giderse dur: Beklenmeyen davranış, test kırılması veya kapsam sapması oluştuğunda mevcut yaklaşım zorlanmaz; neden ve yeni yaklaşım yeniden planlanır.
- Bağımsız işleri ayır: Birbirinden bağımsız araştırma, inceleme veya doğrulama işlerinde uygun olduğunda alt ajanlardan yararlanılabilir. Her alt görev tek bir sorumluluğa sahip olmalı, ortak dosyalarda çakışma yaratmamalı ve ana çalışmaya kanıtlanabilir çıktı vermelidir.
- Öğrenilen dersleri kalıcılaştır: Kullanıcı bir düzeltme yaptığında aynı hata örüntüsünü önleyen kural `tasks/lessons.md` dosyasına eklenir. Dosya yoksa yalnızca böyle bir düzeltme gerçekleştiğinde oluşturulur; her işte gereksiz ders kaydı yapılmaz.
- Zarif çözümü sorgula: Geçici veya kırılgan bir yama görüldüğünde, mevcut bağlam yeniden değerlendirilerek daha basit, izlenebilir ve proje mimarisiyle uyumlu çözüm tercih edilir. Bu ilke gereksiz soyutlama veya kapsam genişletme gerekçesi değildir.

### Kod ve mimari

- Mevcut proje React + JavaScript/ESM kullanır. Yeni kod mevcut dosya ve modül düzenine uyar; kullanıcı açıkça istemedikçe kapsamlı TypeScript dönüşümü yapılmaz.
- OOP yalnızca durum taşıyan CPM veritabanı bağlayıcıları, harici API istemcileri ve uyarı/entegrasyon sistemleri için kullanılır. Veri dönüştürme, sahiplik çözümleme, hedef hesaplama ve KPI mantığı saf fonksiyonlar olarak yazılır.
- Saf fonksiyonlar ham ERP verisini girdi olarak alır, özgün veriyi değiştirmeden analiz edilmiş yapı döndürür ve global duruma dayanmaz. Paylaşılan diziler/nesneler üzerinde yerinde değişiklik yapılmaz.
- ERP varlıkları zayıf genel tiplerle modellenmez. Bu JavaScript projesinde en azından JSDoc türleri ve çalışma zamanı doğrulayıcıları (`StockItem`, `SalesTarget`, `Invoice` gibi) kullanılır; yeni bir TypeScript dosyası eklenirse `strict` tür denetimi uygulanır.
- CPM’den veri çıkarma, ham satır doğrulama, dönüşüm ve KPI hesaplama ayrı sorumluluklardır. Tek bir dosyada birikmeye başlarsa, yalnızca ilgili sınırı ayıracak şekilde küçük ve geriye dönük uyumlu bir bölme yapılır.
- DRY, KISS ve YAGNI uygulanır. İhtiyaç kanıtlanmadan genel amaçlı katman, erken optimizasyon veya ilgisiz refaktör eklenmez.
- Kod içi yorumlar, bakım dokümanları ve yeni proje kuralları Türkçe yazılır. Teknik adlar, mevcut API alanları ve CPM terimleri gerektiğinde özgün biçimleriyle korunur.

### Test ve doğrulama

- Dar birim testlerinden önce gerçek veri akışını temsil eden entegrasyon testleri tercih edilir: CPM’den simüle edilen ham veri → doğrulama → satış vakası/department analizi → hedef ve KPI sonucu.
- Testler eksik tarih, `null` alan, negatif stok, iade, konsolide belge zinciri, tanımsız aktör ve cross-depot satış gibi gerçek ERP düzensizliklerini kapsar; yalnızca ideal örneklerle sınırlı kalmaz.
- Mevcut test komutları ve kapsam korunur. Yalnızca değişen mantıkla doğrudan ilgili testler eklenir; testleri geçirmek için üretim kuralları gevşetilmez.
- Tamamlandı denmeden önce ilgili entegrasyon testleri, üretim derlemesi ve değişikliğin kapsamını doğrulayan diff incelemesi çalıştırılır. CPM entegrasyonunda yazma yetkisi veya üretim etkisi doğuracak bir doğrulama yapılmaz.

### İş akışı ve kapsam

- Mevcut scriptler, hedef hesaplama mantığı, testler ve ilgili rapor/analiz sözleşmeleri okunmadan yeni çözüm önerilmez.
- Değişiklikler istenen özelliğin sınırında tutulur; ilgisiz biçimlendirme, dosya taşıma, geniş refaktör veya ürün değişikliği yapılmaz.
- Her modül tek bir sorumluluğa, açık girdilere ve açık çıktılara sahip olur. Veri çıkarma ile iş kuralı dönüşümü arasındaki sınır korunur.
- Bu kurallar, aşağıdaki Marlin Nexus ürün kararlarını geçersiz kılmaz. Özellikle CPM salt okunur kalır; departman sahipliği ve hedef analitiği mevcut konsolide satış/pool mantığını bozmadan ek bir mercek olarak geliştirilir.

## Durable product decisions

- The management product is named `Marlin Nexus`. It is the existing application that contains the pool, target tracking, sales, reports, approvals, and audit screens; it must be evolved incrementally rather than replaced with a separate application.
- CPM is only a read-only source system for Marlin Nexus. All Marlin Nexus-owned workflow state, evidence links, performance models, review decisions, and future product settings live in Marlin Nexus or its governed stores, never in CPM.
- CPM remains strictly read-only; no target, personnel, approval, or settings write may be sent to CPM.
- The read-only boundary applies to the Marlin Nexus integration: Nexus must not write directly to CPM. Management may separately redesign CPM's own operator workflow through vendor-supported configuration or customization. The target CPM flow records a source sales request/order before cross-depot fulfillment and propagates its commercial owner and department to downstream documents.
- `C:\CPMPrg - Kopya` is only a copied compiled CPM client, not an isolated test installation: on 2026-07-17 its configuration still pointed to `192.168.12.17\MARLINSQL` / `Marlin_Sec`, and it contained no Delphi or SQL source files. Do not use it for workflow experiments until both security/application databases are restored under test names, the copied client is repointed and verified, and outbound e-document/integration jobs are disabled. Local folder edits alone cannot implement database-backed ownership, propagation, approval, or audit rules.
- Management approved building the isolated CPM test lab on Furkan's workstation. Active setup state is recorded in `C:\Users\furkan.cakir\Documents\Marlin Test Lab\STATUS.md`; resume from that file after any reboot. The planned instance is `localhost\MARLINTEST` with `Turkish_CI_AS`, and production remains read-only until an explicit, tested go-live stage.
- Until a verified HR/personnel source is integrated, employee records must be labeled as pilot data and persisted only in the browser prototype.
- Person-level distribution is either coefficient-weighted (default) or equal. There is no employment/work-ratio multiplier and no individual target; eligibility is managed directly on the employee record.
- Targets combine company and department results. Atölye Teknik and Ofis employees share their department result; targets are based on prior-year same-month growth.
- Marlin Nexus commercial reporting has two business departments: `Servis` and `Yedek Parça Satış`. Mehmet Kara (`MKARA`), Burak Çetinel (`BCETINEL`), and Furkan Çakır (`FURKAN`) are Servis. Furkan and Burak work at Yatmarin Marina; Mehmet works at the central office on behalf of Servis. All other active users can be treated as Yedek Parça Satış unless corrected by management.
- Yatmarin is the Servis department center. Tuğrul Semiz (`TSEMİZ`/`TSEMIZ`) worked in Servis at Yatmarin through Alperen Erimli's final direct sales-entry date, 2026-05-25, and moved to central-office Yedek Parça Satış from 2026-05-26 onward. Alperen Erimli's CPM code is `AERIMLI`; he is an inactive former central-office Yedek Parça Satış user unless management supplies a different historical department.
- Department sales analysis should keep the existing consolidated sales/pool logic intact, then add a separate department lens. Prefer sales-case owner attribution from the earliest responsible sales-process document/user over invoice modifier or last actor; depot/location can be shown as context only after schema validation because location is not the same thing as revenue ownership.
- N. Toker (`NTOKER`) and A. Erimli (`AERIMLI`) are inactive former employees whose historical work belongs to Yedek Parça Satış at the central office. O. Gençoğlu (`OGENCOGLU`) is an inactive former employee whose historical work belongs to Servis at Yatmarin. Departure dates remain unverified unless management supplies them; inactivity must not erase or reassign historical sales.
- Department attribution must separate commercial owner, fulfillment/depot operator, document poster, approver, and last modifier. Cross-depot fulfillment is normal: Servis may sell an item verbally and request central-office delivery, and Mehmet Kara's stock exits are always from the central depot even though his commercial work belongs to Servis. A central-depot exit or a central-office user posting the retail/invoice document must therefore never override stronger commercial-owner evidence.
- Bircan (`BIRCAN`) is the company accountant and must not be treated as a commercial owner through preparer/entry/last-modifier fallback. If she is only the modifier or accounting processor, ownership must stay with the earliest valid commercial user; if no such user exists, the sale is review-required. Customer/account-card-like actor codes containing digits such as `S001`, `DBS003`, `A3149`, or numeric account codes are not employee users and must not appear in commercial owner rankings.
- Review-required department attribution may use same-customer/same-product nearby documents as an auditable candidate hint, but only with review status. Such hints may move provisional department totals while still remaining inspectable; they must not enter commercial-owner rankings or confirmed/inferred coverage.
- Future cross-depot or verbal retail sales should first receive a traceable CPM source request/order carrying the commercial owner, department, fulfillment depot, delivery mode, and source channel. Marlin Nexus may own an auditable handoff record only as an integration fallback or during the transition. Historical cases without such evidence remain provisional or review-required rather than being silently forced to the posting user's department.
- `SSP-00979` was a dry-run test order number and was deleted from CPM on 2026-07-20. Keep it in the Nexus exclusion registry as a historical safety marker; it and any residual descendant link must never contribute to analytics. The first real pilot must use a new order number.
- Closing and distribution approval are management-only. Years before 2026 are historical and are not represented as distributions made under this system.
- Purchase document types 9/609 are not sufficient proof of cost. Incoming e-invoice return evidence in EFAGLN must exclude customer returns from purchase-cost candidates; linked sales returns inherit the original sale-date cost basis.
- Costing must prefer a conservative `bulkPurchase` candidate before ordinary prior/next purchases when a sale has a qualifying supplier purchase within the previous year: at least 10 lines on the purchase document, at least 15% effective discount on the line, non-return evidence, and enough estimated remaining quantity after later sales. This is intended to capture campaign/bulk-order stock before falling back to the latest ordinary purchase.
- Audit views and exports must label VAT-exclusive sales/cost values, VAT-inclusive invoice totals, selected supplier evidence, effective discounts, cost validation, and excluded return documents explicitly.
- Management exports must reconcile to the visible net pool, identify CPM as read-only, identify employee data as pilot, and include an auditable workbook control that distribution shares equal the pool.
- Mail Intelligence research may use the active Outlook 2019 Marlin Exchange profile as a read-only proof-of-concept source. A production mail connector must use a separately verified, least-privilege read-only design; mailbox analysis must not send, move, delete, or change read/flag state.
- Mail Intelligence must treat subjects marked `İç yazışma` as private internal decision context that can guide customer-facing drafts but must never be exposed to customers. Erden Eke is the owner/management authority context for management-workflow analysis; his messages may inform decision and control design, but neither his nor any employee's message volume may be used as a performance or disciplinary score.
- The employee performance concept is evidence- and sales-case-based, covering every sales-process document including peşin/retail records. Linked documents represent one economic case: type 91 to type 85 must be deduplicated, and a type 91 document alone is not proof that cash was collected.
- Performance views must keep contribution, comparable-case performance, demonstrated capability, and future potential separate. They must not collapse these into one opaque score or cross-role leaderboard, and the last document modifier must not inherit the full case outcome.
- Mail may enrich a CPM-linked case only with source-linked work actions such as discovery, negotiation, technical solution, escalation, handoff, rescue, close confirmation, and knowledge transfer. Message counts, CC visibility, sentiment, personality, loyalty, and raw response speed are not performance measures.
- Begin with a 90-day `Kanıt ve Adalet Pilotu`: no person score in month one, a stratified 200-case manual linkage review in month two, and employee-visible, correctable shadow development cards in month three. Keep the pilot separate from compensation, profit distribution, discipline, and termination decisions until at least six months of shadow evidence and an independent fairness/legal review.
- WhatsApp Operations Intelligence may process only explicitly designated, company-controlled work groups through an official supported connection or a governed, consent-aware pilot export. It must not scrape WhatsApp Web, access private chats, or depend on personal-device session automation.
- WhatsApp analysis must center on source-linked work events, cases, tasks, decisions, blockers, handoffs, process delays, and knowledge-transfer signals. Person-level insights remain pilot observations that employees can inspect and correct; they must not create personality, emotion, loyalty, productivity, compensation, discipline, or termination scores. Management views default to team/process aggregates.
- WhatsApp raw content must be minimized, role-restricted, retention-limited, access-logged, and separated from model training. Private or special-category content must be excluded or quarantined, and CPM reconciliation remains strictly read-only.
- The live Marlin Nexus sales-case graph may read inactive prior-period type 91 documents only as trace evidence for active type 85 documents. Current-year economic metrics use active current-year terminal documents; consolidated 91→85 batches must remain a visible fairness warning and must not be attributed to a person until the underlying actions are separated.
- Person scoring stays technically blocked while CPM actor codes lack verified employee identity mapping, peşin tahsilat lacks bank/cash reconciliation, or the stratified 200-case manual linkage review is incomplete.

## Continuation context

- This workspace continues Codex task `019f273a-a643-7913-83bd-9521495dc5a3`; its chronological user/final-answer archive is in `SOURCE_THREAD_HISTORY.md`.
- The source snapshot was migrated from `C:\Users\furkan.cakir\Documents\Codex\2026-07-03\cp\outputs\marlin-profit-sharing` on 2026-07-16 with file-hash verification.
- Before each new operation, recommend the most suitable model and reasoning level. For CPM data rules, multi-file coding, deployment, or visual QA, prefer GPT-5.6 Sol with high or xhigh reasoning; use lighter models only for small wording or status work.
- The latest unfinished user request is a visual usability fix for the CPM Audit table: critical right-side columns (cost, gross profit, validation) are not initially visible because the table is too wide. Treat the migrated `App.jsx` query-parameter change as unfinished support work, not as a completed fix or deployed feature.
- Continue development only in this workspace. The former source directory and source task are historical references and must not receive further edits or deployments.
