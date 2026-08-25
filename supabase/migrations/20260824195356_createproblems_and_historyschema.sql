create extension if not exists "pgcrypto";

create type public.problem_pattern as enum (
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
    'Math & Geometry'
);

create table public.problems (
    id             uuid primary key default gen_random_uuid(),
    user_id        uuid references auth.users (id) on delete cascade,
    name           text not null check (char_length(btrim(name)) > 0),
    pattern        public.problem_pattern not null,
    url            text,
    due_date       date not null,
    interval_days  integer not null default 0 check (interval_days between 0 and 365),
    ease_factor    numeric(4,2) not null default 2.5 check (ease_factor between 1.3 and 3.0),
    reps           integer not null default 0 check (reps >= 0),
    lapses         integer not null default 0 check (lapses >= 0),
    archived       boolean not null default false,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);

comment on table public.problems is
    'One row per tracked DSA problem. Mirrors src/lib/srs.ts Problem interface field-for-field.';

create table public.problem_history (
    id             uuid primary key default gen_random_uuid(),
    problem_id     uuid not null references public.problems (id) on delete cascade,

    grade          smallint not null check (grade between 0 and 3),
    interval_days  integer not null check (interval_days between 0 and 365),
    ease_factor    numeric(4,2) not null check (ease_factor between 1.3 and 3.0),

    reviewed_on    date not null,
    created_at     timestamptz not null default now()
);

comment on table public.problem_history is
    'Append-only review log. Mirrors src/lib/srs.ts HistoryEntry interface. Insert-only, never updated.';

create index idx_problems_due_date on public.problems (due_date) where not archived;
create index idx_problems_pattern on public.problems (pattern);
create index idx_problems_user_id on public.problems (user_id);
create index idx_problem_history_problem_id on public.problem_history (problem_id);
create index idx_problem_history_reviewed_on on public.problem_history (reviewed_on);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger trg_problems_touch_updated_at
    before update on public.problems
    for each row
    execute function public.touch_updated_at();

create or replace function public.enforce_append_only()
returns trigger
language plpgsql
as $$
begin
    raise exception 'Data Integrity Violation: The problem_history table is strictly append-only. UPDATE and DELETE actions are forbidden.';
end;
$$;

create trigger trg_problem_history_append_only
    before update or delete on public.problem_history
    for each row
    execute function public.enforce_append_only();


alter table public.problems enable row level security;
alter table public.problem_history enable row level security;

create policy "problems_open_access_stub"
    on public.problems
    as permissive
    for all
    to anon, authenticated
    using (true)
    with check (true);

create policy "problem_history_open_access_stub"
    on public.problem_history
    as permissive
    for all
    to anon, authenticated
    using (true)
    with check (true);
