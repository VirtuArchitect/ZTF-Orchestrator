import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import yaml from 'js-yaml'

// ─── Minimal htm-like tagged template for React.createElement ────────────────
// Using a simple JSX-free component style with React.createElement
const e = React.createElement

// ─── Data Definitions ────────────────────────────────────────────────────────

const WORKFLOWS = [
  { id: 'cluster-create', name: 'Cluster Create', desc: 'Create clusters via Foundation Central', category: 'Infrastructure', configFile: 'create_cluster.yml', icon: '🖥', details: 'Full cluster creation including node imaging via Foundation Central. Supports RF-2 and RF-3.' },
  { id: 'imaging-only', name: 'Imaging Only', desc: 'Image nodes without cluster creation', category: 'Infrastructure', configFile: 'imaging_only.yml', icon: '💿', details: 'Image Nutanix nodes with AOS/AHV without forming a cluster. For hardware pre-staging.' },
  { id: 'imaging', name: 'Pod Imaging', desc: 'Pod workflow: imaging + cluster creation', category: 'Pod Operations', configFile: 'pod-deploy.yml', icon: '📦', details: 'Complete pod deployment: images nodes and creates clusters as part of pod management.' },
  { id: 'site-deploy', name: 'Site Deploy', desc: 'Multi-site: imaging, clusters, and config', category: 'Infrastructure', configFile: 'sites-deploy.yml', icon: '🌐', details: 'Deploy multiple sites each with imaging parameters, network config, and multiple clusters.' },
  { id: 'config-cluster', name: 'Configure Cluster', desc: 'AD, storage, VLANs, NTP/DNS, HA config', category: 'Configuration', configFile: 'cluster-config.yml', icon: '⚙️', details: 'Day-1/Day-2 cluster config: Active Directory, storage containers, VLANs, HA settings.' },
  { id: 'deploy-pc', name: 'Deploy Prism Central', desc: 'Deploy Prism Central VMs', category: 'Prism Central', configFile: 'pc-deploy.yml', icon: '☁️', details: 'Deploy PC VMs with size (small/large/xlarge), CMSP microservices, NTP/DNS, multi-PC cluster.' },
  { id: 'config-pc', name: 'Configure Prism Central', desc: 'AD, SAML, security, NKE, Objects', category: 'Prism Central', configFile: 'pc-config.yml', icon: '🎛', details: 'Configure PC: Active Directory, SAML SSO, microsegmentation, NKE, Objects, DR, Flow policies.' },
  { id: 'pod-config', name: 'Pod Config', desc: 'Configure pod and edge site clusters', category: 'Pod Operations', configFile: 'pod-config.yml', icon: '🔀', details: 'Pod-level infrastructure configuration for Nutanix Validated Designs across edge sites.' },
  { id: 'deploy-management-pc', name: 'Deploy Management PC', desc: 'Deploy PC and NCM management instances', category: 'Pod Operations', configFile: 'pod-management-deploy.yml', icon: '🖥', details: 'Deploy management Prism Central and NCM for centralized pod management.' },
  { id: 'config-management-pc', name: 'Configure Management PC', desc: 'Initialize and configure PC and NCM', category: 'Pod Operations', configFile: 'pod-management-config.yml', icon: '🔧', details: 'Post-deployment configuration of management PC and NCM.' },
  { id: 'calm-vm-workloads', name: 'Calm VM Workloads', desc: 'Deploy workloads via Calm DSL', category: 'Workloads', configFile: 'create-vm-workloads.yml', icon: '💻', details: 'Deploy application workloads using Calm DSL blueprints across projects and clusters.' },
  { id: 'calm-edgeai-vm-workload', name: 'Edge AI Workload', desc: 'Deploy Edge-AI workloads', category: 'Workloads', configFile: 'edge-ai.json', icon: '⚡', details: 'Deploy AI/ML workloads at edge sites using optimized Calm blueprints.' },
  { id: 'ndb', name: 'NDB Deploy', desc: 'Deploy Nutanix Database Service', category: 'Services', configFile: 'ndb.yml', icon: '🗄', details: 'Full NDB deployment: VM provisioning, compute profiles, cluster registration, network profiles.' },
]

const SCRIPTS = [
  { id: 'AddAdServerPe', name: 'Add AD Server (PE)', cat: 'Authentication', desc: 'Add Active Directory to Prism Element' },
  { id: 'AddAdServerPc', name: 'Add AD Server (PC)', cat: 'Authentication', desc: 'Add Active Directory to Prism Central' },
  { id: 'CreateRoleMappingPe', name: 'Create Role Mapping (PE)', cat: 'Authentication', desc: 'Create AD role mappings in Prism Element' },
  { id: 'CreateRoleMappingPc', name: 'Create Role Mapping (PC)', cat: 'Authentication', desc: 'Create AD role mappings in Prism Central' },
  { id: 'CreateLocalUser', name: 'Create Local User', cat: 'Authentication', desc: 'Create a local user account' },
  { id: 'AddSamlIdp', name: 'Add SAML IDP', cat: 'Authentication', desc: 'Configure SAML identity provider' },
  { id: 'CreateSubnetPe', name: 'Create Subnet (PE)', cat: 'Networking', desc: 'Create network subnet on Prism Element' },
  { id: 'CreateSubnetPc', name: 'Create Subnet (PC)', cat: 'Networking', desc: 'Create network subnet on Prism Central' },
  { id: 'DeleteSubnetPe', name: 'Delete Subnet (PE)', cat: 'Networking', desc: 'Remove a network subnet' },
  { id: 'CreateVpc', name: 'Create VPC', cat: 'Networking', desc: 'Create a Virtual Private Cloud' },
  { id: 'UpdateDnsNtp', name: 'Update DNS/NTP', cat: 'Networking', desc: 'Update DNS and NTP servers' },
  { id: 'EnableFlowNetworking', name: 'Enable Flow Networking', cat: 'Networking', desc: 'Enable Nutanix Flow networking' },
  { id: 'CreateContainer', name: 'Create Container', cat: 'Storage', desc: 'Create storage container' },
  { id: 'DeleteContainer', name: 'Delete Container', cat: 'Storage', desc: 'Remove storage container' },
  { id: 'CreateObjectStore', name: 'Create Object Store', cat: 'Storage', desc: 'Create S3-compatible object store' },
  { id: 'CreateBucket', name: 'Create Bucket', cat: 'Storage', desc: 'Create storage bucket' },
  { id: 'CreateVm', name: 'Create VM', cat: 'Compute', desc: 'Create a virtual machine' },
  { id: 'DeleteVm', name: 'Delete VM', cat: 'Compute', desc: 'Remove a virtual machine' },
  { id: 'CloneVm', name: 'Clone VM', cat: 'Compute', desc: 'Clone an existing VM' },
  { id: 'UploadImage', name: 'Upload Image', cat: 'Images', desc: 'Upload disk image to library' },
  { id: 'DeleteImage', name: 'Delete Image', cat: 'Images', desc: 'Remove image from library' },
  { id: 'CreateSecurityPolicy', name: 'Create Security Policy', cat: 'Security', desc: 'Create Flow security policy' },
  { id: 'CreateAddressGroup', name: 'Create Address Group', cat: 'Security', desc: 'Create network address group' },
  { id: 'CreateCategory', name: 'Create Category', cat: 'Security', desc: 'Create VM category' },
  { id: 'CreateNkeCluster', name: 'Create NKE Cluster', cat: 'Kubernetes', desc: 'Create Kubernetes cluster' },
  { id: 'DeleteNkeCluster', name: 'Delete NKE Cluster', cat: 'Kubernetes', desc: 'Remove Kubernetes cluster' },
  { id: 'EnableNke', name: 'Enable NKE', cat: 'Kubernetes', desc: 'Enable NKE on Prism Central' },
  { id: 'CreateDbServer', name: 'Create DB Server', cat: 'Database', desc: 'Provision database server via NDB' },
  { id: 'RegisterNdbCluster', name: 'Register NDB Cluster', cat: 'Database', desc: 'Register cluster with NDB' },
  { id: 'DeployPc', name: 'Deploy PC', cat: 'Prism Central', desc: 'Deploy Prism Central VM' },
  { id: 'RegisterPcToPe', name: 'Register PC to PE', cat: 'Prism Central', desc: 'Register PC with Prism Element' },
  { id: 'EnableMicrosegmentation', name: 'Enable Microsegmentation', cat: 'Prism Central', desc: 'Enable Flow microsegmentation' },
  { id: 'EnableObjects', name: 'Enable Objects', cat: 'Prism Central', desc: 'Enable Nutanix Objects' },
  { id: 'CreateProtectionRule', name: 'Create Protection Rule', cat: 'Prism Central', desc: 'Create VM protection rule' },
  { id: 'CreateRecoveryPlan', name: 'Create Recovery Plan', cat: 'Prism Central', desc: 'Create DR recovery plan' },
  { id: 'ConfigureEula', name: 'Configure EULA', cat: 'Prism Element', desc: 'Accept EULA for cluster' },
  { id: 'EnablePulse', name: 'Enable Pulse', cat: 'Prism Element', desc: 'Enable Pulse telemetry' },
  { id: 'SetHaReservation', name: 'Set HA Reservation', cat: 'Prism Element', desc: 'Configure HA host reservation' },
  { id: 'UpdateClusterName', name: 'Update Cluster Name', cat: 'Prism Element', desc: 'Change cluster display name' },
  { id: 'UpdateFoundation', name: 'Update Foundation', cat: 'System', desc: 'Update Foundation on CVMs' },
  { id: 'RunNcc', name: 'Run NCC', cat: 'System', desc: 'Run NCC health checks' },
]

