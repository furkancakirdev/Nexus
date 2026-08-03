import React, { useState, useEffect } from "react";
import { fetchEmployees, fetchLeaveBalance, fetchLeaveRequests, createLeaveRequest, approveLeaveRequest, rejectLeaveRequest, uploadDocument } from "./api.js";

export function LeavePage() {
  const [employees, setEmployees] = useState([]);
  const [selectedEmpId, setSelectedEmpId] = useState("");
  const [balance, setBalance] = useState(null);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);

  const [formData, setFormData] = useState({
    startDate: "2026-08-10",
    endDate: "2026-08-14",
    workDaysCount: 5,
    reason: "Yıllık İzin"
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const emps = await fetchEmployees();
      setEmployees(emps.employees || []);
      if (emps.employees.length > 0 && !selectedEmpId) {
        setSelectedEmpId(emps.employees[0].id);
      }
      const reqs = await fetchLeaveRequests();
      setRequests(reqs.requests || []);
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
      fetchLeaveBalance(selectedEmpId)
        .then(setBalance)
        .catch(err => console.error(err));
    }
  }, [selectedEmpId]);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      let documentId = null;
      let documentName = null;
      if (selectedFile) {
        const doc = await uploadDocument(selectedFile);
        documentId = doc.id;
        documentName = doc.originalName;
      }

      await createLeaveRequest({
        employeeId: selectedEmpId,
        leaveTypeId: "lt-annual",
        documentId,
        documentName,
        ...formData
      });
      setShowModal(false);
      setSelectedFile(null);
      loadData();
      if (selectedEmpId) {
        const b = await fetchLeaveBalance(selectedEmpId);
        setBalance(b);
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleApprove = async (id) => {
    try {
      await approveLeaveRequest(id);
      loadData();
      if (selectedEmpId) {
        const b = await fetchLeaveBalance(selectedEmpId);
        setBalance(b);
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleReject = async (id) => {
    const reason = prompt("Red gerekçesi giriniz:");
    if (reason === null) return;
    try {
      await rejectLeaveRequest(id, reason);
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="hr-module-page">
      <div className="hr-page-header">
        <div>
          <h2>İzin Yönetimi &amp; Hak Ediş Defteri</h2>
          <p className="subtext">4857 sayılı İş Kanunu uyumlu bakiye defteri ve onay akışları</p>
        </div>
        <button className="btn primary-btn" onClick={() => setShowModal(true)}>
          + Yeni İzin Talebi
        </button>
      </div>

      <div className="hr-filter-bar">
        <label>Çalışan Seçiniz: </label>
        <select value={selectedEmpId} onChange={(e) => setSelectedEmpId(e.target.value)}>
          {employees.map(e => (
            <option key={e.id} value={e.id}>{e.name} ({e.department})</option>
          ))}
        </select>
      </div>

      {balance && (
        <div className="metrics-grid">
          <div className="metric-card">
            <span className="metric-label">Toplam Hak Ediş</span>
            <span className="metric-value">{balance.entitledDays} Gün</span>
          </div>
          <div className="metric-card">
            <span className="metric-label">Kullanılan İzin</span>
            <span className="metric-value text-warning">{balance.consumedDays} Gün</span>
          </div>
          <div className="metric-card highlight">
            <span className="metric-label">Kalan İzin Bakiyesi</span>
            <span className="metric-value text-success">{balance.remainingDays} Gün</span>
          </div>
        </div>
      )}

      <h3>İzin Talepleri</h3>
      <div className="table-responsive">
        <table className="data-table">
          <thead>
            <tr>
              <th>Çalışan</th>
              <th>Tarih Aralığı</th>
              <th>İzin Gün</th>
              <th>Açıklama</th>
              <th>Belge</th>
              <th>Durum</th>
              <th>İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {requests.map(r => {
              const emp = employees.find(e => e.id === r.employeeId);
              return (
                <tr key={r.id}>
                  <td><strong>{emp ? emp.name : r.employeeId}</strong></td>
                  <td>{r.startDate} — {r.endDate}</td>
                  <td>{r.workDaysCount} gün</td>
                  <td>{r.reason || "-"}</td>
                  <td>
                    {r.documentId ? (
                      <a href={`/api/hr/documents/${r.documentId}`} target="_blank" rel="noreferrer">
                        {r.documentName || "Belgeyi Gör"}
                      </a>
                    ) : "-"}
                  </td>
                  <td>
                    <span className={`badge ${
                      r.status === "approved" ? "badge-success" :
                      r.status === "rejected" ? "badge-danger" : "badge-warning"
                    }`}>
                      {r.status === "approved" ? "Onaylandı" :
                       r.status === "rejected" ? "Reddedildi" : "Bekliyor"}
                    </span>
                  </td>
                  <td>
                    {r.status === "pending" && (
                      <div className="action-buttons">
                        <button className="btn sm-btn success-btn" onClick={() => handleApprove(r.id)}>Onayla</button>
                        <button className="btn sm-btn danger-btn" onClick={() => handleReject(r.id)}>Reddet</button>
                      </div>
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
            <h3>İzin Talebi Oluştur</h3>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label>Başlangıç Tarihi</label>
                <input
                  type="date"
                  required
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Bitiş Tarihi</label>
                <input
                  type="date"
                  required
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>İş Günü Sayısı</label>
                <input
                  type="number"
                  required
                  value={formData.workDaysCount}
                  onChange={(e) => setFormData({ ...formData, workDaysCount: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Gerekçe / Açıklama</label>
                <input
                  type="text"
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Belge Yükle (Sağlık Raporu vb.)</label>
                <input
                  type="file"
                  onChange={(e) => setSelectedFile(e.target.files[0])}
                  accept=".pdf,image/*"
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
