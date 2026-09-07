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

export type CloudDraft = {
  title: string
  settings: CloudSettings
  chapters: CloudChapter[]
}

const projectKey = 'draftwell-cloud-project-id'

function getProjectId() {
  const saved = localStorage.getItem(projectKey)
  if (saved) return saved
  const id = crypto.randomUUID()
  localStorage.setItem(projectKey, id)
  return id
}

function resetProjectId() {
  localStorage.removeItem(projectKey)
}

export async function loadDraftFromCloud(): Promise<CloudDraft | null> {
  if (!supabase) return null

  const { data: sessionData } = await supabase.auth.getSession()
  const user = sessionData.session?.user
  if (!user) return null

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, title, settings')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (projectError || !project) return null

  localStorage.setItem(projectKey, project.id)

  const { data: chapters, error: chaptersError } = await supabase
    .from('chapters')
    .select('chapter_number, title, note, body, status')
    .eq('project_id', project.id)
    .order('chapter_number', { ascending: true })

  if (chaptersError || !chapters || chapters.length === 0) return null

  return {
    title: project.title,
    settings: project.settings as CloudSettings,
    chapters: chapters.map((c) => ({
      id: c.chapter_number,
      title: c.title,
      note: c.note,
      body: c.body,
      status: c.status,
    })),
  }
}

export async function syncDraftToCloud(chapters: CloudChapter[], settings: CloudSettings) {
  if (!supabase) return { synced: false, reason: 'not-configured' as const }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) throw sessionError

  const user = sessionData.session?.user
  if (!user) throw new Error('Sign in to sync your work to the cloud.')

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
  const user = sessionData.session?.user
  if (!user) throw new Error('Sign in to submit feedback.')
  const { error } = await supabase.from('feedback').insert({
    user_id: user.id,
    rating: feedback.rating,
    message: feedback.message,
    kind: feedback.kind,
  })
  if (error) throw error
  return { synced: true as const }
}

export { resetProjectId }
