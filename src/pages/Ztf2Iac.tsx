import { useMemo, useState } from 'react'
import { FileCode, Play, RefreshCw, ShieldCheck } from 'lucide-react'
import Layout from '../components/Layout'
import YamlPreview from '../components/YamlPreview'
import { apiFetch } from '../utils/api'
import { toYaml } from '../utils/yaml'
import type { ExecutionJob } from '../types'

const DEFAULT_INPUT = toYaml({
  domains: {
    lab: {
      data: {},
      resources: {},
      outputs: {},
    },
  },
})

const DEFAULT_GLOBAL = toYaml({
  vault_to_use: 'local',
  ip_allocation_method: 'static',
  vaults: {
    local: {
      credentials: {},
    },
  },
})

type Action = 'plan' | 'refresh' | 'apply' | 'destroy'

export default function Ztf2Iac() {
  const [action, setAction] = useState<Action>('plan')
  const [inputContent, setInputContent] = useState(DEFAULT_INPUT)
  const [globalContent, setGlobalContent] = useState(DEFAULT_GLOBAL)
  const [inputFile, setInputFile] = useState('input.yml')
  const [globalFile, setGlobalFile] = useState('global.yml')
  const [stateFile, setStateFile] = useState('state.yml')
  const [sourcePlanJobId, setSourcePlanJobId] = useState('')
  const [approvalId, setApprovalId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [job, setJob] = useState<ExecutionJob | null>(null)

  const destructive = action === 'apply' || action === 'destroy'
  const preview = useMemo(() => inputContent || DEFAULT_INPUT, [inputContent])

  const submit = async () => {
    setSubmitting(true)
    setMessage('')
    setJob(null)
    try {
      const resp = await apiFetch('/api/jobs', {
        method: 'POST',
        body: JSON.stringify({
          framework: 'ztf2',
          ztf2Action: action,
          inputContent,
          globalContent,
          inputFile,
          globalFile,
          stateFile,
          sourcePlanJobId: destructive ? sourcePlanJobId : undefined,
          approvalId: destructive ? approvalId : undefined,
        }),
      })
      const data = await resp.json()
      if (!resp.ok) {
        setMessage(data.error || 'ZTF 2.x job was not accepted.')
        return
      }
      setJob(data)
      setMessage(`${data.workflow} queued as job ${data.id}.`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Layout
      title="ZTF 2.x IaC"
      subtitle="Plan/apply jobs use the separate ZTF 2.x runtime and approval-bound apply controls"
      actions={(
        <button onClick={submit} disabled={submitting || !inputContent.trim() || (destructive && (!sourcePlanJobId.trim() || !approvalId.trim()))} className="btn-primary gap-1.5">
          {action === 'refresh' ? <RefreshCw size={14} /> : destructive ? <ShieldCheck size={14} /> : <Play size={14} />}
          {submitting ? 'Submitting...' : `Run ${action}`}
        </button>
      )}
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(360px,0.9fr)_minmax(420px,1.1fr)]">
        <div className="space-y-4">
          <section className="rounded-lg border border-border bg-surface p-4">
            <div className="mb-4 flex items-center gap-2">
              <FileCode size={16} className="text-nutanix-cyan" />
              <h2 className="text-sm font-semibold text-gray-100">IaC Job</h2>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label>
                <span className="label mb-1">Action</span>
                <select className="input text-sm" value={action} onChange={event => setAction(event.target.value as Action)}>
                  <option value="plan">plan</option>
                  <option value="refresh">refresh</option>
                  <option value="apply">apply</option>
                  <option value="destroy">destroy</option>
                </select>
              </label>
              <Field label="State File" value={stateFile} onChange={setStateFile} />
              <Field label="Input File" value={inputFile} onChange={setInputFile} />
              <Field label="Global File" value={globalFile} onChange={setGlobalFile} />
            </div>
            {destructive && (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <Field label="Source Plan Job ID" value={sourcePlanJobId} onChange={setSourcePlanJobId} />
                <Field label="Approval ID" value={approvalId} onChange={setApprovalId} />
                <p className="md:col-span-2 text-xs text-amber-400">
                  Apply and destroy must reference a successful plan job and an approved ztf2 approval request with matching plan, input, global, and state hashes.
                </p>
              </div>
            )}
          </section>

          <section className="rounded-lg border border-border bg-surface p-4">
            <label className="label mb-1">input.yml</label>
            <textarea className="input h-72 resize-none font-mono text-xs" value={inputContent} onChange={event => setInputContent(event.target.value)} spellCheck={false} />
          </section>

          <section className="rounded-lg border border-border bg-surface p-4">
            <label className="label mb-1">global.yml</label>
            <textarea className="input h-48 resize-none font-mono text-xs" value={globalContent} onChange={event => setGlobalContent(event.target.value)} spellCheck={false} />
          </section>
        </div>

        <div className="space-y-4">
          {message && <div className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-gray-300">{message}</div>}
          {job && (
            <section className="rounded-lg border border-nutanix-blue/30 bg-nutanix-blue/10 p-4 text-sm">
              <div className="font-semibold text-gray-100">Queued Job</div>
              <div className="mt-2 grid gap-2 text-xs text-gray-400">
                <div>ID: <span className="font-mono text-gray-200">{job.id}</span></div>
                <div>Status: <span className="font-mono text-gray-200">{job.status}</span></div>
                <div>Plan ID: <span className="font-mono text-gray-200">{job.trace?.planId || 'pending'}</span></div>
              </div>
            </section>
          )}
          <YamlPreview content={preview} filename={inputFile || 'input.yml'} />
        </div>
      </div>
    </Layout>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      <span className="label mb-1">{label}</span>
      <input className="input text-xs font-mono" value={value} onChange={event => onChange(event.target.value)} />
    </label>
  )
}
