import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.jsx';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import '../../../../shared/ui/theme.css';
import '../../../../shared/ui/notifications.css';
import './styles.css';
import { NotificationProvider } from '../../../../shared/ui/NotificationProvider.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <NotificationProvider>
      <App />
    </NotificationProvider>
  </React.StrictMode>
);
