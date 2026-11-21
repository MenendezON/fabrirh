import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { logError } from "@/lib/log";
import { isSessionError, notifySessionExpired } from "@/lib/session-expiry";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // One client per request: a module-level QueryClient leaks cached data between SSR requests.
  const queryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (e, q) => {
        logError(`requête ${String(q.queryKey[0])}`, e);
        if (isSessionError(e)) notifySessionExpired();
      },
    }),
    mutationCache: new MutationCache({
      onError: (e) => {
        logError("mutation", e);
        if (isSessionError(e)) notifySessionExpired();
      },
    }),
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Lets Query own freshness; set caching defaults on the QueryClient, not the router.
    defaultPreloadStaleTime: 0,
  });

  return router;
};
