import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { apiFetch } from '../utils/api'
import { PASSWORD_SETUP_CONFIRMATION } from '../utils/initialPasswordSetup'

type Target = { key: string; address: string; account: string; username?: string; status: string }
type Run = { id: string; status: string; cluster_name: string; targets: Target[]; completedSteps: unknown; pipelineId?: string; pipelineAttempts?: Record<string, 'change_attempted' | 'completed' | 'pending'> }
// Deliberately project the safe response contract; never render arbitrary response properties.
function safeRun(value: Run): Run {
  return { id: value.id, status: value.status, cluster_name: value.cluster_name,
    targets: (value.targets || []).map(t => ({ key: t.key, address: t.address, account: t.account || t.username || 'unknown', status: t.status })),
    completedSteps: Array.isArray(value.completedSteps) ? value.completedSteps.filter(s => typeof s === 'string' || typeof s === 'number') : undefined,
    pipelineId: value.pipelineId, pipelineAttempts: Object.fromEntries(Object.entries(value.pipelineAttempts || {}).filter(([index, status]) => /^\d+$/.test(index) && ['change_attempted', 'completed', 'pending'].includes(status))) }
}
export default function InitialPasswordSetupRuns({ liveEnabled = false }: { liveEnabled?: boolean }) {
  const admin = useStore(s => s.user?.role === 'admin')
  const [runs, setRuns] = useState<Run[]>([])
  const [selected, setSelected] = useState('')
  const [targetKeys, setTargetKeys] = useState<string[]>([])
  const [selection, setSelection] = useState<'current' | 'replacement'>('current')
  const [notes, setNotes] = useState('')
  const [evidence, setEvidence] = useState('')
  const [approvalId, setApprovalId] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<unknown>()
  const run = runs.find(r => r.id === selected)
  const load = async () => {
    const response = await apiFetch('/api/initial-password-setup/runs')
    const data = await response.json()
    if (!response.ok || !Array.isArray(data)) throw new Error()
    setRuns(data.map(safeRun))
  }
  const act = async (action: () => Promise<void>) => {
    setBusy(true); setError(''); setResult(undefined)
    try { await action() } catch { setError('Request failed. No success is assumed. Refresh server state before retrying.') }
    finally { setBusy(false) }
  }
  useEffect(() => { void load().catch(() => setError('Recovery runs unavailable. Refresh after the server API is available.')) }, [])
  const post = async (suffix: string, body: unknown) => {
    if (!run) return
    const response = await apiFetch(`/api/initial-password-setup/runs/${encodeURIComponent(run.id)}/${suffix}`, { method: 'POST', body: JSON.stringify(body) })
    if (!response.ok) throw new Error()
    // The refreshed ledger is authoritative, including completed steps. Do not mark local targets successful.
    const data = await response.json()
    setResult({ id: data.id, status: data.status, jobId: data.jobId })
    setApprovalId(''); setConfirmation(''); setTargetKeys([])
    await load()
  }
  return <section className="card space-y-3" aria-label="Password setup recovery">
    <h3 className="font-semibold">Initial password setup recovery</h3>
    <p className="text-sm text-gray-400">Reconciliation asks the server to choose the checked credentials and perform read-only SSH identity/authentication checks. It does not retry password changes. Keep both credential references until recovery is verified.</p>
    <button className="btn-secondary" disabled={busy} onClick={() => void act(load)}>Refresh runs</button>
    {error && <p role="alert" className="text-red-400">{error}</p>}
    <label className="block">Recovery run<select aria-label="Recovery run" className="input w-full" disabled={busy} value={selected} onChange={e => { setSelected(e.target.value); setTargetKeys([]); setApprovalId(''); setConfirmation(''); setNotes(''); setEvidence(''); setResult(undefined) }}><option value="">Select run</option>{runs.map(r => <option key={r.id} value={r.id}>{r.cluster_name} · {r.id} · {r.status}</option>)}</select></label>
    {run && <>
      <pre className="text-xs overflow-auto whitespace-pre-wrap break-all" aria-label="Reference-only run JSON">{JSON.stringify(run, null, 2)}</pre>
      {run.pipelineId && Object.entries(run.pipelineAttempts || {}).filter(([, status]) => status === 'change_attempted').map(([index]) => <PipelineStageAttestation key={`${run.id}:${index}`} index={Number(index)} busy={busy || !admin} onSubmit={body => act(() => post('reconcile', body))} />)}
      <fieldset disabled={busy || !admin} className="space-y-2"><legend>Targets to reconcile</legend>{run.targets.map(t => <label key={t.key} className="flex gap-2"><input type="checkbox" aria-label={`Reconcile ${t.key}`} checked={targetKeys.includes(t.key)} onChange={e => setTargetKeys(keys => e.target.checked ? [...keys, t.key] : keys.filter(k => k !== t.key))} />{t.address} · {t.account} · {t.status}</label>)}</fieldset>
      <label className="block">Credentials to check<select aria-label="Credentials to check" className="input w-full" value={selection} onChange={e => setSelection(e.target.value as typeof selection)}><option value="current">Current references</option><option value="replacement">Replacement references</option></select></label>
      <label className="block">Reconciliation notes<textarea className="input w-full" value={notes} onChange={e => setNotes(e.target.value)} maxLength={2000} /></label>
      <label className="block">Reconciliation evidence<input className="input w-full" value={evidence} onChange={e => setEvidence(e.target.value)} maxLength={2000} /></label>
      <button className="btn-secondary" disabled={busy || !admin || !targetKeys.length || !notes.trim() || !evidence.trim()} onClick={() => void act(() => post('reconcile', { targetKeys, selection, notes: notes.trim(), evidence: evidence.trim() }))}>Check selected credentials</button>
      {run.pipelineId ? <p className="text-sm text-amber-300">Pipeline run: independently reconcile every uncertain legacy stage before resuming; never blindly replay the PE password step. Resume from its Run modal using passwordSetupResumeRunId = {run.id}, a fresh approval for the exact saved YAML and a new confirmation. The server preserves completed steps.</p> : <>
        <label className="block">Fresh resume approval ID<input className="input w-full" value={approvalId} onChange={e => setApprovalId(e.target.value)} /></label>
        <label className="block">Resume confirmation: {PASSWORD_SETUP_CONFIRMATION}<input aria-label="Resume confirmation" className="input w-full" value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label>
        <button className="btn-primary" disabled={busy || !admin || !liveEnabled || !approvalId.trim() || confirmation !== PASSWORD_SETUP_CONFIRMATION} onClick={() => void act(() => post('resume', { approvalId: approvalId.trim(), destructiveConfirmation: confirmation }))}>Resume standalone run</button>
      </>}
    </>}
    {result !== undefined && <pre aria-label="Reference-only result JSON" className="text-xs overflow-auto">{JSON.stringify(result, null, 2)}</pre>}
  </section>
}

