"""Tests for the Nutanix Upgrade Risk Advisor."""

from upgrade_advisor import (
    assess_upgrade_risk,
    load_upgrade_rules,
    merge_upgrade_rule_packs,
    render_upgrade_assessment_markdown,
)


def test_upgrade_advisor_flags_missing_preflight_evidence():
    result = assess_upgrade_risk({
        'inventory': {
            'clusterName': 'test-cluster',
            'components': {'aos': '6.8.1', 'ahv': '20230302.101026'},
        },
        'targets': {'aos': '7.3.1'},
        'evidence': {},
        'context': {'edition': 'enterprise'},
    })

    finding_ids = {finding['id'] for finding in result['findings']}
    assert result['readOnly'] is True
    assert result['status'] == 'warning'
    assert 'ztf-lcm-precheck-required' in finding_ids
    assert 'ztf-release-notes-known-issues-review-required' in finding_ids
    assert 'ztf-compatibility-matrix-review-required' in finding_ids
    assert 'ztf-major-aOS-upgrade-path-review' in finding_ids


def test_upgrade_advisor_clears_when_bundled_guardrails_are_satisfied():
    result = assess_upgrade_risk({
        'inventory': {
            'clusterName': 'test-cluster',
            'components': {
                'aos': '7.3.0',
                'ahv': '10.3.0',
                'prismCentral': '2026.1',
            },
        },
        'targets': {'aos': '7.3.1'},
        'evidence': {
            'lcmPrecheck': 'passed',
            'releaseNotesReviewed': True,
            'compatibilityReviewed': True,
            'prismCentralVersionCaptured': True,
        },
        'context': {'edition': 'enterprise'},
    })

    assert result['status'] == 'clear'
    assert result['summary']['clear'] == 1
    assert result['findings'][0]['id'] == 'ztf-upgrade-advisor-clear-with-evidence'


def test_upgrade_advisor_rules_pack_includes_phased_contract():
    rules = load_upgrade_rules()

    phase_ids = {phase['id'] for phase in rules['phases']}
    assert 'phase-1-manual-mvp' in phase_ids
    assert 'phase-2-curated-rules' in phase_ids
    assert 'phase-3-live-inventory' in phase_ids
    assert len(rules['rules']) >= 5


def test_source_pack_rules_merge_into_assessment():
    rules = merge_upgrade_rule_packs(load_upgrade_rules(), [{
        'id': 'pack-1',
        'name': 'Customer KB Pack',
        'version': '2026.08',
        'enabled': True,
        'rules': [{
            'id': 'customer-block-target',
            'title': 'Customer block for target train',
            'status': 'blocked',
            'severity': 'critical',
            'match': {'targetComponents': ['aos'], 'component': 'aos', 'targetVersion': '>=7.5.0,<7.6.0'},
            'message': 'Customer advisory blocks this train until reviewed.',
            'guidance': 'Choose a fixed train or get support approval.',
            'source': {'label': 'Customer KB summary', 'url': ''},
        }],
    }])

    result = assess_upgrade_risk({
        'inventory': {'clusterName': 'test-cluster', 'components': {'aos': '7.3.1'}},
        'targets': {'aos': '7.5.1'},
        'evidence': {
            'lcmPrecheck': 'passed',
            'releaseNotesReviewed': True,
            'compatibilityReviewed': True,
            'prismCentralVersionCaptured': True,
        },
        'context': {'edition': 'enterprise'},
    }, rules)

    assert result['status'] == 'blocked'
    assert result['sourcePacks'][0]['name'] == 'Customer KB Pack'
    assert any(finding['id'] == 'customer-block-target' for finding in result['findings'])


def test_upgrade_assessment_markdown_contains_findings_and_boundary():
    assessment = assess_upgrade_risk({
        'inventory': {'clusterName': 'test-cluster', 'components': {'aos': '6.8.1'}},
        'targets': {'aos': '7.3.1'},
        'evidence': {},
        'context': {'edition': 'enterprise'},
    })

    markdown = render_upgrade_assessment_markdown(assessment)

    assert '# Nutanix Upgrade Advisor Evidence Report' in markdown
    assert 'Overall status: **warning**' in markdown
    assert 'LCM precheck evidence is required' in markdown
    assert 'not a Nutanix support certification' in markdown
