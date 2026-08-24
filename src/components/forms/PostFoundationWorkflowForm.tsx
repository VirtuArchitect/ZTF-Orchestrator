import { useEffect, useMemo, useState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import type { ConnectionProfile, WorkflowDef } from '../../types'
import { toYaml } from '../../utils/yaml'

interface Props {
  workflow: WorkflowDef
  onYamlChange: (yaml: string) => void
  profile?: ConnectionProfile
}

interface TargetState {
  prismElementIp: string
  clusterName: string
  peCredential: string
  cvmCredential: string
  pcIp: string
  pcCredential: string
}

interface Operation {
  id: string
  enabled: boolean
  reviewed: boolean
}

interface OperationValues {
  eulaUsername: string
  eulaCompanyName: string
  eulaJobTitle: string
  pulseEnabled: boolean
  haEnabled: boolean
  haHostFailures: string
  dataServicesIp: string
  storageContainers: string
  vmNetworks: string
}

const WORKFLOW_OPERATIONS: Record<string, Array<{ id: string; label: string; highRisk?: boolean }>> = {
  'post-foundation-baseline': [
    { id: 'health_check', label: 'Health check' },
    { id: 'register_prism_central', label: 'Register with Prism Central' },
    { id: 'accept_eula', label: 'Accept EULA' },
    { id: 'update_pulse', label: 'Update Pulse' },
    { id: 'ha_reservation', label: 'HA reservation' },
    { id: 'storage_containers', label: 'Storage containers' },
    { id: 'data_services_ip', label: 'Data services IP' },
    { id: 'dns_servers', label: 'DNS servers' },
    { id: 'ntp_servers', label: 'NTP servers' },
  ],
  'pe-monitoring-baseline': [
    { id: 'ncc_health_check', label: 'NCC health evidence' },
    { id: 'smtp', label: 'SMTP server' },
    { id: 'alert_email_contacts', label: 'Alert email contacts' },
    { id: 'snmpv3', label: 'SNMPv3' },
    { id: 'syslog', label: 'Syslog' },
  ],
  'pe-security-hardening': [
    { id: 'cvm_aide', label: 'CVM AIDE' },
    { id: 'ahv_aide', label: 'AHV AIDE' },
    { id: 'high_strength_passwords', label: 'High-strength password policy' },
    { id: 'scma_schedule', label: 'SCMA schedule' },
    { id: 'snmpv3_only', label: 'SNMPv3-only mode' },
    { id: 'cluster_lockdown', label: 'Cluster lockdown', highRisk: true },
    { id: 'ssh_access_controls', label: 'SSH access controls', highRisk: true },
  ],
  'pe-network-baseline': [
    { id: 'vm_networks', label: 'VM networks' },
    { id: 'virtual_switch_descriptions', label: 'Virtual switch descriptions' },
    { id: 'uplink_intent', label: 'Uplink intent' },
    { id: 'lacp_sequence', label: 'LACP sequence', highRisk: true },
  ],
  'pe-certificate-baseline': [
    { id: 'generate_csr', label: 'Generate CSR' },
    { id: 'import_certificate', label: 'Import signed certificate', highRisk: true },
    { id: 'validate_certificate', label: 'Validate certificate' },
  ],
  'hardware-out-of-band-baseline': [
    { id: 'bmc_credential_rotation', label: 'BMC credential rotation', highRisk: true },
    { id: 'bios_secure_boot_intent', label: 'BIOS/Secure Boot intent', highRisk: true },
    { id: 'hardware_inventory_evidence', label: 'Hardware inventory evidence' },
  ],
}

function defaultOperations(workflowId: string): Operation[] {
  return (WORKFLOW_OPERATIONS[workflowId] || []).map(item => ({
    id: item.id,
    enabled: false,
    reviewed: !item.highRisk,
  }))
}

function storageContainersFromLines(value: string) {
  return value
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [name, replicationFactor, advertisedCapacityGb, reservedGb] = line.split(',').map(item => item.trim())
      return {
        name,
        ...(replicationFactor ? { replication_factor: Number(replicationFactor) || 1 } : {}),
        ...(advertisedCapacityGb ? { advertised_capacity_gb: Number(advertisedCapacityGb) || 1024 } : {}),
        ...(reservedGb ? { reserved_gb: Number(reservedGb) || 0 } : {}),
      }
    })
}

function vmNetworksFromLines(value: string) {
  return value
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [name, vlanId, networkIp, prefix, gateway, poolRange, dhcpDnsServers, dhcpDomain] = line.split(',').map(item => item.trim())
      return {
        name,
        vlan_id: Number(vlanId) || 0,
        ...(networkIp ? { network_ip: networkIp } : {}),
        ...(prefix ? { network_prefix: Number(prefix) || 24 } : {}),
        ...(gateway ? { default_gateway_ip: gateway } : {}),
        ...(poolRange ? { pool_range: poolRange } : {}),
        ...(dhcpDnsServers ? { dhcp_dns_servers: dhcpDnsServers.split(';').map(item => item.trim()).filter(Boolean) } : {}),
        ...(dhcpDomain ? { dhcp_domain: dhcpDomain } : {}),
      }
    })
}

