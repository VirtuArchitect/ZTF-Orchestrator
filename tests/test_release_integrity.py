import ast
import importlib.util
import json
import re
import types
import zipfile
from pathlib import Path
from xml.etree import ElementTree


ROOT = Path(__file__).resolve().parents[1]


def _load_offline_package_module():
    path = ROOT / 'scripts' / 'build_offline_update_package.py'
    spec = importlib.util.spec_from_file_location('build_offline_update_package', path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def _load_runtime_patch_module():
    path = ROOT / 'scripts' / 'patch_ztf_runtime.py'
    spec = importlib.util.spec_from_file_location('patch_ztf_runtime', path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def _frontend_script_ids() -> set[str]:
    text = (ROOT / 'src' / 'data.ts').read_text(encoding='utf-8')
    scripts_block = text.split('export const SCRIPTS', 1)[1].split('export const TIMEZONES', 1)[0]
    return set(re.findall(r"\{ id: '([^']+)'", scripts_block))


def _frontend_workflow_ids() -> set[str]:
    text = (ROOT / 'src' / 'data.ts').read_text(encoding='utf-8')
    workflows_block = text.split('export const WORKFLOWS', 1)[1].split('export const SCRIPTS', 1)[0]
    return set(re.findall(r"id: '([^']+)'", workflows_block))


def test_release_version_metadata_is_consistent():
    import server

    package = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))
    package_lock = json.loads((ROOT / 'package-lock.json').read_text(encoding='utf-8'))
    version_ts = (ROOT / 'src' / 'version.ts').read_text(encoding='utf-8')
    readme = (ROOT / 'README.md').read_text(encoding='utf-8')
    changelog = (ROOT / 'CHANGELOG.md').read_text(encoding='utf-8')

    expected = package['version']
    assert server.APP_VERSION == expected
    assert package_lock['version'] == expected
    assert package_lock['packages']['']['version'] == expected
    assert f"export const APP_VERSION = '{expected}'" in version_ts
    settings_tsx = (ROOT / 'src' / 'pages' / 'Settings.tsx').read_text(encoding='utf-8')
    assert 'Installed Build' in settings_tsx
    assert 'Copy Build Info' in settings_tsx
    assert 'installedIdentity' in settings_tsx
    assert readme.startswith(f'# ZTF-Orchestrator · v{expected}')
    assert 'https://virtuarchitect.github.io/ZTF-Orchestrator/' in readme
    assert f'## [{expected}]' in changelog


def _docx_text(path: Path) -> str:
    with zipfile.ZipFile(path) as archive:
        document_xml = archive.read('word/document.xml')
    root = ElementTree.fromstring(document_xml)
    namespace = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
    return '\n'.join(node.text or '' for node in root.findall('.//w:t', namespace))


def test_current_operator_docs_reference_release_version():
    package = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))
    expected_tag = f"v{package['version']}"

    markdown_docs = [
        ROOT / 'README.md',
        ROOT / 'appliance' / 'README.md',
        ROOT / 'docs' / 'installation-guide.md',
        ROOT / 'docs' / 'foundation-central-validation.md',
        ROOT / 'docs' / 'foundation-engine-roadmap.md',
        ROOT / 'docs' / 'postgresql-backup-restore-drill.md',
        ROOT / 'docs' / 'sanitized-uat-evidence-record.md',
        ROOT / 'docs' / 'script-wizard-validation-test-plan.md',
        ROOT / 'docs' / 'dev-lab-disposable-container-runbook.md',
        ROOT / 'docs' / 'ztf-2x-plan-apply-roadmap.md',
    ]

    for path in markdown_docs:
        text = path.read_text(encoding='utf-8')
        assert expected_tag in text, f'{path.relative_to(ROOT)} must reference {expected_tag}'

    ahv_build_guide = _docx_text(ROOT / 'docs' / 'AHV-Appliance-Build-Guide.docx')
    assert expected_tag in ahv_build_guide
    assert f'ZTF_ORCHESTRATOR_VERSION={expected_tag}' in ahv_build_guide


