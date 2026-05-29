import { useState, useEffect } from 'react'
import { Save, FolderOpen, Bell } from 'lucide-react'
import Layout from '../components/Layout'
import { useStore } from '../store'
import { apiFetch } from '../utils/api'

export default function Settings() {
  const { settings, setSettings, user } = useStore()
  const [form,   setForm]   = useState(settings)
  const [saved,  setSaved]  = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    apiFetch('/api/settings').then(r => r.json()).then(data => {
      setForm(prev => ({ ...prev, ...data }))
      setSettings(data)
    }).catch(() => {})
  }, [setSettings])

  const save = async () => {
    setSaving(true)
    try {
      await apiFetch('/api/settings', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      })
      setSettings(form)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const isAdmin = user?.role === 'admin'

  return (
    <Layout
      title="Settings"
      subtitle="Configure ZTF path, Python executable, and other options"
      actions={isAdmin ? (
        <button onClick={save} disabled={saving} className="btn-primary gap-1.5">
          <Save size={14} />
          {saved ? 'Saved!' : saving ? 'Saving…' : 'Save Settings'}
        </button>
      ) : undefined}
    >
      <div className="max-w-2xl space-y-6">

        {!isAdmin && (
          <div className="card border-amber-700/30 bg-amber-900/5 text-sm text-amber-400">
            Settings are read-only for your role. Contact an administrator to make changes.
          </div>
        )}

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
                  disabled={!isAdmin}
                  placeholder="/home/user/zerotouch-framework"
                />
                <button className="btn-secondary flex-shrink-0 px-3" disabled={!isAdmin}>
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
                disabled={!isAdmin}
                placeholder="python3"
              />
            </div>

            <div>
              <label className="label">Config Files Directory</label>
              <div className="flex gap-2">
                <input
                  className="input flex-1 font-mono"
                  value={form.configDir}
                  onChange={e => setForm(p => ({ ...p, configDir: e.target.value }))}
                  disabled={!isAdmin}
                  placeholder="~/.ztf-ui/configs"
                />
                <button className="btn-secondary flex-shrink-0 px-3" disabled={!isAdmin}>
                  <FolderOpen size={14} />
                </button>
              </div>
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
              disabled={!isAdmin}
              placeholder="https://github.com/nutanixdev/zerotouch-framework.git"
            />
            <p className="text-xs text-gray-500 mt-1">Used during setup. Must be the official ZTF repository or an approved internal mirror.</p>
          </div>
        </div>

        {/* Notifications */}
        <div className="card">
          <h3 className="font-semibold text-gray-100 mb-1 flex items-center gap-2">
            <Bell size={15} className="text-nutanix-cyan" />
            Notifications
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            POST a JSON summary to a URL when any workflow or script finishes. Leave blank to disable.
          </p>
          <div>
            <label className="label">Webhook URL</label>
            <input
              className="input font-mono"
              value={form.webhookUrl ?? ''}
              onChange={e => setForm(p => ({ ...p, webhookUrl: e.target.value }))}
              disabled={!isAdmin}
              placeholder="https://hooks.slack.com/services/…"
            />
            <p className="text-xs text-gray-500 mt-1">
              Receives <code className="font-mono bg-gray-800 px-1 rounded">POST</code> with{' '}
              <code className="font-mono bg-gray-800 px-1 rounded">workflow</code>,{' '}
              <code className="font-mono bg-gray-800 px-1 rounded">status</code>,{' '}
              <code className="font-mono bg-gray-800 px-1 rounded">user</code>, and{' '}
              <code className="font-mono bg-gray-800 px-1 rounded">timestamp</code> on every completion.
            </p>
          </div>
        </div>

        {/* About */}
        <div className="card bg-nutanix-blue/5 border-nutanix-blue/20">
          <h3 className="font-semibold text-gray-100 mb-2">About ZTF UI</h3>
          <p className="text-sm text-gray-400 leading-relaxed">
            ZeroTouch Framework UI is an open-source interface for the{' '}
            <a
              href="https://github.com/nutanixdev/zerotouch-framework"
              target="_blank"
              rel="noopener noreferrer"
              className="text-nutanix-cyan hover:underline"
            >
              Nutanix ZeroTouch Framework
            </a>.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-gray-500">
            <div>UI Version: <span className="text-gray-300">1.2.4</span></div>
            <div>ZTF Supported: <span className="text-gray-300">AOS 6.5+, PC 2022.6+</span></div>
            <div>Maintainer: <span className="text-gray-300">John Goulden</span></div>
            <div>Project: <span className="text-gray-300">ZTF-Orchestrator</span></div>
            <div>Signed in as: <span className="text-gray-300">{user?.username}</span></div>
            <div>Role: <span className="text-gray-300">{user?.role}</span></div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
