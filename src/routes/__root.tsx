/* eslint-disable react-refresh/only-export-components */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Outlet, createRootRouteWithContext, HeadContent, Scripts } from '@tanstack/react-router';
import { type ReactNode } from 'react';

import { Navbar, NotFoundComponent, ErrorComponent } from '@/components';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
    head: () => ({
        meta: [
            { charSet: 'utf-8' },
            { name: 'viewport', content: 'width=device-width, initial-scale=1' },
            { title: 'Recall - Spaced Repetition for DSA' },
            {
                name: 'description',
                content:
                    'One problem. Right now. A ruthless spaced repetition system for mastering DSA patterns.',
            },
            { property: 'og:title', content: 'Recall - Spaced Repetition for DSA' },
            {
                property: 'og:description',
                content:
                    'One problem. Right now. A ruthless spaced repetition system for mastering DSA patterns.',
            },
            { property: 'og:type', content: 'website' },
            { name: 'twitter:card', content: 'summary_large_image' },
        ],
        links: [
            { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
            {
                rel: 'preconnect',
                href: 'https://fonts.gstatic.com',
                crossOrigin: 'anonymous',
            },
            {
                rel: 'stylesheet',
                href: 'https://fonts.googleapis.com/css2?family=Geist:wght@300..900&family=Geist+Mono:wght@400..600&display=swap',
            },
            { rel: 'icon', href: '/favicon.svg?v=1', type: 'image/svg+xml', sizes: 'any' },
        ],
    }),

    shellComponent: RootShell,
    component: RootComponent,
    notFoundComponent: NotFoundComponent,
    errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
    return (
        <>
            <HeadContent />
            {children}
            <Scripts />
        </>
    );
}

function RootComponent() {
    const { queryClient } = Route.useRouteContext();

    return (
        <QueryClientProvider client={queryClient}>
            <Navbar />
            <Outlet />
        </QueryClientProvider>
    );
}
