import { useState, useEffect } from 'react'
import { FileCode, Plus, Trash2, Save, Download, Upload, RefreshCw, History, RotateCcw, Wand2 } from 'lucide-react'
import Layout from '../components/Layout'
import ScriptConfigWizard from '../components/ScriptConfigWizard'
import { SCRIPTS } from '../data'
import clsx from 'clsx'
import { apiFetch } from '../utils/api'
import ConfigScope, { CONFIG_PURPOSES, configMatches, useConfigOrganization } from '../components/ConfigScope'

interface ConfigFile {
  name: string
  size: number
  modified: string
}

interface Backup {
  version: number
  size: number
  modified: number
}

export default function ConfigFiles() {
  const { organization, error: groupingError, ready, reload, assign } = useConfigOrganization()
  const [scope, setScope] = useState('all')
  const [search, setSearch] = useState('')
  const [purposeFilter, setPurposeFilter] = useState('')
  const [labelGroup, setLabelGroup] = useState('')
  const [labelPurpose, setLabelPurpose] = useState('')
  const [error, setError] = useState('')
  const [labelMessage, setLabelMessage] = useState('')
  const [files, setFiles] = useState<ConfigFile[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [newFileName, setNewFileName] = useState('')
  const [backups, setBackups] = useState<Backup[]>([])
  const [showBackups, setShowBackups] = useState(false)
  const [showWizard, setShowWizard] = useState(false)
  const [restoring, setRestoring] = useState<number | null>(null)

  useEffect(() => {
    const assignment = selected ? organization.assignments[selected] : undefined
    setLabelGroup(organization.groups.some(group => group.id === assignment?.groupId) ? assignment!.groupId : '')
    setLabelPurpose(assignment?.purpose || '')
  }, [selected, organization])
  useEffect(() => { setLabelMessage('') }, [selected])
  const saveLabels = async () => {
    if (!selected) return
    setLabelMessage('')
    try { await assign(selected, labelGroup, labelPurpose); setLabelMessage('Grouping saved. YAML and execution references are unchanged.'); setError('') }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to save labels.') }
  }
  const assignCreated = async (name: string) => {
    const groupId = organization.groups.some(group => group.id === scope) ? scope : ''
    if (!groupId && !purposeFilter) return
    try { await assign(name, groupId, purposeFilter) }
    catch (failure) { setError(`File saved, but grouping was not saved: ${failure instanceof Error ? failure.message : 'Reload and assign it manually.'}`) }
  }
  const loadFiles = async () => {
    setLoading(true)
    try {
      const resp = await apiFetch('/api/configs')
      if (resp.ok) setFiles(await resp.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadFiles() }, [])

  const openFile = async (name: string) => {
    setSelected(name)
    setShowBackups(false)
    setShowWizard(false)
    setBackups([])
    const resp = await apiFetch(`/api/configs/${encodeURIComponent(name)}`)
    if (resp.ok) {
      const data = await resp.json()
      setContent(data.content)
    }
    const bakResp = await apiFetch(`/api/configs/${encodeURIComponent(name)}/backups`)
    if (bakResp.ok) setBackups(await bakResp.json())
  }

  const restoreBackup = async (version: number) => {
    if (!selected || !confirm(`Restore version ${version}? The current file will be backed up first.`)) return
    setRestoring(version)
    try {
      const resp = await apiFetch(`/api/configs/${encodeURIComponent(selected)}/restore/${version}`, { method: 'POST' })
      if (resp.ok) {
        await openFile(selected)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    } finally {
      setRestoring(null)
    }
  }

  const save = async () => {
    if (!selected) return
    setSaving(true)
    try {
      const response = await apiFetch(`/api/configs/${encodeURIComponent(selected)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (!response.ok) { setError('File was not saved. Check YAML, permissions and connectivity.'); return }
      setError('')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const deleteFile = async (name: string) => {
    if (!confirm(`Delete ${name}?`)) return
    await apiFetch(`/api/configs/${encodeURIComponent(name)}`, { method: 'DELETE' })
    if (selected === name) { setSelected(null); setContent('') }
    loadFiles()
  }

  const createNew = async () => {
    const name = newFileName.trim()
    if (!name) return
    const fname = name.endsWith('.yml') || name.endsWith('.yaml') || name.endsWith('.json') ? name : `${name}.yml`
    if (files.some(file => file.name === fname)) { setError('That file already exists. Select it to edit.'); return }
    const response = await apiFetch(`/api/configs/${encodeURIComponent(fname)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '# New configuration file\n' }),
    })
    if (!response.ok) { setError('Unable to create file.'); return }
    setError('')
    await assignCreated(fname)
    setNewFileName('')
    await loadFiles()
    openFile(fname)
  }

  const download = () => {
    if (!selected || !content) return
    const blob = new Blob([content], { type: 'text/yaml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = selected; a.click()
    URL.revokeObjectURL(url)
  }

  const uploadFile = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.yml,.yaml,.json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      if (files.some(existing => existing.name === file.name) && !confirm(`Replace ${file.name}? Its current content will be backed up.`)) return
      const text = await file.text()
      const response = await apiFetch(`/api/configs/${encodeURIComponent(file.name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      })
      if (!response.ok) { setError('Upload was not saved. Check YAML and permissions.'); return }
      setError('')
      if (!files.some(existing => existing.name === file.name)) await assignCreated(file.name)
      await loadFiles()
      openFile(file.name)
    }
    input.click()
  }

  return (
    <Layout
      title="Config Files"
      subtitle="Manage YAML/JSON configuration files"
      actions={
        <div className="flex gap-2">
          <button onClick={uploadFile} className="btn-secondary gap-1.5">
            <Upload size={14} />Upload
          </button>
          {selected && (
            <>
              {backups.length > 0 && (
                <button
                  onClick={() => setShowBackups(v => !v)}
                  className={clsx('btn-secondary gap-1.5', showBackups && 'border-nutanix-blue/60 text-nutanix-cyan')}
                >
                  <History size={14} />
                  History ({backups.length})
                </button>
              )}
              <button
                onClick={() => { setShowWizard(v => !v); setShowBackups(false) }}
                className={clsx('btn-secondary gap-1.5', showWizard && 'border-nutanix-blue/60 text-nutanix-cyan')}
              >
                <Wand2 size={14} />
                Wizard
              </button>
              <button onClick={download} className="btn-secondary gap-1.5">
                <Download size={14} />Download
              </button>
              <button onClick={save} disabled={saving} className="btn-primary gap-1.5">
                <Save size={14} />
                {saved ? 'Saved!' : saving ? 'Saving...' : 'Save'}
              </button>
            </>
          )}
        </div>
      }
    >
      {(error || groupingError) && <p role="alert" className="text-amber-600 mb-3">{error || groupingError}<button className="btn-secondary ml-2" onClick={() => void reload()}>Reload grouping</button></p>}
      <div className="flex flex-col lg:flex-row gap-5 min-h-0 lg:h-full">
        <aside className="card p-3 w-full lg:w-52 flex-shrink-0 overflow-y-auto" aria-label="Datacenter and cluster groups"><h2 className="font-semibold mb-2">Datacenters &amp; clusters</h2><ConfigScope organization={organization} scope={scope} onChange={setScope} /></aside>
        {/* File List */}
        <div className="w-full lg:w-72 flex-shrink-0 flex flex-col gap-3">
          <input aria-label="Search config files" className="input w-full" placeholder="Search filename, cluster or purpose" value={search} onChange={event => setSearch(event.target.value)} />
          <select aria-label="Filter by purpose" className="input w-full" value={purposeFilter} onChange={event => setPurposeFilter(event.target.value)}>{CONFIG_PURPOSES.map(purpose => <option key={purpose} value={purpose}>{purpose || 'All purposes'}</option>)}</select>
          <p className="text-xs text-gray-500">New files and uploads use the selected group and purpose. All files / datacenter selection leaves them Ungrouped.</p>
          {/* New file */}
          <div className="flex gap-2">
            <input
              className="input flex-1 text-sm"
              value={newFileName}
              onChange={e => setNewFileName(e.target.value)}
              placeholder="new-config.yml"
              onKeyDown={e => e.key === 'Enter' && createNew()}
            />
            <button onClick={createNew} className="btn-primary px-3">
              <Plus size={14} />
            </button>
          </div>

          <div className="card p-2 flex-1 overflow-y-auto min-h-56 lg:min-h-0">
            <div className="flex items-center justify-between px-2 py-1 mb-1">
              <span className="text-xs text-gray-500">{files.filter(file => configMatches(file.name, organization, scope, search, purposeFilter)).length} / {files.length} files</span>
              <button aria-label="Refresh files and groups" onClick={() => { void loadFiles(); void reload() }} className="btn-ghost p-1">
                <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>

            {files.length === 0 && !loading && (
              <div className="empty-state py-8 text-sm">
                <FileCode size={28} className="mx-auto mb-2 text-gray-700" />
                <p className="font-medium text-gray-400">No config files yet</p>
                <p className="text-xs text-gray-600 mt-1">Create a YAML file or upload an existing config.</p>
              </div>
            )}

            {files.length > 0 && !files.some(file => configMatches(file.name, organization, scope, search, purposeFilter)) && <p className="text-sm px-2 py-4 text-gray-500">No files match these filters. Choose All files or clear search and purpose.</p>}
            {files.filter(file => configMatches(file.name, organization, scope, search, purposeFilter)).map(file => (
              <div
                key={file.name}
                className={clsx(
                  'flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer group transition-all',
                  selected === file.name
                    ? 'bg-nutanix-blue/20 border border-nutanix-blue/30'
                    : 'hover:bg-surface-elevated'
                )}
                onClick={() => openFile(file.name)}
              >
                <FileCode size={14} className="text-gray-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-300 truncate font-medium">{file.name}</p>
                  <p className="text-xs text-gray-600">{(file.size / 1024).toFixed(1)} KB · {organization.assignments[file.name]?.purpose || 'No purpose'}</p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); deleteFile(file.name) }}
                  className="btn-ghost p-1 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 flex flex-col gap-3 min-w-0">
          {selected ? (
            <>
              <div className="card p-3 space-y-2"><h2 className="font-semibold">File grouping</h2>
                <label className="block text-sm">Datacenter / cluster<select aria-label="File group" className="input w-full" value={labelGroup} onChange={event => setLabelGroup(event.target.value)}><option value="">Ungrouped</option>{organization.groups.map(group => <option key={group.id} value={group.id}>{group.kind === 'shared' ? 'Shared' : group.datacenter} / {group.name}</option>)}</select></label>
                <label className="block text-sm">Purpose<select aria-label="File purpose" className="input w-full" value={labelPurpose} onChange={event => setLabelPurpose(event.target.value)}>{CONFIG_PURPOSES.map(purpose => <option key={purpose} value={purpose}>{purpose || 'No purpose'}</option>)}</select></label>
                <button type="button" className="btn-secondary" disabled={!ready} onClick={() => void saveLabels()}>Save grouping</button>
                {labelMessage && <p role="status" className="text-green-600 text-sm">{labelMessage}</p>}
              </div>
              {showWizard && (
                <ScriptConfigWizard
                  scriptIds={SCRIPTS.map(script => script.id)}
                  onGenerate={setContent}
                />
              )}

              <div className="flex items-center gap-2 px-4 py-3 bg-gray-900 rounded-t-xl border border-border">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/60" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                  <div className="w-3 h-3 rounded-full bg-green-500/60" />
                </div>
                <span className="flex-1 text-center text-xs font-mono text-gray-400">{selected}</span>
              </div>

              {showBackups ? (
                <div className="flex-1 card overflow-y-auto min-h-96">
                  <div className="flex items-center gap-2 mb-4">
                    <History size={15} className="text-nutanix-cyan" />
                    <h3 className="font-semibold text-gray-200 text-sm">Version History</h3>
                    <span className="text-xs text-gray-500 ml-auto">Restoring backs up the current file first</span>
                  </div>
                  <div className="space-y-2">
                    {backups.map(bak => (
                      <div
                        key={bak.version}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-surface-elevated border border-border"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-300 font-medium">Version {bak.version}</p>
                          <p className="text-xs text-gray-500">
                            {new Date(bak.modified * 1000).toLocaleString()} &mdash; {(bak.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                        <button
                          onClick={() => restoreBackup(bak.version)}
                          disabled={restoring !== null}
                          className="btn-secondary text-xs gap-1.5 flex-shrink-0"
                        >
                          <RotateCcw size={12} className={restoring === bak.version ? 'animate-spin' : ''} />
                          {restoring === bak.version ? 'Restoring…' : 'Restore'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <textarea
                  className="flex-1 input font-mono text-xs resize-none rounded-t-none border-t-0 min-h-96"
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  spellCheck={false}
                />
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500 min-h-96">
              <div className="empty-state max-w-md">
                <FileCode size={40} className="mx-auto mb-3 text-gray-700" />
                <p className="text-lg font-medium text-gray-400">Select a config file</p>
                <p className="text-sm mt-1 text-gray-600">Choose a file from the list, create a new YAML file, or upload an existing config.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