function operationValues(id: string, values: OperationValues) {
  if (id === 'accept_eula') {
    return {
      username: values.eulaUsername,
      company_name: values.eulaCompanyName,
      job_title: values.eulaJobTitle,
      enable_pulse: values.pulseEnabled,
    }
  }
  if (id === 'update_pulse') return { enabled: values.pulseEnabled }
  if (id === 'ha_reservation') {
    return {
      enabled: values.haEnabled,
      host_failures: Number(values.haHostFailures) || 1,
    }
  }
  if (id === 'storage_containers') return { containers: storageContainersFromLines(values.storageContainers) }
  if (id === 'data_services_ip') return { dsip: values.dataServicesIp }
  if (id === 'vm_networks') return { networks: vmNetworksFromLines(values.vmNetworks) }
  return undefined
}

function enabledOperations(workflowId: string, operations: Operation[], values: OperationValues) {
  const metadata = new Map((WORKFLOW_OPERATIONS[workflowId] || []).map(item => [item.id, item]))
  return operations
    .filter(item => item.enabled)
    .map(item => {
      const opValues = operationValues(item.id, values)
      return {
        id: item.id,
        reviewed: item.reviewed,
        high_risk: Boolean(metadata.get(item.id)?.highRisk),
        ...(opValues ? { values: opValues } : {}),
      }
    })
}

function listFromLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map(item => item.trim())
    .filter(Boolean)
}

