import { FormEvent, useMemo, useState } from 'react'
import { Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from 'lucide-react'
import { useAuth } from '../state/auth'

type VisibilityState = {
  current: boolean
  next: boolean
  confirm: boolean
}

export default function SettingsPage() {
  const { user, changePassword } = useAuth()
  const [visibility, setVisibility] = useState<VisibilityState>({ current: false, next: false, confirm: false })
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const disableSubmit = useMemo(() => {
    if (!currentPassword || !newPassword || !confirmPassword) return true
    if (newPassword.length < 8 || confirmPassword.length < 8) return true
    return loading
  }, [confirmPassword.length, currentPassword, loading, newPassword.length])

  const handleToggle = (field: keyof VisibilityState) => {
    setVisibility((prev) => ({ ...prev, [field]: !prev[field] }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match')
      return
    }
    if (newPassword === currentPassword) {
      setError('New password must be different from current password')
      return
    }

    setLoading(true)
    try {
      await changePassword(currentPassword, newPassword)
      setSuccess('Password updated successfully.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: any) {
      const message = err instanceof Error ? err.message : 'Unable to change password right now'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 p-6">
      <div className="rounded-2xl border border-brand-100 bg-white/80 p-6 shadow-sm backdrop-blur">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-10 w-10 text-brand-600" />
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Account security</h1>
            <p className="text-sm text-slate-600">Keep your credentials fresh and unique to maintain access control.</p>
          </div>
        </div>
        <div className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <p className="font-medium text-slate-800">Signed in as</p>
          <p className="truncate text-slate-700">{user?.email}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white/85 p-6 shadow-sm backdrop-blur">
        <div className="flex items-center gap-3">
          <KeyRound className="h-8 w-8 text-emerald-600" />
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Change password</h2>
            <p className="text-sm text-slate-600">Enter your existing password, then choose a new one.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <PasswordField
            id="current-password"
            label="Current password"
            value={currentPassword}
            onChange={setCurrentPassword}
            visible={visibility.current}
            onToggle={() => handleToggle('current')}
            autoComplete="current-password"
          />
          <PasswordField
            id="new-password"
            label="New password"
            value={newPassword}
            onChange={setNewPassword}
            visible={visibility.next}
            onToggle={() => handleToggle('next')}
            autoComplete="new-password"
            helper="Minimum 8 characters. Use a mix of letters, numbers, and symbols."
          />
          <PasswordField
            id="confirm-password"
            label="Confirm new password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            visible={visibility.confirm}
            onToggle={() => handleToggle('confirm')}
            autoComplete="new-password"
          />

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          {success && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-600">{success}</p>}

          <button
            type="submit"
            disabled={disableSubmit}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  )
}

type PasswordFieldProps = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  visible: boolean
  onToggle: () => void
  autoComplete?: string
  helper?: string
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  visible,
  onToggle,
  autoComplete,
  helper,
}: PasswordFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="mt-1 flex rounded-lg border border-slate-200 bg-white shadow-sm focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-200">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          minLength={8}
          className="flex-1 rounded-l-lg border-0 bg-transparent px-3 py-2 text-sm text-slate-800 focus:outline-none"
        />
        <button
          type="button"
          onClick={onToggle}
          className="rounded-r-lg border-l border-slate-200 px-3 text-slate-500 transition hover:text-slate-700"
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {helper ? <p className="mt-1 text-xs text-slate-500">{helper}</p> : null}
    </div>
  )
}