function PipelineStageAttestation({ index, busy, onSubmit }: { index: number; busy: boolean; onSubmit: (body: unknown) => Promise<void> }) {
  const [selection, setSelection] = useState<'completed' | 'not_applied'>('completed')
  const [notes, setNotes] = useState('')
  const [evidence, setEvidence] = useState('')
  const [verified, setVerified] = useState(false)
  return <fieldset disabled={busy} className="border border-amber-600 rounded p-3 space-y-3" aria-label={`Manual reconciliation for pipeline step ${index + 1}`}>
    <legend>Pipeline step {index + 1} · change attempted · reconciliation required</legend>
    <p className="text-sm text-amber-300">Administrator manual evidence attestation, not an automatic health or authentication check. Independently inspect this legacy stage before pipeline resume. Do not replay a potentially completed PE password change.</p>
    <label className="block">Observed pipeline stage outcome<select aria-label={`Pipeline step ${index + 1} outcome`} className="input w-full" value={selection} onChange={e => { setSelection(e.target.value as typeof selection); setVerified(false) }}><option value="completed">Completed — independently verified</option><option value="not_applied">Not applied — independently verified</option></select></label>
    <label className="block">Stage reconciliation notes<textarea aria-label={`Pipeline step ${index + 1} notes`} className="input w-full" value={notes} onChange={e => { setNotes(e.target.value); setVerified(false) }} maxLength={2000} /></label>
    <label className="block">Stage reconciliation evidence<input aria-label={`Pipeline step ${index + 1} evidence`} className="input w-full" value={evidence} onChange={e => { setEvidence(e.target.value); setVerified(false) }} maxLength={2000} /></label>
    <label className="flex gap-2"><input aria-label={`Independently verified pipeline step ${index + 1}`} type="checkbox" checked={verified} onChange={e => setVerified(e.target.checked)} />I independently verified this outcome and attest to the manual evidence above. This is not automatic health validation.</label>
    <button className="btn-secondary" disabled={busy || !verified || !notes.trim() || !evidence.trim()} onClick={() => void onSubmit({ pipelineStep: index, selection, notes: notes.trim(), evidence: evidence.trim(), independentlyVerified: true }).then(() => setVerified(false))}>Record manual stage evidence</button>
  </fieldset>
}
