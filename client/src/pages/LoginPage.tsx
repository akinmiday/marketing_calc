import { FormEvent, useMemo, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Check, Eye, EyeOff, Loader2, LockKeyhole, Sparkles } from 'lucide-react'
import { useAuth } from '../state/auth'

export default function LoginPage() {
  const { login, user, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string })?.from || '/'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const disableSubmit = useMemo(() => {
    if (!email.trim() || !password.trim()) return true
    return submitting
  }, [email, password, submitting])

  if (!loading && user) {
    return <Navigate to={from} replace />
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(email, password)
      navigate(from, { replace: true })
    } catch (err: any) {
      const message = err instanceof Error ? err.message : 'Unable to sign in'
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950/5 p-4">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[-10%] top-[-5%] h-80 w-80 rounded-full bg-brand-500/25 blur-3xl" />
        <div className="absolute right-[-5%] bottom-[-10%] h-96 w-96 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_20%,rgba(16,185,129,0.08),transparent_55%),radial-gradient(circle_at_80%_0%,rgba(14,165,233,0.08),transparent_45%)]" />
      </div>

      <div className="relative w-full max-w-4xl overflow-hidden rounded-3xl border border-white/20 bg-white/85 shadow-2xl backdrop-blur-xl">
        <div className="grid items-stretch md:grid-cols-[1.1fr_0.9fr]">
          <aside className="relative hidden flex-col justify-between border-r border-white/10 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8 text-white md:flex">
            <div className="absolute inset-0">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.25),transparent_55%)]" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,rgba(52,211,153,0.25),transparent_55%)]" />
            </div>
            <div className="relative z-10 flex flex-col gap-6">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-200">
                <Sparkles className="h-3 w-3" /> Marketing Calc
              </span>
              <div className="space-y-3">
                <h2 className="text-3xl font-semibold leading-snug">Insight-driven pricing in minutes.</h2>
                <p className="text-sm text-slate-200/90">
                  Stay on top of margin scenarios, invoices, and approvals with a single secure workspace.
                </p>
              </div>
              <ul className="space-y-3 text-sm">
                {[
                  'Sync receipts and invoices across devices.',
                  'Forecast FX shifts with built-in conversions.',
                  'Export-ready PDF summaries in one click.',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-slate-200/95">
                    <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-200">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative z-10 mt-10 flex items-center gap-3 text-xs text-slate-300/90">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10">
                <LockKeyhole className="h-4 w-4" />
              </div>
              <div>
                <p className="font-semibold text-slate-100">Enterprise-grade security</p>
                <p className="text-slate-300/90">Passwords are encrypted at rest and never shared.</p>
              </div>
            </div>
          </aside>

          <main className="relative flex flex-col gap-8 rounded-3xl bg-white/90 p-7 sm:p-10">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand-700/80">Welcome back</p>
              <h1 className="text-2xl font-semibold text-slate-900">Sign in to Marketing Calc</h1>
              <p className="text-sm text-slate-600">
                Secure access to your calculators, historical runs, and reports.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <fieldset className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    autoComplete="email"
                    onChange={(event) => setEmail(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200/80"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                    Password
                  </label>
                  <div className="flex rounded-xl border border-slate-200 bg-white shadow-sm transition focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-200/80">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      autoComplete="current-password"
                      onChange={(event) => setPassword(event.target.value)}
                      className="flex-1 rounded-l-xl border-0 bg-transparent px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="rounded-r-xl border-l border-slate-200 px-3.5 text-slate-500 transition hover:text-slate-700"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </fieldset>

              {error && (
                <p className="rounded-xl border border-red-100 bg-red-50 px-3.5 py-2 text-sm text-red-600 shadow-sm">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={disableSubmit}
                className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-emerald-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 transition hover:from-brand-700 hover:to-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />}
                {submitting ? 'Signing you in…' : 'Access workspace'}
              </button>
            </form>

            <div className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 text-xs text-slate-500 shadow-sm">
              Forgot your password? Sign in with your default credentials and update it from the Settings panel.
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
