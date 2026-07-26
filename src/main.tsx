import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { useVisitStore } from './store/useVisitStore'
import './styles/index.css'

// 개발 편의: 콘솔/테스트에서 상태 확인용
if (import.meta.env.DEV) {
  ;(window as unknown as { __visitStore: typeof useVisitStore }).__visitStore = useVisitStore
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
