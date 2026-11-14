import '@fontsource/geist-pixel/400.css'
import '@fontsource/geist-mono/400.css'
import './assets/main.css'

import { createRoot } from 'react-dom/client'
import App from './App'

// Bez StrictMode: silnik trzyma kontekst WebGL i nie powinien startować dwa razy.
createRoot(document.getElementById('root')!).render(<App />)
