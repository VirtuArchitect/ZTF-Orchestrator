import { useEffect, useState } from 'react'
import { ArrowRight, Compass, Server, Settings, Activity, GitBranch, Save } from 'lucide-react'
import { Link, Navigate, useParams } from '../router'
import Layout from '../components/Layout'
import { useStore } from '../store'
import { apiFetch } from '../utils/api'
import { DEPLOYMENT_METHODS, DEPLOYMENT_STEPS, guideDraft, landingPage, saveGuideDraft, saveLandingPage } from '../startGuide'

export function LandingPage() {
  const username = useStore(s => s.user?.username || '')
  return <Navigate to={landingPage(username)} replace />
}

const choices = [
  { id: 'deploy', title: 'Deploy a Cluster', text: 'Prepare and deploy a new AHV cluster.', icon: Server },
  { id: 'configure', title: 'Configure an Existing Cluster', text: 'Configure credentials, EULA, Pulse, DNS, NTP, networking and storage.', icon: Settings },
  { id: 'monitor', title: 'Monitor & Assess', text: 'Check drift, collect inventory and assess upgrade readiness.', icon: Activity },
  { id: 'automation', title: 'Run Saved Automation', text: 'Open existing pipelines, workflows and schedules.', icon: GitBranch },
]

function useGuideSystemStatus() {
  const setSystemChecks = useStore(s => s.setSystemChecks)
  useEffect(() => {
    let active = true
    apiFetch('/api/system/check').then(r => r.ok ? r.json() : null).then(value => {
      if (active && value && Array.isArray(value.checks) && typeof value.ztfInstalled === 'boolean')
        setSystemChecks(value.checks, value.ztfInstalled)
    }).catch(() => { /* Keep the existing status when collection fails. */ })
    return () => { active = false }
  }, [setSystemChecks])
}

export default function StartHere() {
  useGuideSystemStatus()
  const user = useStore(s => s.user)
  const username = user?.username || ''
  const [landing, setLanding] = useState(() => landingPage(username))
  const [notice, setNotice] = useState('')
  return <Layout title="Start Here" subtitle="Choose what you want to accomplish">
    <div className="max-w-6xl mx-auto space-y-6">
      <section className="card border-nutanix-blue/30">
        <Compass className="text-nutanix-cyan mb-3" size={28} />
        <h2 className="text-2xl font-semibold text-gray-100">Where would you like to start?</h2>
        <p className="text-gray-400 mt-2">Follow a guided path or open your saved automation. Each path uses the existing workflows, approvals and verification gates.</p>
      </section>
      <div className="grid md:grid-cols-2 gap-4">
        {choices.map(c => <Link key={c.id} to={`/start/${c.id}`} className="card hover:border-nutanix-blue transition-colors group">
          <c.icon size={24} className="text-nutanix-cyan mb-4" />
          <h2 className="text-lg font-semibold text-gray-100 flex gap-3 items-center">{c.title}<ArrowRight size={18} /></h2>
          <p className="text-sm text-gray-400 mt-2">{c.text}</p>
        </Link>)}
      </div>
      <div className="card flex flex-wrap items-center gap-4">
        <label className="text-sm text-gray-300" htmlFor="landing-page">My landing page</label>
        <select id="landing-page" className="input w-auto" value={landing} onChange={e => {
          const next = e.target.value === '/overview' ? '/overview' : '/start'
          try { saveLandingPage(username, next); setLanding(next); setNotice('Landing preference saved for this user in this browser.') }
          catch { setNotice('Browser storage is unavailable; the landing preference was not saved.') }
        }}><option value="/start">Start Here</option><option value="/overview">Overview</option></select>
        <Link to="/overview" className="btn-secondary">Open Overview</Link>
        <p role="status" className="text-sm text-gray-400">{notice}</p>
      </div>
    </div>
  </Layout>
}

function GuideLinks({ items }: { items: Array<[string, string]> }) {
  return <div className="flex flex-wrap gap-3 mt-5">{items.map(([to, text]) => <Link key={to} to={to} className="btn-secondary gap-2">{text}<ArrowRight size={14} /></Link>)}</div>
}