def test_operator_runbook_baseline_is_present_and_linked():
    package = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))
    expected_tag = f"v{package['version']}"
    readme = (ROOT / 'README.md').read_text(encoding='utf-8')
    runbook_index = ROOT / 'docs' / 'runbooks' / 'README.md'
    template = ROOT / 'docs' / 'runbooks' / 'RUNBOOK-TEMPLATE.md'
    governance_docs = [
        ROOT / 'docs' / 'operator-controlled-uat-readiness.md',
        ROOT / 'docs' / 'uat-evidence-checklist.md',
        ROOT / 'docs' / 'production-readiness-boundary.md',
    ]
    documentation_baseline = {
        'architecture': [
            ROOT / 'docs' / 'architecture' / 'README.md',
            ROOT / 'docs' / 'architecture' / 'SECURITY-BOUNDARY.md',
            ROOT / 'docs' / 'architecture' / 'DATA-FLOW.md',
            ROOT / 'docs' / 'architecture' / 'DEPLOYMENT-BOUNDARIES.md',
            ROOT / 'docs' / 'architecture' / 'native-foundation-engine.md',
        ],
        'foundation-engine': [
            ROOT / 'docs' / 'foundation-engine' / 'adapter-contracts.md',
            ROOT / 'docs' / 'foundation-engine' / 'adapter-command-invocation-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'adapter-credential-handoff-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'adapter-activation-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'adapter-allow-list-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'adapter-enablement-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'adapter-execution-preflight-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'adapter-load-plan-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'adapter-output-evidence-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'adapter-package-provenance-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'adapter-runtime-admission-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'adapter-runtime-isolation-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'adapter-sbom-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'adapter-target-connectivity-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'adapter-promotion-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'adapter-readiness.md',
            ROOT / 'docs' / 'foundation-engine' / 'adapter-uat-rehearsal.md',
            ROOT / 'docs' / 'foundation-engine' / 'approval-binding-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'backup-restore-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'cluster-formation-plan.md',
            ROOT / 'docs' / 'foundation-engine' / 'controlled-uat-entry-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'controlled-uat-entry-issuance-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'controlled-uat-completion-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'controlled-uat-execution-authorization-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'controlled-uat-hardware-reservation-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'controlled-uat-lane-selection-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'controlled-uat-operations-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'controlled-uat-runner-admission-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'controlled-uat-runner-persistence-admission-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'controlled-uat-runbook-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'controlled-uat-security-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'controlled-uat-signoff-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'controlled-uat-start-readiness-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'controlled-uat-scope-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'post-create-validation-plan.md',
            ROOT / 'docs' / 'foundation-engine' / 'deployment-policy.md',
            ROOT / 'docs' / 'foundation-engine' / 'deployment-scheduler-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'deployment-type-support-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'deployment-wave-authorization-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'deployment-window-reservation-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'deployment-wave-gates.md',
            ROOT / 'docs' / 'foundation-engine' / 'deployment-wave-rehearsal.md',
            ROOT / 'docs' / 'foundation-engine' / 'discovery-preview.md',
            ROOT / 'docs' / 'foundation-engine' / 'discovery-contract.md',
            ROOT / 'docs' / 'foundation-engine' / 'discovery-reconciliation.md',
            ROOT / 'docs' / 'foundation-engine' / 'dry-run-ledger.md',
            ROOT / 'docs' / 'foundation-engine' / 'evidence-pack-approval-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'evidence-packs.md',
            ROOT / 'docs' / 'foundation-engine' / 'execution-admission-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'execution-adapter-contract.md',
            ROOT / 'docs' / 'foundation-engine' / 'execution-audit-plan.md',
            ROOT / 'docs' / 'foundation-engine' / 'execution-graph.md',
            ROOT / 'docs' / 'foundation-engine' / 'execution-lock-plan.md',
            ROOT / 'docs' / 'foundation-engine' / 'execution-permit-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'execution-request-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'execution-readiness.md',
            ROOT / 'docs' / 'foundation-engine' / 'execution-retention-plan.md',
            ROOT / 'docs' / 'foundation-engine' / 'execution-runner-readiness.md',
            ROOT / 'docs' / 'foundation-engine' / 'execution-submission-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'image-sources.md',
            ROOT / 'docs' / 'foundation-engine' / 'job-state-plan.md',
            ROOT / 'docs' / 'foundation-engine' / 'intent-schema.md',
            ROOT / 'docs' / 'foundation-engine' / 'mutating-adapter-binding-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'mutating-enablement-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'network-manifest.md',
            ROOT / 'docs' / 'foundation-engine' / 'node-imaging-plan.md',
            ROOT / 'docs' / 'foundation-engine' / 'phase-advancement-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'phase-catalog.md',
            ROOT / 'docs' / 'foundation-engine' / 'plan-approval-binding.md',
            ROOT / 'docs' / 'foundation-engine' / 'provider-adapters.md',
            ROOT / 'docs' / 'foundation-engine' / 'provider-operation-admission-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'provider-operation-catalog.md',
            ROOT / 'docs' / 'foundation-engine' / 'provider-operation-queue-admission-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'provider-operation-queue-plan.md',
            ROOT / 'docs' / 'foundation-engine' / 'provider-preflight.md',
            ROOT / 'docs' / 'foundation-engine' / 'provider-topology-matrix.md',
            ROOT / 'docs' / 'foundation-engine' / 'queue-persistence-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'recovery-plan.md',
            ROOT / 'docs' / 'foundation-engine' / 'retained-evidence-export-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'resume-checkpoint.md',
            ROOT / 'docs' / 'foundation-engine' / 'review-packet.md',
            ROOT / 'docs' / 'foundation-engine' / 'review-job.md',
            ROOT / 'docs' / 'foundation-engine' / 'restart-resume-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'secret-audit-persistence-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'secret-lease-execution-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'secret-resolution-plan.md',
            ROOT / 'docs' / 'foundation-engine' / 'secret-references.md',
            ROOT / 'docs' / 'foundation-engine' / 'secret-store-binding-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'secret-store-provider-contract-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'support-matrix.md',
            ROOT / 'docs' / 'foundation-engine' / 'topology-rules.md',
            ROOT / 'docs' / 'foundation-engine' / 'uat-evidence-acceptance-review.md',
            ROOT / 'docs' / 'foundation-engine' / 'uat-checklist.md',
        ],
        'demo': [
            ROOT / 'docs' / 'demo' / 'README.md',
            ROOT / 'docs' / 'demo' / 'PRISM-CENTRAL-SIMULATOR.md',
        ],
        'governance': [
            ROOT / 'docs' / 'governance' / 'README.md',
            ROOT / 'docs' / 'governance' / 'PRODUCTION-READINESS-BOUNDARY.md',
            ROOT / 'docs' / 'governance' / 'DISASTER-RECOVERY.md',
            ROOT / 'docs' / 'governance' / 'SUPPORTABILITY.md',
            ROOT / 'docs' / 'governance' / 'LIMITATIONS.md',
            ROOT / 'docs' / 'governance' / 'EVIDENCE-MAPPING.md',
        ],
        'testing': [
            ROOT / 'docs' / 'testing' / 'README.md',
            ROOT / 'docs' / 'testing' / 'TESTING-MATRIX.md',
            ROOT / 'docs' / 'testing' / 'REGRESSION-GUARDS.md',
        ],
        'uat': [
            ROOT / 'docs' / 'uat' / 'README.md',
            ROOT / 'docs' / 'uat' / 'UAT-PLAN.md',
            ROOT / 'docs' / 'uat' / 'UAT-CASES.md',
            ROOT / 'docs' / 'uat' / 'UAT-EVIDENCE.md',
            ROOT / 'docs' / 'uat' / 'UAT-RESULTS.md',
        ],
    }
    required_runbooks = {
        'RB-001': ROOT / 'docs' / 'runbooks' / 'RB-001-start-stop-restart.md',
        'RB-002': ROOT / 'docs' / 'runbooks' / 'RB-002-backup-restore.md',
        'RB-003': ROOT / 'docs' / 'runbooks' / 'RB-003-upgrade-rollback.md',
        'RB-004': ROOT / 'docs' / 'runbooks' / 'RB-004-ztf-workflow-execution.md',
        'RB-005': ROOT / 'docs' / 'runbooks' / 'RB-005-failed-job-recovery.md',
        'RB-006': ROOT / 'docs' / 'runbooks' / 'RB-006-emergency-stop.md',
        'RB-007': ROOT / 'docs' / 'runbooks' / 'RB-007-airgapped-update.md',
        'RB-008': ROOT / 'docs' / 'runbooks' / 'RB-008-nkp-safe-phase-execution.md',
        'RB-009': ROOT / 'docs' / 'runbooks' / 'RB-009-user-rbac-management.md',
        'RB-010': ROOT / 'docs' / 'runbooks' / 'RB-010-database-recovery.md',
        'RB-011': ROOT / 'docs' / 'runbooks' / 'RB-011-security-incident.md',
        'RB-012': ROOT / 'docs' / 'runbooks' / 'RB-012-decommission.md',
    }
    required_headings = [
        '## Metadata',
        '## Purpose',
        '## Scope',
        '## Preconditions',
        '## Required Role/RBAC',
        '## Required Inputs',
        '## Dependencies',
        '## Risk/Impact',
        '## Procedure',
        '## Validation',
        '## Expected Result',
        '## Failure Conditions',
        '## Recovery/Rollback',
        '## Evidence To Capture',
        '## Audit Requirements',
        '## Escalation',
        '## References',
        '## Evidence Mapping',
    ]

    for fragment in [
        '[runbook index and control matrix](docs/runbooks/README.md)',
        '[architecture index](docs/architecture/README.md)',
        '[governance index](docs/governance/README.md)',
        '[UAT index](docs/uat/README.md)',
        '[testing index](docs/testing/README.md)',
        '[demo and simulator guide](docs/demo/README.md)',
    ]:
        assert fragment in readme

    index_text = runbook_index.read_text(encoding='utf-8')
    assert expected_tag in index_text
    assert 'Runbook Control Matrix' in index_text
    assert template.exists()
    assert expected_tag in template.read_text(encoding='utf-8')

    seen_ids = set()
    for runbook_id, path in required_runbooks.items():
        text = path.read_text(encoding='utf-8')
        assert expected_tag in text, f'{path.relative_to(ROOT)} must reference {expected_tag}'
        assert f'| Runbook ID | {runbook_id} |' in text
        assert runbook_id not in seen_ids
        seen_ids.add(runbook_id)
        assert f'[{runbook_id}](' in index_text
        for heading in required_headings:
            assert heading in text, f'{path.relative_to(ROOT)} missing {heading}'

    for path in governance_docs:
        text = path.read_text(encoding='utf-8')
        assert expected_tag in text, f'{path.relative_to(ROOT)} must reference {expected_tag}'

    for docs in documentation_baseline.values():
        for path in docs:
            text = path.read_text(encoding='utf-8')
            assert expected_tag in text, f'{path.relative_to(ROOT)} must reference {expected_tag}'


