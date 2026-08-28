/* eslint-disable react-refresh/only-export-components */
import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useState, type SubmitEvent } from 'react';
import {
    PATTERNS,
    addProblem,
    commitReview,
    getCurrentUserId,
    problemsQuery,
} from '@/lib/recalldata';
import {
    GRADES,
    GRADE_HINTS,
    GRADE_LABELS,
    type Grade,
    buildDailyQueue,
    daysBetween,
    scheduleNextReview,
    todayISO,
    type Problem,
} from '@/lib/srs';
import { SimpleSelect } from '@/components';
import type { QueryClient } from '@tanstack/react-query';

export const Route = createFileRoute('/review')({
    loader: async ({ context }) => {
        const queryClient = (context as { queryClient: QueryClient }).queryClient;
        try {
            const userId = await getCurrentUserId();
            if (!userId) return null;
            return await queryClient.ensureQueryData(problemsQuery(userId));
        } catch (error) {
            // Allow errors to be handled by component-level error panels
            // Prevent them from escaping to root ErrorComponent
            console.error('[review loader] Query prefetch failed:', error);
            return null;
        }
    },
    head: () => ({
        meta: [
            { title: 'Recall - Review' },
            {
                name: 'description',
                content:
                    'The Recall review engine: one card at a time, keyboard-first 0-3 grading, and a calm Queue Clear state when the day is done.',
            },
            { property: 'og:title', content: 'Review - Recall' },
            {
                property: 'og:description',
                content: 'Keyboard-first active recall. One problem, right now.',
            },
        ],
    }),
    component: ReviewEngine,
});

const TRANSITION = { duration: 0.15, ease: [0.16, 1, 0.3, 1] as const };

