import { useState, useEffect } from "react";

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  department: string;
  position: string;
  status: string;
  base_salary: number;
}

interface PayrollRun {
  id: string;
  period_start: string;
  period_end: string;
  status: string;
  total_gross: number;
  total_deductions: number;
  total_net: number;
  total_employees: number;
}

function App() {
  const [activeTab, setActiveTab] = useState<"employees" | "payroll" | "dashboard">("employees");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<{
    payrollTrend: Array<{period: string; gross: number; net: number; employees: number; status: string}>;
    deptBreakdown: Array<{department: string; count: number}>;
    statusBreakdown: Array<{status: string; count: number}>;
    ptoSummary: Array<{type: string; total: number; used: number; remaining: number}>;
    monthlyPayroll: Array<{month: string; gross: number; net: number; employees: number}>;
  } | null>(null);

  useEffect(() => {
    fetch("http://localhost:3010/api/employees")
      .then(res => res.json())
      .then(data => setEmployees(data))
      .catch(console.error);
    fetch("http://localhost:3010/api/payroll-runs")
      .then(res => res.json())
      .then(data => setRuns(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (activeTab === "dashboard" && !dashboardData) {
      fetch("http://localhost:3010/api/dashboard")
        .then(res => res.json())
        .then(data => setDashboardData(data))
        .catch(console.error);
    }
  }, [activeTab]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Open Payroll</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex">
              <button
                onClick={() => setActiveTab("employees")}
                className={`py-4 px-6 font-medium text-sm ${
                  activeTab === "employees"
                    ? "border-b-2 border-blue-500 text-blue-600"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Employees
              </button>
              <button
                onClick={() => setActiveTab("payroll")}
                className={`py-4 px-6 font-medium text-sm ${
                  activeTab === "payroll"
                    ? "border-b-2 border-blue-500 text-blue-600"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Payroll Runs
              </button>
              <button
                onClick={() => setActiveTab("dashboard")}
                className={`py-4 px-6 font-medium text-sm ${
                  activeTab === "dashboard"
                    ? "border-b-2 border-blue-500 text-blue-600"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Dashboard
              </button>
            </nav>
          </div>

          <div className="p-6">
            {activeTab === "employees" && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-medium">Employees</h2>
                  <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
                    Add Employee
                  </button>
                </div>
                {loading ? (
                  <p className="text-gray-500 text-center py-8">Loading...</p>
                ) : employees.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No employees yet</p>
                ) : (
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Department</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Position</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Salary</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {employees.map((emp) => (
                        <tr key={emp.id}>
                          <td className="px-6 py-4 whitespace-nowrap">{emp.first_name} {emp.last_name}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{emp.email}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{emp.department}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{emp.position}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              emp.status === "active" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
                            }`}>
                              {emp.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">${emp.base_salary?.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {activeTab === "payroll" && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-medium">Payroll Runs</h2>
                  <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
                    New Payroll Run
                  </button>
                </div>
                {loading ? (
                  <p className="text-gray-500 text-center py-8">Loading...</p>
                ) : runs.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No payroll runs yet</p>
                ) : (
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employees</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Gross</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Deductions</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Net</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {runs.map((run) => (
                        <tr key={run.id}>
                          <td className="px-6 py-4 whitespace-nowrap">{run.period_start} - {run.period_end}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              run.status === "completed" ? "bg-green-100 text-green-800" :
                              run.status === "calculated" ? "bg-blue-100 text-blue-800" :
                              "bg-yellow-100 text-yellow-800"
                            }`}>
                              {run.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">{run.total_employees}</td>
                          <td className="px-6 py-4 whitespace-nowrap">${run.total_gross.toLocaleString()}</td>
                          <td className="px-6 py-4 whitespace-nowrap">${run.total_deductions.toLocaleString()}</td>
                          <td className="px-6 py-4 whitespace-nowrap">${run.total_net.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {activeTab === "dashboard" && (
              <div>
                <h2 className="text-lg font-medium mb-6">Analytics</h2>
                {!dashboardData ? (
                  <p className="text-gray-500 text-center py-8">Loading...</p>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Payroll Trend Chart */}
                    <div className="border rounded-lg p-4">
                      <h3 className="font-medium mb-4">Payroll Trend (Gross vs Net)</h3>
                      {dashboardData.payrollTrend.length === 0 ? (
                        <p className="text-gray-400 text-sm">No payroll runs yet</p>
                      ) : (
                        <svg viewBox="0 0 400 200" className="w-full">
                          {(() => {
                            const data = dashboardData.payrollTrend.slice(0, 8).reverse();
                            const max = Math.max(...data.map(d => d.gross), 1);
                            const barW = 40;
                            const gap = 8;
                            const offsetX = 30;
                            const chartH = 160;
                            return (
                              <>
                                <line x1="30" y1="10" x2="30" y2="165" stroke="#e5e7eb" strokeWidth="1" />
                                <line x1="30" y1="165" x2="390" y2="165" stroke="#e5e7eb" strokeWidth="1" />
                                {data.map((d, i) => {
                                  const x = offsetX + i * (barW + gap);
                                  const grossH = (d.gross / max) * chartH;
                                  const netH = (d.net / max) * chartH;
                                  return (
                                    <g key={i}>
                                      <rect x={x} y={165 - grossH} width={barW / 2 - 2} height={grossH} fill="#3b82f6" rx="2" opacity="0.7" />
                                      <rect x={x + barW / 2 + 2} y={165 - netH} width={barW / 2 - 2} height={netH} fill="#10b981" rx="2" />
                                    </g>
                                  );
                                })}
                                <text x="5" y="15" fontSize="9" fill="#9ca3af">${(max / 1000).toFixed(0)}k</text>
                                <text x="5" y="90" fontSize="9" fill="#9ca3af">${(max / 2000 / 1000).toFixed(1)}k</text>
                              </>
                            );
                          })()}
                        </svg>
                      )}
                      <div className="flex gap-4 mt-2 text-xs">
                        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-400 rounded" /> Gross</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-400 rounded" /> Net</span>
                      </div>
                    </div>

                    {/* Department Breakdown */}
                    <div className="border rounded-lg p-4">
                      <h3 className="font-medium mb-4">Employees by Department</h3>
                      {dashboardData.deptBreakdown.length === 0 ? (
                        <p className="text-gray-400 text-sm">No data</p>
                      ) : (
                        <div className="space-y-3">
                          {dashboardData.deptBreakdown.map((d) => {
                            const total = dashboardData.deptBreakdown.reduce((s, x) => s + x.count, 0);
                            const pct = total > 0 ? (d.count / total) * 100 : 0;
                            return (
                              <div key={d.department}>
                                <div className="flex justify-between text-sm mb-1">
                                  <span>{d.department}</span>
                                  <span className="text-gray-500">{d.count} ({pct.toFixed(0)}%)</span>
                                </div>
                                <div className="w-full bg-gray-100 rounded-full h-2">
                                  <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* PTO Summary */}
                    <div className="border rounded-lg p-4">
                      <h3 className="font-medium mb-4">PTO Summary</h3>
                      {dashboardData.ptoSummary.length === 0 ? (
                        <p className="text-gray-400 text-sm">No PTO data</p>
                      ) : (
                        <div className="space-y-3">
                          {dashboardData.ptoSummary.map((d) => {
                            const pct = d.total > 0 ? (d.used / d.total) * 100 : 0;
                            return (
                              <div key={d.type}>
                                <div className="flex justify-between text-sm mb-1">
                                  <span className="capitalize">{d.type}</span>
                                  <span className="text-gray-500">{d.remaining} days left ({d.used}/{d.total})</span>
                                </div>
                                <div className="w-full bg-gray-100 rounded-full h-2">
                                  <div className="bg-amber-400 h-2 rounded-full" style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Status Breakdown */}
                    <div className="border rounded-lg p-4">
                      <h3 className="font-medium mb-4">Employee Status</h3>
                      {dashboardData.statusBreakdown.length === 0 ? (
                        <p className="text-gray-400 text-sm">No data</p>
                      ) : (
                        <div className="flex gap-4 flex-wrap">
                          {dashboardData.statusBreakdown.map((d) => {
                            const colors: Record<string, string> = { active: "bg-green-500", inactive: "bg-gray-400", terminated: "bg-red-400" };
                            return (
                              <div key={d.status} className="flex items-center gap-2">
                                <span className={`w-4 h-4 rounded ${colors[d.status] || "bg-gray-300"}`} />
                                <span className="text-sm capitalize">{d.status}: {d.count}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