def test_native_foundation_phase_catalog_docs_match_server_contract():
    import server

    catalog = server._native_foundation_phase_catalog()
    phase_doc = (ROOT / 'docs' / 'foundation-engine' / 'phase-catalog.md').read_text(encoding='utf-8')
    advancement_doc = (ROOT / 'docs' / 'foundation-engine' / 'phase-advancement-review.md').read_text(encoding='utf-8')
    matrix_doc = (ROOT / 'docs' / 'foundation-engine' / 'provider-topology-matrix.md').read_text(encoding='utf-8')
    operation_catalog_doc = (ROOT / 'docs' / 'foundation-engine' / 'provider-operation-catalog.md').read_text(encoding='utf-8')
    operation_admission_doc = (ROOT / 'docs' / 'foundation-engine' / 'provider-operation-admission-review.md').read_text(encoding='utf-8')
    operation_queue_doc = (ROOT / 'docs' / 'foundation-engine' / 'provider-operation-queue-plan.md').read_text(encoding='utf-8')
    operation_queue_admission_doc = (ROOT / 'docs' / 'foundation-engine' / 'provider-operation-queue-admission-review.md').read_text(encoding='utf-8')
    mutating_adapter_binding_doc = (ROOT / 'docs' / 'foundation-engine' / 'mutating-adapter-binding-review.md').read_text(encoding='utf-8')
    lane_persistence_doc = (ROOT / 'docs' / 'foundation-engine' / 'controlled-uat-lane-persistence-admission-review.md').read_text(encoding='utf-8')
    reservation_persistence_doc = (ROOT / 'docs' / 'foundation-engine' / 'controlled-uat-reservation-persistence-admission-review.md').read_text(encoding='utf-8')
    entry_issuance_doc = (ROOT / 'docs' / 'foundation-engine' / 'controlled-uat-entry-issuance-review.md').read_text(encoding='utf-8')
    entry_persistence_doc = (ROOT / 'docs' / 'foundation-engine' / 'controlled-uat-entry-persistence-admission-review.md').read_text(encoding='utf-8')
    start_readiness_doc = (ROOT / 'docs' / 'foundation-engine' / 'controlled-uat-start-readiness-review.md').read_text(encoding='utf-8')
    start_persistence_doc = (ROOT / 'docs' / 'foundation-engine' / 'controlled-uat-start-persistence-admission-review.md').read_text(encoding='utf-8')
    runner_admission_doc = (ROOT / 'docs' / 'foundation-engine' / 'controlled-uat-runner-admission-review.md').read_text(encoding='utf-8')
    runner_persistence_doc = (ROOT / 'docs' / 'foundation-engine' / 'controlled-uat-runner-persistence-admission-review.md').read_text(encoding='utf-8')
    provider_adapters_doc = (ROOT / 'docs' / 'foundation-engine' / 'provider-adapters.md').read_text(encoding='utf-8')
    review_packet_doc = (ROOT / 'docs' / 'foundation-engine' / 'review-packet.md').read_text(encoding='utf-8')
    review_job_doc = (ROOT / 'docs' / 'foundation-engine' / 'review-job.md').read_text(encoding='utf-8')
    roadmap = (ROOT / 'docs' / 'foundation-engine-roadmap.md').read_text(encoding='utf-8')
    architecture = (ROOT / 'docs' / 'architecture' / 'native-foundation-engine.md').read_text(encoding='utf-8')
    support_matrix = (ROOT / 'docs' / 'foundation-engine' / 'support-matrix.md').read_text(encoding='utf-8')
    user_guide = (ROOT / 'docs' / 'user-guide.md').read_text(encoding='utf-8')

    assert 'GET /api/native-foundation/phases' in phase_doc
    assert 'GET /api/native-foundation/phases' in roadmap
    assert 'GET /api/native-foundation/phases' in architecture
    assert 'GET /api/native-foundation/phases' in support_matrix
    assert 'GET /api/native-foundation/phases' in user_guide
    assert 'POST /api/native-foundation/phases/advancement-review' in advancement_doc
    assert 'POST /api/native-foundation/phases/advancement-review' in architecture
    assert 'POST /api/native-foundation/phases/advancement-review' in support_matrix
    assert 'POST /api/native-foundation/provider-topology-matrix' in matrix_doc
    assert 'POST /api/native-foundation/provider-topology-matrix' in architecture
    assert 'POST /api/native-foundation/provider-topology-matrix' in support_matrix
    assert 'POST /api/native-foundation/provider-operation-catalog' in operation_catalog_doc
    assert 'POST /api/native-foundation/provider-operation-catalog' in architecture
    assert 'POST /api/native-foundation/provider-operation-catalog' in support_matrix
    assert 'POST /api/native-foundation/provider-operation-admission-review' in operation_admission_doc
    assert 'POST /api/native-foundation/provider-operation-admission-review' in architecture
    assert 'POST /api/native-foundation/provider-operation-admission-review' in support_matrix
    assert 'POST /api/native-foundation/provider-operation-queue-plan' in operation_queue_doc
    assert 'POST /api/native-foundation/provider-operation-queue-plan' in architecture
    assert 'POST /api/native-foundation/provider-operation-queue-plan' in support_matrix
    assert 'POST /api/native-foundation/provider-operation-queue-admission-review' in operation_queue_admission_doc
    assert 'POST /api/native-foundation/provider-operation-queue-admission-review' in architecture
    assert 'POST /api/native-foundation/provider-operation-queue-admission-review' in support_matrix
    assert 'provider-topology-matrix.json' in review_packet_doc
    assert 'provider-operation-catalog.json' in review_packet_doc
    assert 'provider-operation-admission-review.json' in review_packet_doc
    assert 'provider-operation-queue-plan.json' in review_packet_doc
    assert 'provider-operation-queue-admission-review.json' in review_packet_doc
    assert 'provider operation queue admission' in mutating_adapter_binding_doc
    assert 'POST /api/native-foundation/uat/lane-persistence-admission-review' in lane_persistence_doc
    assert 'provider operation queue admission provenance' in lane_persistence_doc
    assert 'POST /api/native-foundation/uat/reservation-persistence-admission-review' in reservation_persistence_doc
    assert 'provider operation queue admission provenance' in reservation_persistence_doc
    assert 'POST /api/native-foundation/uat/entry-issuance-review' in entry_issuance_doc
    assert 'provider operation queue admission provenance' in entry_issuance_doc.lower()
    assert 'POST /api/native-foundation/uat/entry-persistence-admission-review' in entry_persistence_doc
    assert 'provider operation queue admission provenance' in entry_persistence_doc
    assert 'POST /api/native-foundation/uat/start-readiness-review' in start_readiness_doc
    assert 'provider operation queue admission provenance' in start_readiness_doc.lower()
    assert 'POST /api/native-foundation/uat/start-persistence-admission-review' in start_persistence_doc
    assert 'provider operation queue admission provenance' in start_persistence_doc
    assert 'POST /api/native-foundation/uat/runner-admission-review' in runner_admission_doc
    assert 'provider operation queue admission provenance' in runner_admission_doc.lower()
    assert 'POST /api/native-foundation/uat/runner-persistence-admission-review' in runner_persistence_doc
    assert 'provider operation queue admission provenance' in runner_persistence_doc.lower()
    assert 'POST /api/native-foundation/providers/dell-idrac/redfish-probe' in provider_adapters_doc
    assert 'ZTF_NATIVE_FOUNDATION_ENABLE_DELL_IDRAC_DISCOVERY=true' in provider_adapters_doc
    assert 'ZTF_NATIVE_FOUNDATION_ENABLE_DELL_IDRAC_MUTATION=true' in provider_adapters_doc
    assert 'Controlled-UAT deploy gate' in support_matrix
    assert 'Provider/topology matrix row count' in review_job_doc
    assert 'runner persistence admission review ID' in review_job_doc
    assert 'provider operation queue admission count' in review_job_doc
    assert 'provider/topology matrix' in support_matrix
    assert catalog['currentExecutionMode'] == 'planning_only'
    assert catalog['mutatingActionsEnabled'] is False
    assert catalog['summary']['mutatingEnabledPhaseCount'] == 0
    assert 'zero mutating-enabled phases' in support_matrix

    for phase in catalog['phases']:
        display_status = str(phase['status']).replace('_', ' ').capitalize()
        status_pattern = re.escape(display_status).replace(r'read\ only', r'read[- ]only')
        row_pattern = (
            rf"\|\s*{phase['order']}\s*\|\s*{re.escape(phase['name'])}\s*\|"
            rf"\s*{status_pattern}\s*\|"
        )
        assert re.search(row_pattern, phase_doc), (
            f"docs/foundation-engine/phase-catalog.md missing phase row for {phase['name']}"
        )
        assert f"## Phase {phase['order']} - {phase['name']}" in roadmap
        assert phase['readOnly'] is True
        assert phase['mutatingActionsEnabled'] is False

    assert str(catalog['summary']['phaseCount']) in phase_doc
    assert all(phase in phase_doc for phase in catalog['supportedReadinessPhases'])


