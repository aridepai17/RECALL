-- Drop open-access stub policies
drop policy if exists "problems_open_access_stub" on public.problems;
drop policy if exists "problem_history_open_access_stub" on public.problem_history;

-- Create user-isolated policies for problems table
create policy "problems_select_own"
    on public.problems
    as permissive
    for select
    to authenticated
    using (auth.uid() = user_id);

create policy "problems_insert_own"
    on public.problems
    as permissive
    for insert
    to authenticated
    with check (auth.uid() = user_id);

create policy "problems_update_own"
    on public.problems
    as permissive
    for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create policy "problems_delete_own"
    on public.problems
    as permissive
    for delete
    to authenticated
    using (auth.uid() = user_id);

-- Create user-isolated policies for problem_history table (via problems relationship)
create policy "problem_history_select_own"
    on public.problem_history
    as permissive
    for select
    to authenticated
    using (
        exists (
            select 1 from public.problems
            where problems.id = problem_history.problem_id
            and problems.user_id = auth.uid()
        )
    );

create policy "problem_history_insert_own"
    on public.problem_history
    as permissive
    for insert
    to authenticated
    with check (
        exists (
            select 1 from public.problems
            where problems.id = problem_history.problem_id
            and problems.user_id = auth.uid()
        )
    );
