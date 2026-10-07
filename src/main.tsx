import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './app/App'
import { CupAppProvider } from './app/CupAppContext'
import './styles/tokens.css'
import './styles/global.css'

const rootElement = document.getElementById('app')

if (!rootElement) {
  throw new Error("Le point de montage #app est introuvable.")
}

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <CupAppProvider>
        <App />
      </CupAppProvider>
    </BrowserRouter>
  </StrictMode>,
)
