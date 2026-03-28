import type { PropsWithChildren, ReactNode } from 'react'

interface PublicPatientShellProps extends PropsWithChildren {
  eyebrow: string
  title: string
  description: string
  action?: ReactNode
}

export function PublicPatientShell({
  action,
  children,
  description,
  eyebrow,
  title,
}: PublicPatientShellProps) {
  return (
    <main className="min-h-screen bg-[var(--app-bg)] text-[var(--text-primary)]">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10">
        <header className="relative overflow-hidden rounded-[2rem] border border-[var(--border-soft)] bg-white/92 px-6 py-7 shadow-[0_30px_90px_rgba(21,54,74,0.08)] backdrop-blur sm:px-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-16 -right-14 h-44 w-44 rounded-full bg-[radial-gradient(circle,_rgba(15,143,138,0.2),_transparent_70%)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-20 left-10 h-52 w-52 rounded-full bg-[radial-gradient(circle,_rgba(75,131,184,0.15),_transparent_72%)]"
          />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="inline-flex max-w-full items-center gap-3 rounded-full border border-[var(--teal-border)] bg-[var(--teal-soft)] px-4 py-2 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--teal-strong)]">
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--teal)]" />
                {eyebrow}
              </p>
              <h1 className="mt-4 text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">{title}</h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-secondary)] sm:text-lg">
                {description}
              </p>
            </div>

            {action ? <div className="relative z-10">{action}</div> : null}
          </div>
        </header>

        {children}
      </div>
    </main>
  )
}
