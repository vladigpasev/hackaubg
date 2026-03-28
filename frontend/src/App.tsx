import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { PublicOnlyRoute } from './auth/PublicOnlyRoute'
import { PatientEventBridge } from './features/receptionist/realtime/PatientEventBridge'
import { LoginPage } from './pages/LoginPage'
import { ReceptionistPage } from './pages/ReceptionistPage'

function App() {
  return (
    <>
      <PatientEventBridge />

      <Routes>
        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<LoginPage />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<ReceptionistPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}

export default App
