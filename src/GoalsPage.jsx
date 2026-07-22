import { useMemo, useState } from "react";
import { IconCheck, IconChevronRight, IconLock, IconTargetArrow, IconUsers, IconWallet } from "@tabler/icons-react";
import { calculateEmployeeDistribution } from "./distribution";

const workshopNames = ["Ali Can Yaylalı","Batuhan Batmaz","Cüneyt Yaylalı","Emre Kaya","Erhan Turhan","Halil İbrahim Duru","İbrahim Yayalık","İbrahim Yaylalı","Mehmet Bacak","Mehmet Güven","Mekselina Kebapcı","Melih Çoban","Ömer Bıdan","Sercan Sarıöz","Volkan Özkan"];
const officeNames = ["Furkan Çakır","Emre Erdoğan","Tuğrul Semiz","Bircan Çolak","Can Belikırık","Mehmet Kara"];
const employeeDefaults = { included: true, salaryCoefficient: 1, tenure: 12, fixedShareRate: 0, status: "employee", approvalStatus: "Yönetici Onayı" };
export const PILOT_EMPLOYEES = [
  ...workshopNames.map((name,index)=>({ ...employeeDefaults, id:`workshop-${index+1}`, name, title:"Atölye Teknik Personeli", department:"Atölye Teknik" })),
  ...officeNames.map((name,index)=>({ ...employeeDefaults, id:`office-${index+1}`, name, title:"Ofis Personeli", department:"Ofis" })),
];

const money = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 });

export function GoalsPage({ settings, onSaveSettings, employees, annualPool, year, onBack }) {
  const [companyScore, setCompanyScore] = useState(Number(settings.companyPerformanceScore ?? 100));
  const [departmentScores, setDepartmentScores] = useState({ "Atölye Teknik": 100, "Ofis": 100, ...(settings.departmentPerformanceScores || {}) });
  const [saved, setSaved] = useState(false);
  const calculated = useMemo(() => calculateEmployeeDistribution(employees, settings, annualPool, companyScore, departmentScores), [annualPool, companyScore, departmentScores, employees, settings]);
  const eligible = calculated.filter((employee) => employee.eligible).length;
  const averageScore = calculated.length ? calculated.reduce((sum, employee) => sum + employee.weightedScore, 0) / calculated.length : 0;
  const departments = ["Atölye Teknik", "Ofis"];
  const saveScores = () => {
    onSaveSettings({ ...settings, companyPerformanceScore: companyScore, departmentPerformanceScores: departmentScores });
    setSaved(true);
  };

  return <main className="page goals-page" id="top">
    <section className="page-heading goals-heading"><div><p className="eyebrow">Performans yönetimi</p><h1>Şirket ve Departman Hedefleri</h1><p>Bireysel hedef kullanılmaz. Her personel şirket sonucunu ve bağlı olduğu departmanın ortak sonucunu kullanır.</p></div><div className="pilot-notice"><IconLock size={17}/><span><strong>Uygulama ayarı</strong><small>CPM'e yazılmaz</small></span></div></section>
    <section className="goal-kpis">
      <article><span className="goal-kpi__icon"><IconUsers/></span><div><small>Dağıtıma dahil</small><strong>{eligible} / {employees.length}</strong><p>Personel ayarından belirlenir</p></div></article>
      <article><span className="goal-kpi__icon goal-kpi__icon--green"><IconTargetArrow/></span><div><small>Ortalama birleşik skor</small><strong>%{pct.format(averageScore)}</strong><p>Şirket %{settings.companyWeight} · departman %{settings.teamWeight}</p></div></article>
      <article><span className="goal-kpi__icon goal-kpi__icon--amber"><IconCheck/></span><div><small>Hedef temeli</small><strong>Geçen yıl</strong><p>Aynı ay büyüme/azalışı</p></div></article>
      <article className="goal-kpi--pool"><span className="goal-kpi__icon"><IconWallet/></span><div><small>Tahmini net havuz</small><strong>{money.format(annualPool)} TL</strong><p>{year} temel senaryosu</p></div></article>
    </section>
    <section className="panel goal-workspace">
      <div className="goal-workspace__top"><div><h2>Ortak Gerçekleşme Skorları</h2><p>Bu skorlar aynı departmandaki tüm personele eşit uygulanır.</p></div><button className="primary-action" onClick={saveScores}><IconCheck size={17}/> Skorları kaydet</button></div>
      {saved && <div className="settings-message" role="status">Şirket ve departman skorları kaydedildi.</div>}
      <div className="goal-edit-grid">
        <label><span>Şirket gerçekleşme skoru</span><input type="number" min="0" max="120" value={companyScore} onChange={(event)=>{setCompanyScore(Number(event.target.value));setSaved(false);}}/><small>Tüm personelin birleşik skorunda %{settings.companyWeight} etkilidir.</small></label>
        {departments.map((department)=><label key={department}><span>{department} gerçekleşme skoru</span><input type="number" min="0" max="120" value={departmentScores[department]} onChange={(event)=>{setDepartmentScores({...departmentScores,[department]:Number(event.target.value)});setSaved(false);}}/><small>Bu departmandaki herkes için aynıdır.</small></label>)}
      </div>
      <div className="table-scroll goal-table-wrap"><table className="goal-table"><thead><tr><th>Personel</th><th>Departman</th><th>Şirket</th><th>Departman</th><th>Birleşik skor</th><th>Dağıtım yöntemi</th><th>Tahmini pay</th></tr></thead><tbody>{calculated.map((employee)=><tr key={employee.id}><th><span className="employee-name">{employee.name}</span><small>{employee.title}</small></th><td>{employee.department}</td><td>%{companyScore}</td><td>%{employee.departmentScore}</td><td className={employee.eligible?"positive":"negative"}>%{pct.format(employee.weightedScore)}</td><td>{employee.shareMode}</td><td className={employee.eligible?"positive goal-share":"goal-share muted-share"}>{employee.eligible?`${money.format(employee.projectedShare)} TL`:"—"}</td></tr>)}</tbody></table></div>
      <div className="goal-footnote"><IconTargetArrow size={17}/><p>Hedef tutarları, geçen yılın aynı ayı × (1 + belirlenen büyüme/azalış oranı) olarak oluşturulur. Gerçekleşme skoru hedefe ulaşma derecesidir.</p><button onClick={onBack}>Havuzu aç <IconChevronRight size={16}/></button></div>
    </section>
  </main>;
}
