import { useId, useRef, useState, type ReactNode, useMemo } from 'react';
import { motion, useMotionTemplate, useMotionValue } from 'motion/react';
import { Terminal, Gauge, TrendingDown, Archive } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { scheduleNextReview, buildDailyQueue, todayISO, type Grade } from '@/lib/srs';
import { getCurrentUserId, problemsQuery } from '@/lib/recalldata';
import { cn } from '@/lib/utils';

function SpotlightCard({
    index,
    title,
    formula,
    formulaTone,
    body,
    icon,
    children,
}: {
    index: string;
    title: string;
    formula: string;
    formulaTone: string;
    body: string;
    icon: ReactNode;
    children: ReactNode;
}) {
    const ref = useRef<HTMLElement | null>(null);
    const mx = useMotionValue(-200);
    const my = useMotionValue(-200);
    const background = useMotionTemplate`radial-gradient(220px circle at ${mx}px ${my}px, oklch(1 0 0 / 8%), transparent 70%)`;

    return (
        <article
            ref={ref}
            onPointerMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                mx.set(e.clientX - rect.left);
                my.set(e.clientY - rect.top);
            }}
            onPointerLeave={() => {
                mx.set(-200);
                my.set(-200);
            }}
            className="group relative isolate overflow-hidden rounded-xl bg-surface/80 p-6 ring-1 ring-border backdrop-blur-md transition-all duration-300 ease-out hover:ring-white/20"
        >
            <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-white/[0.03] to-transparent" />

            <motion.div
                style={{ background }}
                className="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            />

            <div className="flex items-baseline gap-2">
                <span className="metric text-[11px] tabular-nums text-muted-foreground">
                    {index}
                </span>

                <span className="text-foreground/60">{icon}</span>

                <h2 className="metric text-[19px] tracking-tight text-foreground">{title}</h2>

                <span className={cn('metric ml-auto text-[11px] tabular-nums', formulaTone)}>
                    {formula}
                </span>
            </div>

            <p className="metric mt-2.5 text-[13px] leading-relaxed text-muted-foreground">
                {body}
            </p>

            <div className="mt-5">{children}</div>
        </article>
    );
}

function BlankScreen() {
    const [revealed, setRevealed] = useState(false);

    return (
        <div>
            <button
                type="button"
                onClick={() => setRevealed(true)}
                onMouseEnter={() => setRevealed(true)}
                className="block w-full overflow-hidden rounded-lg bg-background/70 text-left ring-1 ring-hairline focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-ring"
                aria-label="Reveal the redacted solution"
            >
                <pre className="metric px-3 py-3 text-[11px] leading-[1.7] text-muted-foreground">
                    <span className="text-foreground/80">function</span> twoSum(nums, target) {'{'}
                    <span
                        className={cn(
                            'mt-0.5 block select-none transition-all duration-300',
                            revealed ? 'blur-none' : 'blur-sm',
                        )}
                    >
                        {
                            '  const seen = new Map();\n  for (let i = 0; i < nums.length; i++) {\n    const need = target - nums[i];\n    if (seen.has(need)) return [seen.get(need), i];\n    seen.set(nums[i], i);\n  }'
                        }
                    </span>
                    {'}'}
                </pre>
            </button>

            <p className="metric mt-2 text-[11px] text-muted-foreground">
                twoSum.ts - {revealed ? 'revealed' : 'tap to reveal'}
            </p>
        </div>
    );
}

interface FrictionItem {
    key: number;
    label: string;
    cls: string;
    result: { interval_days: number; archived: boolean };
}

function FrictionSwitch({ friction }: { friction: FrictionItem[] }) {
    const [active, setActive] = useState<number | null>(null);

    return (
        <div className="rounded-lg bg-background/70 p-3 ring-1 ring-hairline">
            <div className="grid grid-cols-4 gap-2">
                {friction.map((grade, index) => (
                    <button
                        key={grade.key}
                        type="button"
                        onPointerEnter={() => setActive(index)}
                        onFocus={() => setActive(index)}
                        onPointerLeave={() => setActive(null)}
                        onBlur={() => setActive(null)}
                        className={cn(
                            'metric h-10 min-h-11 rounded-md text-[13px] tabular-nums ring-1 transition-all duration-150 ease-out',
                            active === index
                                ? cn(grade.cls, '-translate-y-0.5')
                                : 'bg-white/[0.04] text-muted-foreground ring-border',
                        )}
                        aria-label={`${grade.key} ${grade.label}, ${grade.result.interval_days} days interval`}
                    >
                        {grade.key}
                    </button>
                ))}
            </div>

            <div className="mt-2.5 flex min-h-[1.25rem] items-center justify-between">
                <p className="metric text-[11px] text-muted-foreground transition-opacity duration-150 truncate">
                    {active === null
                        ? 'hover a grade'
                        : `${friction[active]!.label} · next review in ${friction[active]!.result.interval_days} days`}
                </p>
            </div>
        </div>
    );
}

