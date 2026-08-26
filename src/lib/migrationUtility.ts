/**
 * One-time client-side migration: reads the legacy localStorage-backed
 * Problem/HistoryEntry records and loads them into Supabase.
 *
 * @example
 * // from a scratch script or the browser console, against a running
 * // local Supabase instance:
 * import { runLocalStorageMigration } from '@/lib/migrationUtility';
 * const result = await runLocalStorageMigration();
 * console.log(result);
 */

import { z } from 'zod';
import { supabase } from './supabaseClient';
import { PATTERNS } from './recalldata';
import { EASE_MIN, EASE_MAX, GRADES } from './srs';
import type { Database } from './database.types';

const PROBLEMS_KEY = 'recall:problems';
const HISTORY_KEY = 'recall:history';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHUNK_SIZE = 500;

const LegacyProblemSchema = z.object({
    id: z.string(),
    name: z.string(),
    pattern: z.string(),
    url: z.string().nullable(),
    due_date: z.string(),
    interval_days: z.number(),
    ease_factor: z.number(),
    reps: z.number(),
    lapses: z.number(),
    archived: z.boolean(),
    created_at: z.string(),
    updated_at: z.string(),
});
type LegacyProblem = z.infer<typeof LegacyProblemSchema>;

const LegacyHistoryEntrySchema = z.object({
    id: z.string(),
    problem_id: z.string(),
    grade: z.number(),
    interval_days: z.number(),
    ease_factor: z.number(),
    reviewed_on: z.string(),
    created_at: z.string(),
});
type LegacyHistoryEntry = z.infer<typeof LegacyHistoryEntrySchema>;

type ProblemPattern = Database['public']['Enums']['problem_pattern'];
type ProblemInsert = Database['public']['Tables']['problems']['Insert'];
type HistoryInsert = Database['public']['Tables']['problem_history']['Insert'];

interface ResolvedProblemInsert extends Omit<ProblemInsert, 'id'> {
    id: string;
}
interface ResolvedHistoryInsert extends Omit<HistoryInsert, 'id' | 'problem_id'> {
    id: string;
    problem_id: string;
}
interface ResolvedProblem {
    legacyId: string;
    insert: ResolvedProblemInsert;
}

const VALID_PATTERNS = new Set<string>(PATTERNS);
function isValidPattern(value: string): value is ProblemPattern {
    return VALID_PATTERNS.has(value);
}

const VALID_GRADES = new Set<number>(GRADES);

export type MigrationStage = 'extraction' | 'problems_upsert' | 'history_upsert';

export interface MigrationError {
    stage: MigrationStage;
    recordId?: string;
    message: string;
    cause?: unknown;
}

export interface MigrationResult {
    status: 'success' | 'partial' | 'empty' | 'failed';
    problemsTotal: number;
    problemsMigrated: number;
    historyTotal: number;
    historyMigrated: number;
    errors: MigrationError[];
}

function safeRecordId(row: unknown, fallback: string): string {
    if (
        row &&
        typeof row === 'object' &&
        'id' in row &&
        typeof (row as { id: unknown }).id === 'string'
    ) {
        return (row as { id: string }).id;
    }
    return fallback;
}

function chunk<T>(items: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        out.push(items.slice(i, i + size));
    }
    return out;
}

function readLegacyList<T>(key: string, schema: z.ZodType<T>, errors: MigrationError[]): T[] {
    if (typeof window === 'undefined') return [];
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];

    try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            errors.push({ stage: 'extraction', message: `${key}: stored value is not an array.` });
            return [];
        }

        const out: T[] = [];
        parsed.forEach((row, index) => {
            const result = schema.safeParse(row);
            if (result.success) {
                out.push(result.data);
            } else {
                errors.push({
                    stage: 'extraction',
                    recordId: safeRecordId(row, `${key}[${index}]`),
                    message: `${key}[${index}] failed schema validation.`,
                    cause: result.error.flatten(),
                });
            }
        });
        return out;
    } catch (cause) {
        errors.push({
            stage: 'extraction',
            message: `${key}: JSON.parse failed - localStorage value is not valid JSON.`,
            cause,
        });
        return [];
    }
}

function toProblemInsert(legacy: LegacyProblem, errors: MigrationError[]): ResolvedProblem | null {
    if (!isValidPattern(legacy.pattern)) {
        errors.push({
            stage: 'problems_upsert',
            recordId: legacy.id,
            message: `Unrecognized pattern "${legacy.pattern}" - not one of the 16 canonical patterns. Skipped; its history rows will be skipped too.`,
        });
        return null;
    }

    const resolvedId = UUID_RE.test(legacy.id) ? legacy.id : crypto.randomUUID();

    return {
        legacyId: legacy.id,
        insert: {
            id: resolvedId,
            name: legacy.name.trim(),
            pattern: legacy.pattern,
            url: legacy.url,
            due_date: legacy.due_date,
            interval_days: Math.max(0, Math.min(365, Math.trunc(legacy.interval_days))),
            ease_factor: Number.isFinite(legacy.ease_factor)
                ? Math.min(EASE_MAX, Math.max(EASE_MIN, legacy.ease_factor))
                : 2.5,
            reps: Math.max(0, Math.trunc(legacy.reps)),
            lapses: Math.max(0, Math.trunc(legacy.lapses)),
            archived: legacy.archived,
            created_at: legacy.created_at,
            updated_at: legacy.updated_at,
        },
    };
}