def test_static_demo_pages_configuration_is_present():
    index_html = (ROOT / 'index.html').read_text(encoding='utf-8')
    dist_index = (ROOT / 'dist' / 'index.html').read_text(encoding='utf-8')
    readme = (ROOT / 'README.md').read_text(encoding='utf-8')
    demo_env = (ROOT / '.env.demo').read_text(encoding='utf-8')
    workflow = (ROOT / '.github' / 'workflows' / 'pages-demo.yml').read_text(encoding='utf-8')
    vite_config = (ROOT / 'vite.config.ts').read_text(encoding='utf-8')

    assert 'https://virtuarchitect.github.io/ZTF-Orchestrator/' in readme
    assert 'VITE_ZTF_DEMO=true' in demo_env
    assert 'VITE_ZTF_BASE=/ZTF-Orchestrator/' in demo_env
    assert "const defaultTheme = '%VITE_ZTF_DEMO%' === 'true' ? 'light' : 'system'" in index_html
    assert "localStorage.getItem('ztf-theme-mode') || defaultTheme" in index_html
    assert 'npm run build:demo' in workflow
    assert 'actions/deploy-pages' in workflow
    assert 'enablement: true' in workflow
    assert "mode === 'demo' ? 'dist-demo' : 'dist'" in vite_config
    assert 'cp dist-demo/index.html dist-demo/404.html' in workflow
    assert 'path: dist-demo' in workflow
    assert '/ZTF-Orchestrator/assets/' not in dist_index
    assert 'src="/assets/' in dist_index

    governance_boundary = (ROOT / 'docs' / 'governance' / 'PRODUCTION-READINESS-BOUNDARY.md').read_text(encoding='utf-8')
    disaster_recovery = (ROOT / 'docs' / 'governance' / 'DISASTER-RECOVERY.md').read_text(encoding='utf-8')
    assert 'Claims Requiring More Evidence' in governance_boundary
    assert 'Recovery Point Objective' in disaster_recovery


