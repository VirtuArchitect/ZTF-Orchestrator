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
          <code className="font-mono text-xs">{`python main.py --workflow ${workflow.id} -f config/${workflow.configFile}`}</code>
        </p>
      </div>
    </div>
  )
}
