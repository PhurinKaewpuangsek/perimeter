import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import LandingPage from './components/LandingPage.tsx'
import MapPage from './components/MapPage.tsx'
import AdminPage from './components/AdminPage.tsx'
import AdminManagementPage from './components/AdminManagementPage.tsx'
import LoginPage from './components/LoginPage.tsx'
import RouteGuard from './components/RouteGuard.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        {/* /: Official Landing Page (Split Portal on Desktop, Regular Login on Mobile) */}
        <Route path="/" element={<LandingPage />} />

        {/* /login: Unified sign-in route with first-login challenge */}
        <Route path="/login" element={<LoginPage />} />

        {/* /map: Official interactive floor plan with Unified Left Sidebar */}
        <Route path="/map" element={<MapPage />} />

        {/* /prototype/map: Backwards-compatible redirect to official /map */}
        <Route path="/prototype/map" element={<Navigate to="/map" replace />} />

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
    </BrowserRouter>
  </StrictMode>,
)
