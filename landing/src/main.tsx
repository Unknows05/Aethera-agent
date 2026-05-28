import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import HivemindDashboard from './HivemindDashboard.tsx'

const router = createBrowserRouter([
  { path: '/', element: <App /> },
  { path: '/hivemind', element: <HivemindDashboard /> },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
