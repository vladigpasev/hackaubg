import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../auth/useAuth'
import { useHospitalState } from '../features/receptionist/hooks/useHospitalState'
import { PatientQueueRolePage } from './PatientQueueRolePage'

vi.mock('../auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('../features/receptionist/hooks/useHospitalState', () => ({
  useHospitalState: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedUseHospitalState = vi.mocked(useHospitalState)

describe('PatientQueueRolePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockedUseAuth.mockReturnValue({
      isAuthenticated: true,
      isHydrated: true,
      login: vi.fn(),
      logout: vi.fn(),
      user: {
        isTester: false,
        role: 'registry',
        specialties: [],
        username: 'registry.frontdesk',
      },
    })
  })

  it('waits for the current session snapshot before rendering board metrics', () => {
    mockedUseHospitalState.mockReturnValue({
      doctors: [],
      hasLoadedSnapshot: false,
      isLoading: true,
      loadError: null,
      notifications: [],
      patients: [],
      reloadHospitalState: vi.fn(),
      replaceDoctors: vi.fn(),
      replaceNotifications: vi.fn(),
      replacePatients: vi.fn(),
      replaceSnapshot: vi.fn(),
    })

    render(
      <PatientQueueRolePage
        canCheckoutPatients
        canRegisterPatients
        contextLabel="Registry desk"
      />,
    )

    expect(screen.getByRole('heading', { name: 'Loading patient board' })).toBeInTheDocument()
    expect(screen.queryByText('Patients')).not.toBeInTheDocument()
  })
})
