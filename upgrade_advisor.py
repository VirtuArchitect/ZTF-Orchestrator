"""Read-only Nutanix upgrade risk assessment helpers."""

from __future__ import annotations

import datetime
import json
import re
from pathlib import Path
from typing import Any

import yaml


RULES_PATH = Path(__file__).resolve().parent / 'data' / 'nutanix-upgrade-rules.yaml'
STATUS_RANK = {'clear': 0, 'unknown': 1, 'review': 2, 'warning': 3, 'blocked': 4}
SEVERITY_RANK = {'info': 0, 'low': 1, 'medium': 2, 'high': 3, 'critical': 4}


def load_upgrade_rules(path: Path = RULES_PATH) -> dict[str, Any]:
    """Load the bundled upgrade advisor rules pack."""
    with path.open('r', encoding='utf-8') as fh:
        data = yaml.safe_load(fh) or {}
    data.setdefault('rules', [])
    data.setdefault('phases', [])
    return data


def merge_upgrade_rule_packs(base_pack: dict[str, Any], source_packs: list[dict[str, Any]]) -> dict[str, Any]:
    """Merge enabled curated source packs into the bundled rules pack."""
    merged = dict(base_pack)
    rules = list(base_pack.get('rules', []))
    active_packs = []
    for pack in source_packs:
        if not isinstance(pack, dict) or pack.get('enabled') is False:
            continue
        pack_rules = pack.get('rules', [])
        if not isinstance(pack_rules, list):
            continue
        rules.extend(dict(rule, sourcePackId=pack.get('id'), sourcePackName=pack.get('name'))
                     for rule in pack_rules if isinstance(rule, dict))
        active_packs.append({
            'id': pack.get('id'),
            'name': pack.get('name'),
            'version': pack.get('version', ''),
            'ruleCount': len([rule for rule in pack_rules if isinstance(rule, dict)]),
        })
    merged['rules'] = rules
    merged['sourcePacks'] = active_packs
    if active_packs:
        merged['version'] = f"{base_pack.get('version', 'bundled')}+{len(active_packs)}-source-packs"
    return merged


def assess_upgrade_risk(payload: dict[str, Any], rules_pack: dict[str, Any] | None = None) -> dict[str, Any]:
    """Assess target Nutanix versions against read-only inventory and curated rules."""
    rules_pack = rules_pack or load_upgrade_rules()
    inventory = _dict(payload.get('inventory'))
    targets = _normalize_components(_dict(payload.get('targets')))
    current = _normalize_components(_dict(inventory.get('components')))
    evidence = _dict(payload.get('evidence'))
    context = _normalize_context(payload.get('context'))

    findings = []
    for rule in rules_pack.get('rules', []):
        finding = _evaluate_rule(rule, current, targets, evidence, context)
        if finding:
            findings.append(finding)

    if targets and not any(f['status'] in {'blocked', 'warning', 'review'} for f in findings):
        findings.append({
            'id': 'ztf-upgrade-advisor-clear-with-evidence',
            'title': 'No bundled rule matched the requested target',
            'status': 'clear',
            'severity': 'info',
            'component': 'upgrade-plan',
            'message': 'The bundled rules did not find a blocking or warning condition for the supplied target versions.',
            'guidance': 'Proceed only after standard Nutanix LCM inventory, prechecks, compatibility, release-note, and change-control reviews are complete.',
            'evidence': [],
            'source': {'label': 'ZTF bundled rules', 'url': ''},
        })

    status = _overall_status(findings, bool(targets))
    summary = {key: 0 for key in ('blocked', 'warning', 'review', 'unknown', 'clear')}
    for finding in findings:
        summary[finding['status']] = summary.get(finding['status'], 0) + 1
    summary['total'] = len(findings)

    return {
        'id': _assessment_id(inventory, targets),
        'status': status,
        'summary': summary,
        'inventory': {'components': current, 'clusterName': str(inventory.get('clusterName') or '').strip()},
        'targets': targets,
        'context': context,
        'findings': findings,
        'rulesVersion': str(rules_pack.get('version', 'unknown')),
        'sourcePacks': rules_pack.get('sourcePacks', []),
        'generatedAt': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f') + 'Z',
        'phases': rules_pack.get('phases', []),
        'readOnly': True,
    }


