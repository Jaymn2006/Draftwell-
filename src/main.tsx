import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowDownToLine, BookOpen, Check, ChevronRight, CircleHelp, Eye, FileText, ImagePlus, LayoutPanelLeft, LogOut, Mic, MoreHorizontal, Palette, Plus, Sparkles, Upload, WandSparkles, X } from 'lucide-react'
import './styles.css'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { submitFeedback, syncDraftToCloud, loadDraftFromCloud } from './lib/cloud'

type Chapter = { id: number; title: string; note: string; body: string; status: string }
type Theme = 'light' | 'dark' | 'amber' | 'eye'
type SettingsState = { name: string; role: string; theme: Theme; accent: string; font: 'serif' | 'sans'; page: 'classic' | 'modern' }
type SpeechRecognitionInstance = { continuous: boolean; interimResults: boolean; onstart: () => void; onend: () => void; onerror: () => void; onresult: (event: { results: { [key: number]: { [key: number]: { transcript: string } } } }) => void; start: () => void }
type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance
type AuthMode = 'sign-in' | 'sign-up' | 'forgot'

const DEFAULT_SETTINGS: SettingsState = { name: 'Mara Ellison', role: 'Author', theme: 'dark', accent: '#d88a2f', font: 'serif', page: 'classic' }
const initialChapters: Chapter[] = [
  { id: 1, title: 'The first light', note: 'Open with the town before the storm.', status: 'Draft', body: 'The town woke before the sun did.\n\nAt four seventeen, every window on Marrow Street blinked gold, one after another, as if the houses were remembering how to breathe. Mara watched from the kitchen floor, her back against the oven, and counted them twice.\n\nBy the time the last light came on, the rain had started.' },
  { id: 2, title: 'A map of small things', note: 'Let the reader discover the house.', status: 'Notes', body: 'There were maps everywhere in the house, but none of them showed a place she recognized.' },
  { id: 3, title: 'The weather inside', note: 'The first honest conversation.', status: 'Outline', body: 'The weather had followed them in.' },
]
const starterText = initialChapters[0].body

