import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PublicPatientDetails } from '../features/public-patient/types/publicPatient'
import { PublicPatientDetailsPage } from './PublicPatientDetailsPage'
import { createPublicPatientStream, getPublicPatientByPhoneNumber } from '../features/public-patient/services/publicPatientApi'

const publicPatientMocks = vi.hoisted(() => ({
  stream: {
    close: vi.fn(),
    onerror: null as (() => void) | null,
    onmessage: null as ((event: MessageEvent<string>) => void) | null,
    onopen: null as (() => void) | null,
  },
}))

vi.mock('../features/public-patient/services/publicPatientApi', () => ({
  createPublicPatientStream: vi.fn(() => publicPatientMocks.stream),
  getPublicPatientByPhoneNumber: vi.fn(),
  isPublicPatientNotFoundError: vi.fn((error: unknown) => error instanceof Error && error.message === 'not-found'),
  parsePublicPatientStreamEvent: vi.fn((event: MessageEvent<string>) => JSON.parse(event.data) as { type: string }),
}))

const mockedCreatePublicPatientStream = vi.mocked(createPublicPatientStream)
const mockedGetPublicPatientByPhoneNumber = vi.mocked(getPublicPatientByPhoneNumber)

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })

  return { promise, resolve }
}

function buildPatient(name: string): PublicPatientDetails {
  return {
    admittedAt: '2026-03-29T08:00:00.000Z',
    history: [],
    id: name.toLowerCase().replace(/\s+/g, '-'),
    name,
    notes: [],
    phoneNumber: '0889001001',
    queue: [],
    triageState: 'yellow',
  }
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/public/patient/0889001001']}>
      <Routes>
        <Route path="/public/patient/:phoneNumber" element={<PublicPatientDetailsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('PublicPatientDetailsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    publicPatientMocks.stream.close.mockClear()
    publicPatientMocks.stream.onopen = null
    publicPatientMocks.stream.onmessage = null
    publicPatientMocks.stream.onerror = null
  })

  it('ignores slower stream refresh responses that arrive out of order', async () => {
    const initialPatient = buildPatient('Patient Initial')
    const stalePatient = buildPatient('Patient Stale')
    const latestPatient = buildPatient('Patient Latest')
    const firstRefresh = createDeferred<PublicPatientDetails>()
    const secondRefresh = createDeferred<PublicPatientDetails>()

    mockedGetPublicPatientByPhoneNumber
      .mockResolvedValueOnce(initialPatient)
      .mockReturnValueOnce(firstRefresh.promise)
      .mockReturnValueOnce(secondRefresh.promise)

    renderPage()

    await screen.findAllByRole('heading', { name: 'Patient Initial' })
    expect(mockedCreatePublicPatientStream).toHaveBeenCalledWith(initialPatient.id)

    publicPatientMocks.stream.onmessage?.({ data: JSON.stringify({ type: 'patient:update' }) } as MessageEvent<string>)
    publicPatientMocks.stream.onmessage?.({ data: JSON.stringify({ type: 'patient:update' }) } as MessageEvent<string>)

    secondRefresh.resolve(latestPatient)
    await screen.findAllByRole('heading', { name: 'Patient Latest' })

    firstRefresh.resolve(stalePatient)

    await waitFor(() => {
      expect(screen.getAllByRole('heading', { name: 'Patient Latest' }).length).toBeGreaterThan(0)
    })
    expect(screen.queryAllByRole('heading', { name: 'Patient Stale' })).toHaveLength(0)
  })

  it('keeps the last snapshot visible and marks the page checked out when the stream sends checkout', async () => {
    const patient = buildPatient('Patient Checkout')

    mockedGetPublicPatientByPhoneNumber.mockResolvedValue(patient)

    renderPage()

    await screen.findAllByRole('heading', { name: 'Patient Checkout' })

    publicPatientMocks.stream.onmessage?.({ data: JSON.stringify({ type: 'patient:check-out' }) } as MessageEvent<string>)

    expect(await screen.findByText(/This patient has been checked out of the active hospital queue/)).toBeInTheDocument()
    expect(publicPatientMocks.stream.close).toHaveBeenCalled()
  })
})
