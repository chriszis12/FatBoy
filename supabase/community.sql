-- FatBoy community (usernames + forum). Run once in the Supabase SQL editor, after schema.sql.
-- Safe to run again: everything is "if not exists" or "create or replace".

-- 1. Usernames --------------------------------------------------------------------------------
create table if not exists public.profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  username   text not null,
  created_at timestamptz not null default now(),
  constraint username_format check (username ~ '^[a-z0-9_]{3,20}$')
);
create unique index if not exists profiles_username_key on public.profiles (lower(username));

alter table public.profiles enable row level security;
drop policy if exists "Anyone signed in can read names" on public.profiles;
drop policy if exists "Claim own name" on public.profiles;
create policy "Anyone signed in can read names" on public.profiles for select to authenticated using (true);
create policy "Claim own name" on public.profiles for insert to authenticated with check (auth.uid() = user_id);

-- 2. Posts, comments, likes ---------------------------------------------------------------------
create table if not exists public.posts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (user_id) on delete cascade,
  category      text not null check (category in ('wins', 'questions', 'recipes', 'chat')),
  title         text not null check (char_length(title) between 3 and 80),
  body          text not null check (char_length(body) between 1 and 2000),
  like_count    integer not null default 0,
  comment_count integer not null default 0,
  hidden        boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists posts_feed on public.posts (created_at desc);

create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (user_id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 1000),
  hidden     boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists comments_by_post on public.comments (post_id, created_at);

create table if not exists public.likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (post_id, user_id)
);

alter table public.posts    enable row level security;
alter table public.comments enable row level security;
alter table public.likes    enable row level security;

drop policy if exists "Read visible posts"  on public.posts;
drop policy if exists "Write own posts"     on public.posts;
drop policy if exists "Delete own posts"    on public.posts;
create policy "Read visible posts" on public.posts for select to authenticated using (not hidden);
create policy "Write own posts"    on public.posts for insert to authenticated with check (auth.uid() = user_id);
create policy "Delete own posts"   on public.posts for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "Read visible comments" on public.comments;
drop policy if exists "Write own comments"    on public.comments;
drop policy if exists "Delete own comments"   on public.comments;
create policy "Read visible comments" on public.comments for select to authenticated using (not hidden);
create policy "Write own comments"    on public.comments for insert to authenticated with check (auth.uid() = user_id);
create policy "Delete own comments"   on public.comments for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "Read own likes"   on public.likes;
drop policy if exists "Add own likes"    on public.likes;
drop policy if exists "Remove own likes" on public.likes;
create policy "Read own likes"   on public.likes for select to authenticated using (auth.uid() = user_id);
create policy "Add own likes"    on public.likes for insert to authenticated with check (auth.uid() = user_id);
create policy "Remove own likes" on public.likes for delete to authenticated using (auth.uid() = user_id);

-- Counters stay right no matter who writes.
create or replace function public.bump_like_count() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set like_count = like_count + 1 where id = new.post_id;
  else
    update public.posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end $$;
drop trigger if exists likes_count on public.likes;
create trigger likes_count after insert or delete on public.likes for each row execute function public.bump_like_count();

create or replace function public.bump_comment_count() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set comment_count = comment_count + 1 where id = new.post_id;
  else
    update public.posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end $$;
drop trigger if exists comments_count on public.comments;
create trigger comments_count after insert or delete on public.comments for each row execute function public.bump_comment_count();

-- A little flood control: one post per 30 s, one comment per 5 s.
create or replace function public.limit_posts() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.posts where user_id = new.user_id and created_at > now() - interval '30 seconds') then
    raise exception 'rate_limited';
  end if;
  return new;
end $$;
drop trigger if exists posts_limit on public.posts;
create trigger posts_limit before insert on public.posts for each row execute function public.limit_posts();

create or replace function public.limit_comments() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.comments where user_id = new.user_id and created_at > now() - interval '5 seconds') then
    raise exception 'rate_limited';
  end if;
  return new;
end $$;
drop trigger if exists comments_limit on public.comments;
create trigger comments_limit before insert on public.comments for each row execute function public.limit_comments();

