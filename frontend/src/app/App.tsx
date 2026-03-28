import { RouterProvider } from 'react-router-dom';
import { router } from '../routes/router.tsx';

export function App() {
  return <RouterProvider router={router} />;
}
