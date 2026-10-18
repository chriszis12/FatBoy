-- FatBoy cloud schema. Run once in the Supabase SQL editor.

create table public.user_state (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.user_state enable row level security;

create policy "Read own state"   on public.user_state for select to authenticated using (auth.uid() = user_id);
create policy "Insert own state" on public.user_state for insert to authenticated with check (auth.uid() = user_id);
create policy "Update own state" on public.user_state for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Lets a signed-in person delete their own account (required by app stores).
create or replace function public.delete_my_account()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = auth.uid();
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- Daily counter that keeps the recipe function from being abused.
create table public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null default current_date,
  count   integer not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;  -- no policies: only the edge function (service role) touches it
