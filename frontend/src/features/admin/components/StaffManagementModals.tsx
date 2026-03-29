import type { FormEvent } from 'react'
import { TypeaheadInput } from '../../receptionist/components/TypeaheadInput'
import type { CatalogOption } from '../../receptionist/types/patient'
import { Modal } from '../../receptionist/components/Modal'
import { SpecialtyList } from './AdminPrimitives'
import type { StaffRole, StaffUser } from '../services/adminApi'

const ROLE_OPTIONS: Array<{
  description: string
  label: string
  value: StaffRole
}> = [
  { value: 'registry', label: 'Registry', description: 'Admissions and front desk' },
  { value: 'nurse', label: 'Nurse', description: 'Triage and ward support' },
  { value: 'doctor', label: 'Doctor', description: 'Clinical and tester accounts' },
]

export interface StaffFormState {
  username: string
  password: string
  role: StaffRole
  isTester: boolean
  specialties: string[]
  specialtyQuery: string
}

export interface StaffFormErrors {
  password?: string
  role?: string
  specialties?: string
  username?: string
}

export type StaffModalMode = 'create' | 'edit'

function formatSpecialtyLabel(value: string) {
  const normalized = value.trim().replace(/[_-]+/g, ' ')

  if (normalized.length === 0) {
    return normalized
  }

  return normalized
    .split(/\s+/)
    .map((segment) => {
      const upper = segment.toUpperCase()

      if (['ICU', 'CT', 'MRI', 'ECG'].includes(upper)) {
        return upper
      }

      if (upper === 'XRAY') {
        return 'X-Ray'
      }

      return `${segment[0]?.toUpperCase() ?? ''}${segment.slice(1).toLowerCase()}`
    })
    .join(' ')
}

export function createEmptyStaffForm(): StaffFormState {
  return {
    username: '',
    password: '',
    role: 'registry',
    isTester: false,
    specialties: [],
    specialtyQuery: '',
  }
}

export function createStaffFormFromUser(user: StaffUser): StaffFormState {
  return {
    username: user.username,
    password: '',
    role: user.role,
    isTester: user.isTester,
    specialties: [...user.specialties],
    specialtyQuery: '',
  }
}