export default function PostFoundationWorkflowForm({ workflow, onYamlChange }: Props) {
  const [target, setTarget] = useState<TargetState>({
    prismElementIp: '',
    clusterName: '',
    peCredential: '',
    cvmCredential: '',
    pcIp: '',
    pcCredential: '',
  })
  const [operations, setOperations] = useState<Operation[]>(() => defaultOperations(workflow.id))
  const [operationInputs, setOperationInputs] = useState<OperationValues>({
    eulaUsername: '',
    eulaCompanyName: '',
    eulaJobTitle: '',
    pulseEnabled: true,
    haEnabled: true,
    haHostFailures: '1',
    dataServicesIp: '',
    storageContainers: '',
    vmNetworks: '',
  })
  const [dnsServers, setDnsServers] = useState('')
  const [ntpServers, setNtpServers] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    setOperations(defaultOperations(workflow.id))
    setTarget({
      prismElementIp: '',
      clusterName: '',
      peCredential: '',
      cvmCredential: '',
      pcIp: '',
      pcCredential: '',
    })
    setOperationInputs({
      eulaUsername: '',
      eulaCompanyName: '',
      eulaJobTitle: '',
      pulseEnabled: true,
      haEnabled: true,
      haHostFailures: '1',
      dataServicesIp: '',
      storageContainers: '',
      vmNetworks: '',
    })
    setDnsServers('')
    setNtpServers('')
    setNotes('')
  }, [workflow.id])

  const yaml = useMemo(() => {
    const obj: Record<string, unknown> = {
      ztf_orchestrator: {
        workflow_family: 'post_foundation',
        execution_mode: 'orchestrator_managed_plan',
      },
      target: {
        prism_element_ip: target.prismElementIp,
        cluster_name: target.clusterName,
        pe_credential: target.peCredential,
        cvm_credential: target.cvmCredential,
        prism_central_ip: target.pcIp,
        pc_credential: target.pcCredential,
      },
      plan: {
        workflow: workflow.id,
        operations: enabledOperations(workflow.id, operations, operationInputs),
      },
    }

    const dns = listFromLines(dnsServers)
    const ntp = listFromLines(ntpServers)
    if (dns.length || ntp.length) {
      obj.network_settings = {
        ...(dns.length ? { dns_servers: dns } : {}),
        ...(ntp.length ? { ntp_servers: ntp } : {}),
      }
    }
    if (notes.trim()) {
      obj.operator_notes = notes.trim()
    }
    return toYaml(obj)
  }, [dnsServers, ntpServers, notes, operationInputs, operations, target, workflow.id])

  useEffect(() => {
    onYamlChange(yaml)
  }, [onYamlChange, yaml])

  const updateOperation = (id: string, patch: Partial<Operation>) => {
    setOperations(prev => prev.map(item => item.id === id ? { ...item, ...patch } : item))
  }

  const updateOperationInput = <K extends keyof OperationValues>(key: K, value: OperationValues[K]) => {
    setOperationInputs(prev => ({ ...prev, [key]: value }))
  }

  const operationMetadata = WORKFLOW_OPERATIONS[workflow.id] || []

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <ClipboardCheck size={16} className="text-nutanix-cyan" />
          <h3 className="font-semibold text-gray-100">Post-Foundation Plan</h3>
        </div>
        <p className="text-sm text-gray-400 mb-4">
          Build a neutral plan for this workflow. Values are supplied at run time; no site names, IPs,
          serial numbers, passwords, or environment-specific settings are embedded in the template.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Prism Element IP" value={target.prismElementIp} onChange={value => setTarget(prev => ({ ...prev, prismElementIp: value }))} placeholder="required" />
          <Field label="PE Cluster Name" value={target.clusterName} onChange={value => setTarget(prev => ({ ...prev, clusterName: value }))} placeholder="required for apply" />
          <Field label="PE Credential Reference" value={target.peCredential} onChange={value => setTarget(prev => ({ ...prev, peCredential: value }))} placeholder="required" />
          <Field label="CVM Credential Reference" value={target.cvmCredential} onChange={value => setTarget(prev => ({ ...prev, cvmCredential: value }))} />
          <Field label="Prism Central IP" value={target.pcIp} onChange={value => setTarget(prev => ({ ...prev, pcIp: value }))} />
          <Field label="PC Credential Reference" value={target.pcCredential} onChange={value => setTarget(prev => ({ ...prev, pcCredential: value }))} />
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-100">Operations</h3>
          <span className="text-xs text-gray-500">{operations.filter(item => item.enabled).length} enabled</span>
        </div>
        <div className="space-y-2">
          {operationMetadata.map(item => {
            const state = operations.find(operation => operation.id === item.id)
            if (!state) return null
            return (
              <div key={item.id} className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 rounded-lg border border-border bg-surface/60 px-3 py-2">
                <label className="flex items-center gap-2 text-sm text-gray-200">
                  <input
                    type="checkbox"
                    checked={state.enabled}
                    onChange={event => updateOperation(item.id, { enabled: event.target.checked })}
                  />
                  <span>{item.label}</span>
                  {item.highRisk && <span className="badge badge-red text-[10px]">high risk</span>}
                </label>
                <label className="flex items-center gap-2 text-xs text-gray-400">
                  <input
                    type="checkbox"
                    checked={state.reviewed}
                    onChange={event => updateOperation(item.id, { reviewed: event.target.checked })}
                  />
                  Reviewed
                </label>
              </div>
            )
          })}
        </div>
      </div>

      <div className="card">
        <h3 className="font-semibold text-gray-100 mb-3">Optional Inputs</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <TextArea label="DNS Servers" value={dnsServers} onChange={setDnsServers} />
          <TextArea label="NTP Servers" value={ntpServers} onChange={setNtpServers} />
          <Field label="Data Services IP" value={operationInputs.dataServicesIp} onChange={value => updateOperationInput('dataServicesIp', value)} />
          <Field label="EULA Username" value={operationInputs.eulaUsername} onChange={value => updateOperationInput('eulaUsername', value)} />
          <Field label="EULA Company Name" value={operationInputs.eulaCompanyName} onChange={value => updateOperationInput('eulaCompanyName', value)} />
          <Field label="EULA Job Title" value={operationInputs.eulaJobTitle} onChange={value => updateOperationInput('eulaJobTitle', value)} />
          <Field label="HA Host Failures To Tolerate" value={operationInputs.haHostFailures} onChange={value => updateOperationInput('haHostFailures', value)} />
        </div>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={operationInputs.pulseEnabled} onChange={event => updateOperationInput('pulseEnabled', event.target.checked)} />
            Pulse enabled
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={operationInputs.haEnabled} onChange={event => updateOperationInput('haEnabled', event.target.checked)} />
            HA reservation enabled
          </label>
        </div>
        <div className="mt-3">
          <TextArea label="Storage Containers" value={operationInputs.storageContainers} onChange={value => updateOperationInput('storageContainers', value)} rows={3} placeholder="name,replication_factor,capacity_gb,reserved_gb" />
        </div>
        <div className="mt-3">
          <TextArea label="VM Networks" value={operationInputs.vmNetworks} onChange={value => updateOperationInput('vmNetworks', value)} rows={3} placeholder="name,vlan_id,network_ip,prefix,gateway,pool_range,dhcp_dns_1;dhcp_dns_2,dhcp_domain" />
        </div>
        <div className="mt-3">
          <TextArea label="Operator Notes" value={notes} onChange={setNotes} rows={4} />
        </div>
      </div>

      <div className="p-3 rounded-lg bg-blue-900/10 border border-blue-700/20">
        <p className="text-xs text-blue-300">
          This workflow is saved as <code className="font-mono bg-blue-900/30 px-1 rounded">{workflow.configFile}</code>.
          Dry Run validates the plan. Run Workflow executes mapped ZTF script steps sequentially and stops on the first failed operation.
        </p>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder = '' }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="label text-xs">{label}</label>
      <input className="input text-xs py-1.5" value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} />
    </div>
  )
}

function TextArea({ label, value, onChange, rows = 3, placeholder = '' }: { label: string; value: string; onChange: (value: string) => void; rows?: number; placeholder?: string }) {
  return (
    <div>
      <label className="label text-xs">{label}</label>
      <textarea className="input text-xs font-mono resize-none" rows={rows} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} />
    </div>
  )
}
