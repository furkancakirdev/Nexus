import React, { useState, useEffect } from "react";
import { fetchEmployees, fetchOvertimeRequests, createOvertimeRequest, approveOvertimeRequest } from "./api.js";

export function OvertimePage() {
  const [employees, setEmployees] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const [formData, setFormData] = useState({
    employeeId: "",
    date: new Date().toISOString().split("T")[0],
    hours: 3,
    isHoliday: false,
    reason: "Proje / İş Yoğunluğu"
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const emps = await fetchEmployees();
      setEmployees(emps.employees || []);
      if (emps.employees.length > 0 && !formData.employeeId) {
        setFormData(prev => ({ ...prev, employeeId: emps.employees[0].id }));
      }
      const ots = await fetchOvertimeRequests();
      setRequests(ots.overtimes || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await createOvertimeRequest(formData);
      setShowModal(false);
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleApprove = async (id) => {
    try {
      await approveOvertimeRequest(id);
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="hr-module-page">
      <div className="hr-page-header">
        <div>
          <h2>Fazla Mesai Yönetimi</h2>
          <p className="subtext">Haftalık 45 saati aşan (%50 zamlı) ve resmî tatil (%100 zamlı) mesai onayları</p>
        </div>
        <button className="btn primary-btn" onClick={() => setShowModal(true)}>
          + Mesai Talebi Gir
        </button>
      </div>

      <div className="table-responsive">
        <table className="data-table">
          <thead>
            <tr>
              <th>Çalışan</th>
              <th>Tarih</th>
              <th>Mesai Saati</th>
              <th>Katsayı</th>
              <th>Gerekçe</th>
              <th>Durum</th>
              <th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {requests.map(r => {
              const emp = employees.find(e => e.id === r.employeeId);
              return (
                <tr key={r.id}>
                  <td><strong>{emp ? emp.name : r.employeeId}</strong></td>
                  <td>{r.date}</td>
                  <td>{r.hours} Saat</td>
                  <td>
                    <span className={`badge ${r.multiplier === 2.0 ? "badge-danger" : "badge-info"}`}>
                      %{r.multiplier * 100} Zamlı ({r.multiplier}x)
                    </span>
                  </td>
                  <td>{r.reason || "-"}</td>
                  <td>
                    <span className={`badge ${r.status === "approved" ? "badge-success" : "badge-warning"}`}>
                      {r.status === "approved" ? "Onaylandı" : "Bekliyor"}
                    </span>
                  </td>
                  <td>
                    {r.status === "pending" && (
                      <button className="btn sm-btn success-btn" onClick={() => handleApprove(r.id)}>
                        Onayla
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h3>Fazla Mesai Girişi</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Çalışan</label>
                <select
                  value={formData.employeeId}
                  onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                >
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>{e.name} ({e.department})</option>
                  ))}
                </select>
              </div>
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
                <label>Mesai Saati</label>
                <input
                  type="number"
                  step="0.5"
                  required
                  value={formData.hours}
                  onChange={(e) => setFormData({ ...formData, hours: e.target.value })}
                />
              </div>
              <div className="form-group checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    checked={formData.isHoliday}
                    onChange={(e) => setFormData({ ...formData, isHoliday: e.target.checked })}
                  />
                  Hafta / Resmî Tatil Çalışması (%100 Zamlı)
                </label>
              </div>
              <div className="form-group">
                <label>Mesai Gerekçesi</label>
                <input
                  type="text"
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn secondary-btn" onClick={() => setShowModal(false)}>İptal</button>
                <button type="submit" className="btn primary-btn">Talebi Gönder</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
