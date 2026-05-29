import { useState, useEffect } from 'react'
import { FileCode, Plus, Trash2, Save, Download, Upload, RefreshCw, History, RotateCcw } from 'lucide-react'
import Layout from '../components/Layout'
import clsx from 'clsx'
import { apiFetch } from '../utils/api'

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
  const [files, setFiles] = useState<ConfigFile[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [newFileName, setNewFileName] = useState('')
  const [backups, setBackups] = useState<Backup[]>([])
  const [showBackups, setShowBackups] = useState(false)
  const [restoring, setRestoring] = useState<number | null>(null)

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
      await apiFetch(`/api/configs/${encodeURIComponent(selected)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
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
    await apiFetch(`/api/configs/${encodeURIComponent(fname)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '# New configuration file\n' }),
    })
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
      const text = await file.text()
      await apiFetch(`/api/configs/${encodeURIComponent(file.name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      })
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
      <div className="flex flex-col lg:flex-row gap-5 min-h-0 lg:h-full">
        {/* File List */}
        <div className="w-full lg:w-72 flex-shrink-0 flex flex-col gap-3">
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
              <span className="text-xs text-gray-500">{files.length} files</span>
              <button onClick={loadFiles} className="btn-ghost p-1">
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

            {files.map(file => (
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
                  <p className="text-xs text-gray-600">{(file.size / 1024).toFixed(1)} KB</p>
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
