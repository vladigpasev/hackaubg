import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { formatRoleLabel } from '../auth/roles'
import { useAuth } from '../auth/useAuth'
import { ArchivedPatientDetailsModal } from '../features/admin/components/ArchivedPatientDetailsModal'
import { EmptyState, formatDateTime, RoleBadge, SpecialtyList, SummaryCard, TriageBadge } from '../features/admin/components/AdminPrimitives'
import {
  createEmptyStaffForm,
  createStaffFormFromUser,
  DeleteStaffModal,
  StaffEditorModal,
  type StaffFormErrors,
  type StaffFormState,
  type StaffModalMode,
} from '../features/admin/components/StaffManagementModals'
import {
  type ArchivedPatient,
  type ArchiveResponse,
  createStaff,
  deleteStaff,
  fetchArchive,
  fetchStaff,
  type StaffFormPayload,
  type StaffUser,
  updateStaff,
} from '../features/admin/services/adminApi'
import { buildSpecialtyCatalog } from '../features/receptionist/services/clinicianDirectory'
import type { DoctorProfile } from '../features/receptionist/types/patient'

interface FeedbackState {
  message: string
  tone: 'success' | 'error'
}

type StaffSectionKey = 'registry' | 'nurses' | 'doctors'

function toLocalDateTimeInputValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')

  return `${year}-${month}-${day}T${hours}:${minutes}`
}

function buildStaffPayload(form: StaffFormState, requirePassword: boolean): StaffFormPayload {
  const username = form.username.trim()
  const password = form.password.trim()

  if (!username) {
    throw new Error('Username is required.')
  }

  if (requirePassword && password.length === 0) {
    throw new Error('Password is required for new staff accounts.')
  }

  const payload: StaffFormPayload = {
    role: form.role,
    username,
  }

  if (password.length > 0) {
    payload.password = password
  }

  if (form.role === 'doctor') {
    payload.isTester = form.isTester
    payload.specialties = form.specialties
  } else {
    payload.isTester = false
    payload.specialties = []
  }

  return payload
}

function validateArchiveInput(dateTimeValue: string) {
  if (!dateTimeValue.trim()) {
    return 'Archive date and time is required.'
  }

  const targetDate = new Date(dateTimeValue)

  if (Number.isNaN(targetDate.getTime())) {
    return 'Enter a valid archive date and time.'
  }

  return null
}

function validateStaffForm(form: StaffFormState, mode: StaffModalMode): StaffFormErrors {
  const errors: StaffFormErrors = {}

  if (!form.username.trim()) {
    errors.username = 'Username is required.'
  }

  if (mode === 'create' && form.password.trim().length === 0) {
    errors.password = 'Password is required.'
  } else if (form.password.trim().length > 0 && form.password.trim().length < 8) {
    errors.password = 'Password must be at least 8 characters.'
  }

  if (!form.role) {
    errors.role = 'Role is required.'
  }

  if (form.role === 'doctor' && form.specialties.length === 0) {
    errors.specialties = 'Doctor must have at least one specialty.'
  }

  return errors
}

function hasStaffFormErrors(errors: StaffFormErrors) {
  return Object.values(errors).some((value) => typeof value === 'string' && value.length > 0)
}

