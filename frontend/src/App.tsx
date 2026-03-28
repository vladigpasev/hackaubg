import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthHomeRedirect } from './auth/AuthHomeRedirect'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { PublicOnlyRoute } from './auth/PublicOnlyRoute'
import { PatientEventBridge } from './features/receptionist/realtime/PatientEventBridge'
import { LoginPage } from './pages/LoginPage'
import { ReceptionistPage } from './pages/ReceptionistPage'
import { WorkspacePage } from './pages/WorkspacePage'

function App() {
  return (
    <Routes>
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      <Route path="/" element={<AuthHomeRedirect />} />

      <Route element={<ProtectedRoute allowedRoles={['registry']} />}>
        <Route
          path="/registry"
          element={
            <>
              <PatientEventBridge />
              <ReceptionistPage />
            </>
          }
        />
      </Route>

      <Route element={<ProtectedRoute allowedRoles={['nurse']} />}>
        <Route path="/nurse" element={<WorkspacePage />} />
      </Route>

      <Route element={<ProtectedRoute allowedRoles={['doctor']} />}>
        <Route path="/doctor" element={<WorkspacePage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
