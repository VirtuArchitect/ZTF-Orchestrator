import { WORKFLOWS, SCRIPTS } from './data'

export const DEPLOYMENT_METHODS = [
  { id: 'cluster-create-foundation-vm', name: 'Foundation VM', status: 'Implemented · controlled UAT',
    description: 'Use a classic Foundation VM to image nodes and create an AHV cluster.',
    prerequisites: 'Reachable Foundation 5.x service, supported hardware, image inventory and checksums, IPMI credential references, and network access from Foundation to every node.' },
  { id: 'cluster-create', name: 'Foundation Central', status: 'Existing ZTF execution path',
    description: 'Use Foundation Central associated with Prism Central to discover and deploy nodes.',
    prerequisites: 'Configured Foundation Central endpoint, credentials, eligible discovered nodes and approved AOS/AHV images. Confirm compatibility for your hardware and service version.' },
  { id: 'cluster-create-standalone-fca', name: 'Standalone FCA', status: 'Guarded Lifecycle integration · validate compatibility',
    description: 'Use a standalone Foundation Central Appliance through its Lifecycle APIs.',
    prerequisites: 'Reachable standalone FCA, matching Lifecycle API and inventory, credential references and explicit execution acknowledgement. Availability does not establish support for every hardware or HCI topology.' },
] as const

export const DEPLOYMENT_STEPS = [
  'Choose deployment method', 'Connect to the deployment service', 'Define the cluster',
  'Validate', 'Review & approve', 'Deploy & monitor', 'Continue with post-configuration',
]

export type GuideDraft = { method: string; step: number }
const key = (username: string, type: string) => `ztf-guide-v1:${encodeURIComponent(username)}:${type}`
export function landingPage(username: string): '/start' | '/overview' {
  try { return localStorage.getItem(key(username, 'landing')) === '/overview' ? '/overview' : '/start' }
  catch { return '/start' }
}
export function saveLandingPage(username: string, value: '/start' | '/overview') {
  localStorage.setItem(key(username, 'landing'), value)
}
export function guideDraft(username: string): GuideDraft {
  const fallback = { method: DEPLOYMENT_METHODS[0].id, step: 0 }
  try {
    const value = JSON.parse(localStorage.getItem(key(username, 'deployment')) || 'null')
    return value && DEPLOYMENT_METHODS.some(m => m.id === value.method) && Number.isInteger(value.step)
      && value.step >= 0 && value.step < DEPLOYMENT_STEPS.length
      ? { method: value.method, step: value.step } : fallback
  } catch { return fallback }
}
export function saveGuideDraft(username: string, draft: GuideDraft) {
  // Only a method identifier and guidance position; never cluster inputs or secrets.
  localStorage.setItem(key(username, 'deployment'), JSON.stringify({ method: draft.method, step: draft.step }))
}
export function actionName(id: string) {
  return WORKFLOWS.find(w => w.id === id)?.name || SCRIPTS.find(s => s.id === id)?.name || id
}
export function workflowPrerequisite(id: string, category: string) {
  return DEPLOYMENT_METHODS.find(m => m.id === id)?.prerequisites
    || (category === 'Infrastructure' ? 'Review hardware compatibility, image sources, target nodes, addressing and imaging approvals.'
      : 'Prepare the matching configuration, credential references, certificate trust and required approvals. Review the workflow details and supported controls.')
}
