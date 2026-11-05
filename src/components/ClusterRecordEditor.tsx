import { useEffect, useState } from 'react'
import type { ClusterRecord, Operations } from './ClusterOperations'
import { operationsRequest } from './ClusterOperations'
import { apiFetch } from '../utils/api'
import { load as parseYaml } from 'js-yaml'

type BaselineChoice = { name: string; vip: string; nodes: { serial: string; hostIp: string; cvmIp: string }[] }

const initial = () => ({ name: '', datacenter: '', owner: '', peEndpoint: '', peCredential: '', expectedUuid: '', expectedNodes: [], configFiles: [], pipelineId: '', recoveryProfileId: '' })

export default function ClusterRecordEditor({ data, refresh }: { data: Operations; refresh: () => void }) {
  const [editing, setEditing] = useState(false), [identity, setIdentity] = useState('')
  const [form, setForm] = useState<Omit<ClusterRecord, 'id' | 'updatedAt'>>(initial())
  const [nodes, setNodes] = useState('[]'), [files, setFiles] = useState<{ name: string }[]>([])
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [baseRevision, setBaseRevision] = useState(data.revision)
  const [baselineFile, setBaselineFile] = useState(''), [choices, setChoices] = useState<BaselineChoice[]>([])
  useEffect(() => { let active = true; void apiFetch('/api/configs').then(async r => { if (!r.ok) throw new Error(); const value = await r.json(); if (active && Array.isArray(value)) setFiles(value) }).catch(() => {}); return () => { active = false } }, [])
  const open = (id = '') => {
    const row = data.clusters.find(c => c.id === id)
    const value = row ? { name: row.name, datacenter: row.datacenter, owner: row.owner, peEndpoint: row.peEndpoint, peCredential: row.peCredential, expectedUuid: row.expectedUuid, expectedNodes: row.expectedNodes, configFiles: row.configFiles, pipelineId: row.pipelineId, recoveryProfileId: row.recoveryProfileId } : initial()
    setIdentity(id); setForm(value); setNodes(JSON.stringify(value.expectedNodes, null, 2)); setBaseRevision(data.revision); setEditing(true); setError(''); setChoices([]); setBaselineFile('')
  }
  const loadBaseline = async () => {
    if (!baselineFile) return
    setBusy(true); setError(''); setChoices([])
    try {
      const response = await apiFetch(`/api/configs/${encodeURIComponent(baselineFile)}`)
      if (!response.ok) throw new Error('The selected saved configuration could not be read.')
      const body = await response.json()
      if (typeof body.content !== 'string' || body.content.length > 131072) throw new Error('Use a Foundation YAML smaller than 128 KiB.')
      const value = parseYaml(body.content) as { create_clusters?: { cluster_name?: unknown; cluster_vip?: unknown; nodes_list?: { node_serial?: unknown; host_ip?: unknown; cvm_ip?: unknown }[] }[] }
      if (!Array.isArray(value?.create_clusters) || !value.create_clusters.length || value.create_clusters.length > 100) throw new Error('The file must contain a bounded create_clusters list. No record has been saved.')
      const extracted = value.create_clusters.map(cluster => {
        if (typeof cluster?.cluster_name !== 'string' || typeof cluster.cluster_vip !== 'string' || !Array.isArray(cluster.nodes_list) || !cluster.nodes_list.length || cluster.nodes_list.length > 256) throw new Error('The deployment file is missing expected cluster or node identities.')
        const nodes = cluster.nodes_list.map(node => {
          if (typeof node?.node_serial !== 'string' || typeof node.host_ip !== 'string' || typeof node.cvm_ip !== 'string') throw new Error('Every node needs serial, AHV IP and CVM IP.')
          return { serial: node.node_serial, hostIp: node.host_ip, cvmIp: node.cvm_ip }
        })
        return { name: cluster.cluster_name, vip: cluster.cluster_vip, nodes }
      })
      setChoices(extracted)
    } catch { setError('Could not extract a complete Foundation cluster/node baseline. Review the selected file; no record has been saved.') }
    finally { setBusy(false) }
  }
  const applyBaseline = (index: number) => {
    const selected = choices[index]
    if (!selected) return
    const host = selected.vip.includes(':') ? `[${selected.vip}]` : selected.vip
    setForm({ ...form, name: selected.name, peEndpoint: `https://${host}:9440`, expectedUuid: '', expectedNodes: selected.nodes, configFiles: [...new Set([...form.configFiles, baselineFile])] })
    setNodes(JSON.stringify(selected.nodes, null, 2))
    setChoices([])
  }
  const save = async () => {
    setBusy(true); setError('')
    try {
      const expectedNodes: unknown = JSON.parse(nodes)
      await operationsRequest(identity ? `/clusters/${identity}` : '/clusters', { ...form, expectedNodes, revision: baseRevision }, identity ? 'PUT' : 'POST')
      setEditing(false); refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'Cluster record could not be saved') }
    finally { setBusy(false) }
  }
  return <section className="card space-y-3"><div className="flex flex-wrap gap-3"><button className="btn-primary" onClick={() => open()}>Add cluster record</button>{data.clusters.length > 0 && <label className="text-sm text-gray-400">Edit cluster record<select className="input" value={identity} onChange={e => { if (e.target.value) open(e.target.value) }}><option value="">Select a managed cluster</option>{data.clusters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}</div>
    <p className="text-sm text-gray-400">Records organize existing automation. Saving does not modify PE, deploy infrastructure, change credential values or approve a workflow.</p>
    {editing && <form className="space-y-4" onSubmit={e => { e.preventDefault(); void save() }}><h2 className="section-title">{identity ? 'Edit managed cluster' : 'Register a managed cluster'}</h2>
      <div className="rounded border border-border p-3 space-y-2"><label className="block text-sm text-gray-400">Foundation deployment file<select aria-label="Foundation deployment file" className="input mt-1" value={baselineFile} onChange={e => { setBaselineFile(e.target.value); setChoices([]) }}><option value="">Choose a saved YAML (optional)</option>{files.filter(f => /\.ya?ml$/.test(f.name)).map(file => <option key={file.name}>{file.name}</option>)}</select></label><button type="button" className="btn-secondary" disabled={busy || !baselineFile} onClick={() => void loadBaseline()}>Read expected membership from YAML</button>{choices.length > 0 && <label className="block text-sm text-gray-400">Choose the cluster to use<select aria-label="Choose cluster baseline" className="input mt-1" value="" onChange={e => { if (e.target.value !== '') applyBaseline(Number(e.target.value)) }}><option value="">Review and select a cluster</option>{choices.map((choice, i) => <option key={i} value={i}>{choice.name} · {choice.vip} · {choice.nodes.length} nodes</option>)}</select></label>}<p className="text-xs text-gray-500">This reads only identity/address fields into the draft. Verify the intended targets and independently supply the actual UUID; credentials and passwords are not imported. No deployment or save occurs.</p></div>
      <div className="grid md:grid-cols-2 gap-4">{([['name', 'Exact cluster name'], ['datacenter', 'Datacenter label'], ['owner', 'Operational owner'], ['peEndpoint', 'PE HTTPS endpoint'], ['peCredential', 'PE read-only credential reference'], ['expectedUuid', 'Expected cluster UUID (independently verified)']] as const).map(([key, title]) => <label className="block text-sm text-gray-400" key={key}>{title}<input className="input mt-1" required={key === 'name' || key === 'peEndpoint'} maxLength={key === 'peEndpoint' ? 300 : 128} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} /></label>)}</div>
      <label className="block text-sm text-gray-400">Expected physical membership (JSON: serial, hostIp, cvmIp)<textarea className="input mt-1 min-h-[140px] font-mono text-xs" value={nodes} onChange={e => setNodes(e.target.value)} placeholder={'[{"serial":"NODE01","hostIp":"192.0.2.22","cvmIp":"192.0.2.23"}]'} /></label>
      <p className="text-xs text-gray-500">Obtain the UUID and complete node baseline independently. Empty identity or membership allows an organizational record but blocks health collection. Changing identity, membership, endpoint or credential invalidates previous observations. Do not paste passwords.</p>
      <div className="grid md:grid-cols-3 gap-4"><label className="text-sm text-gray-400">Linked configuration files<select multiple className="input mt-1 h-32" value={form.configFiles} onChange={e => setForm({ ...form, configFiles: Array.from(e.target.selectedOptions, o => o.value) })}>{[...new Set([...files.map(f => f.name), ...form.configFiles])].sort().map(name => <option key={name}>{name}</option>)}</select></label><label className="text-sm text-gray-400">Post-configuration pipeline<select className="input mt-1" value={form.pipelineId} onChange={e => setForm({ ...form, pipelineId: e.target.value })}><option value="">No pipeline linked</option>{data.pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label className="text-sm text-gray-400">Recovery profile<select className="input mt-1" value={form.recoveryProfileId} onChange={e => setForm({ ...form, recoveryProfileId: e.target.value })}><option value="">No recovery profile linked</option>{data.recoveryProfiles.filter(p => !p.archivedAt || p.id === form.recoveryProfileId).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label></div>
      {error && <p role="status" className="text-sm text-amber-400">{error}</p>}<div className="flex gap-3"><button disabled={busy} className="btn-primary" type="submit">Save cluster record</button><button className="btn-secondary" type="button" onClick={() => setEditing(false)}>Cancel</button></div>
    </form>}
  </section>
}
