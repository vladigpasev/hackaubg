const defaultApiUrl = 'http://localhost:3000/api/v1';
const runtimeApiUrl =
  typeof import.meta.env.VITE_API_URL === 'string'
    ? import.meta.env.VITE_API_URL
    : undefined;

export const env = {
  apiUrl: runtimeApiUrl || defaultApiUrl,
};