function toHistoryInsert(
    legacy: LegacyHistoryEntry,
    idRemap: ReadonlyMap<string, string>,
    migratedProblemIds: ReadonlySet<string>,
    errors: MigrationError[],
): ResolvedHistoryInsert | null {
    const resolvedProblemId = idRemap.get(legacy.problem_id) ?? legacy.problem_id;

    if (!migratedProblemIds.has(resolvedProblemId)) {
        errors.push({
            stage: 'history_upsert',
            recordId: legacy.id,
            message: `History entry references problem_id "${legacy.problem_id}", which was never successfully migrated. Skipped to avoid a foreign-key violation.`,
        });
        return null;
    }

    if (!VALID_GRADES.has(legacy.grade)) {
        errors.push({
            stage: 'history_upsert',
            recordId: legacy.id,
            message: `Grade ${legacy.grade} is outside the valid 0-3 range. Skipped.`,
        });
        return null;
    }

    return {
        id: UUID_RE.test(legacy.id) ? legacy.id : crypto.randomUUID(),
        problem_id: resolvedProblemId,
        grade: legacy.grade,
        interval_days: Math.max(0, Math.min(365, Math.trunc(legacy.interval_days))),
        ease_factor: Number.isFinite(legacy.ease_factor)
            ? Math.min(EASE_MAX, Math.max(EASE_MIN, legacy.ease_factor))
            : 2.5,
        reviewed_on: legacy.reviewed_on,
        created_at: legacy.created_at,
    };
}

async function upsertProblemsChunked(
    rows: ResolvedProblemInsert[],
    errors: MigrationError[],
): Promise<Set<string>> {
    for (const batch of chunk(rows, CHUNK_SIZE)) {
        try {
            const { error } = await supabase
                .from('problems')
                .upsert(batch, { onConflict: 'id', ignoreDuplicates: true });
            if (error) {
                errors.push({
                    stage: 'problems_upsert',
                    message: `Batch of ${batch.length} problems failed: ${error.message}`,
                    cause: error,
                });
            }
        } catch (cause) {
            errors.push({
                stage: 'problems_upsert',
                message: `Batch of ${batch.length} problems threw unexpectedly.`,
                cause,
            });
        }
    }

    const verified = new Set<string>();
    for (const batch of chunk(rows, CHUNK_SIZE)) {
        try {
            const { data, error } = await supabase
                .from('problems')
                .select('id')
                .in(
                    'id',
                    batch.map((r) => r.id),
                );
            if (error) {
                errors.push({
                    stage: 'problems_upsert',
                    message: `Verification SELECT for ${batch.length} problems failed: ${error.message}`,
                    cause: error,
                });
                continue;
            }
            for (const row of data ?? []) verified.add(row.id);
        } catch (cause) {
            errors.push({
                stage: 'problems_upsert',
                message: `Verification SELECT for ${batch.length} problems threw unexpectedly.`,
                cause,
            });
        }
    }
    return verified;
}

async function upsertHistoryChunked(
    rows: ResolvedHistoryInsert[],
    errors: MigrationError[],
): Promise<number> {
    let migrated = 0;
    for (const batch of chunk(rows, CHUNK_SIZE)) {
        try {
            const { error } = await supabase
                .from('problem_history')
                .upsert(batch, { onConflict: 'id', ignoreDuplicates: true });
            if (error) {
                errors.push({
                    stage: 'history_upsert',
                    message: `Batch of ${batch.length} history rows failed: ${error.message}`,
                    cause: error,
                });
                continue;
            }
        } catch (cause) {
            errors.push({
                stage: 'history_upsert',
                message: `Batch of ${batch.length} history rows threw unexpectedly.`,
                cause,
            });
            continue;
        }

        try {
            const { data, error } = await supabase
                .from('problem_history')
                .select('id')
                .in(
                    'id',
                    batch.map((r) => r.id),
                );
            if (error) {
                errors.push({
                    stage: 'history_upsert',
                    message: `Verification SELECT for ${batch.length} history rows failed: ${error.message}`,
                    cause: error,
                });
                continue;
            }
            migrated += data?.length ?? 0;
        } catch (cause) {
            errors.push({
                stage: 'history_upsert',
                message: `Verification SELECT for ${batch.length} history rows threw unexpectedly.`,
                cause,
            });
        }
    }
    return migrated;
}

export async function runLocalStorageMigration(): Promise<MigrationResult> {
    const errors: MigrationError[] = [];

    const legacyProblems = readLegacyList(PROBLEMS_KEY, LegacyProblemSchema, errors);
    const legacyHistory = readLegacyList(HISTORY_KEY, LegacyHistoryEntrySchema, errors);

    if (legacyProblems.length === 0 && legacyHistory.length === 0) {
        return {
            status: 'empty',
            problemsTotal: 0,
            problemsMigrated: 0,
            historyTotal: 0,
            historyMigrated: 0,
            errors,
        };
    }

    const resolved = legacyProblems
        .map((legacy) => toProblemInsert(legacy, errors))
        .filter((r): r is ResolvedProblem => r !== null);

    const idRemap = new Map<string, string>();
    for (const { legacyId, insert } of resolved) {
        if (insert.id !== legacyId) idRemap.set(legacyId, insert.id);
    }
    const resolvedProblems = resolved.map((r) => r.insert);

    const migratedProblemIds = await upsertProblemsChunked(resolvedProblems, errors);

    const resolvedHistory = legacyHistory
        .map((legacy) => toHistoryInsert(legacy, idRemap, migratedProblemIds, errors))
        .filter((r): r is ResolvedHistoryInsert => r !== null);

    const historyMigrated = await upsertHistoryChunked(resolvedHistory, errors);

    const problemsMigrated = migratedProblemIds.size;
    const status: MigrationResult['status'] =
        errors.length === 0
            ? 'success'
            : problemsMigrated > 0 || historyMigrated > 0
              ? 'partial'
              : 'failed';

    return {
        status,
        problemsTotal: legacyProblems.length,
        problemsMigrated,
        historyTotal: legacyHistory.length,
        historyMigrated,
        errors,
    };
}
