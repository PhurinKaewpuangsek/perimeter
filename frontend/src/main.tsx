import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import LandingPage from './components/LandingPage.tsx'
import MapPage from './components/MapPage.tsx'
import AdminPage from './components/AdminPage.tsx'
import AdminManagementPage from './components/AdminManagementPage.tsx'
import LoginPage from './components/LoginPage.tsx'
import RouteGuard from './components/RouteGuard.tsx'
import { PinsProvider } from './context/PinsProvider.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <PinsProvider>
        <Routes>
        {/* /: Official Landing Page (Split Portal on Desktop, Regular Login on Mobile) */}
        <Route path="/" element={<LandingPage />} />

        {/* /login: Unified sign-in route with first-login challenge */}
        <Route path="/login" element={<LoginPage />} />

        {/* /map: Official interactive floor plan with Unified Left Sidebar */}
        <Route path="/map" element={<MapPage />} />

        {/* /staff: Official staff console (room & schedule management) */}
        <Route
          path="/staff"
          element={
            <RouteGuard allowedRoles={['staff', 'admin']}>
              <AdminPage />
            </RouteGuard>
          }
        />

        {/* /admin: Official dedicated admin console (user & role management + admin actions) */}
        <Route
          path="/admin"
          element={
            <RouteGuard allowedRoles={['admin']}>
              <AdminManagementPage />
            </RouteGuard>
          }
        />
      </Routes>
      </PinsProvider>
    </BrowserRouter>
  </StrictMode>,
)
