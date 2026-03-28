import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Modal } from './Modal'

function ModalHarness() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button">Before</button>
      <button onClick={() => setOpen(true)} type="button">
        Open modal
      </button>
      <button type="button">After</button>
      <Modal
        onClose={() => setOpen(false)}
        open={open}
        title="Example modal"
      >
        <button type="button">First action</button>
        <button type="button">Last action</button>
      </Modal>
    </>
  )
}

describe('Modal', () => {
  it('traps focus and restores it when the dialog closes', async () => {
    const user = userEvent.setup()

    render(<ModalHarness />)

    const openButton = screen.getByRole('button', { name: 'Open modal' })
    openButton.focus()

    await user.click(openButton)

    const closeButton = screen.getByRole('button', { name: 'Close' })
    expect(closeButton).toHaveFocus()

    await user.tab()
    expect(screen.getByRole('button', { name: 'First action' })).toHaveFocus()

    await user.tab()
    expect(screen.getByRole('button', { name: 'Last action' })).toHaveFocus()

    await user.tab()
    expect(closeButton).toHaveFocus()

    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(openButton).toHaveFocus()
  })
})
