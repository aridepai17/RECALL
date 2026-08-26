import { runLocalStorageMigration, type MigrationResult } from './migrationUtility';
import type { QueryClient } from '@tanstack/react-query';

const MIGRATION_MARKER_KEY = 'recall:migration-status';
type MigrationMarker = 'success' | 'empty';

function readMarker(): MigrationMarker | null {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(MIGRATION_MARKER_KEY);
    return raw === 'success' || raw === 'empty' ? raw : null;
}

function writeMarker(value: MigrationMarker): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(MIGRATION_MARKER_KEY, value);
    } catch (cause) {
        console.error('[migrationBootstrap] Failed to write migration marker', cause);
    }
}

export async function ensureMigrated(queryClient?: QueryClient): Promise<MigrationResult | null> {
    if (readMarker() !== null) return null;

    try {
        const result = await runLocalStorageMigration();
        if (result.status === 'success' || result.status === 'empty') {
            writeMarker(result.status);

            // Invalidate queries to refresh data after migration
            if (queryClient) {
                queryClient.invalidateQueries({ queryKey: ['problems'] });
                queryClient.invalidateQueries({ queryKey: ['problem_history'] });
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
