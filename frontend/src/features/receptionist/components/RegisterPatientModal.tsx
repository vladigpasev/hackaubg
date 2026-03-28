import { useState, type ChangeEvent, type FormEvent } from 'react'
import type { CheckInPatientInput } from '../types/patient'
import { Modal } from './Modal'

interface RegisterPatientModalProps {
  open: boolean
  isSubmitting: boolean
  contextLabel?: string
  onClose: () => void
  onSubmit: (values: CheckInPatientInput) => Promise<void>
}

interface RegisterPatientErrors {
  name?: string
  phoneNumber?: string
  form?: string
}

function validateName(name: string) {
  const trimmedName = name.trim()

  if (trimmedName.length === 0) {
    return 'Enter the patient name.'
  }

  if (trimmedName.length < 2) {
    return 'The patient name must be at least 2 characters.'
  }

  if (!/^[a-zA-Z\s'-]+$/.test(trimmedName)) {
    return 'Use letters, spaces, apostrophes, or hyphens only.'
  }

  return undefined
}

function validatePhoneNumber(phoneNumber: string) {
  const trimmedPhoneNumber = phoneNumber.trim()
  const digitsOnly = trimmedPhoneNumber.replace(/\D/g, '')

  if (trimmedPhoneNumber.length === 0) {
    return 'Enter the phone number.'
  }

  if (!/^\+?[0-9\s()-]+$/.test(trimmedPhoneNumber)) {
    return 'Use digits and common phone symbols only.'
  }

  if (digitsOnly.length < 7) {
    return 'Enter a valid phone number.'
  }

  return undefined
}

function validate(values: CheckInPatientInput): RegisterPatientErrors {
  return {
    name: validateName(values.name),
    phoneNumber: validatePhoneNumber(values.phoneNumber),
  }
}

export function RegisterPatientModal({
  contextLabel,
  isSubmitting,
  onClose,
  onSubmit,
  open,
}: RegisterPatientModalProps) {
  const [values, setValues] = useState<CheckInPatientInput>({ name: '', phoneNumber: '' })
  const [errors, setErrors] = useState<RegisterPatientErrors>({})

  function resetForm() {
    setValues({ name: '', phoneNumber: '' })
    setErrors({})
  }

  function handleClose() {
    resetForm()
    onClose()
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const { name, value } = event.target

    setValues((currentValues) => ({
      ...currentValues,
      [name]: value,
    }))

    if (errors[name as keyof RegisterPatientErrors] || errors.form) {
      const nextFieldError =
        name === 'name' ? validateName(value) : name === 'phoneNumber' ? validatePhoneNumber(value) : undefined

      setErrors((currentErrors) => ({
        ...currentErrors,
        [name]: nextFieldError,
        form: undefined,
      }))
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const nextErrors = validate(values)

    if (nextErrors.name || nextErrors.phoneNumber) {
      setErrors(nextErrors)
      return
    }

    setErrors({})

    try {
      await onSubmit(values)
      resetForm()
    } catch (error) {
      setErrors({
        form:
          error instanceof Error
            ? error.message
            : 'The patient could not be checked in right now. Please try again.',
      })
    }
  }

  return (
    <Modal
      contextLabel={contextLabel}
      description="Capture the essentials only. The live update stream will place the patient into the active list after check-in succeeds."
      footer={
        <>
          <button
            className="min-h-12 rounded-[1.05rem] border border-[var(--border-soft)] bg-white px-5 py-3 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-secondary)]"
            disabled={isSubmitting}
            onClick={handleClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="min-h-14 rounded-[1.2rem] border border-[var(--teal-strong)] bg-[var(--teal)] px-5 py-3 text-base font-semibold text-white shadow-[0_18px_40px_rgba(15,143,138,0.22)] transition hover:bg-[var(--teal-strong)] disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isSubmitting}
            form="register-patient-form"
            type="submit"
          >
            {isSubmitting ? 'Submitting...' : 'Submit'}
          </button>
        </>
      }
      onClose={handleClose}
      open={open}
      title="Register New Patient"
    >
      <form className="space-y-5" id="register-patient-form" noValidate onSubmit={handleSubmit}>
        <div>
          <label className="mb-2 block text-sm font-semibold text-[var(--text-primary)]" htmlFor="patient-name">
            Name
          </label>
          <input
            aria-describedby={errors.name ? 'patient-name-error' : undefined}
            aria-invalid={errors.name ? 'true' : 'false'}
            autoFocus
            className="min-h-14 w-full rounded-[1.1rem] border border-[var(--border-soft)] bg-white px-4 py-3 text-base text-[var(--text-primary)] outline-none transition focus:border-[var(--teal-strong)] focus:ring-4 focus:ring-[rgba(15,143,138,0.14)]"
            id="patient-name"
            name="name"
            onChange={handleChange}
            placeholder="Enter the patient name"
            type="text"
            value={values.name}
          />
          {errors.name ? (
            <p className="mt-2 text-sm leading-6 text-[var(--red-text)]" id="patient-name-error">
              {errors.name}
            </p>
          ) : null}
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-[var(--text-primary)]" htmlFor="patient-phone">
            Phone number
          </label>
          <input
            aria-describedby={errors.phoneNumber ? 'patient-phone-error' : undefined}
            aria-invalid={errors.phoneNumber ? 'true' : 'false'}
            className="min-h-14 w-full rounded-[1.1rem] border border-[var(--border-soft)] bg-white px-4 py-3 text-base text-[var(--text-primary)] outline-none transition focus:border-[var(--teal-strong)] focus:ring-4 focus:ring-[rgba(15,143,138,0.14)]"
            id="patient-phone"
            inputMode="tel"
            name="phoneNumber"
            onChange={handleChange}
            placeholder="Enter the phone number"
            type="tel"
            value={values.phoneNumber}
          />
          {errors.phoneNumber ? (
            <p className="mt-2 text-sm leading-6 text-[var(--red-text)]" id="patient-phone-error">
              {errors.phoneNumber}
            </p>
          ) : null}
        </div>

        {errors.form ? (
          <div
            className="rounded-[1.25rem] border border-[var(--red-border)] bg-[var(--red-soft)] px-4 py-3 text-sm leading-6 text-[var(--red-text)]"
            role="alert"
          >
            {errors.form}
          </div>
        ) : null}
      </form>
    </Modal>
  )
}
