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
  -- Why the deadline was missed. Free text, written after the fact and kept
  -- even if the task is later completed or rescheduled — it is a record of what
  -- happened, and the raw material for the coaching analysis.
  failure_reason text,
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

-- One row per *judged* instance of a recurring task: completed_at set means it
-- was done, failure_reason alone means the day was missed and the user said why.
-- A day with no row at all is simply outstanding, which is what keeps an endless
-- daily task a single `tasks` row — the schedule is still derived from the rule,
-- never materialised.
create table if not exists occurrences (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id         uuid not null references tasks (id) on delete cascade,
  occurrence_date date not null,
  completed_at    timestamptz,
  failure_reason  text,
  unique (task_id, occurrence_date)
);

-- ------------------------------------------------------------ migrations ---
-- For databases created before these columns existed. No-ops on a fresh one.

alter table tasks       add column if not exists failure_reason text;
alter table occurrences add column if not exists failure_reason text;
alter table occurrences alter column completed_at drop not null;
alter table occurrences alter column completed_at drop default;

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
