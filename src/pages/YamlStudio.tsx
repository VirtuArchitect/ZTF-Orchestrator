import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  FileCode,
  Search,
  ShieldCheck,
  XCircle,
  ArrowLeft,
  Download,
} from 'lucide-react'
import Layout from '../components/Layout'
import { Link } from '../router'
import { SCRIPT_CONFIG_SCHEMAS } from '../scriptConfigSchemas'
import { apiFetch } from '../utils/api'
import { useStore } from '../store'
import { useConfigOrganization } from '../components/ConfigScope'
import AdvancedStudio from './YamlStudioAdvanced'
import type { ScriptConfigField } from '../types'
import './YamlStudio.css'

type Values = Record<string, string | number | boolean>
type Task = { id: string; category: string; action: string; handoffError?: string }
type Group = { id: string; name: string; datacenter: string; kind: string }
type Pipeline = {
  id: string
  name: string
  executor?: string
  studioHash: string
  steps: { workflow: string; configFile: string }[]
}
type Context = {
  tasks: Task[]
  groups: Group[]
  references: { name: string; groupId: string }[]
  pipelines: Pipeline[]
}
type Cluster = {
  id: string
  name: string
  datacenter: string
  peEndpoint: string
  peCredential: string
}
type Check = {
  valid: boolean
  syntaxValid: boolean
  shapeValid: boolean
  contentHash: string
  errors: string[]
  warnings: string[]
  references: { name: string; status: string }[]
}
type Draft = {
  dirty: boolean
  values: Values
  raw: string
  advanced: boolean
  filename: string
  expectedHash: string
  savedHash: string
  savedContent: string
}
const newDraft = (): Draft => ({
  dirty: false,
  values: {},
  raw: '',
  advanced: false,
  filename: '',
  expectedHash: '',
  savedHash: '',
  savedContent: '',
})
const ignoredFields = new Set(['default_pe_password', 'ipam_network', 'ipam_subnet', 'ipam_domain'])
const title = (id: string) => SCRIPT_CONFIG_SCHEMAS[id]?.title || id
async function jsonRequest(path: string, body?: unknown) {
  const response = await apiFetch(
    path,
    body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }
  )
  const value = await response.json()
  if (!response.ok)
    throw Object.assign(
      new Error(
        value.error ||
          (value.errors
            ? 'Authoring checks failed. Review the validation results.'
            : 'The request failed. Please reload and try again.')
      ),
      { validation: value.validation || (value.errors ? value : null) }
    )
  return value
}
function endpointHost(endpoint: string) {
  try {
    return new URL(endpoint).hostname
  } catch {
    return ''
  }
}

