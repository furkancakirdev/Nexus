import { useEffect, useMemo, useState } from "react";
import {
  IconAdjustments,
  IconAlertTriangle,
  IconBell,
  IconBuildingBank,
  IconCheck,
  IconChevronRight,
  IconDatabase,
  IconHistory,
  IconLock,
  IconRefresh,
  IconScale,
  IconSettings,
  IconShieldCheck,
  IconTargetArrow,
  IconUserPlus,
  IconEdit,
  IconTrash,
  IconX,
  IconUsers,
} from "@tabler/icons-react";
import { DEFAULT_SETTINGS } from "../shared/settingsPolicy.mjs";

const tabs = [
  { id: "people", label: "Personel & Paylar", description: "Katsayı ve dağıtım", icon: IconUsers },
  { id: "policy", label: "Politika & Havuz", description: "Oranlar ve dönem kuralları", icon: IconBuildingBank },
  { id: "cost", label: "Maliyet & Veri", description: "Kapsam ve doğrulama", icon: IconDatabase },
  { id: "goals", label: "Hedefler & Dağıtım", description: "Departman hedef ve oranları", icon: IconTargetArrow },
  { id: "approval", label: "Onay & Yetki", description: "Kapanış ve erişim", icon: IconShieldCheck },
];

function Field({ label, help, children }) {
  return <label className="settings-field"><span>{label}</span>{children}{help && <small>{help}</small>}</label>;
}

function Toggle({ checked, onChange, label, help }) {
  return (
    <label className="toggle-row">
      <span><strong>{label}</strong>{help && <small>{help}</small>}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="toggle-ui" aria-hidden="true"><span /></span>
    </label>
  );
}

function NumberInput({ value, onChange, min = 0, max, suffix }) {
  return (
    <span className="number-input">
      <input type="number" value={value} min={min} max={max} onChange={(event) => onChange(Number(event.target.value))} />
      {suffix && <b>{suffix}</b>}
    </span>
  );
}

const EMPTY_EMPLOYEE = {
  name: "", title: "", department: "", status: "manager", included: true,
  salaryCoefficient: 1, fixedShareRate: 0, approvalStatus: "Yönetici Onayı",
};

