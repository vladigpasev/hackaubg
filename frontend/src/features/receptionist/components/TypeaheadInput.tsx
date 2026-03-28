import { useDeferredValue, useId, useState, type KeyboardEvent } from 'react'
import type { CatalogOption } from '../types/patient'
import { searchCatalogOptions } from '../utils/searchCatalogOptions'

interface TypeaheadInputProps {
  error?: string
  helpText?: string
  id?: string
  label: string
  onChange: (value: string) => void
  onSelect: (value: string) => void
  options: CatalogOption[]
  placeholder: string
  value: string
}

export function TypeaheadInput({
  error,
  helpText,
  id,
  label,
  onChange,
  onSelect,
  options,
  placeholder,
  value,
}: TypeaheadInputProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const deferredQuery = useDeferredValue(value)
  const suggestions = searchCatalogOptions(options, deferredQuery)
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)

  const describedBy = error
    ? `${inputId}-error`
    : helpText
      ? `${inputId}-help`
      : undefined

  function commitSelection(selection: string) {
    onChange(selection)
    onSelect(selection)
    setHighlightedIndex(0)
    setIsOpen(false)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!isOpen || suggestions.length === 0) {
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlightedIndex((current) => (current + 1) % suggestions.length)
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlightedIndex((current) => (current - 1 + suggestions.length) % suggestions.length)
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      commitSelection(suggestions[highlightedIndex]?.label ?? value)
    }

    if (event.key === 'Escape') {
      setIsOpen(false)
    }
  }

  return (
    <div className="relative">
      <label className="mb-2 block text-sm font-semibold text-[var(--text-primary)]" htmlFor={inputId}>
        {label}
      </label>
      <input
        aria-autocomplete="list"
        aria-describedby={describedBy}
        aria-expanded={isOpen && suggestions.length > 0 ? 'true' : 'false'}
        aria-invalid={error ? 'true' : 'false'}
        autoComplete="off"
        className="min-h-14 w-full rounded-[1.1rem] border border-[var(--border-soft)] bg-white px-4 py-3 text-base text-[var(--text-primary)] outline-none transition focus:border-[var(--teal-strong)] focus:ring-4 focus:ring-[rgba(15,143,138,0.14)]"
        id={inputId}
        onBlur={() => {
          window.setTimeout(() => setIsOpen(false), 100)
        }}
        onChange={(event) => {
          onChange(event.target.value)
          setIsOpen(event.target.value.trim().length > 0)
          setHighlightedIndex(0)
        }}
        onFocus={() => {
          if (value.trim().length > 0) {
            setIsOpen(true)
          }
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        type="text"
        value={value}
      />

      {helpText && !error ? (
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]" id={`${inputId}-help`}>
          {helpText}
        </p>
      ) : null}

      {error ? (
        <p className="mt-2 text-sm leading-6 text-[var(--red-text)]" id={`${inputId}-error`}>
          {error}
        </p>
      ) : null}

      {isOpen && suggestions.length > 0 ? (
        <div className="absolute z-20 mt-2 w-full rounded-[1.25rem] border border-[var(--border-soft)] bg-white p-2 shadow-[0_24px_60px_rgba(18,42,56,0.14)]">
          <ul className="space-y-1" role="listbox">
            {suggestions.map((option, index) => (
              <li key={option.id}>
                <button
                  className={`min-h-12 w-full rounded-[1rem] px-4 py-3 text-left text-sm font-semibold transition ${
                    index === highlightedIndex
                      ? 'bg-[var(--teal-soft)] text-[var(--teal-strong)]'
                      : 'bg-white text-[var(--text-primary)] hover:bg-[var(--surface-secondary)]'
                  }`}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    commitSelection(option.label)
                  }}
                  type="button"
                >
                  {option.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
