import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// StrictMode is intentionally off: React 19 + react-three-fiber double-mounts the canvas root in dev.
createRoot(document.getElementById('root')!).render(<App />)
