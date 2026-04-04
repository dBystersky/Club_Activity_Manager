import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { PlannerApp } from './App'
import { LoginPage } from './LoginPage'
import { PublicCalendarPage } from './PublicCalendarPage'

export default function Root() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PublicCalendarPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/app" element={<PlannerApp />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
