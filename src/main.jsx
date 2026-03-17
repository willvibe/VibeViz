import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import './index.css'

const handleReset = () => {
  window.location.reload();
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary onReset={handleReset}>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
