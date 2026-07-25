-- CALMER Database Schema Upgrade
-- Adds chat persistence, titles, summaries, emotions, user memories, and mood logs

-- 1. Upgrade chat_sessions table
alter table public.chat_sessions 
add column if not exists title text default 'New Conversation',
add column if not exists summary text,
add column if not exists mood text default 'neutral',
add column if not exists anger_level integer default 50,
add column if not exists stress_level integer default 50,
add column if not exists updated_at timestamptz default now();

-- 2. Upgrade chat_messages table
alter table public.chat_messages 
add column if not exists emotion text default 'neutral';

-- 3. Create user_memories table
create table if not exists public.user_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('trigger', 'relaxation', 'goal', 'stress_work', 'stress_family', 'stress_exam', 'hobby', 'other')),
  memory_text text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.user_memories enable row level security;

create policy "user_memories_select_own" on public.user_memories for select using (auth.uid() = user_id);
create policy "user_memories_insert_own" on public.user_memories for insert with check (auth.uid() = user_id);
create policy "user_memories_update_own" on public.user_memories for update using (auth.uid() = user_id);
create policy "user_memories_delete_own" on public.user_memories for delete using (auth.uid() = user_id);

-- 4. Create mood_logs table
create table if not exists public.mood_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  chat_session_id uuid references public.chat_sessions(id) on delete set null,
  dominant_emotion text not null default 'neutral',
  anger_level integer not null default 50,
  stress_level integer not null default 50,
  trigger_source text,
  notes text,
  created_at timestamptz default now()
);

alter table public.mood_logs enable row level security;

create policy "mood_logs_select_own" on public.mood_logs for select using (auth.uid() = user_id);
create policy "mood_logs_insert_own" on public.mood_logs for insert with check (auth.uid() = user_id);
create policy "mood_logs_update_own" on public.mood_logs for update using (auth.uid() = user_id);
create policy "mood_logs_delete_own" on public.mood_logs for delete using (auth.uid() = user_id);
