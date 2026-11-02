import { useEffect, useState } from 'react'
import { apiFetch } from '../utils/api'
import { ScopedConfigPicker } from './ConfigScope'

export default function SavedConfigImport({ onImport }: { onImport: (name: string, text: string) => Promise<void> }) {
  const [files, setFiles] = useState<{ name: string }[]>([])
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { void apiFetch('/api/configs').then(async response => { if (!response.ok) throw new Error(); const value = await response.json(); if (!Array.isArray(value)) throw new Error(); setFiles(value) }).catch(() => setError('Saved configs are unavailable. Import Config remains available.')) }, [])
  const load = async () => {
    if (!name || !confirm('Load this saved configuration into the form? Unsaved form changes will be replaced. Nothing will execute.')) return
    setBusy(true)
    try {
      const response = await apiFetch(`/api/configs/${encodeURIComponent(name)}`)
      if (!response.ok) throw new Error('Unable to read the selected file.')
      const value = await response.json()
      await onImport(name, value.content); setError('')
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to load configuration.') }
    finally { setBusy(false) }
  }
  return <details className="card p-4 mb-4"><summary className="cursor-pointer font-semibold">Load a saved configuration by datacenter / cluster</summary><div className="mt-3 space-y-3"><ScopedConfigPicker files={files} value={name} onChange={setName} /><button type="button" className="btn-secondary" disabled={!name || busy} onClick={() => void load()}>{busy ? 'Loading…' : 'Load into form'}</button><p className="text-xs text-gray-500">Grouping is a label, not target validation. Review targets and obtain a matching approval before execution.</p>{error && <p role="alert" className="text-amber-600">{error}</p>}</div></details>
}
