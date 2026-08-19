import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { isFramed, renderFrameRefusal } from '@/lib/frame-guard';
import '@/styles/globals.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');

if (isFramed()) {
  // Never mount an experience that asks for a camera inside someone else's page.
  renderFrameRefusal(root, window.location.href);
} else {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
