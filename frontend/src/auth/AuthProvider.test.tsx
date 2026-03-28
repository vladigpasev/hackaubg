import { Provider, useAtomValue, useSetAtom } from 'jotai'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { doctorProfilesAtom, isHospitalStateHydratedAtom, replaceHospitalStateAtom } from '../features/receptionist/state/patientAtoms'
import { useAuth } from './useAuth'
import { fetchCurrentUser, loginWithCredentials, logoutFromServer } from './authClient'
import { AuthProvider } from './AuthProvider'

vi.mock('./authClient', () => ({
  fetchCurrentUser: vi.fn(),
  loginWithCredentials: vi.fn(),
  logoutFromServer: vi.fn(),
}))

const mockedFetchCurrentUser = vi.mocked(fetchCurrentUser)
const mockedLoginWithCredentials = vi.mocked(loginWithCredentials)
const mockedLogoutFromServer = vi.mocked(logoutFromServer)

const staleSnapshot = {
  doctors: [
    {
      displayName: 'Dr. Stale',
      id: 'DOC-stale',
      isTester: false,
      specialties: ['ICU'],
      username: 'doctor.stale',
    },
  ],
  notifications: [],
  patients: [],
}

function AuthHarness() {
  const { isHydrated, login, logout, user } = useAuth()
  const doctors = useAtomValue(doctorProfilesAtom)
  const isHospitalStateHydrated = useAtomValue(isHospitalStateHydratedAtom)
  const replaceHospitalState = useSetAtom(replaceHospitalStateAtom)

  return (
    <div>
      <span>{`auth:${isHydrated ? 'hydrated' : 'pending'}`}</span>
      <span>{`user:${user?.username ?? 'none'}`}</span>
      <span>{`doctors:${doctors.length}`}</span>
      <span>{`hospital:${String(isHospitalStateHydrated)}`}</span>
      <button
        onClick={() => {
          replaceHospitalState({
            sessionKey: 'stale-session',
            snapshot: staleSnapshot,
          })
        }}
        type="button"
      >
        Seed stale state
      </button>
      <button
        onClick={() => {
          void login({
            password: 'password',
            username: 'doctor.next',
          })
        }}
        type="button"
      >
        Login
      </button>
      <button
        onClick={() => {
          void logout()
        }}
        type="button"
      >
        Logout
      </button>
    </div>
  )
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedFetchCurrentUser.mockResolvedValue(null)
    mockedLoginWithCredentials.mockResolvedValue({
      isTester: false,
      role: 'doctor',
      specialties: ['Cardiology'],
      username: 'doctor.next',
    })
    mockedLogoutFromServer.mockResolvedValue(undefined)
  })

  it('clears hospital state when logging in and out within the same app session', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Provider>
          <AuthProvider>
            <AuthHarness />
          </AuthProvider>
        </Provider>
      </MemoryRouter>,
    )

    await screen.findByText('auth:hydrated')

    await user.click(screen.getByRole('button', { name: 'Seed stale state' }))
    expect(screen.getByText('doctors:1')).toBeInTheDocument()
    expect(screen.getByText('hospital:true')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Login' }))

    await waitFor(() => {
      expect(screen.getByText('user:doctor.next')).toBeInTheDocument()
      expect(screen.getByText('doctors:0')).toBeInTheDocument()
      expect(screen.getByText('hospital:false')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Seed stale state' }))
    expect(screen.getByText('doctors:1')).toBeInTheDocument()
    expect(screen.getByText('hospital:true')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Logout' }))

    await waitFor(() => {
      expect(screen.getByText('user:none')).toBeInTheDocument()
      expect(screen.getByText('doctors:0')).toBeInTheDocument()
      expect(screen.getByText('hospital:false')).toBeInTheDocument()
    })
  })
})
