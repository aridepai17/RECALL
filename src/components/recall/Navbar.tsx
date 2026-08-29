import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { getCurrentUserId, problemsQuery } from '@/lib/recalldata';
import { buildDailyQueue, todayISO } from '@/lib/srs';
import { useHasMounted } from '@/hooks/useHasMounted';

export function Navbar() {
    const today = todayISO();
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
        isPending: problemsPending,
        isError: problemsError,
    } = useQuery({
        ...problemsQuery(userId ?? 'none'),
        enabled: !!userId,
    });
    const hasMounted = useHasMounted();

    const hasError = userIdError || problemsError;
    const isLoading = userIdPending || (!!userId && problemsPending);
    const isUnauthenticated = !userId;

    const dueCount = hasMounted && problems ? buildDailyQueue(problems, today).length : 0;
    const totalCount = hasMounted ? (problems?.length ?? 0) : 0;

    const displayDueCount =
        hasError || isLoading || isUnauthenticated ? '--' : String(dueCount).padStart(2, '0');
    const displayTotalCount =
        hasError || isLoading || isUnauthenticated ? '--' : String(totalCount).padStart(2, '0');

    return (
        <>
            <header className="sticky top-0 z-50 w-full border-b border-white/[0.06] bg-[#0c0e12]/85 backdrop-blur-xl">
                <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
                    <div className="flex items-center gap-8 sm:gap-10">
                        <Link
                            to="/"
                            className="metric flex min-h-11 items-center text-[0.75rem] uppercase tracking-[0.28em] text-foreground transition-colors duration-150 ease-out hover:text-primary"
                        >
                            recall<span className="text-primary">.</span>
                        </Link>

                        <nav className="hidden items-center sm:flex">
                            <NavTab to="/review" label="review" exact />
                            <span aria-hidden className="mx-3 h-3 w-px bg-white/[0.08]" />
                            <NavTab to="/library" label="library" />
                        </nav>
                    </div>

                    <div className="metric flex items-center gap-3 text-[0.7rem] tabular-nums">
                        <span className="flex items-baseline gap-1.5">
                            <span
                                className={
                                    dueCount > 0 && !hasError
                                        ? 'text-foreground'
                                        : 'text-neutral-600'
                                }
                            >
                                {displayDueCount}
                            </span>
                            <span className="text-neutral-600">due</span>
                        </span>

                        <span aria-hidden className="h-3 w-px bg-white/[0.08]" />

                        <span className="flex items-baseline gap-1.5">
                            <span className="text-neutral-400">{displayTotalCount}</span>
                            <span className="text-neutral-600">tracked</span>
                        </span>
                    </div>
                </div>
            </header>

            <nav
                className="fixed inset-x-0 bottom-0 z-50 border-t border-white/[0.06] bg-[#0c0e12]/90 backdrop-blur-xl sm:hidden"
                style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            >
                <div className="metric mx-auto flex h-14 max-w-5xl items-stretch">
                    <BottomTab
                        to="/review"
                        label="review"
                        exact
                        badge={hasError || isLoading || isUnauthenticated ? undefined : dueCount}
                    />
                    <BottomTab to="/library" label="library" />
                </div>
            </nav>
        </>
    );
}

function NavTab({ to, label, exact }: { to: string; label: string; exact?: boolean }) {
    return (
        <Link
            to={to}
            {...(exact && { activeOptions: { exact: true } })}
            className="metric relative flex min-h-11 items-center py-1 text-[0.8rem] uppercase tracking-wider text-neutral-300 transition-colors duration-150 ease-out hover:text-foreground focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-white/40"
            activeProps={{
                className:
                    'text-foreground after:absolute after:inset-x-0 after:-bottom-[1px] after:h-px after:bg-foreground',
            }}
        >
            {label}
        </Link>
    );
}

function BottomTab({
    to,
    label,
    exact,
    badge,
}: {
    to: string;
    label: string;
    exact?: boolean;
    badge?: number;
}) {
    return (
        <Link
            to={to}
            {...(exact && { activeOptions: { exact: true } })}
            className="metric relative flex flex-1 flex-col items-center justify-center gap-1 text-[0.75rem] uppercase tracking-wide text-neutral-300 transition-colors duration-150 ease-out active:text-foreground focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-2px] focus-visible:outline-white/40"
            activeProps={{
                className:
                    'text-foreground before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-foreground',
            }}
        >
            <span className="flex items-center gap-1.5">
                {label}
                {!!badge && (
                    <span className="metric rounded-none bg-white/[0.08] px-1 text-[0.6rem] tabular-nums text-foreground">
                        {String(badge).padStart(2, '0')}
                    </span>
                )}
            </span>
        </Link>
    );
}
