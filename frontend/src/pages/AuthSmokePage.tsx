import { useEffect, useState, type FormEvent } from 'react';
import {
  fetchCurrentUser,
  login,
  type LoginResponse,
  type MeResponse,
} from '../lib/api.ts';
import {
  clearStoredToken,
  getStoredToken,
  storeToken,
} from '../features/auth/auth-storage.ts';

const seededCredentials = {
  email: 'admin@local.dev',
  password: 'admin1234',
};

export function AuthSmokePage() {
  const [email, setEmail] = useState(seededCredentials.email);
  const [password, setPassword] = useState(seededCredentials.password);
  const [token, setToken] = useState<string | null>(getStoredToken());
  const [session, setSession] = useState<LoginResponse | null>(null);
  const [profile, setProfile] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      return;
    }

    setLoading(true);
    void fetchCurrentUser(token)
      .then((result) => {
        setProfile(result);
        setError(null);
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : 'Unknown error');
      })
      .finally(() => setLoading(false));
  }, [token]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const nextSession = await login({ email, password });
        setSession(nextSession);
        setToken(nextSession.accessToken);
        storeToken(nextSession.accessToken);
        const me = await fetchCurrentUser(nextSession.accessToken);
        setProfile(me);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    })();
  }

  function handleReset() {
    setSession(null);
    setProfile(null);
    setToken(null);
    setError(null);
    clearStoredToken();
  }

  return (
    <section className="panel">
      <p className="eyebrow">JWT smoke test</p>
      <h2>Login and inspect the current user</h2>
      <p className="lede">
        Use the seeded local admin account to verify auth and RBAC plumbing.
      </p>

      <form className="form" onSubmit={handleSubmit}>
        <label>
          Email
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
          />
        </label>
        <label>
          Password
          <input
            value={password}
            type="password"
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />
        </label>
        <div className="actions">
          <button type="submit" disabled={loading}>
            {loading ? 'Working...' : 'Login'}
          </button>
          <button
            type="button"
            className="button-secondary"
            onClick={handleReset}
          >
            Clear session
          </button>
        </div>
      </form>

      {error ? (
        <div className="status error">
          <strong>Auth request failed.</strong>
          <p>{error}</p>
        </div>
      ) : null}

      {session ? (
        <div className="status success">
          <strong>Token issued.</strong>
          <pre>{JSON.stringify(session, null, 2)}</pre>
        </div>
      ) : null}

      {profile ? (
        <div className="status success">
          <strong>Current user payload.</strong>
          <pre>{JSON.stringify(profile, null, 2)}</pre>
        </div>
      ) : null}
    </section>
  );
}
