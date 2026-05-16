import { useState } from 'react'
import { Copy, Check, Download } from 'lucide-react'

interface YamlPreviewProps {
  content: string
  filename?: string
}

export default function YamlPreview({ content, filename }: YamlPreviewProps) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const download = () => {
    const blob = new Blob([content], { type: 'text/yaml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename || 'config.yml'
    a.click()
    URL.revokeObjectURL(url)
  }

  const highlighted = highlightYaml(content)

  return (
    <div className="bg-gray-950 rounded-xl border border-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-900 border-b border-border">
        <span className="text-xs font-mono text-gray-400">{filename || 'config.yml'}</span>
        <div className="flex gap-1">
          <button onClick={copy} className="btn-ghost p-1.5 text-xs gap-1.5">
            {copied ? <Check size={12} className="text-nutanix-teal" /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button onClick={download} className="btn-ghost p-1.5 text-xs gap-1.5">
            <Download size={12} />
            Download
          </button>
        </div>
      </div>
      <div
        className="p-4 font-mono text-xs leading-relaxed overflow-auto max-h-96"
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
    </div>
  )
}

function highlightYaml(yaml: string): string {
  return yaml
    .split('\n')
    .map(line => {
      // Comment
      if (line.trim().startsWith('#')) {
        return `<span class="yaml-comment">${escapeHtml(line)}</span>`
      }
      // Key: value
      const keyValMatch = line.match(/^(\s*)([\w_-]+)(\s*:\s*)(.*)$/)
      if (keyValMatch) {
        const [, indent, key, colon, value] = keyValMatch
        const coloredValue = colorValue(value)
        return `${escapeHtml(indent)}<span class="yaml-key">${escapeHtml(key)}</span><span class="text-gray-500">${escapeHtml(colon)}</span>${coloredValue}`
      }
      // List item
      const listMatch = line.match(/^(\s*-\s*)(.*)$/)
      if (listMatch) {
        const [, bullet, value] = listMatch
        return `<span class="text-gray-500">${escapeHtml(bullet)}</span>${colorValue(value)}`
      }
      return `<span class="text-gray-400">${escapeHtml(line)}</span>`
    })
    .join('\n')
}

function colorValue(val: string): string {
  if (!val || val === '') return ''
  const v = val.trim()
  if (v === 'true' || v === 'false') return `<span class="yaml-bool">${escapeHtml(val)}</span>`
  if (v === 'null' || v === '~') return `<span class="yaml-null">${escapeHtml(val)}</span>`
  if (/^-?\d+(\.\d+)?$/.test(v)) return `<span class="yaml-number">${escapeHtml(val)}</span>`
  if (v.startsWith('"') || v.startsWith("'")) return `<span class="yaml-string">${escapeHtml(val)}</span>`
  if (v.startsWith('&') || v.startsWith('*') || v.startsWith('<<')) return `<span class="text-purple-400">${escapeHtml(val)}</span>`
  return `<span class="yaml-string">${escapeHtml(val)}</span>`
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
