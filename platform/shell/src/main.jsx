import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../shared/ui/theme.css';
import '../../../shared/ui/notifications.css';
import './styles.css';
import App from './App.jsx';
import { NotificationProvider } from '../../../shared/ui/NotificationProvider.jsx';
import { bootstrapSearch } from './search/searchBootstrap.js';


bootstrapSearch();


if ('scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual';
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <NotificationProvider>
      <App />
    </NotificationProvider>
  </React.StrictMode>
);
