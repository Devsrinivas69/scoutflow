import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'

export default async function Page() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const { data: todos } = await supabase.from('todos').select()

  return (
    <div style={{ padding: 40, fontFamily: 'sans-serif' }}>
      <h2>Supabase Integration Test</h2>
      <ul>
        {todos?.map((todo) => (
          <li key={todo.id}>{todo.name}</li>
        ))}
      </ul>
      {(!todos || todos.length === 0) && <p>No todos found or table does not exist yet.</p>}
    </div>
  )
}
