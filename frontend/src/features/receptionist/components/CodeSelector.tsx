import type { AssignmentCode } from '../types/patient'

interface CodeSelectorProps {
  disabled?: boolean
  onChange: (value: AssignmentCode) => void
  value: AssignmentCode
}

export function CodeSelector({ disabled, onChange, value }: CodeSelectorProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {(['GREEN', 'YELLOW'] as const).map((code) => {
        const isActive = value === code
        const toneClass =
          code === 'GREEN'
            ? isActive
              ? 'border-[var(--green-border)] bg-[var(--green-soft)] text-[var(--green-text)]'
              : 'border-[var(--border-soft)] bg-white text-[var(--text-secondary)]'
            : isActive
              ? 'border-[var(--amber-border)] bg-[var(--amber-soft)] text-[var(--amber-text)]'
              : 'border-[var(--border-soft)] bg-white text-[var(--text-secondary)]'

        return (
          <button
            key={code}
            className={`min-h-12 rounded-full border px-4 py-2 text-sm font-semibold transition ${toneClass}`}
            disabled={disabled}
            onClick={() => onChange(code)}
            type="button"
          >
            {code === 'GREEN' ? 'Green' : 'Yellow'}
          </button>
        )
      })}
    </div>
  )
}
