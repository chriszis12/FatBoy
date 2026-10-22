-- FatBoy social layer: profiles, follows, friends, messages, groups, challenges, duels, ranks,
-- reactions, polls, notifications, word filter. Run once in the Supabase SQL editor, AFTER schema.sql
-- and community.sql. Safe to run again.

-- 0. Profiles ---------------------------------------------------------------------------------
alter table public.profiles
  add column if not exists avatar text not null default '🙂',
  add column if not exists color  text not null default 'blue',
  add column if not exists bio    text not null default '';
do $$ begin
  alter table public.profiles add constraint profiles_bio_len check (char_length(bio) <= 140);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_color_ok check (color in ('blue', 'yellow', 'green', 'purple', 'pink', 'orange'));
exception when duplicate_object then null; end $$;

-- Private details are readable by their owner only. Everyone else goes through the functions below.
create table if not exists public.profile_private (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  private     boolean not null default false,
  show_stats  boolean not null default true,
  age_ok      boolean not null default false,
  xp          integer not null default 0,
  streak      integer not null default 0,
  badges      jsonb not null default '[]',
  invite_code text not null default substr(md5(random()::text || clock_timestamp()::text), 1, 8),
  seen_at     timestamptz not null default now()
);
create unique index if not exists profile_private_code on public.profile_private (invite_code);
alter table public.profile_private enable row level security;
drop policy if exists "Read own private details" on public.profile_private;
create policy "Read own private details" on public.profile_private for select to authenticated using (auth.uid() = user_id);

-- Existing usernames (from community.sql) get their private row.
insert into public.profile_private (user_id, age_ok) select user_id, true from public.profiles on conflict (user_id) do nothing;

-- Usernames are claimed through claim_username so the age check cannot be skipped.
drop policy if exists "Claim own name" on public.profiles;

create table if not exists public.friendships (
  user_a  uuid not null references auth.users (id) on delete cascade,
  user_b  uuid not null references auth.users (id) on delete cascade,
  buddy   boolean not null default false,
  created timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create table if not exists public.friend_requests (
  from_id uuid not null references auth.users (id) on delete cascade,
  to_id   uuid not null references auth.users (id) on delete cascade,
  created timestamptz not null default now(),
  primary key (from_id, to_id),
  check (from_id <> to_id)
);
create table if not exists public.follows (
  follower uuid not null references auth.users (id) on delete cascade,
  followed uuid not null references auth.users (id) on delete cascade,
  created  timestamptz not null default now(),
  primary key (follower, followed),
  check (follower <> followed)
);
create table if not exists public.messages (
  id       uuid primary key default gen_random_uuid(),
  sender   uuid not null references auth.users (id) on delete cascade,
  receiver uuid not null references auth.users (id) on delete cascade,
  body     text not null check (char_length(body) between 1 and 500),
  read     boolean not null default false,
  created  timestamptz not null default now()
);
create index if not exists messages_pair on public.messages (least(sender, receiver), greatest(sender, receiver), created desc);

create table if not exists public.groups (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 3 and 40),
  description  text not null default '' check (char_length(description) <= 200),
  emoji        text not null default '💪',
  is_private   boolean not null default false,
  code         text not null default substr(md5(random()::text || clock_timestamp()::text), 1, 6),
  owner        uuid not null references auth.users (id) on delete cascade,
  member_count integer not null default 0,
  created      timestamptz not null default now()
);
create unique index if not exists groups_name on public.groups (lower(name));
create table if not exists public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id  uuid not null references auth.users (id) on delete cascade,
  role     text not null default 'member' check (role in ('owner', 'mod', 'member')),
  created  timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists group_members_user on public.group_members (user_id);

create table if not exists public.daily_stats (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null,
  xp      integer not null default 0,
  lessons integer not null default 0,
  logs    integer not null default 0,
  primary key (user_id, day)
);
create table if not exists public.challenges (
  id       uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups (id) on delete cascade,
  creator  uuid not null references auth.users (id) on delete cascade,
  title    text not null check (char_length(title) between 3 and 60),
  metric   text not null check (metric in ('xp', 'lessons', 'logs')),
  starts   date not null,
  ends     date not null,
  created  timestamptz not null default now(),
  check (ends >= starts)
);
create table if not exists public.challenge_members (
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  primary key (challenge_id, user_id)
);
create table if not exists public.duels (
  id         uuid primary key default gen_random_uuid(),
  challenger uuid not null references auth.users (id) on delete cascade,
  opponent   uuid not null references auth.users (id) on delete cascade,
  metric     text not null check (metric in ('xp', 'lessons', 'logs')),
  days       integer not null check (days between 1 and 14),
  starts     date,
  ends       date,
  status     text not null default 'pending' check (status in ('pending', 'active', 'declined')),
  created    timestamptz not null default now(),
  check (challenger <> opponent)
);
create table if not exists public.reactions (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind    text not null check (kind in ('like', 'strong', 'fire', 'clap')),
  primary key (post_id, user_id)
);
create table if not exists public.poll_votes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  option  integer not null check (option between 0 and 3),
  primary key (post_id, user_id)
);
create table if not exists public.notifications (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references auth.users (id) on delete cascade,
  kind     text not null,
  actor    uuid references auth.users (id) on delete cascade,
  post_id  uuid references public.posts (id) on delete cascade,
  group_id uuid references public.groups (id) on delete cascade,
  text     text not null default '',
  read     boolean not null default false,
  created  timestamptz not null default now()
);
create index if not exists notifications_user on public.notifications (user_id, created desc);
create table if not exists public.buddy_pool (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created timestamptz not null default now()
);
create table if not exists public.banned_words (word text primary key check (word = lower(word) and word ~ '^[a-zà-ÿα-ωά-ώ]+$'));

