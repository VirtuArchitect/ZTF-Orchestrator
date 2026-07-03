import { useEffect, useMemo, useState } from 'react'
import { FileCode, Wand2 } from 'lucide-react'
import clsx from 'clsx'
import { SCRIPTS } from '../data'
import { SCRIPT_CONFIG_SCHEMAS } from '../scriptConfigSchemas'
import type { ScriptConfigField, ScriptConfigSchema } from '../types'

interface Props {
  scriptIds: string[]
  onGenerate: (yaml: string) => void
}

type WizardValues = Record<string, string | number | boolean>

function defaultsFor(schema: ScriptConfigSchema): WizardValues {
  return Object.fromEntries(schema.fields.map(field => [field.key, field.defaultValue ?? (field.type === 'boolean' ? false : '')]))
}

function fieldComplete(field: ScriptConfigField, values: WizardValues): boolean {
  if (!field.required) return true
  const value = values[field.key]
  if (field.type === 'boolean') return true
  return String(value ?? '').trim().length > 0
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: ScriptConfigField
  value: string | number | boolean
  onChange: (value: string | number | boolean) => void
}) {
  if (field.type === 'boolean') {
    return (
      <label className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-gray-400">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={event => onChange(event.target.checked)}
          className="h-4 w-4 rounded border-border bg-surface"
        />
        {field.label}
      </label>
    )
  }

  if (field.type === 'select') {
    return (
      <select className="input text-xs" value={String(value ?? '')} onChange={event => onChange(event.target.value)}>
        {(field.options ?? []).map(option => <option key={option} value={option}>{option}</option>)}
      </select>
    )
  }

  if (field.type === 'list') {
    return (
      <textarea
        className="input text-xs resize-none h-20"
        value={String(value ?? '')}
        onChange={event => onChange(event.target.value)}
        placeholder={field.placeholder}
        spellCheck={false}
      />
    )
  }

  return (
    <input
      className="input text-xs"
      type={field.type === 'number' ? 'number' : 'text'}
      value={String(value ?? '')}
      onChange={event => onChange(field.type === 'number' ? Number(event.target.value) : event.target.value)}
      placeholder={field.placeholder}
    />
  )
}

export default function ScriptConfigWizard({ scriptIds, onGenerate }: Props) {
  const supportedScripts = useMemo(
    () => scriptIds.filter(id => SCRIPT_CONFIG_SCHEMAS[id]),
    [scriptIds],
  )
  const [selectedScriptId, setSelectedScriptId] = useState(supportedScripts[0] ?? '')
  const schema = selectedScriptId ? SCRIPT_CONFIG_SCHEMAS[selectedScriptId] : undefined
  const [values, setValues] = useState<WizardValues>(() => schema ? defaultsFor(schema) : {})

  useEffect(() => {
    if (!supportedScripts.length) {
      setSelectedScriptId('')
      return
    }
    if (!supportedScripts.includes(selectedScriptId)) {
      setSelectedScriptId(supportedScripts[0])
    }
  }, [selectedScriptId, supportedScripts])

  useEffect(() => {
    if (schema) setValues(defaultsFor(schema))
  }, [schema])

  if (!schema) {
    return (
      <div className="rounded-lg border border-border bg-surface-elevated/40 px-3 py-2">
        <p className="text-xs text-gray-500">No wizard is available yet for the selected script queue.</p>
      </div>
    )
  }

  const missingRequired = schema.fields.filter(field => !fieldComplete(field, values))
  const scriptName = SCRIPTS.find(script => script.id === selectedScriptId)?.name ?? selectedScriptId

  return (
    <div className="rounded-lg border border-border bg-surface-elevated/40 p-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Wand2 size={15} className="text-nutanix-cyan" />
            <h4 className="text-sm font-semibold text-gray-200">Config Wizard</h4>
            <span className="badge badge-blue text-xs">{scriptName}</span>
          </div>
          <p className="mt-1 text-xs text-gray-500">{schema.description}</p>
        </div>
        {supportedScripts.length > 1 && (
          <select
            className="input w-60 text-xs"
            value={selectedScriptId}
            onChange={event => setSelectedScriptId(event.target.value)}
          >
            {supportedScripts.map(id => (
              <option key={id} value={id}>{SCRIPTS.find(script => script.id === id)?.name ?? id}</option>
            ))}
          </select>
        )}
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {schema.fields.map(field => (
          <div key={field.key} className={clsx(field.type === 'list' && 'md:col-span-2 xl:col-span-1')}>
            {field.type !== 'boolean' && (
              <label className="label mb-1">
                {field.label}
                {field.required && <span className="ml-1 text-red-400">*</span>}
              </label>
            )}
            <FieldInput
              field={field}
              value={values[field.key]}
              onChange={value => setValues(prev => ({ ...prev, [field.key]: value }))}
            />
            {field.help && <p className="mt-1 text-[11px] text-gray-600">{field.help}</p>}
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className={clsx('text-xs', missingRequired.length ? 'text-yellow-300' : 'text-gray-500')}>
          {missingRequired.length ? `${missingRequired.length} required field${missingRequired.length === 1 ? '' : 's'} missing` : 'Review generated YAML before running.'}
        </p>
        <button
          onClick={() => onGenerate(schema.build(values))}
          disabled={missingRequired.length > 0}
          className="btn-primary gap-1.5 text-xs"
        >
          <FileCode size={13} />
          Generate YAML
        </button>
      </div>
    </div>
  )
}
