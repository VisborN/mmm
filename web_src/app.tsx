import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppMain } from './app_component';

document.addEventListener('DOMContentLoaded', () => {

    const el = document.getElementById('app');
    if (!el) {
        throw new Error(`Container with id 'app' not found.`);
    }
    const root = createRoot(el);
    root.render(<AppMain />);
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.ts.js' )
            .then(reg => console.log('SW registered:', reg))
            .catch(err => console.error('SW registration failed:', err));
    });
}