export function StaffEditorModal({
  form,
  errors,
  isBusy,
  mode,
  onChange,
  onAddSpecialty,
  onClose,
  onRemoveSpecialty,
  onSubmit,
  open,
  specialtyOptions,
}: {
  form: StaffFormState
  errors: StaffFormErrors
  isBusy: boolean
  mode: StaffModalMode | null
  onChange: (nextValue: Partial<StaffFormState>) => void
  onAddSpecialty: (value: string) => void
  onClose: () => void
  onRemoveSpecialty: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  open: boolean
  specialtyOptions: CatalogOption[]
}) {
  return (
    <Modal
      contextLabel="Managing staff"
      description={mode === 'create' ? 'Create a staff account.' : 'Update staff details.'}
      footer={
        <>
          <button
            className="min-h-12 rounded-[1rem] border border-[var(--border-soft)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-secondary)]"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="min-h-12 rounded-[1rem] border border-[var(--teal-strong)] bg-[var(--teal)] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[var(--teal-strong)] disabled:opacity-60"
            disabled={isBusy}
            form="staff-editor-form"
            type="submit"
          >
            {isBusy ? 'Saving...' : mode === 'create' ? 'Create staff member' : 'Save changes'}
          </button>
        </>
      }
      onClose={onClose}
      open={open}
      title={mode === 'create' ? 'Create staff account' : 'Update staff account'}
    >
      <form className="grid gap-4" id="staff-editor-form" onSubmit={onSubmit}>
        <label className="block">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Username</span>
          <input
            className={`mt-2 min-h-12 w-full rounded-[1rem] border bg-[var(--surface-soft)] px-3 py-2.5 text-sm outline-none transition focus:border-[var(--teal-strong)] ${
              errors.username ? 'border-[var(--red-border)]' : 'border-[var(--border-soft)]'
            }`}
            onChange={(event) => onChange({ username: event.target.value })}
            placeholder="doctor.petrova"
            value={form.username}
          />
          {errors.username ? <span className="mt-2 block text-xs font-semibold text-[var(--red-text)]">{errors.username}</span> : null}
        </label>

        <section className="block">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Role</span>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            {ROLE_OPTIONS.map((option) => {
              const isActive = form.role === option.value

              return (
                <button
                  key={option.value}
                  className={`rounded-[1rem] border px-4 py-3 text-left transition ${
                    isActive
                      ? 'border-[var(--teal-strong)] bg-[var(--teal-soft)] shadow-[0_10px_24px_rgba(64,167,163,0.14)]'
                      : 'border-[var(--border-soft)] bg-[var(--surface-soft)] hover:bg-white'
                  }`}
                  onClick={() =>
                    onChange({
                      isTester: option.value === 'doctor' ? form.isTester : false,
                      role: option.value,
                      specialties: option.value === 'doctor' ? form.specialties : [],
                      specialtyQuery: '',
                    })
                  }
                  type="button"
                >
                  <span className="block text-sm font-semibold text-[var(--text-primary)]">{option.label}</span>
                  <span className="mt-1 block text-xs leading-5 text-[var(--text-secondary)]">{option.description}</span>
                </button>
              )
            })}
          </div>
          {errors.role ? <span className="mt-2 block text-xs font-semibold text-[var(--red-text)]">{errors.role}</span> : null}
        </section>

        <div className="grid gap-4">
          <label className="block">
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              Password {mode === 'edit' ? '(leave blank to keep current)' : ''}
            </span>
            <input
              className={`mt-2 min-h-12 w-full rounded-[1rem] border bg-[var(--surface-soft)] px-3 py-2.5 text-sm outline-none transition focus:border-[var(--teal-strong)] ${
                errors.password ? 'border-[var(--red-border)]' : 'border-[var(--border-soft)]'
              }`}
              onChange={(event) => onChange({ password: event.target.value })}
              placeholder={mode === 'create' ? 'Minimum 8 characters' : 'Keep current password'}
              type="password"
              value={form.password}
            />
            {errors.password ? <span className="mt-2 block text-xs font-semibold text-[var(--red-text)]">{errors.password}</span> : null}
          </label>
        </div>

        {form.role === 'doctor' ? (
          <>
            <label className="flex items-center gap-3 rounded-[1rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] px-4 py-3">
              <input
                checked={form.isTester}
                className="h-4 w-4 rounded border-[var(--border-soft)]"
                onChange={(event) => onChange({ isTester: event.target.checked })}
                type="checkbox"
              />
              <span>
                <span className="block text-sm font-semibold text-[var(--text-primary)]">Tester account</span>
                <span className="mt-1 block text-sm text-[var(--text-secondary)]">For lab or imaging staff.</span>
              </span>
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-[var(--text-primary)]">Specialties</span>
              <div className="mt-2 space-y-3">
                <TypeaheadInput
                  error={errors.specialties}
                  helpText="Search the same referral specialties used in the clinical flow."
                  label="Add specialty"
                  onChange={(value) => onChange({ specialtyQuery: value })}
                  onSelect={onAddSpecialty}
                  options={specialtyOptions}
                  placeholder="Search specialty"
                  value={form.specialtyQuery}
                />
                {form.specialties.length > 0 ? (
                  <div className="flex flex-wrap gap-3">
                    {form.specialties.map((specialty) => (
                      <button
                        key={specialty}
                        className="inline-flex min-h-11 items-center justify-between gap-3 rounded-[1rem] border border-[var(--teal-border)] bg-[var(--teal-soft)] px-4 py-2 text-sm font-semibold text-[var(--teal-strong)] transition hover:border-[var(--teal-strong)] hover:bg-white"
                        onClick={() => onRemoveSpecialty(specialty)}
                        type="button"
                      >
                        <span>{formatSpecialtyLabel(specialty)}</span>
                        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-base leading-none">
                          x
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <SpecialtyList emptyLabel="No specialties added yet." specialties={form.specialties} />
                )}
              </div>
            </label>
          </>
        ) : null}
      </form>
    </Modal>
  )
}

export function DeleteStaffModal({
  isBusy,
  onClose,
  onConfirm,
  target,
}: {
  isBusy: boolean
  onClose: () => void
  onConfirm: () => void
  target: StaffUser | null
}) {
  return (
    <Modal
      contextLabel="Managing staff"
      description="This will permanently remove the selected staff account from the authentication database."
      footer={
        <>
          <button
            className="min-h-12 rounded-[1rem] border border-[var(--border-soft)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-secondary)]"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="min-h-12 rounded-[1rem] border border-[var(--red-border)] bg-[var(--red-soft)] px-5 py-2 text-sm font-semibold text-[var(--red-text)] transition hover:bg-white disabled:opacity-60"
            disabled={isBusy}
            onClick={onConfirm}
            type="button"
          >
            {isBusy ? 'Deleting...' : 'Delete staff member'}
          </button>
        </>
      }
      onClose={onClose}
      open={target !== null}
      title={target ? `Delete ${target.username}?` : 'Delete staff member'}
    >
      <p className="text-sm leading-6 text-[var(--text-secondary)]">
        The account will stop being able to sign in immediately. This does not archive patients or modify archived
        records; it only removes the selected staff user from the active staff directory.
      </p>
    </Modal>
  )
}
