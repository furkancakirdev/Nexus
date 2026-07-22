export function normalizeEmployee(employee) {
  return {
    included: true,
    fixedShareRate: 0,
    salaryCoefficient: 1,
    tenure: 0,
    status: "employee",
    approvalStatus: "Yönetici Onayı",
    ...employee,
  };
}

export function calculateEmployeeDistribution(employees, settings, annualPool, companyScore = settings.companyPerformanceScore ?? 100, departmentScores = settings.departmentPerformanceScores || {}) {
  const calculated = employees.map(normalizeEmployee).map((employee) => {
    const departmentScore = Number(departmentScores[employee.department] ?? 100);
    const weightedScore = (
      companyScore * settings.companyWeight +
      departmentScore * settings.teamWeight
    ) / 100;
    const eligible = employee.included !== false && employee.status !== "departed" && employee.approvalStatus !== "Uygun Değil" && weightedScore >= settings.minimumGoalScore;
    const performanceMultiplier = eligible ? Math.min(weightedScore / 100, settings.maximumMultiplier / 100) : 0;
    const allocationWeight = settings.allocationMethod === "equal"
      ? (eligible ? 1 : 0)
      : employee.salaryCoefficient * performanceMultiplier;
    const fixedShareRate = eligible ? Math.max(0, Math.min(100, Number(employee.fixedShareRate || 0))) : 0;
    return { ...employee, departmentScore, weightedScore, eligible, performanceMultiplier, allocationWeight, fixedShareRate };
  });

  const totalFixedRate = Math.min(100, calculated.reduce((sum, employee) => sum + employee.fixedShareRate, 0));
  const remainingPool = annualPool * (1 - totalFixedRate / 100);
  const automaticWeight = calculated.reduce((sum, employee) => sum + (employee.fixedShareRate ? 0 : employee.allocationWeight), 0);

  return calculated.map((employee) => ({
    ...employee,
    projectedShare: employee.fixedShareRate
      ? annualPool * employee.fixedShareRate / 100
      : automaticWeight ? remainingPool * employee.allocationWeight / automaticWeight : 0,
    shareMode: employee.fixedShareRate
      ? "Sabit"
      : settings.allocationMethod === "equal" ? "Eşit" : "Katsayı ağırlıklı",
  }));
}
