import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider as JotaiProvider } from 'jotai'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { AuthProvider } from './auth/AuthProvider.tsx'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <JotaiProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </JotaiProvider>
    </BrowserRouter>
  </StrictMode>,
)
