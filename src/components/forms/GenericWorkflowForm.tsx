import { useState, useEffect } from 'react'
import { FileCode } from 'lucide-react'
import type { ConnectionProfile, WorkflowDef } from '../../types'
import { toYaml } from '../../utils/yaml'

interface Props {
  workflow: WorkflowDef
  onYamlChange: (yaml: string) => void
  profile?: ConnectionProfile
}

const PLACEHOLDERS: Record<string, string> = {
  'config-pc': `# Prism Central Configuration
pc_ip: 10.0.0.51
pc_credential: pc_user

name_servers_list:
  - 8.8.8.8
ntp_servers_list:
  - 0.us.pool.ntp.org

# Active Directory
active_directory:
  ad_server_ip: 10.0.0.200
  ad_name: CORP-AD
  ad_domain: corp.domain.com

# Optional features
enable_nke: true
enable_flow: true
`,
  'pod-config': `# Pod Configuration
pc_ip: 10.0.0.51
pc_credential: pc_user
pe_credential: pe_user

pod:
  name: pod-01
  blocks:
    - name: block-01
      edge_sites:
        - name: site-01
          clusters:
            - cluster_ip: 10.0.0.100
`,
  'deploy-management-pc': `# Management PC Deployment
pe_credential: pe_user
cvm_credential: cvm_credential

management_pc:
  cluster_ip: 10.0.0.100
  pc_ip: 10.0.0.51
  network: vlan0-managed
  gateway: 10.0.0.1
  subnetmask: 255.255.255.0
`,
  'config-management-pc': `# Management PC Configuration
pc_ip: 10.0.0.51
pc_credential: pc_user

name_servers_list:
  - 8.8.8.8
ntp_servers_list:
  - 0.us.pool.ntp.org
`,
  'imaging': `# Pod Imaging Configuration
pc_credential: pc_user
cvm_credential: cvm_credential
pc_ip: 10.0.0.100

aos_url: "http://server/nutanix-aos.tar.gz"
hypervisor_type: kvm
hypervisor_url: "http://server/AHV.iso"
`,
  'native-foundation-deploy': `# Native Foundation Deployment Intent
ztf_orchestrator:
  workflow_family: native_foundation
  execution_state: planning_only

foundation_engine:
  mode: planning_only
  artifact_policy: operator_supplied
  foundation_version: "5.11"
  orchestration:
    site_strategy: sequential
  policy:
    max_parallel_sites: 1
    max_parallel_clusters_per_site: 1
    require_approval_binding: true
    require_validation_evidence: true
    failure_policy: stop_site
  checkpoint:
    completed_step_ids: []
    failed_step_ids: []
  uat_evidence:
    hardware_provider_discovery:
      accepted: false
      evidence_id: ""
    image_source_verified:
      accepted: false
      evidence_id: ""
    network_path_verified:
      accepted: false
      evidence_id: ""
    recovery_runbook_reviewed:
      accepted: false
      evidence_id: ""

sites:
  - site_name: site-a
    hardware_provider: manual_static
    provider_credential_ref: nf-provider-site-a
    bmc_credential_ref: nf-bmc-site-a
    concurrency_limit: 1
    deployment_window:
      timezone: UTC
      days:
        - Sat
        - Sun
      start: "00:00"
      end: "06:00"
    network_profile:
      management_subnet: 192.0.2.0/24
      management_gateway: 192.0.2.1
      management_vlan_id: 120
      dns_servers:
        - 192.0.2.53
      ntp_servers:
        - 192.0.2.123
    clusters:
      - cluster_name: hci-cluster-a
        deployment_type: hci
        cluster_vip: 192.0.2.10
        aos_image:
          source: aos-image-ref
          version: "7.x"
          sha256: "0000000000000000000000000000000000000000000000000000000000000000"
        hypervisor_image:
          source: ahv-image-ref
          version: "10.x"
          sha256: "1111111111111111111111111111111111111111111111111111111111111111"
        nodes:
          - node_serial: NODE-A
            role: hci
            bmc_address: 192.0.2.20
            host_ip: 192.0.2.30
            cvm_ip: 192.0.2.40
          - node_serial: NODE-B
            role: hci
            bmc_address: 192.0.2.21
            host_ip: 192.0.2.31
            cvm_ip: 192.0.2.41
          - node_serial: NODE-C
            role: hci
            bmc_address: 192.0.2.22
            host_ip: 192.0.2.32
            cvm_ip: 192.0.2.42
`,
  'calm-edgeai-vm-workload': `# Edge AI Workload Configuration
ncm_vm_ip: 10.0.0.60
ncm_credential: ncm_user

bp_list:
  - dsl_file: calm-dsl-bps/blueprints/EdgeAI/EdgeAI.py
    name: EdgeAI-dsl
    app_name: EdgeAI-app

projects:
  - PROJECT_NAME: edge-ai-project
    CLUSTER_NAME: edge-cluster-01
    SUBNET_NAME: vlan0-managed
`,
}

