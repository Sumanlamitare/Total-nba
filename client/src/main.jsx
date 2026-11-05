import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(<App />);
requestAnimationFrame(() => { const b = document.getElementById('boot'); if (b) { b.classList.add('done'); setTimeout(() => b.remove(), 400); } });
