/* eslint-disable react-refresh/only-export-components */
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ExternalLink, Search } from 'lucide-react';
import { FilterSelect, Sparkline } from '@/components';
import { getCurrentUserId, historyQuery, problemsQuery } from '@/lib/recalldata';
import { formatDue, healthOf, todayISO, type Problem } from '@/lib/srs';
import type { QueryClient } from '@tanstack/react-query';

export const Route = createFileRoute('/library')({
    loader: async ({ context }) => {
        const queryClient = (context as { queryClient: QueryClient }).queryClient;
        try {
            const userId = await getCurrentUserId();
            if (!userId) return;
            await Promise.all([
                queryClient.ensureQueryData(problemsQuery(userId)),
                queryClient.ensureQueryData(historyQuery(userId)),
            ]);
        } catch (error) {
            // Allow errors to be handled by component-level error panels
            // Prevent them from escaping to root ErrorComponent
            console.error('[library loader] Query prefetch failed:', error);
        }
    },
    head: () => ({
        meta: [
            { title: 'Library - Recall' },
            {
                name: 'description',
                content:
                    'A read-only scan surface for every tracked DSA problem: pattern, next due date, ease factor, and a retention sparkline.',
            },
            { property: 'og:title', content: 'Library - Recall' },
            {
                property: 'og:description',
                content: 'Every tracked problem, its interval, ease factor and retention history.',
            },
        ],
    }),
    component: Library,
});

type SortKey = 'due' | 'name' | 'ease' | 'pattern';

function easeHealthOf(easeFactor: number): 'healthy' | 'lapsed' | 'neutral' {
    if (easeFactor > 2.5) return 'healthy';
    if (easeFactor < 1.5) return 'lapsed';
    return 'neutral';
}

function healthToClass(health: 'healthy' | 'lapsed' | 'neutral'): string {
    if (health === 'healthy') return 'text-healthy';
    if (health === 'lapsed') return 'text-lapsed';
    return 'text-muted-foreground';
}

