export const PASSWORD_SETUP_WORKFLOW = 'initial-host-cvm-password-setup'
export const PASSWORD_SETUP_CONFIRMATION = 'SET INITIAL HOST AND CVM PASSWORDS'
export const AHV_ACCOUNTS = ['root', 'admin', 'nutanix'] as const
export type AhvAccount = typeof AHV_ACCOUNTS[number]
export type PasswordAccount = { username: AhvAccount; current_credential_ref: string; replacement_credential_ref: string }
export type CvmTarget = { address: string; ssh_host_key_sha256: string; current_credential_ref: string; replacement_credential_ref: string }
export type HostTarget = { address: string; ssh_host_key_sha256: string; access_credential_ref: string; accounts: PasswordAccount[] }
export type PasswordSetupConfig = { cluster_name: string; datacenter?: string; host_key_evidence: string; cvms: CvmTarget[]; hosts: HostTarget[] }

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown): v is string => typeof v === 'string' && !!v.trim() && v.length <= 2048 && !/[\x00-\x1f\x7f]/.test(v)
const ref = (v: unknown) => text(v) && /^[A-Za-z0-9_.-]{1,128}$/.test(v)
const pin = (v: unknown) => typeof v === 'string' && /^SHA256:[A-Za-z0-9+/]{43}$/.test(v)
const canonicalAddress = (v: unknown): string | null => {
  if (!text(v) || /[\s%\[\]]/.test(v)) return null
  if (/^(0|[1-9]\d{0,2})(\.(0|[1-9]\d{0,2})){3}$/.test(v)) return v.split('.').every(n => Number(n) <= 255) ? v : null
  if (!v.includes(':')) return null
  try { return new URL(`http://[${v}]/`).hostname.toLowerCase() } catch { return null }
}
const address = (v: unknown) => canonicalAddress(v) !== null
const keys = (v: Record<string, unknown>, required: string[], optional: string[] = []) => required.every(k => Object.prototype.hasOwnProperty.call(v, k)) && Object.keys(v).every(k => [...required, ...optional].includes(k))

/** Strict reference-only boundary for both imports and generated intent. Server validates identity and versions. */
export function validatePasswordSetup(value: unknown): value is PasswordSetupConfig {
  if (!object(value) || !keys(value, ['cluster_name', 'host_key_evidence', 'cvms', 'hosts'], ['datacenter'])
    || !text(value.cluster_name) || !text(value.host_key_evidence) || (value.datacenter !== undefined && !text(value.datacenter))) return false
  const { cvms, hosts } = value
  if (!Array.isArray(cvms) || !cvms.length || cvms.length > 64 || !Array.isArray(hosts) || !hosts.length || hosts.length > 64) return false
  if (!cvms.every(n => object(n) && keys(n, ['address', 'ssh_host_key_sha256', 'current_credential_ref', 'replacement_credential_ref'])
    && address(n.address) && pin(n.ssh_host_key_sha256) && ref(n.current_credential_ref) && ref(n.replacement_credential_ref)
    && n.current_credential_ref !== n.replacement_credential_ref)) return false
  if (cvms.some(n => n.current_credential_ref !== cvms[0].current_credential_ref || n.replacement_credential_ref !== cvms[0].replacement_credential_ref)) return false
  if (!hosts.every(n => object(n) && keys(n, ['address', 'ssh_host_key_sha256', 'access_credential_ref', 'accounts'])
    && address(n.address) && pin(n.ssh_host_key_sha256) && ref(n.access_credential_ref) && Array.isArray(n.accounts) && n.accounts.length > 0
    && n.accounts.every(a => object(a) && keys(a, ['username', 'current_credential_ref', 'replacement_credential_ref'])
      && AHV_ACCOUNTS.includes(a.username as AhvAccount) && ref(a.current_credential_ref) && ref(a.replacement_credential_ref)
      && a.current_credential_ref !== a.replacement_credential_ref)
    && new Set(n.accounts.map(a => a.username)).size === n.accounts.length)) return false
  return new Set([...cvms, ...hosts].map(n => canonicalAddress(n.address))).size === cvms.length + hosts.length
}
