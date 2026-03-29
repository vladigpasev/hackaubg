import type { AuthUser } from '../../../auth/types'
import { Modal } from '../../receptionist/components/Modal'
import type { ArchivedHistoryRecord, ArchivedPatient, ArchivedQueueRecord, ArchiveResponse } from '../services/adminApi'
import { EmptyState, formatDateTime, RoleBadge, SpecialtyList, SummaryCard, TriageBadge } from './AdminPrimitives'

function getArchiveUserMap(archive: ArchiveResponse | null) {
  return archive?.users ?? {}
}

function collectInvolvedUsers(patient: ArchivedPatient, archive: ArchiveResponse | null) {
  const userMap = getArchiveUserMap(archive)
  const orderedIds = [
    ...patient.queue.map((record) => record.reffered_by_id),
    ...patient.history.flatMap((record) => [record.reffered_by_id, record.reffered_to_id]),
  ].filter((value, index, collection) => value && collection.indexOf(value) === index)

  return orderedIds.map((userId) => ({
    archivedUser: userMap[userId] ?? null,
    userId,
  }))
}

function getDisplayUser(userId: string, archivedUser: AuthUser | null) {
  return archivedUser?.username ?? userId
}

function QueueRecordCard({
  archive,
  record,
}: {
  archive: ArchiveResponse | null
  record: ArchivedQueueRecord
}) {
  const referredBy = getArchiveUserMap(archive)[record.reffered_by_id]

  return (
    <article className="rounded-[1rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <TriageBadge triageState={record.triage_state} />
        <span className="rounded-full border border-[var(--border-soft)] bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
          {record.specialty}
        </span>
      </div>
      <p className="mt-3 text-sm text-[var(--text-secondary)]">
        Referred by{' '}
        <span className="font-semibold text-[var(--text-primary)]">
          {getDisplayUser(record.reffered_by_id, referredBy)}
        </span>
      </p>
      <p className="mt-3 text-xs text-[var(--text-muted)]">{formatDateTime(record.timestamp)}</p>
    </article>
  )
}