def render_upgrade_assessment_markdown(assessment: dict[str, Any]) -> str:
    """Render an assessment as a concise Markdown evidence report."""
    lines = [
        '# Nutanix Upgrade Advisor Evidence Report',
        '',
        f"Assessment ID: `{assessment.get('id', 'unknown')}`",
        f"Generated: `{assessment.get('generatedAt', '')}`",
        f"Overall status: **{assessment.get('status', 'unknown')}**",
        f"Rules version: `{assessment.get('rulesVersion', 'unknown')}`",
        f"Read-only: `{bool(assessment.get('readOnly'))}`",
        '',
        '## Inventory',
        '',
    ]
    inventory = _dict(assessment.get('inventory'))
    cluster_name = inventory.get('clusterName') or 'unknown'
    lines.append(f"- Cluster: `{cluster_name}`")
    for component, version in sorted(_dict(inventory.get('components')).items()):
        lines.append(f"- Current {component}: `{version}`")
    for component, version in sorted(_dict(assessment.get('targets')).items()):
        lines.append(f"- Target {component}: `{version}`")

    lines.extend(['', '## Source Packs', ''])
    source_packs = assessment.get('sourcePacks') if isinstance(assessment.get('sourcePacks'), list) else []
    if source_packs:
        for pack in source_packs:
            lines.append(f"- {pack.get('name', 'unnamed')} `{pack.get('version', '')}` ({pack.get('ruleCount', 0)} rules)")
    else:
        lines.append('- Bundled ZTF rules only')

    lines.extend(['', '## Findings', ''])
    findings = assessment.get('findings') if isinstance(assessment.get('findings'), list) else []
    if not findings:
        lines.append('No findings were returned.')
    for finding in findings:
        lines.extend([
            f"### {finding.get('title', 'Finding')}",
            '',
            f"- Status: `{finding.get('status', 'unknown')}`",
            f"- Severity: `{finding.get('severity', 'medium')}`",
            f"- Component: `{finding.get('component', 'upgrade-plan')}`",
            f"- Source version: `{finding.get('sourceVersion', '')}`",
            f"- Target version: `{finding.get('targetVersion', '')}`",
            f"- Message: {finding.get('message', '')}",
            f"- Guidance: {finding.get('guidance', '')}",
        ])
        source = _dict(finding.get('source'))
        if source.get('label') or source.get('url'):
            lines.append(f"- Source: {source.get('label', '')} {source.get('url', '')}".rstrip())
        evidence_items = finding.get('evidence') if isinstance(finding.get('evidence'), list) else []
        if evidence_items:
            lines.append('- Missing evidence:')
            for item in evidence_items:
                lines.append(
                    f"  - `{item.get('key')}` expected `{_format_markdown_value(item.get('expected'))}`, "
                    f"observed `{_format_markdown_value(item.get('observed'))}`"
                )
        lines.append('')

    lines.extend([
        '## Boundary',
        '',
        'This report is advisory evidence for change control. It is not a Nutanix support certification and does not execute or approve an upgrade.',
        '',
    ])
    return '\n'.join(lines)


def _format_markdown_value(value: Any) -> str:
    if value is None:
        return 'not captured'
    if isinstance(value, (dict, list)):
        return json.dumps(value, sort_keys=True)
    return str(value)


