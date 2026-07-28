import { useEffect, useMemo, useState } from "react";
import {
  IconAlertTriangle,
  IconCheck,
  IconChevronRight,
  IconClock,
  IconFileCheck,
  IconHistory,
  IconLock,
  IconRefresh,
  IconShieldCheck,
  IconWallet,
} from "@tabler/icons-react";

const months = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];
const money = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
const percentage = new Intl.NumberFormat("tr-TR", {
  maximumFractionDigits: 1,
});

function hasTargetData(targetRows) {
  return targetRows.some((row) => (
    Number(row.actual || 0) !== 0
    || Number(row.eligibleProfit || 0) !== 0
    || Number(row.uncoveredNetSales || 0) !== 0
  ));
}

function bandLabel(band) {
  if (band === "growth") return "Büyüme";
  if (band === "conservative") return "Temkinli";
  return "Muaf";
}

export function ApprovalPage({
  rows,
  targetRows = [],
  targetMode,
  targetError,
  annualPool,
  year,
  connection,
  costOverrides = [],
  onSaveCostOverrides,
  onBack,
}) {
  const [approvals, setApprovals] = useState({});
  const [auditEvents, setAuditEvents] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(1);
  const [loading, setLoading] = useState(true);
  const [actionMonth, setActionMonth] = useState(null);
  const [error, setError] = useState(null);
  const historical = year < 2026;
  const storageKey = `marlin-management-approvals-${year}`;
  const migrationKey = `marlin-approval-migration-${year}`;

  useEffect(() => {
    let cancelled = false;

    async function readServerApprovals({ allowMigration = true } = {}) {
      const response = await fetch(`/api/approvals?year=${year}`);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Onaylar okunamadı.");
      }

      const serverApprovals = payload.approvals || {};
      const migrationDone = localStorage.getItem(migrationKey) === "done";
      if (
        allowMigration
        && !historical
        && !migrationDone
        && Object.keys(serverApprovals).length === 0
      ) {
        let legacyApprovals = {};
        try {
          legacyApprovals = JSON.parse(
            localStorage.getItem(storageKey) || "{}",
          );
        } catch {
          legacyApprovals = {};
        }
        const legacyMonths = Object.entries(legacyApprovals)
          .filter(([, approval]) => Boolean(approval))
          .map(([month]) => Number(month))
          .filter((month) => Number.isInteger(month) && month >= 1 && month <= 12);
        if (legacyMonths.length) {
          const results = await Promise.all(legacyMonths.map((month) => (
            fetch(`/api/approvals/${year}/${month}`, { method: "PUT" })
          )));
          if (!results.every((result) => result.ok)) {
            throw new Error("Eski aylık onayların sunucu migrasyonu tamamlanamadı.");
          }
          localStorage.setItem(migrationKey, "done");
          return readServerApprovals({ allowMigration: false });
        }
        localStorage.setItem(migrationKey, "done");
      }
      return payload;
    }

    setLoading(true);
    setError(null);
    readServerApprovals()
      .then((payload) => {
        if (cancelled) return;
        setApprovals(payload.approvals || {});
        setAuditEvents(payload.auditEvents || []);
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [historical, migrationKey, storageKey, year]);

  const pendingCosts = costOverrides.filter((item) => (
    item.status === "pending"
    && new Date(item.documentDate).getFullYear() === year
  ));
  const periods = useMemo(() => months.map((monthName, index) => {
    const month = index + 1;
    const row = rows.find((item) => item.month === month);
    const monthTargets = targetRows.filter((item) => item.month === month);
    const approval = approvals[String(month)] || null;
    const hasData = targetMode === "live" && hasTargetData(monthTargets);
    const currentPool = monthTargets.reduce(
      (sum, item) => sum + Number(item.pool || 0),
      0,
    );
    const currentProfit = monthTargets.reduce(
      (sum, item) => sum + Number(item.eligibleProfit || 0),
      0,
    );
    return {
      month,
      monthName,
      row,
      targetRows: monthTargets,
      approval,
      hasData,
      pool: approval?.pool ?? currentPool,
      profit: approval
        ? approval.departments.reduce(
          (sum, item) => sum + Number(item.eligibleProfit || 0),
          0,
        )
        : currentProfit,
      risk: Boolean(
        row && (row.uncoveredCostLines || row.unlinkedReturnLines),
      ),
    };
  }), [approvals, rows, targetMode, targetRows]);
  const selected = periods.find((item) => item.month === selectedMonth)
    || periods[0];
  const approvedCount = periods.filter((item) => item.approval).length;
  const pendingCount = periods.filter((item) => (
    item.hasData && !item.approval
  )).length;
  const riskCount = periods.filter((item) => item.risk).length;
  const detailDepartments = selected.approval?.departments
    || selected.targetRows;

  async function reloadApprovals() {
    const response = await fetch(`/api/approvals?year=${year}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Onaylar okunamadı.");
    setApprovals(payload.approvals || {});
    setAuditEvents(payload.auditEvents || []);
  }

  async function approvePeriod() {
    if (historical || !selected.hasData || actionMonth) return;
    setActionMonth(selected.month);
    setError(null);
    try {
      const response = await fetch(
        `/api/approvals/${year}/${selected.month}`,
        { method: "PUT" },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Aylık onay kaydedilemedi.");
      }
      await reloadApprovals();
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setActionMonth(null);
    }
  }

  async function reopenPeriod() {
    if (!selected.approval || actionMonth) return;
    setActionMonth(selected.month);
    setError(null);
    try {
      const response = await fetch(
        `/api/approvals/${year}/${selected.month}/reopen`,
        { method: "POST" },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Onay geri açılamadı.");
      }
      await reloadApprovals();
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setActionMonth(null);
    }
  }

  const approveCost = (id) => onSaveCostOverrides(costOverrides.map((item) => (
    item.id === id
      ? {
        ...item,
        status: "approved",
        approvedAt: new Date().toISOString(),
        approvedBy: "Yönetim",
      }
      : item
  )));

  return (
    <main className="page approval-page" id="top">
      <section className="page-heading approval-heading">
        <div>
          <p className="eyebrow">Yönetim kararı</p>
          <h1>Onay ve Kapanış</h1>
          <p>
            {historical
              ? `${year} verileri yalnız karşılaştırma amaçlıdır; bu sistemle havuz dağıtımı yapılmadı.`
              : `${year} aylık departman havuzlarını ayrı ayrı onaylayın.`}
          </p>
        </div>
        <span className={connection.connected
          ? "connection-live"
          : "connection-demo"}
        >
          {connection.connected ? "CPM bağlı · salt okunur" : "Nexus pilot"}
        </span>
      </section>

      {(error || targetError) && (
        <div className="settings-message settings-message--error" role="alert">
          <span>
            <IconAlertTriangle size={17} />
            {error || targetError}
          </span>
        </div>
      )}

      <section className="approval-kpis">
        <article>
          <span><IconLock /></span>
          <div>
            <small>Yönetim onaylı dönem</small>
            <strong>{historical ? "—" : approvedCount}</strong>
            <p>{historical ? "Tarihsel kayıt" : "Sunucu snapshotı kayıtlı"}</p>
          </div>
        </article>
        <article>
          <span className="approval-kpi--blue"><IconFileCheck /></span>
          <div>
            <small>Onay bekleyen dönem</small>
            <strong>{historical ? "—" : pendingCount}</strong>
            <p>Gerçek nihai verisi oluşan aylar</p>
          </div>
        </article>
        <article>
          <span className="approval-kpi--amber"><IconAlertTriangle /></span>
          <div>
            <small>Görünür veri riski</small>
            <strong>{riskCount}</strong>
            <p>İnceleme notu taşıyan aylar</p>
          </div>
        </article>
        <article className="approval-kpi__pool">
          <span><IconWallet /></span>
          <div>
            <small>Toplam net havuz</small>
            <strong>
              {historical ? "Dağıtım yok" : `${money.format(annualPool)} TL`}
            </strong>
            <p>Hedef bantları · rezerv sonrası</p>
          </div>
        </article>
      </section>

      <div className="approval-layout">
        <section className="panel period-panel">
          <div className="panel-heading">
            <div>
              <h2>Aylık Yönetim Onayı</h2>
              <p>
                {historical
                  ? "Bu sistem öncesi tarihsel görünüm"
                  : "Her ay kendi ledger ve hedef snapshotıyla saklanır"}
              </p>
            </div>
          </div>
          <div className="period-table-wrap">
            <table className="period-table">
              <thead>
                <tr>
                  <th>Dönem</th>
                  <th>Veri güveni</th>
                  <th>Dağıtıma esas kâr</th>
                  <th>Havuz katkısı</th>
                  <th>Yönetim durumu</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((period) => (
                  <tr
                    key={period.month}
                    className={selected.month === period.month
                      ? "selected-period"
                      : ""}
                    onClick={() => setSelectedMonth(period.month)}
                  >
                    <th>
                      {period.monthName}
                      <small>
                        {period.hasData
                          ? `${money.format(period.targetRows.reduce(
                            (sum, item) => sum + Number(item.actual || 0),
                            0,
                          ))} TL net satış`
                          : "Nihai veri bekleniyor"}
                      </small>
                    </th>
                    <td>
                      {period.hasData
                        ? period.risk
                          ? <span className="negative">İnceleme var</span>
                          : <span className="positive">Doğrulandı</span>
                        : "—"}
                    </td>
                    <td>{period.hasData || period.approval
                      ? `${money.format(period.profit)} TL`
                      : "—"}
                    </td>
                    <td className="positive">
                      {period.hasData || period.approval
                        ? `${money.format(period.pool)} TL`
                        : "—"}
                    </td>
                    <td>
                      {historical
                        ? <span className="goal-status">Dağıtılmadı</span>
                        : period.approval?.stale
                          ? (
                            <span className="goal-status goal-status--blocked">
                              Güncelliğini yitirdi
                            </span>
                          )
                          : period.approval
                            ? (
                              <span className="goal-status goal-status--approved">
                                Onaylandı
                              </span>
                            )
                            : period.hasData
                              ? (
                                <span className="goal-status goal-status--pending">
                                  Onay bekliyor
                                </span>
                              )
                              : <span className="goal-status">Veri bekliyor</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="approval-detail">
          <div className="approval-detail__title">
            <div>
              <p className="eyebrow">Seçili dönem</p>
              <h2>{selected.monthName} {year}</h2>
            </div>
            {selected.approval && <IconCheck />}
          </div>

          {historical ? (
            <div className="approval-empty">
              <IconHistory />
              <div>
                <strong>Tarihsel veri</strong>
                <p>Bu yılda Nexus yönetim onayı ve dağıtımı yapılmadı.</p>
              </div>
            </div>
          ) : loading ? (
            <div className="approval-empty">
              <IconClock />
              <div><strong>Onaylar okunuyor</strong><p>Sunucu durumu yükleniyor.</p></div>
            </div>
          ) : !selected.hasData && !selected.approval ? (
            <div className="approval-empty">
              <IconClock />
              <div>
                <strong>Nihai veri bekleniyor</strong>
                <p>CPM nihai faturaları ve hedef sonucu hazır olduğunda onay açılır.</p>
              </div>
            </div>
          ) : (
            <>
              {selected.approval?.stale && (
                <div className="approval-blocker">
                  <IconRefresh />
                  <div>
                    <strong>Onay snapshotı güncelliğini yitirdi</strong>
                    <p>Ledger veya hedef sonucu değişti. Ayı geri açıp yeniden onaylayın.</p>
                  </div>
                </div>
              )}
              {selected.approval?.stale === null && (
                <div className="approval-blocker">
                  <IconAlertTriangle />
                  <div>
                    <strong>Güncellik doğrulanamadı</strong>
                    <p>Mevcut ledger okunamadı; kayıtlı onay korunuyor.</p>
                  </div>
                </div>
              )}
              <dl className="approval-values">
                <div>
                  <dt>Dağıtıma esas kâr</dt>
                  <dd>{money.format(selected.profit)} TL</dd>
                </div>
                <div>
                  <dt>Havuz katkısı</dt>
                  <dd className="positive">{money.format(selected.pool)} TL</dd>
                </div>
                <div>
                  <dt>Snapshot</dt>
                  <dd>{selected.approval
                    ? selected.approval.snapshotHash.slice(0, 10)
                    : "Onay bekliyor"}
                  </dd>
                </div>
              </dl>

              <div className="approval-departments">
                {detailDepartments.map((department) => (
                  <div key={department.department}>
                    <strong>{department.department === "service"
                      ? "Servis"
                      : "Yedek Parça Satış"}
                    </strong>
                    <span>Hedef bandı: {bandLabel(department.band)}</span>
                    <span>Oran: %{percentage.format(department.appliedRate)}</span>
                    <span>Havuz: {money.format(department.pool)} TL</span>
                  </div>
                ))}
              </div>

              {selected.risk && (
                <div className="approval-blocker">
                  <IconAlertTriangle />
                  <div>
                    <strong>İnceleme notu</strong>
                    <p>Eksik maliyet veya bağlantısız iade görünür durumda.</p>
                  </div>
                </div>
              )}
              <div className="approval-actions">
                {selected.approval ? (
                  <button
                    className="secondary-button"
                    onClick={reopenPeriod}
                    disabled={actionMonth === selected.month}
                  >
                    Onayı geri aç
                  </button>
                ) : (
                  <button
                    className="primary-action"
                    onClick={approvePeriod}
                    disabled={!selected.hasData || Boolean(actionMonth)}
                  >
                    <IconShieldCheck size={17} />
                    Yönetim onayı ver
                  </button>
                )}
              </div>
            </>
          )}

          {pendingCosts.length > 0 && (
            <div className="approval-history">
              <div className="approval-history__head">
                <IconHistory />
                <strong>Manuel maliyet onayları</strong>
              </div>
              {pendingCosts.map((item) => (
                <div key={item.id}>
                  <span className="history-icon back"><IconAlertTriangle /></span>
                  <p>
                    <strong>{item.cardCode} · {item.documentNo}</strong>
                    <small>{money.format(item.unitCost)} TL birim · {item.reason}</small>
                  </p>
                  <button
                    className="row-action"
                    onClick={() => approveCost(item.id)}
                    aria-label="Maliyeti onayla"
                  >
                    <IconCheck />
                  </button>
                </div>
              ))}
            </div>
          )}

          {auditEvents.length > 0 && (
            <div className="approval-audit">
              <IconHistory size={16} />
              <span>Bu yıl {auditEvents.length} onay olayı kaydedildi.</span>
            </div>
          )}

          <button className="back-to-ledger" onClick={onBack}>
            Havuza dön <IconChevronRight size={16} />
          </button>
        </aside>
      </div>
    </main>
  );
}