export default function YamlStudio() {
  const [tools, setTools] = useState(false)
  const [context, setContext] = useState<Context | null>(null)
  const [clusters, setClusters] = useState<Cluster[]>([])
  const [dc, setDc] = useState('')
  const [groupId, setGroupId] = useState('')
  const [taskId, setTaskId] = useState('AddNtpServersPe')
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [query, setQuery] = useState('')
  const [check, setCheck] = useState<Check | null>(null)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [pipelineId, setPipelineId] = useState('')
  const [review, setReview] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const [showAllRefs, setShowAllRefs] = useState(false)
  const [files, setFiles] = useState<{ name: string }[]>([])
  const [openName, setOpenName] = useState('')
  const { organization, ready, error: groupError, reload: reloadGroups } = useConfigOrganization()
  const user = useStore((s) => s.user)
  const canSave = user?.role === 'admin' || user?.role === 'operator'
  const key = `${dc}/${groupId}/${taskId}`
  const draft = drafts[key] || newDraft()
  const schema = SCRIPT_CONFIG_SCHEMAS[taskId]
  const task = context?.tasks.find((item) => item.id === taskId)
  const group = context?.groups.find((item) => item.id === groupId)
  const record = clusters.find(
    (item) => item.name === group?.name && item.datacenter === group?.datacenter
  )
  const values: Values = {
    ...(record
      ? { cluster_ip: endpointHost(record.peEndpoint), pe_credential: record.peCredential }
      : {}),
    ...(group ? { cluster_name: group.name } : {}),
    ...draft.values,
  }
  const fields = schema.fields
    .filter((field) => !ignoredFields.has(field.key))
    .sort(
      (a, b) =>
        (['cluster_name', 'cluster_ip', 'pe_credential'].indexOf(a.key) < 0
          ? 9
          : ['cluster_name', 'cluster_ip', 'pe_credential'].indexOf(a.key)) -
        (['cluster_name', 'cluster_ip', 'pe_credential'].indexOf(b.key) < 0
          ? 9
          : ['cluster_name', 'cluster_ip', 'pe_credential'].indexOf(b.key))
    )
  const missing = fields.filter(
    (field) =>
      (field.required ||
        field.type === 'boolean' ||
        field.type === 'select' ||
        ['replication_factor', 'host_failures', 'job_title'].includes(field.key)) &&
      (values[field.key] === undefined || values[field.key] === '')
  )
  const content = useMemo(() => {
    if (draft.advanced) return draft.raw
    try {
      return schema.build(values)
    } catch {
      return ''
    }
  }, [draft, schema, values])
  const saved = !!draft.savedHash && content === draft.savedContent
  const pipeline = context?.pipelines.find((item) => item.id === pipelineId)
  const datacenters = [
    ...new Set(context?.groups.filter((g) => g.kind === 'cluster').map((g) => g.datacenter)),
  ].sort()
  const changed = Object.values(drafts).some((item) => item.dirty)
  const update = (patch: Partial<Draft>) => {
    setDrafts((current) => ({
      ...current,
      [key]: { ...(current[key] || newDraft()), ...patch, dirty: true },
    }))
    setCheck(null)
    setMessage('')
    setError('')
    setReview(false)
  }
  const loadContext = async () => {
    const value = await jsonRequest('/api/yaml-studio/context')
    setContext(value)
  }
  useEffect(() => {
    void Promise.all([
      loadContext(),
      jsonRequest('/api/operations').then((value) => setClusters(value.clusters)),
      jsonRequest('/api/configs').then(setFiles),
    ]).catch((failure) => setError(failure.message))
  }, [])
  useEffect(() => {
    setCheck(null)
    setError('')
    setMessage('')
    setReview(false)
  }, [key])
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (changed) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [changed])
  useEffect(() => {
    if (review) dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
  }, [review])
  const perform = async (name: string, action: () => Promise<void>) => {
    setBusy(name)
    setError('')
    setMessage('')
    try {
      await action()
    } catch (failure) {
      const e = failure as Error & { validation?: Check }
      setError(e.message)
      if (e.validation) setCheck(e.validation)
    } finally {
      setBusy('')
    }
  }
  const validate = async () => {
    if (!draft.advanced && missing.length)
      throw new Error(`Complete: ${missing.map((field) => field.label).join(', ')}.`)
    const value = await jsonRequest('/api/yaml-studio/validate', { taskId, content })
    setCheck(value)
    return value as Check
  }
  const save = async () => {
    await validate()
    const result = await jsonRequest('/api/yaml-studio/save', {
      taskId,
      content,
      filename: draft.filename,
      expectedHash: draft.expectedHash,
      groupId,
      groupRevision: organization.revision,
    })
    setDrafts((current) => ({
      ...current,
      [key]: {
        ...draft,
        dirty: false,
        savedHash: result.contentHash,
        expectedHash: result.contentHash,
        savedContent: content,
      },
    }))
    setCheck(result.validation)
    setMessage('Saved in Config Files. No workflow has been executed.')
    await reloadGroups()
    setFiles(await jsonRequest('/api/configs'))
  }
  const openExisting = async () => {
    if (
      !openName ||
      (changed &&
        !confirm(
          'Replace this task draft with the selected file? Other task drafts are retained until you leave this page.'
        ))
    )
      return
    const file = await jsonRequest(`/api/configs/${encodeURIComponent(openName)}`)
    update({
      raw: file.content,
      advanced: true,
      filename: file.name,
      expectedHash: file.sha256,
      savedHash: '',
      savedContent: '',
    })
    setMessage(
      'Existing YAML loaded for review. Validate and save before handing off. No file has been changed.'
    )
  }
  const exportYaml = () => {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/yaml' }))
    const link = document.createElement('a')
    link.href = url
    link.download = draft.filename || 'draft.yml'
    link.click()
    URL.revokeObjectURL(url)
  }
  if (tools)
    return (
      <>
        <button className="studio-return btn-secondary" onClick={() => setTools(false)}>
          <ArrowLeft size={16} />
          Return to operational Studio
        </button>
        <AdvancedStudio />
      </>
    )
  return (
    <Layout
      title="YAML Studio"
      subtitle="Prepare cluster configuration, check it and hand it to a pipeline"
    >
      <fieldset disabled={!!busy} className="studio space-y-5 min-w-0">
        <div className="studio-steps" aria-label="Authoring stages">
          {['Choose task', 'Select cluster', 'Configure', 'Validate', 'Save & hand off'].map(
            (label, index) => (
              <div
                key={label}
                className={
                  index === 0 ||
                  (index === 1 && groupId) ||
                  (index === 2 && !missing.length) ||
                  (index === 3 && check?.valid) ||
                  (index === 4 && saved)
                    ? 'complete'
                    : ''
                }
              >
                <span>{index + 1}</span>
                {label}
              </div>
            )
          )}
        </div>
        <section className="card studio-context" aria-label="Configuration context">
          <label>
            Datacenter
            <select
              className="input"
              value={dc}
              onChange={(event) => {
                setDc(event.target.value)
                setGroupId('')
              }}
            >
              <option value="">Choose datacenter</option>
              {datacenters.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          <label>
            Cluster
            <select
              className="input"
              value={groupId}
              onChange={(event) => setGroupId(event.target.value)}
            >
              <option value="">Manual target / ungrouped</option>
              {context?.groups
                .filter((g) => g.kind === 'cluster' && g.datacenter === dc)
                .map((g) => (
                  <option value={g.id} key={g.id}>
                    {g.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Task
            <select
              className="input"
              value={taskId}
              onChange={(event) => setTaskId(event.target.value)}
            >
              {context?.tasks.map((t) => (
                <option value={t.id} key={t.id}>
                  {title(t.id)}
                </option>
              ))}
            </select>
          </label>
        </section>
        <div role="status" aria-live="polite">
          {!context && !error && <p>Loading task and credential reference catalogue…</p>}
          {message && <p className="studio-success">{message}</p>}
          {(error || groupError) && (
            <p className="studio-error" role="alert">
              {error || groupError}{' '}
              <button
                className="underline"
                onClick={() =>
                  void perform('reload', async () => {
                    await loadContext()
                    await reloadGroups()
                  })
                }
              >
                Reload metadata
              </button>
            </p>
          )}
        </div>
        <div className="studio-columns">
          <aside className="card studio-library">
            <h2>
              <FileCode size={18} />
              Task library
            </h2>
            <label className="studio-search">
              <Search size={16} />
              <input
                aria-label="Search tasks"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a task…"
              />
            </label>
            {[...new Set(context?.tasks.map((t) => t.category))].map((category) => (
              <details key={category} open={category === task?.category || !!query}>
                <summary>{category}</summary>
                {context?.tasks
                  .filter(
                    (t) =>
                      t.category === category &&
                      title(t.id).toLowerCase().includes(query.toLowerCase())
                  )
                  .map((t) => (
                    <button
                      className={taskId === t.id ? 'selected' : ''}
                      key={t.id}
                      onClick={() => setTaskId(t.id)}
                    >
                      {title(t.id)}
                      <ArrowRight size={14} />
                    </button>
                  ))}
              </details>
            ))}
            <h3>Specialist wizards</h3>
            <Link to="/configure/ahv-uplink-migration">AHV Uplink Migration ↗</Link>
            <Link to="/configure/dare">Data-at-Rest Encryption ↗</Link>
            <button onClick={() => setTools(true)}>Additional authoring tools ↗</button>
            <p className="studio-help">
              Existing generators, baselines, Global Config and upgrade rules remain available.
            </p>
          </aside>
          <section className="card studio-form">
            <div className="studio-section-title">
              <div>
                <p className="studio-eyebrow">GUIDED CONFIGURATION</p>
                <h2>{schema.title}</h2>
              </div>
              <ShieldCheck size={24} />
            </div>
            <p>
              {taskId === 'ChangeDefaultAdminPasswordPe'
                ? 'Prepare a PE admin password change using saved credential references. Existing workflow approvals and password verification still apply.'
                : schema.description}
            </p>
            <div className="studio-toggle">
              <button
                aria-pressed={!draft.advanced}
                onClick={() => {
                  if (
                    !draft.advanced ||
                    confirm(
                      'Return to the guided values? This replaces the edited YAML with the last guided form.'
                    )
                  )
                    update({ advanced: false })
                }}
              >
                Guided form
              </button>
              <button
                aria-pressed={draft.advanced}
                onClick={() => update({ advanced: true, raw: content })}
              >
                Advanced YAML
              </button>
            </div>
            {draft.advanced ? (
              <label>
                Configuration YAML
                <textarea
                  aria-label="Configuration YAML"
                  spellCheck={false}
                  className="input studio-editor"
                  value={draft.raw}
                  onChange={(event) => update({ raw: event.target.value })}
                />
              </label>
            ) : (
              <div className="studio-fields">
                {fields.map((field) => (
                  <Field
                    key={field.key}
                    field={field}
                    value={values[field.key]}
                    onChange={(value) => update({ values: { ...values, [field.key]: value } })}
                  />
                ))}
              </div>
            )}
            <datalist id="studio-refs">
              {context?.references
                .filter(
                  (ref) =>
                    showAllRefs ||
                    !groupId ||
                    ref.groupId === groupId ||
                    context.groups.some((g) => g.id === ref.groupId && g.kind === 'shared')
                )
                .map((ref) => (
                  <option key={ref.name} value={ref.name} />
                ))}
            </datalist>
            <details className="studio-context-help">
              <summary>Credential scope & draft help</summary>{' '}
              <label className="studio-check">
                <input
                  type="checkbox"
                  checked={showAllRefs}
                  onChange={(event) => setShowAllRefs(event.target.checked)}
                />
                Show credential references from all groups
              </label>
              <p className="studio-help">
                References only. Passwords are never loaded into this form. Reference presence does
                not prove authentication.
              </p>
              <p className="studio-help">
                {record
                  ? 'Target and credential reference prefilled from the managed cluster. Review them before saving.'
                  : 'Group labels do not verify a target. Enter and review the PE address and reference below.'}{' '}
                Drafts stay in this page’s memory; export before leaving.
              </p>
            </details>
            <div className="studio-file">
              <label>
                Save as
                <input
                  aria-label="Save as"
                  className="input"
                  value={draft.filename}
                  placeholder="cluster-ntp.yml"
                  onChange={(event) =>
                    update({
                      filename: event.target.value,
                      expectedHash: '',
                      savedHash: '',
                      savedContent: '',
                    })
                  }
                />
              </label>
              <details className="studio-existing">
                <summary>Edit an existing file</summary>{' '}
                <p className="studio-help">
                  New filenames never overwrite an existing file silently. To edit, open the
                  existing file below.
                </p>
                <select
                  aria-label="Existing configuration"
                  className="input"
                  value={openName}
                  onChange={(event) => setOpenName(event.target.value)}
                >
                  <option value="">Choose an existing YAML file…</option>
                  {files
                    .filter((f) => /\.ya?ml$/.test(f.name) && !/^global\.ya?ml$/i.test(f.name))
                    .map((file) => (
                      <option key={file.name}>{file.name}</option>
                    ))}
                </select>
                <button
                  className="btn-secondary"
                  disabled={!openName || !!busy}
                  onClick={() => void perform('open', openExisting)}
                >
                  Open for review
                </button>
              </details>
            </div>
            {!draft.advanced && (
              <details className="studio-yaml" open>
                <summary>Generated YAML · review exact target and settings</summary>
                <pre>{content}</pre>
              </details>
            )}
          </section>
          <aside className="studio-side space-y-4">
            <section className="card">
              <h2>
                <ShieldCheck size={18} />
                Validation
              </h2>
              <p className="studio-help">Checks apply to this task and this draft only.</p>
              <CheckRow label="YAML syntax" state={check ? check.syntaxValid : null} />
              <CheckRow label="Workflow shape" state={check ? check.shapeValid : null} />
              <CheckRow
                label="Declared credential references"
                state={
                  check?.references.length
                    ? check.references.every((ref) => ref.status === 'found')
                    : null
                }
              />
              <CheckRow label="Saved in Config Files" state={saved ? true : null} />
              <CheckRow label="Live preflight · Not run" state={null} />
              {check?.errors.map((item, i) => (
                <p className="studio-error" key={i}>
                  {item}
                </p>
              ))}
              <p className="studio-help">
                Reference presence does not prove authentication. Live preflight has not run.
              </p>
              <details className="studio-check-details">
                <summary>Reference & validation details</summary>
                {check?.references.map((ref) => (
                  <p className="studio-help" key={ref.name}>
                    {ref.name}: {ref.status === 'found' ? 'Declared' : 'Missing'}
                  </p>
                ))}
                {check?.warnings.map((item, i) => (
                  <p className="studio-help" key={i}>
                    {item}
                  </p>
                ))}
              </details>
              <button
                className="btn-secondary w-full"
                disabled={!!busy || !context}
                onClick={() =>
                  void perform('validate', async () => {
                    await validate()
                    setMessage('Authoring checks passed. Live preflight has not run.')
                  })
                }
              >
                {busy === 'validate' ? 'Validating…' : 'Validate configuration'}
              </button>
            </section>
            <section className="card">
              <h2>Pipeline handoff</h2>
              <p className="studio-help">
                Append one saved configuration after the existing steps. All existing steps remain
                unchanged.
              </p>
              <p>
                Action:{' '}
                <strong>
                  {task?.action === 'config-cluster'
                    ? 'Configure Cluster'
                    : title(task?.action || '')}
                </strong>
              </p>
              <label>
                Existing pipeline
                <select
                  className="input w-full"
                  value={pipelineId}
                  onChange={(event) => setPipelineId(event.target.value)}
                >
                  <option value="">Select a pipeline</option>
                  {context?.pipelines
                    .filter((p) => !p.executor || p.executor === 'legacy')
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.steps.length} steps
                      </option>
                    ))}
                </select>
              </label>
              <p className="studio-help">
                Execution and approvals stay in Pipelines. Saving or handing off starts no jobs.
              </p>
              {task?.handoffError && (
                <p className="studio-error">
                  {task.handoffError} Review it in Workflows; the current approval policy is
                  preserved.
                </p>
              )}
              <button
                className="btn-primary w-full"
                disabled={!canSave || !saved || !pipeline || !!busy || !!task?.handoffError}
                onClick={() => setReview(true)}
              >
                Review pipeline handoff <ArrowRight size={16} />
              </button>
              <Link to="/pipelines">Open pipelines ↗</Link>
            </section>
          </aside>
        </div>
        <footer className="card studio-footer">
          <span>{saved ? 'Saved configuration' : 'Unsaved draft'} · No execution started</span>
          <div>
            <button className="btn-secondary" disabled={!content || !!busy} onClick={exportYaml}>
              <Download size={16} />
              Export YAML
            </button>
            <button
              className="btn-primary"
              disabled={!canSave || !ready || !context || !!busy || !draft.filename}
              onClick={() => void perform('save', save)}
            >
              {busy === 'save' ? 'Saving…' : 'Validate & save'}
            </button>
            {saved && (
              <button
                className="btn-primary"
                disabled={!canSave || !pipeline || !!busy || !!task?.handoffError}
                onClick={() => setReview(true)}
              >
                Use in pipeline <ArrowRight size={16} />
              </button>
            )}
            {saved && (
              <Link
                className="btn-secondary"
                to={`/configs?file=${encodeURIComponent(draft.filename)}`}
              >
                Open saved file
              </Link>
            )}
          </div>
        </footer>
        {review && pipeline && (
          <div className="studio-modal-backdrop">
            <section
              ref={dialogRef}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && !busy) setReview(false)
                if (event.key === 'Tab') {
                  const buttons =
                    dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
                  if (buttons?.length) {
                    const first = buttons[0],
                      last = buttons[buttons.length - 1]
                    if (event.shiftKey && document.activeElement === first) {
                      event.preventDefault()
                      last.focus()
                    } else if (!event.shiftKey && document.activeElement === last) {
                      event.preventDefault()
                      first.focus()
                    }
                  }
                }
              }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="handoff-title"
              className="card studio-modal"
            >
              <h2 id="handoff-title">Review pipeline handoff</h2>
              <p>{pipeline.name} · ZTF 1.x · Existing steps stay in order.</p>
              <ol>
                {pipeline.steps.map((step, index) => (
                  <li key={index}>
                    {index + 1}. {step.workflow} · {step.configFile} <span>Unchanged</span>
                  </li>
                ))}
                <li className="studio-success">
                  {pipeline.steps.length + 1}. {task?.action} · {draft.filename} · Append
                </li>
              </ol>
              <p>
                No execution or approval is requested here. Recovery runs keep their existing
                snapshots and completed work.
              </p>
              <div className="flex gap-3">
                <button
                  className="btn-secondary"
                  onClick={() => setReview(false)}
                  disabled={!!busy}
                >
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  disabled={!!busy || !saved}
                  onClick={() =>
                    void perform('handoff', async () => {
                      await jsonRequest('/api/yaml-studio/handoff', {
                        taskId,
                        filename: draft.filename,
                        contentHash: draft.savedHash,
                        pipelineId,
                        pipelineHash: pipeline.studioHash,
                      })
                      setReview(false)
                      await loadContext()
                      setMessage(
                        'Step appended. Existing steps and recovery runs are unchanged. Open Pipelines to review and run through the usual approvals.'
                      )
                    })
                  }
                >
                  {busy === 'handoff' ? 'Appending…' : 'Append saved step'}
                </button>
              </div>
            </section>
          </div>
        )}
      </fieldset>
    </Layout>
  )
}
function CheckRow({ label, state }: { label: string; state: boolean | null }) {
  const Icon = state === true ? CheckCircle2 : state === false ? XCircle : Circle
  return (
    <div
      className={`studio-result ${state === true ? 'studio-success' : state === false ? 'studio-error' : ''}`}
    >
      <Icon size={17} />
      <span>{label}</span>
      <small>{state === true ? 'Passed' : state === false ? 'Failed' : 'Not checked'}</small>
    </div>
  )
}
function Field({
  field,
  value,
  onChange,
}: {
  field: ScriptConfigField
  value: string | number | boolean | undefined
  onChange: (value: string | number | boolean) => void
}) {
  const required =
    field.required ||
    field.type === 'boolean' ||
    field.type === 'select' ||
    ['replication_factor', 'host_failures', 'job_title'].includes(field.key)
  if (field.type === 'list') {
    const rows = String(value ?? '').split('\n')
    return (
      <div className="studio-list-field" role="group" aria-label={field.label}>
        <label htmlFor={`studio-${field.key}-0`}>
          {field.label}
          {required ? ' *' : ''}
        </label>
        {rows.map((row, index) => (
          <div className="studio-list-row" key={index}>
            <input
              id={`studio-${field.key}-${index}`}
              aria-label={`${field.label} ${index + 1}`}
              className="input"
              value={row}
              placeholder="Server address"
              onChange={(event) =>
                onChange(
                  rows.map((current, i) => (i === index ? event.target.value : current)).join('\n')
                )
              }
            />
            <button
              aria-label={`Remove ${field.label} ${index + 1}`}
              className="btn-secondary"
              disabled={rows.length === 1}
              onClick={() => onChange(rows.filter((_, i) => i !== index).join('\n'))}
            >
              −
            </button>
          </div>
        ))}
        <button className="studio-add-server" onClick={() => onChange([...rows, ''].join('\n'))}>
          + Add server
        </button>
      </div>
    )
  }
  return (
    <label className={field.key === 'pe_credential' ? 'studio-wide' : undefined}>
      <span>
        {field.label}
        {required && <span aria-label="required"> *</span>}
      </span>
      {field.type === 'boolean' ? (
        <select
          className="input"
          value={value === undefined ? '' : String(value)}
          onChange={(event) =>
            onChange(event.target.value === '' ? '' : event.target.value === 'true')
          }
        >
          <option value="">Choose explicitly…</option>
          <option value="true">Enabled</option>
          <option value="false">Disabled</option>
        </select>
      ) : field.type === 'select' ? (
        <select
          className="input"
          value={String(value ?? '')}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Choose explicitly…</option>
          {field.options?.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      ) : (
        <input
          className="input"
          type={field.type === 'number' ? 'number' : 'text'}
          list={field.key.includes('credential') ? 'studio-refs' : undefined}
          value={String(value ?? '')}
          placeholder={
            field.key.includes('credential') ? 'Saved credential reference' : field.label
          }
          onChange={(event) => onChange(event.target.value)}
        />
      )}{' '}
      {field.help && <small className="studio-help">{field.help}</small>}
    </label>
  )
}
