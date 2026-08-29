import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { QueryClient } from '@tanstack/react-query';
import type { Database } from './database.types';

function requireEnv(value: string | undefined, name: string): string {
    if (!value || value.trim().length === 0) {
        throw new Error(
            `[supabaseClient] Missing required environment variable: ${name}. ` +
                `Copy .env.example to .env.local, run \`bunx supabase status\`, ` +
                `and paste the local API URL / anon key in.`,
        );
    }
    return value;
}

const supabaseUrl = requireEnv(import.meta.env.VITE_SUPABASE_URL, 'VITE_SUPABASE_URL');
const supabaseAnonKey = requireEnv(
    import.meta.env.VITE_SUPABASE_ANON_KEY,
    'VITE_SUPABASE_ANON_KEY',
);

export const supabase: SupabaseClient<Database> = createClient<Database>(
    supabaseUrl,
    supabaseAnonKey,
);

let authStateListener: { data: { subscription: { unsubscribe: () => void } } } | null = null;

export function setupAuthStateChangeHandler(
    queryClient: QueryClient,
    onSignIn?: (queryClient: QueryClient) => void,
) {
    if (authStateListener) {
        authStateListener.data.subscription.unsubscribe();
    }

    authStateListener = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
            // Set currentUser query data to session.user.id or null
            queryClient.setQueryData(['currentUser'], session?.user.id ?? null);
            // Remove user-scoped queries instead of invalidating them
            queryClient.removeQueries({ queryKey: ['problems'] });
            queryClient.removeQueries({ queryKey: ['problem_history'] });
        }

        if (event === 'SIGNED_IN' && session?.user) {
            setTimeout(() => onSignIn?.(queryClient), 0);
        }
    });
}
