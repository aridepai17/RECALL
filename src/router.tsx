import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { QueryClient } from '@tanstack/react-query';
import { routeTree } from './routeTree.gen';

let routerInstance: ReturnType<typeof createRouter> | null = null;

export function createRouter() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: 1000 * 60 * 5,
                refetchOnWindowFocus: false,
            },
        },
    });

    return createTanStackRouter({
        routeTree,
        context: { queryClient },
        defaultPreload: 'intent',
        scrollRestoration: true,
    });
}

export function getRouter() {
    if (!routerInstance) {
        routerInstance = createRouter();
    }
    return routerInstance;
}

declare module '@tanstack/react-router' {
    interface Register {
        router: ReturnType<typeof createRouter>;
    }
}
