import { useId, useRef, useState, type ReactNode } from 'react';
import { motion, useMotionTemplate, useMotionValue } from 'motion/react';
import { Terminal, Gauge, TrendingDown, Archive } from 'lucide-react';
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
                        className={`mt-0.5 block transition-all duration-300 select-none ${
                            revealed ? 'blur-none' : 'blur-sm'
                        }`}
                    >
                        {
                            '  const seen = new Map();\n  for (let i = 0; i < nums.length; i++) {\n    const need = target - nums[i];\n    if (seen.has(need)) return [seen.get(need), i];\n    seen.set(nums[i], i);\n  }'
                        }
                    </span>
                    {'}'}
                </pre>
            </button>
            <p className="metric mt-2 text-[11px] text-muted-foreground">
                two-sum.ts — {revealed ? 'revealed' : 'tap to reveal'}
            </p>
        </div>
    );
}

const FRICTION = [
    { key: '0', label: 'Trench', interval: '1d', cls: 'bg-lapsed/20 text-lapsed ring-lapsed/40' },
    { key: '1', label: 'Grind', interval: '3d', cls: 'bg-white/10 text-foreground ring-border' },
    {
        key: '2',
        label: 'Triumph',
        interval: '7d',
        cls: 'bg-healthy/20 text-healthy ring-healthy/40',
    },
    {
        key: '3',
        label: 'Archive',
        interval: '30d',
        cls: 'bg-archive/20 text-archive ring-archive/40',
    },
];

function FrictionSwitch() {
    const [active, setActive] = useState<number | null>(null);

    return (
        <div className="rounded-lg bg-background/70 p-3 ring-1 ring-hairline">
            <div className="grid grid-cols-4 gap-2">
                {FRICTION.map((g, i) => (
                    <button
                        key={g.key}
                        type="button"
                        onPointerEnter={() => setActive(i)}
                        onFocus={() => setActive(i)}
                        onPointerLeave={() => setActive(null)}
                        onBlur={() => setActive(null)}
                        className={cn(
                            'metric h-10 min-h-[44px] rounded-md text-[13px] tabular-nums ring-1 transition-all duration-150 ease-out',
                            active === i
                                ? cn(g.cls, '-translate-y-0.5')
                                : 'bg-white/[0.04] text-muted-foreground ring-border',
                        )}
                        aria-label={`${g.key} ${g.label}, ${g.interval} interval`}
                    >
                        {g.key}
                    </button>
                ))}
            </div>
            <div className="mt-2.5 flex min-h-[1.25rem] items-center">
                <p className="metric text-[11px] text-muted-foreground transition-opacity duration-150">
                    {active === null
                        ? 'hover a grade'
                        : `${FRICTION[active]!.label} · next review in ${FRICTION[active]!.interval}`}
                </p>
            </div>
        </div>
    );
}

const DECAY = [
    { x: 14, y: 62, label: '1d', desc: 'reset' },
    { x: 78, y: 44, label: '3d', desc: 'consolidation' },
    { x: 142, y: 28, label: '7d', desc: 'medium-term' },
    { x: 210, y: 14, label: '30d', desc: 'long-term' },
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
                {DECAY.map((p, i) => {
                    const isLast = i === DECAY.length - 1;
                    return (
                        <g
                            key={p.label}
                            onPointerEnter={() => setHover(i)}
                            onPointerLeave={() => setHover(null)}
                        >
                            <circle cx={p.x} cy={p.y} r={9} fill="transparent" />
                            <circle
                                cx={p.x}
                                cy={p.y}
                                r={hover === i ? 7 : 5}
                                fill="var(--healthy)"
                                opacity={0.18}
                                className="transition-all duration-150"
                            />
                            <circle
                                cx={p.x}
                                cy={p.y}
                                r={isLast ? 3.2 : 2.6}
                                fill="var(--healthy)"
                                filter={isLast ? `url(#${glowId})` : undefined}
                            />
                            <text
                                x={p.x}
                                y={p.y - 12}
                                textAnchor="middle"
                                className="metric fill-foreground text-[9px] transition-opacity duration-150"
                                opacity={hover === i ? 1 : 0}
                            >
                                {p.label}
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
    { x: 96, label: '60d', desc: 'graduates to archived - out of daily rotation' },
    { x: 206, label: '180d', desc: "one decay check - pulled back if it's drifted" },
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
                {TIMELINE.map((p, i) => (
                    <g
                        key={p.label}
                        onPointerEnter={() => setHover(i)}
                        onPointerLeave={() => setHover(null)}
                    >
                        <circle cx={p.x} cy={20} r={9} fill="transparent" />
                        <circle
                            cx={p.x}
                            cy={20}
                            r={hover === i ? 7 : 5}
                            fill="var(--healthy)"
                            opacity={0.18}
                            className="transition-all duration-150"
                        />
                        <circle cx={p.x} cy={20} r={2.8} fill="var(--healthy)" />
                        <text
                            x={p.x}
                            y={8}
                            textAnchor="middle"
                            className="metric fill-foreground text-[9px] transition-opacity duration-150"
                            opacity={hover === i ? 1 : 0.55}
                        >
                            {p.label}
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
    return (
        <section aria-label="System mechanics">
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
                    body="You grade effort, not correctness. A 0 lapses to a one-day reset; higher grades move the ease factor and the interval together."
                >
                    <FrictionSwitch />
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
                    formula="≥60d → archived"
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
