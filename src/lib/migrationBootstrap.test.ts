import { describe, test, expect, vi, beforeEach } from 'bun:test';
import type { MigrationResult } from './migrationUtility';

// Set env vars before any module imports to prevent requireEnv from throwing
if (typeof process !== 'undefined') {
    process.env.VITE_SUPABASE_URL = 'http://localhost:54321';
    process.env.VITE_SUPABASE_ANON_KEY = 'test-anon-key';
}

const mockGetUser = vi.fn();
const mockRunLocalStorageMigration = vi.fn();

vi.mock('./supabaseClient', () => ({
    supabase: {
        auth: {
            getUser: mockGetUser,
        },
    },
}));

vi.mock('./migrationUtility', () => ({
    runLocalStorageMigration: mockRunLocalStorageMigration,
}));

const { ensureMigrated } = await import('./migrationBootstrap');

describe('ensureMigrated', () => {
    beforeEach(() => {
        mockGetUser.mockReset();
        mockRunLocalStorageMigration.mockReset();
        if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.clear();
        }
    });

    test('coalesces concurrent migrations for the same user', async () => {
        const user = { id: 'user-1' };
        mockGetUser.mockResolvedValue({ data: { user } });

        let resolveMigration: (value: MigrationResult | null) => void;
        const migrationPromise = new Promise<MigrationResult | null>((resolve) => {
            resolveMigration = resolve;
        });
        mockRunLocalStorageMigration.mockReturnValue(migrationPromise);

        const first = ensureMigrated();
        const second = ensureMigrated();

        // Wait for microtasks so both ensureMigrated calls reach runLocalStorageMigration
        await Promise.resolve();

        expect(mockRunLocalStorageMigration).toHaveBeenCalledTimes(1);
        expect(mockRunLocalStorageMigration).toHaveBeenCalledWith('user-1');

        resolveMigration!({
            status: 'success',
            problemsTotal: 1,
            problemsMigrated: 1,
            historyTotal: 1,
            historyMigrated: 1,
            errors: [],
        });

        const [firstResult, secondResult] = await Promise.all([first, second]);
        expect(firstResult).toBe(secondResult);
        expect(firstResult?.status).toBe('success');
    });
});
