import React, { useState, useEffect } from "react";
import { fetchPayrollDrafts, generatePayrollDraft, approvePayrollStep } from "./api.js";

export function PayrollPage() {
  const [payroll, setPayroll] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(2026);
  const [selectedMonth, setSelectedMonth] = useState(8);

  const loadPayroll = async () => {
    setLoading(true);
    try {
      const data = await fetchPayrollDrafts({ year: selectedYear, month: selectedMonth });
      if (data.payrolls && data.payrolls.length > 0) {
        setPayroll(data.payrolls[0]);
      } else {
        setPayroll(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayroll();
  }, [selectedYear, selectedMonth]);

  const handleGenerate = async () => {
    try {
      const draft = await generatePayrollDraft(selectedYear, selectedMonth);
      setPayroll(draft);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleApprove = async () => {
    if (!payroll) return;
    try {
      const updated = await approvePayrollStep(payroll.id);
      setPayroll(updated);
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="hr-module-page">
      <div className="hr-page-header">
        <div>
          <h2>Mevzuat Uyumlu Taslak Bordro Engine'i</h2>
          <p className="subtext">2026 SGK tavan/taban, kumulatif Gelir Vergisi dilimleri ve Asgari Ücret Vergi İstisnası hesabı</p>
        </div>
        <div className="header-actions">
          <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))}>
            {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
              <option key={m} value={m}>{m}. Ay</option>
            ))}
          </select>
          <button className="btn primary-btn" onClick={handleGenerate}>
            ⚡ Taslak Bordro Hesapla
          </button>
        </div>
      </div>

      {!payroll ? (
        <div className="empty-state-box">
          <p>{selectedYear} / {selectedMonth}. ay için henüz bordro taslağı hesaplanmamış.</p>
          <button className="btn primary-btn" onClick={handleGenerate}>Şimdi Taslak Bordro Hesapla</button>
        </div>
      ) : (
        <>
          <div className="metrics-grid">
            <div className="metric-card">
              <span className="metric-label">Toplam Brüt Bordro</span>
              <span className="metric-value">{payroll.totalGross?.toLocaleString("tr-TR")} TL</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Toplam SGK Primleri</span>
              <span className="metric-value text-info">{payroll.totalSgk?.toLocaleString("tr-TR")} TL</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Net Gelir Vergisi</span>
              <span className="metric-value text-warning">{payroll.totalTax?.toLocaleString("tr-TR")} TL</span>
            </div>
            <div className="metric-card highlight">
              <span className="metric-label">Toplam Ödenecek Net Ücret</span>
              <span className="metric-value text-success">{payroll.totalNet?.toLocaleString("tr-TR")} TL</span>
            </div>
          </div>

          <div className="payroll-approval-banner">
            <div>
              <h4>Bordro Onay Durumu: <span className={`badge ${
                payroll.status === "finalized" ? "badge-success" :
                payroll.status === "step1_approved" ? "badge-warning" : "badge-secondary"
              }`}>
                {payroll.status === "finalized" ? "Kesinleşti (4-Göz Çift Onaylı)" :
                 payroll.status === "step1_approved" ? "1. Onay Verildi (2. Onay Bekleniyor)" : "Taslak"}
              </span></h4>
              <p className="subtext">
                1. Onay: <strong>{payroll.finalizedBy1 || "Bekliyor"}</strong> | 2. Onay: <strong>{payroll.finalizedBy2 || "Bekliyor"}</strong>
              </p>
            </div>
            {payroll.status !== "finalized" && (
              <button className="btn success-btn" onClick={handleApprove}>
                {payroll.status === "draft" ? "✓ 1. Onayı Ver" : "✓✓ 2. Onayı Ver ve Kesinleştir"}
              </button>
            )}
          </div>

          <h3>Çalışan Bordro Dökümü</h3>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Sicil / Ad Soyad</th>
                  <th>Departman</th>
                  <th>Brüt Maaş</th>
                  <th>Mesai Tutarı</th>
                  <th>SGK Kesintisi (%15)</th>
                  <th>Vergi Matrahı</th>
                  <th>Vergi İstisnası</th>
                  <th>Net Gelir Vergisi</th>
                  <th>Net Ödenecek</th>
                </tr>
              </thead>
              <tbody>
                {(payroll.records || []).map(r => (
                  <tr key={r.employeeId}>
                    <td>
                      <strong>{r.employeeNo}</strong><br />
                      <small>{r.name}</small>
                    </td>
                    <td><span className="badge badge-info">{r.department}</span></td>
                    <td>{r.grossSalary?.toLocaleString("tr-TR")} TL</td>
                    <td>{r.overtimePay > 0 ? `${r.overtimePay.toLocaleString("tr-TR")} TL` : "-"}</td>
                    <td>{(r.sgkWorker + r.unemploymentWorker)?.toLocaleString("tr-TR")} TL</td>
                    <td>{r.monthlyTaxBase?.toLocaleString("tr-TR")} TL</td>
                    <td><span className="text-success">-{r.taxExemption?.toLocaleString("tr-TR")} TL</span></td>
                    <td>{r.netIncomeTax?.toLocaleString("tr-TR")} TL</td>
                    <td><strong>{r.netPay?.toLocaleString("tr-TR")} TL</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