const CRED_KEYS = ['pc_user', 'pe_user', 'ncm_user', 'cvm_credential', 'admin_cred', 'service_account_credential', 'remote_pc_credentials', 'infoblox_user']
const TIMEZONES = ['UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Singapore', 'Australia/Sydney']
const PC_VERSIONS = ['pc.2024.3', 'pc.2024.1', 'pc.2023.4', 'pc.2022.9', 'pc.2022.6']
const SCRIPT_CATS = ['All', 'Authentication', 'Networking', 'Storage', 'Compute', 'Images', 'Security', 'Kubernetes', 'Database', 'Prism Central', 'Prism Element', 'System']
const CAT_COLORS = { Infrastructure:'badge-blue', 'Prism Central':'badge-purple', Configuration:'badge-yellow', 'Pod Operations':'badge-green', Workloads:'badge-blue', Services:'badge-red', Authentication:'badge-purple', Networking:'badge-blue', Storage:'badge-yellow', Compute:'badge-green', Security:'badge-red', Kubernetes:'badge-blue', Database:'badge-yellow', 'Prism Element':'badge-purple', System:'badge-gray' }

// ─── YAML Utilities ───────────────────────────────────────────────────────────

function toYaml(obj) {
  return yaml.dump(obj, { indent: 2, lineWidth: 120, noRefs: true })
}

// ─── API Utilities ────────────────────────────────────────────────────────────

async function api(path, opts = {}) {
  const r = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts })
  return r.json()
}

async function streamExecute(body, onEvent) {
  const resp = await fetch('/api/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const reader = resp.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() || ''
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try { onEvent(JSON.parse(line.slice(6))) } catch {}
      }
    }
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────

function useRouter() {
  const [path, setPath] = useState(window.location.hash.slice(1) || '/')
  useEffect(() => {
    const onHash = () => setPath(window.location.hash.slice(1) || '/')
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const navigate = useCallback(to => { window.location.hash = to }, [])
  return { path, navigate }
}

// ─── Shared Components ────────────────────────────────────────────────────────

function Spinner({ size = 20 }) {
  return e('div', {
    style: { width: size, height: size, border: '2px solid #2e3150', borderTopColor: '#21c2f8', borderRadius: '50%' },
    className: 'animate-spin'
  })
}

function Badge({ text, type = 'gray' }) {
  return e('span', { className: `badge badge-${type}` }, text)
}

function TagInput({ values, onChange, placeholder }) {
  const [input, setInput] = useState('')
  const add = () => {
    const v = input.trim()
    if (v && !values.includes(v)) { onChange([...values, v]); setInput('') }
  }
  return e('div', { className: 'space-y-2' },
    e('div', { className: 'flex flex-wrap gap-1.5 min-h-6' },
      values.map((v, i) => e('span', { key: i, className: 'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono', style: { background: 'rgba(3,78,162,.2)', border: '1px solid rgba(3,78,162,.3)', color: '#93c5fd' } },
        v, e('button', { onClick: () => onChange(values.filter((_, j) => j !== i)), style: { background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: 10 } }, '×')
      ))
    ),
    e('div', { className: 'flex gap-2' },
      e('input', { className: 'input flex-1 text-xs', value: input, onChange: ev => setInput(ev.target.value), onKeyDown: ev => { if (ev.key === 'Enter' || ev.key === ',') { ev.preventDefault(); add() } }, placeholder: placeholder || 'Add...' }),
      e('button', { className: 'btn btn-secondary', onClick: add, style: { padding: '6px 10px' } }, '+')
    )
  )
}

function Terminal({ logs, status, title, onClose }) {
  const bottomRef = useRef()
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [logs.length])

  const copyLogs = () => navigator.clipboard.writeText(logs.map(l => l.data).join('\n'))

  return e('div', { className: 'rounded-xl overflow-hidden', style: { border: '1px solid #2e3150' } },
    e('div', { className: 'flex items-center gap-3 px-4 py-2.5', style: { background: '#111827', borderBottom: '1px solid #2e3150' } },
      e('div', { className: 'flex gap-1.5' },
        e('div', { style: { width:12, height:12, borderRadius:'50%', background:'rgba(239,68,68,.6)' } }),
        e('div', { style: { width:12, height:12, borderRadius:'50%', background:'rgba(245,158,11,.6)' } }),
        e('div', { style: { width:12, height:12, borderRadius:'50%', background:'rgba(34,197,94,.6)' } }),
      ),
      e('span', { className: 'flex-1 text-center text-xs', style: { color: '#6b7280', fontFamily: 'monospace' } }, title || 'ZTF Execution'),
      e('div', { className: 'flex items-center gap-2' },
        status === 'running' && e('span', { className: 'text-xs', style: { color: '#fcd34d' } }, '● Running...'),
        status === 'done' && e('span', { className: 'text-xs', style: { color: '#6ee7b7' } }, '✓ Completed'),
        status === 'error' && e('span', { className: 'text-xs', style: { color: '#fca5a5' } }, '✗ Failed'),
        e('button', { className: 'btn btn-ghost', style: { padding: '4px 8px', fontSize: 11 }, onClick: copyLogs }, 'Copy'),
        onClose && e('button', { className: 'btn btn-ghost', style: { padding: '4px 8px', fontSize: 11 }, onClick: onClose }, '✕'),
      )
    ),
    e('div', { className: 'terminal' },
      logs.length === 0 && status === 'running' && e('span', { style: { color: '#6b7280' } }, 'Initializing...'),
      logs.map((line, i) => {
        const color = line.type === 'stderr' ? '#fca5a5' : line.type === 'step' ? '#21c2f8' : line.type === 'error' ? '#fca5a5' : line.type === 'done' ? '#6ee7b7' : line.type === 'log' ? '#93c5fd' : '#d1d5db'
        const prefix = line.type === 'step' ? '▶ ' : line.type === 'done' ? '✓ ' : line.type === 'error' ? '✗ ' : ''
        const text = line.type === 'start' ? `$ ${typeof line.data === 'object' ? line.data.command : line.data}` : line.data
        return e('div', { key: i, style: { color, whiteSpace: 'pre-wrap', wordBreak: 'break-all' } }, prefix + text)
      }),
      e('div', { ref: bottomRef })
    )
  )
}

function YamlPreview({ content, filename }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => { await navigator.clipboard.writeText(content); setCopied(true); setTimeout(() => setCopied(false), 2000) }
  const download = () => {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/yaml' }))
    Object.assign(document.createElement('a'), { href: url, download: filename || 'config.yml' }).click()
    URL.revokeObjectURL(url)
  }
  return e('div', { className: 'rounded-xl overflow-hidden', style: { border: '1px solid #2e3150', background: '#030712' } },
    e('div', { className: 'flex items-center justify-between px-4 py-2.5', style: { background: '#111827', borderBottom: '1px solid #2e3150' } },
      e('span', { className: 'text-xs', style: { fontFamily: 'monospace', color: '#9ca3af' } }, filename || 'config.yml'),
      e('div', { className: 'flex gap-1' },
        e('button', { className: 'btn btn-ghost', style: { padding: '4px 10px', fontSize: 11 }, onClick: copy }, copied ? '✓ Copied' : 'Copy'),
        e('button', { className: 'btn btn-ghost', style: { padding: '4px 10px', fontSize: 11 }, onClick: download }, '⬇ Download'),
      )
    ),
    e('pre', { style: { padding: 16, fontSize: 12, lineHeight: 1.6, overflow: 'auto', maxHeight: 400, margin: 0, color: '#d1d5db', fontFamily: 'JetBrains Mono, monospace' } }, content)
  )
}

function ExecutionModal({ workflow, configContent, configFile, onClose }) {
  const [logs, setLogs] = useState([])
  const [status, setStatus] = useState('running')

  useEffect(() => {
    streamExecute({ workflow, configContent, configFile }, evt => {
      setLogs(prev => [...prev, { type: evt.type, data: typeof evt.data === 'string' ? evt.data : JSON.stringify(evt.data) }])
      if (evt.type === 'done') setStatus(evt.data?.status === 'success' ? 'done' : 'error')
      if (evt.type === 'error') setStatus('error')
    }).catch(() => setStatus('error'))
  }, [])

  return e('div', { style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 } },
    e('div', { style: { width: '100%', maxWidth: 720, background: '#0f1117', borderRadius: 16, border: '1px solid #2e3150', overflow: 'hidden' } },
      e('div', { className: 'flex items-center justify-between px-6 py-4', style: { borderBottom: '1px solid #2e3150' } },
        e('div', null,
          e('h3', { style: { fontWeight: 600, color: '#f1f5f9', fontSize: 16 } }, `Running: ${workflow}`),
          e('p', { style: { fontSize: 12, color: '#6b7280', marginTop: 2 } }, configFile),
        ),
        status !== 'running' && e('button', { className: 'btn btn-ghost', style: { padding: '6px 10px' }, onClick: onClose }, '✕'),
      ),
      e('div', { style: { padding: 16 } },
        e(Terminal, { logs, status, title: `python main.py --workflow ${workflow}` })
      ),
      status !== 'running' && e('div', { className: 'flex justify-end', style: { padding: '0 24px 16px' } },
        e('button', { className: 'btn btn-secondary', onClick: onClose }, 'Close')
      )
    )
  )
}

// ─── Layout ───────────────────────────────────────────────────────────────────

