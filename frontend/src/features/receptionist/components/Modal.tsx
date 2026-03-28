import { useEffect, useId, useRef, type MouseEvent, type PropsWithChildren, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface ModalProps extends PropsWithChildren {
  open: boolean
  title: string
  description?: string
  contextLabel?: string
  onClose: () => void
  footer?: ReactNode
}

function getFocusableElements(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )].filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true')
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
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLElement | null>(null)
  const lastFocusedElementRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    const dialog = dialogRef.current
    const previousOverflow = document.body.style.overflow
    lastFocusedElementRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    document.body.style.overflow = 'hidden'

    const initialFocusTarget = dialog ? getFocusableElements(dialog)[0] ?? dialog : null
    initialFocusTarget?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key !== 'Tab' || !dialog) {
        return
      }

      const focusableElements = getFocusableElements(dialog)

      if (focusableElements.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }

      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]
      const activeElement = document.activeElement

      if (event.shiftKey) {
        if (activeElement === firstElement || activeElement === dialog) {
          event.preventDefault()
          lastElement.focus()
        }

        return
      }

      if (activeElement === lastElement) {
        event.preventDefault()
        firstElement.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)

      if (lastFocusedElementRef.current?.isConnected) {
        lastFocusedElementRef.current.focus()
      }
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
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-[2rem] border border-[var(--border-soft)] bg-white p-5 shadow-[0_32px_90px_rgba(16,46,63,0.2)] sm:p-6"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
              {contextLabel}
            </p>
            <h2 className="mt-2 text-2xl font-semibold break-words" id={titleId}>
              {title}
            </h2>
            {description ? (
              <p
                className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]"
                id={descriptionId}
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
