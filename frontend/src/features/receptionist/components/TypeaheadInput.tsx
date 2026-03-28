import { useDeferredValue, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
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
  const listboxId = `${inputId}-listbox`
  const deferredQuery = useDeferredValue(value)
  const suggestions = searchCatalogOptions(options, deferredQuery)
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const blurTimeoutRef = useRef<number | null>(null)

  const describedBy = error
    ? `${inputId}-error`
    : helpText
      ? `${inputId}-help`
      : undefined
  const activeIndex = suggestions.length === 0 ? 0 : Math.min(highlightedIndex, suggestions.length - 1)
  const activeOptionId =
    isOpen && suggestions.length > 0 ? `${inputId}-option-${activeIndex}` : undefined

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current !== null) {
        window.clearTimeout(blurTimeoutRef.current)
      }
    }
  }, [])

  function commitSelection(selection: string) {
    if (blurTimeoutRef.current !== null) {
      window.clearTimeout(blurTimeoutRef.current)
      blurTimeoutRef.current = null
    }

    onChange(selection)
    onSelect(selection)
    setHighlightedIndex(0)
    setIsOpen(false)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!isOpen && event.key === 'ArrowDown' && suggestions.length > 0) {
      event.preventDefault()
      setIsOpen(true)
      setHighlightedIndex(0)
      return
    }

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
      commitSelection(suggestions[activeIndex]?.label ?? value)
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
        aria-activedescendant={activeOptionId}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-describedby={describedBy}
        aria-expanded={isOpen && suggestions.length > 0 ? 'true' : 'false'}
        aria-haspopup="listbox"
        aria-invalid={error ? 'true' : 'false'}
        autoComplete="off"
        className="min-h-14 w-full rounded-[1.1rem] border border-[var(--border-soft)] bg-white px-4 py-3 text-base text-[var(--text-primary)] outline-none transition focus:border-[var(--teal-strong)] focus:ring-4 focus:ring-[rgba(15,143,138,0.14)]"
        id={inputId}
        onBlur={() => {
          blurTimeoutRef.current = window.setTimeout(() => {
            setIsOpen(false)
            blurTimeoutRef.current = null
          }, 100)
        }}
        onChange={(event) => {
          onChange(event.target.value)
          setIsOpen(event.target.value.trim().length > 0)
          setHighlightedIndex(0)
        }}
        onFocus={() => {
          if (blurTimeoutRef.current !== null) {
            window.clearTimeout(blurTimeoutRef.current)
            blurTimeoutRef.current = null
          }

          if (value.trim().length > 0) {
            setIsOpen(true)
          }
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        role="combobox"
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
          <ul className="space-y-1" id={listboxId} role="listbox">
            {suggestions.map((option, index) => (
              <li
                aria-selected={index === activeIndex}
                className={`min-h-12 rounded-[1rem] px-4 py-3 text-left text-sm font-semibold transition ${
                  index === activeIndex
                    ? 'bg-[var(--teal-soft)] text-[var(--teal-strong)]'
                    : 'bg-white text-[var(--text-primary)] hover:bg-[var(--surface-secondary)]'
                }`}
                id={`${inputId}-option-${index}`}
                key={option.id}
                onMouseDown={(event) => {
                  event.preventDefault()
                  commitSelection(option.label)
                }}
                onMouseEnter={() => setHighlightedIndex(index)}
                role="option"
              >
                {option.label}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
