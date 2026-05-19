import { useState, useEffect } from 'react'
import { Save, FolderOpen, Key, Eye, EyeOff } from 'lucide-react'
import Layout from '../components/Layout'
import { useStore } from '../store'
import { apiFetch } from '../utils/api'

export default function Settings() {
  const { settings, setSettings } = useStore()
  const [form, setForm] = useState(settings)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showKey, setShowKey] = useState(false)

  useEffect(() => {
    apiFetch('/api/settings').then(r => r.json()).then(data => {
      setForm(prev => ({ ...prev, ...data }))
      setSettings(data)
    }).catch(() => {})
  }, [setSettings])

  const save = async () => {
    setSaving(true)
    try {
      // Persist apiKey only in the local store — never send it to the server
      setSettings({ apiKey: form.apiKey })

      const { apiKey: _omit, ...serverSettings } = form
      await apiFetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serverSettings),
      })
      setSettings(serverSettings)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Layout
      title="Settings"
      subtitle="Configure ZTF path, Python executable, and other options"
      actions={
        <button onClick={save} disabled={saving} className="btn-primary gap-1.5">
          <Save size={14} />
          {saved ? 'Saved!' : saving ? 'Saving...' : 'Save Settings'}
        </button>
      }
    >
      <div className="max-w-2xl space-y-6">

        {/* API Key */}
        <div className="card border-amber-700/30 bg-amber-900/5">
          <div className="flex items-center gap-3 mb-4">
            <Key size={16} className="text-amber-400" />
            <h3 className="font-semibold text-gray-100">API Key</h3>
          </div>
          <p className="text-sm text-gray-400 mb-3">
            The server prints your API key on startup. Paste it here — it is stored only in your browser.
          </p>
          <div className="relative">
            <input
              className="input font-mono pr-10"
              type={showKey ? 'text' : 'password'}
              value={form.apiKey || ''}
              onChange={e => setForm(p => ({ ...p, apiKey: e.target.value }))}
              placeholder="Paste the key shown in the server console"
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              onClick={() => setShowKey(v => !v)}
            >
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            The key is auto-generated at <code className="bg-gray-800 px-1 rounded">~/.ztf-ui/.api_key</code> on first server start.
          </p>
        </div>

        {/* Framework Path */}
        <div className="card">
          <h3 className="font-semibold text-gray-100 mb-4">Framework Location</h3>
          <div className="space-y-4">
            <div>
              <label className="label">ZTF Installation Path</label>
              <div className="flex gap-2">
                <input
                  className="input flex-1"
                  value={form.ztfPath}
                  onChange={e => setForm(p => ({ ...p, ztfPath: e.target.value }))}
                  placeholder="/home/user/zerotouch-framework"
                />
                <button className="btn-secondary flex-shrink-0 px-3">
                  <FolderOpen size={14} />
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">Path to the cloned ZeroTouch Framework directory containing main.py</p>
            </div>

            <div>
              <label className="label">Python Executable</label>
              <input
                className="input font-mono"
                value={form.pythonPath}
                onChange={e => setForm(p => ({ ...p, pythonPath: e.target.value }))}
                placeholder="python3"
              />
              <p className="text-xs text-gray-500 mt-1">
                Path to Python 3.9+ executable (e.g., <code className="font-mono bg-gray-800 px-1 rounded">python3</code>,{' '}
                <code className="font-mono bg-gray-800 px-1 rounded">/usr/bin/python3.11</code>)
              </p>
            </div>

            <div>
              <label className="label">Config Files Directory</label>
              <div className="flex gap-2">
                <input
                  className="input flex-1 font-mono"
                  value={form.configDir}
                  onChange={e => setForm(p => ({ ...p, configDir: e.target.value }))}
                  placeholder="~/.ztf-ui/configs"
                />
                <button className="btn-secondary flex-shrink-0 px-3">
                  <FolderOpen size={14} />
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">Where generated config files are stored before passing to ZTF</p>
            </div>
          </div>
        </div>

        {/* Repository */}
        <div className="card">
          <h3 className="font-semibold text-gray-100 mb-4">Repository</h3>
          <div>
            <label className="label">ZTF Repository URL</label>
            <input
              className="input font-mono"
              value={form.repoUrl}
              onChange={e => setForm(p => ({ ...p, repoUrl: e.target.value }))}
              placeholder="https://github.com/nutanixdev/zerotouch-framework.git"
            />
            <p className="text-xs text-gray-500 mt-1">Used when cloning during setup. Must be the official ZTF repository.</p>
          </div>
        </div>

        {/* About */}
        <div className="card bg-nutanix-blue/5 border-nutanix-blue/20">
          <h3 className="font-semibold text-gray-100 mb-2">About ZTF UI</h3>
          <p className="text-sm text-gray-400 leading-relaxed">
            ZeroTouch Framework UI is an open-source web interface for the{' '}
            <a
              href="https://github.com/nutanixdev/zerotouch-framework"
              target="_blank"
              rel="noopener noreferrer"
              className="text-nutanix-cyan hover:underline"
            >
              Nutanix ZeroTouch Framework
            </a>
            {' '}— providing a visual alternative to GitHub Actions and CLI-based configuration management.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-gray-500">
            <div>UI Version: <span className="text-gray-300">1.0.0</span></div>
            <div>ZTF Supported: <span className="text-gray-300">AOS 6.5+, PC 2022.6+</span></div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