function replaceToken(content: string, from: string, to: string): string {
  return content.split(from).join(to)
}

function withProfileDefaults(content: string, profile?: ConnectionProfile): string {
  if (!profile) return content
  let next = content
  next = replaceToken(next, 'pc_ip: 10.0.0.51', `pc_ip: ${profile.prismCentral.endpoint || '10.0.0.51'}`)
  next = replaceToken(next, 'pc_ip: 10.0.0.100', `pc_ip: ${profile.foundationCentral.endpoint || profile.prismCentral.endpoint || '10.0.0.100'}`)
  next = replaceToken(next, 'pc_credential: pc_user', `pc_credential: ${profile.prismCentral.credentialRef || 'pc_user'}`)
  next = replaceToken(next, 'pe_credential: pe_user', `pe_credential: ${profile.prismElement.peCredentialRef || 'pe_user'}`)
  next = replaceToken(next, 'cvm_credential: cvm_credential', `cvm_credential: ${profile.prismElement.cvmCredentialRef || 'cvm_credential'}`)
  next = replaceToken(next, 'ncm_vm_ip: 10.0.0.60', `ncm_vm_ip: ${profile.ncm.endpoint || profile.prismCentral.endpoint || '10.0.0.60'}`)
  next = replaceToken(next, 'ncm_credential: ncm_user', `ncm_credential: ${profile.ncm.credentialRef || 'ncm_user'}`)
  next = replaceToken(next, 'SUBNET_NAME: vlan0-managed', `SUBNET_NAME: ${profile.prismElement.networkName || 'vlan0-managed'}`)
  next = replaceToken(next, 'network: vlan0-managed', `network: ${profile.prismElement.networkName || 'vlan0-managed'}`)
  next = replaceToken(next, 'hypervisor_type: kvm', `hypervisor_type: ${profile.foundationCentral.hypervisorType || 'kvm'}`)
  next = replaceToken(next, '"http://server/nutanix-aos.tar.gz"', `"${profile.foundationCentral.aosUrl || 'http://server/nutanix-aos.tar.gz'}"`)
  next = replaceToken(next, '"http://server/AHV.iso"', `"${profile.foundationCentral.hypervisorUrl || 'http://server/AHV.iso'}"`)
  next = replaceToken(next, 'ad_domain: corp.domain.com', `ad_domain: ${profile.directory.domain || 'corp.domain.com'}`)
  return next
}

export default function GenericWorkflowForm({ workflow, onYamlChange, profile }: Props) {
  const placeholder = PLACEHOLDERS[workflow.id] || `# ${workflow.name} Configuration\n# Edit this YAML configuration for ${workflow.id}\n`
  const isNativeFoundation = workflow.id === 'native-foundation-deploy'
  const [content, setContent] = useState(withProfileDefaults(placeholder, profile))

  useEffect(() => {
    onYamlChange(content)
  }, [content, onYamlChange])

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <FileCode size={16} className="text-nutanix-cyan" />
          <h3 className="font-semibold text-gray-100">Configuration Editor</h3>
        </div>
        {isNativeFoundation ? (
          <p className="text-sm text-gray-400 mb-4">
            Edit the native Foundation deployment intent directly. This planning-only workflow validates multi-site,
            hardware provider, cluster type, and node role shape before any execution adapters are enabled.
          </p>
        ) : (
          <p className="text-sm text-gray-400 mb-4">
            Edit the YAML configuration for this workflow directly. Refer to the{' '}
            <a
              href={`https://github.com/nutanixdev/zerotouch-framework/blob/main/config/example-configs/workflow-configs/${workflow.configFile}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-nutanix-cyan hover:underline"
            >
              example configuration
            </a>{' '}
            for reference.
          </p>
        )}
        <textarea
          className="input font-mono text-xs resize-none w-full"
          rows={24}
          value={content}
          onChange={e => setContent(e.target.value)}
          spellCheck={false}
        />
      </div>

      <div className="p-3 rounded-lg bg-blue-900/10 border border-blue-700/20">
        <p className="text-xs text-blue-300">
          This configuration will be saved to <code className="font-mono bg-blue-900/30 px-1 rounded">{workflow.configFile}</code> and passed to:
          <br />
          <code className="font-mono text-xs">
            {isNativeFoundation
              ? `native-foundation plan --intent config/${workflow.configFile}`
              : `python main.py --workflow ${workflow.id} -f config/${workflow.configFile}`}
          </code>
        </p>
      </div>
    </div>
  )
}