function Layout({ children, title, subtitle, actions, ztfInstalled, sidebarOpen, setSidebarOpen, navigate, currentPath }) {
  const navItems = [
    { path: '/', label: 'Dashboard', icon: '📊' },
    { path: '/setup', label: 'Setup & Install', icon: '⬇️' },
    { path: '/global-config', label: 'Global Config', icon: '🔑' },
    { path: '/workflows', label: 'Workflows', icon: '▶️' },
    { path: '/scripts', label: 'Scripts', icon: '💻' },
    { path: '/configs', label: 'Config Files', icon: '📄' },
    { path: '/executions', label: 'Executions', icon: '📋' },
    { path: '/settings', label: 'Settings', icon: '⚙️' },
  ]

  const sidebarW = sidebarOpen ? 240 : 60

  return e('div', { style: { display: 'flex', minHeight: '100vh' } },
    // Sidebar
    e('aside', { style: { position: 'fixed', top: 0, left: 0, height: '100vh', width: sidebarW, background: '#030712', borderRight: '1px solid #2e3150', display: 'flex', flexDirection: 'column', transition: 'width 0.3s', zIndex: 40, overflow: 'hidden' } },
      // Logo
      e('div', { style: { height: 64, display: 'flex', alignItems: 'center', padding: '0 12px', borderBottom: '1px solid #2e3150', flexShrink: 0, gap: 10 } },
        e('div', { style: { width: 36, height: 36, borderRadius: 8, background: '#034ea2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 16 } }, '⚡'),
        sidebarOpen && e('div', null,
          e('div', { style: { fontWeight: 700, fontSize: 14, color: '#f1f5f9', whiteSpace: 'nowrap' } }, 'ZeroTouch'),
          e('div', { style: { fontSize: 11, color: '#6b7280', whiteSpace: 'nowrap' } }, 'Framework UI'),
        )
      ),
      // Status
      sidebarOpen && e('div', { style: { margin: '8px 10px', padding: '8px 12px', background: '#1c1e2d', border: '1px solid #2e3150', borderRadius: 8 } },
        e('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
          e('div', { style: { width: 8, height: 8, borderRadius: '50%', background: ztfInstalled ? '#00b388' : '#eab308', flexShrink: 0 } }),
          e('span', { style: { fontSize: 11, color: '#9ca3af', whiteSpace: 'nowrap' } }, ztfInstalled ? 'Framework installed' : 'Not installed')
        )
      ),
      // Nav
      e('nav', { style: { flex: 1, padding: '8px', overflowY: 'auto' } },
        navItems.map(item => {
          const isActive = currentPath === item.path || (item.path !== '/' && currentPath.startsWith(item.path))
          return e('a', {
            key: item.path,
            href: `#${item.path}`,
            className: `nav-item ${isActive ? 'active' : ''}`,
            style: { marginBottom: 2, justifyContent: sidebarOpen ? 'flex-start' : 'center' },
            title: !sidebarOpen ? item.label : undefined,
          },
            e('span', { style: { fontSize: 16, flexShrink: 0 } }, item.icon),
            sidebarOpen && e('span', { style: { whiteSpace: 'nowrap' } }, item.label)
          )
        })
      ),
      sidebarOpen && e('div', { style: { padding: '12px 16px', borderTop: '1px solid #2e3150' } },
        e('p', { style: { fontSize: 11, color: '#374151' } }, 'ZTF UI v1.0.0')
      )
    ),
    // Main
    e('div', { style: { flex: 1, marginLeft: sidebarW, display: 'flex', flexDirection: 'column', transition: 'margin-left 0.3s', minWidth: 0 } },
      // Header
      e('header', { style: { height: 64, borderBottom: '1px solid #2e3150', display: 'flex', alignItems: 'center', padding: '0 24px', gap: 16, flexShrink: 0, position: 'sticky', top: 0, background: 'rgba(3,7,18,.8)', backdropFilter: 'blur(8px)', zIndex: 20 } },
        e('button', { className: 'btn btn-ghost', style: { padding: '6px 8px' }, onClick: () => setSidebarOpen(!sidebarOpen) }, '☰'),
        e('div', { style: { flex: 1 } },
          e('h1', { style: { fontSize: 18, fontWeight: 600, color: '#f1f5f9' } }, title),
          subtitle && e('p', { style: { fontSize: 12, color: '#6b7280' } }, subtitle),
        ),
        actions && e('div', { style: { display: 'flex', gap: 8 } }, actions)
      ),
      // Content
      e('main', { style: { flex: 1, overflowY: 'auto', padding: 24 } }, children)
    )
  )
}

// ─── Pages ────────────────────────────────────────────────────────────────────

function Dashboard({ navigate, ztfInstalled, systemChecks }) {
  const [executions, setExecutions] = useState([])
  useEffect(() => { api('/api/executions').then(setExecutions).catch(() => {}) }, [])

  const successCount = executions.filter(e => e.status === 'success').length
  const failCount = executions.filter(e => e.status === 'failed').length

  const quickActions = [
    { label: 'Deploy Prism Central', path: '/workflows/deploy-pc', icon: '☁️' },
    { label: 'Cluster Create', path: '/workflows/cluster-create', icon: '🖥' },
    { label: 'Configure Cluster', path: '/workflows/config-cluster', icon: '⚙️' },
    { label: 'NDB Deploy', path: '/workflows/ndb', icon: '🗄' },
  ]

  return e('div', { className: 'space-y-6' },
    !ztfInstalled && e('div', { style: { padding: '16px 20px', borderRadius: 12, background: 'rgba(234,179,8,.05)', border: '1px solid rgba(234,179,8,.3)', display: 'flex', gap: 12, alignItems: 'flex-start' } },
      e('span', { style: { fontSize: 20 } }, '⚠️'),
      e('div', null,
        e('p', { style: { fontWeight: 600, color: '#fcd34d' } }, 'ZeroTouch Framework Not Installed'),
        e('p', { style: { fontSize: 13, color: 'rgba(252,211,77,.7)', marginTop: 4 } }, 'The ZTF Python framework is not detected. Run the setup wizard to install it.'),
        e('a', { href: '#/setup', style: { display: 'inline-flex', marginTop: 10 }, className: 'btn btn-secondary' }, '→ Open Setup Wizard')
      )
    ),
    // Stats
    e('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 } },
      [
        { label: 'Total Runs', value: executions.length, icon: '📊' },
        { label: 'Successful', value: successCount, icon: '✅' },
        { label: 'Failed', value: failCount, icon: '❌' },
        { label: 'Last Run', value: executions[0] ? new Date(executions[0].timestamp).toLocaleDateString() : 'Never', icon: '🕐' },
      ].map(s => e('div', { key: s.label, className: 'card' },
        e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } },
          e('div', null,
            e('p', { style: { fontSize: 11, color: '#9ca3af', fontWeight: 500 } }, s.label),
            e('p', { style: { fontSize: 24, fontWeight: 700, color: '#f1f5f9', marginTop: 4 } }, s.value),
          ),
          e('span', { style: { fontSize: 24 } }, s.icon)
        )
      ))
    ),
    // Grid
    e('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 } },
      // System Status
      e('div', { className: 'card' },
        e('h2', { style: { fontWeight: 600, color: '#f1f5f9', marginBottom: 16, fontSize: 15 } }, '📡 System Status'),
        e('div', { className: 'space-y-2' },
          systemChecks.length === 0 && e('p', { style: { fontSize: 13, color: '#6b7280' } }, 'No status. Run setup to check.'),
          systemChecks.map((c, i) => e('div', { key: i, style: { display: 'flex', alignItems: 'center', gap: 8 } },
            e('span', { style: { fontSize: 14 } }, c.ok ? '✅' : '❌'),
            e('div', null,
              e('span', { style: { fontSize: 13, color: '#d1d5db' } }, c.name),
              c.value && e('span', { style: { fontSize: 11, color: '#6b7280', marginLeft: 8, fontFamily: 'monospace' } }, c.value.slice(0, 30))
            )
          ))
        )
      ),
      // Quick Actions
      e('div', { className: 'card' },
        e('h2', { style: { fontWeight: 600, color: '#f1f5f9', marginBottom: 16, fontSize: 15 } }, '⚡ Quick Actions'),
        e('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 } },
          quickActions.map(a => e('a', { key: a.path, href: `#${a.path}`, style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 12, borderRadius: 8, background: '#252840', border: '1px solid #2e3150', textDecoration: 'none', transition: 'all 0.15s' }, onMouseOver: ev => ev.currentTarget.style.borderColor = '#3d4170', onMouseOut: ev => ev.currentTarget.style.borderColor = '#2e3150' },
            e('span', { style: { fontSize: 24 } }, a.icon),
            e('span', { style: { fontSize: 11, color: '#9ca3af', textAlign: 'center', lineHeight: 1.3 } }, a.label)
          ))
        ),
        e('a', { href: '#/workflows', style: { display: 'block', textAlign: 'center', marginTop: 12, fontSize: 12, color: '#6b7280', textDecoration: 'none' } }, 'View all workflows →')
      ),
      // Recent Executions
      e('div', { className: 'card' },
        e('h2', { style: { fontWeight: 600, color: '#f1f5f9', marginBottom: 16, fontSize: 15 } }, '📋 Recent Executions'),
        e('div', { className: 'space-y-2' },
          executions.length === 0 && e('p', { style: { fontSize: 13, color: '#6b7280', textAlign: 'center', padding: '16px 0' } }, 'No executions yet'),
          executions.slice(0, 6).map(ex => e('div', { key: ex.id, style: { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' } },
            e('div', { style: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: ex.status === 'success' ? '#00b388' : ex.status === 'failed' ? '#ef4444' : '#eab308' } }),
            e('div', { style: { flex: 1, minWidth: 0 } },
              e('p', { style: { fontSize: 13, color: '#d1d5db', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, ex.workflow),
              e('p', { style: { fontSize: 11, color: '#6b7280' } }, new Date(ex.timestamp).toLocaleString()),
            ),
            ex.duration && e('span', { style: { fontSize: 11, color: '#4b5563' } }, `${(ex.duration/1000).toFixed(1)}s`)
          ))
        ),
        executions.length > 0 && e('a', { href: '#/executions', style: { display: 'block', textAlign: 'center', marginTop: 12, fontSize: 12, color: '#6b7280', textDecoration: 'none' } }, 'View all →')
      )
    )
  )
}

function Setup({ setZtfInstalled, setSystemChecks }) {
  const [checks, setChecks] = useState([])
  const [checking, setChecking] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [logs, setLogs] = useState([])
  const [installStatus, setInstallStatus] = useState('idle')

  const runCheck = async () => {
    setChecking(true)
    const data = await api('/api/system/check')
    setChecks(data.checks)
    setSystemChecks(data.checks)
    setZtfInstalled(data.ztfInstalled)
    setChecking(false)
  }

  const runInstall = async () => {
    setInstalling(true)
    setInstallStatus('running')
    setLogs([])
    try {
      const resp = await fetch('/api/install', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      const reader = resp.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() || ''
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const evt = JSON.parse(line.slice(6))
              setLogs(prev => [...prev, { type: evt.type, data: typeof evt.data === 'string' ? evt.data : JSON.stringify(evt.data) }])
              if (evt.type === 'done') setInstallStatus('done')
              if (evt.type === 'error') setInstallStatus('error')
            } catch {}
          }
        }
      }
    } catch (err) {
      setLogs(prev => [...prev, { type: 'error', data: String(err) }])
      setInstallStatus('error')
    }
    setInstalling(false)
    const data = await api('/api/system/check')
    setChecks(data.checks)
    setSystemChecks(data.checks)
    setZtfInstalled(data.ztfInstalled)
  }

  return e('div', { style: { maxWidth: 900 } },
    e('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 } },
      // Prerequisites
      e('div', { className: 'card' },
        e('h3', { style: { fontWeight: 600, color: '#f1f5f9', marginBottom: 4 } }, '🔍 Prerequisites Check'),
        e('p', { style: { fontSize: 13, color: '#6b7280', marginBottom: 16 } }, 'Verify Python, pip, and git are installed'),
        e('div', { className: 'space-y-2', style: { marginBottom: 16 } },
          [{ name: 'Python 3.9+', desc: 'Required for ZTF' }, { name: 'pip', desc: 'Package manager' }, { name: 'git', desc: 'Repository cloning' }].map(req => {
            const check = checks.find(c => c.name === req.name)
            return e('div', { key: req.name, style: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, background: '#111827', border: '1px solid #2e3150' } },
              e('span', null, check ? (check.ok ? '✅' : '❌') : '⬜'),
              e('div', null,
                e('p', { style: { fontSize: 13, color: '#d1d5db', fontWeight: 500 } }, req.name),
                e('p', { style: { fontSize: 11, color: '#6b7280' } }, check?.value || req.desc),
              )
            )
          })
        ),
        e('button', { className: 'btn btn-primary', style: { width: '100%', justifyContent: 'center' }, onClick: runCheck, disabled: checking },
          checking ? e(Spinner, { size: 14 }) : '🔍', ' ', checking ? 'Checking...' : 'Run Prerequisites Check'
        )
      ),
      // Install
      e('div', { className: 'card' },
        e('h3', { style: { fontWeight: 600, color: '#f1f5f9', marginBottom: 4 } }, '⬇ Install ZeroTouch Framework'),
        e('p', { style: { fontSize: 13, color: '#6b7280', marginBottom: 12 } }, 'Clone repo and install Python dependencies'),
        e('ul', { style: { fontSize: 13, color: '#9ca3af', marginBottom: 16, paddingLeft: 0, listStyle: 'none' } },
          [['1.', 'Clone from GitHub'], ['2.', 'Install pip dependencies'], ['3.', 'Verify installation']].map(([n, t]) =>
            e('li', { key: n, style: { display: 'flex', gap: 8, marginBottom: 4 } }, e('span', { style: { color: '#21c2f8' } }, n), t)
          )
        ),
        e('button', { className: 'btn btn-primary', style: { width: '100%', justifyContent: 'center' }, onClick: runInstall, disabled: installing || checks.length === 0 },
          installing ? e(Spinner, { size: 14 }) : '⬇', ' ', installing ? 'Installing...' : 'Install Framework'
        ),
        checks.length === 0 && e('p', { style: { fontSize: 11, color: '#6b7280', marginTop: 8, textAlign: 'center' } }, 'Run prerequisites check first')
      )
    ),
    logs.length > 0 && e(Terminal, { logs, status: installStatus === 'running' ? 'running' : installStatus === 'done' ? 'done' : 'error', title: 'Installation' }),
    e('div', { className: 'card', style: { marginTop: 20 } },
      e('h3', { style: { fontWeight: 600, color: '#f1f5f9', marginBottom: 8 } }, '💻 Manual Installation'),
      e('p', { style: { fontSize: 13, color: '#9ca3af', marginBottom: 12 } }, 'Or install manually in your terminal:'),
      e('pre', { style: { fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#d1d5db', background: '#111827', padding: 16, borderRadius: 8, lineHeight: 1.7 } },
        `git clone https://github.com/nutanixdev/zerotouch-framework.git\ncd zerotouch-framework\npip install -r requirements/requirements.txt`
      )
    )
  )
}

