import { formatRoleLabel } from "../auth/roles";
import { useAuth } from "../auth/useAuth";

const quickActions = [
  {
    title: "Start intake",
    detail:
      "Open a guided intake flow with large step controls and clear validation.",
    tag: "Recommended",
    tone: "primary",
  },
  {
    title: "Review alerts",
    detail:
      "Work through urgent items with explicit acknowledge and escalate actions.",
    tag: "Action needed",
    tone: "warning",
  },
  {
    title: "Open worklist",
    detail:
      "Continue active cases from a roomy list instead of a dense dashboard.",
    tag: "In progress",
    tone: "neutral",
  },
] as const;

const caseCards = [
  {
    name: "Mila Petrova",
    id: "PT-24018",
    status: "Critical",
    statusTone: "critical",
    summary:
      "Low oxygen saturation. Escalation path is visible before any secondary details.",
    action: "Open case",
  },
  {
    name: "Georgi Ivanov",
    id: "PT-24022",
    status: "Needs attention",
    statusTone: "warning",
    summary:
      "Waiting for reassessment. The next action stays obvious and close to the record.",
    action: "Review case",
  },
  {
    name: "Elena Nikolova",
    id: "PT-24031",
    status: "Stable",
    statusTone: "stable",
    summary:
      "Ready for routine follow-up. Supporting context is available without competing for attention.",
    action: "Continue",
  },
] as const;

const principles = [
  "Large primary controls are kept at or above 56px to reduce misclicks.",
  "Color is paired with text and icons so severity never depends on color alone.",
  "The page favors one dominant action path and avoids crowded multi-column data walls.",
] as const;

const statusLegend = [
  {
    label: "Critical",
    tone: "critical",
    note: "Urgent action with strongest contrast",
  },
  {
    label: "Needs attention",
    tone: "warning",
    note: "Important but not visually chaotic",
  },
  {
    label: "Stable",
    tone: "stable",
    note: "Calm success state with readable text",
  },
] as const;

const actionToneClasses = {
  primary:
    "border-[var(--teal-strong)] bg-[var(--teal)] text-white shadow-[0_18px_40px_rgba(15,143,138,0.22)] hover:bg-[var(--teal-strong)]",
  warning:
    "border-[var(--amber-border)] bg-[var(--amber-soft)] text-[var(--amber-text)] hover:bg-[var(--amber-soft-strong)]",
  neutral:
    "border-[var(--border-soft)] bg-[var(--surface-secondary)] text-[var(--text-primary)] hover:bg-[var(--surface-secondary-strong)]",
} as const;

const statusToneClasses = {
  critical:
    "border-[var(--red-border)] bg-[var(--red-soft)] text-[var(--red-text)]",
  warning:
    "border-[var(--amber-border)] bg-[var(--amber-soft)] text-[var(--amber-text)]",
  stable:
    "border-[var(--green-border)] bg-[var(--green-soft)] text-[var(--green-text)]",
} as const;

