import { useState, type ChangeEvent, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { getRoleHomePath, isRolePathAllowed } from '../auth/roles'
import { useAuth } from '../auth/useAuth'
import type { AuthCredentials } from '../auth/types'

interface FormErrors {
  username?: string
  password?: string
  form?: string
}

function validateCredentials(credentials: AuthCredentials): FormErrors {
  const errors: FormErrors = {}

  if (credentials.username.trim().length === 0) {
    errors.username = 'Enter a username to continue.'
  }

  if (credentials.password.trim().length === 0) {
    errors.password = 'Enter a password to continue.'
  }

  return errors
}

function getRedirectTarget(state: unknown) {
  if (!state || typeof state !== 'object' || !('from' in state)) {
    return '/'
  }

  const from = state.from

  if (!from || typeof from !== 'object') {
    return '/'
  }

  const pathname = 'pathname' in from && typeof from.pathname === 'string' ? from.pathname : '/'
  const search = 'search' in from && typeof from.search === 'string' ? from.search : ''
  const hash = 'hash' in from && typeof from.hash === 'string' ? from.hash : ''

  return `${pathname}${search}${hash}` || '/'
}

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<FormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const redirectTarget = getRedirectTarget(location.state)

  function handleUsernameChange(event: ChangeEvent<HTMLInputElement>) {
    const nextValue = event.target.value
    setUsername(nextValue)

    if (errors.username || errors.form) {
      setErrors((currentErrors) => ({
        ...currentErrors,
        username: nextValue.trim().length > 0 ? undefined : currentErrors.username,
        form: undefined,
      }))
    }
  }

  function handlePasswordChange(event: ChangeEvent<HTMLInputElement>) {
    const nextValue = event.target.value
    setPassword(nextValue)

    if (errors.password || errors.form) {
      setErrors((currentErrors) => ({
        ...currentErrors,
        password: nextValue.trim().length > 0 ? undefined : currentErrors.password,
        form: undefined,
      }))
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const credentials = { username, password }
    const nextErrors = validateCredentials(credentials)

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    setIsSubmitting(true)
    setErrors({})

    try {
      const authenticatedUser = await login(credentials)
      const nextTarget = isRolePathAllowed(authenticatedUser.role, redirectTarget)
        ? redirectTarget
        : getRoleHomePath(authenticatedUser.role)

      navigate(nextTarget, { replace: true })
    } catch (error) {
      setErrors({
        form:
          error instanceof Error
            ? error.message
            : 'Sign-in is unavailable right now. Please try again.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-[var(--app-bg)] text-[var(--text-primary)]">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-5 py-8 sm:px-8 lg:px-10">
        <section className="w-full max-w-xl rounded-[2rem] border border-[var(--border-soft)] bg-white/95 p-6 shadow-[0_24px_80px_rgba(21,54,74,0.08)] backdrop-blur sm:p-8">
          <div className="inline-flex max-w-full flex-wrap items-center gap-3 rounded-full border border-[var(--teal-border)] bg-[var(--teal-soft)] px-4 py-2 text-sm font-semibold tracking-[0.18em] text-[var(--teal-strong)] uppercase">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--teal)]" />
            SECURE Sign-In
          </div>

          <h1 className="mt-5 text-4xl font-semibold leading-tight break-words sm:text-5xl">
            Sign in to continue.
          </h1>
          {/* <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-secondary)] sm:text-lg">
            The login form calls the backend REST API and keeps the session in a secure HttpOnly
            cookie. Use one of the seeded demo users configured on the server.
          </p> */}
{/* 
          <div className="mt-6 rounded-[1.5rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] p-4">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
              Demo behavior
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              Successful sign-in routes each role to its own guarded workspace path. If a session
              already exists, the public login route redirects to that user&apos;s role home.
            </p>
          </div> */}

          <form className="mt-8 space-y-5" noValidate onSubmit={handleSubmit}>
            <div>
              <label className="mb-2 block text-sm font-semibold text-[var(--text-primary)]" htmlFor="username">
                Username
              </label>
              <input
                aria-describedby={errors.username ? 'username-error' : undefined}
                aria-invalid={errors.username ? 'true' : 'false'}
                autoComplete="username"
                autoFocus
                className="min-h-14 w-full rounded-[1.1rem] border border-[var(--border-soft)] bg-white px-4 py-3 text-base text-[var(--text-primary)] outline-none transition focus:border-[var(--teal-strong)] focus:ring-4 focus:ring-[rgba(15,143,138,0.14)]"
                id="username"
                name="username"
                onChange={handleUsernameChange}
                placeholder="Enter your username"
                type="text"
                value={username}
              />
              {errors.username ? (
                <p
                  className="mt-2 text-sm leading-6 text-[var(--red-text)]"
                  id="username-error"
                >
                  {errors.username}
                </p>
              ) : null}
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-[var(--text-primary)]" htmlFor="password">
                Password
              </label>
              <input
                aria-describedby={errors.password ? 'password-error' : undefined}
                aria-invalid={errors.password ? 'true' : 'false'}
                autoComplete="current-password"
                className="min-h-14 w-full rounded-[1.1rem] border border-[var(--border-soft)] bg-white px-4 py-3 text-base text-[var(--text-primary)] outline-none transition focus:border-[var(--teal-strong)] focus:ring-4 focus:ring-[rgba(15,143,138,0.14)]"
                id="password"
                name="password"
                onChange={handlePasswordChange}
                placeholder="Enter your password"
                type="password"
                value={password}
              />
              {errors.password ? (
                <p
                  className="mt-2 text-sm leading-6 text-[var(--red-text)]"
                  id="password-error"
                >
                  {errors.password}
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

            <button
              className="min-h-14 w-full rounded-[1.2rem] border border-[var(--teal-strong)] bg-[var(--teal)] px-5 py-3 text-base font-semibold text-white shadow-[0_18px_40px_rgba(15,143,138,0.22)] transition hover:bg-[var(--teal-strong)] disabled:cursor-not-allowed disabled:opacity-70"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </section>
      </div>
    </main>
  )
}