function WorkflowsPage() {
  const [search, setSearch] = useState('')
  const [cat, setCat] = useState('All')
  const cats = ['All', ...new Set(WORKFLOWS.map(w => w.category))]
  const filtered = WORKFLOWS.filter(w => {
    const ms = !search || w.name.toLowerCase().includes(search.toLowerCase()) || w.desc.toLowerCase().includes(search.toLowerCase())
    const mc = cat === 'All' || w.category === cat
    return ms && mc
  })
  const grouped = {}
  filtered.forEach(w => { if (!grouped[w.category]) grouped[w.category] = []; grouped[w.category].push(w) })

  return e('div', null,
    e('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 24, alignItems: 'center' } },
      e('input', { className: 'input', style: { width: 256 }, placeholder: '🔍 Search workflows...', value: search, onChange: ev => setSearch(ev.target.value) }),
      e('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
        cats.map(c => e('button', { key: c, className: `btn ${cat === c ? 'btn-primary' : 'btn-secondary'}`, style: { padding: '6px 12px', fontSize: 12 }, onClick: () => setCat(c) }, c))
      )
    ),
    cat === 'All' ? e('div', { className: 'space-y-8' },
      Object.entries(grouped).map(([catName, workflows]) => e('section', { key: catName },
        e('h2', { style: { fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 } }, catName),
        e('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 } },
          workflows.map(w => e(WorkflowCard, { key: w.id, workflow: w }))
        )
      ))
    ) : e('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 } },
      filtered.map(w => e(WorkflowCard, { key: w.id, workflow: w }))
    ),
    filtered.length === 0 && e('div', { style: { textAlign: 'center', padding: 64, color: '#6b7280' } }, '🔍 No workflows match your search')
  )
}