def test_frontend_script_catalogue_is_backend_allowlisted():
    import server

    ids = _frontend_script_ids()
    assert ids
    assert not (ids - server.ALLOWED_SCRIPTS)
    assert not (ids & set(server.AMBIGUOUS_SCRIPT_ALIASES))


def test_post_foundation_workflows_are_guarded_and_environment_neutral():
    import server

    workflow_ids = {
        'post-foundation-baseline',
        'pe-monitoring-baseline',
        'pe-security-hardening',
        'pe-network-baseline',
        'pe-certificate-baseline',
        'hardware-out-of-band-baseline',
    }
    frontend_ids = _frontend_workflow_ids()
    workflow_detail = (ROOT / 'src' / 'pages' / 'WorkflowDetail.tsx').read_text(encoding='utf-8')
    form = (ROOT / 'src' / 'components' / 'forms' / 'PostFoundationWorkflowForm.tsx').read_text(encoding='utf-8')
    data = (ROOT / 'src' / 'data.ts').read_text(encoding='utf-8')
    registry = (ROOT / 'src' / 'postClusterControls.ts').read_text(encoding='utf-8')

    assert workflow_ids <= frontend_ids
    assert workflow_ids <= server.ALLOWED_WORKFLOWS
    assert workflow_ids <= server.DEFAULT_APPROVAL_REQUIRED_WORKFLOWS
    assert 'PostFoundationWorkflowForm' in workflow_detail
    assert 'orchestrator_managed_plan' in form
    assert 'POST_CLUSTER_CONTROLS' in registry
    assert 'AHV Security Hardening' in data
    assert 'mode: \'blocked\'' in registry
    assert 'mode: \'manual\'' in registry
    assert 'No infrastructure changes were' in (ROOT / 'server.py').read_text(encoding='utf-8')

    forbidden_environment_fragments = [
        '10.4.',
        '10.20.',
        'Starten',
        'DEUT',
        'SMPA',
        '6CV',
        '6FV',
        'CFV',
        'HCV',
        'infra.',
    ]
    implementation_text = '\n'.join([data, workflow_detail, form, registry])
    for fragment in forbidden_environment_fragments:
        assert fragment not in implementation_text


