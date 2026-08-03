import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchEmployees, fetchEmployeeById, saveEmployee, updateEmployee } from "./api.js";

const STATUS_LABELS = {
  active: "Aktif",
  suspended: "Askıda",
  terminated: "Feshedilmiş",
  archived: "Arşivlendi",
};

const EMPTY_FORM = {
  employeeNo: "",
  name: "",
  email: "",
  department: "Servis",
  title: "",
  grossSalary: 45000,
  status: "active",
  managerId: "",
  hireDate: "",
};

function DepartmentSelect({ value, departments, onChange, id }) {
  return (
    <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
      {departments.map((department) => (
        <option key={department} value={department}>{department}</option>
      ))}
    </select>
  );
}

function EmployeeForm({ initial, departments, onSubmit, onCancel, submitLabel }) {
  const [form, setForm] = useState(initial);
  const firstInputRef = useRef(null);

  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  return (
    <form onSubmit={(event) => { event.preventDefault(); onSubmit(form); }}>
      <div className="form-grid">
        <div className="form-group">
          <label htmlFor="emp-no">Sicil No</label>
          <input id="emp-no" type="text" required value={form.employeeNo} onChange={set("employeeNo")} placeholder="Örn: MY-004" ref={firstInputRef} />
        </div>
        <div className="form-group">
          <label htmlFor="emp-name">Ad Soyad</label>
          <input id="emp-name" type="text" required value={form.name} onChange={set("name")} placeholder="Örn: Mehmet Can" />
        </div>
        <div className="form-group">
          <label htmlFor="emp-dept">Departman</label>
          <DepartmentSelect id="emp-dept" value={form.department} departments={departments} onChange={(value) => setForm((current) => ({ ...current, department: value }))} />
        </div>
        <div className="form-group">
          <label htmlFor="emp-title">Unvan</label>
          <input id="emp-title" type="text" value={form.title} onChange={set("title")} placeholder="Örn: Satış Temsilcisi" />
        </div>
        <div className="form-group">
          <label htmlFor="emp-email">E-Posta</label>
          <input id="emp-email" type="email" value={form.email} onChange={set("email")} placeholder="ornek@marlin.com.tr" />
        </div>
        <div className="form-group">
          <label htmlFor="emp-salary">Brüt Ücret (TL)</label>
          <input id="emp-salary" type="number" min="0" step="0.01" required value={form.grossSalary} onChange={set("grossSalary")} />
        </div>
        <div className="form-group">
          <label htmlFor="emp-status">Durum</label>
          <select id="emp-status" value={form.status} onChange={set("status")}>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="emp-manager">Yönetici Sicil No</label>
          <input id="emp-manager" type="text" value={form.managerId || ""} onChange={set("managerId")} placeholder="Opsiyonel" />
        </div>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn secondary-btn" onClick={onCancel}>İptal</button>
        <button type="submit" className="btn primary-btn">{submitLabel}</button>
      </div>
    </form>
  );
}

