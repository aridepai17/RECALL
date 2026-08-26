import { type Grade, type HistoryEntry, type Problem, type ScheduleResult, todayISO } from './srs';
import { supabase } from './supabaseClient';
import type { Database } from './database.types';

export const PATTERNS = [
    'Arrays & Hashing',
    'Two Pointers',
    'Sliding Window',
    'Stack',
    'Binary Search',
    'Linked List',
    'Trees',
    'Tries',
    'Heap / Priority Queue',
    'Backtracking',
    'Graphs',
    'Dynamic Programming',
    'Greedy',
    'Intervals',
    'Bit Manipulation',
    'Math & Geometry',
] as const;

type ProblemPattern = Database['public']['Enums']['problem_pattern'];
type ProblemRow = Database['public']['Tables']['problems']['Row'];
type ProblemInsertPayload = Database['public']['Tables']['problems']['Insert'];
type ProblemUpdatePayload = Database['public']['Tables']['problems']['Update'];
type HistoryRow = Database['public']['Tables']['problem_history']['Row'];
type HistoryInsertPayload = Database['public']['Tables']['problem_history']['Insert'];

const VALID_PATTERNS = new Set<string>(PATTERNS);
function isValidPattern(value: string): value is ProblemPattern {
    return VALID_PATTERNS.has(value);
}

function toGrade(value: number): Grade {
    if (value === 0 || value === 1 || value === 2 || value === 3) return value;
    throw new Error(`recalldata: unexpected grade value from database: ${value}`);
}

function rowToProblem(row: ProblemRow): Problem {
    return {
        id: row.id,
        name: row.name,
        pattern: row.pattern,
        url: row.url,
        due_date: row.due_date,
        interval_days: row.interval_days,
        ease_factor: row.ease_factor,
        reps: row.reps,
        lapses: row.lapses,
        archived: row.archived,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

function rowToHistoryEntry(row: HistoryRow): HistoryEntry {
    return {
        id: row.id,
        problem_id: row.problem_id,
        grade: toGrade(row.grade),
        interval_days: row.interval_days,
        ease_factor: row.ease_factor,
        reviewed_on: row.reviewed_on,
        created_at: row.created_at,
    };
}

async function fetchProblems(): Promise<Problem[]> {
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
        throw new Error('fetchProblems: user not authenticated');
    }

    const { data, error } = await supabase
        .from('problems')
        .select()
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

    if (error) {
        throw new Error(`problemsQuery: failed to load problems: ${error.message}`);
    }
    return (data ?? []).map(rowToProblem);
}

async function fetchHistory(): Promise<HistoryEntry[]> {
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
        throw new Error('fetchHistory: user not authenticated');
    }

    const { data, error } = await supabase
        .from('problem_history')
        .select('*,problems!inner(user_id)')
        .eq('problems.user_id', user.id)
        .order('created_at', { ascending: true });

    if (error) {
        throw new Error(`historyQuery: failed to load review history: ${error.message}`);
    }
    return (data ?? []).map(rowToHistoryEntry);
}

export const problemsQuery = {
    queryKey: ['problems'] as const,
    queryFn: fetchProblems,
};

export async function loadProblems(): Promise<Problem[]> {
    return fetchProblems();
}

export const historyQuery = {
    queryKey: ['problem_history'] as const,
    queryFn: fetchHistory,
};

export async function addProblem(input: {
    name: string;
    pattern: string;
    url?: string | null;
}): Promise<Problem> {
    const trimmedName = input.name.trim();
    if (trimmedName.length === 0) {
        throw new Error('addProblem: name cannot be empty or whitespace-only.');
    }

    if (!isValidPattern(input.pattern)) {
        throw new Error(`addProblem: "${input.pattern}" is not a recognized pattern.`);
    }

    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
        throw new Error('addProblem: user not authenticated');
    }

    const now = new Date().toISOString();
    const insert: ProblemInsertPayload = {
        id: crypto.randomUUID(),
        user_id: user.id,
        name: trimmedName,
        pattern: input.pattern,
        url: input.url?.trim() ? input.url.trim() : null,
        due_date: todayISO(),
        interval_days: 0,
        ease_factor: 2.5,
        reps: 0,
        lapses: 0,
        archived: false,
        created_at: now,
        updated_at: now,
    };

    const { data, error } = await supabase.from('problems').insert(insert).select().single();

    if (error) {
        throw new Error(`addProblem: insert failed: ${error.message}`);
    }
    if (!data) {
        throw new Error('addProblem: insert returned no data.');
    }

    return rowToProblem(data);
}

export async function commitReview(
    problem: Problem,
    grade: Grade,
    next: ScheduleResult,
    reviewedOn: string,
): Promise<void> {
    const update: ProblemUpdatePayload = {
        interval_days: next.interval_days,
        ease_factor: next.ease_factor,
        reps: next.reps,
        lapses: next.lapses,
        due_date: next.due_date,
        archived: next.archived,
    };

    const { data: updatedRows, error: updateError } = await supabase
        .from('problems')
        .update(update)
        .eq('id', problem.id)
        .eq('updated_at', problem.updated_at)
        .select();

    if (updateError) {
        throw new Error(
            `commitReview: failed to update problem ${problem.id}: ${updateError.message}`,
        );
    }
    if (!updatedRows || updatedRows.length === 0) {
        throw new Error(
            `stale_write: problem ${problem.id} was modified elsewhere since it was loaded.`,
        );
    }

    // Capture the updated_at from the successful forward update for rollback guard
    const forwardUpdatedAt = updatedRows[0]!.updated_at;

    const entry: HistoryInsertPayload = {
        id: crypto.randomUUID(),
        problem_id: problem.id,
        grade,
        interval_days: next.interval_days,
        ease_factor: next.ease_factor,
        reviewed_on: reviewedOn,
        created_at: new Date().toISOString(),
    };

    const { error: historyError } = await supabase.from('problem_history').insert(entry);

    if (historyError) {
        const { error: revertError } = await supabase
            .from('problems')
            .update({
                interval_days: problem.interval_days,
                ease_factor: problem.ease_factor,
                reps: problem.reps,
                lapses: problem.lapses,
                due_date: problem.due_date,
                archived: problem.archived,
            })
            .eq('id', problem.id)
            .eq('updated_at', forwardUpdatedAt);

        if (revertError) {
            console.error(
                `commitReview: history insert failed for problem ${problem.id}, AND the compensating revert also failed. The problem row may now be out of sync with its history log.`,
                revertError,
            );
        }

        throw new Error(
            `commitReview: failed to record history for problem ${problem.id}: ${historyError.message}`,
        );
    }
}
