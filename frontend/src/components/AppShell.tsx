import { NavLink, Outlet } from 'react-router-dom';

const links = [
  { to: '/', label: 'Health Check' },
  { to: '/auth-smoke', label: 'Auth Smoke' },
];

export function AppShell() {
  return (
    <div className="layout">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">HackAUBG</p>
          <h1>Frontend bootstrap</h1>
          <p className="lede">
            Client-side React shell for validating API connectivity before the
            domain flows are implemented.
          </p>
        </div>
        <nav className="nav">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                isActive ? 'nav-link nav-link-active' : 'nav-link'
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
