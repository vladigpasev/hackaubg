import { useEffect, useState } from 'react';
import { fetchHealth, type HealthResponse } from '../lib/api.ts';
import { env } from '../lib/env.ts';

export function HomePage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetchHealth()
      .then((result) => {
        setHealth(result);
        setError(null);
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : 'Unknown error');
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="panel">
      <p className="eyebrow">API wiring</p>
      <h2>Backend readiness</h2>
      <p className="lede">
        This route validates the initial contract between the CSR frontend and
        the NestJS backend.
      </p>

      <dl className="stats">
        <div>
          <dt>API base URL</dt>
          <dd>{env.apiUrl}</dd>
        </div>
        <div>
          <dt>Health endpoint</dt>
          <dd>{`${env.apiUrl}/health`}</dd>
        </div>
      </dl>

      {loading ? <p>Checking backend health...</p> : null}

      {error ? (
        <div className="status error">
          <strong>Health request failed.</strong>
          <p>{error}</p>
        </div>
      ) : null}

      {health ? (
        <div className="status success">
          <strong>Backend reachable.</strong>
          <p>Status: {health.status}</p>
          <p>PostgreSQL: {health.services.postgres}</p>
          <p>Redis: {health.services.redis}</p>
          <p>Reserved namespaces: {health.namespaces.join(', ')}</p>
        </div>
      ) : null}
    </section>
  );
}
