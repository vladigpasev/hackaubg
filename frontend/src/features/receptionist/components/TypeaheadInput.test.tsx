import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CatalogOption } from '../types/patient'
import { TypeaheadInput } from './TypeaheadInput'

const options: CatalogOption[] = [
  {
    id: 'cardiology',
    kind: 'doctor',
    keywords: ['cardio'],
    label: 'Cardiology',
  },
  {
    id: 'icu',
    kind: 'doctor',
    keywords: ['critical'],
    label: 'ICU',
  },
]

function TypeaheadHarness({
  onChangeSpy,
  onSelectSpy,
}: {
  onChangeSpy: ReturnType<typeof vi.fn>
  onSelectSpy: ReturnType<typeof vi.fn>
}) {
  const [value, setValue] = useState('')

  return (
    <TypeaheadInput
      label="Doctor specialty"
      onChange={(nextValue) => {
        onChangeSpy(nextValue)
        setValue(nextValue)
      }}
      onSelect={onSelectSpy}
      options={options}
      placeholder="Search specialty"
      value={value}
    />
  )
}

describe('TypeaheadInput', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('wires the combobox semantics and commits the highlighted option from the keyboard', async () => {
    const user = userEvent.setup()
    const onChangeSpy = vi.fn()
    const onSelectSpy = vi.fn()

    render(<TypeaheadHarness onChangeSpy={onChangeSpy} onSelectSpy={onSelectSpy} />)

    const input = screen.getByRole('combobox', { name: 'Doctor specialty' })
    await user.type(input, 'card')

    const listbox = screen.getByRole('listbox')
    expect(input).toHaveAttribute('aria-controls', listbox.id)

    await user.keyboard('{ArrowDown}')

    const activeOptionId = input.getAttribute('aria-activedescendant')
    expect(activeOptionId).toBeTruthy()
    expect(document.getElementById(activeOptionId!)).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{Enter}')

    expect(input).toHaveValue('Cardiology')
    expect(onSelectSpy).toHaveBeenCalledWith('Cardiology')
  })

  it('clears the pending blur timeout when the component unmounts', () => {
    vi.useFakeTimers()
    const onChangeSpy = vi.fn()
    const onSelectSpy = vi.fn()

    const { unmount } = render(<TypeaheadHarness onChangeSpy={onChangeSpy} onSelectSpy={onSelectSpy} />)
    const input = screen.getByRole('combobox', { name: 'Doctor specialty' })

    fireEvent.focus(input)
    fireEvent.blur(input)

    expect(vi.getTimerCount()).toBe(1)

    unmount()

    expect(vi.getTimerCount()).toBe(0)
  })
})
