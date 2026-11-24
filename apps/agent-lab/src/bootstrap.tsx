import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { LabSessionGate } from './main';

// This console is served at its hostname root; recover malformed pasted links.
if (window.location.pathname !== '/') {
  window.history.replaceState(null, '', `/${window.location.search}${window.location.hash}`);
}

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient()}><LabSessionGate/></QueryClientProvider>,
);
