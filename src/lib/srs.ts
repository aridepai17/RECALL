export const GRADES = [0, 1, 2, 3] as const;
export type Grade = (typeof GRADES)[number];

export const GRADE_LABELS: Record<Grade, string> = {
    0: 'Trench',
    1: 'Grind',
    2: 'Triumph',
    3: 'Archive',
};

export const GRADE_HINTS: Record<Grade, string> = {
    0: 'Lapse - could not recall the approach',
    1: 'Recalled, but slow and effortful',
    2: 'Clean recall, correct approach',
    3: 'Instant, Push far out',
};

export const EASE_MIN = 1.3;
export const EASE_MAX = 3.0;

export const ARCHIVE_THRESHOLD_DAYS = 60;
export const ARCHIVE_RECHECK_DAYS = 180;

export interface Problem {
    id: string;
    name: string;
    pattern: string;
    url: string | null;
    due_date: string; // ISO date (YYYY-MM-DD)
    interval_days: number;
    ease_factor: number;
    reps: number;
    lapses: number;
    archived: boolean;
    updated_at: string;
    created_at: string;
}

export interface ScheduleResult {
    interval_days: number;
    ease_factor: number;
    reps: number;
    lapses: number;
    due_date: string;
    archived: boolean;
}

export interface HistoryEntry {
    id: string;
    problem_id: string;
    grade: number;
    interval_days: number;
    ease_factor: number;
    reviewed_on: string;
    created_at: string;
}

export function clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
    return Math.round(value * 100) / 100;
}

export function parseISODate(iso: string): Date {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (!match) throw new Error(`Invalid ISO date: ${iso}`);
    const [, y, m, d] = match;
    return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
}

export function toISODate(date: Date): string {
    return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
    const base = parseISODate(iso);
    base.setUTCDate(base.getUTCDate() + Math.round(days));
    return toISODate(base);
}

export function daysBetween(aISO: string, bISO: string): number {
    const ms = parseISODate(bISO).getTime() - parseISODate(aISO).getTime();
    return Math.round(ms / 86_400_000);
}

export function todayISO(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export function scheduleNextReview(
    problem: Pick<Problem, 'interval_days' | 'ease_factor' | 'reps' | 'lapses'>,
    grade: Grade,
    today: string,
): ScheduleResult {
    const prevInterval = Math.max(0, Math.trunc(problem.interval_days ?? 0));
    const prevEase = clamp(Number(problem.ease_factor ?? 2.5), EASE_MIN, EASE_MAX);
    const prevReps = Math.max(0, Math.trunc(problem.reps ?? 0));
    const prevLapses = Math.max(0, Math.trunc(problem.lapses ?? 0));

    if (grade === 0) {
        const ease = clamp(prevEase - 0.2, EASE_MIN, EASE_MAX);
        return {
            interval_days: 1,
            ease_factor: round2(ease),
            reps: 0,
            lapses: prevLapses + 1,
            due_date: addDays(today, 1),
            archived: false,
        };
    }

    const easeDelta = grade === 1 ? -0.05 : grade === 2 ? 0.05 : 0.15;
    const ease = clamp(prevEase + easeDelta, EASE_MIN, EASE_MAX);
    const reps = prevReps + 1;

    let interval: number;
    if (reps === 1) {
        interval = 1;
    } else if (reps === 2) {
        interval = grade === 1 ? 3 : 4;
    } else {
        const growth = grade === 1 ? Math.max(1.2, ease * 0.6) : ease;
        interval = Math.max(prevInterval + 1, Math.round(prevInterval * growth));
    }

    if (grade === 3) {
        interval = Math.max(interval, Math.round(Math.max(prevInterval, 1) * ease * 1.5));
    }

    interval = clamp(Math.round(interval), 1, 365);

    const willArchive = interval >= ARCHIVE_THRESHOLD_DAYS;

    return {
        interval_days: interval,
        ease_factor: round2(ease),
        reps,
        lapses: prevLapses,
        due_date: willArchive ? addDays(today, ARCHIVE_RECHECK_DAYS) : addDays(today, interval),
        archived: willArchive,
    };
}

export type QueueReason = 'overdue' | 'due' | 'new' | 'decay-check';

export interface QueueItem {
    problem: Problem;
    reason: QueueReason;
}

const stableByCreation = (a: Problem, b: Problem) =>
    a.created_at === b.created_at ? a.id.localeCompare(b.id) : a.created_at < b.created_at ? -1 : 1;

function interleaveByPattern(items: QueueItem[]): QueueItem[] {
    const buckets = new Map<string, QueueItem[]>();
    for (const item of items) {
        const key = item.problem.pattern;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key)!.push(item);
    }
    const keys = [...buckets.keys()];
    const out: QueueItem[] = [];
    let remaining = items.length;
    let k = 0;
    while (remaining > 0) {
        let moved = false;
        for (let i = 0; i < keys.length; i++) {
            const bucket = buckets.get(keys[(k + i) % keys.length!])!;
            if (bucket.length) {
                out.push(bucket.shift()!);
                remaining--;
                moved = true;
            }
        }
        k += 1;
        if (!moved) break;
    }
    return out;
}

export function buildDailyQueue(problems: Problem[], today: string, newLimit = 7): QueueItem[] {
    const due = problems.filter((p) => p.due_date <= today);

    const overdueSort = (a: Problem, b: Problem) => {
        const diff = daysBetween(a.due_date, today) - daysBetween(b.due_date, today);
        return diff !== 0 ? -diff : stableByCreation(a, b);
    };

    const reviewItems = due
        .filter((p) => !p.archived && p.reps > 0)
        .sort(overdueSort)
        .map<QueueItem>((problem) => ({
            problem,
            reason: problem.due_date < today ? 'overdue' : 'due',
        }));

    const decayCheckItems = due
        .filter((p) => p.archived)
        .sort(overdueSort)
        .map<QueueItem>((problem) => ({ problem, reason: 'decay-check' }));

    const reviewPool = interleaveByPattern([...reviewItems, ...decayCheckItems]);

    const fresh = due
        .filter((p) => !p.archived && p.reps === 0)
        .sort(stableByCreation)
        .slice(0, newLimit)
        .map<QueueItem>((problem) => ({ problem, reason: 'new' }));

    if (fresh.length === 0) return reviewPool;
    if (reviewPool.length === 0) return fresh;

    const out: QueueItem[] = [];
    const step = Math.max(1, Math.ceil(reviewPool.length / fresh.length));
    let freshIdx = 0;
    reviewPool.forEach((item, i) => {
        out.push(item);
        if (freshIdx < fresh.length && (i + 1) % step === 0) {
            out.push(fresh[freshIdx]!);
            freshIdx += 1;
        }
    });
    while (freshIdx < fresh.length) {
        out.push(fresh[freshIdx]!);
        freshIdx += 1;
    }
    return out;
}

export function healthOf(problem: Problem): 'healthy' | 'lapsed' | 'neutral' {
    if (problem.lapses > 0 && problem.interval_days <= 2) return 'lapsed';
    if (problem.interval_days >= 7) return 'healthy';
    return 'neutral';
}

export function formatDue(dueISO: string, today: string): string {
    const delta = daysBetween(today, dueISO);
    if (delta === 0) return 'today';
    if (delta === 1) return 'tomorrow';
    if (delta < 0) return `${Math.abs(delta)} d overdue`;
    return `in ${delta} d`;
}
