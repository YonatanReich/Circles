import type { Goal, Importance, Recurrence, Subtask, Tag, Task } from '../domain/types'
import type { Board, Db, GoalInput, TagInput, TaskInput } from './db'
import { supabase } from './supabase'

interface TaskRow {
  id: string
  title: string
  description: string | null
  deadline: string
  importance: number
  completed_at: string | null
  recurrence: Recurrence | null
  created_at: string
  task_goals: { goal_id: string }[] | null
  task_tags: { tag_id: string }[] | null
  subtasks: { id: string; task_id: string; title: string; done: boolean; position: number }[] | null
}

interface GoalRow {
  id: string
  name: string
  description: string | null
  deadline: string | null
  color: Goal['color']
  created_at: string
  archived_at: string | null
}

interface TagRow {
  id: string
  name: string
  color: Tag['color']
  created_at: string
}

function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message)
  return result.data as T
}

function toTask(row: TaskRow): Task {
  const subtasks: Subtask[] = (row.subtasks ?? [])
    .map((s) => ({
      id: s.id,
      taskId: s.task_id,
      title: s.title,
      done: s.done,
      position: s.position,
    }))
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    deadline: row.deadline,
    importance: row.importance as Importance,
    completedAt: row.completed_at,
    recurrence: row.recurrence,
    createdAt: row.created_at,
    goalIds: (row.task_goals ?? []).map((g) => g.goal_id),
    tagIds: (row.task_tags ?? []).map((t) => t.tag_id),
    subtasks,
  }
}

function toTag(row: TagRow): Tag {
  return { id: row.id, name: row.name, color: row.color, createdAt: row.created_at }
}

function toGoal(row: GoalRow): Goal {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    deadline: row.deadline,
    color: row.color,
    createdAt: row.created_at,
    archivedAt: row.archived_at,
  }
}

/** Link rows carry nothing but the pair, so replacing beats diffing. */
async function replaceLinks(
  table: 'task_goals' | 'task_tags',
  column: 'goal_id' | 'tag_id',
  taskId: string,
  ids: string[],
): Promise<void> {
  unwrap(await supabase.from(table).delete().eq('task_id', taskId).select('task_id'))
  if (ids.length === 0) return
  unwrap(
    await supabase
      .from(table)
      .insert(ids.map((id) => ({ task_id: taskId, [column]: id })))
      .select('task_id'),
  )
}

const replaceGoalLinks = (taskId: string, goalIds: string[]) =>
  replaceLinks('task_goals', 'goal_id', taskId, goalIds)

const replaceTagLinks = (taskId: string, tagIds: string[]) =>
  replaceLinks('task_tags', 'tag_id', taskId, tagIds)

