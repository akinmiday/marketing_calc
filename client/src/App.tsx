import { useState } from 'react'
import { Calculator, FileText, History as HistoryIcon, Menu, Settings, X } from 'lucide-react'
import {
  Link,
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import { CalcProvider } from './state/calc'
import { useAuth } from './state/auth'
import CalculatorPage from './pages/CalculatorPage'
import HistoryPage from './pages/HistoryPage'
import InvoicePage from './pages/InvoicePage'
import LoginPage from './pages/LoginPage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/" element={<ProtectedLayout />}>
          <Route index element={<CalculatorPage />} />
          <Route path="invoice" element={<InvoicePage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function RequireAuth() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen app-gradient flex items-center justify-center">
        <div className="rounded-lg border border-slate-200 bg-white/80 px-6 py-4 text-sm text-slate-600 shadow">
          Checking your session…
        </div>
      </div>
    )
  }

  if (!user) {
    const redirect = `${location.pathname}${location.search}`
    return <Navigate to="/login" replace state={{ from: redirect }} />
  }

  return <Outlet />
}

function ProtectedLayout() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    setOpen(false)
    navigate('/login')
  }

  return (
    <div className="min-h-screen app-gradient">
      <nav className="sticky top-0 z-10 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between p-3 md:p-4">
          <Link to="/" className="inline-flex items-center gap-2 font-semibold text-[15px] md:text-base">
            <Calculator className="h-5 w-5 text-brand-700" /> Marketing Calc
          </Link>
          <div className="hidden md:flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Tab to="/" icon={<Calculator className="h-4 w-4" />}>Calculator</Tab>
              <Tab to="/invoice" icon={<FileText className="h-4 w-4" />}>Invoice</Tab>
              <Tab to="/history" icon={<HistoryIcon className="h-4 w-4" />}>History</Tab>
              <Tab to="/settings" icon={<Settings className="h-4 w-4" />}>Settings</Tab>
            </div>
            <div className="flex items-center gap-3 border-l border-slate-200 pl-3 text-xs text-slate-600">
              <span className="font-medium text-slate-700">{user?.email}</span>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Log out
              </button>
            </div>
          </div>
          <button
            className="md:hidden rounded-lg border p-2"
            onClick={() => setOpen((prev) => !prev)}
            aria-label="Open menu"
          >
            {!open ? <Menu className="h-5 w-5" /> : <X className="h-5 w-5" />}
          </button>
        </div>
        {open && (
          <div className="md:hidden border-t bg-white/95 backdrop-blur">
            <div className="mx-auto max-w-6xl p-2 grid gap-2 text-sm">
              <Tab to="/" icon={<Calculator className="h-4 w-4" />} onSelect={() => setOpen(false)}>
                Calculator
              </Tab>
              <Tab to="/invoice" icon={<FileText className="h-4 w-4" />} onSelect={() => setOpen(false)}>
                Invoice
              </Tab>
              <Tab to="/history" icon={<HistoryIcon className="h-4 w-4" />} onSelect={() => setOpen(false)}>
                History
              </Tab>
              <Tab to="/settings" icon={<Settings className="h-4 w-4" />} onSelect={() => setOpen(false)}>
                Settings
              </Tab>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                <p className="font-medium text-slate-700">{user?.email}</p>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="mt-2 w-full rounded-full border border-slate-200 px-3 py-1 font-semibold hover:bg-slate-100"
                >
                  Log out
                </button>
              </div>
            </div>
          </div>
        )}
      </nav>

      <CalcProvider>
        <Outlet />
      </CalcProvider>
    </div>
  )
}

function Tab({
  to,
  children,
  icon,
  onSelect,
}: {
  to: string
  children: React.ReactNode
  icon?: React.ReactNode
  onSelect?: () => void
}) {
  return (
    <NavLink
      to={to}
      onClick={() => {
        onSelect?.()
      }}
      className={({ isActive }) =>
        `inline-flex items-center gap-2 rounded-full px-3 py-1 ${
          isActive ? 'bg-emerald-100 text-emerald-700' : 'hover:bg-slate-100'
        }`
      }
    >
      {icon} {children}
    </NavLink>
  )
}