const DECAY = [
    { x: 14, y: 62, label: '1 day', desc: 'reset' },
    { x: 78, y: 44, label: '3 days', desc: 'consolidation' },
    { x: 142, y: 28, label: '7 days', desc: 'medium-term' },
    { x: 210, y: 14, label: '30 days', desc: 'long-term' },
];

function DecayCurve() {
    const [hover, setHover] = useState<number | null>(null);
    const glowId = `decay-glow-${useId()}`;

    return (
        <div className="rounded-lg bg-background/70 p-3 ring-1 ring-hairline">
            <svg
                viewBox="0 0 224 76"
                className="h-[76px] w-full overflow-visible"
                role="img"
                aria-label="Interval growth curve"
            >
                <defs>
                    <filter id={glowId} x="-100%" y="-100%" width="300%" height="300%">
                        <feDropShadow
                            dx="0"
                            dy="0"
                            stdDeviation="3"
                            floodColor="var(--healthy)"
                            floodOpacity={0.55}
                        />
                    </filter>
                </defs>

                <path
                    d="M14,62 C48,58 60,50 78,44 C106,34 118,32 142,28 C172,22 188,18 210,14"
                    fill="none"
                    stroke="var(--healthy)"
                    strokeWidth={2.25}
                    strokeLinecap="round"
                />

                {DECAY.map((point, index) => {
                    const isLast = index === DECAY.length - 1;

                    return (
                        <g
                            key={point.label}
                            onPointerEnter={() => setHover(index)}
                            onPointerLeave={() => setHover(null)}
                        >
                            <circle cx={point.x} cy={point.y} r={9} fill="transparent" />

                            <circle
                                cx={point.x}
                                cy={point.y}
                                r={hover === index ? 7 : 5}
                                fill="var(--healthy)"
                                opacity={0.18}
                                className="transition-all duration-150"
                            />

                            <circle
                                cx={point.x}
                                cy={point.y}
                                r={isLast ? 3.2 : 2.6}
                                fill="var(--healthy)"
                                filter={isLast ? `url(#${glowId})` : undefined}
                            />

                            <text
                                x={point.x}
                                y={point.y - 12}
                                textAnchor="middle"
                                className="metric fill-foreground text-[9px] transition-opacity duration-150"
                                opacity={hover === index ? 1 : 0}
                            >
                                {point.label}
                            </text>
                        </g>
                    );
                })}
            </svg>

            <div className="mt-2.5 flex min-h-[1.25rem] items-center">
                <p className="metric text-[11px] text-muted-foreground transition-opacity duration-150">
                    {hover === null
                        ? 'hover a node'
                        : `${DECAY[hover]!.label} - ${DECAY[hover]!.desc}`}
                </p>
            </div>
        </div>
    );
}

const TIMELINE = [
    {
        x: 96,
        label: '60 days',
        desc: 'graduates to archived - out of daily rotation',
    },
    {
        x: 206,
        label: '180 days',
        desc: "one decay check - pulled back if it's drifted",
    },
];

function ArchiveTimeline() {
    const [hover, setHover] = useState<number | null>(null);

    return (
        <div className="rounded-lg bg-background/70 p-3 ring-1 ring-hairline">
            <svg
                viewBox="0 0 224 40"
                className="h-10 w-full overflow-visible"
                role="img"
                aria-label="Archive and decay-check timeline"
            >
                <line
                    x1={14}
                    y1={20}
                    x2={96}
                    y2={20}
                    stroke="var(--healthy)"
                    strokeWidth={2.25}
                    strokeLinecap="round"
                />

                <line
                    x1={96}
                    y1={20}
                    x2={206}
                    y2={20}
                    stroke="var(--muted-foreground)"
                    strokeWidth={1.5}
                    strokeDasharray="1 5"
                    strokeLinecap="round"
                />

                {TIMELINE.map((point, index) => (
                    <g
                        key={point.label}
                        onPointerEnter={() => setHover(index)}
                        onPointerLeave={() => setHover(null)}
                    >
                        <circle cx={point.x} cy={20} r={9} fill="transparent" />

                        <circle
                            cx={point.x}
                            cy={20}
                            r={hover === index ? 7 : 5}
                            fill="var(--healthy)"
                            opacity={0.18}
                            className="transition-all duration-150"
                        />

                        <circle cx={point.x} cy={20} r={2.8} fill="var(--healthy)" />

                        <text
                            x={point.x}
                            y={8}
                            textAnchor="middle"
                            className="metric fill-foreground text-[9px] transition-opacity duration-150"
                            opacity={hover === index ? 1 : 0.55}
                        >
                            {point.label}
                        </text>
                    </g>
                ))}
            </svg>

            <div className="mt-2.5 flex min-h-[1.25rem] items-center">
                <p className="metric text-[11px] text-muted-foreground transition-opacity duration-150">
                    {hover === null
                        ? 'hover a marker'
                        : `${TIMELINE[hover]!.label} - ${TIMELINE[hover]!.desc}`}
                </p>
            </div>
        </div>
    );
}

