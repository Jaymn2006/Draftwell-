import { supabase } from './supabase'

export type CloudChapter = {
  id: number
  title: string
  note: string
  body: string
  status: string
}

export type CloudSettings = {
  name: string
  role: string
  theme: 'light' | 'dark' | 'amber' | 'eye'
  accent: string
  font: 'serif' | 'sans'
  page: 'classic' | 'modern'
}

export type FeedbackPayload = {
  rating: number
  message: string
  kind: 'first-minute' | 'monthly'
}

const projectKey = 'draftwell-cloud-project-id'

function getProjectId() {
  const saved = localStorage.getItem(projectKey)
  if (saved) return saved
  const id = crypto.randomUUID()
  localStorage.setItem(projectKey, id)
  return id
}

export async function syncDraftToCloud(chapters: CloudChapter[], settings: CloudSettings) {
  if (!supabase) return { synced: false, reason: 'not-configured' as const }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) throw sessionError

  let user = sessionData.session?.user
  if (!user) {
    const { data, error } = await supabase.auth.signInAnonymously()
    if (error) throw error
    if (data.user) user = data.user
  }
  if (!user) throw new Error('Supabase did not return an authenticated user.')

  const projectId = getProjectId()
  const { error: projectError } = await supabase.from('projects').upsert({
    id: projectId,
    user_id: user.id,
    title: 'The Shape of Rain',
    settings,
    updated_at: new Date().toISOString(),
  })
  if (projectError) throw projectError

  const { error: deleteError } = await supabase.from('chapters').delete().eq('project_id', projectId)
  if (deleteError) throw deleteError

  const { error: chaptersError } = await supabase.from('chapters').insert(
    chapters.map((chapter, index) => ({
      project_id: projectId,
      chapter_number: index + 1,
      title: chapter.title,
      note: chapter.note,
      body: chapter.body,
      status: chapter.status,
    })),
  )
  if (chaptersError) throw chaptersError

  return { synced: true as const }
}

export async function submitFeedback(feedback: FeedbackPayload) {
  if (!supabase) return { synced: false, reason: 'not-configured' as const }
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) throw sessionError
  let user = sessionData.session?.user
  if (!user) {
    const { data, error } = await supabase.auth.signInAnonymously()
    if (error) throw error
    if (data.user) user = data.user
  }
  if (!user) throw new Error('Supabase did not return an authenticated user.')
  const { error } = await supabase.from('feedback').insert({
    user_id: user.id,
    rating: feedback.rating,
    message: feedback.message,
    kind: feedback.kind,
  })
  if (error) throw error
  return { synced: true as const }
}
