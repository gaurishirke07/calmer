-- CALMER Database Schema
-- Tables for profiles, game sessions, chat sessions, and messages

-- Profiles table (extends auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);
create policy "profiles_delete_own" on public.profiles for delete using (auth.uid() = id);

-- Game sessions table
create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  start_rage_level integer not null default 100,
  end_rage_level integer not null default 0,
  duration_seconds integer not null default 0,
  interactions_count integer not null default 0,
  created_at timestamptz default now()
);

alter table public.game_sessions enable row level security;

create policy "game_sessions_select_own" on public.game_sessions for select using (auth.uid() = user_id);
create policy "game_sessions_insert_own" on public.game_sessions for insert with check (auth.uid() = user_id);
create policy "game_sessions_update_own" on public.game_sessions for update using (auth.uid() = user_id);
create policy "game_sessions_delete_own" on public.game_sessions for delete using (auth.uid() = user_id);

-- Chat sessions table
create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game_session_id uuid references public.game_sessions(id) on delete set null,
  initial_rage_level integer not null default 50,
  final_mood text,
  created_at timestamptz default now()
);

alter table public.chat_sessions enable row level security;

create policy "chat_sessions_select_own" on public.chat_sessions for select using (auth.uid() = user_id);
create policy "chat_sessions_insert_own" on public.chat_sessions for insert with check (auth.uid() = user_id);
create policy "chat_sessions_update_own" on public.chat_sessions for update using (auth.uid() = user_id);
create policy "chat_sessions_delete_own" on public.chat_sessions for delete using (auth.uid() = user_id);

-- Chat messages table
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_session_id uuid not null references public.chat_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz default now()
);

alter table public.chat_messages enable row level security;

create policy "chat_messages_select_own" on public.chat_messages for select using (auth.uid() = user_id);
create policy "chat_messages_insert_own" on public.chat_messages for insert with check (auth.uid() = user_id);
create policy "chat_messages_update_own" on public.chat_messages for update using (auth.uid() = user_id);
create policy "chat_messages_delete_own" on public.chat_messages for delete using (auth.uid() = user_id);

-- Trigger to auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