function HistoryRecordCard({
  archive,
  record,
}: {
  archive: ArchiveResponse | null
  record: ArchivedHistoryRecord
}) {
  const userMap = getArchiveUserMap(archive)
  const fromUser = userMap[record.reffered_by_id]
  const toUser = userMap[record.reffered_to_id]

  return (
    <article className="rounded-[1rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <TriageBadge triageState={record.triage_state} />
        <span className="rounded-full border border-[var(--border-soft)] bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
          {record.specialty}
        </span>
        <span
          className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${
            record.is_done
              ? 'border-[var(--green-border)] bg-[var(--green-soft)] text-[var(--green-text)]'
              : 'border-[var(--amber-border)] bg-[var(--amber-soft)] text-[var(--amber-text)]'
          }`}
        >
          {record.is_done ? 'Completed' : 'Open'}
        </span>
      </div>

      <div className="mt-3 grid gap-3 text-sm text-[var(--text-secondary)] sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Referred by</p>
          <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
            {getDisplayUser(record.reffered_by_id, fromUser)}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Assigned to</p>
          <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
            {getDisplayUser(record.reffered_to_id, toUser)}
          </p>
        </div>
      </div>

      <p className="mt-3 text-xs text-[var(--text-muted)]">{formatDateTime(record.timestamp)}</p>
    </article>
  )
}

export function ArchivedPatientDetailsModal({
  archive,
  onClose,
  patient,
}: {
  archive: ArchiveResponse | null
  onClose: () => void
  patient: ArchivedPatient | null
}) {
  if (!patient) {
    return null
  }

  const involvedUsers = collectInvolvedUsers(patient, archive)

  return (
    <Modal
      contextLabel="Archived case"
      description="Archived case timeline."
      onClose={onClose}
      open={patient !== null}
      panelClassName="max-w-6xl"
      title={patient.name}
    >
      <div className="space-y-6">
        <section className="rounded-[1.35rem] border border-[var(--border-soft)] bg-[linear-gradient(180deg,rgba(64,167,163,0.08),rgba(255,255,255,0.96))] p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <TriageBadge triageState={patient.triage_state} />
                <span className="rounded-full border border-[var(--border-soft)] bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                  {patient.phone_number}
                </span>
              </div>
              <h3 className="mt-4 text-2xl font-semibold text-[var(--text-primary)]">{patient.name}</h3>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">{formatDateTime(patient.admitted_at)}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[420px]">
              <SummaryCard label="Notes" value={String(patient.notes.length)} />
              <SummaryCard label="Queue" value={String(patient.queue.length)} />
              <SummaryCard label="History" value={String(patient.history.length)} />
            </div>
          </div>
        </section>

        <section className="rounded-[1.25rem] border border-[var(--border-soft)] bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Case staff</p>
              <h3 className="mt-2 text-lg font-semibold text-[var(--text-primary)]">People on the case</h3>
            </div>
            <span className="text-sm text-[var(--text-secondary)]">{involvedUsers.length} people captured</span>
          </div>

          {involvedUsers.length === 0 ? (
            <div className="mt-4">
              <EmptyState message="No archived staff references were found for this case." />
            </div>
          ) : (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {involvedUsers.map(({ archivedUser, userId }) => (
                <article
                  key={userId}
                  className="rounded-[1rem] border border-[var(--border-soft)] bg-[linear-gradient(180deg,#ffffff_0%,var(--surface-soft)_100%)] p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <RoleBadge role={archivedUser?.role ?? 'registry'} />
                    {archivedUser?.isTester ? (
                      <span className="rounded-full border border-[var(--amber-border)] bg-[var(--amber-soft)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--amber-text)]">
                        Tester
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">{getDisplayUser(userId, archivedUser)}</p>
                  <div className="mt-3">
                    {archivedUser ? (
                      <SpecialtyList emptyLabel="No specialties archived." specialties={archivedUser.specialties} />
                    ) : (
                      <p className="text-sm text-[var(--text-secondary)]">Role details were not archived.</p>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-[1.25rem] border border-[var(--border-soft)] bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Queue</p>
                <h3 className="mt-2 text-lg font-semibold text-[var(--text-primary)]">Queue records</h3>
              </div>
              <span className="text-sm text-[var(--text-secondary)]">{patient.queue.length} items</span>
            </div>

            {patient.queue.length === 0 ? (
              <div className="mt-4">
                <EmptyState message="This patient had no queue items in the archived snapshot." />
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {patient.queue.map((record, index) => (
                  <QueueRecordCard archive={archive} key={`${record.timestamp}-${record.specialty}-${index}`} record={record} />
                ))}
              </div>
            )}
          </section>

          <section className="rounded-[1.25rem] border border-[var(--border-soft)] bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">History</p>
                <h3 className="mt-2 text-lg font-semibold text-[var(--text-primary)]">Referral timeline</h3>
              </div>
              <span className="text-sm text-[var(--text-secondary)]">{patient.history.length} records</span>
            </div>

            {patient.history.length === 0 ? (
              <div className="mt-4">
                <EmptyState message="No referral history was archived for this patient." />
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {patient.history.map((record, index) => (
                  <HistoryRecordCard archive={archive} key={`${record.timestamp}-${record.reffered_to_id}-${index}`} record={record} />
                ))}
              </div>
            )}
          </section>
        </section>

        <section className="rounded-[1.25rem] border border-[var(--border-soft)] bg-white p-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Notes</p>
            <h3 className="mt-2 text-lg font-semibold text-[var(--text-primary)]">Patient notes</h3>
          </div>

          {patient.notes.length === 0 ? (
            <div className="mt-4">
              <EmptyState message="No notes were archived for this patient." />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {patient.notes.map((note, index) => (
                <article
                  key={`${patient.id}-note-${index}`}
                  className="rounded-[1rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] p-4 text-sm leading-6 text-[var(--text-secondary)]"
                >
                  {note}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </Modal>
  )
}
