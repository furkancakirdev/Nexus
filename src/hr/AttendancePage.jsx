import React, { useState, useEffect } from "react";
import { fetchEmployees, fetchAttendanceRecords, recordAttendance, fetchTimesheetSummary, uploadPdksFile } from "./api.js";

export function AttendancePage() {
  const [employees, setEmployees] = useState([]);
  const [selectedEmpId, setSelectedEmpId] = useState("");
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showPdksModal, setShowPdksModal] = useState(false);
  const [pdksFile, setPdksFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
    checkIn: "08:30",
    checkOut: "17:30",
    breakMinutes: 60
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const emps = await fetchEmployees();
      setEmployees(emps.employees || []);
      if (emps.employees.length > 0 && !selectedEmpId) {
        setSelectedEmpId(emps.employees[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedEmpId) {
      fetchAttendanceRecords({ employeeId: selectedEmpId })
        .then(res => setRecords(res.records || []))
        .catch(console.error);

      fetchTimesheetSummary({ employeeId: selectedEmpId, month: 8, year: 2026 })
        .then(res => setSummary(res.summary))
        .catch(console.error);
    }
  }, [selectedEmpId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await recordAttendance({
        employeeId: selectedEmpId,
        ...formData
      });
      setShowModal(false);
      const res = await fetchAttendanceRecords({ employeeId: selectedEmpId });
      setRecords(res.records || []);
    } catch (err) {
      alert(err.message);
    }
  };

  const handlePdksSubmit = async (e) => {
    e.preventDefault();
    if (!pdksFile) return;
    setUploading(true);
    try {
      const result = await uploadPdksFile(pdksFile);
      alert(`PDKS Yükleme Başarılı!\nİşlenen Kayıt: ${result.successCount}\nHatalar: ${result.errorCount}`);
      setShowPdksModal(false);
      setPdksFile(null);
      if (selectedEmpId) {
        const res = await fetchAttendanceRecords({ employeeId: selectedEmpId });
        setRecords(res.records || []);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="hr-module-page">
      <div className="hr-page-header">
        <div>
          <h2>Puantaj &amp; Zaman Kaydı</h2>
          <p className="subtext">Vardiya giriş/çıkış takibi, mola düşümü ve aylık çalışma saati hesabı</p>
        </div>
        <div>
          <button className="btn secondary-btn" style={{ marginRight: "10px" }} onClick={() => setShowPdksModal(true)}>
            + PDKS Dosyası Yükle (.csv)
          </button>
          <button className="btn primary-btn" onClick={() => setShowModal(true)}>
            + Giriş/Çıkış Kaydı Ekle
          </button>
        </div>
      </div>

      <div className="hr-filter-bar">
        <label>Çalışan Seçiniz: </label>
        <select value={selectedEmpId} onChange={(e) => setSelectedEmpId(e.target.value)}>
          {employees.map(e => (
            <option key={e.id} value={e.id}>{e.name} ({e.department})</option>
          ))}
        </select>
      </div>

      {summary && (
        <div className="metrics-grid">
          <div className="metric-card">
            <span className="metric-label">Toplam Çalışılan Saat</span>
            <span className="metric-value">{summary.totalWorkedHours} Saat</span>
          </div>
          <div className="metric-card">
            <span className="metric-label">Normal Gün Sayısı</span>
            <span className="metric-value text-success">{summary.normalDays} Gün</span>
          </div>
          <div className="metric-card">
            <span className="metric-label">Geç Gelinen Günler</span>
            <span className="metric-value text-warning">{summary.lateDays} Gün</span>
          </div>
        </div>
      )}

      <h3>Günlük Giriş / Çıkış Logları</h3>
      <div className="table-responsive">
        <table className="data-table">
          <thead>
            <tr>
              <th>Tarih</th>
              <th>Giriş Saati</th>
              <th>Çıkış Saati</th>
              <th>Mola (Dakika)</th>
              <th>Net Çalışma</th>
              <th>Durum</th>
            </tr>
          </thead>
          <tbody>
            {records.map(r => (
              <tr key={r.id}>
                <td><strong>{r.date}</strong></td>
                <td>{r.checkIn || "-"}</td>
                <td>{r.checkOut || "-"}</td>
                <td>{r.breakMinutes} dk</td>
                <td>{Math.round((r.workedMinutes / 60) * 10) / 10} Saat</td>
                <td>
                  <span className={`badge ${
                    r.status === "normal" ? "badge-success" :
                    r.status === "late" ? "badge-warning" : "badge-danger"
                  }`}>
                    {r.status === "normal" ? "Normal" :
                     r.status === "late" ? "Geç Geldi" : "Eksik Kayıt"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h3>Puantaj Kaydı Ekle</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Tarih</label>
                <input
                  type="date"
                  required
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Giriş Saati</label>
                <input
                  type="time"
                  required
                  value={formData.checkIn}
                  onChange={(e) => setFormData({ ...formData, checkIn: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Çıkış Saati</label>
                <input
                  type="time"
                  required
                  value={formData.checkOut}
                  onChange={(e) => setFormData({ ...formData, checkOut: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Mola Süresi (Dakika)</label>
                <input
                  type="number"
                  required
                  value={formData.breakMinutes}
                  onChange={(e) => setFormData({ ...formData, breakMinutes: e.target.value })}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn secondary-btn" onClick={() => setShowModal(false)}>İptal</button>
                <button type="submit" className="btn primary-btn">Kaydet</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPdksModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h3>Toplu PDKS Yükleme</h3>
            <p className="subtext" style={{ marginBottom: "1rem" }}>
              Desteklenen Format: CSV (Virgülle Ayrılmış)<br/>
              Sütunlar: EmployeeID, Date, CheckIn, CheckOut
            </p>
            <form onSubmit={handlePdksSubmit}>
              <div className="form-group">
                <label>PDKS CSV Dosyası</label>
                <input
                  type="file"
                  required
                  accept=".csv"
                  onChange={(e) => setPdksFile(e.target.files[0])}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn secondary-btn" onClick={() => setShowPdksModal(false)} disabled={uploading}>
                  İptal
                </button>
                <button type="submit" className="btn primary-btn" disabled={uploading || !pdksFile}>
                  {uploading ? "Yükleniyor..." : "Yükle ve İşle"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
