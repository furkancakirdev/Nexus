# Session 3 Comparable Years Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CPM ve Nexus hareketlerini ürün-depo-para birimi grain’inde 2024 ve 2025 tam takvim yılları için kanıtlı aday WAC kapsamına almak; eksik açılış maliyetlerini covered saymamak.

**Architecture:** CPM yalnızca parametreli SELECT/metadata okumalarıyla profillenecek. WAC hesaplayıcısı doğrulanmış maliyetli açılış/alış satırlarını ve güvenilir önceki kapanış WAC’ını ürün+depo+para birimi anahtarında yürütür; bilinmeyen açılış, fiyat ve hareket türlerini ayrı status/review çıktısına koyar. Inventory source candidate kalır ve resmi WAC gate’i açılmaz.

**Tech Stack:** Node.js ESM, Node test runner, SQL Server/mssql, Vite.

**Spec:** `docs/audit/2026-09-03/session-3-comparable-years.md`

## Global Constraints

- CPM kesinlikle read-only; yalnız parametreli `SELECT` ve metadata okumaları.
- Eksik maliyet sıfır maliyet değildir; Nexus legacy/güncel veya gelecek maliyet geçmişe taşınmaz.
- Ürün, depo ve para birimi hiçbir koşulda birleştirilmez.
- 2024 ve 2025 kapsamı `[YYYY-01-01, (YYYY+1)-01-01)`; 2026 devam eden dönemdir ve tam yıl değildir.
- Session 2’nin CPM Halkbank satış kuru kaynağı ve EUR canonical gösterimi korunur.
- Resmi WAC gate’i, deploy, Docker cleanup ve veri silme yoktur.

### Task 1: CPM comparable-year evidence

**Files:**
- Create: `docs/audit/2026-09-03/session-3-comparable-years.md`
- Modify: `docs/superpowers/plans/2026-09-01-nexus-remediation.md`

- [ ] Parametreli SELECT ile 2024/2025 satır, tarih, ürün, depo, para birimi, maliyet, duplicate/conflict ve STKSYM partial kapsamını al.
- [ ] STKHAR/STKSYM/VW_STOKDURUM ve maliyet view anlamlarını, hareket türü/iadeleri ve Session 2 FX kaynağını kanıtla.
- [ ] En az 10 ürün, birden fazla depo ve tüm kullanılan para birimleri için örnek CPM satırı → aday Nexus sonucu tablosunu rapora yaz.

### Task 2: Comparable-year WAC model

**Files:**
- Modify: `shared/financialCostModel.mjs`
- Test: `server/financialCostModel.test.mjs`

- [ ] Ürün+depo+para birimi kapanışını taşıyan ve unknown opening’i covered yapmayan failing testleri ekle.
- [ ] `buildComparableYearWac` fonksiyonunu küçük bir wrapper olarak ekle; önceki güvenilir kapanışı sentetik opening olarak yalnız aynı stock key’de kullan.
- [ ] Negative-stock margin fallback ve maliyetsiz açılışları official covered kapsamından çıkar; `costStatus`, `financialStatus`, `reviewReason` alanlarını tutarlı döndür.

### Task 3: Source/status integration

**Files:**
- Modify: `server/inventoryMovementSource.mjs`
- Modify: `server/inventoryMovementSource.test.mjs`
- Modify: `server/openingEvidenceMatcher.mjs`

- [ ] Purchase/sale/sale-return/purchase-return etkisini mevcut aday eşlemesiyle koru; doğrulanmamış türleri unmapped karantinada tut.
- [ ] Doğal anahtar ve maliyet conflict sınıflarının yeni yıl kapsamına sızmadığını test et.
- [ ] Resmi source status’u `candidate`/`eligibleForOfficialWac=false` bırak.

### Task 4: Verification and progress

**Files:**
- Modify: `docs/audit/2026-09-03/session-3-comparable-years.md`
- Modify: `docs/superpowers/plans/2026-09-01-nexus-remediation.md`

- [ ] Odak testleri, `npm test`, build ve `git diff --check` çalıştır; sonuçları rapora yaz.
- [ ] 2024/2025 kapsamı tamamlanmışsa `SESSION_3_COMPLETE`; CPM kapsamı veya hesaplama kanıtı alınamazsa `SESSION_3_BLOCKED` yaz.
- [ ] Resmi WAC gate’inin kapalı kaldığını ve CPM’ye yazılmadığını açıkça kaydet.
