import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import { ErrorScreen } from './components/ErrorScreen.tsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorScreen>
      <App />
    </ErrorScreen>
  </React.StrictMode>,
);
