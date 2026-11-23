/*
| Counts rooms the same way the database does (_parse_rooms in supabase/schema.sql):
|   "101, 102, 201-204"  ->  6 rooms
| Used to warn the owner BEFORE anything is saved when the rooms are more than the plan allows.
| Returns null when the text is not valid (the server shows its own message then).
*/
export function countRooms(input: string): number | null {
  const s = input.replace(/\s*-\s*/g, '-').trim()
  const seen = new Set<string>()
  for (const tok of s.split(/[,;\s]+/)) {
    if (tok === '') continue
    if (/^\d+-\d+$/.test(tok)) {
      const [a, b] = tok.split('-')
      const from = Number(a)
      const to = Number(b)
      if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || to < from || to - from > 500) return null
      for (let i = from; i <= to; i++) seen.add(a.startsWith('0') ? String(i).padStart(a.length, '0') : String(i))
    } else {
      seen.add(tok)
    }
  }
  return seen.size
}