export function EmployeesPage() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ department: "", status: "", query: "" });
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [modal, setModal] = useState(null); // null | { mode: "create" } | { mode: "edit", employee }
  const [modalError, setModalError] = useState(null);
  const [saving, setSaving] = useState(false);

  const departments = useMemo(
    () => [...new Set(employees.map((employee) => employee.department).filter(Boolean))].sort(),
    [employees],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (filters.department) params.department = filters.department;
      if (filters.status) params.status = filters.status;
      const data = await fetchEmployees(params);
      setEmployees(data.employees || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters.department, filters.status]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setDetailLoading(true);
    setDetail(null);
    fetchEmployeeById(selectedId)
      .then((employee) => { if (!cancelled) setDetail(employee); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setModal(null);
        setModalError(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const filtered = useMemo(() => {
    const query = filters.query.trim().toLocaleLowerCase("tr-TR");
    if (!query) return employees;
    return employees.filter((employee) =>
      employee.name?.toLocaleLowerCase("tr-TR").includes(query) ||
      employee.employeeNo?.toLocaleLowerCase("tr-TR").includes(query)
    );
  }, [employees, filters.query]);

  const openCreate = () => {
    setModal({ mode: "create" });
    setModalError(null);
  };

  const openEdit = () => {
    if (!detail) return;
    setModal({
      mode: "edit",
      employee: {
        employeeNo: detail.employeeNo,
        name: detail.name,
        email: detail.email || "",
        department: detail.department,
        title: detail.title || "",
        grossSalary: detail.grossSalary ?? 45000,
        status: detail.status || "active",
        managerId: detail.managerId || "",
        hireDate: detail.hireDate || "",
      },
    });
    setModalError(null);
  };

  const handleSubmit = async (form) => {
    setSaving(true);
    setModalError(null);
    try {
      const payload = {
        ...form,
        managerId: form.managerId ? form.managerId : null,
        expectedRevision: modal?.mode === "edit" ? modal.employee.revision : undefined,
      };
      if (modal?.mode === "edit") {
        await updateEmployee(detail.id, payload);
      } else {
        await saveEmployee(payload);
      }
      setModal(null);
      await loadData();
      if (modal?.mode === "edit" && selectedId) {
        const refreshed = await fetchEmployeeById(selectedId);
        setDetail(refreshed);
      }
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="hr-module-page">
      <div className="hr-page-header">
        <div>
          <h2>Personel &amp; Organizasyon Yönetimi</h2>
          <p className="subtext">Şirket çalışan ana verisi, unvanlar ve özlük özeti</p>
        </div>
        <button className="btn primary-btn" onClick={openCreate}>+ Yeni Personel Ekle</button>
      </div>

      {error && <div className="error-box" role="alert">{error}</div>}

      <div className="hr-filters" role="search" aria-label="Personel filtreleri">
        <div className="form-group">
          <label htmlFor="filter-query">Ara</label>
          <input
            id="filter-query"
            type="search"
            value={filters.query}
            onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
            placeholder="İsim veya sicil no"
          />
        </div>
        <div className="form-group">
          <label htmlFor="filter-dept">Departman</label>
          <select
            id="filter-dept"
            value={filters.department}
            onChange={(event) => setFilters((current) => ({ ...current, department: event.target.value }))}
          >
            <option value="">Tümü</option>
            {departments.map((department) => (
              <option key={department} value={department}>{department}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="filter-status">Durum</label>
          <select
            id="filter-status"
            value={filters.status}
            onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
          >
            <option value="">Tümü</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="hr-employee-layout">
        <section className="table-responsive" aria-label="Personel listesi">
          {loading ? (
            <div className="loading-spinner">Personel verileri yükleniyor...</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Sicil No</th>
                  <th>Ad Soyad</th>
                  <th>Departman</th>
                  <th>Unvan</th>
                  <th>E-Posta</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((employee) => (
                  <tr
                    key={employee.id}
                    className={selectedId === employee.id ? "row-selected" : undefined}
                  >
                    <td><button type="button" className="link-btn" onClick={() => setSelectedId(employee.id)}><strong>{employee.employeeNo}</strong></button></td>
                    <td>{employee.name}</td>
                    <td><span className="badge badge-info">{employee.department}</span></td>
                    <td>{employee.title}</td>
                    <td>{employee.email || "-"}</td>
                    <td>
                      <span className={`badge ${employee.status === "active" ? "badge-success" : "badge-secondary"}`}>
                        {STATUS_LABELS[employee.status] || employee.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="empty-cell">Personel bulunamadı.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </section>

        <aside className="employee-detail-card" aria-live="polite">
          {!selectedId && <p className="subtext">Detay için listeden bir personel seçin.</p>}
          {detailLoading && <div className="loading-spinner">Detay yükleniyor...</div>}
          {!detailLoading && detail && (
            <>
              <div className="hr-page-header">
                <div>
                  <h3>{detail.name}</h3>
                  <p className="subtext">{detail.employeeNo} · {detail.department}</p>
                </div>
                <button className="btn secondary-btn" onClick={openEdit}>Düzenle</button>
              </div>
              <dl className="detail-list">
                <dt>Unvan</dt><dd>{detail.title || "-"}</dd>
                <dt>E-Posta</dt><dd>{detail.email || "-"}</dd>
                <dt>İşe Giriş</dt><dd>{detail.hireDate || "-"}</dd>
                <dt>Yönetici</dt><dd>{detail.managerId || "-"}</dd>
                <dt>Durum</dt><dd>{STATUS_LABELS[detail.status] || detail.status}</dd>
                <dt>Revizyon</dt><dd>{detail.revision}</dd>
              </dl>
            </>
          )}
        </aside>
      </div>

      {modal && (
        <div className="modal-backdrop">
          <div className="modal-content" role="dialog" aria-modal="true" aria-label={modal.mode === "edit" ? "Personel düzenle" : "Yeni personel"}>
            <h3>{modal.mode === "edit" ? "Personel Kaydını Düzenle" : "Yeni Personel Kaydı"}</h3>
            {modalError && <div className="error-box" role="alert">{modalError}</div>}
            <EmployeeForm
              initial={modal.mode === "edit" ? modal.employee : EMPTY_FORM}
              departments={departments.length > 0 ? departments : ["Servis", "Yedek Parça Satış", "Muhasebe & Finans", "Yönetim"]}
              onSubmit={handleSubmit}
              onCancel={() => { setModal(null); setModalError(null); }}
              submitLabel={saving ? "Kaydediliyor..." : (modal.mode === "edit" ? "Güncelle" : "Kaydet")}
            />
          </div>
        </div>
      )}
    </div>
  );
}
