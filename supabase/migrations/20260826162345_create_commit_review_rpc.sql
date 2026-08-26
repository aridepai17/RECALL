create or replace function public.commit_review(
    p_problem_id uuid,
    p_interval_days integer,
    p_ease_factor numeric(4,2),
    p_reps integer,
    p_lapses integer,
    p_due_date date,
    p_archived boolean,
    p_expected_updated_at timestamptz,
    p_grade smallint,
    p_reviewed_on date,
    p_history_created_at timestamptz
)
returns void
language plpgsql
security definer
as $$
begin
    update public.problems
    set
        interval_days = p_interval_days,
        ease_factor = p_ease_factor,
        reps = p_reps,
        lapses = p_lapses,
        due_date = p_due_date,
        archived = p_archived,
        updated_at = now()
    where id = p_problem_id
      and updated_at = p_expected_updated_at
      and user_id = auth.uid();

    if not found then
        raise exception 'stale_write: problem % was modified elsewhere since it was loaded.', p_problem_id;
    end if;

    insert into public.problem_history (
        problem_id, grade, interval_days, ease_factor, reviewed_on, created_at
    ) values (
        p_problem_id, p_grade, p_interval_days, p_ease_factor, p_reviewed_on, p_history_created_at
    );
end;
$$;

revoke execute on function public.commit_review from public;
grant execute on function public.commit_review to authenticated;
