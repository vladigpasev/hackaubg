import { useEffect, type MouseEvent, type PropsWithChildren, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface ModalProps extends PropsWithChildren {
  open: boolean
  title: string
  description?: string
  contextLabel?: string
  onClose: () => void
  footer?: ReactNode
}

export function Modal({
  children,
  contextLabel = 'Patient workspace',
  description,
  footer,
  onClose,
  open,
  title,
}: ModalProps) {
  useEffect(() => {
    if (!open) {
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleEscape)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleEscape)
    }
  }, [onClose, open])

  if (!open) {
    return null
  }

  function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      onClose()
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(18,42,56,0.42)] px-4 py-4 sm:items-center sm:px-6"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <section
        aria-describedby={description ? 'modal-description' : undefined}
        aria-labelledby="modal-title"
        aria-modal="true"
        className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-[2rem] border border-[var(--border-soft)] bg-white p-5 shadow-[0_32px_90px_rgba(16,46,63,0.2)] sm:p-6"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
              {contextLabel}
            </p>
            <h2 className="mt-2 text-2xl font-semibold break-words" id="modal-title">
              {title}
            </h2>
            {description ? (
              <p
                className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]"
                id="modal-description"
              >
                {description}
              </p>
            ) : null}
          </div>

          <button
            className="min-h-12 shrink-0 rounded-[1rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] px-4 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-secondary)]"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>

        <div className="mt-6">{children}</div>

        {footer ? <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">{footer}</div> : null}
      </section>
    </div>,
    document.body,
  )
}