function WorkflowCard({ workflow: w }) {
  return e('a', {
    href: `#/workflows/${w.id}`,
    className: 'card',
    style: { display: 'flex', flexDirection: 'column', textDecoration: 'none', cursor: 'pointer', transition: 'border-color 0.15s' },
    onMouseOver: ev => ev.currentTarget.style.borderColor = '#3d4170',
    onMouseOut: ev => ev.currentTarget.style.borderColor = '#2e3150',
  },
    e('div', { style: { display: 'flex', gap: 12, marginBottom: 10, alignItems: 'flex-start' } },
      e('div', { style: { width: 40, height: 40, borderRadius: 10, background: 'rgba(3,78,162,.15)', border: '1px solid rgba(3,78,162,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 } }, w.icon),
      e('div', null,
        e('h3', { style: { fontWeight: 600, color: '#f1f5f9', fontSize: 14 } }, w.name),
        e('span', { className: `badge ${CAT_COLORS[w.category] || 'badge-gray'}`, style: { marginTop: 4 } }, w.category)
      )
    ),
    e('p', { style: { fontSize: 13, color: '#9ca3af', flex: 1, lineHeight: 1.5 } }, w.desc),
    e('div', { style: { marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(46,49,80,.5)' } },
      e('span', { style: { fontSize: 11, fontFamily: 'monospace', color: '#4b5563' } }, w.configFile)
    )
  )
}

// ─── Workflow Forms ───────────────────────────────────────────────────────────

function Field({ label, required, children }) {
  return e('div', null,
    e('label', { className: 'label' }, label, required && e('span', { style: { color: '#ef4444', marginLeft: 2 } }, '*')),
    children
  )
}

function CredsSelect({ label, value, onChange }) {
  return e(Field, { label },
    e('select', { className: 'input', value, onChange: ev => onChange(ev.target.value) },
      CRED_KEYS.map(k => e('option', { key: k, value: k }, k))
    )
  )
}

function NodeRow({ node, onChange, onRemove, showRemove }) {
  const upd = (k, v) => onChange({ ...node, [k]: v })
  return e('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 80px 36px', gap: 8, padding: '10px 12px', borderRadius: 8, background: 'rgba(17,24,39,.8)', border: '1px solid rgba(46,49,80,.5)', alignItems: 'end' } },
    e('div', null, e('label', { className: 'label', style: { fontSize: 10 } }, 'CVM IP'), e('input', { className: 'input', style: { fontSize: 12, padding: '6px 8px' }, value: node.cvmIp || '', onChange: ev => upd('cvmIp', ev.target.value), placeholder: '10.0.0.11' })),
    e('div', null, e('label', { className: 'label', style: { fontSize: 10 } }, 'Host IP'), e('input', { className: 'input', style: { fontSize: 12, padding: '6px 8px' }, value: node.hostIp || '', onChange: ev => upd('hostIp', ev.target.value), placeholder: '10.0.0.12' })),
    e('div', null, e('label', { className: 'label', style: { fontSize: 10 } }, 'IPMI IP'), e('input', { className: 'input', style: { fontSize: 12, padding: '6px 8px' }, value: node.ipmiIp || '', onChange: ev => upd('ipmiIp', ev.target.value), placeholder: '10.0.0.13' })),
    e('div', null, e('label', { className: 'label', style: { fontSize: 10 } }, 'Hostname'), e('input', { className: 'input', style: { fontSize: 12, padding: '6px 8px' }, value: node.hostname || '', onChange: ev => upd('hostname', ev.target.value), placeholder: 'ahv-01' })),
    e('div', null, e('label', { className: 'label', style: { fontSize: 10 } }, 'RAM GB'), e('input', { className: 'input', style: { fontSize: 12, padding: '6px 8px' }, type: 'number', value: node.cvmRamGb || 12, onChange: ev => upd('cvmRamGb', +ev.target.value), min: 12 })),
    showRemove && e('button', { className: 'btn btn-ghost', style: { padding: '6px 8px', color: '#ef4444', alignSelf: 'end' }, onClick: onRemove }, '🗑'),
  )
}

function ClusterSection({ cluster, onChange, onRemove, showRemove }) {
  const upd = (k, v) => onChange({ ...cluster, [k]: v })
  const addNode = () => upd('nodes', [...cluster.nodes, { cvmIp: '', hostIp: '', ipmiIp: '', hostname: '', cvmRamGb: 12 }])
  const updNode = (i, n) => upd('nodes', cluster.nodes.map((x, j) => j === i ? n : x))
  const remNode = i => upd('nodes', cluster.nodes.filter((_, j) => j !== i))

  return e('div', { className: 'card', style: { borderColor: 'rgba(46,49,80,.7)' } },
    e('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 } },
      e('button', { className: 'btn btn-ghost', style: { padding: '4px 8px', fontSize: 12 }, onClick: () => upd('expanded', !cluster.expanded) }, cluster.expanded ? '▲' : '▼'),
      e('h4', { style: { fontWeight: 600, color: '#e5e7eb', flex: 1, fontSize: 14 } }, cluster.name || `Cluster`),
      e('span', { className: 'badge badge-gray' }, `${cluster.nodes?.length || 0} nodes`),
      showRemove && e('button', { className: 'btn btn-ghost', style: { padding: '4px 8px', color: '#ef4444' }, onClick: onRemove }, '🗑'),
    ),
    cluster.expanded !== false && e('div', { className: 'space-y-4' },
      e('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 } },
        e(Field, { label: 'Cluster Name' }, e('input', { className: 'input', value: cluster.name || '', onChange: ev => upd('name', ev.target.value), placeholder: 'cluster-01' })),
        e(Field, { label: 'Cluster VIP' }, e('input', { className: 'input', value: cluster.clusterVip || '', onChange: ev => upd('clusterVip', ev.target.value), placeholder: '10.0.0.10' })),
        e(Field, { label: 'Redundancy Factor' },
          e('select', { className: 'input', value: cluster.redundancyFactor || 2, onChange: ev => upd('redundancyFactor', +ev.target.value) },
            e('option', { value: 2 }, 'RF-2 (3+ nodes)'), e('option', { value: 3 }, 'RF-3 (5+ nodes)')
          )
        ),
        e(Field, { label: 'Timezone' },
          e('select', { className: 'input', value: cluster.timezone || 'UTC', onChange: ev => upd('timezone', ev.target.value) },
            TIMEZONES.map(tz => e('option', { key: tz, value: tz }, tz))
          )
        ),
      ),
      e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 } },
        e('label', { className: 'label', style: { margin: 0 } }, 'Nodes'),
        e('button', { className: 'btn btn-secondary', style: { fontSize: 12, padding: '4px 10px' }, onClick: addNode }, '+ Add Node')
      ),
      cluster.nodes?.map((node, i) => e(NodeRow, { key: i, node, onChange: n => updNode(i, n), onRemove: () => remNode(i), showRemove: cluster.nodes.length > 1 }))
    )
  )
}

function ClusterCreateForm({ onYamlChange }) {
  const [pcCred, setPcCred] = useState('pc_user')
  const [cvmCred, setCvmCred] = useState('cvm_credential')
  const [fcIp, setFcIp] = useState('')
  const [dns, setDns] = useState(['8.8.8.8'])
  const [ntp, setNtp] = useState(['0.us.pool.ntp.org'])
  const [clusters, setClusters] = useState([{ name: '', clusterVip: '', redundancyFactor: 2, timezone: 'UTC', nodes: [{ cvmIp: '', hostIp: '', ipmiIp: '', hostname: '', cvmRamGb: 12 }], expanded: true }])

  useEffect(() => {
    if (!fcIp) return
    onYamlChange(toYaml({ pc_credential: pcCred, cvm_credential: cvmCred, fc_ip: fcIp, clusters: clusters.map(c => ({ cluster_name: c.name, cluster_vip: c.clusterVip, redundancy_factor: c.redundancyFactor, timezone: c.timezone, name_servers_list: dns, ntp_servers_list: ntp, nodes: c.nodes.map(n => ({ cvm_ip: n.cvmIp, host_ip: n.hostIp, ...(n.ipmiIp && { ipmi_ip: n.ipmiIp }), ...(n.hostname && { hypervisor_hostname: n.hostname }), cvm_ram_gb: n.cvmRamGb })) })) }))
  }, [pcCred, cvmCred, fcIp, dns, ntp, clusters])

  return e('div', { className: 'space-y-5' },
    e('div', { className: 'form-section' },
      e('p', { style: { fontSize: 12, fontWeight: 600, color: '#d1d5db', marginBottom: 14 } }, '⚙️ Global Settings'),
      e('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } },
        e(CredsSelect, { label: 'PC Credential', value: pcCred, onChange: setPcCred }),
        e(CredsSelect, { label: 'CVM Credential', value: cvmCred, onChange: setCvmCred }),
      ),
      e(Field, { label: 'Foundation Central IP', required: true },
        e('input', { className: 'input', value: fcIp, onChange: ev => setFcIp(ev.target.value), placeholder: '10.0.0.100' })
      ),
      e('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 12 } },
        e(Field, { label: 'DNS Servers' }, e(TagInput, { values: dns, onChange: setDns })),
        e(Field, { label: 'NTP Servers' }, e(TagInput, { values: ntp, onChange: setNtp, placeholder: '0.us.pool.ntp.org' })),
      )
    ),
    clusters.map((c, i) => e(ClusterSection, { key: i, cluster: c, onChange: nc => setClusters(prev => prev.map((x, j) => j === i ? nc : x)), onRemove: () => setClusters(prev => prev.filter((_, j) => j !== i)), showRemove: clusters.length > 1 })),
    e('button', { className: 'btn btn-secondary', style: { width: '100%', justifyContent: 'center' }, onClick: () => setClusters(p => [...p, { name: '', clusterVip: '', redundancyFactor: 2, timezone: 'UTC', nodes: [{ cvmIp: '', hostIp: '', ipmiIp: '', hostname: '', cvmRamGb: 12 }], expanded: true }]) }, '+ Add Cluster')
  )
}

function GenericForm({ workflow, onYamlChange }) {
  const placeholders = {
    'config-pc': `pc_ip: 10.0.0.51\npc_credential: pc_user\nname_servers_list:\n  - 8.8.8.8\nntp_servers_list:\n  - 0.us.pool.ntp.org\n`,
    'pod-config': `pc_ip: 10.0.0.51\npc_credential: pc_user\npe_credential: pe_user\n`,
    'deploy-management-pc': `pe_credential: pe_user\ncvm_credential: cvm_credential\n`,
    'config-management-pc': `pc_ip: 10.0.0.51\npc_credential: pc_user\n`,
    'imaging': `pc_credential: pc_user\ncvm_credential: cvm_credential\nfc_ip: 10.0.0.100\naos_url: "http://server/aos.tar.gz"\nhypervisor_type: kvm\nhypervisor_url: "http://server/AHV.iso"\n`,
    'calm-edgeai-vm-workload': `ncm_vm_ip: 10.0.0.60\nncm_credential: ncm_user\nbp_list:\n  - dsl_file: calm-dsl-bps/blueprints/EdgeAI/EdgeAI.py\n    name: EdgeAI\n    app_name: EdgeAI-app\n`,
  }
  const [content, setContent] = useState(placeholders[workflow.id] || `# ${workflow.name} Configuration\n`)
  useEffect(() => { onYamlChange(content) }, [content])

  return e('div', { className: 'space-y-4' },
    e('div', { className: 'card' },
      e('h3', { style: { fontWeight: 600, color: '#f1f5f9', marginBottom: 8 } }, '📝 Configuration Editor'),
      e('p', { style: { fontSize: 13, color: '#9ca3af', marginBottom: 14 } }, `Edit YAML for workflow: ${workflow.id}`),
      e('textarea', { className: 'input', style: { fontFamily: 'JetBrains Mono, monospace', fontSize: 12, minHeight: 400, lineHeight: 1.6 }, value: content, onChange: ev => { setContent(ev.target.value); onYamlChange(ev.target.value) }, spellCheck: false })
    )
  )
}

