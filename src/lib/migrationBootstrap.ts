import { runLocalStorageMigration, type MigrationResult } from './migrationUtility';
import { supabase } from './supabaseClient';
import type { QueryClient } from '@tanstack/react-query';

const MIGRATION_MARKER_KEY = 'recall:migration-status';
type MigrationMarker = 'success' | 'empty' | 'ownership_mismatch';

function readMarker(userId: string): MigrationMarker | null {
    if (typeof window === 'undefined') return null;
    const key = `${MIGRATION_MARKER_KEY}:${userId}`;
    const raw = window.localStorage.getItem(key);
    return raw === 'success' || raw === 'empty' || raw === 'ownership_mismatch' ? raw : null;
}

function writeMarker(userId: string, value: MigrationMarker): void {
    if (typeof window === 'undefined') return;
    try {
        const key = `${MIGRATION_MARKER_KEY}:${userId}`;
        window.localStorage.setItem(key, value);
    } catch (cause) {
        console.error('[migrationBootstrap] Failed to write migration marker', cause);
    }
}

export async function ensureMigrated(queryClient?: QueryClient): Promise<MigrationResult | null> {
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
        console.info('[migrationBootstrap] Skipping migration - user not authenticated');
        return null;
    }

    const marker = readMarker(user.id);
    if (marker === 'ownership_mismatch') {
        console.info('[migrationBootstrap] Skipping migration due to ownership mismatch marker.');
        return null;
    }
    if (marker !== null) return null;

    try {
        const result = await runLocalStorageMigration();
        if (
            result.status === 'success' ||
            (result.status === 'empty' && result.errors.length === 0)
        ) {
            writeMarker(user.id, result.status);

            // Invalidate queries to refresh data after migration
            if (queryClient) {
                queryClient.invalidateQueries({ queryKey: ['problems'] });
                queryClient.invalidateQueries({ queryKey: ['problem_history'] });
            }
        } else if (result.status === 'partial') {
            // Partial migration succeeded for some records - invalidate cache to show migrated data
            if (queryClient) {
                queryClient.invalidateQueries({ queryKey: ['problems'] });
                queryClient.invalidateQueries({ queryKey: ['problem_history'] });
            }
            console.warn(
                `[migrationBootstrap] Migration finished with partial success - some records migrated, will retry next boot.`,
                result.errors,
            );
        } else if (result.status === 'failed') {
            // Check if this is an ownership mismatch - if so, mark it to prevent repeated attempts
            const isOwnershipMismatch = result.errors.some(
                (error) =>
                    error.message.includes('different user') ||
                    error.message.includes('cross-account'),
            );
            if (isOwnershipMismatch) {
                writeMarker(user.id, 'ownership_mismatch');
                console.warn(
                    '[migrationBootstrap] Migration skipped due to ownership mismatch - localStorage data belongs to a different user.',
                );
            } else {
                console.warn(
                    `[migrationBootstrap] Migration finished with status "${result.status}" - will retry next boot.`,
                    result.errors,
                );
            }
        } else {
            console.warn(
                `[migrationBootstrap] Migration finished with status "${result.status}" - will retry next boot.`,
                result.errors,
            );
        }

        return result;
    } catch (cause) {
        console.error(
            '[migrationBootstrap] Migration threw unexpectedly - app will still boot',
            cause,
        );
        return null;
    }
}