export function DashboardMechanics() {
    const {
        data: userId,
        isError: userIdError,
        error: userIdQueryError,
    } = useQuery({
        queryKey: ['currentUser'],
        queryFn: getCurrentUserId,
    });
    const {
        data: problems = [],
        isError,
        error,
    } = useQuery({
        ...problemsQuery(userId ?? 'none'),
        enabled: !!userId,
    });
    const today = todayISO();

    const hasError = (userIdError && userId != null) || isError;

    // Pull the real queue and grab the first due problem
    const queue = useMemo(() => buildDailyQueue(problems, today), [problems, today]);
    const activeItem = queue[0];
    const activeProblem = activeItem?.problem;

    // Use active problem's stats as baseline, or fall back to default preview values if empty
    const baseline = useMemo(
        () =>
            activeProblem
                ? {
                      interval_days: activeProblem.interval_days,
                      ease_factor: activeProblem.ease_factor,
                      reps: activeProblem.reps,
                      lapses: activeProblem.lapses,
                  }
                : {
                      interval_days: 7,
                      ease_factor: 2.5,
                      reps: 3,
                      lapses: 0,
                  },
        [activeProblem],
    );

    // Calculate live preview intervals based on the current baseline
    const friction = useMemo(() => {
        return ([0, 1, 2, 3] as Grade[]).map((grade) => {
            const result = scheduleNextReview(baseline, grade, today);

            const metadata = {
                0: {
                    label: 'Trench',
                    cls: 'bg-lapsed/20 text-lapsed ring-lapsed/40',
                },
                1: {
                    label: 'Grind',
                    cls: 'bg-white/10 text-foreground ring-border',
                },
                2: {
                    label: 'Triumph',
                    cls: 'bg-healthy/20 text-healthy ring-healthy/40',
                },
                3: {
                    label: result.archived ? 'Archive' : 'Extend',
                    cls: result.archived
                        ? 'bg-archive/20 text-archive ring-archive/40'
                        : 'bg-primary/20 text-primary ring-primary/40',
                },
            }[grade];

            return {
                key: grade,
                ...metadata,
                result,
            };
        });
    }, [baseline, today]);

    return (
        <section aria-label="System mechanics">
            {hasError && (
                <div className="rounded-md bg-lapsed/10 px-4 py-3 text-[0.8rem] text-lapsed ring-1 ring-lapsed/20">
                    Couldn&apos;t load mechanics preview.{' '}
                    {userIdError && userIdQueryError instanceof Error
                        ? userIdQueryError.message
                        : error instanceof Error
                          ? error.message
                          : 'Unknown error'}
                </div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4">
                <SpotlightCard
                    index="01"
                    title="Active Recall"
                    formula="retrieval > rereading"
                    formulaTone="text-muted-foreground"
                    icon={<Terminal className="size-4" strokeWidth={1.75} />}
                    body="A pattern tag and a problem name. Nothing else. You reconstruct the solution before any grade unlocks."
                >
                    <BlankScreen />
                </SpotlightCard>

                <SpotlightCard
                    index="02"
                    title="Cognitive Friction"
                    formula="0–3"
                    formulaTone="text-foreground/70"
                    icon={<Gauge className="size-4" strokeWidth={1.75} />}
                    body="You grade effort, not correctness. A 0 lapses to a one-day reset; higher grades change the ease factor and interval based on the problem's current review state."
                >
                    <FrictionSwitch friction={friction} />
                </SpotlightCard>

                <SpotlightCard
                    index="03"
                    title="Memory Decay"
                    formula="Iₙ = Iₙ₋₁ × EF"
                    formulaTone="text-healthy/80"
                    icon={<TrendingDown className="size-4" strokeWidth={1.75} />}
                    body="Retention falls exponentially without retrieval. Each clean review multiplies the interval, landing the next rep where forgetting begins."
                >
                    <DecayCurve />
                </SpotlightCard>

                <SpotlightCard
                    index="04"
                    title="Archive & Decay Check"
                    formula="≥60 days → archived"
                    formulaTone="text-healthy/80"
                    icon={<Archive className="size-4" strokeWidth={1.75} />}
                    body="Mastery isn't the end. Once an interval clears the threshold it graduates out of daily rotation - then gets one honest check-in later, never forgotten permanently."
                >
                    <ArchiveTimeline />
                </SpotlightCard>
            </div>
        </section>
    );
}
