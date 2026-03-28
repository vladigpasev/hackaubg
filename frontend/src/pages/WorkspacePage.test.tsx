import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../auth/useAuth'
import { useHospitalState } from '../features/receptionist/hooks/useHospitalState'
import { WorkspacePage } from './WorkspacePage'

vi.mock('../auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('../features/receptionist/hooks/useHospitalState', () => ({
  useHospitalState: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedUseHospitalState = vi.mocked(useHospitalState)

describe('WorkspacePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockedUseAuth.mockReturnValue({
      isAuthenticated: true,
      isHydrated: true,
      login: vi.fn(),
      logout: vi.fn(),
      user: {
        isTester: false,
        role: 'doctor',
        specialties: ['Cardiology'],
        username: 'doctor.petrova',
      },
    })
  })

  it('shows a loading screen before the current session snapshot is ready', () => {
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

    render(<WorkspacePage />)

    expect(screen.getByRole('heading', { name: 'Loading staff workspace' })).toBeInTheDocument()
    expect(screen.queryByText('No staff profile found')).not.toBeInTheDocument()
  })
})