def _evaluate_rule(
    rule: dict[str, Any],
    current: dict[str, str],
    targets: dict[str, str],
    evidence: dict[str, Any],
    context: dict[str, Any],
) -> dict[str, Any] | None:
    match = _dict(rule.get('match'))
    target_components = [str(item).strip() for item in match.get('targetComponents', []) if str(item).strip()]
    if target_components and not any(targets.get(component) for component in target_components):
        return None

    component = str(match.get('component') or (target_components[0] if target_components else 'upgrade-plan'))
    source_version = current.get(component, '')
    target_version = targets.get(component, '')

    if match.get('sourceVersion') and not _version_in_range(source_version, str(match['sourceVersion'])):
        return None
    if match.get('targetVersion') and not _version_in_range(target_version, str(match['targetVersion'])):
        return None
    if match.get('majorVersionChange') and not _major_version_change(source_version, target_version):
        return None

    required_context = _dict(match.get('context'))
    for key, expected in required_context.items():
        value = context.get(key)
        if isinstance(expected, list):
            if value not in expected and not (isinstance(value, list) and any(item in expected for item in value)):
                return None
        elif value != expected:
            return None

    required_evidence = _dict(rule.get('requiresEvidence'))
    missing_evidence = []
    for key, expected in required_evidence.items():
        observed = evidence.get(key)
        if expected == 'present':
            ok = observed not in (None, '', False, [], {})
        elif isinstance(expected, list):
            ok = observed in expected
        else:
            ok = observed == expected
        if not ok:
            missing_evidence.append({'key': key, 'expected': expected, 'observed': observed})
    if required_evidence and not missing_evidence:
        return None

    return {
        'id': str(rule.get('id', 'unnamed-rule')),
        'title': str(rule.get('title', 'Upgrade advisor finding')),
        'status': str(rule.get('status', 'review')),
        'severity': str(rule.get('severity', 'medium')),
        'component': component,
        'sourceVersion': source_version,
        'targetVersion': target_version,
        'message': str(rule.get('message', 'Review this upgrade condition before proceeding.')),
        'guidance': str(rule.get('guidance', 'Capture evidence and review with the upgrade owner before proceeding.')),
        'evidence': missing_evidence,
        'source': _dict(rule.get('source')),
        'sourcePackId': rule.get('sourcePackId'),
        'sourcePackName': rule.get('sourcePackName'),
    }


def _overall_status(findings: list[dict[str, Any]], has_targets: bool) -> str:
    if not has_targets:
        return 'unknown'
    if not findings:
        return 'unknown'
    return max((f.get('status', 'unknown') for f in findings), key=lambda status: STATUS_RANK.get(status, 1))


def _normalize_components(value: dict[str, Any]) -> dict[str, str]:
    normalized = {}
    for key, version in value.items():
        clean_key = str(key).strip()
        clean_version = str(version).strip()
        if clean_key and clean_version:
            normalized[clean_key] = clean_version
    return normalized


def _normalize_context(value: Any) -> dict[str, Any]:
    context = _dict(value)
    features = context.get('features')
    if isinstance(features, str):
        context['features'] = [item.strip() for item in features.split(',') if item.strip()]
    elif not isinstance(features, list):
        context['features'] = []
    context['darkSite'] = bool(context.get('darkSite'))
    return context


def _dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _assessment_id(inventory: dict[str, Any], targets: dict[str, str]) -> str:
    cluster = str(inventory.get('clusterName') or 'cluster').strip() or 'cluster'
    target = '-'.join(f'{key}-{value}' for key, value in sorted(targets.items())) or 'no-target'
    safe = re.sub(r'[^A-Za-z0-9_.-]+', '-', f'{cluster}-{target}').strip('-').lower()
    return safe[:96] or 'upgrade-assessment'


def _major_version_change(source: str, target: str) -> bool:
    source_major = _version_tuple(source)[0] if _version_tuple(source) else None
    target_major = _version_tuple(target)[0] if _version_tuple(target) else None
    return source_major is not None and target_major is not None and source_major != target_major


def _version_in_range(version: str, expression: str) -> bool:
    if not expression:
        return True
    version_tuple = _version_tuple(version)
    if not version_tuple:
        return False
    for raw_part in expression.split(','):
        part = raw_part.strip()
        if not part:
            continue
        op = '=='
        for candidate in ('>=', '<=', '>', '<', '=='):
            if part.startswith(candidate):
                op = candidate
                part = part[len(candidate):].strip()
                break
        other = _version_tuple(part)
        if not other:
            return False
        if op == '>=' and version_tuple < other:
            return False
        if op == '<=' and version_tuple > other:
            return False
        if op == '>' and version_tuple <= other:
            return False
        if op == '<' and version_tuple >= other:
            return False
        if op == '==' and version_tuple != other:
            return False
    return True


def _version_tuple(value: str) -> tuple[int, ...]:
    parts = re.findall(r'\d+', str(value))
    if not parts:
        return ()
    return tuple(int(part) for part in parts[:4])