-- Tables that are only reached through functions: lock them down.
do $$
declare t text;
begin
  foreach t in array array['friendships', 'friend_requests', 'follows', 'messages', 'groups', 'group_members', 'daily_stats',
                           'challenges', 'challenge_members', 'duels', 'reactions', 'poll_votes', 'notifications', 'buddy_pool', 'banned_words']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
-- (no policies on those tables: authenticated users cannot read or write them directly)

-- Extend posts and reports
alter table public.posts
  add column if not exists group_id  uuid references public.groups (id) on delete cascade,
  add column if not exists image     text,
  add column if not exists poll      jsonb,
  add column if not exists reactions jsonb not null default '{}';
alter table public.posts drop constraint if exists posts_category_check;
alter table public.posts add constraint posts_category_check check (category in ('wins', 'questions', 'recipes', 'tips', 'chat'));
alter table public.reports drop constraint if exists reports_kind_check;
alter table public.reports add constraint reports_kind_check check (kind in ('post', 'comment', 'message', 'profile'));

drop trigger if exists likes_count on public.likes;
drop policy if exists "Read visible posts" on public.posts;
create or replace function public.is_group_member(p_group uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members m where m.group_id = p_group and m.user_id = auth.uid());
$$;
create policy "Read visible posts" on public.posts for select to authenticated using (not hidden and (group_id is null or public.is_group_member(group_id)));