export function OperatorJourney() {
  useGuideSystemStatus()
  const { journey } = useParams<{ journey: string }>()
  const user = useStore(s => s.user)
  const username = user?.username || ''
  const canOperate = user?.role === 'admin' || user?.role === 'operator'
  const [draft, setDraft] = useState(() => guideDraft(username))
  const [notice, setNotice] = useState('')
  const choice = choices.find(c => c.id === journey)
  if (!choice) return <Navigate to="/start" replace />
  const method = DEPLOYMENT_METHODS.find(m => m.id === draft.method) || DEPLOYMENT_METHODS[0]
  const workflowPath = `/workflows/${method.id}`
  const guidance = [
    'Choose the deployment service you already have. Check its prerequisites and implementation status below before continuing.',
    'Open the selected workflow and enter its endpoint and credential references. Use its connection or inventory checks. Confirm certificate trust and access from the service to the target nodes; a saved endpoint is not a successful connection test.',
    'Use the existing form to define nodes, IPMI references, addressing, images, checksums and cluster settings, or Import Config. Use Download Config to retain the actual configuration; saving this guide does not save form inputs.',
    'Run the workflow Dry Run and any service-specific native validation or image inventory checks. Fix missing inputs and connectivity failures. Dry Run coverage differs by workflow; a pass does not prove deployment readiness or hardware support.',
    'In the workflow, review the exact node serials, management addresses, cluster VIP, image versions and requested changes. Obtain the required approval for the exact YAML. Imaging can overwrite existing installations. Changing the configuration requires renewed review.',
    'Start execution from the workflow only after review. Monitor the live execution and per-node progress in Jobs. Preserve logs and inspect target state before aborting, restarting or retrying a partial deployment.',
    'Confirm Foundation completion and fresh PE health before post-configuration. Prepare a pipeline for this cluster, select its saved configurations, review credentials and approvals, and verify each sensitive stage before proceeding.',
  ]
  return <Layout title={choice.title} subtitle="Guidance around existing execution paths">
    <div className="max-w-6xl mx-auto space-y-5">
      <Link to="/start" className="text-sm text-nutanix-cyan">← Start Here</Link>
      {!canOperate && <p className="card text-sm text-yellow-400">Read-only guidance. Your viewer role cannot open deployment or configuration execution forms.</p>}
      {journey === 'deploy' ? <>
        <div className="card text-sm text-gray-400">Guidance position only. Moving between stages does not validate inputs, grant approval or execute a deployment.</div>
        <div className="grid lg:grid-cols-[260px_1fr] gap-5">
          <nav aria-label="Deployment journey" className="card space-y-2 self-start">
            {DEPLOYMENT_STEPS.map((label, i) => <button key={label} aria-current={draft.step === i ? 'step' : undefined}
              className={`w-full text-left rounded-lg p-3 text-sm ${draft.step === i ? 'bg-nutanix-blue text-white' : 'text-gray-400 hover:bg-surface-elevated'}`}
              onClick={() => { setDraft({ ...draft, step: i }); setNotice('') }}>{i + 1}. {label}</button>)}
          </nav>
          <section className="card min-w-0">
            <p className="text-xs uppercase tracking-wide text-gray-500">Guidance stage {draft.step + 1} of 7</p>
            <h2 className="text-xl font-semibold text-gray-100 mt-2">{DEPLOYMENT_STEPS[draft.step]}</h2>
            <p className="text-gray-400 text-sm leading-relaxed mt-3">{guidance[draft.step]}</p>
            {draft.step === 0 ? <fieldset className="space-y-3 mt-5"><legend className="sr-only">Deployment method</legend>
              {DEPLOYMENT_METHODS.map(m => <label key={m.id} className={`block rounded-lg border p-4 cursor-pointer ${draft.method === m.id ? 'border-nutanix-blue bg-nutanix-blue/5' : 'border-border'}`}>
                <span className="flex items-center gap-3 text-gray-100 font-semibold"><input type="radio" aria-label={m.name} name="deployment-method" value={m.id} checked={draft.method === m.id}
                  onChange={() => { setDraft({ ...draft, method: m.id }); setNotice('') }} />{m.name}</span>
                <span className="block text-xs text-nutanix-cyan mt-2">{m.status}</span>
                <span className="block text-sm text-gray-400 mt-2">{m.description}</span>
                <span className="block text-sm text-gray-400 mt-2"><strong>Before you begin: </strong>{m.prerequisites}</span>
              </label>)}
            </fieldset> : <p className="text-sm text-gray-400 mt-4">Selected method: <strong className="text-gray-100">{method.name}</strong></p>}
            {canOperate && draft.step > 0 && draft.step < 5 && <GuideLinks items={[[workflowPath, `Open ${method.name} configuration`], ...(draft.step === 4 ? [['/approvals', 'Review approvals'] as [string, string]] : [])]} />}
            {draft.step === 5 && <GuideLinks items={[...(canOperate ? [[workflowPath, 'Open deployment workflow'] as [string, string]] : []), ['/jobs', 'Monitor deployment and logs'], ['/executions', 'Execution history']]} />}
            {draft.step === 6 && <GuideLinks items={[["/start/configure", 'Continue to Post-Configuration'], ['/validation-evidence', 'Review verification evidence']]} />}
            <div className="mt-6 pt-5 border-t border-border flex flex-wrap gap-3">
              <button className="btn-secondary gap-2" onClick={() => {
                try { saveGuideDraft(username, draft); setNotice('Saved guidance position in this browser. No configuration was saved and nothing was executed. Use Download Config in the form to keep cluster inputs.') }
                catch { setNotice('Browser storage is unavailable. Guidance position was not saved.') }
              }}><Save size={14} />Save and continue later</button>
              {draft.step < 6 && <button className="btn-primary" onClick={() => { setDraft({ ...draft, step: draft.step + 1 }); setNotice('') }}>Next guidance stage</button>}
            </div>
            <p role="status" className="text-sm text-gray-400 mt-3">{notice}</p>
          </section>
        </div>
      </> : journey === 'configure' ? <section className="card">
        <h2 className="text-xl font-semibold text-gray-100">Build your post-configuration pipeline</h2>
        <ol className="list-decimal pl-5 space-y-3 text-sm text-gray-400 mt-4">
          <li>Confirm PE health and certificate trust. Prepare this cluster’s administrator credential references.</li>
          <li>Change the PE administrator password only when required. Verify the new login before subsequent stages use it.</li>
          <li>Prepare Configure Cluster configurations for EULA acceptance, approved Pulse setting, DNS and NTP.</li>
          <li>Add supported VM networks and storage containers. Review optional HA and local administrator stages separately.</li>
          <li>Save each reviewed configuration in Config Files, then choose its matching action and file in Pipelines. Saving does not execute it.</li>
          <li>Run Dry Run where available, obtain exact-intent approvals, and verify authentication and requested properties between sensitive stages.</li>
          <li>Record final verification evidence. Configuration completion and deployed infrastructure do not by themselves establish operational readiness.</li>
        </ol>
        <GuideLinks items={[...(canOperate ? [['/workflows/config-cluster', 'Configure Cluster'], ['/scripts', 'Password and local-user scripts']] as Array<[string, string]> : []), ['/configs', 'Saved configurations'], ['/pipelines', 'Open pipelines'], ['/validation-evidence', 'Verification evidence']]} />
      </section> : journey === 'monitor' ? <section className="card">
        <h2 className="text-xl font-semibold text-gray-100">Check observed state and readiness</h2>
        <p className="text-sm text-gray-400 mt-3">Set up trusted PE/PC connections and read-only credential references. Collect fresh inventory in Upgrade Advisor, review evidence and readiness actions, and save the assessment. Use live PE drift monitoring for DNS, NTP and Pulse; collection failures remain unknown rather than healthy.</p>
        <GuideLinks items={[["/drift", 'Drift Detection'], ['/upgrade-advisor', 'Inventory and upgrade readiness'], ['/validation-evidence', 'Validation evidence']]} />
      </section> : <section className="card">
        <h2 className="text-xl font-semibold text-gray-100">Open saved automation</h2>
        <p className="text-sm text-gray-400 mt-3">Review the action, target configuration, credentials and approval before running. Pipelines execute sequentially with pass/fail gates; a saved pipeline has not run.</p>
        <GuideLinks items={[["/pipelines", 'Pipelines'], ['/schedules', 'Schedules'], ['/jobs', 'Jobs'], ...(canOperate ? [['/workflows', 'Workflow catalogue']] as Array<[string, string]> : [])]} />
      </section>}
      <section className="grid sm:grid-cols-3 gap-3 text-sm">
        {['Deployment progress: service and node execution status', 'Configuration completion: pipeline stage outcomes', 'Verified readiness: fresh checks and acceptance evidence'].map(text => <p key={text} className="card text-gray-400">{text}</p>)}
      </section>
    </div>
  </Layout>
}