function ReviewEngine() {
    const [today, setToday] = useState(() => todayISO());
    const queryClient = useQueryClient();
    const {
        data: userId,
        isPending: userIdPending,
        isError: userIdError,
    } = useQuery({
        queryKey: ['currentUser'],
        queryFn: getCurrentUserId,
    });
    const {
        data: problems,
        isPending,
        isError: queueErrored,
        error: queueError,
    } = useQuery({
        ...problemsQuery(userId ?? 'none'),
        enabled: !!userId,
    });

    const [graded, setGraded] = useState<Set<string>>(() => new Set());
    const [revealed, setRevealed] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sessionSize, setSessionSize] = useState<number | null>(null);

    // Keep 'today' fresh exactly at midnight, on focus, and check frequently for drift
    useEffect(() => {
        const checkRollover = () => {
            const currentIso = todayISO();
            setToday((prev) => {
                if (prev !== currentIso) {
                    setGraded(new Set());
                    setRevealed(false);
                    setSessionSize(null);
                    return currentIso;
                }
                return prev;
            });
        };

        window.addEventListener('focus', checkRollover);

        let timeoutId: ReturnType<typeof setTimeout>;
        const scheduleMidnight = () => {
            const now = new Date();
            const msUntilMidnight =
                new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() -
                now.getTime();

            // Add 1s buffer to ensure local time has cleanly crossed the threshold
            timeoutId = setTimeout(() => {
                checkRollover();
                scheduleMidnight();
            }, msUntilMidnight + 1000);
        };
        scheduleMidnight();

        // 1-minute fallback interval for system sleep/wake drift if focus doesn't trigger
        const interval = setInterval(checkRollover, 1000 * 60);

        return () => {
            window.removeEventListener('focus', checkRollover);
            clearTimeout(timeoutId);
            clearInterval(interval);
        };
    }, []);

    const queue = useMemo(
        () =>
            problems
                ? buildDailyQueue(problems, today).filter((item) => !graded.has(item.problem.id))
                : [],
        [problems, today, graded],
    );

    useEffect(() => {
        if (problems && sessionSize === null) {
            setSessionSize(buildDailyQueue(problems, today).length);
        }
    }, [problems, today, sessionSize]);

    const current = queue[0];
    const completedCount = sessionSize !== null ? sessionSize - queue.length : 0;

    const loadError = userIdError ? userIdError : queueErrored ? queueError : null;

    const commitMutation = useMutation({
        mutationFn: async ({ problem, gradeValue }: { problem: Problem; gradeValue: Grade }) => {
            const activeToday = todayISO();
            const next = scheduleNextReview(problem, gradeValue, activeToday);
            await commitReview(problem, gradeValue, next, activeToday);
        },
        onMutate: async ({ problem }) => {
            setGraded((prev) => new Set(prev).add(problem.id));
            setRevealed(false);
            setError(null);
        },
        onError: (err, { problem }) => {
            console.error('commitReview failed', err);
            setGraded((prev) => {
                const copy = new Set(prev);
                copy.delete(problem.id);
                return copy;
            });
            setError(
                err instanceof Error && err.message.includes('stale_write')
                    ? "This problem changed elsewhere since you loaded it. It's back in the queue — please re-grade."
                    : "That grade didn't save. The problem is back in the queue — try again.",
            );
        },
        onSettled: () => {
            if (userId) {
                void queryClient.invalidateQueries({ queryKey: ['problems', userId] });
                void queryClient.invalidateQueries({ queryKey: ['problem_history', userId] });
            }
        },
    });

    const grade = useCallback(
        (value: Grade) => {
            if (!current || commitMutation.isPending) return;
            commitMutation.mutate({ problem: current.problem, gradeValue: value });
        },
        [current, commitMutation],
    );

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
            if (!current) return;

            if (event.code === 'Space') {
                event.preventDefault();
                setRevealed(true);
                return;
            }

            if (!revealed) return;

            const parsed = Number(event.key);
            if (GRADES.includes(parsed as Grade)) {
                event.preventDefault();
                grade(parsed as Grade);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [current, revealed, grade]);

    return (
        <main className="relative flex min-h-screen flex-col">
            <div className="blueprint-grid blueprint-fade pointer-events-none absolute inset-0 -z-10" />

            <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 pt-12 pb-24">
                {error && (
                    <div className="w-full max-w-xl rounded-md bg-lapsed/10 px-4 py-3 text-[0.8rem] text-lapsed ring-1 ring-lapsed/20">
                        {error}
                    </div>
                )}

                {loadError ? (
                    <div className="w-full max-w-xl rounded-md bg-lapsed/10 px-4 py-3 text-[0.8rem] text-lapsed ring-1 ring-lapsed/20">
                        Couldn&apos;t load today&apos;s queue.{' '}
                        {loadError instanceof Error ? loadError.message : 'Unknown error'}
                    </div>
                ) : userIdPending || (!!userId && isPending) ? (
                    <span className="metric text-[0.75rem] text-muted-foreground">
                        loading queue…
                    </span>
                ) : current ? (
                    <>
                        {sessionSize !== null && sessionSize > 0 && (
                            <div className="metric w-full max-w-xl text-[0.7rem] text-muted-foreground">
                                reviewing {completedCount + 1} of {sessionSize}
                            </div>
                        )}
                        <AnimatePresence mode="wait">
                            <motion.section
                                key={current.problem.id}
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -6 }}
                                transition={TRANSITION}
                                className="panel w-full max-w-xl p-8 sm:p-10"
                            >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="metric rounded-sm bg-healthy/10 px-2 py-1 text-[0.65rem] tracking-[0.16em] text-healthy uppercase ring-1 ring-healthy/20">
                                        {current.problem.pattern}
                                    </span>
                                    <span
                                        className={`metric text-[0.65rem] uppercase ${
                                            current.reason === 'overdue'
                                                ? 'text-lapsed'
                                                : current.reason === 'new'
                                                  ? 'text-foreground/70'
                                                  : current.reason === 'decay-check'
                                                    ? 'text-healthy/70'
                                                    : 'text-muted-foreground'
                                        }`}
                                    >
                                        {current.reason === 'overdue'
                                            ? `${Math.abs(daysBetween(current.problem.due_date, today))} days overdue`
                                            : current.reason === 'decay-check'
                                              ? 'archive check'
                                              : current.reason}
                                    </span>
                                </div>

                                <h1 className="metric mt-8 text-[1.6rem] leading-tight tracking-tight text-balance sm:text-[2rem]">
                                    {current.problem.name}
                                </h1>

                                <div className="mt-10 border-t border-hairline pt-6">
                                    {revealed ? (
                                        <motion.div
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            transition={TRANSITION}
                                            className="grid gap-2"
                                        >
                                            {GRADES.map((g) => (
                                                <button
                                                    key={g}
                                                    onClick={() => grade(g)}
                                                    className="metric group flex min-h-11 items-center gap-4 rounded-md px-3 py-3 text-left ring-1 ring-border transition-colors duration-150 ease-out hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                                >
                                                    <kbd className="kbd-chip">{g}</kbd>
                                                    <span
                                                        className={`metric text-[15px] ${
                                                            g === 0
                                                                ? 'text-lapsed'
                                                                : g === 2
                                                                  ? 'text-healthy/80'
                                                                  : g === 3
                                                                    ? 'text-healthy'
                                                                    : 'text-foreground'
                                                        }`}
                                                    >
                                                        {GRADE_LABELS[g]}
                                                    </span>
                                                    <span className="ml-auto hidden text-[0.75rem] text-muted-foreground sm:block">
                                                        {GRADE_HINTS[g]}
                                                    </span>
                                                </button>
                                            ))}
                                        </motion.div>
                                    ) : (
                                        <button
                                            onClick={() => setRevealed(true)}
                                            className="metric flex min-h-11 w-full items-center justify-between rounded-md px-3 py-3 ring-1 ring-border transition-colors duration-150 ease-out hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                        >
                                            <span className="text-sm text-muted-foreground">
                                                Reconstruct the solution, then grade the friction
                                            </span>
                                            <kbd className="kbd-chip">Space</kbd>
                                        </button>
                                    )}
                                </div>
                            </motion.section>
                        </AnimatePresence>
                    </>
                ) : (
                    <QueueClear />
                )}
            </div>
        </main>
    );
}

