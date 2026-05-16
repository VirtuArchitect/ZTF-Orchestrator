import { useState, useEffect } from 'react'
import { Save, FolderOpen } from 'lucide-react'
import Layout from '../components/Layout'
import { useStore } from '../store'

export default function Settings() {
  const { settings, setSettings } = useStore()
  const [form, setForm] = useState(settings)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(data => {
      setForm(data)
      setSettings(data)
    }).catch(() => {})
  }, [setSettings])

  const save = async () => {
    setSaving(true)
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      setSettings(form)
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
            <p className="text-xs text-gray-500 mt-1">Used when cloning during setup. Change for private forks.</p>
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