-- 1. Helpers ----------------------------------------------------------------------------------
create or replace function public.is_friend(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.friendships where user_a = least(a, b) and user_b = greatest(a, b));
$$;
create or replace function public.is_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a));
$$;
create or replace function public.can_see(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select target = auth.uid()
      or public.is_friend(target, auth.uid())
      or coalesce((select not p.private from public.profile_private p where p.user_id = target), true);
$$;
create or replace function public.clean_text(p_text text) returns boolean   -- true when the text is fine
language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.banned_words w where replace(lower(p_text), '_', ' ') ~ ('\m' || w.word || '\M'));
$$;
create or replace function public.notify(p_user uuid, p_kind text, p_actor uuid, p_post uuid, p_group uuid, p_text text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null or p_user = p_actor then return; end if;
  if p_actor is not null and public.is_blocked(p_user, p_actor) then return; end if;
  insert into public.notifications (user_id, kind, actor, post_id, group_id, text) values (p_user, p_kind, p_actor, p_post, p_group, left(coalesce(p_text, ''), 120));
end $$;
create or replace function public.require_user() returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'account_required'; end if;
  if not exists (select 1 from public.profiles where user_id = auth.uid()) then raise exception 'username_required'; end if;
  return auth.uid();
end $$;
create or replace function public.mention_all(p_text text, p_actor uuid, p_post uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare m text[]; n integer := 0;
begin
  for m in select regexp_matches(lower(p_text), '@([a-z0-9_]{3,20})', 'g') loop
    exit when n >= 5;
    n := n + 1;
    perform public.notify((select user_id from public.profiles where lower(username) = m[1]), 'mention', p_actor, p_post, null, p_text);
  end loop;
end $$;

-- 2. Accounts and profiles ---------------------------------------------------------------------
create or replace function public.claim_username(p_name text, p_age_ok boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'account_required'; end if;
  if not coalesce(p_age_ok, false) then raise exception 'age_required'; end if;
  if not public.clean_text(p_name) then raise exception 'content_blocked'; end if;
  insert into public.profiles (user_id, username) values (auth.uid(), lower(p_name));
  insert into public.profile_private (user_id, age_ok) values (auth.uid(), true) on conflict (user_id) do update set age_ok = true;
end $$;

create or replace function public.update_profile(p_avatar text, p_color text, p_bio text, p_private boolean, p_show_stats boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_user();
  if not public.clean_text(p_bio) then raise exception 'content_blocked'; end if;
  update public.profiles set avatar = left(p_avatar, 8), color = p_color, bio = p_bio where user_id = auth.uid();
  insert into public.profile_private (user_id, private, show_stats) values (auth.uid(), p_private, p_show_stats)
    on conflict (user_id) do update set private = excluded.private, show_stats = excluded.show_stats;
end $$;

create or replace function public.my_profile()
returns table (username text, avatar text, color text, bio text, private boolean, show_stats boolean, invite_code text)
language sql stable security definer set search_path = '' as $$
  select p.username, p.avatar, p.color, p.bio, v.private, v.show_stats, v.invite_code
  from public.profiles p join public.profile_private v using (user_id) where p.user_id = auth.uid();
$$;

-- Client pushes its own totals; sane caps keep the boards honest enough for friends.
create or replace function public.sync_stats(p_xp integer, p_streak integer, p_badges jsonb, p_day date, p_day_xp integer, p_day_lessons integer, p_day_logs integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_user();
  insert into public.profile_private (user_id, xp, streak, badges) values (auth.uid(), least(greatest(p_xp, 0), 10000000), least(greatest(p_streak, 0), 5000),
    case when jsonb_typeof(p_badges) = 'array' then p_badges else '[]'::jsonb end)
  on conflict (user_id) do update set xp = excluded.xp, streak = excluded.streak, badges = excluded.badges, seen_at = now();
  if p_day between current_date - 1 and current_date + 1 then
    insert into public.daily_stats (user_id, day, xp, lessons, logs)
    values (auth.uid(), p_day, least(greatest(p_day_xp, 0), 1500), least(greatest(p_day_lessons, 0), 40), least(greatest(p_day_logs, 0), 100))
    on conflict (user_id, day) do update set xp = excluded.xp, lessons = excluded.lessons, logs = excluded.logs;
  end if;
end $$;

create or replace function public.public_profile(p_user uuid)
returns table (user_id uuid, username text, avatar text, color text, bio text, joined timestamptz, visible boolean,
               xp integer, streak integer, badges jsonb, followers integer, following integer, posts integer,
               i_follow boolean, friend_state text, league text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare me uuid := public.require_user();
begin
  if public.is_blocked(me, p_user) then return; end if;
  return query
  select p.user_id, p.username, p.avatar, p.color, p.bio, p.created_at,
         public.can_see(p.user_id) as visible,
         case when public.can_see(p.user_id) and v.show_stats then v.xp end,
         case when public.can_see(p.user_id) and v.show_stats then v.streak end,
         case when public.can_see(p.user_id) and v.show_stats then v.badges else '[]'::jsonb end,
         (select count(*)::int from public.follows f where f.followed = p.user_id),
         (select count(*)::int from public.follows f where f.follower = p.user_id),
         (select count(*)::int from public.posts x where x.user_id = p.user_id and not x.hidden and x.group_id is null),
         exists (select 1 from public.follows f where f.follower = me and f.followed = p.user_id),
         case when p.user_id = me then 'self'
              when public.is_friend(me, p.user_id) then 'friends'
              when exists (select 1 from public.friend_requests r where r.from_id = me and r.to_id = p.user_id) then 'sent'
              when exists (select 1 from public.friend_requests r where r.from_id = p.user_id and r.to_id = me) then 'received'
              else 'none' end,
         case when public.can_see(p.user_id) then public.league_of(p.user_id) end
  from public.profiles p join public.profile_private v on v.user_id = p.user_id
  where p.user_id = p_user;
end $$;

-- League: average weekly XP over the last four weeks picks the tier.
create or replace function public.league_of(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when w >= 1000 then 'diamond' when w >= 600 then 'sapphire' when w >= 300 then 'gold' when w >= 100 then 'silver' else 'bronze' end
  from (select coalesce(sum(xp), 0) / 4.0 as w from public.daily_stats where user_id = p_user and day > current_date - 28) s;
$$;

-- 3. Posts: checks, reactions, polls ------------------------------------------------------------
create or replace function public.check_post() returns trigger
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if not public.clean_text(new.title || ' ' || new.body) then raise exception 'content_blocked'; end if;
  if new.group_id is not null and not exists (select 1 from public.group_members m where m.group_id = new.group_id and m.user_id = new.user_id) then
    raise exception 'not_a_member';
  end if;
  if new.image is not null and new.image not like new.user_id::text || '/%' then raise exception 'invalid'; end if;
  if new.poll is not null then
    if jsonb_typeof(new.poll -> 'options') <> 'array' then raise exception 'invalid'; end if;
    n := jsonb_array_length(new.poll -> 'options');
    if n < 2 or n > 4 then raise exception 'invalid'; end if;
    if exists (select 1 from jsonb_array_elements_text(new.poll -> 'options') o where char_length(o) not between 1 and 40 or not public.clean_text(o)) then raise exception 'invalid'; end if;
    new.poll := jsonb_build_object('options', new.poll -> 'options');
  end if;
  return new;
end $$;
drop trigger if exists posts_check on public.posts;
create trigger posts_check before insert on public.posts for each row execute function public.check_post();

create or replace function public.after_post() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.mention_all(new.title || ' ' || new.body, new.user_id, new.id);
  return null;
end $$;
drop trigger if exists posts_after on public.posts;
create trigger posts_after after insert on public.posts for each row execute function public.after_post();

create or replace function public.check_comment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not public.clean_text(new.body) then raise exception 'content_blocked'; end if;
  if exists (select 1 from public.posts p where p.id = new.post_id and p.group_id is not null
             and not exists (select 1 from public.group_members m where m.group_id = p.group_id and m.user_id = new.user_id)) then
    raise exception 'not_a_member';
  end if;
  return new;
end $$;
drop trigger if exists comments_check on public.comments;
create trigger comments_check before insert on public.comments for each row execute function public.check_comment();

create or replace function public.after_comment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare owner uuid;
begin
  select user_id into owner from public.posts where id = new.post_id;
  perform public.notify(owner, 'comment', new.user_id, new.post_id, null, new.body);
  perform public.mention_all(new.body, new.user_id, new.post_id);
  return null;
end $$;
drop trigger if exists comments_after on public.comments;
create trigger comments_after after insert on public.comments for each row execute function public.after_comment();

create or replace function public.recount_reactions(p_post uuid) returns void
language sql security definer set search_path = '' as $$
  update public.posts set
    reactions = coalesce((select jsonb_object_agg(kind, c) from (select kind, count(*) c from public.reactions where post_id = p_post group by kind) q), '{}'::jsonb),
    like_count = (select count(*) from public.reactions where post_id = p_post)
  where id = p_post;
$$;

create or replace function public.react(p_post uuid, p_kind text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.require_user(); owner uuid; had boolean;
begin
  select user_id into owner from public.posts where id = p_post and not hidden;
  if owner is null then raise exception 'not_found'; end if;
  if p_kind is null then
    delete from public.reactions where post_id = p_post and user_id = me;
  else
    select exists (select 1 from public.reactions where post_id = p_post and user_id = me) into had;
    insert into public.reactions (post_id, user_id, kind) values (p_post, me, p_kind)
      on conflict (post_id, user_id) do update set kind = excluded.kind;
    if not had then perform public.notify(owner, 'reaction', me, p_post, null, p_kind); end if;
  end if;
  perform public.recount_reactions(p_post);
end $$;

create or replace function public.vote(p_post uuid, p_option integer) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.require_user(); n integer;
begin
  select jsonb_array_length(poll -> 'options') into n from public.posts where id = p_post and poll is not null and not hidden;
  if n is null or p_option < 0 or p_option >= n then raise exception 'invalid'; end if;
  insert into public.poll_votes (post_id, user_id, option) values (p_post, me, p_option)
    on conflict (post_id, user_id) do update set option = excluded.option;
end $$;

-- 4. Reading posts ----------------------------------------------------------------------------
drop function if exists public.forum_feed(text, timestamptz, integer);
drop function if exists public.forum_post(uuid);
drop function if exists public.forum_comments(uuid);

create or replace function public.post_rows(p_where_id uuid, p_category text, p_before timestamptz, p_limit integer, p_following boolean, p_group uuid, p_query text, p_author uuid)
returns table (id uuid, user_id uuid, username text, avatar text, color text, top_badge text, category text, title text, body text,
               image text, poll jsonb, group_id uuid, reactions jsonb, my_reaction text, comment_count integer, created_at timestamptz, mine boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare me uuid := public.require_user();
begin
  if p_group is not null and not exists (select 1 from public.groups g where g.id = p_group and (not g.is_private or exists (select 1 from public.group_members m where m.group_id = g.id and m.user_id = me))) then
    return;
  end if;
  return query
  select p.id, p.user_id, pr.username, pr.avatar, pr.color,
         case when public.can_see(p.user_id) and v.show_stats then v.badges ->> 0 end,
         p.category, p.title, p.body, p.image,
         case when p.poll is null then null else jsonb_build_object(
           'options', p.poll -> 'options',
           'counts', (select jsonb_agg(coalesce((select count(*) from public.poll_votes pv where pv.post_id = p.id and pv.option = i), 0) order by i)
                      from generate_series(0, jsonb_array_length(p.poll -> 'options') - 1) i),
           'mine', (select pv.option from public.poll_votes pv where pv.post_id = p.id and pv.user_id = me)) end,
         p.group_id, p.reactions,
         (select r.kind from public.reactions r where r.post_id = p.id and r.user_id = me),
         p.comment_count, p.created_at, p.user_id = me
  from public.posts p
  join public.profiles pr on pr.user_id = p.user_id
  left join public.profile_private v on v.user_id = p.user_id
  where not p.hidden
    and (p_where_id is null or p.id = p_where_id)
    and (p_category is null or p.category = p_category)
    and (p_before is null or p.created_at < p_before)
    and (p_author is null or p.user_id = p_author)
    and (case when p_where_id is not null then (p.group_id is null or exists (select 1 from public.group_members m where m.group_id = p.group_id and m.user_id = me))
              when p_group is not null then p.group_id = p_group
              else p.group_id is null end)
    and (not p_following or exists (select 1 from public.follows f where f.follower = me and f.followed = p.user_id))
    and (p_query is null or p_query = '' or p.title ilike '%' || replace(replace(p_query, '%', ''), '_', '') || '%' or p.body ilike '%' || replace(replace(p_query, '%', ''), '_', '') || '%')
    and not public.is_blocked(me, p.user_id)
    and (p_author is null or public.can_see(p.user_id))
  order by p.created_at desc
  limit least(greatest(p_limit, 1), 50);
end $$;

create or replace function public.forum_feed(p_category text default null, p_before timestamptz default null, p_limit integer default 20,
                                             p_following boolean default false, p_group uuid default null, p_query text default null, p_author uuid default null)
returns table (id uuid, user_id uuid, username text, avatar text, color text, top_badge text, category text, title text, body text,
               image text, poll jsonb, group_id uuid, reactions jsonb, my_reaction text, comment_count integer, created_at timestamptz, mine boolean)
language sql stable security definer set search_path = '' as $$
  select * from public.post_rows(null, p_category, p_before, p_limit, p_following, p_group, p_query, p_author);
$$;
create or replace function public.forum_post(p_id uuid)
returns table (id uuid, user_id uuid, username text, avatar text, color text, top_badge text, category text, title text, body text,
               image text, poll jsonb, group_id uuid, reactions jsonb, my_reaction text, comment_count integer, created_at timestamptz, mine boolean)
language sql stable security definer set search_path = '' as $$
  select * from public.post_rows(p_id, null, null, 1, false, null, null, null);
$$;

create or replace function public.forum_comments(p_post uuid)
returns table (id uuid, user_id uuid, username text, avatar text, color text, body text, created_at timestamptz, mine boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare me uuid := public.require_user();
begin
  if not exists (select 1 from public.posts p where p.id = p_post and not p.hidden
                 and (p.group_id is null or exists (select 1 from public.group_members m where m.group_id = p.group_id and m.user_id = me))) then
    return;
  end if;
  return query
  select c.id, c.user_id, pr.username, pr.avatar, pr.color, c.body, c.created_at, c.user_id = me
  from public.comments c join public.profiles pr on pr.user_id = c.user_id
  where c.post_id = p_post and not c.hidden and not public.is_blocked(me, c.user_id)
  order by c.created_at asc limit 200;
end $$;

-- Group moderators can remove posts in their group.
create or replace function public.mod_remove_post(p_post uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.require_user(); g uuid;
begin
  select group_id into g from public.posts where id = p_post;
  if g is null or not exists (select 1 from public.group_members where group_id = g and user_id = me and role in ('owner', 'mod')) then raise exception 'forbidden'; end if;
  delete from public.posts where id = p_post;
end $$;

-- Top post tagged "tips" in the last 7 days.
create or replace function public.tip_of_the_week()
returns table (id uuid, username text, title text, body text, score integer)
language sql stable security definer set search_path = '' as $$
  select p.id, pr.username, p.title, p.body, p.like_count
  from public.posts p join public.profiles pr on pr.user_id = p.user_id
  where p.category = 'tips' and not p.hidden and p.group_id is null and p.created_at > now() - interval '7 days' and p.like_count > 0
    and not public.is_blocked(auth.uid(), p.user_id)
  order by p.like_count desc, p.created_at desc limit 1;
$$;

-- 5. Following, friends, invites, messages --------------------------------------------------------
create or replace function public.follow_user(p_user uuid, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.require_user();
begin
  if me = p_user or public.is_blocked(me, p_user) then raise exception 'forbidden'; end if;
  if p_on then
    insert into public.follows (follower, followed) values (me, p_user) on conflict do nothing;
    perform public.notify(p_user, 'follow', me, null, null, '');
  else
    delete from public.follows where follower = me and followed = p_user;
  end if;
end $$;

create or replace function public.friend_request(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.require_user();
begin
  if me = p_user or public.is_blocked(me, p_user) then raise exception 'forbidden'; end if;
  if public.is_friend(me, p_user) then return; end if;
  if exists (select 1 from public.friend_requests where from_id = p_user and to_id = me) then
    perform public.friend_respond(p_user, true);
    return;
  end if;
  if (select count(*) from public.friend_requests where from_id = me) >= 50 then raise exception 'rate_limited'; end if;
  insert into public.friend_requests (from_id, to_id) values (me, p_user) on conflict do nothing;
  perform public.notify(p_user, 'friend_request', me, null, null, '');
end $$;

create or replace function public.friend_respond(p_user uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.require_user();
begin
  if not exists (select 1 from public.friend_requests where from_id = p_user and to_id = me) then return; end if;
  delete from public.friend_requests where from_id = p_user and to_id = me;
  if p_accept then
    insert into public.friendships (user_a, user_b) values (least(me, p_user), greatest(me, p_user)) on conflict do nothing;
    perform public.notify(p_user, 'friend_accept', me, null, null, '');
  end if;
end $$;

create or replace function public.friend_cancel(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.require_user();
begin
  delete from public.friend_requests where from_id = me and to_id = p_user;
end $$;

create or replace function public.unfriend(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.require_user();
begin
  delete from public.friendships where user_a = least(me, p_user) and user_b = greatest(me, p_user);
end $$;

-- An invite code turns into an instant friendship.
create or replace function public.redeem_invite(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.require_user(); other uuid;
begin
  select user_id into other from public.profile_private where invite_code = lower(trim(p_code));
  if other is null then raise exception 'not_found'; end if;
  if other = me or public.is_blocked(me, other) then raise exception 'forbidden'; end if;
  insert into public.friendships (user_a, user_b) values (least(me, other), greatest(me, other)) on conflict do nothing;
  delete from public.friend_requests where (from_id = me and to_id = other) or (from_id = other and to_id = me);
  perform public.notify(other, 'friend_accept', me, null, null, '');
  return other;
end $$;

create or replace function public.my_friends()
returns table (user_id uuid, username text, avatar text, color text, buddy boolean, unread integer, last_body text, last_at timestamptz, streak integer, league text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare me uuid := public.require_user();
begin
  return query
  select f.other, pr.username, pr.avatar, pr.color, f.buddy,
         (select count(*)::int from public.messages m where m.sender = f.other and m.receiver = me and not m.read),
         (select m.body from public.messages m where (m.sender = me and m.receiver = f.other) or (m.sender = f.other and m.receiver = me) order by m.created desc limit 1),
         (select m.created from public.messages m where (m.sender = me and m.receiver = f.other) or (m.sender = f.other and m.receiver = me) order by m.created desc limit 1),
         case when v.show_stats then v.streak end,
         public.league_of(f.other)
  from (select case when fs.user_a = me then fs.user_b else fs.user_a end as other, fs.buddy as buddy from public.friendships fs where fs.user_a = me or fs.user_b = me) f
  join public.profiles pr on pr.user_id = f.other
  join public.profile_private v on v.user_id = f.other
  where not public.is_blocked(me, f.other)
  order by (select max(m.created) from public.messages m where (m.sender = me and m.receiver = f.other) or (m.sender = f.other and m.receiver = me)) desc nulls last, pr.username;
end $$;

create or replace function public.my_requests()
returns table (user_id uuid, username text, avatar text, color text, incoming boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare me uuid := public.require_user();
begin
  return query
  select case when r.to_id = me then r.from_id else r.to_id end, pr.username, pr.avatar, pr.color, r.to_id = me
  from public.friend_requests r
  join public.profiles pr on pr.user_id = case when r.to_id = me then r.from_id else r.to_id end
  where (r.to_id = me or r.from_id = me) and not public.is_blocked(me, pr.user_id)
  order by r.created desc;
end $$;

create or replace function public.people(p_query text)
returns table (user_id uuid, username text, avatar text, color text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare me uuid := public.require_user();
begin
  return query
  select p.user_id, p.username, p.avatar, p.color from public.profiles p
  where p.user_id <> me and p.username like replace(replace(lower(trim(p_query)), '%', ''), '_', '') || '%' and char_length(trim(p_query)) >= 2
    and not public.is_blocked(me, p.user_id)
  order by p.username limit 15;
end $$;

create or replace function public.send_message(p_to uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.require_user();
begin
  if not public.is_friend(me, p_to) or public.is_blocked(me, p_to) then raise exception 'forbidden'; end if;
  if not public.clean_text(p_body) then raise exception 'content_blocked'; end if;
  if (select count(*) from public.messages where sender = me and created > now() - interval '10 seconds') >= 8 then raise exception 'rate_limited'; end if;
  insert into public.messages (sender, receiver, body) values (me, p_to, p_body);
end $$;

create or replace function public.conversation(p_with uuid)
returns table (id uuid, mine boolean, body text, created timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare me uuid := public.require_user();
begin
  if not public.is_friend(me, p_with) then return; end if;
  update public.messages set read = true where sender = p_with and receiver = me and not read;
  return query
  select * from (
    select m.id, m.sender = me, m.body, m.created from public.messages m
    where (m.sender = me and m.receiver = p_with) or (m.sender = p_with and m.receiver = me)
    order by m.created desc limit 100) x order by x.created asc;
end $$;

create or replace function public.unread_messages() returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.messages m where m.receiver = auth.uid() and not m.read;
$$;

-- 6. Groups ---------------------------------------------------------------------------------------
create or replace function public.bump_members() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then update public.groups set member_count = member_count + 1 where id = new.group_id;
  else update public.groups set member_count = greatest(member_count - 1, 0) where id = old.group_id; end if;
  return null;
end $$;
drop trigger if exists group_members_count on public.group_members;
create trigger group_members_count after insert or delete on public.group_members for each row execute function public.bump_members();

create or replace function public.create_group(p_name text, p_description text, p_emoji text, p_private boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.require_user(); gid uuid;
begin
  if not public.clean_text(p_name || ' ' || p_description) then raise exception 'content_blocked'; end if;
  if (select count(*) from public.groups where owner = me) >= 5 then raise exception 'rate_limited'; end if;
  insert into public.groups (name, description, emoji, is_private, owner) values (trim(p_name), p_description, left(p_emoji, 8), p_private, me) returning id into gid;
  insert into public.group_members (group_id, user_id, role) values (gid, me, 'owner');
  return gid;
end $$;

create or replace function public.join_group(p_group uuid, p_code text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.require_user(); g public.groups;
begin
  select * into g from public.groups where id = p_group;
  if g.id is null then raise exception 'not_found'; end if;
  if g.is_private and coalesce(lower(trim(p_code)), '') <> g.code then raise exception 'forbidden'; end if;
  insert into public.group_members (group_id, user_id) values (p_group, me) on conflict do nothing;
end $$;

-- A private group can also be joined with just its code.
create or replace function public.join_group_by_code(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.require_user(); gid uuid;
begin
  select id into gid from public.groups where code = lower(trim(p_code));
  if gid is null then raise exception 'not_found'; end if;
  insert into public.group_members (group_id, user_id) values (gid, me) on conflict do nothing;
  return gid;
end $$;

create or replace function public.leave_group(p_group uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.require_user(); other uuid;
begin
  delete from public.group_members where group_id = p_group and user_id = me;
  if not exists (select 1 from public.group_members where group_id = p_group and role = 'owner') then
    select user_id into other from public.group_members where group_id = p_group order by (role = 'mod') desc, created asc limit 1;
    if other is null then delete from public.groups where id = p_group;
    else update public.group_members set role = 'owner' where group_id = p_group and user_id = other; update public.groups set owner = other where id = p_group; end if;
  end if;
end $$;

create or replace function public.group_rows(p_member_only boolean, p_query text)
returns table (id uuid, name text, description text, emoji text, is_private boolean, member_count integer, role text, code text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare me uuid := public.require_user();
begin
  return query
  select g.id, g.name, g.description, g.emoji, g.is_private, g.member_count, m.role,
         case when m.role in ('owner', 'mod') then g.code end
  from public.groups g left join public.group_members m on m.group_id = g.id and m.user_id = me
  where (not p_member_only or m.user_id is not null)
    and (m.user_id is not null or not g.is_private)
    and (p_query is null or p_query = '' or g.name ilike '%' || replace(replace(p_query, '%', ''), '_', '') || '%')
  order by (m.user_id is not null) desc, g.member_count desc, g.name limit 40;
end $$;
create or replace function public.my_groups() returns table (id uuid, name text, description text, emoji text, is_private boolean, member_count integer, role text, code text)
language sql stable security definer set search_path = '' as $$ select * from public.group_rows(true, null); $$;
create or replace function public.discover_groups(p_query text default null) returns table (id uuid, name text, description text, emoji text, is_private boolean, member_count integer, role text, code text)
language sql stable security definer set search_path = '' as $$ select * from public.group_rows(false, p_query); $$;

create or replace function public.group_members_list(p_group uuid)
returns table (user_id uuid, username text, avatar text, color text, role text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare me uuid := public.require_user();
begin
  if not exists (select 1 from public.group_members where group_id = p_group and user_id = me)
     and exists (select 1 from public.groups where id = p_group and is_private) then return; end if;
  return query
  select m.user_id, pr.username, pr.avatar, pr.color, m.role
  from public.group_members m join public.profiles pr on pr.user_id = m.user_id
  where m.group_id = p_group and not public.is_blocked(me, m.user_id)
  order by (m.role = 'owner') desc, (m.role = 'mod') desc, pr.username limit 100;
end $$;

create or replace function public.set_member_role(p_group uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.require_user();
begin
  if p_role not in ('mod', 'member') then raise exception 'invalid'; end if;
  if not exists (select 1 from public.group_members where group_id = p_group and user_id = me and role = 'owner') then raise exception 'forbidden'; end if;
  update public.group_members set role = p_role where group_id = p_group and user_id = p_user and role <> 'owner';
end $$;

create or replace function public.remove_member(p_group uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.require_user();
begin
  if not exists (select 1 from public.group_members where group_id = p_group and user_id = me and role in ('owner', 'mod')) then raise exception 'forbidden'; end if;
  delete from public.group_members where group_id = p_group and user_id = p_user and role = 'member';
end $$;

-- 7. Stats, challenges, duels, boards ---------------------------------------------------------------
create or replace function public.metric_sum(p_user uuid, p_metric text, p_from date, p_to date) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(case p_metric when 'xp' then xp when 'lessons' then lessons else logs end), 0)::int
  from public.daily_stats where user_id = p_user and day between p_from and p_to;
$$;

create or replace function public.create_challenge(p_group uuid, p_title text, p_metric text, p_days integer) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.require_user(); cid uuid;
begin
  if not public.clean_text(p_title) then raise exception 'content_blocked'; end if;
  if p_group is null or not exists (select 1 from public.group_members where group_id = p_group and user_id = me) then raise exception 'forbidden'; end if;
  if (select count(*) from public.challenges where group_id = p_group and ends >= current_date) >= 5 then raise exception 'rate_limited'; end if;
  insert into public.challenges (group_id, creator, title, metric, starts, ends)
  values (p_group, me, trim(p_title), p_metric, current_date, current_date + least(greatest(p_days, 1), 30) - 1) returning id into cid;
  insert into public.challenge_members (challenge_id, user_id) values (cid, me);
  return cid;
end $$;

create or replace function public.join_challenge(p_challenge uuid, p_on boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.require_user();
begin
  if not exists (select 1 from public.challenges c join public.group_members m on m.group_id = c.group_id and m.user_id = me where c.id = p_challenge) then raise exception 'forbidden'; end if;
  if p_on then insert into public.challenge_members values (p_challenge, me) on conflict do nothing;
  else delete from public.challenge_members where challenge_id = p_challenge and user_id = me; end if;
end $$;

create or replace function public.group_challenges(p_group uuid)
returns table (id uuid, title text, metric text, starts date, ends date, joined boolean, members integer, mine integer, leader text, leader_score integer, active boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare me uuid := public.require_user();
begin
  if not exists (select 1 from public.group_members where group_id = p_group and user_id = me) then return; end if;
  return query
  select c.id, c.title, c.metric, c.starts, c.ends,
         exists (select 1 from public.challenge_members cm where cm.challenge_id = c.id and cm.user_id = me),
         (select count(*)::int from public.challenge_members cm where cm.challenge_id = c.id),
         public.metric_sum(me, c.metric, c.starts, c.ends),
         top.username, top.score, c.ends >= current_date
  from public.challenges c
  left join lateral (
    select pr.username, public.metric_sum(cm.user_id, c.metric, c.starts, c.ends) as score
    from public.challenge_members cm join public.profiles pr on pr.user_id = cm.user_id
    where cm.challenge_id = c.id order by 2 desc, pr.username limit 1) top on true
  where c.group_id = p_group and c.ends >= current_date - 14
  order by c.ends desc;
end $$;

create or replace function public.challenge_board(p_challenge uuid)
returns table (rank integer, user_id uuid, username text, avatar text, color text, score integer, mine boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare me uuid := public.require_user(); c public.challenges;
begin
  select * into c from public.challenges where id = p_challenge;
  if c.id is null or not exists (select 1 from public.group_members where group_id = c.group_id and user_id = me) then return; end if;
  return query
  select (rank() over (order by public.metric_sum(cm.user_id, c.metric, c.starts, c.ends) desc))::int, cm.user_id, pr.username, pr.avatar, pr.color,
         public.metric_sum(cm.user_id, c.metric, c.starts, c.ends), cm.user_id = me
  from public.challenge_members cm join public.profiles pr on pr.user_id = cm.user_id
  where cm.challenge_id = p_challenge
  order by 6 desc, pr.username limit 30;
end $$;

create or replace function public.duel_invite(p_user uuid, p_metric text, p_days integer) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.require_user();
begin
  if not public.is_friend(me, p_user) then raise exception 'forbidden'; end if;
  if (select count(*) from public.duels where status <> 'declined' and (ends is null or ends >= current_date) and (challenger = me or opponent = me)) >= 6 then raise exception 'rate_limited'; end if;
  insert into public.duels (challenger, opponent, metric, days) values (me, p_user, p_metric, least(greatest(p_days, 1), 14));
  perform public.notify(p_user, 'duel', me, null, null, p_metric);
end $$;

create or replace function public.duel_respond(p_duel uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.require_user(); d public.duels;
begin
  select * into d from public.duels where id = p_duel and opponent = me and status = 'pending';
  if d.id is null then return; end if;
  if p_accept then
    update public.duels set status = 'active', starts = current_date, ends = current_date + d.days - 1 where id = p_duel;
    perform public.notify(d.challenger, 'duel_accept', me, null, null, d.metric);
  else
    update public.duels set status = 'declined' where id = p_duel;
  end if;
end $$;

create or replace function public.my_duels()
returns table (id uuid, other uuid, username text, avatar text, color text, metric text, days integer, status text, incoming boolean,
               starts date, ends date, mine integer, theirs integer, finished boolean, won boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare me uuid := public.require_user();
begin
  return query
  select d.id, o.user_id, o.username, o.avatar, o.color, d.metric, d.days, d.status, d.opponent = me, d.starts, d.ends,
         case when d.starts is null then 0 else public.metric_sum(me, d.metric, d.starts, d.ends) end,
         case when d.starts is null then 0 else public.metric_sum(o.user_id, d.metric, d.starts, d.ends) end,
         d.ends is not null and d.ends < current_date,
         d.ends is not null and d.ends < current_date and public.metric_sum(me, d.metric, d.starts, d.ends) > public.metric_sum(o.user_id, d.metric, d.starts, d.ends)
  from public.duels d
  join public.profiles o on o.user_id = case when d.challenger = me then d.opponent else d.challenger end
  where (d.challenger = me or d.opponent = me) and d.status in ('pending', 'active')
    and (d.ends is null or d.ends >= current_date - 7)
    and not public.is_blocked(me, o.user_id)
  order by (d.status = 'pending') desc, d.created desc;
end $$;

-- Weekly boards (Monday to Sunday). scope: global | friends | league | a group id.
create or replace function public.leaderboard(p_scope text, p_metric text)
returns table (rank integer, user_id uuid, username text, avatar text, color text, score integer, mine boolean, league text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare me uuid := public.require_user(); wk date := date_trunc('week', current_date)::date; mine_league text := public.league_of(me);
begin
  if p_metric not in ('xp', 'lessons', 'logs') then raise exception 'invalid'; end if;
  return query
  with pool as (
    select pr.user_id, pr.username, pr.avatar, pr.color, public.league_of(pr.user_id) as lg
    from public.profiles pr join public.profile_private v on v.user_id = pr.user_id
    where not public.is_blocked(me, pr.user_id)
      and case
        when p_scope = 'friends' then pr.user_id = me or public.is_friend(me, pr.user_id)
        when p_scope = 'global' or p_scope = 'league' then pr.user_id = me or not v.private
        else exists (select 1 from public.group_members gm where gm.group_id = p_scope::uuid and gm.user_id = pr.user_id)
             and exists (select 1 from public.group_members gm where gm.group_id = p_scope::uuid and gm.user_id = me) end
  ), scored as (
    select p.*, public.metric_sum(p.user_id, p_metric, wk, wk + 6) as sc from pool p
    where p_scope <> 'league' or p.lg = mine_league
  ), ranked as (
    select (rank() over (order by s.sc desc))::int as rk, s.* from scored s
  )
  select r.rk, r.user_id, r.username, r.avatar, r.color, r.sc, r.user_id = me, r.lg
  from ranked r
  where r.rk <= 20 or r.user_id = me
  order by r.rk, r.username limit 25;
end $$;

create or replace function public.my_league() returns text
language sql stable security definer set search_path = '' as $$ select public.league_of(auth.uid()); $$;

-- 8. Notifications, buddy matching, reports -----------------------------------------------------------
create or replace function public.my_notifications(p_limit integer default 30)
returns table (id uuid, kind text, actor uuid, username text, avatar text, color text, post_id uuid, text text, read boolean, created timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare me uuid := public.require_user();
begin
  return query
  select n.id, n.kind, n.actor, pr.username, pr.avatar, pr.color, n.post_id, n.text, n.read, n.created
  from public.notifications n left join public.profiles pr on pr.user_id = n.actor
  where n.user_id = me order by n.created desc limit least(greatest(p_limit, 1), 60);
end $$;
create or replace function public.unread_notifications() returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.notifications where user_id = auth.uid() and not read;
$$;
create or replace function public.read_notifications() returns void
language sql security definer set search_path = '' as $$
  update public.notifications set read = true where user_id = auth.uid() and not read;
$$;

-- Finds someone waiting for a buddy, or puts you in the line.
create or replace function public.request_buddy() returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.require_user(); other uuid;
begin
  select b.user_id into other from public.buddy_pool b
  where b.user_id <> me and not public.is_blocked(me, b.user_id) and not public.is_friend(me, b.user_id)
  order by b.created asc limit 1 for update skip locked;
  if other is null then
    insert into public.buddy_pool (user_id) values (me) on conflict do nothing;
    return null;
  end if;
  delete from public.buddy_pool where user_id in (me, other);
  insert into public.friendships (user_a, user_b, buddy) values (least(me, other), greatest(me, other), true)
    on conflict (user_a, user_b) do update set buddy = true;
  perform public.notify(other, 'buddy', me, null, null, '');
  return other;
end $$;
create or replace function public.cancel_buddy() returns void
language sql security definer set search_path = '' as $$ delete from public.buddy_pool where user_id = auth.uid(); $$;
create or replace function public.buddy_waiting() returns boolean
language sql stable security definer set search_path = '' as $$ select exists (select 1 from public.buddy_pool where user_id = auth.uid()); $$;

-- Reports: block messages and profiles can be reported too; three reporters hide posts/comments.
create or replace function public.report_content(p_kind text, p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.require_user();
begin
  insert into public.reports (reporter_id, kind, target_id, reason) values (me, p_kind, p_id, left(p_reason, 40)) on conflict do nothing;
end $$;

create or replace function public.forum_blocked_v2()
returns table (user_id uuid, username text)
language sql stable security definer set search_path = '' as $$
  select b.blocked_id, pr.username from public.blocks b join public.profiles pr on pr.user_id = b.blocked_id where b.blocker_id = auth.uid() order by pr.username;
$$;

-- Blocking also ends friendships, follows and requests.
create or replace function public.after_block() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.friendships where user_a = least(new.blocker_id, new.blocked_id) and user_b = greatest(new.blocker_id, new.blocked_id);
  delete from public.follows where (follower = new.blocker_id and followed = new.blocked_id) or (follower = new.blocked_id and followed = new.blocker_id);
  delete from public.friend_requests where (from_id = new.blocker_id and to_id = new.blocked_id) or (from_id = new.blocked_id and to_id = new.blocker_id);
  return null;
end $$;
drop trigger if exists blocks_after on public.blocks;
create trigger blocks_after after insert on public.blocks for each row execute function public.after_block();

-- 9. Word filter seed (extend it in Table editor > banned_words) ----------------------------------------------
insert into public.banned_words (word) values
  ('fuck'), ('fucking'), ('shit'), ('bitch'), ('asshole'), ('bastard'), ('cunt'), ('dick'), ('slut'), ('whore'),
  ('retard'), ('nigger'), ('nigga'), ('faggot'), ('puta'), ('mierda'), ('cabron'), ('pendejo'), ('malaka'), ('malakas'), ('gamoto')
on conflict do nothing;

-- 10. Photo storage ------------------------------------------------------------------------------------------
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('post-images', 'post-images', true) on conflict (id) do nothing;
    drop policy if exists "Upload own post images" on storage.objects;
    drop policy if exists "Delete own post images" on storage.objects;
    create policy "Upload own post images" on storage.objects for insert to authenticated
      with check (bucket_id = 'post-images' and (storage.foldername(name))[1] = auth.uid()::text);
    create policy "Delete own post images" on storage.objects for delete to authenticated
      using (bucket_id = 'post-images' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $$;

-- 11. Who may call what ----------------------------------------------------------------------------------------
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind = 'f' and p.proname not in ('bump_like_count', 'bump_comment_count', 'limit_posts', 'limit_comments', 'auto_hide',
             'check_post', 'after_post', 'check_comment', 'after_comment', 'bump_members', 'after_block', 'delete_my_account')
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
