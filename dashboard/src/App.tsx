import { useState } from "react";

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
  const [activeTab, setActiveTab] = useState<"employees" | "payroll">("employees");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [runs, setRuns] = useState<PayrollRun[]>([]);

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
                {employees.length === 0 ? (
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
                {runs.length === 0 ? (
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
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
