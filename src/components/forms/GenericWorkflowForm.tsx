import { useState, useEffect } from 'react'
import { FileCode } from 'lucide-react'
import type { WorkflowDef } from '../../types'
import { toYaml } from '../../utils/yaml'

interface Props {
  workflow: WorkflowDef
  onYamlChange: (yaml: string) => void
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

export default function GenericWorkflowForm({ workflow, onYamlChange }: Props) {
  const [content, setContent] = useState(PLACEHOLDERS[workflow.id] || `# ${workflow.name} Configuration\n# Edit this YAML configuration for ${workflow.id}\n`)

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