function WorkflowDetailPage({ workflowId }) {
  const workflow = WORKFLOWS.find(w => w.id === workflowId)
  const [activeTab, setActiveTab] = useState('Configure')
  const [yamlContent, setYamlContent] = useState('')
  const [showExecution, setShowExecution] = useState(false)

  if (!workflow) return e('div', { style: { padding: 40, textAlign: 'center', color: '#9ca3af' } },
    e('p', null, 'Workflow not found: ', workflowId),
    e('a', { href: '#/workflows', className: 'btn btn-secondary', style: { marginTop: 16, display: 'inline-flex' } }, '← Back')
  )

  const renderForm = () => {
    switch (workflow.id) {
      case 'cluster-create': return e(ClusterCreateForm, { onYamlChange: setYamlContent })
      default: return e(GenericForm, { workflow, onYamlChange: setYamlContent })
    }
  }

  return e('div', null,
    e('div', { style: { display: 'flex', gap: 12, marginBottom: 20, alignItems: 'flex-start' } },
      e('a', { href: '#/workflows', className: 'btn btn-ghost', style: { padding: '8px 10px', flexShrink: 0 } }, '←'),
      e('div', { style: { flex: 1 } },
        e('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 } },
          e('div', { style: { width: 40, height: 40, borderRadius: 10, background: 'rgba(3,78,162,.15)', border: '1px solid rgba(3,78,162,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 } }, workflow.icon),
          e('div', null,
            e('h2', { style: { fontWeight: 700, fontSize: 18, color: '#f1f5f9' } }, workflow.name),
            e('code', { style: { fontSize: 12, color: '#6b7280' } }, `--workflow ${workflow.id} -f ${workflow.configFile}`)
          )
        ),
        e('p', { style: { fontSize: 13, color: '#9ca3af', lineHeight: 1.6, maxWidth: 700 } }, workflow.details)
      ),
      e('div', { style: { display: 'flex', gap: 8, flexShrink: 0 } },
        yamlContent && e('button', { className: 'btn btn-secondary', onClick: () => { const url = URL.createObjectURL(new Blob([yamlContent], { type: 'text/yaml' })); Object.assign(document.createElement('a'), { href: url, download: workflow.configFile }).click(); URL.revokeObjectURL(url) } }, '⬇ Download'),
        e('button', { className: 'btn btn-success', disabled: !yamlContent, onClick: () => yamlContent && setShowExecution(true) }, '▶ Run Workflow')
      )
    ),
    // Tabs
    e('div', { style: { display: 'flex', gap: 4, marginBottom: 20, background: '#1c1e2d', padding: 4, borderRadius: 10, border: '1px solid #2e3150', width: 'fit-content' } },
      ['Configure', 'YAML Preview'].map(tab => e('button', { key: tab, className: `btn ${activeTab === tab ? 'btn-primary' : 'btn-ghost'}`, style: { padding: '8px 16px', fontSize: 13 }, onClick: () => setActiveTab(tab) }, tab))
    ),
    activeTab === 'Configure' && renderForm(),
    activeTab === 'YAML Preview' && (yamlContent
      ? e(YamlPreview, { content: yamlContent, filename: workflow.configFile })
      : e('div', { className: 'card', style: { textAlign: 'center', padding: 40, color: '#6b7280' } }, 'Fill out the form to see the generated YAML')
    ),
    showExecution && e(ExecutionModal, { workflow: workflow.id, configContent: yamlContent, configFile: workflow.configFile, onClose: () => setShowExecution(false) })
  )
}

function ScriptsPage() {
  const [search, setSearch] = useState('')
  const [cat, setCat] = useState('All')
  const [selected, setSelected] = useState(null)
  const [configContent, setConfigContent] = useState('')
  const [logs, setLogs] = useState([])
  const [runStatus, setRunStatus] = useState('idle')

  const filtered = SCRIPTS.filter(s => {
    const ms = !search || s.name.toLowerCase().includes(search.toLowerCase())
    const mc = cat === 'All' || s.cat === cat
    return ms && mc
  })

  const selectedScript = SCRIPTS.find(s => s.id === selected)

  const runScript = async () => {
    setRunStatus('running')
    setLogs([])
    await streamExecute({ script: selected, configContent, configFile: `${selected}-${Date.now()}.yml` }, evt => {
      setLogs(prev => [...prev, { type: evt.type, data: typeof evt.data === 'string' ? evt.data : JSON.stringify(evt.data) }])
      if (evt.type === 'done') setRunStatus(evt.data?.status === 'success' ? 'done' : 'error')
      if (evt.type === 'error') setRunStatus('error')
    }).catch(() => setRunStatus('error'))
  }

  return e('div', { style: { display: 'flex', gap: 20, height: 'calc(100vh - 120px)' } },
    // Left
    e('div', { style: { width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 } },
      e('input', { className: 'input', placeholder: '🔍 Search scripts...', value: search, onChange: ev => setSearch(ev.target.value) }),
      e('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4 } },
        SCRIPT_CATS.map(c => e('button', { key: c, className: `btn ${cat === c ? 'btn-primary' : 'btn-secondary'}`, style: { padding: '4px 8px', fontSize: 11 }, onClick: () => setCat(c) }, c))
      ),
      e('div', { className: 'card', style: { flex: 1, overflowY: 'auto', padding: 8 } },
        e('p', { style: { fontSize: 11, color: '#6b7280', padding: '4px 8px', marginBottom: 4 } }, `${filtered.length} scripts`),
        filtered.map(s => e('button', { key: s.id, onClick: () => { setSelected(s.id); setLogs([]); setRunStatus('idle') }, style: { width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 8, background: selected === s.id ? 'rgba(3,78,162,.2)' : 'transparent', border: selected === s.id ? '1px solid rgba(3,78,162,.3)' : '1px solid transparent', cursor: 'pointer', marginBottom: 2, transition: 'all 0.15s' } },
          e('p', { style: { fontSize: 13, color: '#d1d5db', fontWeight: 500 } }, s.name),
          e('span', { className: `badge badge-${CAT_COLORS[s.cat] || 'gray'}`, style: { marginTop: 4, fontSize: 10 } }, s.cat)
        ))
      )
    ),
    // Right
    e('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 } },
      selectedScript ? e('div', { className: 'space-y-4', style: { flex: 1, display: 'flex', flexDirection: 'column' } },
        e('div', { className: 'card' },
          e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } },
            e('div', null,
              e('span', { className: `badge badge-${CAT_COLORS[selectedScript.cat] || 'gray'}`, style: { marginBottom: 8 } }, selectedScript.cat),
              e('h2', { style: { fontSize: 20, fontWeight: 700, color: '#f1f5f9' } }, selectedScript.name),
              e('p', { style: { fontSize: 13, color: '#9ca3af', marginTop: 4 } }, selectedScript.desc),
              e('code', { style: { fontSize: 11, background: '#111827', padding: '4px 8px', borderRadius: 6, color: '#9ca3af', display: 'inline-block', marginTop: 8 } }, `--script ${selectedScript.id}`)
            ),
            e('button', { className: 'btn btn-success', disabled: runStatus === 'running', onClick: runScript }, '▶ Run Script')
          )
        ),
        e('div', { className: 'card', style: { flex: 1 } },
          e('label', { className: 'label', style: { marginBottom: 6 } }, 'Configuration (YAML)'),
          e('textarea', { className: 'input', style: { fontFamily: 'monospace', fontSize: 12, minHeight: 200, resize: 'vertical' }, value: configContent, onChange: ev => setConfigContent(ev.target.value), placeholder: `# Configuration for ${selectedScript.id}\ncluster_ip: 10.0.0.1\npe_credential: pe_user` })
        ),
        (logs.length > 0 || runStatus === 'running') && e(Terminal, { logs, status: runStatus === 'running' ? 'running' : runStatus === 'done' ? 'done' : 'error', title: `--script ${selectedScript.id}` })
      ) : e('div', { style: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' } },
        e('div', { style: { textAlign: 'center' } },
          e('div', { style: { fontSize: 48, marginBottom: 12 } }, '💻'),
          e('p', { style: { fontSize: 16, fontWeight: 500 } }, 'Select a script'),
          e('p', { style: { fontSize: 13, marginTop: 4 } }, 'Choose from the list to configure and run')
        )
      )
    )
  )
}

function ExecutionsPage() {
  const [executions, setExecutions] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [expanded, setExpanded] = useState(null)

  const load = async () => { setLoading(true); setExecutions(await api('/api/executions')); setLoading(false) }
  useEffect(() => { load() }, [])

  const clear = async () => { if (!confirm('Clear history?')) return; await api('/api/executions', { method: 'DELETE' }); setExecutions([]) }
  const filtered = executions.filter(e => filter === 'all' || e.status === filter)

  return e('div', null,
    e('div', { style: { display: 'flex', gap: 8, marginBottom: 20 } },
      ['all', 'success', 'failed'].map(f => e('button', { key: f, className: `btn ${filter === f ? 'btn-primary' : 'btn-secondary'}`, style: { padding: '8px 16px', textTransform: 'capitalize' }, onClick: () => setFilter(f) },
        `${f} (${f === 'all' ? executions.length : executions.filter(ex => ex.status === f).length})`
      )),
      e('div', { style: { flex: 1 } }),
      e('button', { className: 'btn btn-secondary', onClick: load }, '↻ Refresh'),
      executions.length > 0 && e('button', { className: 'btn btn-danger', onClick: clear }, '🗑 Clear'),
    ),
    loading ? e('div', { style: { display: 'flex', justifyContent: 'center', padding: 64 } }, e(Spinner, { size: 28 })) : null,
    !loading && filtered.length === 0 && e('div', { style: { textAlign: 'center', padding: 64, color: '#6b7280' } }, '📋 No executions found'),
    e('div', { className: 'space-y-2' },
      filtered.map(ex => e('div', { key: ex.id, className: 'card', style: { padding: 0, overflow: 'hidden' } },
        e('button', { style: { width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', cursor: 'pointer', background: 'transparent', border: 'none', color: 'inherit', textAlign: 'left' }, onClick: () => setExpanded(expanded === ex.id ? null : ex.id) },
          e('div', { style: { width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: ex.status === 'success' ? '#00b388' : ex.status === 'failed' ? '#ef4444' : '#eab308' } }),
          e('div', { style: { flex: 1 } },
            e('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
              e('span', { style: { fontWeight: 600, color: '#f1f5f9', fontSize: 14 } }, ex.workflow),
              e('span', { className: `badge badge-${ex.type === 'workflow' ? 'blue' : 'purple'}` }, ex.type),
            ),
            e('p', { style: { fontSize: 12, color: '#6b7280', marginTop: 2 } },
              new Date(ex.timestamp).toLocaleString(),
              ex.duration && ` · ${(ex.duration/1000).toFixed(1)}s`
            )
          ),
          e('span', { style: { color: '#6b7280', fontSize: 18 } }, expanded === ex.id ? '▲' : '▼')
        ),
        expanded === ex.id && ex.command && e('div', { style: { padding: '0 18px 14px', borderTop: '1px solid #2e3150' } },
          e('p', { style: { fontSize: 11, color: '#6b7280', margin: '10px 0 6px' } }, 'Command:'),
          e('code', { style: { display: 'block', fontFamily: 'monospace', fontSize: 12, color: '#d1d5db', background: '#030712', padding: '10px 14px', borderRadius: 8, wordBreak: 'break-all' } }, ex.command)
        )
      ))
    )
  )
}

function GlobalConfigPage() {
  const [tab, setTab] = useState('credentials')
  const [vaultType, setVaultType] = useState('local')
  const [ipMethod, setIpMethod] = useState('static')
  const [creds, setCreds] = useState([
    { ref: 'pc_user', username: 'admin', password: '' },
    { ref: 'pe_user', username: 'admin', password: '' },
    { ref: 'ncm_user', username: 'admin', password: '' },
    { ref: 'cvm_credential', username: 'nutanix', password: '' },
    { ref: 'admin_cred', username: 'admin', password: '' },
  ])
  const [showPw, setShowPw] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [cyberark, setCyberark] = useState({ host: '', certFile: '', keyFile: '' })
  const [infoblox, setInfoblox] = useState({ host: '', username: '', password: '', dnsView: 'default', networkView: 'default' })

  const getYaml = () => {
    const credMap = {}
    creds.forEach(c => { credMap[c.ref] = { username: c.username, password: c.password } })
    return toYaml({ vault_to_use: vaultType, ip_allocation_method: ipMethod, vaults: { local: { credentials: credMap } }, ...(ipMethod === 'infoblox' && infoblox.host ? { infoblox } : {}) })
  }

  const save = async () => {
    setSaving(true)
    await api('/api/global-config', { method: 'POST', body: JSON.stringify({ content: getYaml() }) })
    setSaved(true); setTimeout(() => setSaved(false), 2000); setSaving(false)
  }

  const download = () => {
    const url = URL.createObjectURL(new Blob([getYaml()], { type: 'text/yaml' }))
    Object.assign(document.createElement('a'), { href: url, download: 'global.yml' }).click()
    URL.revokeObjectURL(url)
  }

  const updCred = (i, field, value) => setCreds(prev => prev.map((c, j) => j === i ? { ...c, [field]: value } : c))

  const tabs = [{ id: 'credentials', label: 'Credentials' }, { id: 'vault', label: 'Vault' }, { id: 'ipam', label: 'IPAM' }, { id: 'preview', label: 'YAML Preview' }]

  return e('div', null,
    e('div', { style: { display: 'flex', gap: 4, marginBottom: 24, background: '#1c1e2d', padding: 4, borderRadius: 10, border: '1px solid #2e3150', width: 'fit-content', marginBottom: 24 } },
      tabs.map(t => e('button', { key: t.id, className: `btn ${tab === t.id ? 'btn-primary' : 'btn-ghost'}`, style: { padding: '8px 16px', fontSize: 13 }, onClick: () => setTab(t.id) }, t.label))
    ),
    tab === 'credentials' && e('div', { className: 'card' },
      e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 } },
        e('h3', { style: { fontWeight: 600, color: '#f1f5f9' } }, 'Credential Definitions'),
        e('div', { style: { display: 'flex', gap: 8 } },
          e('button', { className: 'btn btn-ghost', style: { fontSize: 12 }, onClick: () => setShowPw(!showPw) }, showPw ? '🙈 Hide' : '👁 Show'),
          e('button', { className: 'btn btn-secondary', style: { fontSize: 12 }, onClick: () => setCreds(p => [...p, { ref: `cred_${Date.now()}`, username: '', password: '' }]) }, '+ Add'),
          e('button', { className: 'btn btn-secondary', style: { fontSize: 12 }, onClick: download }, '⬇ Download'),
          e('button', { className: 'btn btn-primary', style: { fontSize: 12 }, onClick: save, disabled: saving }, saving ? 'Saving...' : saved ? '✓ Saved!' : '💾 Save'),
        )
      ),
      e('table', { style: { width: '100%', borderCollapse: 'collapse' } },
        e('thead', null, e('tr', { style: { borderBottom: '1px solid #2e3150' } },
          ['Reference Key', 'Username', 'Password', ''].map(h => e('th', { key: h, style: { textAlign: 'left', fontSize: 11, color: '#6b7280', paddingBottom: 10, paddingRight: 12, fontWeight: 500 } }, h))
        )),
        e('tbody', null,
          creds.map((c, i) => e('tr', { key: i, style: { borderBottom: '1px solid rgba(46,49,80,.5)' } },
            e('td', { style: { padding: '8px 12px 8px 0' } }, e('input', { className: 'input', style: { fontFamily: 'monospace', fontSize: 12 }, value: c.ref, onChange: ev => updCred(i, 'ref', ev.target.value) })),
            e('td', { style: { padding: '8px 12px 8px 0' } }, e('input', { className: 'input', value: c.username, onChange: ev => updCred(i, 'username', ev.target.value) })),
            e('td', { style: { padding: '8px 12px 8px 0' } }, e('input', { className: 'input', type: showPw ? 'text' : 'password', value: c.password, onChange: ev => updCred(i, 'password', ev.target.value) })),
            e('td', null, e('button', { className: 'btn btn-ghost', style: { padding: '6px 8px', color: '#ef4444' }, onClick: () => setCreds(p => p.filter((_, j) => j !== i)) }, '🗑'))
          ))
        )
      )
    ),
    tab === 'vault' && e('div', { className: 'card' },
      e('h3', { style: { fontWeight: 600, color: '#f1f5f9', marginBottom: 16 } }, 'Vault Configuration'),
      e('div', { style: { display: 'flex', gap: 12, marginBottom: 16 } },
        ['local', 'cyberark'].map(v => e('label', { key: v, style: { flex: 1, display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 10, border: `1px solid ${vaultType === v ? '#034ea2' : '#2e3150'}`, background: vaultType === v ? 'rgba(3,78,162,.1)' : '#252840', cursor: 'pointer' } },
          e('input', { type: 'radio', name: 'vault', value: v, checked: vaultType === v, onChange: () => setVaultType(v) }),
          e('div', null,
            e('p', { style: { fontWeight: 500, color: '#f1f5f9' } }, v === 'local' ? 'Local' : 'CyberArk'),
            e('p', { style: { fontSize: 12, color: '#6b7280' } }, v === 'local' ? 'Store credentials in global.yml' : 'Fetch from CyberArk vault')
          )
        ))
      )
    ),
    tab === 'ipam' && e('div', { className: 'card' },
      e('h3', { style: { fontWeight: 600, color: '#f1f5f9', marginBottom: 16 } }, 'IP Allocation Method'),
      e('div', { style: { display: 'flex', gap: 12 } },
        ['static', 'infoblox'].map(v => e('label', { key: v, style: { flex: 1, display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 10, border: `1px solid ${ipMethod === v ? '#034ea2' : '#2e3150'}`, background: ipMethod === v ? 'rgba(3,78,162,.1)' : '#252840', cursor: 'pointer' } },
          e('input', { type: 'radio', name: 'ipam', value: v, checked: ipMethod === v, onChange: () => setIpMethod(v) }),
          e('div', null,
            e('p', { style: { fontWeight: 500, color: '#f1f5f9' } }, v === 'static' ? 'Static' : 'Infoblox'),
            e('p', { style: { fontSize: 12, color: '#6b7280' } }, v === 'static' ? 'Specify IPs manually' : 'Use Infoblox IPAM for auto allocation')
          )
        ))
      )
    ),
    tab === 'preview' && e(YamlPreview, { content: getYaml(), filename: 'global.yml' })
  )
}