def test_offline_update_package_generator_writes_verified_manifest(tmp_path):
    module = _load_offline_package_module()
    image_tar = tmp_path / 'ztf-orchestrator-v1.5.4-image.tar'
    image_tar.write_bytes(b'test image tar content')
    output_zip = tmp_path / 'ztf-update-v1.5.4.zip'

    package, package_sha = module.create_package(
        image_tar=image_tar,
        version='v1.5.4',
        output_zip=output_zip,
    )

    assert package == output_zip
    assert package_sha == module.sha256_file(output_zip)

    import zipfile
    with zipfile.ZipFile(output_zip) as archive:
        names = set(archive.namelist())
        assert names == {
            'manifest.json',
            'SHA256SUMS',
            'images/ztf-orchestrator-v1.5.4-image.tar',
        }
        manifest = json.loads(archive.read('manifest.json'))
        sha_line = archive.read('SHA256SUMS').decode('utf-8')

    artifact = manifest['artifacts'][0]
    assert manifest['version'] == 'v1.5.4'
    assert manifest['containerImage'] == 'ghcr.io/virtuarchitect/ztf-orchestrator:v1.5.4'
    assert artifact['path'] == 'images/ztf-orchestrator-v1.5.4-image.tar'
    assert artifact['sha256'] == module.sha256_file(image_tar)
    assert sha_line == f"{artifact['sha256']}  {artifact['path']}\n"


def test_airgap_release_script_runs_required_release_steps():
    script = (ROOT / 'scripts' / 'build_airgap_release.ps1').read_text(encoding='utf-8')

    assert 'python -m pytest tests/test_release_integrity.py -q' in script
    assert 'npm run build' in script
    assert 'docker build' in script
    assert 'docker save' in script
    assert 'build_offline_update_package.py' in script
    assert 'Get-FileHash' in script


def test_create_vms_pc_wizard_matches_runtime_contract():
    schema = (ROOT / 'src' / 'scriptConfigSchemas.ts').read_text(encoding='utf-8')
    create_vms_pc = schema.split('CreateVmsPc:', 1)[1].split('DeployPC:', 1)[0]

    assert "network: text(values, 'network_name')" in create_vms_pc
    assert 'ip_endpoint_list' in create_vms_pc
    assert 'nic_list' not in create_vms_pc
    assert 'num_vcpus_per_socket' in create_vms_pc


def test_pe_cluster_settings_wizard_uses_runtime_cluster_name_key():
    schema = (ROOT / 'src' / 'scriptConfigSchemas.ts').read_text(encoding='utf-8')
    pe_cluster = schema.split('function peCluster', 1)[1].split('const EXACT_SCRIPT_CONFIG_SCHEMAS', 1)[0]
    ha_schema = schema.split('const haSchema', 1)[1].split('const updateDsipSchema', 1)[0]

    assert "{ name: text(values, 'cluster_name') }" in pe_cluster
    assert '...commonPeClusterFields' in ha_schema
    assert "{ cluster_name: text(values, 'cluster_name') }" not in ha_schema


def test_deploy_pc_workflow_generator_matches_runtime_contract():
    yaml_builder = (ROOT / 'src' / 'utils' / 'yaml.ts').read_text(encoding='utf-8')
    deploy_pc = yaml_builder.split('export function buildPCDeployYaml', 1)[1].split('export function buildClusterConfigYaml', 1)[0]

    assert 'pc_configs' in deploy_pc
    assert not re.search(r'^\s+pc_vms:', deploy_pc, flags=re.MULTILINE)
    assert 'pe_credential: cfg.peCredential' in deploy_pc
    assert 'cvm_credential: cfg.cvmCredential' in deploy_pc
    assert 'pc_vm_name_prefix' in deploy_pc
    assert 'num_pc_vms: 1' in deploy_pc
    assert 'pc_size: cfg.vmSize' in deploy_pc
    assert 'pc_vip: c.vip || c.pcIp' in deploy_pc
    assert 'ip_list: [c.pcIp]' in deploy_pc
    assert 'metadata_file_url' in deploy_pc
    assert 'network_name: c.networkName' in deploy_pc
    assert 'container_name: cfg.container' in deploy_pc
    assert 'subnet_mask: c.subnetMask' in deploy_pc


def test_script_config_wizard_covers_all_catalog_scripts():
    schema = (ROOT / 'src' / 'scriptConfigSchemas.ts').read_text(encoding='utf-8')

    assert 'SCRIPTS.reduce' in schema
    assert 'genericSchemaFor' not in schema
    assert 'ALL_SCRIPT_CONFIG_SCHEMAS[script.id]' in schema
    assert '...EXACT_SCRIPT_CONFIG_SCHEMAS' in schema
    assert '...FIELD_GUIDED_SCRIPT_CONFIG_SCHEMAS' in schema
    assert 'Missing script config schemas' in schema


