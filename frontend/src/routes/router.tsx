import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from '../components/AppShell.tsx';
import { AuthSmokePage } from '../pages/AuthSmokePage.tsx';
import { HomePage } from '../pages/HomePage.tsx';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      {
        index: true,
        element: <HomePage />,
      },
      {
        path: 'auth-smoke',
        element: <AuthSmokePage />,
      },
    ],
  },
]);