function App() {
  const [introDone, setIntroDone] = useState(() => sessionStorage.getItem('draftwell-intro-seen') === 'true')
  const [authenticated, setAuthenticated] = useState(() => !isSupabaseConfigured || localStorage.getItem('draftwell-offline-mode') === 'true')
  const [userId, setUserId] = useState('')
  const [chapters, setChapters] = useState<Chapter[]>(initialChapters)
  const [activeId, setActiveId] = useState(1)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isSaved, setIsSaved] = useState(true)
  const [cloudStatus, setCloudStatus] = useState<'offline' | 'ready' | 'syncing' | 'synced' | 'error'>(isSupabaseConfigured ? 'ready' : 'offline')
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [feedbackKind, setFeedbackKind] = useState<'first-minute' | 'monthly'>('first-minute')
  const [agentMessage, setAgentMessage] = useState('Your opening has a beautiful, quiet tension. I can help you keep that pulse as you build.')
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS)
  const [noteEditing, setNoteEditing] = useState(false)
  const [coverImage, setCoverImage] = useState('')
  const [cloudLoading, setCloudLoading] = useState(false)

  const chaptersKey = userId ? `draftwell-chapters-${userId}` : 'draftwell-offline-chapters'
  const settingsKey = userId ? `draftwell-settings-${userId}` : 'draftwell-offline-settings'
  const coverKey = userId ? `draftwell-cover-${userId}` : 'draftwell-offline-cover'
  const feedbackFirstKey = userId ? `draftwell-first-feedback-${userId}` : 'draftwell-offline-first-feedback'
  const feedbackMonthlyKey = userId ? `draftwell-monthly-feedback-${userId}` : 'draftwell-offline-monthly-feedback'
  const activeChapter = chapters.find((chapter) => chapter.id === activeId) ?? chapters[0] ?? initialChapters[0]
  const wordCount = useMemo(() => chapters.reduce((total, chapter) => total + chapter.body.trim().split(/\s+/).filter(Boolean).length, 0), [chapters])
  const activeWords = activeChapter.body.trim().split(/\s+/).filter(Boolean).length
  const readingTime = Math.max(1, Math.round(wordCount / 200))

  useEffect(() => {
    if (introDone) return
    const timer = window.setTimeout(() => { sessionStorage.setItem('draftwell-intro-seen', 'true'); setIntroDone(true) }, 3200)
    return () => window.clearTimeout(timer)
  }, [introDone])

  useEffect(() => {
    if (!supabase) return
    let mounted = true
    const loadSession = async () => {
      const { data } = await supabase.auth.getSession()
      if (!mounted) return
      setAuthenticated(Boolean(data.session))
      if (data.session?.user) await loadUserWorkspace(data.session.user.id)
    }
    void loadSession()
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      setAuthenticated(Boolean(session))
      if (session?.user) void loadUserWorkspace(session.user.id)
      else { setUserId(''); setChapters(initialChapters); setSettings(DEFAULT_SETTINGS); setCoverImage('') }
    })
    return () => { mounted = false; listener.subscription.unsubscribe() }
  }, [])

  async function loadUserWorkspace(id: string) {
    setUserId(id)
    setCloudLoading(true)
    const cachedChapters = localStorage.getItem(`draftwell-chapters-${id}`)
    const cachedSettings = localStorage.getItem(`draftwell-settings-${id}`)
    const cachedCover = localStorage.getItem(`draftwell-cover-${id}`)
    try { setChapters(cachedChapters ? JSON.parse(cachedChapters) : initialChapters) } catch { setChapters(initialChapters) }
    try { setSettings(cachedSettings ? JSON.parse(cachedSettings) : DEFAULT_SETTINGS) } catch { setSettings(DEFAULT_SETTINGS) }
    setCoverImage(cachedCover || '')
    try {
      const draft = await loadDraftFromCloud()
      if (draft) { setChapters(draft.chapters.length ? draft.chapters : initialChapters); setSettings(draft.settings); setIsSaved(true) }
      setCloudStatus('synced')
    } catch { setCloudStatus('error') }
    finally { setCloudLoading(false) }
  }

  useEffect(() => { localStorage.setItem(chaptersKey, JSON.stringify(chapters)) }, [chapters, chaptersKey])
  useEffect(() => { localStorage.setItem(settingsKey, JSON.stringify(settings)) }, [settings, settingsKey])
  useEffect(() => { if (coverImage) localStorage.setItem(coverKey, coverImage); else localStorage.removeItem(coverKey) }, [coverImage, coverKey])
  useEffect(() => { document.documentElement.dataset.theme = settings.theme }, [settings.theme])
  useEffect(() => {
    if (!authenticated) return
    const startedKey = userId ? `draftwell-first-use-${userId}` : 'draftwell-offline-first-use'
    const started = Number(localStorage.getItem(startedKey) ?? Date.now())
    localStorage.setItem(startedKey, String(started))
    const firstAsked = localStorage.getItem(feedbackFirstKey) === 'true'
    const monthlyAskedAt = Number(localStorage.getItem(feedbackMonthlyKey) ?? 0)
    const shouldAskFirst = !firstAsked
    const shouldAskMonthly = firstAsked && Date.now() - monthlyAskedAt >= 30 * 24 * 60 * 60 * 1000
    const delay = shouldAskFirst ? Math.max(0, 60_000 - (Date.now() - started)) : shouldAskMonthly ? 0 : undefined
    if (delay === undefined) return
    const timer = window.setTimeout(() => { setFeedbackKind(shouldAskFirst ? 'first-minute' : 'monthly'); setFeedbackOpen(true) }, delay)
    return () => window.clearTimeout(timer)
  }, [authenticated, userId, feedbackFirstKey, feedbackMonthlyKey])
  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); void saveDraft() } }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [chapters, settings, userId])

  if (!introDone) return <IntroScreen />
  if (!authenticated) return <AuthScreen onOffline={() => { localStorage.setItem('draftwell-offline-mode', 'true'); setAuthenticated(true); setUserId('') }} />

  function updateBody(body: string) { setChapters((current) => current.map((chapter) => chapter.id === activeId ? { ...chapter, body, status: 'Draft' } : chapter)); setIsSaved(false) }
  function updateTitle(title: string) { setChapters((current) => current.map((chapter) => chapter.id === activeId ? { ...chapter, title, status: chapter.status === 'Outline' ? 'Draft' : chapter.status } : chapter)); setIsSaved(false) }
  function addChapter() { const id = Math.max(...chapters.map((chapter) => chapter.id), 0) + 1; setChapters([...chapters, { id, title: `Chapter ${id}`, note: 'Give this chapter a note.', status: 'Outline', body: '' }]); setActiveId(id); setIsSaved(false) }
  function newProject() { setChapters([{ id: 1, title: 'Chapter 1', note: 'Give this chapter a note.', status: 'Outline', body: '' }]); setActiveId(1); setIsSaved(false); setAgentMessage('A fresh canvas. Start writing — every word counts.') }
  async function saveDraft() {
    localStorage.setItem(chaptersKey, JSON.stringify(chapters)); setIsSaved(true)
    if (!isSupabaseConfigured || !userId) { setCloudStatus('offline'); return }
    setCloudStatus('syncing')
    try { await syncDraftToCloud(chapters, settings); setCloudStatus('synced') }
    catch { setCloudStatus('error'); setAgentMessage('Your draft is safe on this device, but cloud sync needs attention.') }
  }
  async function signOut() { if (supabase) await supabase.auth.signOut(); localStorage.removeItem('draftwell-offline-mode'); setSettingsOpen(false); setUserId(''); setChapters(initialChapters); setActiveId(1); setSettings(DEFAULT_SETTINGS); setCoverImage(''); setAuthenticated(false) }
  function updateNote(note: string) { setChapters((current) => current.map((chapter) => chapter.id === activeId ? { ...chapter, note } : chapter)); setIsSaved(false) }
  function handleCoverUpload(event: React.ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (!file) return; if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) { setAgentMessage('Please choose an image no larger than 5 MB.'); return } const reader = new FileReader(); reader.onload = () => setCoverImage(String(reader.result || '')); reader.readAsDataURL(file) }
  function exportManuscript(format: 'txt' | 'json' | 'html') {
    const title = 'The Shape of Rain'; let content = ''; let type = 'text/plain'; let extension = 'txt'
    if (format === 'json') { content = JSON.stringify({ title, settings, chapters }, null, 2); type = 'application/json'; extension = 'json' }
    else if (format === 'html') { content = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1>${chapters.map((c) => `<h2>${c.title}</h2><p>${c.body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>`).join('')}</body></html>`; type = 'text/html'; extension = 'html' }
    else content = `${title}\n\n${chapters.map((c, i) => `Chapter ${i + 1}: ${c.title}\n\n${c.body}`).join('\n\n---\n\n')}`
    const url = URL.createObjectURL(new Blob([content], { type })); const a = document.createElement('a'); a.href = url; a.download = `${title.toLowerCase().replace(/\s+/g, '-')}.${extension}`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
  }
  function printBook() { setPreviewOpen(true); window.setTimeout(() => window.print(), 250) }
  async function sendFeedback(rating: number, message: string) { localStorage.setItem(feedbackKind === 'first-minute' ? feedbackFirstKey : feedbackMonthlyKey, feedbackKind === 'first-minute' ? 'true' : String(Date.now())); try { await submitFeedback({ rating, message, kind: feedbackKind }) } catch {} setFeedbackOpen(false) }
  function dictate() {
    const SpeechRecognition = (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition
    if (!SpeechRecognition) { setAgentMessage('Dictation needs a Chromium browser with speech recognition enabled. You can still write here.'); return }
    const recognition = new SpeechRecognition(); recognition.continuous = false; recognition.interimResults = false; recognition.onstart = () => setIsRecording(true); recognition.onend = () => setIsRecording(false); recognition.onerror = () => { setIsRecording(false); setAgentMessage('I could not hear that clearly. Try again somewhere quieter.') }; recognition.onresult = (event) => { updateBody(`${activeChapter.body}${activeChapter.body ? '\n\n' : ''}${event.results[0][0].transcript}`); setAgentMessage('Added your latest thought to the manuscript.') }; recognition.start()
  }

  return <div className="app-shell" style={{ '--accent': settings.accent } as React.CSSProperties}>
    <header className="topbar"><div className="brand"><BrandMark /><span>Draftwell</span><span className="offline-pill"><span className="status-dot" /> {userId ? 'cloud synced' : 'offline'}</span></div><div className="topbar-project"><span className="eyebrow">CURRENT PROJECT</span><strong>The Shape of Rain</strong><ChevronRight size={14} /></div><div className="top-actions"><button className="icon-button" title="Help" onClick={() => setHelpOpen(true)}><CircleHelp size={18} /></button><button className="profile-button" onClick={() => setSettingsOpen(true)}><span className="avatar">ME</span><span>{settings.name}</span><ChevronRight size={14} /></button></div></header>
    <div className="workspace"><aside className="sidebar"><div className="side-heading"><div><span className="eyebrow">YOUR LIBRARY</span><h2>My stories</h2></div><button className="icon-button quiet" title="New project" onClick={newProject}><Plus size={18} /></button></div><div className="project-card"><div className="project-cover"><span>THE<br /><i>SHAPE</i><br />OF RAIN</span></div><div className="project-meta"><strong>The Shape of Rain</strong><span>Novel · {Math.min(100, Math.round((wordCount / 22000) * 100))}% complete</span><div className="progress"><span style={{ width: `${Math.min(100, Math.round((wordCount / 22000) * 100))}%` }} /></div></div><button className="icon-button quiet" title="Project options" onClick={() => setExportOpen(true)}><MoreHorizontal size={16} /></button></div><nav className="side-nav"><button className="nav-item active"><LayoutPanelLeft size={17} /> Workspace</button><button className="nav-item" onClick={() => setPreviewOpen(true)}><BookOpen size={17} /> Book preview <span className="nav-count">{(wordCount / 1000).toFixed(1)}K</span></button><button className="nav-item" onClick={() => setExportOpen(true)}><ArrowDownToLine size={17} /> Export & publish</button></nav><div className="outline-label"><span className="eyebrow">MANUSCRIPT</span><button className="new-chapter" onClick={addChapter}><Plus size={14} /> chapter</button></div><div className="chapter-list">{chapters.map((chapter, index) => <button key={chapter.id} className={`chapter-item ${chapter.id === activeId ? 'selected' : ''}`} onClick={() => setActiveId(chapter.id)}><span className="chapter-number">{String(index + 1).padStart(2, '0')}</span><span className="chapter-info"><strong>{chapter.title}</strong><small>{chapter.status} · {chapter.body.trim().split(/\s+/).filter(Boolean).length} words</small></span><ChevronRight size={14} /></button>)}</div><div className="sidebar-footer"><button className="nav-item" onClick={() => setSettingsOpen(true)}><Settings size={17} /> Settings</button><div className="storage-status"><Check size={14} /> {cloudLoading ? 'Loading your workspace…' : cloudStatus === 'syncing' ? 'Syncing to cloud…' : cloudStatus === 'synced' ? 'Saved to cloud and device' : cloudStatus === 'error' ? 'Saved locally · cloud retry needed' : 'Everything is saved on this device'}</div></div></aside>
    <main className="editor-area"><div className="editor-toolbar"><div className="breadcrumb"><span>Part one</span><ChevronRight size={14} /><strong>{activeChapter.title}</strong></div><div className="toolbar-actions"><span className="save-state">{isSaved ? <><Check size={14} /> Saved locally</> : 'Unsaved changes'}</span><button className="secondary-button" onClick={() => void saveDraft()}><Check size={15} /> Save</button><button className={`record-button ${isRecording ? 'recording' : ''}`} onClick={dictate}><Mic size={16} /> {isRecording ? 'Listening…' : 'Speak a thought'}</button></div></div><div className="editor-scroll"><div className="chapter-kicker">CHAPTER {String(chapters.findIndex((chapter) => chapter.id === activeId) + 1).padStart(2, '0')} <span>•</span> {activeChapter.status.toUpperCase()}</div><input className="chapter-title" value={activeChapter.title} onChange={(event) => updateTitle(event.target.value)} /><textarea className={`manuscript ${settings.font}`} value={activeChapter.body} onChange={(event) => updateBody(event.target.value)} placeholder="Begin speaking or writing here..." /><div className="editor-foot"><span>{activeWords.toLocaleString()} words in this chapter</span><span>⌘/Ctrl ↵ to save</span></div></div></main>
    <aside className="agent-rail"><div className="agent-header"><div><span className="eyebrow">DRAFTWELL AGENT</span><h2>In your corner</h2></div><span className="sparkle"><Sparkles size={17} /></span></div><div className="agent-intro"><div className="agent-orbit"><WandSparkles size={22} /></div><p>{agentMessage}</p></div><div className="agent-actions"><button onClick={() => setAgentMessage('I see a strong sensory thread here: light, breath, rain. Consider echoing one of those images in the next scene.')}><Sparkles size={15} /> Read my scene</button><button onClick={() => setAgentMessage('Try giving Mara one small physical action before the next line of dialogue. It will make the moment feel lived in.')}><WandSparkles size={15} /> Find the next beat</button></div><div className="rail-divider" /><div className="rail-section"><div className="section-label"><span>CHAPTER NOTE</span><button title="Edit note" onClick={() => setNoteEditing((value) => !value)}><FileText size={14} /></button></div>{noteEditing ? <textarea className="feedback-textarea" value={activeChapter.note} onChange={(event) => updateNote(event.target.value)} onBlur={() => setNoteEditing(false)} /> : <p className="chapter-note">{activeChapter.note}</p>}</div><div className="rail-section"><div className="section-label"><span>AT A GLANCE</span><MoreHorizontal size={15} /></div><div className="glance-row"><span>Project words</span><strong>{wordCount.toLocaleString()}</strong></div><div className="glance-row"><span>Reading time</span><strong>{readingTime} min</strong></div><div className="glance-row"><span>Last written</span><strong>{isSaved ? 'Saved' : 'Unsaved'}</strong></div></div><button className="preview-link" onClick={() => setPreviewOpen(true)}><BookOpen size={16} /> See how it reads as a book <ChevronRight size={15} /></button></aside></div>
    {settingsOpen && <SettingsModal settings={settings} setSettings={setSettings} close={() => setSettingsOpen(false)} signOut={signOut} />}{helpOpen && <HelpModal close={() => setHelpOpen(false)} />}{previewOpen && <PreviewModal chapters={chapters} coverImage={coverImage} onCoverUpload={handleCoverUpload} onExport={printBook} close={() => setPreviewOpen(false)} />}{exportOpen && <ExportModal exportManuscript={exportManuscript} printBook={printBook} close={() => setExportOpen(false)} />}{feedbackOpen && <FeedbackModal kind={feedbackKind} close={() => setFeedbackOpen(false)} submit={sendFeedback} />}
  </div>
}

function BrandMark() { return <span className="brand-mark" aria-label="Draftwell logo"><img src="/Draftwell-logo.png.png" alt="Draftwell" /></span> }
function IntroScreen() { return <main className="intro-screen"><div className="intro-glow" /><div className="intro-logo"><BrandMark /><span>Draftwell</span></div><p className="intro-tagline">Your voice, in print.</p><div className="intro-progress"><span /></div></main> }
function AuthScreen({ onOffline }: { onOffline: () => void }) { const [mode, setMode] = useState<AuthMode>('sign-in'); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false); async function submit(event: React.FormEvent) { event.preventDefault(); if (!supabase) { setMessage('Cloud sign-in is not configured. Continue offline or add your Supabase settings.'); return } setBusy(true); setMessage(''); try { if (mode === 'forgot') { const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/` }); if (error) throw error; setMessage('Check your email for a password reset link.') } else if (mode === 'sign-up') { const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/` } }); if (error) throw error; setMessage(data.session ? 'Account created. You are signed in.' : 'Account created. Check your email to confirm your account, then return here to sign in.') } else { const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) throw error } } catch (error) { setMessage(error instanceof Error ? error.message : 'Something went wrong. Please try again.') } finally { setBusy(false) } } const title = mode === 'sign-in' ? 'Welcome back' : mode === 'sign-up' ? 'Begin your book' : 'Find your way back'; return <main className="auth-screen"><div className="auth-art"><div className="auth-art-glow" /><BrandMark /><div className="auth-wordmark">Draftwell</div><p>Your voice, in print.</p></div><section className="auth-panel"><div className="auth-panel-inner"><div className="auth-mini-brand"><BrandMark /><strong>Draftwell</strong></div><span className="eyebrow">A QUIET PLACE TO WRITE</span><h1>{title}</h1><p className="auth-subtitle">Write out loud, keep every thought, and shape it into something lasting.</p><form onSubmit={submit}>{mode !== 'forgot' && <label>Email address<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" /></label>}{mode !== 'forgot' && <label>Password<input type="password" required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 6 characters" autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'} /></label>}{mode === 'forgot' && <label>Email address<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" /></label>}<button className="auth-submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'sign-in' ? 'Sign in' : mode === 'sign-up' ? 'Create account' : 'Send reset link'}</button></form>{message && <p className="auth-message">{message}</p>}{mode === 'sign-in' && <button className="text-button" onClick={() => setMode('forgot')}>Forgot password?</button>}{mode === 'forgot' && <button className="text-button" onClick={() => setMode('sign-in')}>Back to sign in</button>}<div className="auth-divider"><span>or</span></div><button className="offline-button" onClick={onOffline}>Continue offline</button><p className="auth-switch">{mode === 'sign-up' ? 'Already have an account?' : 'New to Draftwell?'} <button className="text-button inline" onClick={() => setMode(mode === 'sign-up' ? 'sign-in' : 'sign-up')}>{mode === 'sign-up' ? 'Sign in' : 'Create an account'}</button></p><small className="auth-note">Your writing stays on this device when offline and syncs securely when you reconnect.</small></div></section></main> }
function HelpModal({ close }: { close: () => void }) { return <div className="modal-backdrop"><div className="modal help-modal"><div className="modal-heading"><div><span className="eyebrow">DRAFTWELL SUPPORT</span><h2>Need a hand?</h2></div><button className="icon-button" onClick={close} aria-label="Close help"><X size={18} /></button></div><p className="help-copy">Draftwell was made for writers who think in motion. Contact the developer for help, bug reports, or product ideas.</p><div className="help-contact"><strong>Joseph Nyingeh</strong><span>Developer · Kenya</span><a href="mailto:jaymn2006@gmail.com">jaymn2006@gmail.com</a><a href="tel:+254793760799">+254 793 760 799</a></div><div className="modal-footer"><span>Support responses are reviewed personally.</span><button className="primary-button" onClick={close}>Close</button></div></div></div> }
function SettingsModal({ settings, setSettings, close, signOut }: { settings: SettingsState; setSettings: React.Dispatch<React.SetStateAction<SettingsState>>; close: () => void; signOut: () => Promise<void> }) { const themes: { id: Theme; label: string; className: string }[] = [{ id: 'light', label: 'Light', className: 'light-swatch' }, { id: 'dark', label: 'Dark', className: 'dark-swatch' }, { id: 'amber', label: 'Amber', className: 'amber-swatch' }, { id: 'eye', label: 'Eye protection', className: 'eye-swatch' }]; return <div className="modal-backdrop"><div className="modal settings-modal"><div className="modal-heading"><div><span className="eyebrow">WORKSPACE SETTINGS</span><h2>Make it yours</h2></div><button className="icon-button" onClick={close}><X size={18} /></button></div><div className="setting-block"><label>Profile</label><div className="profile-setting"><div className="avatar large">ME</div><div><input value={settings.name} onChange={(event) => setSettings({ ...settings, name: event.target.value })} /><span>{settings.role} · stored locally and synced for this account</span></div></div></div><div className="setting-block"><label>Reading comfort</label><div className="theme-options theme-grid">{themes.map((theme) => <button key={theme.id} className={settings.theme === theme.id ? 'theme-option selected' : 'theme-option'} onClick={() => setSettings({ ...settings, theme: theme.id })}><span className={`theme-swatch ${theme.className}`} />{theme.id === 'eye' && <Eye size={14} />}{theme.label}</button>)}</div></div><div className="setting-block"><label>Accent colour</label><div className="color-row">{['#c4543d', '#287a74', '#9b6a37', '#5c6599'].map((color) => <button key={color} aria-label={`Accent ${color}`} className={`color-swatch ${settings.accent === color ? 'chosen' : ''}`} style={{ background: color }} onClick={() => setSettings({ ...settings, accent: color })} />)}</div></div><div className="setting-block"><label>Document style</label><div className="style-options"><button className={settings.font === 'serif' ? 'style-option selected' : 'style-option'} onClick={() => setSettings({ ...settings, font: 'serif' })}><span className="style-preview serif">Aa</span><span><strong>Quiet classic</strong><small>Literary serif</small></span></button><button className={settings.font === 'sans' ? 'style-option selected' : 'style-option'} onClick={() => setSettings({ ...settings, font: 'sans' })}><span className="style-preview sans">Aa</span><span><strong>Clean modern</strong><small>Contemporary sans</small></span></button></div></div><div className="modal-footer"><span><Palette size={15} /> Changes are isolated to your account</span><button className="secondary-button" onClick={() => void signOut()}><LogOut size={15} /> Sign out</button><button className="primary-button" onClick={close}>Done</button></div></div></div> }
function FeedbackModal({ kind, close, submit }: { kind: 'first-minute' | 'monthly'; close: () => void; submit: (rating: number, message: string) => Promise<void> }) { const [rating, setRating] = useState(0); const [message, setMessage] = useState(''); return <div className="modal-backdrop"><div className="modal feedback-modal"><div className="modal-heading"><div><span className="eyebrow">A QUICK CHECK-IN</span><h2>{kind === 'first-minute' ? 'How is Draftwell feeling?' : 'A month with Draftwell'}</h2></div><button className="icon-button" onClick={close}><X size={18} /></button></div><p className="feedback-copy">Your honest feedback helps shape what we build next. Tell us what felt good, what got in the way, and what you would love to see.</p><label className="feedback-label">Your rating</label><div className="rating-row">{[1, 2, 3, 4, 5].map((value) => <button key={value} className={value <= rating ? 'rating selected' : 'rating'} onClick={() => setRating(value)} aria-label={`${value} stars`}>★</button>)}</div><label className="feedback-label" htmlFor="feedback-message">What should we improve?</label><textarea id="feedback-message" className="feedback-textarea" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Tell us what worked, what did not, or what you want next..." /><div className="modal-footer"><span>Saved locally and sent securely when online</span><button className="primary-button" disabled={!rating} onClick={() => void submit(rating, message)}>Send feedback</button></div></div></div> }
function PreviewModal({ chapters, coverImage, onCoverUpload, onExport, close }: { chapters: Chapter[]; coverImage: string; onCoverUpload: (event: React.ChangeEvent<HTMLInputElement>) => void; onExport: () => void; close: () => void }) { return <div className="modal-backdrop preview-backdrop"><div className="preview-modal"><div className="preview-top"><div><span className="eyebrow">BOOK PREVIEW</span><h2>The Shape of Rain</h2></div><div className="preview-tools"><label className="secondary-button"><Upload size={15} /> Upload cover<input hidden type="file" accept="image/*" onChange={onCoverUpload} /></label><button className="secondary-button" onClick={onExport}><ArrowDownToLine size={15} /> Print / PDF</button><button className="icon-button" onClick={close}><X size={18} /></button></div></div><div className="book-stage"><div className="book-cover" style={coverImage ? { backgroundImage: `url(${coverImage})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}><div className="cover-top">A NOVEL</div><div className="cover-title">THE<br /><i>SHAPE</i><br />OF RAIN</div><div className="cover-author">MARA ELLISON</div><div className="cover-mark">D</div></div><div className="book-page"><div className="page-running">THE SHAPE OF RAIN <span>01</span></div><h3>{chapters[0]?.title}</h3><p>{chapters[0]?.body || starterText}</p><div className="page-rule" /><span className="page-number">1</span></div></div><div className="preview-bottom"><div><strong>Ready for the shelf</strong><span>{chapters.length} chapters · {chapters.reduce((a, c) => a + c.body.length, 0).toLocaleString()} characters</span></div><label className="primary-button"><ImagePlus size={16} /> Add your cover<input hidden type="file" accept="image/*" onChange={onCoverUpload} /></label></div></div></div> }
function ExportModal({ exportManuscript, printBook, close }: { exportManuscript: (format: 'txt' | 'json' | 'html') => void; printBook: () => void; close: () => void }) { return <div className="modal-backdrop"><div className="modal settings-modal"><div className="modal-heading"><div><span className="eyebrow">EXPORT & PUBLISH</span><h2>Take your work with you</h2></div><button className="icon-button" onClick={close}><X size={18} /></button></div><p className="help-copy">Export portable files or use the browser print dialog to create a PDF.</p><div className="style-options"><button className="style-option" onClick={() => exportManuscript('txt')}><span><strong>Plain text</strong><small>Draft and backup</small></span></button><button className="style-option" onClick={() => exportManuscript('json')}><span><strong>Project JSON</strong><small>Portable structured backup</small></span></button><button className="style-option" onClick={() => exportManuscript('html')}><span><strong>Web page</strong><small>Standalone shareable HTML</small></span></button></div><div className="modal-footer"><button className="secondary-button" onClick={printBook}><ArrowDownToLine size={15} /> Print / Save PDF</button><button className="primary-button" onClick={close}>Done</button></div></div></div> }

export default App
const rootElement = document.getElementById('root')!
const rootWindow = window as typeof window & { __draftwellRoot?: ReturnType<typeof createRoot> }
const root = rootWindow.__draftwellRoot ?? createRoot(rootElement)
rootWindow.__draftwellRoot = root
root.render(<App />)