def test_ztf2_converted_script_actions_are_separate_from_legacy_launcher():
    app = (ROOT / 'src' / 'App.tsx').read_text(encoding='utf-8')
    sidebar = (ROOT / 'src' / 'components' / 'Sidebar.tsx').read_text(encoding='utf-8')
    data = (ROOT / 'src' / 'data.ts').read_text(encoding='utf-8')
    scripts2x = (ROOT / 'src' / 'pages' / 'Scripts2x.tsx').read_text(encoding='utf-8')
    readme = (ROOT / 'README.md').read_text(encoding='utf-8')
    user_guide = (ROOT / 'docs' / 'user-guide.md').read_text(encoding='utf-8')
    demo_guide = (ROOT / 'docs' / 'demo' / 'README.md').read_text(encoding='utf-8')

    assert 'Scripts2x' in app
    assert 'path="/scripts-2x"' in app
    assert "label: 'Scripts 1.x'" in sidebar
    assert "label: 'Scripts 2.x'" in sidebar

    assert 'export const ZTF2_SCRIPTS' in data
    for action_id in [
        'ztf2-create-category-pc',
        'ztf2-create-project-pc',
        'ztf2-create-subnets-pc',
        'ztf2-upload-image-pc',
        'ztf2-create-vms-pc',
        'ztf2-create-security-groups-pc',
        'ztf2-create-protection-policy-pc',
        'ztf2-create-recovery-plan-pc',
    ]:
        assert action_id in data

    assert "ztf2Action: 'plan'" not in scripts2x
    assert '<Ztf2WorkflowPlanModal' in scripts2x
    assert 'workflowId={selected.id}' in scripts2x
    assert 'Ztf2WorkflowForm' in scripts2x
    assert '--script' not in scripts2x

    for text in [readme, user_guide, demo_guide]:
        assert 'Scripts 2.x' in text
        assert 'ztf2:plan' in text
        assert 'Create Security Groups' in text


def test_destructive_and_pe_preflight_script_guards_cover_high_risk_ids():
    frontend_schema = (ROOT / 'src' / 'scriptConfigSchemas.ts').read_text(encoding='utf-8')
    frontend_data = (ROOT / 'src' / 'data.ts').read_text(encoding='utf-8')
    backend = (ROOT / 'server.py').read_text(encoding='utf-8')
    required_destructive = {
        'ChangeDefaultAdminPasswordPe',
        'DeleteAdServerPe',
        'DeleteNameServersPe',
        'DeleteNtpServersPe',
        'DeleteRoleMappingPe',
        'DeleteVmPe',
        'PowerTransitionVmPe',
        'UpdateDsip',
    }
    required_pe_preflight = {
        'AddAdServerPe',
        'ChangeDefaultAdminPasswordPe',
        'CreateRoleMappingPe',
        'DeleteRoleMappingPe',
        'UpdatePulsePe',
    }

    frontend_destructive = frontend_schema.split('export const DESTRUCTIVE_SCRIPT_IDS', 1)[1].split('])', 1)[0]
    backend_destructive = backend.split('DESTRUCTIVE_SCRIPT_IDS = {', 1)[1].split('}', 1)[0]
    backend_pe_preflight = backend.split('PE_CLUSTER_SCRIPT_PREFLIGHT_IDS = {', 1)[1].split('}', 1)[0]

    frontend_pe_scripts = set(re.findall(r"\{ id: '([^']+)', name: '[^']+\(PE\)'", frontend_data))
    missing_pe_preflight = [script_id for script_id in sorted(frontend_pe_scripts) if script_id not in backend_pe_preflight]

    assert not missing_pe_preflight
    for script_id in required_destructive:
        assert script_id in frontend_destructive
        assert script_id in backend_destructive
    for script_id in required_pe_preflight:
        assert script_id in backend_pe_preflight


def test_pe_wizard_builders_use_shared_cluster_fields():
    schema = (ROOT / 'src' / 'scriptConfigSchemas.ts').read_text(encoding='utf-8')
    required_fragments = [
        "fields: [...commonPeClusterFields, ...directoryFields]",
        "fields: [...commonPeClusterFields, { key: 'dns_servers'",
        "fields: [...commonPeClusterFields, { key: 'ntp_servers'",
        '...commonPeClusterFields',
        "fields: [...commonPcFields, ...commonPeClusterFields]",
        "fields: [...commonPeClusterFields, resourceNameField(label)]",
        "scope === 'pe' ? commonPeClusterFields : commonPcFields",
        "scope === 'pc' ? commonPcFields : commonPeClusterFields",
    ]

    for fragment in required_fragments:
        assert fragment in schema


def test_docker_build_patches_ztf_pc_entity_filter_bug():
    dockerfile = (ROOT / 'Dockerfile').read_text(encoding='utf-8')
    patch_script = (ROOT / 'scripts' / 'patch_ztf_runtime.py').read_text(encoding='utf-8')
    install_ps1 = (ROOT / 'install.ps1').read_text(encoding='utf-8')
    install_sh = (ROOT / 'install.sh').read_text(encoding='utf-8')

    assert 'scripts/patch_ztf_runtime.py' in dockerfile
    assert 'RUN python /tmp/patch_ztf_runtime.py' in dockerfile
    assert 'ZTF_RUNTIME_ROOT = $ZtfDir' in install_ps1
    assert 'patch_ztf_runtime.py' in install_ps1
    assert 'ZTF_RUNTIME_ROOT="$ZTF_DIR" python "$ORCH_DIR/scripts/patch_ztf_runtime.py"' in install_sh
    assert 'filter_criteria = kwargs.pop("filter", None)' in patch_script
    assert 'payload["filter"] = filter_criteria' in patch_script
    assert 'payload["spec"]["name"] = kwargs["name"]' in patch_script


