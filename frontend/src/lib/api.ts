export type Task = {
  id: string
  text: string
  added_at: string
  completed_at: string | null
}

export async function listTasks(): Promise<Task[]> {
  const response = await fetch('/api/tasks')
  if (!response.ok) {
    throw new Error(`GET /api/tasks failed with status ${response.status}`)
  }
  return (await response.json()) as Task[]
}