export const supabaseDb: Db = {
  kind: 'supabase',

  // The app gates on auth before it ever renders the board, so this is a
  // safety net rather than a code path anyone should reach.
  async init() {
    const { data, error } = await supabase.auth.getSession()
    if (error) throw new Error(error.message)
    if (!data.session) throw new Error('Not signed in.')
  },

  async load(): Promise<Board> {
    const [tasks, goals, tags, occurrences] = await Promise.all([
      supabase
        .from('tasks')
        .select(
          '*, task_goals(goal_id), task_tags(tag_id), subtasks(id, task_id, title, done, position)',
        ),
      supabase.from('goals').select('*').is('archived_at', null).order('created_at'),
      supabase.from('tags').select('*').order('name'),
      supabase.from('occurrences').select('task_id, occurrence_date, completed_at'),
    ])

    return {
      tasks: unwrap<TaskRow[]>(tasks).map(toTask),
      goals: unwrap<GoalRow[]>(goals).map(toGoal),
      tags: unwrap<TagRow[]>(tags).map(toTag),
      occurrences: unwrap<{ task_id: string; occurrence_date: string; completed_at: string }[]>(
        occurrences,
      ).map((o) => ({ taskId: o.task_id, date: o.occurrence_date, completedAt: o.completed_at })),
    }
  },

  async createTask(input: TaskInput) {
    const row = unwrap<{ id: string }[]>(
      await supabase
        .from('tasks')
        .insert({
          title: input.title,
          description: input.description,
          deadline: input.deadline,
          importance: input.importance,
          recurrence: input.recurrence,
        })
        .select('id'),
    )[0]
    await replaceGoalLinks(row.id, input.goalIds)
    await replaceTagLinks(row.id, input.tagIds)

    const titles = input.subtaskTitles ?? []
    if (titles.length > 0) {
      unwrap(
        await supabase
          .from('subtasks')
          .insert(titles.map((title, position) => ({ task_id: row.id, title, position })))
          .select('id'),
      )
    }
  },

  async updateTask(id: string, patch: Partial<TaskInput>) {
    const { goalIds, tagIds, subtaskTitles: _ignored, ...fields } = patch
    if (Object.keys(fields).length > 0) {
      unwrap(await supabase.from('tasks').update(fields).eq('id', id).select('id'))
    }
    if (goalIds) await replaceGoalLinks(id, goalIds)
    if (tagIds) await replaceTagLinks(id, tagIds)
  },

  async deleteTask(id: string) {
    unwrap(await supabase.from('tasks').delete().eq('id', id).select('id'))
  },

  async setTaskCompleted(id: string, completed: boolean) {
    unwrap(
      await supabase
        .from('tasks')
        .update({ completed_at: completed ? new Date().toISOString() : null })
        .eq('id', id)
        .select('id'),
    )
  },

  async setOccurrence(taskId: string, date: string, done: boolean) {
    if (done) {
      unwrap(
        await supabase
          .from('occurrences')
          .upsert({ task_id: taskId, occurrence_date: date }, { onConflict: 'task_id,occurrence_date' })
          .select('task_id'),
      )
    } else {
      unwrap(
        await supabase
          .from('occurrences')
          .delete()
          .eq('task_id', taskId)
          .eq('occurrence_date', date)
          .select('task_id'),
      )
    }
  },

  async createGoal(input: GoalInput) {
    unwrap(await supabase.from('goals').insert(input).select('id'))
  },

  async updateGoal(id: string, patch: Partial<GoalInput>) {
    unwrap(await supabase.from('goals').update(patch).eq('id', id).select('id'))
  },

  async deleteGoal(id: string) {
    unwrap(await supabase.from('goals').delete().eq('id', id).select('id'))
  },

  async createTag(input: TagInput) {
    const result = await supabase.from('tags').insert(input).select('id')
    // unique (user_id, name) — say so plainly rather than leaking the constraint.
    if (result.error?.code === '23505') {
      throw new Error(`A tag called "${input.name}" already exists.`)
    }
    unwrap(result)
  },

  async updateTag(id: string, patch: Partial<TagInput>) {
    const result = await supabase.from('tags').update(patch).eq('id', id).select('id')
    if (result.error?.code === '23505') {
      throw new Error(`A tag called "${patch.name}" already exists.`)
    }
    unwrap(result)
  },

  // The task_tags rows cascade, so tasks lose the label automatically.
  async deleteTag(id: string) {
    unwrap(await supabase.from('tags').delete().eq('id', id).select('id'))
  },

  async addSubtask(taskId: string, title: string) {
    const existing = unwrap<{ position: number }[]>(
      await supabase.from('subtasks').select('position').eq('task_id', taskId),
    )
    const position = existing.reduce((m, s) => Math.max(m, s.position + 1), 0)
    unwrap(await supabase.from('subtasks').insert({ task_id: taskId, title, position }).select('id'))
  },

  async setSubtaskDone(id: string, done: boolean) {
    unwrap(await supabase.from('subtasks').update({ done }).eq('id', id).select('id'))
  },

  async deleteSubtask(id: string) {
    unwrap(await supabase.from('subtasks').delete().eq('id', id).select('id'))
  },
}
