import { Provider } from 'jotai'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthUser } from '../../../auth/types'
import type { HospitalSnapshot } from '../types/patient'
import { useHospitalState } from './useHospitalState'
import { getHospitalSnapshot, subscribeToHospitalStream } from '../services/mockPatientApi'

vi.mock('../services/mockPatientApi', () => ({
  getHospitalSnapshot: vi.fn(),
  subscribeToHospitalStream: vi.fn(() => vi.fn()),
}))

const mockedGetHospitalSnapshot = vi.mocked(getHospitalSnapshot)
const mockedSubscribeToHospitalStream = vi.mocked(subscribeToHospitalStream)

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })

  return { promise, resolve }
}

function buildSnapshot(username: string): HospitalSnapshot {
  return {
    doctors: [
      {
        displayName: username,
        id: `DOC-${username}`,
        isTester: false,
        specialties: ['Cardiology'],
        username,
      },
    ],
    notifications: [],
    patients: [],
  }
}

function StateHarness({ user }: { user: AuthUser }) {
  const state = useHospitalState(user)
  const visibleDoctors = state.hasLoadedSnapshot ? state.doctors.map((doctor) => doctor.username).join(',') : 'hidden'

  return (
    <div>
      <span>{`loaded:${String(state.hasLoadedSnapshot)}`}</span>
      <span>{`loading:${String(state.isLoading)}`}</span>
      <span>{`doctors:${visibleDoctors}`}</span>
    </div>
  )
}

describe('useHospitalState', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedSubscribeToHospitalStream.mockReturnValue(vi.fn())
  })

  it('forces a fresh snapshot when the signed-in user changes', async () => {
    const oldUser: AuthUser = {
      isTester: false,
      role: 'doctor',
      specialties: ['Cardiology'],
      username: 'doctor.old',
    }
    const newUser: AuthUser = {
      isTester: false,
      role: 'doctor',
      specialties: ['Cardiology'],
      username: 'doctor.new',
    }
    const firstSnapshot = createDeferred<HospitalSnapshot>()
    const secondSnapshot = createDeferred<HospitalSnapshot>()

    mockedGetHospitalSnapshot.mockImplementation((activeUser) => {
      return activeUser?.username === oldUser.username ? firstSnapshot.promise : secondSnapshot.promise
    })

    const { rerender } = render(
      <Provider>
        <StateHarness user={oldUser} />
      </Provider>,
    )

    expect(screen.getByText('loaded:false')).toBeInTheDocument()
    firstSnapshot.resolve(buildSnapshot(oldUser.username))

    await screen.findByText(`doctors:${oldUser.username}`)
    expect(mockedSubscribeToHospitalStream).toHaveBeenCalledTimes(1)

    rerender(
      <Provider>
        <StateHarness user={newUser} />
      </Provider>,
    )

    expect(screen.getByText('loaded:false')).toBeInTheDocument()
    expect(screen.getByText('doctors:hidden')).toBeInTheDocument()

    await waitFor(() => {
      expect(mockedGetHospitalSnapshot).toHaveBeenCalledTimes(2)
    })

    secondSnapshot.resolve(buildSnapshot(newUser.username))

    await screen.findByText(`doctors:${newUser.username}`)
  })
})
