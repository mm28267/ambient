-- ============================================================================
-- Ambient — Initial schema
-- ============================================================================
-- Tables: profiles, groups, group_members, group_invites, listening_events
-- All tables use Row Level Security (RLS).
--
-- IMPORTANT: We use a SECURITY DEFINER helper function (is_group_member) for
-- membership checks inside policies. Doing the check directly with an EXISTS
-- subquery against group_members causes infinite recursion when RLS is on,
-- because evaluating the policy triggers the policy. SECURITY DEFINER lets the
-- inner query bypass RLS.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- Cleanup: drop existing tables and functions if they exist (dev only).
-- ----------------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop function if exists public.is_group_member(uuid);
drop table if exists public.listening_events cascade;
drop table if exists public.group_invites cascade;
drop table if exists public.group_members cascade;
drop table if exists public.groups cascade;
drop table if exists public.profiles cascade;


-- ============================================================================
-- TABLES
-- ============================================================================

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  spotify_id text,
  timezone text default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  emoji text,
  cadence_days integer not null default 14,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  invite_code text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);

create index on public.group_invites (invite_code);

create table public.listening_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  track_name text not null,
  artist text not null,
  album text,
  album_art_url text,
  spotify_track_id text not null,
  track_url text,
  is_currently_playing boolean not null default false,
  played_at timestamptz not null default now()
);

create index on public.listening_events (user_id, played_at desc);
create index on public.listening_events (user_id, is_currently_playing) where is_currently_playing = true;


-- ============================================================================
-- HELPER FUNCTION (the key to avoiding recursion)
-- ============================================================================
-- Returns true if the current user is a member of the given group.
-- SECURITY DEFINER means it runs as the function owner (postgres), so the
-- inner query against group_members bypasses RLS — which is what breaks the
-- recursion loop.
-- ----------------------------------------------------------------------------
create or replace function public.is_group_member(gid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid
      and user_id = auth.uid()
  );
$$;


-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invites enable row level security;
alter table public.listening_events enable row level security;


-- profiles ------------------------------------------------------------------
create policy "Profiles are viewable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);


-- groups --------------------------------------------------------------------
create policy "Users see groups they belong to"
  on public.groups for select
  to authenticated
  using (public.is_group_member(id));

create policy "Authenticated users can create groups"
  on public.groups for insert
  to authenticated
  with check (created_by = auth.uid());


-- group_members -------------------------------------------------------------
create policy "Members see other members of their groups"
  on public.group_members for select
  to authenticated
  using (public.is_group_member(group_id));

create policy "Users can join groups"
  on public.group_members for insert
  to authenticated
  with check (user_id = auth.uid());


-- group_invites -------------------------------------------------------------
create policy "Invites are readable by code"
  on public.group_invites for select
  to authenticated
  using (true);

create policy "Members can create invites"
  on public.group_invites for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and public.is_group_member(group_id)
  );


-- listening_events ----------------------------------------------------------
-- A user sees their own events, plus events from anyone they share a group with.
-- We can't easily express "shares a group" in a single is_group_member call, so
-- this one stays as an EXISTS subquery — but listening_events doesn't reference
-- itself, so no recursion risk. The inner SELECT of group_members triggers
-- group_members' SELECT policy, which now uses is_group_member (no recursion).
-- ----------------------------------------------------------------------------
create policy "Members see each other's listening events"
  on public.listening_events for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.group_members gm
      where gm.user_id = listening_events.user_id
        and public.is_group_member(gm.group_id)
    )
  );

create policy "Users insert their own listening events"
  on public.listening_events for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users update their own listening events"
  on public.listening_events for update
  to authenticated
  using (user_id = auth.uid());


-- ============================================================================
-- TRIGGERS
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url, spotify_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.email),
    new.raw_user_meta_data->>'avatar_url',
    new.raw_user_meta_data->>'provider_id'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ============================================================================
-- BACKFILL
-- ============================================================================

insert into public.profiles (id, display_name, avatar_url, spotify_id)
select
  id,
  coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', email),
  raw_user_meta_data->>'avatar_url',
  raw_user_meta_data->>'provider_id'
from auth.users
on conflict (id) do nothing;
