import { useState, useEffect } from 'react'
import { FileCode, Plus, Trash2, Save, Download, Upload, RefreshCw } from 'lucide-react'
import Layout from '../components/Layout'
import clsx from 'clsx'
import { apiFetch } from '../utils/api'

interface ConfigFile {
  name: string
  size: number
  modified: string
}

export default function ConfigFiles() {
  const [files, setFiles] = useState<ConfigFile[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [newFileName, setNewFileName] = useState('')

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
    const resp = await apiFetch(`/api/configs/${encodeURIComponent(name)}`)
    if (resp.ok) {
      const data = await resp.json()
      setContent(data.content)
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
      <div className="flex gap-5 h-full">
        {/* File List */}
        <div className="w-72 flex-shrink-0 flex flex-col gap-3">
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

          <div className="card p-2 flex-1 overflow-y-auto">
            <div className="flex items-center justify-between px-2 py-1 mb-1">
              <span className="text-xs text-gray-500">{files.length} files</span>
              <button onClick={loadFiles} className="btn-ghost p-1">
                <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>

            {files.length === 0 && !loading && (
              <div className="text-center py-8 text-gray-500 text-sm">
                <FileCode size={28} className="mx-auto mb-2 opacity-30" />
                <p>No config files yet</p>
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
              <textarea
                className="flex-1 input font-mono text-xs resize-none rounded-t-none border-t-0 min-h-96"
                value={content}
                onChange={e => setContent(e.target.value)}
                spellCheck={false}
              />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <FileCode size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-lg font-medium">Select a config file</p>
                <p className="text-sm mt-1">Or create a new one using the input above</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
