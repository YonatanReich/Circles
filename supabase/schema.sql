-- Circles — schema, indexes and row level security.
-- Paste into the Supabase SQL editor and run. Safe to re-run.
--
-- Accounts are email + password. In the dashboard, under
-- Authentication -> Sign In / Providers -> Email, make sure the provider is
-- enabled and turn OFF "Confirm email" (otherwise signing up returns no
-- session until the emailed link is clicked, and Supabase's built-in mailer is
-- rate limited to a handful of messages an hour).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- tables ---

create table if not exists goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  description text,
  deadline    timestamptz,
  color       text not null default 'sky'
              check (color in ('sky', 'violet', 'rose', 'emerald', 'indigo', 'coral')),
  created_at  timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists tasks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null check (length(trim(title)) > 0),
  description text,
  -- Always absolute. For a recurring task this is the first occurrence; later
  -- ones are derived client-side rather than stored.
  deadline    timestamptz not null,
  importance  smallint not null default 0 check (importance between 0 and 2),
  -- One-off completion only. Recurring completion lives in `occurrences`.
  completed_at timestamptz,
  recurrence  jsonb,
  created_at  timestamptz not null default now()
);

create table if not exists subtasks (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id  uuid not null references tasks (id) on delete cascade,
  title    text not null,
  done     boolean not null default false,
  position int not null default 0
);

-- A plain label: health, financial, admin. No deadline, no description — that
-- is what separates a tag from a goal.
create table if not exists tags (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  color      text not null default 'sky'
             check (color in ('sky', 'violet', 'rose', 'emerald', 'indigo', 'coral')),
  created_at timestamptz not null default now(),
  -- One "Health" per person; duplicates would defeat the point of a tag.
  unique (user_id, name)
);

-- A task can carry any number of goals and any number of tags.
create table if not exists task_goals (
  task_id uuid not null references tasks (id) on delete cascade,
  goal_id uuid not null references goals (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  primary key (task_id, goal_id)
);

create table if not exists task_tags (
  task_id uuid not null references tasks (id) on delete cascade,
  tag_id  uuid not null references tags (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  primary key (task_id, tag_id)
);

-- One row per completed instance of a recurring task. Absence means outstanding,
-- which is what keeps an endless daily task a single `tasks` row.
create table if not exists occurrences (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id         uuid not null references tasks (id) on delete cascade,
  occurrence_date date not null,
  completed_at    timestamptz not null default now(),
  unique (task_id, occurrence_date)
);

-- --------------------------------------------------------------- indexes ---

create index if not exists tasks_user_deadline_idx on tasks (user_id, deadline);
create index if not exists subtasks_task_idx       on subtasks (task_id);
create index if not exists task_goals_goal_idx     on task_goals (goal_id);
create index if not exists task_tags_tag_idx       on task_tags (tag_id);
create index if not exists occurrences_task_idx    on occurrences (task_id);

-- ------------------------------------------------------------------- rls ---
-- The anon key ships in the browser bundle by design; these policies are the
-- only thing separating one user's board from another's.

alter table goals      enable row level security;
alter table tags       enable row level security;
alter table tasks      enable row level security;
alter table subtasks   enable row level security;
alter table task_goals enable row level security;
alter table task_tags  enable row level security;
alter table occurrences enable row level security;

drop policy if exists own_tags on tags;
create policy own_tags on tags for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists own_task_tags on task_tags;
create policy own_task_tags on task_tags for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists own_goals on goals;
create policy own_goals on goals for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists own_tasks on tasks;
create policy own_tasks on tasks for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists own_subtasks on subtasks;
create policy own_subtasks on subtasks for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists own_task_goals on task_goals;
create policy own_task_goals on task_goals for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists own_occurrences on occurrences;
create policy own_occurrences on occurrences for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