function ConfigFilesPage() {
  const [files, setFiles] = useState([])
  const [selected, setSelected] = useState(null)
  const [content, setContent] = useState('')
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const loadFiles = async () => { setFiles(await api('/api/configs').catch(() => [])) }
  useEffect(() => { loadFiles() }, [])

  const openFile = async name => {
    setSelected(name)
    const data = await api(`/api/configs/${encodeURIComponent(name)}`)
    setContent(data.content || '')
  }

  const save = async () => {
    if (!selected) return
    setSaving(true)
    await api(`/api/configs/${encodeURIComponent(selected)}`, { method: 'POST', body: JSON.stringify({ content }) })
    setSaved(true); setTimeout(() => setSaved(false), 2000); setSaving(false)
  }

  const createNew = async () => {
    if (!newName.trim()) return
    const n = newName.trim()
    const fname = n.endsWith('.yml') || n.endsWith('.yaml') || n.endsWith('.json') ? n : `${n}.yml`
    await api(`/api/configs/${encodeURIComponent(fname)}`, { method: 'POST', body: JSON.stringify({ content: '# New configuration\n' }) })
    setNewName('')
    await loadFiles()
    openFile(fname)
  }

  const deleteFile = async name => {
    if (!confirm(`Delete ${name}?`)) return
    await api(`/api/configs/${encodeURIComponent(name)}`, { method: 'DELETE' })
    if (selected === name) { setSelected(null); setContent('') }
    loadFiles()
  }

  const download = () => {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/yaml' }))
    Object.assign(document.createElement('a'), { href: url, download: selected }).click()
    URL.revokeObjectURL(url)
  }

  return e('div', { style: { display: 'flex', gap: 20, height: 'calc(100vh - 120px)' } },
    e('div', { style: { width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 } },
      e('div', { style: { display: 'flex', gap: 8 } },
        e('input', { className: 'input flex-1', value: newName, onChange: ev => setNewName(ev.target.value), placeholder: 'new-config.yml', onKeyDown: ev => ev.key === 'Enter' && createNew() }),
        e('button', { className: 'btn btn-primary', style: { padding: '8px 12px' }, onClick: createNew }, '+')
      ),
      e('div', { className: 'card', style: { flex: 1, overflowY: 'auto', padding: 8 } },
        e('div', { style: { display: 'flex', justifyContent: 'space-between', padding: '4px 8px', marginBottom: 4 } },
          e('span', { style: { fontSize: 11, color: '#6b7280' } }, `${files.length} files`),
          e('button', { className: 'btn btn-ghost', style: { padding: '2px 6px', fontSize: 12 }, onClick: loadFiles }, '↻')
        ),
        files.length === 0 && e('p', { style: { textAlign: 'center', padding: 24, fontSize: 13, color: '#6b7280' } }, 'No config files'),
        files.map(f => e('div', { key: f.name, onClick: () => openFile(f.name), style: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', background: selected === f.name ? 'rgba(3,78,162,.2)' : 'transparent', border: selected === f.name ? '1px solid rgba(3,78,162,.3)' : '1px solid transparent', marginBottom: 2, transition: 'all 0.15s' } },
          e('span', { style: { fontSize: 14 } }, '📄'),
          e('div', { style: { flex: 1, minWidth: 0 } },
            e('p', { style: { fontSize: 13, color: '#d1d5db', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, f.name),
            e('p', { style: { fontSize: 11, color: '#6b7280' } }, `${(f.size/1024).toFixed(1)} KB`)
          ),
          e('button', { onClick: ev => { ev.stopPropagation(); deleteFile(f.name) }, style: { background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', opacity: 0, fontSize: 14 }, onMouseOver: ev => ev.currentTarget.style.opacity = 1, onMouseOut: ev => ev.currentTarget.style.opacity = 0 }, '🗑')
        ))
      )
    ),
    e('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: 0, minWidth: 0 } },
      selected ? e('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', border: '1px solid #2e3150', borderRadius: 12, overflow: 'hidden' } },
        e('div', { style: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: '#111827', borderBottom: '1px solid #2e3150' } },
          e('div', { style: { display: 'flex', gap: 6 } }, [['#ef4444', .6], ['#eab308', .6], ['#22c55e', .6]].map(([bg, op], i) => e('div', { key: i, style: { width: 12, height: 12, borderRadius: '50%', background: bg, opacity: op } }))),
          e('span', { style: { flex: 1, textAlign: 'center', fontFamily: 'monospace', fontSize: 12, color: '#9ca3af' } }, selected),
          e('div', { style: { display: 'flex', gap: 6 } },
            e('button', { className: 'btn btn-ghost', style: { fontSize: 12, padding: '4px 10px' }, onClick: download }, '⬇ Download'),
            e('button', { className: 'btn btn-primary', style: { fontSize: 12, padding: '4px 10px' }, onClick: save, disabled: saving }, saving ? 'Saving...' : saved ? '✓ Saved' : '💾 Save'),
          )
        ),
        e('textarea', { style: { flex: 1, background: '#030712', color: '#d1d5db', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, lineHeight: 1.7, padding: 16, border: 'none', outline: 'none', resize: 'none' }, value: content, onChange: ev => setContent(ev.target.value), spellCheck: false })
      ) : e('div', { style: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', border: '1px solid #2e3150', borderRadius: 12 } },
        e('div', { style: { textAlign: 'center' } }, e('div', { style: { fontSize: 48 } }, '📄'), e('p', { style: { fontSize: 16, fontWeight: 500, marginTop: 12 } }, 'Select a config file'))
      )
    )
  )
}

function SettingsPage({ settings, onSettingsSaved }) {
  const [form, setForm] = useState(settings)
  const [saved, setSaved] = useState(false)

  useEffect(() => { setForm(settings) }, [settings])

  const save = async () => {
    await api('/api/settings', { method: 'POST', body: JSON.stringify(form) })
    onSettingsSaved(form)
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  const Field2 = ({ label, key_, placeholder, desc, mono }) => e('div', null,
    e('label', { className: 'label' }, label),
    e('input', { className: 'input', style: mono ? { fontFamily: 'monospace', fontSize: 13 } : {}, value: form[key_] || '', onChange: ev => setForm(p => ({ ...p, [key_]: ev.target.value })), placeholder }),
    desc && e('p', { style: { fontSize: 11, color: '#6b7280', marginTop: 4 } }, desc)
  )

  return e('div', { style: { maxWidth: 640 } },
    e('div', { className: 'card', style: { marginBottom: 20 } },
      e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } },
        e('h3', { style: { fontWeight: 600, color: '#f1f5f9' } }, 'Framework Location'),
        e('button', { className: 'btn btn-primary', onClick: save }, saved ? '✓ Saved!' : '💾 Save Settings')
      ),
      e('div', { className: 'space-y-4' },
        e(Field2, { label: 'ZTF Installation Path', key_: 'ztfPath', placeholder: `${window.__HOME || '/home/user'}/zerotouch-framework`, desc: 'Directory containing main.py', mono: true }),
        e(Field2, { label: 'Python Executable', key_: 'pythonPath', placeholder: 'python3', desc: 'Path to Python 3.9+ (e.g., python3, /usr/bin/python3.11)', mono: true }),
        e(Field2, { label: 'Config Files Directory', key_: 'configDir', placeholder: '~/.ztf-ui/configs', desc: 'Where generated config files are stored', mono: true }),
        e(Field2, { label: 'Repository URL', key_: 'repoUrl', placeholder: 'https://github.com/nutanixdev/zerotouch-framework.git', desc: 'Used when cloning during setup', mono: true }),
      )
    ),
    e('div', { className: 'card', style: { background: 'rgba(3,78,162,.05)', border: '1px solid rgba(3,78,162,.2)' } },
      e('h3', { style: { fontWeight: 600, color: '#f1f5f9', marginBottom: 8 } }, '📚 About ZTF UI'),
      e('p', { style: { fontSize: 13, color: '#9ca3af', lineHeight: 1.7 } }, 'ZeroTouch Framework UI is an open-source web interface for the Nutanix ZeroTouch Framework, providing a visual alternative to GitHub Actions and CLI-based configuration management.'),
      e('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12, fontSize: 12, color: '#6b7280' } },
        e('div', null, 'UI Version: ', e('span', { style: { color: '#d1d5db' } }, '1.0.0')),
        e('div', null, 'ZTF Supported: ', e('span', { style: { color: '#d1d5db' } }, 'AOS 6.5+, PC 2022.6+')),
      )
    )
  )
}

// ─── App Root ─────────────────────────────────────────────────────────────────

function App() {
  const { path, navigate } = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [ztfInstalled, setZtfInstalled] = useState(false)
  const [systemChecks, setSystemChecks] = useState([])
  const [settings, setSettings] = useState({ ztfPath: '', pythonPath: 'python3', configDir: '', repoUrl: '' })

  useEffect(() => {
    api('/api/settings').then(s => setSettings(s)).catch(() => {})
    api('/api/system/check').then(d => { setSystemChecks(d.checks || []); setZtfInstalled(d.ztfInstalled || false) }).catch(() => {})
  }, [])

  const parts = path.split('/').filter(Boolean)
  const [page, ...rest] = parts

  const renderPage = () => {
    if (!page || page === '') return e(Dashboard, { navigate, ztfInstalled, systemChecks })
    if (page === 'setup') return e(Setup, { setZtfInstalled, setSystemChecks })
    if (page === 'global-config') return e(GlobalConfigPage, null)
    if (page === 'workflows' && rest[0]) return e(WorkflowDetailPage, { workflowId: rest[0] })
    if (page === 'workflows') return e(WorkflowsPage, null)
    if (page === 'scripts') return e(ScriptsPage, null)
    if (page === 'configs') return e(ConfigFilesPage, null)
    if (page === 'executions') return e(ExecutionsPage, null)
    if (page === 'settings') return e(SettingsPage, { settings, onSettingsSaved: setSettings })
    return e('div', { style: { textAlign: 'center', padding: 40, color: '#9ca3af' } }, '404 - Page not found')
  }

  const PAGE_META = {
    '': ['Dashboard', 'ZeroTouch Framework Control Center'],
    'setup': ['Setup & Install', 'Install and configure ZeroTouch Framework'],
    'global-config': ['Global Configuration', 'Credentials, vault, and IPAM settings (global.yml)'],
    'workflows': ['Workflows', 'Pre-built automation workflows'],
    'scripts': ['Script Library', 'Browse and run individual ZTF scripts'],
    'configs': ['Config Files', 'Manage YAML/JSON configuration files'],
    'executions': ['Execution History', 'View past workflow and script runs'],
    'settings': ['Settings', 'Configure ZTF path, Python, and options'],
  }

  const wfId = page === 'workflows' && rest[0]
  const wf = wfId && WORKFLOWS.find(w => w.id === rest[0])
  const meta = wf ? [wf.name, wf.desc] : (PAGE_META[page || ''] || ['ZTF UI', ''])

  return e(Layout, {
    title: meta[0],
    subtitle: meta[1],
    ztfInstalled,
    sidebarOpen,
    setSidebarOpen,
    navigate,
    currentPath: path,
  }, renderPage())
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

const root = createRoot(document.getElementById('root'))
root.render(e(App))

document.getElementById('loading').style.display = 'none'
document.getElementById('root').style.display = 'block'
