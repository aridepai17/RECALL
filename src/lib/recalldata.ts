import { z } from 'zod';
import { type Grade, type HistoryEntry, type Problem, type ScheduleResult, todayISO } from './srs';

const PROBLEMS_KEY = 'recall:problems';
const HISTORY_KEY = 'recall:history';

const isBrowser = typeof window !== 'undefined';

const ProblemSchema = z.object({
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

const HistoryEntrySchema = z.object({
    id: z.string(),
    problem_id: z.string(),
    grade: z.number(),
    interval_days: z.number(),
    ease_factor: z.number(),
    reviewed_on: z.string(),
    created_at: z.string(),
});

function readList<T>(key: string, schema: z.ZodType<T>): T[] {
    if (!isBrowser) return [];
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) throw new Error('not an array');
        return parsed.map((row) => schema.parse(row));
    } catch {
        window.localStorage.removeItem(key);
        return [];
    }
}

function writeList<T>(key: string, list: T[]): void {
    if (!isBrowser) return;
    window.localStorage.setItem(key, JSON.stringify(list));
}

function newId(): string {
    return isBrowser && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const problemsQuery = {
    queryKey: ['problems'] as const,
    queryFn: async (): Promise<Problem[]> => readList(PROBLEMS_KEY, ProblemSchema),
};

export async function loadProblems(): Promise<Problem[]> {
    return readList(PROBLEMS_KEY, ProblemSchema);
}

export const historyQuery = {
    queryKey: ['problem_history'] as const,
    queryFn: async (): Promise<HistoryEntry[]> => readList(HISTORY_KEY, HistoryEntrySchema),
};

export async function commitReview(
    problem: Pick<Problem, 'id'>,
    grade: Grade,
    next: ScheduleResult,
    reviewedOn: string,
): Promise<void> {
    const problems = readList(PROBLEMS_KEY, ProblemSchema);
    const idx = problems.findIndex((p) => p.id === problem.id);
    if (idx === -1) throw new Error(`commitReview: problem ${problem.id} not found`);

    const history = readList(HISTORY_KEY, HistoryEntrySchema);

    const updatedHistory = [
        ...history,
        {
            id: newId(),
            problem_id: problem.id,
            grade,
            interval_days: next.interval_days,
            ease_factor: next.ease_factor,
            reviewed_on: reviewedOn,
            created_at: new Date().toISOString(),
        },
    ];

    const updatedProblems = [...problems];
    updatedProblems[idx] = {
        ...updatedProblems[idx]!,
        interval_days: next.interval_days,
        ease_factor: next.ease_factor,
        reps: next.reps,
        lapses: next.lapses,
        due_date: next.due_date,
        archived: next.archived,
        updated_at: new Date().toISOString(),
    };

    const previousHistory = window.localStorage.getItem(HISTORY_KEY);

    try {
        writeList(HISTORY_KEY, updatedHistory);
        writeList(PROBLEMS_KEY, updatedProblems);
    } catch (error) {
        if (previousHistory === null) {
            window.localStorage.removeItem(HISTORY_KEY);
        } else {
            window.localStorage.setItem(HISTORY_KEY, previousHistory);
        }

        throw error;
    }
}

export async function addProblem(input: {
    name: string;
    pattern: string;
    url?: string | null;
}): Promise<Problem> {
    const now = new Date().toISOString();
    const problem: Problem = {
        id: newId(),
        name: input.name.trim(),
        pattern: input.pattern.trim(),
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
    const problems = readList(PROBLEMS_KEY, ProblemSchema);
    problems.push(problem);
    writeList(PROBLEMS_KEY, problems);
    return problem;
}

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