function Library() {
    const today = useMemo(() => todayISO(), []);
    const {
        data: userId,
        isPending: userIdPending,
        isError: userIdError,
        error: userIdQueryError,
    } = useQuery({
        queryKey: ['currentUser'],
        queryFn: getCurrentUserId,
    });
    const {
        data: problems,
        isPending,
        isError: problemsErrored,
        error: problemsError,
    } = useQuery({
        ...problemsQuery(userId ?? 'none'),
        enabled: !!userId,
    });
    const {
        data: history,
        isPending: historyPending,
        isError: historyErrored,
        error: historyError,
    } = useQuery({
        ...historyQuery(userId ?? 'none'),
        enabled: !!userId,
    });

    const [search, setSearch] = useState('');
    const [pattern, setPattern] = useState('all');
    const [sort, setSort] = useState<SortKey>('due');

    const patterns = useMemo(
        () => Array.from(new Set((problems ?? []).map((p) => p.pattern))).sort(),
        [problems],
    );

    const gradesByProblem = useMemo(() => {
        const map = new Map<string, number[]>();
        (history ?? []).forEach((entry) => {
            const list = map.get(entry.problem_id) ?? [];
            list.push(entry.grade);
            map.set(entry.problem_id, list);
        });
        return map;
    }, [history]);

    const rows = useMemo(() => {
        const query = search.trim().toLowerCase();

        const filtered = (problems ?? []).filter(
            (p) =>
                (pattern === 'all' || p.pattern === pattern) &&
                (query === '' ||
                    p.name.toLowerCase().includes(query) ||
                    p.pattern.toLowerCase().includes(query)),
        );
        const compare = (a: Problem, b: Problem) => {
            switch (sort) {
                case 'name':
                    return a.name.localeCompare(b.name);
                case 'ease':
                    return b.ease_factor - a.ease_factor || a.name.localeCompare(b.name);
                case 'pattern':
                    return a.pattern.localeCompare(b.pattern) || a.name.localeCompare(b.name);
                default:
                    return a.due_date.localeCompare(b.due_date) || a.name.localeCompare(b.name);
            }
        };
        return [...filtered].sort(compare);
    }, [problems, search, pattern, sort]);

    const loading = userIdPending || (!!userId && (isPending || historyPending));
    const loadError = userIdError
        ? userIdQueryError
        : problemsErrored
          ? problemsError
          : historyErrored
            ? historyError
            : null;

    const loadErrorMessage = (() => {
        if (loadError instanceof Error) {
            console.error('[library] query failed:', loadError);
            return 'Something went wrong. Please try again later.';
        }
        return 'Unknown error';
    })();

    return (
        <main className="relative min-h-screen">
            <div className="blueprint-grid blueprint-fade pointer-events-none absolute inset-0 -z-10" />

            <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 pt-24 pb-24">
                <section className="pt-16">
                    <h1 className="hero-type metric text-[2rem] sm:text-[2.5rem]">Library</h1>
                    <p className="metric mt-3 max-w-lg text-[0.9rem] leading-relaxed text-muted-foreground">
                        A scan surface, not a workflow. Every tracked problem, its next due date,
                        current ease factor and retention history.
                    </p>
                </section>

                <div className="mt-8 flex flex-wrap items-center gap-3">
                    <div className="metric relative flex-1 min-w-[10rem] sm:flex-none">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500 pointer-events-none" />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search name or pattern"
                            aria-label="Search problems by name or pattern"
                            className="h-10 w-full sm:w-56 rounded-md bg-white pl-9 pr-3 font-geist-sans text-[13px] text-black ring-1 ring-black/10 placeholder:text-neutral-500 transition-colors duration-150 focus:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus:outline-none"
                        />
                    </div>
                    {!loading && (
                        <>
                            <FilterSelect
                                value={pattern}
                                onChange={setPattern}
                                options={[
                                    { value: 'all', label: 'all patterns' },
                                    ...patterns.map((p) => ({ value: p, label: p })),
                                ]}
                                ariaLabel="Filter by pattern"
                                showFilterIcon={true}
                                className="sm:w-40"
                            />
                            <FilterSelect
                                value={sort}
                                onChange={(value) => setSort(value as SortKey)}
                                options={[
                                    { value: 'due', label: 'sort · due date' },
                                    { value: 'name', label: 'sort · name' },
                                    { value: 'ease', label: 'sort · ease' },
                                    { value: 'pattern', label: 'sort · pattern' },
                                ]}
                                ariaLabel="Sort problems by"
                                className="sm:w-36"
                            />
                        </>
                    )}
                </div>

                {loading && !loadError && (
                    <div className="mt-4 metric py-8 text-[0.75rem] text-muted-foreground">
                        loading…
                    </div>
                )}

                {loadError && (
                    <div className="mt-4 metric rounded-md bg-lapsed/10 px-4 py-3 text-[0.8rem] text-lapsed ring-1 ring-lapsed/20">
                        Couldn&apos;t load the library. {loadErrorMessage}
                    </div>
                )}

                {!loading && !loadError && rows.length === 0 && (
                    <div className="mt-4 metric py-8 text-[0.75rem] text-muted-foreground">
                        no matches
                    </div>
                )}

                {!loading && !loadError && rows.length > 0 && (
                    <div className="flex flex-col mt-6">
                        {/* Mobile Cards */}
                        <div className="flex flex-col gap-3 md:hidden">
                            {rows.map((p) => {
                                const health = healthOf(p);
                                const easeHealth = easeHealthOf(p.ease_factor);
                                const overdue = !p.archived && p.due_date < today;
                                const grades = gradesByProblem.get(p.id) ?? [];

                                return (
                                    <div
                                        key={p.id}
                                        className="rounded-lg bg-surface/95 ring-1 ring-white/[0.08] p-4 transition-colors duration-150 ease-out"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    {p.url ? (
                                                        <a
                                                            href={p.url}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="metric text-[14px] text-foreground transition-colors duration-150 ease-out hover:text-primary focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-ring rounded-sm inline-flex items-center gap-1"
                                                        >
                                                            {p.name}
                                                            <ExternalLink className="size-3 opacity-60" />
                                                        </a>
                                                    ) : (
                                                        <span className="metric text-[14px] text-foreground">
                                                            {p.name}
                                                        </span>
                                                    )}
                                                    {p.archived && (
                                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] metric bg-healthy/10 text-healthy border border-healthy/20">
                                                            archived
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="mt-1 block metric text-[0.65rem] text-muted-foreground uppercase">
                                                    {p.pattern}
                                                </span>
                                            </div>

                                            <div className="text-right shrink-0">
                                                <span
                                                    className={`metric text-[0.75rem] ${
                                                        overdue
                                                            ? 'text-lapsed'
                                                            : healthToClass(health)
                                                    }`}
                                                >
                                                    {p.archived
                                                        ? 'retired'
                                                        : formatDue(p.due_date, today)}
                                                </span>
                                                <span className="block metric text-[0.65rem] text-muted-foreground mt-0.5">
                                                    {p.interval_days} days interval
                                                </span>
                                            </div>
                                        </div>

                                        <div className="mt-4 pt-3 border-t border-hairline flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="metric text-[0.65rem] text-muted-foreground uppercase">
                                                    ease
                                                </span>
                                                <span
                                                    className={`metric text-[0.75rem] ${healthToClass(
                                                        easeHealth,
                                                    )}`}
                                                >
                                                    {p.ease_factor.toFixed(2)}
                                                </span>
                                            </div>
                                            <Sparkline grades={grades} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Desktop Table */}
                        <div className="hidden md:block overflow-hidden rounded-lg panel">
                            <table className="w-full text-left text-sm border-collapse">
                                <thead>
                                    <tr className="border-b border-hairline metric text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                                        <th className="py-3 px-4">Problem</th>
                                        <th className="py-3 px-4">Pattern</th>
                                        <th className="py-3 px-4">Due</th>
                                        <th className="py-3 px-4">Interval</th>
                                        <th className="py-3 px-4">Ease Factor</th>
                                        <th className="py-3 px-4 text-right">Retention</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-hairline">
                                    {rows.map((p) => {
                                        const health = healthOf(p);
                                        const easeHealth = easeHealthOf(p.ease_factor);
                                        const overdue = !p.archived && p.due_date < today;
                                        const grades = gradesByProblem.get(p.id) ?? [];

                                        return (
                                            <tr
                                                key={p.id}
                                                className="transition-colors duration-150 hover:bg-white/[0.02]"
                                            >
                                                <td className="py-3 px-4 metric text-[14px]">
                                                    {p.url ? (
                                                        <a
                                                            href={p.url}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="inline-flex items-center gap-1.5 text-foreground hover:text-primary transition-colors duration-150"
                                                        >
                                                            {p.name}
                                                            <ExternalLink className="size-3 opacity-60" />
                                                        </a>
                                                    ) : (
                                                        <span>{p.name}</span>
                                                    )}
                                                </td>
                                                <td className="metric py-3 px-4 text-[0.7rem] text-muted-foreground">
                                                    {p.pattern}
                                                </td>
                                                <td className="py-3 px-4">
                                                    <span
                                                        className={`metric text-[0.75rem] ${
                                                            overdue
                                                                ? 'text-lapsed'
                                                                : healthToClass(health)
                                                        }`}
                                                    >
                                                        {p.archived
                                                            ? 'retired'
                                                            : formatDue(p.due_date, today)}
                                                    </span>
                                                </td>
                                                <td className="metric py-3 px-4 text-[0.75rem] text-muted-foreground">
                                                    {p.interval_days == 1
                                                        ? '1 day'
                                                        : `${p.interval_days} days`}
                                                </td>
                                                <td className="py-3 px-4">
                                                    <span
                                                        className={`metric text-[0.75rem] ${healthToClass(
                                                            easeHealth,
                                                        )}`}
                                                    >
                                                        {p.ease_factor.toFixed(2)}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4 text-right">
                                                    <div className="flex justify-end">
                                                        <Sparkline grades={grades} />
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
}
