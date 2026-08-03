import React, { useState } from "react";
import { EmployeesPage } from "./EmployeesPage.jsx";
import { LeavePage } from "./LeavePage.jsx";
import { AttendancePage } from "./AttendancePage.jsx";
import { OvertimePage } from "./OvertimePage.jsx";
import { PayrollPage } from "./PayrollPage.jsx";

export function HrShell() {
  const [activeTab, setActiveTab] = useState("employees");

  const tabs = [
    { id: "employees", label: "Personel & Organizasyon" },
    { id: "leaves", label: "İzin & Hak Ediş Defteri" },
    { id: "attendance", label: "Puantaj & Zaman Kaydı" },
    { id: "overtime", label: "Fazla Mesai" },
    { id: "payroll", label: "Taslak Bordro Engine'i" }
  ];

  return (
    <div className="hr-shell-container">
      <div className="hr-nav-tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`hr-tab-btn ${activeTab === t.id ? "active" : ""}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="hr-tab-content">
        {activeTab === "employees" && <EmployeesPage />}
        {activeTab === "leaves" && <LeavePage />}
        {activeTab === "attendance" && <AttendancePage />}
        {activeTab === "overtime" && <OvertimePage />}
        {activeTab === "payroll" && <PayrollPage />}
      </div>
    </div>
  );
}