def test_docker_build_bakes_ztf2_runtime_by_default():
    dockerfile = (ROOT / 'Dockerfile').read_text(encoding='utf-8')
    compose = (ROOT / 'docker-compose.yml').read_text(encoding='utf-8')
    readme = (ROOT / 'README.md').read_text(encoding='utf-8')
    install_guide = (ROOT / 'docs' / 'installation-guide.md').read_text(encoding='utf-8')
    appliance_readme = (ROOT / 'appliance' / 'README.md').read_text(encoding='utf-8')

    assert 'ARG ZTF2_REF=v2.0.0' in dockerfile
    assert 'ARG ZTF2_BAKE=true' in dockerfile
    assert 'ENV ZTF2_PATH=/opt/zerotouch-framework-2x' in dockerfile
    assert 'ENV ZTF2_COMMAND=/opt/ztf2-python/bin/ztf' in dockerfile
    assert 'git clone --depth 1 --branch "${ZTF2_REF}"' in dockerfile
    assert '/opt/ztf2-python/bin/pip install --no-cache-dir /opt/zerotouch-framework-2x' in dockerfile

    assert 'ZTF2_BAKE:     ${ZTF2_BAKE:-true}' in compose
    assert 'ZTF2_REPO_URL: ${ZTF2_REPO_URL:-https://github.com/nutanixdev/zerotouch-framework.git}' in compose
    assert 'ZTF2_COMMAND:       ${ZTF2_COMMAND:-/opt/ztf2-python/bin/ztf}' in compose

    for text in [readme, install_guide, appliance_readme]:
        assert '/opt/zerotouch-framework-2x' in text
        assert '/opt/ztf2-python/bin/ztf' in text
        assert 'v2.0.0' in text


def test_docs_describe_current_ztf2_status_without_future_mode_drift():
    docs = {
        'README.md': (ROOT / 'README.md').read_text(encoding='utf-8'),
        'docs/installation-guide.md': (ROOT / 'docs' / 'installation-guide.md').read_text(encoding='utf-8'),
        'docs/operator-controlled-uat-readiness.md': (
            ROOT / 'docs' / 'operator-controlled-uat-readiness.md'
        ).read_text(encoding='utf-8'),
        'docs/governance/LIMITATIONS.md': (
            ROOT / 'docs' / 'governance' / 'LIMITATIONS.md'
        ).read_text(encoding='utf-8'),
        'docs/production-readiness-boundary.md': (
            ROOT / 'docs' / 'production-readiness-boundary.md'
        ).read_text(encoding='utf-8'),
        'docs/runbooks/RB-004-ztf-workflow-execution.md': (
            ROOT / 'docs' / 'runbooks' / 'RB-004-ztf-workflow-execution.md'
        ).read_text(encoding='utf-8'),
        'docs/security/SECURITY_ASSESSMENT.md': (
            ROOT / 'docs' / 'security' / 'SECURITY_ASSESSMENT.md'
        ).read_text(encoding='utf-8'),
        'docs/user-guide.md': (ROOT / 'docs' / 'user-guide.md').read_text(encoding='utf-8'),
        'docs/validation-status.md': (
            ROOT / 'docs' / 'validation-status.md'
        ).read_text(encoding='utf-8'),
        'appliance/README.md': (ROOT / 'appliance' / 'README.md').read_text(encoding='utf-8'),
    }
    forbidden_fragments = [
        'ZTF 2.x plan/apply support is a future separate mode',
        'Native ZTF 2.x plan/apply is a future separate mode',
        'plan/apply mode is added',
        'Docker, and container publishing paths pin ZTF to `v1.5.2`',
        '61 ZTF atomic scripts',
    ]

    for path, text in docs.items():
        for fragment in forbidden_fragments:
            assert fragment not in text, f'{path} contains stale ZTF status: {fragment}'

    current_status_docs = '\n'.join(docs.values())
    for fragment in [
        'Workflows 1.x',
        'Workflows 2.x',
        'Scripts 1.x',
        'Scripts 2.x',
        'ZTF 2.x IaC',
        '/opt/zerotouch-framework-2x',
        '/opt/ztf2-python/bin/ztf',
    ]:
        assert fragment in current_status_docs


def test_runtime_patch_covers_dev_lab_findings():
    patch_script = (ROOT / 'scripts' / 'patch_ztf_runtime.py').read_text(encoding='utf-8')

    assert 'patch_windows_log_cleanup()' in patch_script
    assert 'except PermissionError:' in patch_script
    assert 'Skipping deletion of active or locked file' in patch_script

    assert 'patch_pc_config_preserves_sessions()' in patch_script
    assert 'self.data = data' in patch_script
    assert 'self.global_data = global_data or {}' in patch_script

    assert 'patch_pc_v4_batch_retry()' in patch_script
    assert 'def _submit_batch_with_retry' in patch_script
    assert 'SERVICE UNAVAILABLE' in patch_script
    assert 'upstream connect error' in patch_script
    assert '_submit_batch_with_retry(self.batch_api, batch_spec)' in patch_script


def test_runtime_patch_log_cleanup_skips_locked_active_log(tmp_path, monkeypatch):
    module = _load_runtime_patch_module()
    module.RUNTIME_ROOT = tmp_path
    target = tmp_path / 'framework' / 'helpers' / 'general_utils.py'
    target.parent.mkdir(parents=True)
    target.write_text(
        """import os

class Logger:
    def __init__(self):
        self.messages = []

    def warning(self, message):
        self.messages.append(message)

logger = Logger()

def delete_file_util(file_path: str) -> None:
    \"\"\"
    Function to delete a file if it exists.

    Args:
        file_path (str): Path to the file to delete.
    \"\"\"
    if os.path.exists(file_path):
        os.remove(file_path)
""",
        encoding='utf-8',
    )

    module.patch_windows_log_cleanup()
    namespace: dict[str, object] = {}
    exec(target.read_text(encoding='utf-8'), namespace)
    patched_os = types.SimpleNamespace(
        path=__import__('os').path,
        remove=lambda _path: (_ for _ in ()).throw(PermissionError('locked')),
    )
    monkeypatch.setitem(namespace, 'os', patched_os)
    locked_log = tmp_path / 'active-zero_touch.log'
    locked_log.write_text('active log', encoding='utf-8')

    with locked_log.open('r', encoding='utf-8'):
        namespace['delete_file_util'](str(locked_log))

    logger = namespace['logger']
    assert locked_log.exists()
    assert logger.messages == [f"Skipping deletion of active or locked file {str(locked_log)!r}"]
