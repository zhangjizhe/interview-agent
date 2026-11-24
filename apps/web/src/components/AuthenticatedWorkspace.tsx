import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Private query lifetime: a new authenticated session gets a new cache. */
export function AuthenticatedWorkspace({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: {
    retry: 1, refetchOnWindowFocus: false, staleTime: 30_000,
  } } }));
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // React StrictMode replays effects synchronously. Dispose only a genuinely
      // detached workspace, not the cache that the replay has just reattached.
      queueMicrotask(() => { if (!mounted.current) client.clear(); });
    };
  }, [client]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
