/* eslint-disable react-refresh/only-export-components */
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { getCurrentUserId, problemsQuery } from '@/lib/recalldata';
import { DashboardMechanics } from '@/components/recall/DashboardMechanics';
import { buildDailyQueue, todayISO } from '@/lib/srs';
import type { QueryClient } from '@tanstack/react-query';

export const Route = createFileRoute('/')({
    loader: async ({ context }) => {
        const queryClient = (context as { queryClient: QueryClient }).queryClient;
        const userId = await getCurrentUserId();
        if (!userId) return null;
        return await queryClient.ensureQueryData(problemsQuery(userId));
    },
    head: () => ({
        meta: [
            { title: 'Recall - One Problem. Right Now.' },
            {
                name: 'description',
                content:
                    'Recall is a distraction-free spaced repetition system for DSA patterns: active recall, 0-3 cognitive friction grading, and interval scheduling on the forgetting curve.',
            },
            { property: 'og:title', content: 'Recall - One Problem. Right Now.' },
            {
                property: 'og:description',
                content:
                    'A ruthless spaced repetition system for mastering Data Structures & Algorithms patterns.',
            },
        ],
    }),
    component: Dashboard,
});

function Dashboard() {
    const today = todayISO();
    const { data: userId } = useQuery({
        queryKey: ['currentUser'],
        queryFn: getCurrentUserId,
    });
    const { data: problems } = useQuery({
        ...problemsQuery(userId ?? 'none'),
        enabled: !!userId,
    });
    const dueCount = problems ? buildDailyQueue(problems, today).length : 0;

    return (
        <main className="relative min-h-screen overflow-hidden">
            <div className="blueprint-grid blueprint-fade pointer-events-none absolute inset-0 -z-10" />

            <div className="mx-auto w-full max-w-3xl px-6 pt-16">
                <section className="pb-20 sm:pt-12">
                    <h1 className="hero-type metric text-[2.6rem] text-balance sm:text-[4.1rem]">
                        One Problem. Right Now.
                        <br />
                        <span className="text-muted-foreground">That&apos;s the whole App.</span>
                    </h1>
                    <p className="metric mt-8 max-w-xl text-[0.95rem] leading-relaxed text-muted-foreground">
                        Recall is a spaced repetition system built for one job: keeping the NeetCode
                        patterns retrievable under pressure. No streaks, no dashboards, no
                        gamification. A queue, a card, four keys.
                    </p>

                    <div className="mt-12 flex flex-wrap items-center gap-3">
                        <Link
                            to="/review"
                            className="metric group inline-flex h-11 items-center gap-3 rounded-md bg-primary pl-5 pr-3 text-sm text-primary-foreground ring-1 ring-primary/40 transition-all duration-150 ease-out hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                            Start review
                            <span className="metric flex h-6 min-w-6 items-center justify-center rounded bg-primary-foreground/15 px-1.5 text-[0.75rem] tabular-nums">
                                {String(dueCount).padStart(2, '0')}
                            </span>
                        </Link>
                        <Link
                            to="/library"
                            className="metric inline-flex h-11 items-center rounded-md bg-white px-5 text-sm text-black transition-colors duration-150 ease-out hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
                        >
                            Open library
                        </Link>
                    </div>
                </section>
            </div>
            <div className="mx-auto w-full max-w-6xl 2xl:max-w-[88rem] px-6 pb-28">
                <DashboardMechanics />
            </div>
        </main>
    );
}
