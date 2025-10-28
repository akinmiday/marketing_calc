import { useRef, useState } from 'react'
import Card from '../components/Card'
import { downloadJSON } from '../utils/download'

export default function ScenariosPage() {
  const [name, setName] = useState('scenario-1')
  const [payload, setPayload] = useState('{}')
  const fileRef = useRef<HTMLInputElement>(null)

  const handleDownload = () => {
    try {
      const parsed = JSON.parse(payload)
      downloadJSON(`${name || 'scenario'}.json`, parsed)
    } catch {
      alert('Invalid JSON')
    }
  }

  const handleUpload = async (f: File) => {
    const text = await f.text()
    setPayload(text)
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">Scenarios</h1>
      <p className="text-slate-600">Export/import calculator scenarios as JSON.</p>

      <div className="mt-6 space-y-6">
        <Card title="Export JSON">
          <div className="grid gap-3">
            <label className="grid gap-1">
              <span className="text-sm text-slate-600">File name</span>
              <input className="rounded-md border px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} />
            </label>

            <label className="grid gap-1">
              <span className="text-sm text-slate-600">Scenario JSON</span>
              <textarea className="min-h-[160px] rounded-md border p-3 font-mono text-sm" value={payload} onChange={(e) => setPayload(e.target.value)} />
            </label>

            <div>
              <button className="rounded-xl border bg-white px-4 py-2 text-sm font-medium shadow-soft hover:bg-slate-50" onClick={handleDownload}>Download JSON</button>
            </div>
          </div>
        </Card>

        <Card title="Import JSON">
          <div className="grid gap-3">
            <input ref={fileRef} type="file" accept="application/json" onChange={(e) => e.target.files && e.target.files[0] && handleUpload(e.target.files[0])} />
            <p className="text-xs text-slate-600">After loading, paste the values into the calculator (future: deep link state).</p>
          </div>
        </Card>
      </div>
    </div>
  )
}