-- 3. Reports and blocks (required for apps with user-generated content) -------------------------
create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('post', 'comment')),
  target_id   uuid not null,
  reason      text not null check (char_length(reason) <= 40),
  created_at  timestamptz not null default now(),
  unique (reporter_id, kind, target_id)
);
alter table public.reports enable row level security;
drop policy if exists "File own reports" on public.reports;
create policy "File own reports" on public.reports for insert to authenticated with check (auth.uid() = reporter_id);
-- No select policy: reports are read in the Supabase dashboard (Table editor > reports).

-- Three different people reporting something hides it until you look at it.
create or replace function public.auto_hide() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.reports where kind = new.kind and target_id = new.target_id) >= 3 then
    if new.kind = 'post' then update public.posts set hidden = true where id = new.target_id;
    else update public.comments set hidden = true where id = new.target_id; end if;
  end if;
  return null;
end $$;
drop trigger if exists reports_hide on public.reports;
create trigger reports_hide after insert on public.reports for each row execute function public.auto_hide();

create table if not exists public.blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  primary key (blocker_id, blocked_id)
);
alter table public.blocks enable row level security;
drop policy if exists "Read own blocks"   on public.blocks;
drop policy if exists "Add own blocks"    on public.blocks;
drop policy if exists "Remove own blocks" on public.blocks;
create policy "Read own blocks"   on public.blocks for select to authenticated using (auth.uid() = blocker_id);
create policy "Add own blocks"    on public.blocks for insert to authenticated with check (auth.uid() = blocker_id);
create policy "Remove own blocks" on public.blocks for delete to authenticated using (auth.uid() = blocker_id);

-- 4. Reading ----------------------------------------------------------------------------------
create or replace function public.forum_feed(p_category text default null, p_before timestamptz default null, p_limit integer default 20)
returns table (id uuid, user_id uuid, username text, category text, title text, body text,
               like_count integer, comment_count integer, created_at timestamptz, liked boolean, mine boolean)
language sql stable set search_path = '' as $$
  select p.id, p.user_id, pr.username, p.category, p.title, p.body, p.like_count, p.comment_count, p.created_at,
         exists (select 1 from public.likes l where l.post_id = p.id and l.user_id = auth.uid()),
         p.user_id = auth.uid()
  from public.posts p
  join public.profiles pr on pr.user_id = p.user_id
  where not p.hidden
    and (p_category is null or p.category = p_category)
    and (p_before is null or p.created_at < p_before)
    and not exists (select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = p.user_id)
  order by p.created_at desc
  limit least(greatest(p_limit, 1), 50);
$$;

create or replace function public.forum_post(p_id uuid)
returns table (id uuid, user_id uuid, username text, category text, title text, body text,
               like_count integer, comment_count integer, created_at timestamptz, liked boolean, mine boolean)
language sql stable set search_path = '' as $$
  select p.id, p.user_id, pr.username, p.category, p.title, p.body, p.like_count, p.comment_count, p.created_at,
         exists (select 1 from public.likes l where l.post_id = p.id and l.user_id = auth.uid()),
         p.user_id = auth.uid()
  from public.posts p
  join public.profiles pr on pr.user_id = p.user_id
  where p.id = p_id and not p.hidden;
$$;

create or replace function public.forum_comments(p_post uuid)
returns table (id uuid, user_id uuid, username text, body text, created_at timestamptz, mine boolean)
language sql stable set search_path = '' as $$
  select c.id, c.user_id, pr.username, c.body, c.created_at, c.user_id = auth.uid()
  from public.comments c
  join public.profiles pr on pr.user_id = c.user_id
  where c.post_id = p_post and not c.hidden
    and not exists (select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = c.user_id)
  order by c.created_at asc
  limit 200;
$$;

create or replace function public.forum_blocked()
returns table (user_id uuid, username text)
language sql stable set search_path = '' as $$
  select b.blocked_id, pr.username
  from public.blocks b
  join public.profiles pr on pr.user_id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by pr.username;
$$;

grant execute on function public.forum_feed(text, timestamptz, integer), public.forum_post(uuid),
  public.forum_comments(uuid), public.forum_blocked() to authenticated;
revoke execute on function public.forum_feed(text, timestamptz, integer), public.forum_post(uuid),
  public.forum_comments(uuid), public.forum_blocked() from anon;
