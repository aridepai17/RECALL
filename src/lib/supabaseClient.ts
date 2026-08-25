import { createClient, type SupabaseClient } from '@supabase/supabase-js';
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
