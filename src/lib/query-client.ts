import { QueryClient } from '@tanstack/react-query'

/**
 * TanStack Query client — server state management.
 * staleTime 30s = data considered fresh for 30s before refetch.
 * retry 2 = retry failed requests twice.
 * refetchOnWindowFocus = refetch when user returns to the tab.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
      refetchOnWindowFocus: true,
    },
  },
})
