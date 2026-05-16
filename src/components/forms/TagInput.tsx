import { useState, KeyboardEvent } from 'react'
import { X, Plus } from 'lucide-react'

interface TagInputProps {
  values: string[]
  onChange: (values: string[]) => void
  placeholder?: string
}

export default function TagInput({ values, onChange, placeholder }: TagInputProps) {
  const [input, setInput] = useState('')

  const add = () => {
    const v = input.trim()
    if (v && !values.includes(v)) {
      onChange([...values, v])
      setInput('')
    }
  }

  const remove = (i: number) => onChange(values.filter((_, idx) => idx !== i))

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 min-h-8">
        {values.map((v, i) => (
          <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-nutanix-blue/20 border border-nutanix-blue/30 text-xs text-blue-300 font-mono">
            {v}
            <button onClick={() => remove(i)} className="hover:text-red-400 transition-colors">
              <X size={10} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          className="input flex-1 text-xs py-1.5"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder={placeholder || 'Add value...'}
        />
        <button onClick={add} className="btn-secondary px-2 py-1.5">
          <Plus size={12} />
        </button>
      </div>
    </div>
  )
}
