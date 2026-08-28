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

export async function getCurrentUserId(): Promise<string | null> {
    const {
        data: { user },
    } = await supabase.auth.getUser();
    return user?.id ?? null;
}

type ProblemPattern = Database['public']['Enums']['problem_pattern'];
type ProblemRow = Database['public']['Tables']['problems']['Row'];
type ProblemInsertPayload = Database['public']['Tables']['problems']['Insert'];
type HistoryRow = Database['public']['Tables']['problem_history']['Row'];

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

async function fetchProblems(userId: string): Promise<Problem[]> {
    const { data, error } = await supabase
        .from('problems')
        .select()
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

    if (error) {
        throw new Error(`problemsQuery: failed to load problems: ${error.message}`);
    }
    return (data ?? []).map(rowToProblem);
}

async function fetchHistory(userId: string): Promise<HistoryEntry[]> {
    const { data, error } = await supabase
        .from('problem_history')
        .select('*,problems!inner(user_id)')
        .eq('problems.user_id', userId)
        .order('created_at', { ascending: true });

    if (error) {
        throw new Error(`historyQuery: failed to load review history: ${error.message}`);
    }
    return (data ?? []).map(rowToHistoryEntry);
}

export function problemsQuery(userId: string) {
    return {
        queryKey: ['problems', userId] as const,
        queryFn: () => fetchProblems(userId),
    };
}

export async function loadProblems(): Promise<Problem[]> {
    const userId = await getCurrentUserId();
    if (!userId) return [];
    return fetchProblems(userId);
}

export function historyQuery(userId: string) {
    return {
        queryKey: ['problem_history', userId] as const,
        queryFn: () => fetchHistory(userId),
    };
}

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
    const { error } = await supabase.rpc('commit_review', {
        p_problem_id: problem.id,
        p_interval_days: next.interval_days,
        p_ease_factor: next.ease_factor,
        p_reps: next.reps,
        p_lapses: next.lapses,
        p_due_date: next.due_date,
        p_archived: next.archived,
        p_expected_updated_at: problem.updated_at,
        p_grade: grade,
        p_reviewed_on: reviewedOn,
    });

    if (error) {
        throw new Error(
            `commitReview: failed to commit review for problem ${problem.id}: ${error.message}`,
        );
    }
}
