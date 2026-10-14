import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import LandingPage from './components/LandingPage.tsx'
import MapPage from './components/MapPage.tsx'
import AdminPage from './components/AdminPage.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        {/* /: Official Landing Page (Split Portal on Desktop, Regular Login on Mobile) */}
        <Route path="/" element={<LandingPage />} />

        {/* /map: Official interactive floor plan with Unified Left Sidebar */}
        <Route path="/map" element={<MapPage />} />

        {/* /prototype/map: Backwards-compatible redirect to official /map */}
        <Route path="/prototype/map" element={<Navigate to="/map" replace />} />

        {/* /staff: Official staff console (room & schedule management) */}
        <Route path="/staff" element={<AdminPage />} />

        {/* /admin: Backwards-compatible redirect to /staff */}
        <Route path="/admin" element={<Navigate to="/staff" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
