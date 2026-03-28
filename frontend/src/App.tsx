const quickStart = [
  {
    title: 'Start the dev server',
    detail: 'Run npm run dev and iterate in src/App.tsx.',
  },
  {
    title: 'Compose with utilities',
    detail: 'Use Tailwind classes directly in your React components.',
  },
  {
    title: 'Scale when needed',
    detail: 'Add components, routes, and data flow on top of this base.',
  },
] as const

function App() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.14),_transparent_34%),linear-gradient(180deg,_#020617_0%,_#0f172a_45%,_#111827_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center gap-8 px-6 py-16 lg:px-10">
        <div className="inline-flex w-fit items-center rounded-full border border-cyan-400/30 bg-cyan-300/10 px-4 py-2 text-sm font-medium tracking-[0.18em] text-cyan-100 uppercase">
          React + Vite + Tailwind CSS
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.9fr)]">
          <section className="rounded-[2rem] border border-white/10 bg-slate-950/65 p-8 shadow-2xl shadow-black/30 backdrop-blur sm:p-10">
            <p className="text-sm uppercase tracking-[0.35em] text-slate-400">
              Frontend workspace
            </p>
            <h1 className="mt-4 max-w-2xl font-serif text-5xl leading-none text-white sm:text-6xl">
              Tailwind is wired into this Vite app.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
              Edit this screen in <span className="font-semibold text-white">src/App.tsx</span>,
              compose UI with utility classes, and keep global styles minimal in{' '}
              <span className="font-semibold text-white">src/index.css</span>.
            </p>

            <div className="mt-8 flex flex-wrap gap-3 text-sm text-slate-200">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                React 19
              </span>
              <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-cyan-100">
                Tailwind CSS v4
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                Vite 8
              </span>
            </div>
          </section>

          <aside className="rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/20 backdrop-blur sm:p-8">
            <p className="text-sm uppercase tracking-[0.32em] text-slate-400">
              Quick start
            </p>
            <ol className="mt-6 space-y-4">
              {quickStart.map((item, index) => (
                <li
                  key={item.title}
                  className="rounded-2xl border border-white/10 bg-slate-950/45 p-4"
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-400/15 text-sm font-semibold text-cyan-100">
                      {index + 1}
                    </span>
                    <div>
                      <p className="font-semibold text-white">{item.title}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-300">
                        {item.detail}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </aside>
        </div>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Edit</p>
            <p className="mt-3 text-lg font-semibold text-white">Component entry</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">Build your first screen in src/App.tsx.</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Style</p>
            <p className="mt-3 text-lg font-semibold text-white">Utility-first</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">Use Tailwind classes directly in JSX for layout, spacing, and typography.</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Ship</p>
            <p className="mt-3 text-lg font-semibold text-white">Production-ready</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">Build with npm run build whenever you want to verify the app bundle.</p>
          </div>
        </section>
      </div>
    </main>
  )
}

export default App
