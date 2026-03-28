interface AuthPendingScreenProps {
  title: string
  message: string
}

export function AuthPendingScreen({ title, message }: AuthPendingScreenProps) {
  return (
    <main className="min-h-screen bg-[var(--app-bg)] text-[var(--text-primary)]">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-5 py-8 sm:px-8">
        <section className="w-full rounded-[2rem] border border-[var(--border-soft)] bg-white/95 p-6 shadow-[0_24px_80px_rgba(21,54,74,0.08)] backdrop-blur sm:p-8">
          <div className="inline-flex max-w-full flex-wrap items-center gap-3 rounded-full border border-[var(--teal-border)] bg-[var(--teal-soft)] px-4 py-2 text-sm font-semibold tracking-[0.18em] text-[var(--teal-strong)] uppercase">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--teal)]" />
            Secure workspace
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight break-words sm:text-4xl">
            {title}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-secondary)]">
            {message}
          </p>
        </section>
      </div>
    </main>
  )
}
