import { useMemo, useState } from "react";
import {
  IconAlertTriangle,
  IconChevronRight,
  IconLock,
  IconTargetArrow,
  IconTrendingUp,
  IconWallet,
} from "@tabler/icons-react";

const DEPARTMENTS = [
  { id: "service", name: "Servis" },
  { id: "parts", name: "Yedek Parça Satış" },
];

const money = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 });

function bandLabel(band) {
  if (band === "growth") return "Büyüme";
  if (band === "conservative") return "Temkinli";
  return "Dağıtım muaf";
}

function bandClass(band) {
  if (band === "growth") return "goal-status goal-status--approved";
  if (band === "conservative") return "goal-status goal-status--pending";
  return "goal-status goal-status--blocked";
}

const serviceEmployees = [
  ["FURKAN", "Furkan Çakır"],
  ["BCETINEL", "Burak Çetinel"],
  ["MKARA", "Mehmet Kara"],
];
const partsEmployees = [
  "Ali Can Yaylalı", "Batuhan Batmaz", "Cüneyt Yaylalı", "Emre Kaya",
  "Erhan Turhan", "Halil İbrahim Duru", "İbrahim Yayalık",
  "İbrahim Yaylalı", "Mehmet Bacak", "Mehmet Güven", "Mekselina Kebapcı",
  "Melih Çoban", "Ömer Bıdan", "Sercan Sarıöz", "Volkan Özkan",
  "Emre Erdoğan", "Tuğrul Semiz", "Bircan Çolak", "Can Belikırık",
];

export const PILOT_EMPLOYEES = [
  ...serviceEmployees.map(([code, name]) => ({
    id: code,
    code,
    name,
    title: "Servis",
    department: "service",
    status: "employee",
    included: true,
    salaryCoefficient: 1,
    fixedShareRate: 0,
  })),
  ...partsEmployees.map((name, index) => ({
    id: `parts-${index + 1}`,
    name,
    title: "Yedek Parça Satış",
    department: "parts",
    status: "employee",
    included: true,
    salaryCoefficient: 1,
    fixedShareRate: 0,
  })),
];

export function GoalsPage({
  targetRows = [],
  targetMode,
  targetError,
  annualPool,
  year,
  onBack,
}) {
  const [department, setDepartment] = useState("service");
  const rows = useMemo(
    () => targetRows
      .filter((row) => row.department === department)
      .sort((left, right) => left.month - right.month),
    [department, targetRows],
  );
  const totals = useMemo(() => rows.reduce((result, row) => ({
    actual: result.actual + Number(row.actual || 0),
    target: result.target + Number(row.target || 0),
    pool: result.pool + Number(row.pool || 0),
    met: result.met + (row.band === "none" ? 0 : 1),
  }), { actual: 0, target: 0, pool: 0, met: 0 }), [rows]);
  const selectedDepartment = DEPARTMENTS.find((item) => item.id === department);
  const achievement = totals.target > 0
    ? totals.actual / totals.target * 100
    : null;

  return (
    <main className="page goals-page" id="top">
      <section className="page-heading goals-heading">
        <div>
          <p className="eyebrow">Departman hedefleri</p>
          <h1>Hedef Takibi</h1>
          <p>{year} gerçekleşmesini önceki yılın aynı ayından üretilen hedeflerle izleyin.</p>
        </div>
        <div className="pilot-notice">
          <IconLock size={17} />
          <span><strong>Salt okunur takip</strong><small>Ayarlar, Ayarlar sayfasından yönetilir</small></span>
        </div>
      </section>

      {targetError && (
        <div className="settings-message settings-message--error" role="alert">
          <span><IconAlertTriangle size={17} /> {targetError}</span>
        </div>
      )}

      <section className="goal-kpis">
        <article>
          <span className="goal-kpi__icon"><IconTargetArrow /></span>
          <div><small>Yıllık hedef</small><strong>{money.format(totals.target)} TL</strong><p>{selectedDepartment.name}</p></div>
        </article>
        <article>
          <span className="goal-kpi__icon goal-kpi__icon--green"><IconTrendingUp /></span>
          <div><small>Gerçekleşme</small><strong>{money.format(totals.actual)} TL</strong><p>{achievement === null ? "Baz yıl verisi yok" : `%${pct.format(achievement)} hedef oranı`}</p></div>
        </article>
        <article>
          <span className="goal-kpi__icon goal-kpi__icon--amber"><IconTargetArrow /></span>
          <div><small>Hedef tutan ay</small><strong>{totals.met} / 12</strong><p>Temkinli veya büyüme bandı</p></div>
        </article>
        <article className="goal-kpi--pool">
          <span className="goal-kpi__icon"><IconWallet /></span>
          <div><small>Toplam net havuz</small><strong>{money.format(annualPool)} TL</strong><p>İki departman · rezerv sonrası</p></div>
        </article>
      </section>

      <section className="panel goal-workspace">
        <div className="goal-workspace__top">
          <div>
            <h2>{selectedDepartment.name} Aylık Hedefleri</h2>
            <p>Önceki yıl → hedef → hedef üstü eşik → gerçekleşme → otomatik dağıtım bandı</p>
          </div>
          <span className={`source-badge source-badge--${targetMode === "live" ? "live" : "demo"}`}>
            {targetMode === "loading" ? "Hesaplanıyor" : targetMode === "live" ? "Nihai defter" : "Veri bekleniyor"}
          </span>
        </div>

        <div className="goal-department-tabs" role="tablist" aria-label="Departman seçimi">
          {DEPARTMENTS.map((item) => (
            <button
              key={item.id}
              role="tab"
              aria-selected={department === item.id}
              className={department === item.id ? "active" : ""}
              onClick={() => setDepartment(item.id)}
            >
              {item.name}
            </button>
          ))}
        </div>

        <div className="table-scroll goal-table-wrap">
          <table className="goal-table">
            <thead>
              <tr>
                <th>Ay</th>
                <th>Önceki yıl net satış</th>
                <th>Hedef</th>
                <th>Hedef üstü eşik</th>
                <th>Gerçekleşme</th>
                <th>Fark</th>
                <th>Gerçekleşme</th>
                <th>Bant</th>
                <th>Oran</th>
                <th>Net havuz</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.department}-${row.month}`}>
                  <th>{row.monthName}<small>Hedef değişimi %{pct.format(row.growthPct)}</small></th>
                  <td>{money.format(row.priorNetSales)} TL</td>
                  <td>{money.format(row.target)} TL</td>
                  <td>{money.format(row.stretchTarget)} TL</td>
                  <td>{money.format(row.actual)} TL</td>
                  <td className={row.difference >= 0 ? "positive" : "negative"}>{money.format(row.difference)} TL</td>
                  <td>{row.achievementPct === null ? "—" : `%${pct.format(row.achievementPct)}`}</td>
                  <td><span className={bandClass(row.band)}><span />{bandLabel(row.band)}</span></td>
                  <td>%{pct.format(row.appliedRate)}</td>
                  <td className="positive goal-share">{money.format(row.pool)} TL</td>
                </tr>
              ))}
              {!rows.length && (
                <tr><td colSpan="10" className="empty-state">Bu yıl için departman hedef satırı hazır değil.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="goal-footnote">
          <IconTargetArrow size={17} />
          <p>Hedef altındaki aylar dağıtımdan muaftır. Hedef tutarsa temkinli, hedef üstü eşik aşılırsa büyüme oranı uygulanır.</p>
          <button onClick={onBack}>Havuzu aç <IconChevronRight size={16} /></button>
        </div>
      </section>
    </main>
  );
}
