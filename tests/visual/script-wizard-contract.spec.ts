import { expect, test } from '@playwright/test'
import yaml from 'js-yaml'
import { SCRIPTS } from '../../src/data'
import { SCRIPT_CONFIG_SCHEMAS } from '../../src/scriptConfigSchemas'

test('all script wizard examples generate parseable YAML with required guidance', () => {
  expect(Object.keys(SCRIPT_CONFIG_SCHEMAS)).toHaveLength(SCRIPTS.length)

  for (const script of SCRIPTS) {
    const schema = SCRIPT_CONFIG_SCHEMAS[script.id]
    expect(schema, script.id).toBeTruthy()

    const requiredFields = schema.fields.filter(field => field.required)
    for (const field of requiredFields) {
      expect(schema.requiredNotes, `${script.id} missing required guidance for ${field.key}`)
        .toContain(`${field.label} is required.`)
      expect(schema.exampleValues?.[field.key], `${script.id} missing example value for ${field.key}`)
        .not.toBe('')
    }

    const generated = schema.build(schema.exampleValues ?? {})
    expect(generated, `${script.id} generated empty YAML`).not.toEqual('')
    expect(generated, `${script.id} generated undefined YAML`).not.toContain('undefined')
    expect(() => yaml.load(generated), `${script.id} generated invalid YAML`).not.toThrow()
  }
})

test('PE script wizard examples emit ZTF runtime cluster keys', () => {
  const peScripts = SCRIPTS.filter(script => script.name.includes('(PE)'))
  expect(peScripts.length).toBeGreaterThan(0)

  for (const script of peScripts) {
    const schema = SCRIPT_CONFIG_SCHEMAS[script.id]
    const generated = schema.build(schema.exampleValues ?? {})
    const parsed = yaml.load(generated) as { clusters?: Record<string, Record<string, unknown>> } | undefined
    const clusters = parsed?.clusters

    expect(clusters, `${script.id} must emit top-level clusters`).toBeTruthy()
    expect(Array.isArray(clusters), `${script.id} clusters must be a map keyed by PE IP`).toBe(false)

    const entries = Object.entries(clusters ?? {})
    expect(entries.length, `${script.id} must emit at least one cluster`).toBeGreaterThan(0)
    for (const [clusterIp, clusterDetails] of entries) {
      expect(clusterIp, `${script.id} must key clusters by PE IP`).toMatch(/^\d+\.\d+\.\d+\.\d+$/)
      expect(clusterDetails.name, `${script.id} must emit clusters.${clusterIp}.name`).toBeTruthy()
      expect(clusterDetails, `${script.id} must not emit stale cluster_name`).not.toHaveProperty('cluster_name')
    }
  }
})

test('PE delete wizard examples include ZTF schema-required companion fields', () => {
  const deleteContainerYaml = SCRIPT_CONFIG_SCHEMAS.DeleteContainerPe.build(
    SCRIPT_CONFIG_SCHEMAS.DeleteContainerPe.exampleValues ?? {},
  )
  const deleteSubnetYaml = SCRIPT_CONFIG_SCHEMAS.DeleteSubnetsPe.build(
    SCRIPT_CONFIG_SCHEMAS.DeleteSubnetsPe.exampleValues ?? {},
  )

  expect(deleteContainerYaml).toContain('containers:')
  expect(deleteContainerYaml).toContain('name:')
  expect(deleteContainerYaml).toContain('replication_factor:')
  expect(deleteSubnetYaml).toContain('networks:')
  expect(deleteSubnetYaml).toContain('name:')
  expect(deleteSubnetYaml).toContain('vlan_id:')
})

test('DeleteContainerPe wizard metadata marks the lifecycle cleanup as destructive', () => {
  const schema = SCRIPT_CONFIG_SCHEMAS.DeleteContainerPe

  expect(schema.riskLevel).toBe('destructive')
  expect(schema.confirmationPhrase).toBe('RUN DeleteContainerPe')
  expect(schema.requiredNotes).toContain('Container Name is required.')
  expect(schema.requiredNotes).toContain('Replication Factor is required.')
})
