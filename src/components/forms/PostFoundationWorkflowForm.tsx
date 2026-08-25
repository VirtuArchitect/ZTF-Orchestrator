import { useEffect, useMemo, useState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import type { ConnectionProfile, WorkflowDef } from '../../types'
import { toYaml } from '../../utils/yaml'
import { POST_CLUSTER_CONTROLS, POST_CLUSTER_SECTIONS } from '../../postClusterControls'
import type { PostClusterControl } from '../../postClusterControls'

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

function defaultOperations(workflowId: string): Operation[] {
  return (POST_CLUSTER_CONTROLS[workflowId] || []).map(item => ({
    id: item.id,
    enabled: false,
    reviewed: !item.requiresReview,
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
  const metadata = new Map((POST_CLUSTER_CONTROLS[workflowId] || []).map(item => [item.id, item]))
  return operations
    .filter(item => item.enabled)
    .map(item => {
      const control = metadata.get(item.id)
      const opValues = operationValues(item.id, values)
      return {
        id: item.id,
        mode: control?.mode || 'manual',
        section: control?.section,
        category: control?.category,
        entry_point: control?.entryPoint,
        reviewed: item.reviewed,
        high_risk: control?.risk === 'high',
        ...(control?.command ? { command: control.command } : {}),
        ...(control?.evidenceCommand ? { evidence_command: control.evidenceCommand } : {}),
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

  const operationMetadata = POST_CLUSTER_CONTROLS[workflow.id] || []
  const groupedControls = POST_CLUSTER_SECTIONS
    .map(section => ({
      section,
      controls: operationMetadata.filter(item => item.section === section),
    }))
    .filter(group => group.controls.length)

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <ClipboardCheck size={16} className="text-nutanix-cyan" />
          <h3 className="font-semibold text-gray-100">Post-Cluster Baseline</h3>
        </div>
        <p className="text-sm text-gray-400 mb-4">
          Build a neutral checklist-driven plan for this workflow. Values are supplied at run time;
          no site names, IPs, serial numbers, passwords, domains, or environment-specific settings
          are embedded in the template.
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
          <h3 className="font-semibold text-gray-100">Checklist Controls</h3>
          <span className="text-xs text-gray-500">{operations.filter(item => item.enabled).length} enabled</span>
        </div>
        <div className="space-y-4">
          {groupedControls.map(group => (
            <div key={group.section} className="space-y-2">
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">{group.section}</h4>
                <div className="h-px flex-1 bg-border" />
              </div>
              {group.controls.map(item => {
                const state = operations.find(operation => operation.id === item.id)
                if (!state) return null
                return (
                  <ChecklistControl
                    key={item.id}
                    control={item}
                    enabled={state.enabled}
                    reviewed={state.reviewed}
                    onEnabledChange={enabled => updateOperation(item.id, { enabled })}
                    onReviewedChange={reviewed => updateOperation(item.id, { reviewed })}
                  />
                )
              })}
            </div>
          ))}
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
          Dry Run validates the plan. Run Workflow applies only verified mappings; manual, blocked, and
          evidence-only controls are recorded without mutating infrastructure.
        </p>
      </div>
    </div>
  )
}

function ChecklistControl({
  control,
  enabled,
  reviewed,
  onEnabledChange,
  onReviewedChange,
}: {
  control: PostClusterControl
  enabled: boolean
  reviewed: boolean
  onEnabledChange: (value: boolean) => void
  onReviewedChange: (value: boolean) => void
}) {
  return (
    <div className="rounded-lg border border-border bg-surface/60 px-3 py-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <label className="flex items-start gap-2 text-sm text-gray-200">
          <input
            type="checkbox"
            className="mt-1"
            checked={enabled}
            onChange={event => onEnabledChange(event.target.checked)}
          />
          <span>
            <span className="font-medium text-gray-100">{control.label}</span>
            <span className="mt-1 block text-xs leading-relaxed text-gray-400">{control.description}</span>
            <span className="mt-2 flex flex-wrap gap-1.5">
              <span className="badge badge-gray text-[10px]">{control.category}</span>
              <span className="badge badge-gray text-[10px]">{control.entryPoint}</span>
              <ModeBadge mode={control.mode} />
              {control.risk && <span className={control.risk === 'high' ? 'badge badge-red text-[10px]' : 'badge badge-yellow text-[10px]'}>{control.risk} risk</span>}
            </span>
          </span>
        </label>
        <label className="flex items-center gap-2 text-xs text-gray-400 md:pt-1">
          <input
            type="checkbox"
            checked={reviewed}
            disabled={!control.requiresReview}
            onChange={event => onReviewedChange(event.target.checked)}
          />
          Reviewed
        </label>
      </div>
      {(control.command || control.evidenceCommand) && (
        <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
          {control.command && (
            <CodeHint label="Planned command" value={control.command} />
          )}
          {control.evidenceCommand && (
            <CodeHint label="Evidence check" value={control.evidenceCommand} />
          )}
        </div>
      )}
    </div>
  )
}

function ModeBadge({ mode }: { mode: PostClusterControl['mode'] }) {
  const label = {
    apply: 'apply',
    evidence: 'evidence',
    manual: 'manual',
    blocked: 'blocked',
  }[mode]
  const tone = {
    apply: 'badge-green',
    evidence: 'badge-blue',
    manual: 'badge-yellow',
    blocked: 'badge-red',
  }[mode]
  return <span className={`badge ${tone} text-[10px]`}>{label}</span>
}

function CodeHint({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-background/60 p-2">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}</div>
      <code className="block break-words text-xs text-gray-300">{value}</code>
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