export function AdminPage() {
  const { logout, user } = useAuth()
  const activeUser = user!

  const [staff, setStaff] = useState<StaffUser[]>([])
  const [archive, setArchive] = useState<ArchiveResponse | null>(null)
  const [dateTimeValue, setDateTimeValue] = useState(() => toLocalDateTimeInputValue(new Date()))
  const [feedback, setFeedback] = useState<FeedbackState | null>(null)
  const [archiveError, setArchiveError] = useState<string | null>(null)
  const [staffError, setStaffError] = useState<string | null>(null)
  const [isArchiveLoading, setIsArchiveLoading] = useState(false)
  const [isStaffLoading, setIsStaffLoading] = useState(true)
  const [busyAction, setBusyAction] = useState<'create' | 'update' | 'delete' | null>(null)
  const [selectedArchivedPatient, setSelectedArchivedPatient] = useState<ArchivedPatient | null>(null)
  const [staffModalMode, setStaffModalMode] = useState<StaffModalMode | null>(null)
  const [staffForm, setStaffForm] = useState<StaffFormState>(createEmptyStaffForm)
  const [staffFormErrors, setStaffFormErrors] = useState<StaffFormErrors>({})
  const [editingUsername, setEditingUsername] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<StaffUser | null>(null)
  const [openSections, setOpenSections] = useState<Record<StaffSectionKey, boolean>>({
    doctors: true,
    nurses: false,
    registry: true,
  })

  const groupedStaff = useMemo(
    () => ({
      doctors: staff.filter((member) => member.role === 'doctor'),
      nurses: staff.filter((member) => member.role === 'nurse'),
      registry: staff.filter((member) => member.role === 'registry'),
    }),
    [staff],
  )

  const specialtyOptions = useMemo(() => {
    const doctorProfiles: DoctorProfile[] = groupedStaff.doctors.map((member) => ({
      displayName: member.username,
      id: `admin-${member.username}`,
      isTester: member.isTester,
      specialties: [...member.specialties],
      username: member.username,
    }))

    return buildSpecialtyCatalog(doctorProfiles)
  }, [groupedStaff.doctors])

  useEffect(() => {
    async function loadInitialStaff() {
      try {
        setIsStaffLoading(true)
        setStaffError(null)
        const nextStaff = await fetchStaff()
        setStaff(nextStaff.sort((left, right) => left.username.localeCompare(right.username)))
      } catch (error) {
        setStaffError(error instanceof Error ? error.message : 'Staff records could not be loaded.')
      } finally {
        setIsStaffLoading(false)
      }
    }

    void loadInitialStaff()
  }, [])

  useEffect(() => {
    if (!feedback || feedback.tone !== 'success') {
      return
    }

    const timeoutId = window.setTimeout(() => setFeedback(null), 2800)
    return () => window.clearTimeout(timeoutId)
  }, [feedback])

  function updateStaffForm(nextValue: Partial<StaffFormState>) {
    const nextForm = { ...staffForm, ...nextValue }
    setStaffForm(nextForm)

    if (staffModalMode && hasStaffFormErrors(staffFormErrors)) {
      setStaffFormErrors(validateStaffForm(nextForm, staffModalMode))
    }
  }

  function toggleSection(section: StaffSectionKey) {
    setOpenSections((current) => ({
      ...current,
      [section]: !current[section],
    }))
  }

  function addSpecialty(value: string) {
    const normalizedValue = value.trim()

    if (!normalizedValue.length) {
      return
    }

    if (staffForm.specialties.some((specialty) => specialty.toLowerCase() === normalizedValue.toLowerCase())) {
      setStaffForm({
        ...staffForm,
        specialtyQuery: '',
      })
      return
    }

    const nextForm: StaffFormState = {
      ...staffForm,
      specialties: [...staffForm.specialties, normalizedValue],
      specialtyQuery: '',
    }

    setStaffForm(nextForm)

    if (staffModalMode) {
      setStaffFormErrors(validateStaffForm(nextForm, staffModalMode))
    }
  }

  function removeSpecialty(value: string) {
    const nextForm: StaffFormState = {
      ...staffForm,
      specialties: staffForm.specialties.filter((specialty) => specialty !== value),
    }

    setStaffForm(nextForm)

    if (staffModalMode) {
      setStaffFormErrors(validateStaffForm(nextForm, staffModalMode))
    }
  }

  function openCreateModal() {
    setEditingUsername(null)
    setStaffForm(createEmptyStaffForm())
    setStaffFormErrors({})
    setStaffModalMode('create')
  }

  function openEditModal(member: StaffUser) {
    setEditingUsername(member.username)
    setStaffForm(createStaffFormFromUser(member))
    setStaffFormErrors({})
    setStaffModalMode('edit')
  }

  async function reloadStaffDirectory(successMessage?: string) {
    const nextStaff = await fetchStaff()
    setStaff(nextStaff.sort((left, right) => left.username.localeCompare(right.username)))

    if (successMessage) {
      setFeedback({ message: successMessage, tone: 'success' })
    }
  }

  async function handleArchiveSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsArchiveLoading(true)
    setArchiveError(null)

    const archiveValidationError = validateArchiveInput(dateTimeValue)

    if (archiveValidationError) {
      setArchiveError(archiveValidationError)
      setIsArchiveLoading(false)
      return
    }

    try {
      const nextArchive = await fetchArchive(dateTimeValue)
      setArchive(nextArchive)
      setFeedback({ message: `Archive loaded for ${nextArchive.date}.`, tone: 'success' })
    } catch (error) {
      setArchive(null)
      setArchiveError(error instanceof Error ? error.message : 'Archive data is unavailable right now.')
    } finally {
      setIsArchiveLoading(false)
    }
  }

  async function handleStaffSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStaffError(null)

    if (!staffModalMode) {
      return
    }

    const nextErrors = validateStaffForm(staffForm, staffModalMode)
    setStaffFormErrors(nextErrors)

    if (hasStaffFormErrors(nextErrors)) {
      return
    }

    try {
      if (staffModalMode === 'create') {
        setBusyAction('create')
        const payload = buildStaffPayload(staffForm, true)
        await createStaff(payload)
        await reloadStaffDirectory(`${payload.username} was created.`)
      } else if (staffModalMode === 'edit' && editingUsername) {
        setBusyAction('update')
        const payload = buildStaffPayload(staffForm, false)
        await updateStaff(editingUsername, payload)
        await reloadStaffDirectory(`${payload.username} was updated.`)
      }

      setStaffModalMode(null)
      setEditingUsername(null)
      setStaffForm(createEmptyStaffForm())
      setStaffFormErrors({})
    } catch (error) {
      setStaffError(error instanceof Error ? error.message : 'Staff changes could not be saved.')
    } finally {
      setBusyAction(null)
    }
  }

  async function handleDeleteStaff() {
    if (!deleteTarget) {
      return
    }

    setStaffError(null)
    setBusyAction('delete')

    try {
      await deleteStaff(deleteTarget.username)
      await reloadStaffDirectory(`${deleteTarget.username} was deleted.`)
      setDeleteTarget(null)
    } catch (error) {
      setStaffError(error instanceof Error ? error.message : 'The staff account could not be deleted.')
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <>
      <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(64,167,163,0.16),transparent_28%),linear-gradient(180deg,#f7fbfd_0%,#eef5f8_100%)] px-4 py-6 text-[var(--text-primary)] sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6">
          <header className="rounded-[1.6rem] border border-[var(--border-soft)] bg-white/92 p-5 shadow-[0_24px_60px_rgba(19,56,78,0.08)]">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-4xl">
                <span className="inline-flex items-center gap-2 rounded-full border border-[var(--blue-border)] bg-[var(--blue-soft)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--blue-text)]">
                  Admin workspace
                </span>
                <h1 className="mt-4 text-[2rem] font-semibold tracking-tight sm:text-[2.35rem]">Staff and archive control panel.</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-secondary)] sm:text-base">
                  Manage staff and review archived cases.
                </p>
              </div>

              <div className="w-full max-w-sm rounded-[1.3rem] border border-[var(--border-soft)] bg-[linear-gradient(180deg,rgba(64,167,163,0.08),rgba(64,167,163,0.02))] p-4">
                <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Signed in</p>
                <p className="mt-3 text-lg font-semibold text-[var(--text-primary)]">{activeUser.username}</p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">{formatRoleLabel(activeUser.role)} access is active.</p>
                <button
                  className="mt-4 min-h-12 rounded-full border border-[var(--border-soft)] bg-white px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-secondary)]"
                  onClick={() => { void logout() }}
                  type="button"
                >
                  Sign out
                </button>
              </div>
            </div>
          </header>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <SummaryCard label="Active staff" value={String(staff.length)} />
            <SummaryCard label="Doctors" value={String(groupedStaff.doctors.length)} />
            <SummaryCard label="Archived patients" value={String(archive?.patients.length ?? 0)} />
          </section>

          {(staffError || archiveError) && (
            <div className="rounded-[1.1rem] border border-[var(--red-border)] bg-[var(--red-soft)] px-4 py-3 text-sm font-semibold text-[var(--red-text)]">
              {staffError ?? archiveError}
            </div>
          )}

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1.35fr)]">
            <section className="space-y-6">
              <section className="rounded-[1.35rem] border border-[var(--border-soft)] bg-white p-5 shadow-[0_16px_36px_rgba(19,56,78,0.05)]">
                <div className="max-w-xl">
                  <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Archive panel</p>
                  <h2 className="mt-2 text-xl font-semibold text-[var(--text-primary)]">Archived cases</h2>
                </div>

                <form className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]" onSubmit={(event) => void handleArchiveSubmit(event)}>
                  <label className="block">
                    <span className="text-sm font-semibold text-[var(--text-primary)]">Archive date and time</span>
                    <input
                      className="mt-2 min-h-12 w-full rounded-[1rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] px-3 py-2.5 text-sm outline-none transition focus:border-[var(--teal-strong)]"
                      onChange={(event) => setDateTimeValue(event.target.value)}
                      type="datetime-local"
                      value={dateTimeValue}
                    />
                  </label>

                  <button className="min-h-12 rounded-[1rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-white disabled:opacity-60 lg:self-end" disabled={isArchiveLoading} type="submit">
                    {isArchiveLoading ? 'Loading archive...' : 'Load archive'}
                  </button>
                </form>
              </section>

              <section className="rounded-[1.35rem] border border-[var(--border-soft)] bg-white p-5 shadow-[0_16px_36px_rgba(19,56,78,0.05)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Cases</p>
                    <h2 className="mt-2 text-xl font-semibold text-[var(--text-primary)]">Archived patients</h2>
                  </div>
                  <span className="text-sm text-[var(--text-secondary)]">{archive?.patients.length ?? 0} patients</span>
                </div>

                {!archive ? (
                  <div className="mt-4"><EmptyState message="Load an archive to inspect archived patients and case history." /></div>
                ) : archive.patients.length === 0 ? (
                  <div className="mt-4"><EmptyState message="No patients were archived in this snapshot." /></div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {archive.patients.map((patient) => (
                      <article key={patient.id} className="rounded-[1.15rem] border border-[var(--border-soft)] bg-[linear-gradient(180deg,#ffffff_0%,var(--surface-soft)_100%)] p-4 shadow-[0_10px_24px_rgba(19,56,78,0.04)]">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <TriageBadge triageState={patient.triage_state} />
                              <span className="rounded-full border border-[var(--border-soft)] bg-white px-2.5 py-1 text-[11px] text-[var(--text-secondary)]">{patient.phone_number}</span>
                            </div>
                            <h3 className="mt-3 text-base font-semibold text-[var(--text-primary)]">{patient.name}</h3>
                            <p className="mt-1 text-sm text-[var(--text-secondary)]">Admitted {formatDateTime(patient.admitted_at)}</p>
                            <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--text-secondary)]">
                              <span className="rounded-full border border-[var(--border-soft)] bg-white px-2.5 py-1">{patient.queue.length} queue</span>
                              <span className="rounded-full border border-[var(--border-soft)] bg-white px-2.5 py-1">{patient.history.length} history</span>
                              <span className="rounded-full border border-[var(--border-soft)] bg-white px-2.5 py-1">{patient.notes.length} notes</span>
                            </div>
                          </div>

                          <button className="min-h-12 rounded-[1rem] border border-[var(--border-soft)] bg-white px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-secondary)]" onClick={() => setSelectedArchivedPatient(patient)} type="button">
                            More details
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </section>

            <section className="rounded-[1.35rem] border border-[var(--border-soft)] bg-white p-5 shadow-[0_16px_36px_rgba(19,56,78,0.05)]">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Managing staff</p>
                  <h2 className="mt-2 text-xl font-semibold text-[var(--text-primary)]">Staff</h2>
                </div>

                <button className="min-h-12 shrink-0 whitespace-nowrap rounded-[1rem] border border-[var(--teal-strong)] bg-[var(--teal)] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[var(--teal-strong)] md:self-start" onClick={openCreateModal} type="button">
                  Create staff
                </button>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <SummaryCard label="Registry" value={String(groupedStaff.registry.length)} />
                <SummaryCard label="Nurses" value={String(groupedStaff.nurses.length)} />
                <SummaryCard label="Doctors" value={String(groupedStaff.doctors.length)} />
              </div>

              {isStaffLoading ? (
                <div className="mt-6"><EmptyState message="Loading staff directory..." /></div>
              ) : (
                <div className="mt-6 space-y-6">
                  {(
                    [
                      ['registry', 'Registry', groupedStaff.registry],
                      ['nurses', 'Nurses', groupedStaff.nurses],
                      ['doctors', 'Doctors', groupedStaff.doctors],
                    ] as const
                  ).map(([sectionKey, label, members]) => (
                    <section key={sectionKey} className="rounded-[1.1rem] border border-[var(--border-soft)] bg-[var(--surface-soft)]">
                      <button
                        className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition hover:bg-white/70"
                        onClick={() => toggleSection(sectionKey)}
                        type="button"
                      >
                        <div className="min-w-0">
                          <h3 className="text-lg font-semibold text-[var(--text-primary)]">{label}</h3>
                          <p className="mt-1 text-sm text-[var(--text-secondary)]">{members.length} accounts</p>
                        </div>
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-soft)] bg-white text-lg text-[var(--text-secondary)]">
                          {openSections[sectionKey] ? '-' : '+'}
                        </span>
                      </button>

                      {openSections[sectionKey] ? (
                        members.length === 0 ? (
                          <div className="px-4 pb-4">
                            <EmptyState message={`No ${label.toLowerCase()} accounts are configured.`} />
                          </div>
                        ) : (
                          <div className="grid gap-3 border-t border-[var(--border-soft)] px-4 py-4 lg:grid-cols-2">
                            {members.map((member) => (
                              <article key={member.username} className="rounded-[1rem] border border-[var(--border-soft)] bg-white p-4">
                                <div className="flex flex-wrap items-center gap-2">
                                  <RoleBadge role={member.role} />
                                  {member.isTester ? <span className="rounded-full border border-[var(--amber-border)] bg-[var(--amber-soft)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--amber-text)]">Tester</span> : null}
                                </div>

                                <h4 className="mt-3 text-base font-semibold text-[var(--text-primary)]">{member.username}</h4>
                                <div className="mt-3">
                                  <SpecialtyList specialties={member.specialties} />
                                </div>

                                <div className="mt-4 flex flex-wrap gap-2">
                                  <button className="min-h-12 rounded-[1rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-white" onClick={() => openEditModal(member)} type="button">
                                    Edit
                                  </button>
                                  <button className="min-h-12 rounded-[1rem] border border-[var(--red-border)] bg-[var(--red-soft)] px-4 py-2 text-sm font-semibold text-[var(--red-text)] transition hover:bg-white" onClick={() => setDeleteTarget(member)} type="button">
                                    Delete
                                  </button>
                                </div>
                              </article>
                            ))}
                          </div>
                        )
                      ) : null}
                    </section>
                  ))}
                </div>
              )}
            </section>
          </section>

          {feedback ? (
            <div className="pointer-events-none fixed right-4 bottom-4 z-40 w-full max-w-sm">
              <div className={`rounded-[1rem] border px-4 py-3 text-sm font-semibold shadow-[0_18px_48px_rgba(19,56,78,0.18)] ${feedback.tone === 'success' ? 'border-[var(--teal-border)] bg-[var(--teal-soft)] text-[var(--teal-strong)]' : 'border-[var(--red-border)] bg-[var(--red-soft)] text-[var(--red-text)]'}`} role="status">
                {feedback.message}
              </div>
            </div>
          ) : null}
        </div>
      </main>

      <ArchivedPatientDetailsModal archive={archive} onClose={() => setSelectedArchivedPatient(null)} patient={selectedArchivedPatient} />

      <StaffEditorModal
        form={staffForm}
        errors={staffFormErrors}
        isBusy={busyAction === 'create' || busyAction === 'update'}
        mode={staffModalMode}
        onChange={updateStaffForm}
        onAddSpecialty={addSpecialty}
        onClose={() => {
          if (busyAction) return
          setStaffModalMode(null)
          setEditingUsername(null)
          setStaffForm(createEmptyStaffForm())
          setStaffFormErrors({})
        }}
        onRemoveSpecialty={removeSpecialty}
        onSubmit={handleStaffSubmit}
        open={staffModalMode !== null}
        specialtyOptions={specialtyOptions}
      />

      <DeleteStaffModal
        isBusy={busyAction === 'delete'}
        onClose={() => {
          if (busyAction === 'delete') return
          setDeleteTarget(null)
        }}
        onConfirm={() => void handleDeleteStaff()}
        target={deleteTarget}
      />
    </>
  )
}
