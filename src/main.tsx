import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { getRouter } from './router';
import { ensureMigrated } from './lib/migrationBootstrap';
import './styles.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
    throw new Error('Root element not found. Ensure index.html contains a div with id="root"');
}

const router = getRouter();

class ErrorBoundary extends React.Component<
    { children: React.ReactNode },
    { hasError: boolean; error?: Error }
> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('React Error Boundary caught an error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
                    <div className="max-w-md rounded-lg bg-surface p-6 ring-1 ring-border">
                        <h1 className="metric mb-4 text-xl text-destructive">Application Error</h1>
                        <p className="mb-4 text-sm text-muted-foreground">
                            Something went wrong. Please refresh the page or try again later.
                        </p>
                        {import.meta.env.DEV && this.state.error && (
                            <details className="mt-4">
                                <summary className="cursor-pointer text-sm text-muted-foreground">
                                    Error Details
                                </summary>
                                <pre className="mt-2 overflow-auto rounded bg-background p-4 text-xs text-muted-foreground">
                                    {this.state.error.toString()}
                                </pre>
                            </details>
                        )}
                        <button
                            type="button"
                            onClick={() => window.location.reload()}
                            className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                        >
                            Reload Page
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

if (import.meta.env.DEV) {
    if (typeof window !== 'undefined' && '__REACT_DEVTOOLS_GLOBAL_HOOK__' in window) {
        console.info('React DevTools detected');
    }
}

const root = ReactDOM.createRoot(rootElement);

// Render app immediately without blocking on migration
if (import.meta.env.DEV) {
    root.render(
        <React.StrictMode>
            <ErrorBoundary>
                <RouterProvider router={router} />
            </ErrorBoundary>
        </React.StrictMode>,
    );
} else {
    root.render(
        <ErrorBoundary>
            <RouterProvider router={router} />
        </ErrorBoundary>,
    );
}

// Run migration in background without blocking initial render
// Pass queryClient to invalidate cached queries after migration completes
void ensureMigrated(router.options.context.queryClient);
