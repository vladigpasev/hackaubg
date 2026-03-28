import { useState, type FormEvent } from 'react'

interface PublicPatientLookupFormProps {
  defaultValue?: string
  isSubmitting?: boolean
  error?: string | null
  onSubmit: (phoneNumber: string) => void
}

function validatePhoneNumber(phoneNumber: string) {
  const trimmedPhoneNumber = phoneNumber.trim()
  const digitsOnly = trimmedPhoneNumber.replace(/\D/g, '')

  if (trimmedPhoneNumber.length === 0) {
    return 'Enter the phone number used at check-in.'
  }

  if (!/^\+?[0-9\s()-]+$/.test(trimmedPhoneNumber)) {
    return 'Use digits and common phone symbols only.'
  }

  if (digitsOnly.length < 7) {
    return 'Enter a valid phone number.'
  }

  return null
}

export function PublicPatientLookupForm({
  defaultValue = '',
  error,
  isSubmitting = false,
  onSubmit,
}: PublicPatientLookupFormProps) {
  const [phoneNumber, setPhoneNumber] = useState(defaultValue)
  const [validationError, setValidationError] = useState<string | null>(null)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const nextError = validatePhoneNumber(phoneNumber)

    if (nextError) {
      setValidationError(nextError)
      return
    }

    setValidationError(null)
    onSubmit(phoneNumber.trim())
  }

  const activeError = validationError ?? error ?? null

  return (
    <form className="space-y-5" noValidate onSubmit={handleSubmit}>
      <div>
        <label
          className="mb-2 block text-sm font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]"
          htmlFor="public-patient-phone"
        >
          Patient phone number
        </label>
        <input
          aria-describedby={activeError ? 'public-patient-phone-error' : 'public-patient-phone-help'}
          aria-invalid={activeError ? 'true' : 'false'}
          autoComplete="tel"
          className="min-h-16 w-full rounded-[1.35rem] border border-[var(--border-soft)] bg-white px-5 py-4 text-lg text-[var(--text-primary)] outline-none transition focus:border-[var(--teal-strong)] focus:ring-4 focus:ring-[rgba(15,143,138,0.14)]"
          id="public-patient-phone"
          inputMode="tel"
          onChange={(event) => {
            setPhoneNumber(event.target.value)

            if (validationError) {
              setValidationError(validatePhoneNumber(event.target.value))
            }
          }}
          placeholder="Example: 0889001001"
          type="tel"
          value={phoneNumber}
        />
        {activeError ? (
          <p className="mt-3 text-sm leading-6 text-[var(--red-text)]" id="public-patient-phone-error">
            {activeError}
          </p>
        ) : (
          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]" id="public-patient-phone-help">
            Use the exact number given during registration. The public page will open the live patient view for it.
          </p>
        )}
      </div>

      <button
        className="min-h-14 w-full rounded-[1.2rem] border border-[var(--teal-strong)] bg-[var(--teal)] px-5 text-base font-semibold text-white shadow-[0_18px_40px_rgba(15,143,138,0.22)] transition hover:bg-[var(--teal-strong)] disabled:cursor-not-allowed disabled:opacity-70"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? 'Opening patient page...' : 'Open patient page'}
      </button>
    </form>
  )
}
