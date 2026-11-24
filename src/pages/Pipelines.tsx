import { useState, useEffect } from 'react'
import {
  Plus, Trash2, Play, Edit2, Save, X, ChevronUp,
  ChevronDown, GitBranch, RefreshCw, FileCode,
} from 'lucide-react'
import Layout from '../components/Layout'
import PipelineModal from '../components/PipelineModal'
import { apiFetch } from '../utils/api'
import { WORKFLOWS, SCRIPTS } from '../data'
import { PASSWORD_SETUP_WORKFLOW } from '../utils/initialPasswordSetup'
import { actionName } from '../startGuide'
import type { Pipeline, PipelineStep } from '../types'
import { useStore } from '../store'
import clsx from 'clsx'
import ConfigScope, { ScopedConfigPicker, useConfigOrganization } from '../components/ConfigScope'

type ConfigFile = { name: string }

export default function Pipelines() {
  const { organization, error: groupingError, ready: groupsReady, reload: reloadGroups } = useConfigOrganization()
  const [scope, setScope] = useState(() => new URLSearchParams(window.location.search).get('group') || 'all')
  const changeScope = (value: string) => {
    setScope(value)
    const url = new URL(window.location.href)
    if (value === 'all') url.searchParams.delete('group')
    else url.searchParams.set('group', value)
    window.history.replaceState(null, '', url)
  }
  const [search, setSearch] = useState('')
  const [formGroup, setFormGroup] = useState('')
  const groupFor = (id?: string) => organization.groups.find(group => group.id === id)
  const requiredApprovals = useStore(s => s.settings.approvalRequiredWorkflows || [])
  const selectableWorkflows = WORKFLOWS.filter(w => w.id === PASSWORD_SETUP_WORKFLOW || (w.id !== 'cvm-idrac-password-rotation' && !requiredApprovals.includes(w.id)))
  const admin = useStore(s => s.user?.role === 'admin')
  const [pipelines,   setPipelines]   = useState<Pipeline[]>([])
  const [configs,     setConfigs]     = useState<ConfigFile[]>([])
  const [loading,     setLoading]     = useState(true)
  const [editId,      setEditId]      = useState<string | null>(null)
  const [running,     setRunning]     = useState<Pipeline | null>(null)
  const [error,       setError]       = useState('')

  // New / edit form state
  const [formName,    setFormName]    = useState('')
  const [formSteps,   setFormSteps]   = useState<PipelineStep[]>([])
  const [convert, setConvert] = useState(false)
  const [creating,    setCreating]    = useState(false)

  const visiblePipelines = pipelines.filter(pipeline => {
    const group = groupFor(pipeline.groupId)
    const inScope = scope === 'all' || (scope === 'ungrouped' ? !group : scope.startsWith('dc:') ? group?.datacenter === scope.slice(3) : group?.id === scope)
    return inScope && `${pipeline.name} ${group?.name || ''} ${group?.datacenter || ''} ${pipeline.steps.map(step => step.configFile).join(' ')}`.toLowerCase().includes(search.toLowerCase())
  })

  const load = async () => {
    setLoading(true)
    try {
      const [pResp, cResp] = await Promise.all([
        apiFetch('/api/pipelines'),
        apiFetch('/api/configs'),
      ])
      if (!pResp.ok) throw new Error('Pipelines could not be loaded. Refresh before making changes.')
      setPipelines(await pResp.json())
      if (cResp.ok) setConfigs(await cResp.json())
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to load pipelines.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // ── Step helpers ─────────────────────────────────────────────────────────────

  const addStep = () =>
    setFormSteps(prev => [...prev, { workflow: selectableWorkflows[0]?.id || '', configFile: '' }])

  const removeStep = (i: number) =>
    setFormSteps(prev => prev.filter((_, idx) => idx !== i))

  const updateStep = (i: number, field: keyof PipelineStep, value: string) =>
    setFormSteps(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s))

  const moveStep = (i: number, dir: -1 | 1) => {
    setFormSteps(prev => {
      const next = [...prev]
      const tmp  = next[i + dir]
      next[i + dir] = next[i]
      next[i]       = tmp
      return next
    })
  }

  // ── Save / create ─────────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditId(null)
    setFormName('')
    setFormGroup(groupFor(scope) ? scope : '')
    setFormSteps([{ workflow: selectableWorkflows[0]?.id || '', configFile: '' }])
    setConvert(false)
    setCreating(true)
    setError('')
  }

  const openEdit = (p: Pipeline) => {
    setEditId(p.id)
    setFormName(p.name)
    setFormGroup(p.groupId || '')
    setFormSteps(p.steps.map(s => ({ ...s })))
    setConvert(false)
    setCreating(true)
    setError('')
  }

  const cancelForm = () => { setCreating(false); setEditId(null); setError('') }

  const save = async () => {
    if (!formName.trim())     { setError('Pipeline name is required'); return }
    if (formSteps.length < 1) { setError('Add at least one step'); return }
    setError('')

    const body = { name: formName.trim(), steps: formSteps, groupId: formGroup, ...(convert ? { executor: 'legacy' } : {}) }
    const resp = editId
      ? await apiFetch(`/api/pipelines/${editId}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      : await apiFetch('/api/pipelines', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })

    if (!resp.ok) { const d = await resp.json(); setError(d.error || 'Save failed'); return }
    changeScope(groupFor(formGroup) ? formGroup : 'ungrouped')
    setSearch('')
    cancelForm()
    void load()
  }

  const deletePipeline = async (id: string, name: string) => {
    if (!confirm(`Delete pipeline "${name}"?`)) return
    await apiFetch(`/api/pipelines/${id}`, { method: 'DELETE' })
    load()
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      <Layout
        title="Pipelines"
        subtitle="Chain workflows sequentially with pass/fail gates"
        actions={
          <div className="flex gap-2">
            <button onClick={() => { void load(); void reloadGroups() }} disabled={loading} className="btn-ghost p-2">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            {!creating && (
              <button onClick={openCreate} className="btn-primary gap-1.5">
                <Plus size={14} /> New Pipeline
              </button>
            )}
          </div>
        }
      >
        {error && !creating && <p role="alert" className="text-red-400 mb-3">{error}</p>}
        {groupingError && <p role="alert" className="text-amber-600 mb-3">{groupingError} Existing pipelines remain accessible.<button className="btn-secondary ml-2" onClick={() => void reloadGroups()}>Reload groups</button></p>}
        <div className="flex flex-col lg:flex-row gap-4 items-start">
          <aside className="card p-3 w-full lg:w-56 shrink-0" aria-label="Pipeline datacenters and clusters">
            <h2 className="font-semibold mb-2">Datacenters &amp; clusters</h2>
            <ConfigScope organization={organization} scope={scope} onChange={changeScope} allLabel="All pipelines" hint="Manage groups in Global Config. Grouping does not change YAML targets or permissions." />
          </aside>
          <section className="min-w-0 w-full flex-1" aria-label="Pipeline workspace">
            <h2 className="font-semibold mb-2">{scope === 'all' ? 'All pipelines' : scope === 'ungrouped' ? 'Ungrouped' : scope.startsWith('dc:') ? scope.slice(3) : groupFor(scope)?.name || 'Group unavailable'}</h2>
            <input className="input w-full mb-4" aria-label="Search pipelines" placeholder="Search pipelines, cluster or configuration file" value={search} onChange={event => setSearch(event.target.value)} />
        {creating && (
          <div className="card mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-100 flex items-center gap-2">
                <GitBranch size={15} className="text-nutanix-cyan" />
                {editId ? 'Edit Pipeline' : 'New Pipeline'}
              </h3>
              <button onClick={cancelForm} className="btn-ghost p-1.5">
                <X size={14} />
              </button>
            </div>

            {pipelines.find(p => p.id === editId)?.executor === 'native' && (
              <div className="mb-4 space-y-2">
                <p>This saved pipeline uses the retired Native executor. Review its actions and YAML before converting.</p>
                {admin && <label><input type="checkbox" checked={convert} onChange={e => setConvert(e.target.checked)} /> Convert to ZTF 1.x when saving</label>}
              </div>
            )}
            <label className="label">Datacenter / cluster
              <select aria-label="Pipeline group" className="input w-full" value={formGroup} disabled={!groupsReady} onChange={event => setFormGroup(event.target.value)}>
                <option value="">Ungrouped</option>
                {formGroup && !groupFor(formGroup) && <option value={formGroup}>Previous group unavailable (retained)</option>}
                {organization.groups.map(group => <option key={group.id} value={group.id}>{group.kind === 'shared' ? 'Shared' : group.datacenter} / {group.name}</option>)}
              </select>
            </label>
            <p className="text-xs text-gray-500 mb-4">Grouping organises pipelines only. Review each step's YAML for its actual targets.</p>
            {/* Name */}
            <div className="mb-4">
              <label className="label">Pipeline Name</label>
              <input
                className="input"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="e.g. Full Site Deployment"
                onKeyDown={e => e.key === 'Enter' && save()}
              />
            </div>

            {/* Steps */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">Steps (executed in order)</label>
                <button onClick={addStep} className="btn-secondary text-xs gap-1.5">
                  <Plus size={12} /> Add Step
                </button>
              </div>

              {formSteps.length === 0 && (
                <div className="text-center py-6 text-gray-500 text-sm border border-dashed border-border rounded-lg">
                  No steps yet — click Add Step to begin
                </div>
              )}

              <div className="space-y-2">
                {formSteps.map((step, i) => (
                  <div key={i} className="flex items-center gap-2 p-3 rounded-lg bg-surface border border-border">
                    {/* Step number */}
                    <span className="text-xs text-gray-500 w-5 flex-shrink-0 text-center font-mono">{i + 1}</span>

                    {/* Workflow selector */}
                    <select
                      className="input flex-1 text-sm"
                      value={step.workflow}
                      onChange={e => updateStep(i, 'workflow', e.target.value)}
                    >
                      {selectableWorkflows.map(w => (
                        <option key={w.id} value={w.id}>{w.name}</option>
                      ))}
                      {SCRIPTS.filter(s => ['ChangeDefaultAdminPasswordPe', 'CreateLocalUsersPe', 'SetPrismLoginTitlePe'].includes(s.id)).map(s => (
                        <option key={s.id} value={s.id}>{s.name} (Script)</option>
                      ))}
                    </select>

                    {/* Config file selector */}
                    <ScopedConfigPicker key={`${editId || 'new'}:${formGroup}:${i}`} initialScope={groupFor(formGroup) ? formGroup : 'all'} files={configs} value={step.configFile} onChange={name => updateStep(i, 'configFile', name)} />

                    {/* Reorder */}
                    <div className="flex flex-col gap-0.5">
                      <button
                        onClick={() => moveStep(i, -1)} disabled={i === 0}
                        className="btn-ghost p-0.5 disabled:opacity-20"
                      ><ChevronUp size={12} /></button>
                      <button
                        onClick={() => moveStep(i, 1)} disabled={i === formSteps.length - 1}
                        className="btn-ghost p-0.5 disabled:opacity-20"
                      ><ChevronDown size={12} /></button>
                    </div>

                    {/* Remove */}
                    <button onClick={() => removeStep(i)} className="btn-ghost p-1.5 text-red-400 hover:text-red-300">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

            <div className="flex gap-2">
              <button onClick={save} className="btn-primary gap-1.5">
                <Save size={14} /> {editId ? 'Update' : 'Create'} Pipeline
              </button>
              <button onClick={cancelForm} className="btn-secondary">Cancel</button>
            </div>
          </div>
        )}

        {/* ── Pipeline list ──────────────────────────────────────────────────── */}
        {!loading && visiblePipelines.length === 0 && !creating && (
          <div className="card text-center py-16">
            <GitBranch size={40} className="mx-auto mb-3 opacity-20 text-nutanix-cyan" />
            <p className="text-lg font-medium text-gray-400">No pipelines in this view</p>
            <p className="text-sm text-gray-600 mt-1 mb-4">
              Create a pipeline for the selected cluster, or choose All pipelines to find existing work.
            </p>
            <button onClick={openCreate} className="btn-primary gap-1.5">
              <Plus size={14} /> Create your first pipeline
            </button>
          </div>
        )}

        <div className="space-y-4">
          {visiblePipelines.map(pipeline => (
            <div key={pipeline.id} className="card">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-nutanix-blue/10 border border-nutanix-blue/20 flex items-center justify-center flex-shrink-0">
                  <GitBranch size={18} className="text-nutanix-cyan" />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-100">{pipeline.name}</p>
                  <p className="text-xs text-gray-500">{groupFor(pipeline.groupId) ? `${groupFor(pipeline.groupId)!.kind === 'shared' ? 'Shared' : groupFor(pipeline.groupId)!.datacenter} / ${groupFor(pipeline.groupId)!.name}` : 'Ungrouped'}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {pipeline.steps.length} step{pipeline.steps.length !== 1 ? 's' : ''}
                    {' · '}Updated {new Date(pipeline.updatedAt).toLocaleDateString()}
                  </p>

                  {/* Step chips */}
                  <div className="flex flex-wrap items-center gap-1.5 mt-3">
                    {pipeline.steps.map((step, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <span className="px-2 py-0.5 rounded-md bg-surface border border-border text-xs text-gray-400 font-mono">
                          <span title={`Action ID: ${step.workflow}`}>{actionName(step.workflow)}</span>
                        </span>
                        {step.configFile && (
                          <span className="flex items-center gap-0.5 text-xs text-gray-600">
                            <FileCode size={10} />{step.configFile}
                          </span>
                        )}
                        {i < pipeline.steps.length - 1 && (
                          <span className="text-gray-600 text-xs">→</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => openEdit(pipeline)}
                    className="btn-ghost p-2 text-gray-500 hover:text-gray-300"
                    title="Edit pipeline"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={() => deletePipeline(pipeline.id, pipeline.name)}
                    className="btn-ghost p-2 text-gray-500 hover:text-red-400"
                    title="Delete pipeline"
                  >
                    <Trash2 size={14} />
                  </button>
                  <button
                    onClick={() => setRunning(pipeline)}
                    disabled={pipeline.steps.length === 0 || pipeline.executor === 'native'}
                    className="btn-success gap-1.5"
                  >
                    <Play size={14} /> {pipeline.executor === 'native' ? 'Review required' : 'Run'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
          </section>
        </div>
      </Layout>

      {/* ── Pipeline execution modal ─────────────────────────────────────────── */}
      {running && (
        <PipelineModal
          pipeline={running}
          onClose={() => { setRunning(null); load() }}
        />
      )}
    </>
  )
}