export function SettingsPage({ settings, onSave, connection, mode, annualProfit, annualPool, employees = [], onSaveEmployees, onBack }) {
  const [draft, setDraft] = useState(settings);
  const [activeTab, setActiveTab] = useState("policy");
  const [message, setMessage] = useState("");
  const [employeeEditor, setEmployeeEditor] = useState(null);

  useEffect(() => setDraft(settings), [settings]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  const projectedPool = annualPool;
  const targetValues = Object.values(draft.departmentTargets || {}).flatMap(
    (target) => [target?.growthPct, target?.stretchPct],
  );

  const validation = useMemo(() => ({
    rateOrder: draft.rates.conservative <= draft.rates.growth,
    coverage: draft.minimumCoverage >= 60 && draft.minimumCoverage <= 100,
    pilotRates: Object.values(draft.pilotCardCostRates || {}).every((rate) => Number(rate) >= 0 && Number(rate) <= 100),
    targets: targetValues.every((value, index) => (
      Number.isFinite(value)
      && (index % 2 === 0 ? value >= -100 && value <= 300 : value >= 0 && value <= 100)
    )),
  }), [draft, targetValues]);
  const valid = Object.values(validation).every(Boolean);
  const fixedShareTotal = employees.reduce((sum, employee) => sum + Number(employee.fixedShareRate || 0), 0);

  const set = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const setRate = (key, value) => setDraft((current) => ({ ...current, rates: { ...current.rates, [key]: value } }));
  const setPilotRate = (key, value) => setDraft((current) => ({ ...current, pilotCardCostRates: { ...current.pilotCardCostRates, [key]: value } }));
  const setDepartmentTarget = (department, key, value) => setDraft((current) => ({
    ...current,
    departmentTargets: {
      ...current.departmentTargets,
      [department]: {
        ...current.departmentTargets[department],
        [key]: value,
      },
    },
  }));

  const save = async () => {
    if (!valid) { setMessage("Kaydetmeden önce işaretli doğrulama hatalarını düzeltin."); return; }
    try {
      await onSave(draft);
      setMessage("Ayarlar Marlin Nexus'a kaydedildi. CPM verisine dokunulmadı.");
    } catch {
      setMessage("Ayarlar kaydedilemedi. Bağlantıyı kontrol edip yeniden deneyin.");
    }
  };

  const reset = () => {
    setDraft(DEFAULT_SETTINGS);
    setMessage("Varsayılan politika taslağa yüklendi. Kaydetmeden kalıcı olmaz.");
  };

  const openEmployee = (employee, index) => setEmployeeEditor({
    index,
    value: { ...EMPTY_EMPLOYEE, ...employee },
  });

  const saveEmployee = () => {
    const person = employeeEditor?.value;
    if (!person?.name.trim()) { setMessage("Personel adı zorunludur."); return; }
    const otherFixedTotal = employees.reduce((sum, employee, index) => index === employeeEditor.index ? sum : sum + Number(employee.fixedShareRate || 0), 0);
    if (otherFixedTotal + Number(person.fixedShareRate || 0) > 100) { setMessage("Sabit pay oranlarının toplamı %100'ü geçemez."); return; }
    const normalized = {
      ...person,
      id: person.id || `person-${Date.now()}`,
      name: person.name.trim(),
      salaryCoefficient: Math.max(0, Number(person.salaryCoefficient || 0)),
      fixedShareRate: Math.max(0, Math.min(100, Number(person.fixedShareRate || 0))),
    };
    const next = employeeEditor.index === -1
      ? [...employees, normalized]
      : employees.map((employee, index) => index === employeeEditor.index ? normalized : employee);
    onSaveEmployees(next);
    setEmployeeEditor(null);
    setMessage("Personel ve pay parametreleri uygulamaya kaydedildi. CPM'e yazılmadı.");
  };

  const deleteEmployee = (index) => {
    onSaveEmployees(employees.filter((_, employeeIndex) => employeeIndex !== index));
    setMessage("Personel kaydı uygulama listesinden çıkarıldı. CPM'e yazılmadı.");
  };

  return (
    <main className="page settings-page" id="top">
      <section className="settings-heading">
        <div>
          <p className="eyebrow">Yönetim merkezi</p>
          <h1>Ayarlar</h1>
          <p>Havuz modelinin tüm iş kurallarını tek yerden yönetin.</p>
        </div>
        <div className="settings-actions">
          <span className={dirty ? "draft-badge draft-badge--dirty" : "draft-badge"}>{dirty ? "Kaydedilmemiş değişiklik" : "Tüm değişiklikler kayıtlı"}</span>
          <button className="secondary-button" onClick={reset}><IconRefresh size={17} /> Varsayılana dön</button>
          <button className="primary-action" onClick={save} disabled={!dirty || !valid}><IconCheck size={17} /> Ayarları kaydet</button>
        </div>
      </section>

      {message && <div className={valid ? "settings-message" : "settings-message settings-message--error"} role="status">{message}<button onClick={() => setMessage("")} aria-label="Bildirimi kapat">×</button></div>}

      <div className="settings-layout">
        <aside className="settings-nav" aria-label="Ayar bölümleri">
          {tabs.map(({ id, label, description, icon: Icon }) => (
            <button key={id} className={activeTab === id ? "settings-nav__item active" : "settings-nav__item"} onClick={() => setActiveTab(id)}>
              <Icon size={20} /><span><strong>{label}</strong><small>{description}</small></span><IconChevronRight size={17} />
            </button>
          ))}
          <div className="settings-source-card">
            <div><IconLock size={18} /><strong>CPM Salt Okunur</strong></div>
            <p>Bu ekrandaki hiçbir işlem CPM tablolarına yazmaz.</p>
            <span className={connection.connected ? "connection-live" : "connection-demo"}>{connection.connected ? "Bağlantı aktif" : "Pilot bağlantı"}</span>
          </div>
        </aside>

        <section className="settings-content">
          {activeTab === "people" && (
            <div className="settings-section">
              <div className="settings-section__title"><IconUsers /><div><h2>Personel, Katsayı ve Paylar</h2><p>Dağıtıma katılımı, ücret katsayısını ve varsa sabit payı yönetin.</p></div></div>
              <div className="people-toolbar">
                <div className="people-metrics">
                  <span><small>Personel</small><strong>{employees.length}</strong></span>
                  <span><small>Dağıtıma dahil</small><strong>{employees.filter((employee) => employee.included !== false).length}</strong></span>
                  <span className={fixedShareTotal > 100 ? "bad" : ""}><small>Sabit pay toplamı</small><strong>%{fixedShareTotal.toLocaleString("tr-TR")}</strong></span>
                  <span><small>Dağıtılabilir havuz</small><strong>{new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 }).format(annualPool)} TL</strong></span>
                </div>
                <button className="primary-action" onClick={() => openEmployee(EMPTY_EMPLOYEE, -1)}><IconUserPlus size={17} /> Yeni personel</button>
              </div>
              <div className="settings-card">
                <h3>Otomatik dağıtım yöntemi</h3>
                <div className="form-grid form-grid--2">
                  <Field label="Paylaşım yöntemi" help="Sabit pay tanımlanan personeller ayrıldıktan sonra kalan havuzun nasıl paylaşılacağını belirler.">
                    <select value={draft.allocationMethod} onChange={(event) => set("allocationMethod", event.target.value)}>
                      <option value="coefficient">Katsayı ağırlıklı dağıtım</option>
                      <option value="equal">Hak kazananlara eşit dağıtım</option>
                    </select>
                  </Field>
                  <div className="formula-card"><IconScale /><div><strong>{draft.allocationMethod === "equal" ? "Herkes aynı ağırlıkta" : "Katsayı payı belirler"}</strong><p>{draft.allocationMethod === "equal" ? "Dağıtıma dahil tüm personel, sabit paylar sonrasında kalan havuzdan eşit pay alır." : "Katsayısı yüksek personel kalan havuzdan oransal olarak daha yüksek pay alır."}</p></div></div>
                </div>
              </div>
              <div className="people-table-wrap">
                <table className="people-table">
                  <thead><tr><th>Personel</th><th>Durum</th><th>Ücret katsayısı</th><th>Departman</th><th>Sabit pay</th><th aria-label="İşlemler" /></tr></thead>
                  <tbody>
                    {employees.map((employee, index) => (
                      <tr key={employee.id || `${employee.name}-${index}`}>
                        <td><strong>{employee.name}</strong><small>{employee.title || "—"} · {employee.department || "Departman yok"}</small></td>
                        <td><span className={employee.included === false ? "person-status off" : "person-status"}>{employee.included === false ? "Hariç" : "Dahil"}</span></td>
                        <td>{Number(employee.salaryCoefficient || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td>{employee.department || "—"}</td>
                        <td>{Number(employee.fixedShareRate || 0) > 0 ? `%${employee.fixedShareRate}` : "Otomatik"}</td>
                        <td><div className="table-actions"><button onClick={() => openEmployee(employee, index)} aria-label={`${employee.name} düzenle`}><IconEdit size={17} /></button><button className="danger" onClick={() => deleteEmployee(index)} aria-label={`${employee.name} sil`}><IconTrash size={17} /></button></div></td>
                      </tr>
                    ))}
                    {!employees.length && <tr><td colSpan="6" className="empty-people">Henüz personel eklenmedi.</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="formula-card"><IconScale /><div><strong>Sabit ve otomatik dağıtım birlikte çalışır</strong><p>Sabit paylar önce havuzdan ayrılır. Kalan tutar seçiminize göre katsayı ağırlıklı veya hak kazanan personele eşit dağıtılır; ayrıca süre bazlı bir çarpan uygulanmaz.</p></div></div>
            </div>
          )}

          {activeTab === "policy" && (
            <div className="settings-section">
              <div className="settings-section__title"><IconBuildingBank /><div><h2>Politika ve Havuz</h2><p>Dağıtım oranlarını, rezervi ve dönem kurallarını tanımlayın.</p></div></div>
              <div className="settings-card">
                <h3>Otomatik hedef bandı</h3>
                <p className="settings-card__intro">Aylık dağıtım oranı departmanın gerçekleşmesine göre otomatik seçilir. Hedef altı aylar havuz üretmez.</p>
                <div className="readonly-banner"><IconTargetArrow /><div><strong>Hedef altı → Muaf · Hedef → Temkinli · Hedef üstü → Büyüme</strong><p>Oranlar ve departman eşikleri Hedefler &amp; Dağıtım bölümünde yönetilir.</p></div><span>Otomatik</span></div>
              </div>
              <div className="settings-card">
                <h3>Dağıtım zamanlaması</h3>
                <p className="settings-card__intro">Yıllık net havuz, aylık departman hedef bantlarının toplamıdır. Bu bölüm yalnız ödeme takvimini belirler.</p>
                <div className="form-grid form-grid--2">
                  <Field label="Ödeme ayı"><select value={draft.distributionMonth} onChange={(e) => set("distributionMonth", Number(e.target.value))}>{[1,2,3,4].map(m => <option key={m} value={m}>{["Ocak","Şubat","Mart","Nisan"][m-1]}</option>)}</select></Field>
                </div>
              </div>
            </div>
          )}

          {activeTab === "cost" && (
            <div className="settings-section">
              <div className="settings-section__title"><IconDatabase /><div><h2>Maliyet ve Veri Güveni</h2><p>CPM verisinin hangi koşullarda kesinleşmiş sayılacağını belirleyin.</p></div></div>
              <div className="settings-card">
                <div className="form-grid form-grid--3">
                  <Field label="Maliyet yöntemi" help="STOK_MALIYET kullanılmaz; önce satıştan önceki son, yoksa satıştan sonraki en yakın aktif alım faturası kullanılır."><select value="lastPurchase" disabled><option value="lastPurchase">Doğrulanabilir net alım faturası</option></select></Field>
                  <Field label="Asgari maliyet kapsamı"><NumberInput value={draft.minimumCoverage} onChange={(v) => set("minimumCoverage", v)} min={60} max={100} suffix="%" /></Field>
                  <Field label="Kur dönüşüm kuralı"><select value={draft.exchangeRateRule} onChange={(e) => set("exchangeRateRule", e.target.value)}><option value="document">Evrak tarihi kuru</option><option value="monthEnd">Ay sonu kuru</option><option value="centralBank">TCMB satış kuru</option></select></Field>
                </div>
                {!validation.coverage && <p className="field-error"><IconAlertTriangle size={15} /> Kapsam eşiği %60–%100 arasında olmalı.</p>}
              </div>
              <div className="settings-card">
                <h3>Pilot kart maliyet oranları</h3>
                <p className="settings-card__intro">Girilen oran net satış tutarının maliyet kabul edilecek bölümüdür. Kalan bölüm doğrudan kâr olarak hesaplanır.</p>
                <div className="pilot-rate-grid">
                  {[
                    ["labor", "İŞÇİLİK"],
                    ["srf", "SRF"],
                    ["tsr", "TSR"],
                    ["road", "YOL"],
                  ].map(([key, label]) => {
                    const costRate = Number(draft.pilotCardCostRates?.[key] ?? 0);
                    return <div className="pilot-rate-card" key={key}><div><strong>{label}</strong><span>Maliyet %{costRate} · Kâr %{100 - costRate}</span></div><Field label="Maliyet oranı"><NumberInput value={costRate} onChange={(value) => setPilotRate(key, value)} max={100} suffix="%" /></Field></div>;
                  })}
                </div>
                {!validation.pilotRates && <p className="field-error"><IconAlertTriangle size={15} /> Pilot kart oranları %0–%100 arasında olmalı.</p>}
              </div>
              <div className="settings-card settings-card--toggles">
                <Toggle checked={draft.requireManagementApprovalForManualCost} onChange={(v) => set("requireManagementApprovalForManualCost", v)} label="Manuel maliyette yönetim onayı zorunlu" help="Açıksa manuel girilen maliyetler yönetim onayı verilene kadar kesin havuz hesabına alınmaz. Kapalıysa kayıt, kaydedildiği anda hesaplamaya katılabilir." />
              </div>
              <div className="readonly-banner"><IconLock /><div><strong>Faturayla kanıtlanan maliyet ve veri sınırı</strong><p>BARNACLE, SRF oranına bağlıdır. Diğer ürünlerde satıştan önceki son; bu yoksa satıştan sonraki en yakın aktif net alım faturası kullanılır. KOMİSYON, GD-0187, GD-0079 ve PDI kapsam dışıdır; alımı bulunmayan diğer gelir esas kâr ve havuzdan çıkarılır. CPM yalnızca SELECT sorgularıyla okunur.</p></div><span>{mode === "live" ? "Canlı CPM" : "Pilot veri"}</span></div>
            </div>
          )}

          {activeTab === "goals" && (
            <div className="settings-section">
              <div className="settings-section__title"><IconTargetArrow /><div><h2>Departman Hedefleri ve Dağıtım</h2><p>Servis ve Yedek Parça Satış için aylık hedef politikasını yönetin.</p></div></div>
              <div className="settings-card">
                <h3>Geçen yılın aynı ayına göre departman hedefleri</h3>
                <p className="settings-card__intro">Hedef büyümesi önceki yılın aynı ay net satışına uygulanır. Hedef üstü eşik, büyüme dağıtım bandını açar.</p>
                <div className="department-target-settings">
                  {[
                    ["service", "Servis"],
                    ["parts", "Yedek Parça Satış"],
                  ].map(([id, label]) => (
                    <div className="department-target-row" key={id}>
                      <strong>{label}</strong>
                      <Field label="Hedef büyümesi"><NumberInput value={draft.departmentTargets[id].growthPct} onChange={(value) => setDepartmentTarget(id, "growthPct", value)} min={-100} max={300} suffix="%" /></Field>
                      <Field label="Hedef üstü eşik"><NumberInput value={draft.departmentTargets[id].stretchPct} onChange={(value) => setDepartmentTarget(id, "stretchPct", value)} min={0} max={100} suffix="%" /></Field>
                    </div>
                  ))}
                </div>
                {!validation.targets && <p className="field-error"><IconAlertTriangle size={15} /> Hedef büyümesi %-100–%300, hedef üstü eşik %0–%100 aralığında olmalı.</p>}
              </div>
              <div className="settings-card">
                <h3>Havuz dağıtım oranları</h3>
                <div className="form-grid form-grid--3">
                  <Field label="Temkinli oran" help="Hedefe ulaşan fakat hedef üstü eşiği geçmeyen aylar."><NumberInput value={draft.rates.conservative} onChange={(value) => setRate("conservative", value)} min={0} max={100} suffix="%" /></Field>
                  <Field label="Büyüme oranı" help="Hedef üstü eşiğe ulaşan aylar."><NumberInput value={draft.rates.growth} onChange={(value) => setRate("growth", value)} min={0} max={100} suffix="%" /></Field>
                  <Field label="Risk rezervi" help="Hesaplanan aylık havuzdan ayrılır."><NumberInput value={draft.reserveRate} onChange={(value) => set("reserveRate", value)} min={0} max={100} suffix="%" /></Field>
                </div>
                {!validation.rateOrder && <p className="field-error"><IconAlertTriangle size={15} /> Büyüme oranı temkinli orandan düşük olamaz.</p>}
              </div>
              <div className="formula-card"><IconScale /><div><strong>Departman bazlı otomatik formül</strong><p>Hedef = önceki yıl aynı ay net satışı × (1 + büyüme). Hedef tutmayan ay dağıtımdan muaftır; kişi hedefi veya performans puanı kullanılmaz.</p></div></div>
            </div>
          )}

          {activeTab === "approval" && (
            <div className="settings-section">
              <div className="settings-section__title"><IconShieldCheck /><div><h2>Yönetim Onayı ve Denetim</h2><p>Havuzun tek yetkili onay adımını ve kayıt güvenliğini yönetin.</p></div></div>
              <div className="settings-card">
                <div className="form-grid form-grid--3">
                  <Field label="Aylık kapanış günü"><NumberInput value={draft.monthlyCloseDay} onChange={(v) => set("monthlyCloseDay", v)} min={1} max={28} suffix=". gün" /></Field>
                  <Field label="Onay mercii" help="Şirket yapısına uygun tek onay adımıdır."><select value="management" disabled><option value="management">Yönetim</option></select></Field>
                </div>
              </div>
              <div className="settings-card settings-card--toggles">
                <Toggle checked={draft.boardApproval} onChange={(v) => set("boardApproval", v)} label="Yönetim nihai dağıtım onayı" />
                <Toggle checked={draft.lockAfterApproval} onChange={(v) => set("lockAfterApproval", v)} label="Nihai onay sonrası dönemi kilitle" />
                <Toggle checked={draft.auditLog} onChange={(v) => set("auditLog", v)} label="Değişiklik ve onay günlüğü tut" />
                <Toggle checked={draft.monthlyNotifications} onChange={(v) => set("monthlyNotifications", v)} label="Aylık kapanış bildirimleri" />
              </div>
              <div className="readonly-banner"><IconShieldCheck/><div><strong>Tek aşamalı yetki</strong><p>Veri riskleri görünür kalır ancak departman bazlı ara onay oluşturulmaz. Yönetim, maliyet kararlarını ve dönem havuzunu aynı merkezden onaylar.</p></div><span>Yönetim</span></div>
            </div>
          )}
        </section>

        <aside className="settings-summary">
          <div className="settings-summary__head"><IconSettings size={20} /><strong>Canlı Önizleme</strong></div>
          <dl>
            <div><dt>Dağıtıma esas kâr</dt><dd>{new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(annualProfit)} TL</dd></div>
            <div><dt>Temkinli / büyüme</dt><dd>%{draft.rates.conservative} / %{draft.rates.growth}</dd></div>
            <div><dt>Risk rezervi</dt><dd>%{draft.reserveRate}</dd></div>
            <div className="summary-emphasis"><dt>Tahmini net havuz</dt><dd>{new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(projectedPool)} TL</dd></div>
          </dl>
          <div className="summary-checks">
            <span className={validation.rateOrder ? "ok" : "bad"}>{validation.rateOrder ? <IconCheck /> : <IconAlertTriangle />} Dağıtım oranları</span>
            <span className={validation.targets ? "ok" : "bad"}>{validation.targets ? <IconCheck /> : <IconAlertTriangle />} Departman hedefleri</span>
            <span className={validation.coverage ? "ok" : "bad"}>{validation.coverage ? <IconCheck /> : <IconAlertTriangle />} Maliyet eşiği</span>
          </div>
          <div className="audit-preview"><IconHistory /><div><strong>Son kayıt</strong><p>{localStorage.getItem("marlin-settings-saved-at") || "Henüz kayıt yapılmadı"}</p></div></div>
          <button className="back-to-ledger" onClick={onBack}>Havuza dön</button>
        </aside>
      </div>

      {employeeEditor && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setEmployeeEditor(null)}>
          <section className="modal employee-modal" role="dialog" aria-modal="true" aria-labelledby="employee-modal-title">
            <button className="modal-close" onClick={() => setEmployeeEditor(null)} aria-label="Kapat"><IconX size={19} /></button>
            <h2 id="employee-modal-title">{employeeEditor.index === -1 ? "Yeni personel" : "Personeli düzenle"}</h2>
            <p className="employee-modal__lead">Bu kayıt yalnızca Havuz uygulamasında tutulur; CPM personel kartını değiştirmez.</p>
            <div className="form-grid form-grid--2">
              <Field label="Ad soyad"><input value={employeeEditor.value.name} onChange={(e) => setEmployeeEditor((current) => ({ ...current, value: { ...current.value, name: e.target.value } }))} autoFocus /></Field>
              <Field label="Unvan"><input value={employeeEditor.value.title} onChange={(e) => setEmployeeEditor((current) => ({ ...current, value: { ...current.value, title: e.target.value } }))} /></Field>
              <Field label="Departman"><input value={employeeEditor.value.department} onChange={(e) => setEmployeeEditor((current) => ({ ...current, value: { ...current.value, department: e.target.value } }))} /></Field>
              <Field label="Çalışan durumu"><select value={employeeEditor.value.status} onChange={(e) => setEmployeeEditor((current) => ({ ...current, value: { ...current.value, status: e.target.value } }))}><option value="manager">Yönetici</option><option value="employee">Çalışan</option><option value="departed">Ayrıldı</option></select></Field>
              <Field label="Ücret katsayısı"><NumberInput value={employeeEditor.value.salaryCoefficient} onChange={(value) => setEmployeeEditor((current) => ({ ...current, value: { ...current.value, salaryCoefficient: value } }))} max={10} /></Field>
              <Field label="Sabit havuz payı" help="0 bırakılırsa otomatik formül kullanılır."><NumberInput value={employeeEditor.value.fixedShareRate} onChange={(value) => setEmployeeEditor((current) => ({ ...current, value: { ...current.value, fixedShareRate: value } }))} max={100} suffix="%" /></Field>
            </div>
            <Toggle checked={employeeEditor.value.included} onChange={(value) => setEmployeeEditor((current) => ({ ...current, value: { ...current.value, included: value } }))} label="Dağıtıma dahil" help="Kapalıysa kişi hesaplamaya ve havuz dağıtımına katılmaz." />
            <div className="employee-modal__actions"><button className="secondary-button" onClick={() => setEmployeeEditor(null)}>Vazgeç</button><button className="primary-action" onClick={saveEmployee}><IconCheck size={17} /> Personeli kaydet</button></div>
          </section>
        </div>
      )}
    </main>
  );
}
