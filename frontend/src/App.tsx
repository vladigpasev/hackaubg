import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthHomeRedirect } from './auth/AuthHomeRedirect'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { PublicOnlyRoute } from './auth/PublicOnlyRoute'
import { LoginPage } from './pages/LoginPage'
import { NursePage } from './pages/NursePage'
import { PublicPatientDetailsPage } from './pages/PublicPatientDetailsPage'
import { PublicPatientLookupPage } from './pages/PublicPatientLookupPage'
import { RegistryPage } from './pages/RegistryPage'
import { WorkspacePage } from './pages/WorkspacePage'

function App() {
  return (
    <Routes>
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      <Route path="/" element={<AuthHomeRedirect />} />
      <Route path="/public/patient" element={<PublicPatientLookupPage />} />
      <Route path="/public/patient/:phoneNumber" element={<PublicPatientDetailsPage />} />

      <Route element={<ProtectedRoute allowedRoles={['registry']} />}>
        <Route path="/registry" element={<RegistryPage />} />
      </Route>

      <Route element={<ProtectedRoute allowedRoles={['nurse']} />}>
        <Route path="/nurse" element={<NursePage />} />
      </Route>

      <Route element={<ProtectedRoute allowedRoles={['doctor']} />}>
        <Route path="/doctor" element={<WorkspacePage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