export function WorkspacePage() {
  const { logout, user } = useAuth();
  const activeUser = user!;
  const roleLabel = formatRoleLabel(activeUser.role);
  const roleContent = {
    registry: {
      badge: "Registry workspace",
      title: "A clear intake and handoff shell for registry staff.",
      description:
        "This role-focused shell keeps admissions, transfer coordination, and the next safe action close together.",
      primaryAction: "Start intake",
    },
    nurse: {
      badge: "Nurse workspace",
      title:
        "A calm nursing workspace with clear priorities and minimal clutter.",
      description:
        "The page favors handoff visibility, active task review, and fast access to the next patient-facing action.",
      primaryAction: "Open worklist",
    },
    doctor: {
      badge: activeUser.isTester
        ? "Doctor tester workspace"
        : "Doctor workspace",
      title: activeUser.isTester
        ? "A focused doctor tester shell for labs, scans, and clinical review."
        : "A doctor workspace that keeps urgent decisions and referrals obvious.",
      description: activeUser.isTester
        ? "Tester doctors can validate investigations and devices without a separate auth flow or route tree."
        : "The shell stays decision-oriented so the highest priority case and escalation path remain easy to scan.",
      primaryAction: activeUser.isTester
        ? "Review investigations"
        : "Review cases",
    },
    admin: {
      badge: "Admin workspace",
      title:
        "Administrative controls with clear access and archival oversight.",
      description:
        "Admin users can access high-privilege flows like archive inspection while keeping operational context visible.",
      primaryAction: "Review archives",
    },
  }[activeUser.role];

  return (
    <main className="min-h-screen bg-[var(--app-bg)] text-[var(--text-primary)]">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10">
        <header className="rounded-[2rem] border border-[var(--border-soft)] bg-white/90 p-5 shadow-[0_24px_80px_rgba(21,54,74,0.08)] backdrop-blur sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 max-w-3xl">
              <div className="inline-flex max-w-full flex-wrap items-center gap-3 rounded-full border border-[var(--teal-border)] bg-[var(--teal-soft)] px-4 py-2 text-sm font-semibold tracking-[0.18em] text-[var(--teal-strong)] uppercase">
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--teal)]" />
                {roleContent.badge}
              </div>
              <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-tight break-words sm:text-5xl">
                {roleContent.title}
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-secondary)] sm:text-lg">
                {roleContent.description}
              </p>
            </div>

            <div className="flex w-full max-w-md flex-col gap-3 rounded-[1.75rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  Shift status
                </p>
                <span className="inline-flex max-w-full w-fit flex-wrap items-center gap-2 rounded-full border border-[var(--green-border)] bg-[var(--green-soft)] px-3 py-1.5 text-sm font-semibold text-[var(--green-text)]">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--green)] text-[11px] text-white">
                    OK
                  </span>
                  System ready
                </span>
              </div>

              <div className="rounded-[1.35rem] border border-[var(--border-soft)] bg-white px-4 py-3">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  Signed in
                </p>
                <p className="mt-2 text-base font-semibold text-[var(--text-primary)]">
                  {activeUser.username}
                </p>
                <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                  {roleLabel} access is active through the backend JWT session.
                </p>
                {activeUser.role === "doctor" ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {activeUser.isTester ? (
                      <span className="inline-flex items-center rounded-full border border-[var(--amber-border)] bg-[var(--amber-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--amber-text)]">
                        Tester
                      </span>
                    ) : null}
                    {activeUser.specialties.map((specialty) => (
                      <span
                        key={specialty}
                        className="inline-flex items-center rounded-full border border-[var(--teal-border)] bg-[var(--teal-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--teal-strong)]"
                      >
                        {specialty}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              <button className="min-h-14 rounded-[1.2rem] border border-[var(--teal-strong)] bg-[var(--teal)] px-5 text-base font-semibold text-white shadow-[0_18px_40px_rgba(15,143,138,0.22)] transition hover:bg-[var(--teal-strong)]">
                {roleContent.primaryAction}
              </button>
              <button
                className="min-h-12 rounded-[1.05rem] border border-[var(--border-soft)] bg-white px-4 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-secondary)]"
                onClick={() => {
                  void logout();
                }}
                type="button"
              >
                Sign out
              </button>
            </div>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.9fr)]">
          <div className="rounded-[2rem] border border-[var(--border-soft)] bg-white p-5 shadow-[0_18px_50px_rgba(19,56,78,0.06)] sm:p-6">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  Primary actions
                </p>
                <h2 className="mt-2 text-2xl font-semibold break-words">
                  Large buttons, one clear path at a time
                </h2>
              </div>
              <p className="max-w-xl text-sm leading-6 text-[var(--text-secondary)] xl:max-w-sm">
                Each action card uses one dominant button and enough spacing to
                prevent accidental clicks under pressure.
              </p>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {quickActions.map((action) => (
                <article
                  key={action.title}
                  className="flex h-full flex-col rounded-[1.75rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] p-4 sm:p-5"
                >
                  <div className="flex min-w-0 flex-col items-start gap-3">
                    <p className="max-w-full text-lg font-semibold break-words">
                      {action.title}
                    </p>
                    <span
                      className={`inline-flex max-w-full self-start whitespace-normal break-words rounded-full border px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-[0.12em] ${
                        actionToneClasses[action.tone]
                      }`}
                    >
                      {action.tag}
                    </span>
                  </div>
                  <p className="mt-3 max-w-full text-sm leading-6 text-[var(--text-secondary)]">
                    {action.detail}
                  </p>
                  <button
                    className={`mt-auto min-h-14 w-full rounded-[1.1rem] border px-4 py-3 text-base font-semibold transition ${
                      actionToneClasses[action.tone]
                    }`}
                    type="button"
                  >
                    {action.title}
                  </button>
                </article>
              ))}
            </div>
          </div>

          <aside className="rounded-[2rem] border border-[var(--border-soft)] bg-[var(--surface-secondary)] p-5 shadow-[0_18px_50px_rgba(19,56,78,0.06)] sm:p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
              Visual brief
            </p>
            <h2 className="mt-2 text-2xl font-semibold">
              What the page is proving
            </h2>
            <ul className="mt-5 space-y-3">
              {principles.map((principle) => (
                <li
                  key={principle}
                  className="flex items-start gap-3 rounded-[1.35rem] border border-[var(--border-soft)] bg-white px-4 py-3"
                >
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--teal-soft)] text-xs font-bold text-[var(--teal-strong)]">
                    UI
                  </span>
                  <p className="text-sm leading-6 text-[var(--text-secondary)]">
                    {principle}
                  </p>
                </li>
              ))}
            </ul>
          </aside>
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.78fr)]">
          <div className="rounded-[2rem] border border-[var(--border-soft)] bg-white p-5 shadow-[0_18px_50px_rgba(19,56,78,0.06)] sm:p-6">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  Example cards
                </p>
                <h2 className="mt-2 text-2xl font-semibold break-words">
                  Readable records without a data wall
                </h2>
              </div>
              <p className="max-w-xl text-sm leading-6 text-[var(--text-secondary)] xl:max-w-sm">
                The cards use strong grouping, large labels, and one next action
                instead of a dense spreadsheet.
              </p>
            </div>

            <div className="mt-6 grid gap-4">
              {caseCards.map((card) => (
                <article
                  key={card.id}
                  className="rounded-[1.75rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] p-4 sm:p-5"
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="max-w-full text-xl font-semibold break-words">
                          {card.name}
                        </h3>
                        <span className="inline-flex max-w-full rounded-full border border-[var(--border-soft)] bg-white px-3 py-1 text-sm font-medium text-[var(--text-secondary)]">
                          {card.id}
                        </span>
                        <span
                          className={`inline-flex max-w-full flex-wrap items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold ${
                            statusToneClasses[card.statusTone]
                          }`}
                        >
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-current/12 text-[10px] font-bold">
                            {card.status === "Critical"
                              ? "CR"
                              : card.status === "Stable"
                                ? "OK"
                                : "AT"}
                          </span>
                          {card.status}
                        </span>
                      </div>
                      <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
                        {card.summary}
                      </p>
                    </div>

                    <button
                      className="min-h-14 w-full rounded-[1.1rem] border border-[var(--border-soft)] bg-white px-5 py-3 text-base font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-secondary)] sm:w-auto"
                      type="button"
                    >
                      {card.action}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <section className="rounded-[2rem] border border-[var(--border-soft)] bg-white p-5 shadow-[0_18px_50px_rgba(19,56,78,0.06)] sm:p-6">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                Status legend
              </p>
              <h2 className="mt-2 text-2xl font-semibold break-words">
                Consistent meaning, not decorative color
              </h2>
              <div className="mt-5 space-y-3">
                {statusLegend.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-[1.35rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] p-4"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`inline-flex max-w-full flex-wrap items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold ${
                          statusToneClasses[item.tone]
                        }`}
                      >
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-current/12 text-[10px] font-bold">
                          {item.label === "Critical"
                            ? "CR"
                            : item.label === "Stable"
                              ? "OK"
                              : "AT"}
                        </span>
                        {item.label}
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                      {item.note}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[2rem] border border-[var(--border-soft)] bg-[linear-gradient(180deg,rgba(15,143,138,0.08),rgba(255,255,255,0.96))] p-5 shadow-[0_18px_50px_rgba(19,56,78,0.06)] sm:p-6">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                Next step
              </p>
              <h2 className="mt-2 text-2xl font-semibold break-words">
                Use this page as the visual starting point
              </h2>
              <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                The example is intentionally static. It exists to anchor the
                future UI in the calm, safe, high-contrast direction defined in
                the frontend docs.
              </p>
              <button
                className="mt-5 min-h-14 w-full rounded-[1.2rem] border border-[var(--teal-strong)] bg-[var(--teal)] px-5 text-base font-semibold text-white shadow-[0_18px_40px_rgba(15,143,138,0.22)] transition hover:bg-[var(--teal-strong)]"
                type="button"
              >
                Build the next screen from this pattern
              </button>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