function QueueClear() {
    const queryClient = useQueryClient();
    const { data: userId } = useQuery({
        queryKey: ['currentUser'],
        queryFn: getCurrentUserId,
    });
    const [name, setName] = useState('');
    const [pattern, setPattern] = useState<string>(PATTERNS[0]);
    const [url, setUrl] = useState('');

    const addMutation = useMutation({
        mutationFn: (newProblem: { name: string; pattern: string; url?: string }) =>
            addProblem(newProblem),
        onSuccess: () => {
            setName('');
            setUrl('');
            if (userId) {
                void queryClient.invalidateQueries({ queryKey: ['problems', userId] });
            }
        },
    });

    const submit = (event: SubmitEvent) => {
        event.preventDefault();
        if (!name.trim()) return;
        addMutation.mutate({ name, pattern, url });
    };

    return (
        <motion.section
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={TRANSITION}
            className="w-full max-w-xl"
        >
            <div className="flex items-center gap-3">
                <motion.span
                    animate={{ opacity: [0.35, 1, 0.35] }}
                    transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                    className="size-1.5 rounded-full bg-healthy"
                />
                <span className="metric text-[0.7rem] tracking-[0.2em] text-healthy uppercase">
                    queue clear
                </span>
            </div>
            <h1 className="hero-type metric mt-6 text-[2rem] sm:text-[2.6rem]">Nothing is due.</h1>
            <p className="metric mt-3 max-w-md text-[0.9rem] leading-relaxed text-muted-foreground">
                Every scheduled problem has been retrieved today. The next interval is already set.
                Close the tab, or seed the queue with something new.
            </p>

            <form onSubmit={submit} className="panel mt-10 p-6">
                <div className="flex items-baseline justify-between">
                    <h2 className="metric text-sm tracking-tight">Add problem</h2>
                    <span className="metric text-[0.65rem] text-muted-foreground">3 fields</span>
                </div>

                <div className="mt-5 grid gap-4">
                    <label className="grid gap-2">
                        <span className="metric text-[0.65rem] tracking-[0.16em] text-muted-foreground uppercase">
                            name
                        </span>
                        <input
                            value={name}
                            onChange={(e) => {
                                setName(e.target.value);
                                addMutation.reset();
                            }}
                            placeholder="Longest Palindromic Substring"
                            required
                            className="h-11 rounded-md bg-background px-3 text-sm ring-1 ring-input transition-shadow duration-150 ease-out placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ring focus:outline-none"
                        />
                    </label>

                    <label className="grid gap-2">
                        <span className="metric text-[0.65rem] tracking-[0.16em] text-muted-foreground uppercase">
                            pattern
                        </span>
                        <SimpleSelect
                            value={pattern}
                            onChange={setPattern}
                            options={PATTERNS}
                            ariaLabel="Select pattern"
                        />
                    </label>

                    <label className="grid gap-2">
                        <span className="metric text-[0.65rem] tracking-[0.16em] text-muted-foreground uppercase">
                            url <span className="normal-case opacity-60">optional</span>
                        </span>
                        <input
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="https://leetcode.com/problems/…"
                            className="h-11 rounded-md bg-background px-3 text-sm ring-1 ring-input transition-shadow duration-150 ease-out placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ring focus:outline-none"
                        />
                    </label>
                </div>

                <div className="mt-6 flex items-center gap-4">
                    <button
                        type="submit"
                        disabled={addMutation.isPending}
                        className="metric inline-flex h-11 items-center rounded-md bg-primary px-4 text-sm text-primary-foreground transition-all duration-150 ease-out hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
                    >
                        {addMutation.isPending ? 'Saving' : 'Add to queue'}
                    </button>
                    <AnimatePresence>
                        {addMutation.isSuccess && (
                            <motion.span
                                initial={{ opacity: 0, x: -4 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0 }}
                                transition={TRANSITION}
                                className="metric text-[0.7rem] text-healthy"
                            >
                                queued · due today
                            </motion.span>
                        )}
                        {addMutation.isError && (
                            <motion.span
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="metric text-[0.7rem] text-lapsed"
                            >
                                write failed
                            </motion.span>
                        )}
                    </AnimatePresence>
                </div>
            </form>
        </motion.section>
    );
}
