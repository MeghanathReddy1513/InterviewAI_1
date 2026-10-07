import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Route, Switch, Link, useLocation, useParams, Router as WouterRouter } from 'wouter';
import {
  Activity, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, BarChart3, BookOpen, Check,
  CheckCircle2, ChevronDown, ChevronRight, CircleHelp, Clock3, Code2, Compass, FileText,
  Gauge, LayoutDashboard, LockKeyhole, LogOut, MessageSquareText, Search, Settings2,
  Sparkles, Target, Trash2, UserRound, X,
} from 'lucide-react';
import {
  useCompleteInterview, useCreateInterview, useDeleteInterview, useGetAnalytics, useGetAppConfig, useGetCurrentAccount,
  useGetDashboard, useGetInterview, useGetProfile, useGetRoadmap, useListInterviews, useLoginAccount,
  useLogoutAccount, useRegisterAccount, useSubmitInterviewAnswer, useUpdateProfile, useUpdateRoadmapItem,
  getGetCurrentAccountQueryKey, getGetProfileQueryKey, getGetDashboardQueryKey, getListInterviewsQueryKey,
  getGetInterviewQueryKey, getGetAnalyticsQueryKey, getGetRoadmapQueryKey,
} from '@workspace/api-client-react';
import type { AnswerEvaluation, InterviewConfig, InterviewQuestion, InterviewSummary, ProfileInput, RoadmapProgressInputStatus } from '@workspace/api-client-react';
import './index.css';

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });
const navItems = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/history', label: 'Interview history', icon: Clock3 },
  { href: '/analytics', label: 'Progress', icon: BarChart3 },
  { href: '/roadmap', label: 'Learning plan', icon: Compass },
];
const cx = (...v: Array<string | false | undefined>) => v.filter(Boolean).join(' ');
const errText = (e: unknown) => e instanceof Error ? e.message : 'Something went wrong. Please try again.';
const dateLabel = (v: string) => new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const percent = (n?: number | null) => `${Math.round(n || 0)}%`;

function Brand({ small = false }: { small?: boolean }) {
  return <Link href="/dashboard" className="flex items-center gap-3" data-testid="link-brand">
    <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-background"><MessageSquareText size={19} /></span>
    {!small && <span className="display text-[17px] font-extrabold tracking-[-.045em]">interview<span className="text-primary">ai</span></span>}
  </Link>;
}
function ErrorBox({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="soft-border rounded-2xl bg-red-950/20 p-5 text-sm text-red-200" role="alert" data-testid="status-error">
    <div className="flex items-start gap-3"><CircleHelp size={18} className="mt-0.5 shrink-0" /><div className="flex-1"><p className="font-semibold">We couldn’t load this yet</p><p className="mt-1 text-red-200/70">{message}</p></div>
      {retry && <button className="btn btn-quiet !px-3 !py-2 text-xs" onClick={retry} data-testid="button-retry">Try again</button>}
    </div>
  </div>;
}
function Skeleton({ rows = 3 }: { rows?: number }) {
  return <div className="space-y-3" aria-label="Loading"><div className="skeleton h-8 w-1/3 rounded-lg" />{Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton h-20 rounded-2xl" />)}</div>;
}
function Empty({ icon: Icon = FileText, title, body, action }: { icon?: typeof FileText; title: string; body: string; action?: ReactNode }) {
  return <div className="panel flex min-h-64 flex-col items-center justify-center rounded-3xl px-6 py-12 text-center" data-testid="state-empty">
    <div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-accent text-primary"><Icon size={23} /></div>
    <h3 className="display text-xl font-bold">{title}</h3><p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{body}</p>
    {action && <div className="mt-6">{action}</div>}
  </div>;
}
function AppFrame({ children, title, eyebrow }: { children: ReactNode; title: string; eyebrow?: string }) {
  const [path, setPath] = useLocation();
  const { data: user, isLoading, isError, refetch } = useGetCurrentAccount();
  const logout = useLogoutAccount();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!isLoading && isError && path !== '/login' && path !== '/register') setPath('/login');
  }, [isLoading, isError, path, setPath]);
  if (isLoading) return <main className="app-shell min-h-[100dvh] p-6"><div className="mx-auto max-w-6xl"><Skeleton rows={5} /></div></main>;
  if (isError || !user) return <main className="app-shell min-h-[100dvh] p-6"><div className="mx-auto max-w-xl"><ErrorBox message="Your session could not be restored." retry={() => void refetch()} /></div></main>;
  return <div className="app-shell min-h-[100dvh]">
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-[244px] flex-col border-r border-white/[.07] bg-[#111620]/90 px-5 py-7 backdrop-blur-xl lg:flex">
      <Brand />
      <div className="mt-12 px-3 text-[10px] font-bold uppercase tracking-[.18em] text-muted-foreground/70">Workspace</div>
      <nav className="mt-3 space-y-1">{navItems.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={cx('nav-link flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-medium text-muted-foreground hover:text-foreground', path === href && 'active')} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`}><Icon size={17} strokeWidth={1.8} />{label}</Link>)}</nav>
      <div className="mt-10 px-3 text-[10px] font-bold uppercase tracking-[.18em] text-muted-foreground/70">Account</div>
      <nav className="mt-3 space-y-1">
        <Link href="/profile" className={cx('nav-link flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-medium text-muted-foreground hover:text-foreground', path === '/profile' && 'active')} data-testid="link-nav-profile"><UserRound size={17} />Profile & preferences</Link>
      </nav>
      <div className="mt-auto rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
        <div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary">{user.fullName.slice(0, 1).toUpperCase()}</div><div className="min-w-0"><p className="truncate text-xs font-semibold">{user.fullName}</p><p className="truncate text-[11px] text-muted-foreground">{user.email}</p></div></div>
        <button disabled={logout.isPending} onClick={() => logout.mutate(undefined, { onSuccess: () => { queryClient.setQueryData(getGetCurrentAccountQueryKey(), null); setPath('/login'); } })} className="mt-4 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs text-muted-foreground transition hover:bg-white/[.05] hover:text-foreground" data-testid="button-logout"><LogOut size={14} />{logout.isPending ? 'Signing out…' : 'Sign out'}</button>
      </div>
    </aside>
    <div className="lg:pl-[244px]">
      <header className="sticky top-0 z-10 border-b border-white/[.06] bg-[#0f141d]/85 px-5 py-4 backdrop-blur-xl md:px-9">
        <div className="mx-auto flex max-w-[1320px] items-center justify-between">
          <div className="flex items-center gap-3 lg:hidden"><Brand small /><span className="display text-sm font-bold">interview<span className="text-primary">ai</span></span></div>
          <div className="hidden lg:block"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-muted-foreground">{eyebrow || 'Your practice space'}</p><h1 className="display mt-1 text-lg font-bold">{title}</h1></div>
          <div className="flex items-center gap-3"><Link href="/interviews/new" className="btn btn-primary !px-3 !py-2.5 text-xs md:!px-4 md:text-sm" data-testid="link-new-interview"><Sparkles size={15} />New practice <span className="hidden sm:inline">session</span></Link><Link href="/profile" aria-label="Profile" className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/[.04] text-primary lg:hidden"><UserRound size={16} /></Link></div>
        </div>
      </header>
      <main className="mx-auto max-w-[1320px] px-5 pb-24 pt-8 md:px-9 md:pb-12">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-white/10 bg-[#10151f]/95 px-2 py-2 backdrop-blur-xl lg:hidden">
        {navItems.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={cx('nav-link flex min-w-[56px] flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-[9px] text-muted-foreground', path === href && 'active')}><Icon size={17} />{label.split(' ')[0]}</Link>)}
      </nav>
    </div>
  </div>;
}
function Page({ title, eyebrow, children }: { title: string; eyebrow?: string; children: ReactNode }) { return <AppFrame title={title} eyebrow={eyebrow}>{children}</AppFrame>; }

function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const [path, setPath] = useLocation();
  const client = useQueryClient();
  const config = useGetAppConfig();
  const login = useLoginAccount(); const register = useRegisterAccount(); const isRegister = mode === 'register';
  const [form, setForm] = useState({ fullName: '', username: '', email: '', password: '' });
  const [message, setMessage] = useState('');
  const pending = login.isPending || register.isPending;
  const submit = (e: FormEvent) => {
    e.preventDefault(); setMessage('');
    if (isRegister) register.mutate({ data: form }, { onSuccess: (result) => { setMessage(result.message || 'Account created. Sign in to begin.'); if (!result.emailConfirmationRequired) { client.setQueryData(getGetCurrentAccountQueryKey(), result.user); setPath('/dashboard'); } }, onError: (err) => setMessage(errText(err)) });
    else login.mutate({ data: { email: form.email, password: form.password } }, { onSuccess: (result) => { client.setQueryData(getGetCurrentAccountQueryKey(), result.user); setPath('/dashboard'); }, onError: (err) => setMessage(errText(err)) });
  };
  return <main className="app-shell flex min-h-[100dvh] items-center justify-center px-5 py-10">
    <div className="grid w-full max-w-[980px] overflow-hidden rounded-[28px] border border-white/[.08] bg-[#111722] shadow-2xl shadow-black/20 md:grid-cols-[.95fr_1.05fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-[#16242a] p-10 md:flex">
        <div className="absolute -right-24 -top-20 h-72 w-72 rounded-full border border-primary/10" /><div className="absolute -right-12 -top-8 h-48 w-48 rounded-full border border-primary/10" />
        <Brand />
        <div className="relative z-10 max-w-sm">
          <div className="mb-7 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-primary"><span className="h-px w-7 bg-primary" />Practice with purpose</div>
          <h1 className="display text-4xl font-bold leading-[1.1]">Confidence comes from knowing what to work on.</h1>
          <p className="mt-5 text-sm leading-7 text-slate-300/70">A thoughtful rehearsal space, with clear feedback after every answer. Your progress stays yours.</p>
        </div>
        <p className="mono text-[10px] text-slate-400/65">PRIVATE PRACTICE · CLEAR FEEDBACK · REAL PROGRESS</p>
      </section>
      <section className="p-7 sm:p-10 md:p-12">
        <div className="mb-10 md:hidden"><Brand /></div>
        <div className="text-xs font-bold uppercase tracking-[.18em] text-primary">{isRegister ? 'Your next step' : 'Welcome back'}</div>
        <h2 className="display mt-3 text-3xl font-extrabold">{isRegister ? 'Create your account' : 'Pick up where you left off'}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{isRegister ? 'Build a private space for better interview practice.' : 'Your interview practice is right where you left it.'}</p>
        {config.data?.supabaseConfigured === false && <div className="mt-5 rounded-xl border border-amber-300/20 bg-amber-300/[.06] p-3 text-xs leading-5 text-amber-100" role="status">Connect Supabase before creating an account: add <span className="mono">SUPABASE_URL</span> and <span className="mono">SUPABASE_ANON_KEY</span>, then run the SQL setup in <span className="mono">artifacts/interview-ai/supabase/schema.sql</span>.</div>}
        {config.data?.supabaseConfigured && !config.data.supabaseReachable && <div className="mt-5 rounded-xl border border-amber-300/20 bg-amber-300/[.06] p-3 text-xs leading-5 text-amber-100" role="status">Supabase values are present, but the project could not be reached. Check the project URL and anon key.</div>}
        {config.data?.supabaseReachable && !config.data.databaseSchemaReady && <div className="mt-5 rounded-xl border border-amber-300/20 bg-amber-300/[.06] p-3 text-xs leading-5 text-amber-100" role="status">Supabase is reachable. Run <span className="mono">artifacts/interview-ai/supabase/schema.sql</span> in the project's SQL Editor to create the private profile, interview, answer, and roadmap tables.</div>}
        {config.data?.aiConfigured === false && <div className="mt-3 rounded-xl border border-sky-300/20 bg-sky-300/[.05] p-3 text-xs leading-5 text-sky-100" role="status">AI feedback is not configured yet; interview practice will be clearly marked as demo feedback.</div>}
        <form onSubmit={submit} className="mt-8 space-y-4">
          {isRegister && <><label className="block text-xs font-semibold text-slate-300">Full name<input required minLength={2} maxLength={100} className="control mt-2" placeholder="e.g. Sam Rivera" value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} data-testid="input-full-name" /></label><label className="block text-xs font-semibold text-slate-300">Username<input required minLength={3} maxLength={32} className="control mt-2" placeholder="samrivera" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} data-testid="input-username" /></label></>}
          <label className="block text-xs font-semibold text-slate-300">Email address<input required type="email" className="control mt-2" placeholder="you@example.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} data-testid="input-email" /></label>
          <label className="block text-xs font-semibold text-slate-300">Password<input required minLength={isRegister ? 8 : 1} maxLength={128} type="password" className="control mt-2" placeholder="At least 8 characters" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} data-testid="input-password" /></label>
          {message && <p className={cx('rounded-xl border p-3 text-sm', (login.isError || register.isError) ? 'border-red-400/20 bg-red-950/20 text-red-200' : 'border-primary/20 bg-primary/10 text-primary')} role="status" data-testid="status-auth">{message}</p>}
          <button className="btn btn-primary mt-2 w-full py-3" disabled={pending} data-testid="button-auth-submit">{pending ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}<ArrowRight size={16} /></button>
        </form>
        <p className="mt-7 text-center text-sm text-muted-foreground">{isRegister ? 'Already have an account?' : 'New to InterviewAI?'} <Link className="font-semibold text-primary hover:underline" href={isRegister ? '/login' : '/register'} data-testid="link-auth-switch">{isRegister ? 'Sign in' : 'Create account'}</Link></p>
        <p className="mt-7 flex items-center justify-center gap-2 text-[11px] text-muted-foreground/70"><LockKeyhole size={12} />Your practice and feedback are private.</p>
      </section>
    </div>
  </main>;
}

function Metric({ label, value, sub, icon: Icon, tone = 'mint' }: { label: string; value: string | number; sub: string; icon: typeof Target; tone?: string }) {
  return <div className="panel rounded-2xl p-5"><div className="flex items-start justify-between"><span className="text-xs font-semibold text-muted-foreground">{label}</span><span className={cx('grid h-8 w-8 place-items-center rounded-lg', tone === 'blue' ? 'bg-sky-300/10 text-sky-300' : tone === 'amber' ? 'bg-amber-300/10 text-amber-300' : 'bg-primary/10 text-primary')}><Icon size={16} /></span></div><div className="display mt-5 text-3xl font-extrabold">{value}</div><p className="mt-1 text-[11px] text-muted-foreground">{sub}</p></div>;
}
function SessionRow({ item, onDelete }: { item: InterviewSummary; onDelete?: (id: string) => void }) {
  return <div className="group flex flex-col gap-4 border-b border-white/[.06] py-4 last:border-0 sm:flex-row sm:items-center">
    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/[.09] text-primary"><Code2 size={17} /></div>
    <div className="min-w-0 flex-1"><Link href={`/interview/${item.id}/result`} className="font-semibold hover:text-primary" data-testid={`link-interview-${item.id}`}>{item.role}</Link><div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground"><span>{item.interviewType}</span><span className="text-white/20">·</span><span>{item.difficulty}</span><span className="text-white/20">·</span><span>{dateLabel(item.createdAt)}</span></div></div>
    <div className="flex items-center justify-between gap-3 sm:justify-end"><span className={cx('rounded-full px-2.5 py-1 text-[10px] font-semibold', item.status === 'completed' ? 'bg-primary/10 text-primary' : 'bg-amber-300/10 text-amber-200')}>{item.status === 'completed' ? 'Completed' : 'In progress'}</span><div className="w-20 text-right"><div className="mono text-sm font-medium">{percent(item.percentage)}</div><div className="mt-1 h-1 rounded-full bg-white/10"><div className="meter" style={{ width: `${Math.min(100, item.percentage || 0)}%` }} /></div></div><Link href={item.status === 'completed' ? `/interview/${item.id}/result` : `/interview/${item.id}`} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-white/5 hover:text-foreground" aria-label="Open interview"><ChevronRight size={16} /></Link>{onDelete && <button onClick={() => onDelete(item.id)} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground opacity-70 hover:bg-red-400/10 hover:text-red-200" aria-label="Delete interview" data-testid={`button-delete-${item.id}`}><Trash2 size={14} /></button>}</div>
  </div>;
}
function DashboardPage() {
  const { data, isLoading, isError, error, refetch } = useGetDashboard();
  if (isLoading) return <Page title="Overview"><Skeleton rows={5} /></Page>;
  if (isError || !data) return <Page title="Overview"><ErrorBox message={errText(error)} retry={() => void refetch()} /></Page>;
  const firstName = 'Your';
  return <Page title="Overview" eyebrow="Practice workspace">
    <div className="rise flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
      <div><p className="mono text-[10px] font-medium uppercase tracking-[.2em] text-primary">A clearer path to ready</p><h2 className="display mt-3 text-3xl font-extrabold sm:text-[40px]">Make each answer count.</h2><p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">Review what is working, find the next thing to strengthen, and keep your practice moving.</p></div>
      <Link href="/interviews/new" className="btn btn-primary self-start sm:self-auto" data-testid="button-start-practice"><Sparkles size={16} />Start a practice session</Link>
    </div>
    <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Readiness" value={percent(data.readinessScore)} sub="Your current preparation level" icon={Gauge} />
      <Metric label="Average score" value={percent(data.averageScore)} sub="Across completed interviews" icon={Activity} tone="blue" />
      <Metric label="Practice sessions" value={data.totalInterviews} sub={`${data.questionsAnswered} answers submitted`} icon={MessageSquareText} tone="amber" />
      <Metric label="Personal best" value={percent(data.bestScore)} sub="Your strongest interview" icon={Target} />
    </div>
    <div className="mt-6 grid gap-5 xl:grid-cols-[1.5fr_.85fr]">
      <section className="panel rounded-2xl p-5 sm:p-6"><div className="flex items-center justify-between"><div><h3 className="display text-lg font-bold">Recent practice</h3><p className="mt-1 text-xs text-muted-foreground">A little reflection goes a long way.</p></div><Link href="/history" className="text-xs font-semibold text-primary hover:underline" data-testid="link-all-history">View history <ArrowRight className="ml-1 inline" size={13} /></Link></div>
        {data.recentInterviews.length ? <div className="mt-4">{data.recentInterviews.slice(0, 5).map(item => <SessionRow item={item} key={item.id} />)}</div> : <div className="mt-5"><Empty title="Your first session starts here" body="Choose a role and interview style. You’ll get a focused question, then feedback you can put to work." action={<Link href="/interviews/new" className="btn btn-primary" data-testid="button-first-session">Set up an interview <ArrowRight size={15} /></Link>} /></div>}
      </section>
      <div className="space-y-5">
        <section className="panel rounded-2xl p-5 sm:p-6"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-300/10 text-amber-200"><Sparkles size={17} /></span><div><h3 className="display font-bold">Your next focus</h3><p className="text-[11px] text-muted-foreground">A recommendation from your practice</p></div></div><p className="mt-4 text-sm leading-6 text-slate-200/85">{data.nextRecommendation || 'Complete a practice interview to get a tailored recommendation based on your answers.'}</p></section>
        <section className="panel rounded-2xl p-5 sm:p-6"><div className="flex items-center justify-between"><h3 className="display font-bold">Learning plan</h3><Link href="/roadmap" className="text-xs text-primary hover:underline">Open plan</Link></div><div className="mt-5 flex items-end justify-between"><span className="display text-3xl font-extrabold">{percent(data.roadmapProgress)}</span><span className="text-[11px] text-muted-foreground">of your plan complete</span></div><div className="mt-3 h-1.5 rounded-full bg-white/10"><div className="meter" style={{ width: `${data.roadmapProgress}%` }} /></div></section>
      </div>
    </div>
    <div className="mt-5 grid gap-5 md:grid-cols-2">
      <TopicPanel title="Things going well" topics={data.strongestTopics} tone="good" />
      <TopicPanel title="Worth another look" topics={data.weakestTopics} tone="focus" />
    </div>
  </Page>;
}
function TopicPanel({ title, topics, tone }: { title: string; topics: string[]; tone: 'good' | 'focus' }) {
  return <section className="panel rounded-2xl p-5"><div className="flex items-center gap-2"><span className={cx('h-2 w-2 rounded-full', tone === 'good' ? 'bg-primary' : 'bg-amber-300')} /><h3 className="display text-sm font-bold">{title}</h3></div>{topics.length ? <div className="mt-4 flex flex-wrap gap-2">{topics.map(topic => <span key={topic} className="rounded-full border border-white/[.07] bg-white/[.03] px-3 py-1.5 text-xs text-slate-300">{topic}</span>)}</div> : <p className="mt-3 text-xs text-muted-foreground">More practice will help surface useful patterns here.</p>}</section>;
}

const optionSet = {
  types: ['Technical', 'HR', 'Behavioral', 'Coding', 'Mixed'], difficulty: ['Beginner', 'Intermediate', 'Advanced', 'Expert'],
  levels: ['Student', 'Fresher', 'Junior', 'Mid-level'], languages: ['JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'Go', 'Not applicable'],
  spoken: ['English', 'Telugu', 'Hindi'], personas: ['Friendly Coach', 'Professional Recruiter', 'Strict Technical Interviewer', 'Challenging Senior Engineer'],
};
function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) { return <label className="block"><span className="mb-2 block text-xs font-semibold text-slate-300">{label}</span>{children}{hint && <span className="mt-1.5 block text-[10px] text-muted-foreground">{hint}</span>}</label>; }
function SelectField({ label, value, onChange, values }: { label: string; value: string; onChange: (v: string) => void; values: string[] }) {
  return <Field label={label}><select className="control" value={value} onChange={e => onChange(e.target.value)} data-testid={`select-${label.toLowerCase().replaceAll(' ', '-')}`}>{values.map(v => <option key={v}>{v}</option>)}</select></Field>;
}
function NewInterviewPage() {
  const [path, setPath] = useLocation(); const create = useCreateInterview(); const { data: profile } = useGetProfile();
  const [values, setValues] = useState<InterviewConfig>({
    role: '', interviewType: 'Technical', programmingLanguage: 'JavaScript', difficulty: 'Intermediate', experienceLevel: 'Student',
    numberOfQuestions: 5, totalMarks: 50, timeLimitMinutes: null, interviewLanguage: 'English', persona: 'Friendly Coach',
    voiceEnabled: false, resumeContext: null, jobDescription: null,
  });
  useEffect(() => { if (profile?.preferredRole && !values.role) setValues(v => ({ ...v, role: profile.preferredRole || '' })); }, [profile?.preferredRole]);
  const set = <K extends keyof InterviewConfig>(key: K, value: InterviewConfig[K]) => setValues(v => ({ ...v, [key]: value }));
  const submit = (e: FormEvent) => { e.preventDefault(); create.mutate({ data: values }, { onSuccess: start => setPath(`/interview/${start.interview.id}`) }); };
  return <Page title="Set up an interview" eyebrow="New practice session">
    <div className="mx-auto max-w-4xl">
      <Link href="/dashboard" className="mb-6 inline-flex items-center gap-2 text-xs text-muted-foreground transition hover:text-foreground"><ArrowLeft size={14} />Back to overview</Link>
      <div className="rise mb-7"><p className="mono text-[10px] uppercase tracking-[.19em] text-primary">Start with a goal</p><h2 className="display mt-2 text-3xl font-extrabold">Shape your practice.</h2><p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Set the context. We’ll take it one question at a time and explain how each answer landed.</p></div>
      <form onSubmit={submit} className="panel rounded-3xl p-5 sm:p-8">
        <section><div className="mb-5 flex items-center gap-3"><span className="mono text-xs text-primary">01</span><div><h3 className="display font-bold">The role</h3><p className="text-[11px] text-muted-foreground">What are you working toward?</p></div></div>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Target role"><input required minLength={2} maxLength={120} className="control" placeholder="e.g. Frontend Engineer" value={values.role} onChange={e => set('role', e.target.value)} data-testid="input-role" /></Field>
            <SelectField label="Experience level" value={values.experienceLevel} onChange={v => set('experienceLevel', v as InterviewConfig['experienceLevel'])} values={optionSet.levels} />
          </div></section>
        <div className="my-7 border-t border-white/[.07]" />
        <section><div className="mb-5 flex items-center gap-3"><span className="mono text-xs text-primary">02</span><div><h3 className="display font-bold">Interview format</h3><p className="text-[11px] text-muted-foreground">Choose the kind of conversation to rehearse.</p></div></div>
          <div className="grid gap-4 sm:grid-cols-2"><SelectField label="Interview type" value={values.interviewType} onChange={v => set('interviewType', v as InterviewConfig['interviewType'])} values={optionSet.types} />
            <SelectField label="Difficulty" value={values.difficulty} onChange={v => set('difficulty', v as InterviewConfig['difficulty'])} values={optionSet.difficulty} />
            <SelectField label="Programming language" value={values.programmingLanguage} onChange={v => set('programmingLanguage', v)} values={optionSet.languages} />
            <SelectField label="Interview language" value={values.interviewLanguage} onChange={v => set('interviewLanguage', v as InterviewConfig['interviewLanguage'])} values={optionSet.spoken} />
            <SelectField label="Interviewer style" value={values.persona} onChange={v => set('persona', v as InterviewConfig['persona'])} values={optionSet.personas} />
            <SelectField label="Questions" value={`${values.numberOfQuestions} questions`} onChange={v => { const n = Number(v.split(' ')[0]) as InterviewConfig['numberOfQuestions']; set('numberOfQuestions', n); set('totalMarks', (n * 10) as InterviewConfig['totalMarks']); }} values={['5 questions', '10 questions', '15 questions', '20 questions']} />
          </div>
        </section>
        <div className="my-7 border-t border-white/[.07]" />
        <section><div className="mb-5 flex items-center gap-3"><span className="mono text-xs text-primary">03</span><div><h3 className="display font-bold">Helpful context <span className="font-sans text-xs font-normal text-muted-foreground">Optional</span></h3><p className="text-[11px] text-muted-foreground">Give your interviewer a little more to work with.</p></div></div>
          <div className="space-y-4"><Field label="Background or resume notes" hint="Add a short summary or experience you’d like questions to reflect."><textarea maxLength={12000} rows={4} className="control resize-y" placeholder="Share relevant projects, experience, or skills…" value={values.resumeContext || ''} onChange={e => set('resumeContext', e.target.value || null)} data-testid="input-resume-context" /></Field>
            <Field label="Job description" hint="Paste the role description for a more contextual practice session."><textarea maxLength={12000} rows={4} className="control resize-y" placeholder="Paste a job description…" value={values.jobDescription || ''} onChange={e => set('jobDescription', e.target.value || null)} data-testid="input-job-description" /></Field>
          </div></section>
        {create.isError && <div className="mt-5"><ErrorBox message={errText(create.error)} /></div>}
        <div className="mt-7 flex flex-col justify-between gap-4 border-t border-white/[.07] pt-6 sm:flex-row sm:items-center"><p className="text-xs text-muted-foreground"><span className="text-primary">No pressure.</span> This is practice, not a test.</p><button className="btn btn-primary" disabled={create.isPending} data-testid="button-create-interview">{create.isPending ? 'Preparing your session…' : 'Begin interview'}<ArrowRight size={16} /></button></div>
      </form>
    </div>
  </Page>;
}

function LiveInterviewPage() {
  const params = useParams<{ id: string }>(); const id = params.id; const [path, setPath] = useLocation();
  const { data, isLoading, isError, error, refetch } = useGetInterview(id, { query: { queryKey: getGetInterviewQueryKey(id), enabled: !!id } });
  const submit = useSubmitInterviewAnswer(); const complete = useCompleteInterview(); const queryClient = useQueryClient();
  const [question, setQuestion] = useState<InterviewQuestion | null>(null);
  const [answer, setAnswer] = useState(''); const [evaluation, setEvaluation] = useState<null | { evaluation: AnswerEvaluation; aiMode: string; maxMarks: number }>(null);
  const [step, setStep] = useState(0);
  useEffect(() => { if (data && !question) { const unanswered = data.questions.find(q => !q.evaluation); if (unanswered) { setQuestion(unanswered.question); setStep(unanswered.question.questionNumber - 1); } } }, [data, question]);
  if (isLoading) return <Page title="Interview in progress"><Skeleton rows={4} /></Page>;
  if (isError || !data) return <Page title="Interview in progress"><ErrorBox message={errText(error)} retry={() => void refetch()} /></Page>;
  if (data.report) return <Page title="Interview complete"><div className="mx-auto max-w-3xl"><Empty icon={CheckCircle2} title="Your report is ready" body="Your saved feedback is waiting for you." action={<Link className="btn btn-primary" href={`/interview/${id}/result`}>Open report <ArrowRight size={15} /></Link>} /></div></Page>;
  const questionCount = data.interview.questionCount;
  const onSubmit = (skipped = false) => {
    if (!question || submit.isPending) return;
    submit.mutate({ id, data: { questionId: question.id, answerText: answer.trim(), skipped } }, {
      onSuccess: result => {
        setEvaluation({ evaluation: result.evaluation, aiMode: result.aiMode, maxMarks: question.maxMarks });
        setAnswer('');
        if (result.isComplete || !result.nextQuestion) completeAndOpen();
        else { setQuestion(result.nextQuestion); setStep(result.nextQuestion.questionNumber - 1); queryClient.invalidateQueries({ queryKey: getGetInterviewQueryKey(id) }); }
      },
    });
  };
  const completeAndOpen = () => {
    complete.mutate({ id }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetInterviewQueryKey(id) }); queryClient.invalidateQueries({ queryKey: getListInterviewsQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); setPath(`/interview/${id}/result`); } });
  };
  const continueNext = () => setEvaluation(null);
  return <div className="app-shell min-h-[100dvh]">
    <header className="border-b border-white/[.07] px-5 py-4"><div className="mx-auto flex max-w-5xl items-center justify-between"><Link href="/dashboard" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft size={14} />Leave session</Link><Brand /><span className="mono hidden text-[10px] text-muted-foreground sm:block">{data.interview.role.toUpperCase()}</span></div></header>
    <main className="mx-auto max-w-3xl px-5 pb-14 pt-8 sm:pt-12">
      <div className="flex items-end justify-between"><div><span className="mono text-[10px] uppercase tracking-[.18em] text-primary">{data.interview.interviewType} · {data.interview.difficulty}</span><h1 className="display mt-2 text-2xl font-extrabold sm:text-3xl">{data.interview.role}</h1></div><span className="mono text-xs text-muted-foreground">{Math.min(step + 1, questionCount)} <span className="text-white/25">/</span> {questionCount}</span></div>
      <div className="mt-6 h-1 rounded-full bg-white/[.07]"><div className="meter" style={{ width: `${Math.min(100, ((step + 1) / questionCount) * 100)}%` }} /></div>
      {evaluation ? <section className="panel rise mt-7 rounded-3xl p-6 sm:p-8"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="mono text-[10px] uppercase tracking-[.18em] text-primary">Question feedback</p><h2 className="display mt-2 text-2xl font-bold">A useful next step.</h2></div><div className="rounded-2xl bg-primary/10 px-4 py-3 text-right"><div className="mono text-xl font-medium text-primary">{evaluation.evaluation.marksObtained}<span className="text-sm text-primary/50"> / {evaluation.maxMarks}</span></div><div className="text-[10px] text-muted-foreground">{evaluation.evaluation.performanceCategory}</div></div></div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2"><FeedbackList title="What worked" items={evaluation.evaluation.strengths} /><FeedbackList title="Try next time" items={[...evaluation.evaluation.weaknesses, ...evaluation.evaluation.improvementTips]} /></div>
          {evaluation.evaluation.sampleAnswer && <div className="mt-5 rounded-xl border border-white/[.07] bg-white/[.025] p-4"><p className="text-[10px] font-bold uppercase tracking-[.15em] text-muted-foreground">Example answer direction</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">{evaluation.evaluation.sampleAnswer}</p></div>}
           <p className="mt-4 text-[10px] text-muted-foreground">Evaluation mode: {evaluation.aiMode}</p>{complete.isError && <div className="mt-4"><ErrorBox message={errText(complete.error)} /></div>}<button onClick={step + 1 >= questionCount ? completeAndOpen : continueNext} disabled={complete.isPending} className="btn btn-primary mt-6" data-testid="button-next-question">{complete.isPending ? 'Saving report…' : step + 1 >= questionCount ? 'Finish session' : 'Continue to next question'}<ArrowRight size={15} /></button></section> :
        question ? <section className="panel rise mt-7 rounded-3xl p-6 sm:p-9"><div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground"><span className="rounded-full bg-primary/10 px-2.5 py-1 text-primary">{question.topic}</span><span>{question.questionType}</span><span className="text-white/20">·</span><span>{question.difficulty}</span></div><h2 className="display mt-6 text-[22px] font-bold leading-[1.42] sm:text-[27px]" data-testid="text-interview-question">{question.questionText}</h2>
          <label className="mt-7 block"><span className="mb-2 block text-xs font-semibold text-slate-300">Your answer</span><textarea rows={9} maxLength={12000} className="control resize-y !leading-7" placeholder="Take a moment to organize your thoughts. Answer in your own words…" value={answer} onChange={e => setAnswer(e.target.value)} data-testid="input-interview-answer" /></label>
          {submit.isError && <p className="mt-3 text-xs text-red-200">{errText(submit.error)}</p>}
          <div className="mt-5 flex flex-col-reverse justify-between gap-3 sm:flex-row sm:items-center"><button type="button" onClick={() => onSubmit(true)} className="btn btn-quiet self-start !px-3 text-xs" disabled={submit.isPending} data-testid="button-skip-question">Skip this question</button><button onClick={() => onSubmit(false)} disabled={submit.isPending || answer.trim().length === 0} className="btn btn-primary" data-testid="button-submit-answer">{submit.isPending ? 'Reviewing your answer…' : 'Submit answer'}<ArrowRight size={15} /></button></div>
          <p className="mt-5 flex items-center gap-2 text-[10px] text-muted-foreground"><LockKeyhole size={12} />Your answer is evaluated and saved with this interview.</p>
        </section> : <Empty title="No question is available" body="This session has no remaining question to answer." action={<Link href={`/interview/${id}/result`} className="btn btn-primary">View saved report</Link>} />}
      <p className="mt-6 text-center text-[10px] text-muted-foreground">One thoughtful answer at a time. There’s no timer unless you set one.</p>
    </main>
  </div>;
}
function FeedbackList({ title, items }: { title: string; items: string[] }) {
  return <div className="rounded-xl border border-white/[.07] p-4"><h3 className="text-xs font-bold">{title}</h3>{items?.length ? <ul className="mt-3 space-y-2">{items.map((v, i) => <li key={`${v}-${i}`} className="flex gap-2 text-xs leading-5 text-slate-300"><Check size={13} className="mt-0.5 shrink-0 text-primary" />{v}</li>)}</ul> : <p className="mt-2 text-xs text-muted-foreground">No specific notes in this area.</p>}</div>;
}

function ResultPage() {
  const { id = '' } = useParams<{ id: string }>(); const { data, isLoading, isError, error, refetch } = useGetInterview(id, { query: { queryKey: getGetInterviewQueryKey(id), enabled: !!id } });
  const [selected, setSelected] = useState(0);
  if (isLoading) return <Page title="Interview report"><Skeleton rows={5} /></Page>;
  if (isError || !data) return <Page title="Interview report"><ErrorBox message={errText(error)} retry={() => void refetch()} /></Page>;
  const report = data.report;
  if (!report) return <Page title="Interview report"><div className="mx-auto max-w-3xl"><Empty icon={Clock3} title="This interview is still in progress" body="Finish the remaining questions to create a complete saved report." action={<Link href={`/interview/${id}`} className="btn btn-primary">Continue interview <ArrowRight size={15} /></Link>} /></div></Page>;
  const activeReview = data.questions[selected] || data.questions[0];
  const ev = activeReview?.evaluation;
  const categories = [
    { name: 'Technical depth', value: report.technicalScore }, { name: 'Answer quality', value: report.answerQualityScore },
    { name: 'Relevance', value: report.relevanceScore }, { name: 'Communication', value: report.communicationScore }, { name: 'Clarity', value: report.clarityScore },
  ];
  return <Page title="Interview report" eyebrow="Saved session">
    <div className="rise flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><Link href="/history" className="mb-4 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft size={14} />Interview history</Link><p className="mono text-[10px] uppercase tracking-[.18em] text-primary">{report.interview.interviewType} · {dateLabel(report.interview.createdAt)}</p><h2 className="display mt-2 text-3xl font-extrabold sm:text-4xl">{report.interview.role}</h2><p className="mt-2 text-sm text-muted-foreground">{report.interview.difficulty} · {report.interview.programmingLanguage} · {report.interview.questionCount} questions</p></div><span className="rounded-full border border-primary/20 bg-primary/[.08] px-3 py-1.5 text-xs font-semibold text-primary">{report.performanceRating}</span></div>
    <div className="mt-7 grid gap-5 lg:grid-cols-[.85fr_1.5fr]">
      <section className="panel flex flex-col items-center justify-center rounded-3xl p-7 text-center"><p className="text-xs font-semibold text-muted-foreground">Overall performance</p><div className="relative mt-5 grid h-40 w-40 place-items-center rounded-full" style={{ background: `conic-gradient(hsl(var(--primary)) ${report.percentage}%, rgba(255,255,255,.08) 0)` }}><div className="grid h-[132px] w-[132px] place-items-center rounded-full bg-[#171c29]"><div><div className="display text-4xl font-extrabold">{Math.round(report.percentage)}<span className="text-lg">%</span></div><p className="mono mt-1 text-[10px] text-muted-foreground">{report.overallScore} / {report.interview.totalMarks} pts</p></div></div></div><div className="mt-4 text-[10px] text-muted-foreground">Feedback mode: {report.aiMode}</div></section>
      <section className="panel rounded-3xl p-5 sm:p-7"><h3 className="display text-lg font-bold">Score breakdown</h3><p className="mt-1 text-xs text-muted-foreground">A transparent view of the dimensions in this report.</p><div className="mt-6 space-y-5">{categories.map(c => <div key={c.name}><div className="mb-2 flex justify-between text-xs"><span className="text-slate-300">{c.name}</span><span className="mono text-muted-foreground">{percent(c.value)}</span></div><div className="h-1.5 rounded-full bg-white/[.08]"><div className="meter" style={{ width: `${Math.min(100, c.value)}%` }} /></div></div>)}</div></section>
    </div>
    <section className="panel mt-5 rounded-3xl p-5 sm:p-7"><div className="flex items-center gap-2"><Sparkles size={16} className="text-primary" /><h3 className="display text-lg font-bold">The useful takeaways</h3></div><p className="mt-4 max-w-4xl text-sm leading-7 text-slate-300">{report.finalFeedback}</p><div className="mt-6 grid gap-4 sm:grid-cols-2"><FeedbackList title="Strengths to keep" items={report.strengths} /><FeedbackList title="Areas to work on" items={report.weaknesses} /></div>{report.topicsToRevise?.length > 0 && <div className="mt-5"><p className="text-[10px] font-bold uppercase tracking-[.15em] text-muted-foreground">Topics to revisit</p><div className="mt-3 flex flex-wrap gap-2">{report.topicsToRevise.map(t => <span key={t} className="rounded-full bg-amber-200/[.08] px-3 py-1.5 text-xs text-amber-100">{t}</span>)}</div></div>}</section>
    <section className="panel mt-5 rounded-3xl p-5 sm:p-7"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h3 className="display text-lg font-bold">Question replay</h3><p className="mt-1 text-xs text-muted-foreground">Revisit each prompt and the evaluation saved with your answer.</p></div><span className="mono text-[10px] text-muted-foreground">{data.questions.length} PROMPTS</span></div>
      {data.questions.length ? <div className="mt-5 grid gap-5 lg:grid-cols-[230px_1fr]"><div className="space-y-2">{data.questions.map((q, i) => <button key={q.question.id} onClick={() => setSelected(i)} className={cx('w-full rounded-xl border p-3 text-left transition', selected === i ? 'border-primary/30 bg-primary/[.08]' : 'border-white/[.07] bg-white/[.015] hover:bg-white/[.04]')} data-testid={`button-replay-question-${i + 1}`}><div className="flex items-center justify-between"><span className="mono text-[10px] text-muted-foreground">QUESTION {q.question.questionNumber}</span><span className="text-[10px] text-primary">{q.evaluation ? `${q.evaluation.marksObtained} pts` : 'No answer'}</span></div><p className="mt-2 line-clamp-2 text-xs leading-5">{q.question.questionText}</p></button>)}</div>
        <div className="rounded-2xl border border-white/[.07] bg-white/[.02] p-5"><p className="mono text-[10px] uppercase tracking-[.15em] text-primary">{activeReview?.question.topic}</p><h4 className="display mt-2 text-lg font-bold leading-7">{activeReview?.question.questionText}</h4><div className="mt-5 border-t border-white/[.07] pt-4"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">Your answer</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">{ev?.answerText || 'This question was skipped.'}</p></div>{ev && <div className="mt-5 grid gap-4 md:grid-cols-2"><FeedbackList title={`Evaluation · ${ev.marksObtained} / ${activeReview.question.maxMarks} pts`} items={[...ev.strengths, ...ev.improvementTips]} /><FeedbackList title="Topics to revisit" items={ev.topicsToRevise} /></div>}</div>
      </div> : <p className="mt-5 text-sm text-muted-foreground">No question replay is available for this report.</p>}
    </section>
  </Page>;
}

function HistoryPage() {
  const [search, setSearch] = useState(''); const [status, setStatus] = useState('');
  const params = useMemo(() => status ? { status: status as 'completed' | 'in_progress' } : undefined, [status]);
  const { data, isLoading, isError, error, refetch } = useListInterviews(params);
  const remove = useDeleteInterview(); const queryClient = useQueryClient();
  const filtered = (data || []).filter(i => `${i.role} ${i.interviewType} ${i.programmingLanguage}`.toLowerCase().includes(search.toLowerCase()));
  const deleteById = (id: string) => { if (window.confirm('Delete this saved interview and its report? This cannot be undone.')) remove.mutate({ id }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListInterviewsQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); } }); };
  return <Page title="Interview history" eyebrow="Your sessions">
    <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="mono text-[10px] uppercase tracking-[.18em] text-primary">Look back, move forward</p><h2 className="display mt-2 text-3xl font-extrabold">Your practice archive.</h2><p className="mt-2 text-sm text-muted-foreground">Every session and every saved report, in one place.</p></div><Link href="/interviews/new" className="btn btn-primary self-start" data-testid="button-history-new"><Sparkles size={15} />New interview</Link></div>
    <div className="panel mt-7 rounded-2xl p-4"><div className="flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-3 text-muted-foreground" size={15} /><input className="control !pl-9" placeholder="Search role, format, or language" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-history-search" /></div><select className="control sm:w-48" value={status} onChange={e => setStatus(e.target.value)} data-testid="select-history-status"><option value="">All sessions</option><option value="completed">Completed</option><option value="in_progress">In progress</option></select></div></div>
    <div className="panel mt-4 rounded-2xl px-5 py-2 sm:px-6">{isLoading ? <div className="py-5"><Skeleton rows={4} /></div> : isError ? <div className="py-5"><ErrorBox message={errText(error)} retry={() => void refetch()} /></div> : filtered.length ? filtered.map(i => <SessionRow item={i} key={i.id} onDelete={deleteById} />) : <div className="py-5"><Empty icon={Search} title={search || status ? 'No sessions match' : 'No sessions saved yet'} body={search || status ? 'Try changing your search or filter.' : 'Once you finish an interview, it will be saved here with the feedback and replay.'} action={!search && !status ? <Link href="/interviews/new" className="btn btn-primary">Set up your first session <ArrowRight size={15} /></Link> : undefined} /></div>}</div>
    {remove.isError && <p className="mt-3 text-xs text-red-200">{errText(remove.error)}</p>}
  </Page>;
}

function AnalyticsPage() {
  const { data, isLoading, isError, error, refetch } = useGetAnalytics();
  if (isLoading) return <Page title="Progress"><Skeleton rows={5} /></Page>;
  if (isError || !data) return <Page title="Progress"><ErrorBox message={errText(error)} retry={() => void refetch()} /></Page>;
  const points = data.scoreTrend || [];
  const min = Math.min(0, ...points.map(p => p.score)); const max = Math.max(100, ...points.map(p => p.score));
  const chartPoints = points.map((p, i) => `${points.length <= 1 ? 50 : i / (points.length - 1) * 100},${90 - ((p.score - min) / (max - min || 1)) * 75}`).join(' ');
  return <Page title="Progress" eyebrow="Patterns over time">
    <div className="rise"><p className="mono text-[10px] uppercase tracking-[.18em] text-primary">Progress, not perfection</p><h2 className="display mt-2 text-3xl font-extrabold">See how you’re growing.</h2><p className="mt-2 text-sm text-muted-foreground">A view of the scores from your saved interview sessions.</p></div>
    <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Average score" value={percent(data.averageScore)} sub="Across completed sessions" icon={Activity} /><Metric label="Personal best" value={percent(data.bestScore)} sub="Your highest score" icon={Target} tone="blue" /><Metric label="Room to grow" value={percent(data.worstScore)} sub="Your lowest saved score" icon={ArrowDownRight} tone="amber" /><Metric label="Change over time" value={`${data.improvement > 0 ? '+' : ''}${data.improvement}%`} sub="Since your first session" icon={data.improvement >= 0 ? ArrowUpRight : ArrowDownRight} /></div>
    <div className="mt-5 grid gap-5 xl:grid-cols-[1.4fr_.9fr]">
      <section className="panel rounded-2xl p-5 sm:p-7"><div className="flex justify-between"><div><h3 className="display text-lg font-bold">Score journey</h3><p className="mt-1 text-xs text-muted-foreground">Interview scores in time order</p></div><span className="mono text-[10px] text-primary">PERCENT</span></div>
        {points.length ? <div className="mt-6"><svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-56 w-full overflow-visible"><line x1="0" y1="90" x2="100" y2="90" stroke="rgba(255,255,255,.09)" strokeDasharray="1 2" /><line x1="0" y1="52" x2="100" y2="52" stroke="rgba(255,255,255,.06)" strokeDasharray="1 2" /><line x1="0" y1="15" x2="100" y2="15" stroke="rgba(255,255,255,.06)" strokeDasharray="1 2" /><polyline points={chartPoints} fill="none" stroke="hsl(164 69% 58%)" strokeWidth="1.7" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />{points.map((p, i) => <circle key={`${p.date}-${i}`} cx={points.length <= 1 ? 50 : i / (points.length - 1) * 100} cy={90 - ((p.score - min) / (max - min || 1)) * 75} r="1.5" fill="hsl(164 69% 58%)" />)}</svg><div className="mt-3 grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(points.length, 6)}, minmax(0,1fr))` }}>{points.filter((_, i) => points.length <= 6 || i % Math.ceil(points.length / 6) === 0).map((p, i) => <div key={`${p.date}-${i}`} className="min-w-0"><p className="mono text-[10px] text-primary">{Math.round(p.score)}%</p><p className="truncate text-[9px] text-muted-foreground">{dateLabel(p.date)}</p></div>)}</div></div> : <Empty icon={BarChart3} title="Your trend starts with a session" body="Complete a few interviews to see your score journey take shape." action={<Link href="/interviews/new" className="btn btn-primary">Start practicing</Link>} />}
      </section>
      <section className="panel rounded-2xl p-5 sm:p-7"><h3 className="display text-lg font-bold">By skill area</h3><p className="mt-1 text-xs text-muted-foreground">Average score by evaluation category</p>
        {data.categoryScores?.length ? <div className="mt-7 space-y-6">{data.categoryScores.map(c => <div key={c.category}><div className="mb-2 flex justify-between text-xs"><span>{c.category}</span><span className="mono text-muted-foreground">{percent(c.score)}</span></div><div className="h-1.5 rounded-full bg-white/[.08]"><div className="meter" style={{ width: `${Math.min(100, c.score)}%` }} /></div></div>)}</div> : <div className="mt-5"><p className="text-sm text-muted-foreground">Category scores will appear after an interview is completed.</p></div>}
      </section>
    </div>
    <div className="mt-5 rounded-2xl border border-primary/15 bg-primary/[.045] p-5"><div className="flex items-start gap-3"><Sparkles className="mt-0.5 text-primary" size={17} /><div><h3 className="text-sm font-bold">Keep the signal, not the noise.</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Scores are one perspective on your answers. Use the written feedback and replay to decide what to practice next.</p></div></div></div>
  </Page>;
}

function RoadmapPage() {
  const { data, isLoading, isError, error, refetch } = useGetRoadmap(); const update = useUpdateRoadmapItem(); const client = useQueryClient();
  const items = [...(data || [])].sort((a, b) => a.orderIndex - b.orderIndex);
  const cycle = (status: RoadmapProgressInputStatus) => status === 'Not Started' ? 'In Progress' : status === 'In Progress' ? 'Completed' : 'Not Started';
  const changeStatus = (item: NonNullable<typeof data>[number]) => update.mutate({ id: item.id, data: { status: cycle(item.status) } }, { onSuccess: () => { client.invalidateQueries({ queryKey: getGetRoadmapQueryKey() }); client.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); } });
  const completeCount = items.filter(i => i.status === 'Completed').length;
  return <Page title="Learning plan" eyebrow="Your next steps">
    <div className="rise flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="mono text-[10px] uppercase tracking-[.18em] text-primary">Small steps, steady progress</p><h2 className="display mt-2 text-3xl font-extrabold">A plan built from practice.</h2><p className="mt-2 text-sm text-muted-foreground">Work through your focus areas at your own pace.</p></div>{items.length > 0 && <div className="rounded-xl border border-white/[.08] bg-white/[.025] px-4 py-3"><span className="mono text-lg text-primary">{completeCount} / {items.length}</span><span className="ml-2 text-xs text-muted-foreground">completed</span></div>}</div>
    {isLoading ? <div className="mt-7"><Skeleton rows={5} /></div> : isError ? <div className="mt-7"><ErrorBox message={errText(error)} retry={() => void refetch()} /></div> : !items.length ? <div className="mt-7"><Empty icon={BookOpen} title="Your plan is still taking shape" body="After you complete interview practice, targeted learning items will appear here. Each one will have a clear task and a status you can update." /></div> : <div className="mt-7 space-y-3">{items.map((item, i) => <article key={item.id} className="panel rise rounded-2xl p-5 sm:p-6" style={{ animationDelay: `${Math.min(i, 4) * 55}ms` }}><div className="flex flex-col gap-4 sm:flex-row"><div className="flex items-start gap-3 sm:flex-1"><span className={cx('mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border text-xs font-semibold', item.status === 'Completed' ? 'border-primary/30 bg-primary/10 text-primary' : 'border-white/10 text-muted-foreground')}>{item.status === 'Completed' ? <Check size={14} /> : String(i + 1).padStart(2, '0')}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="display text-lg font-bold">{item.topic}</h3><span className={cx('rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-wider', item.priority.toLowerCase() === 'high' ? 'bg-amber-300/10 text-amber-200' : 'bg-sky-300/10 text-sky-200')}>{item.priority} priority</span></div><p className="mt-2 text-sm leading-6 text-slate-300/80">{item.description}</p><div className="mt-4 rounded-xl border border-white/[.06] bg-white/[.025] p-4"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">Try this</p><p className="mt-1 text-xs leading-5 text-slate-300">{item.practiceTask}</p></div></div></div><div className="flex items-center justify-between gap-4 border-t border-white/[.06] pt-4 sm:w-44 sm:flex-col sm:items-end sm:justify-start sm:border-0 sm:pt-1"><span className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Clock3 size={13} />{item.estimatedMinutes} min</span><button onClick={() => changeStatus(item)} disabled={update.isPending} className={cx('btn !px-3 !py-2 text-xs', item.status === 'Completed' ? 'btn-quiet' : 'btn-primary')} data-testid={`button-roadmap-status-${item.id}`}>{item.status === 'Completed' ? 'Mark not started' : item.status === 'In Progress' ? 'Mark complete' : 'Start this'}</button></div></div></article>)}</div>}
    {update.isError && <div className="mt-4"><ErrorBox message={errText(update.error)} /></div>}
  </Page>;
}

function ProfilePage() {
  const { data: profile, isLoading, isError, error, refetch } = useGetProfile();
  const update = useUpdateProfile(); const client = useQueryClient();
  const [form, setForm] = useState<ProfileInput | null>(null); const [saved, setSaved] = useState(false);
  useEffect(() => { if (profile && !form) setForm({ fullName: profile.fullName, username: profile.username, preferredRole: profile.preferredRole, preferredProgrammingLanguage: profile.preferredProgrammingLanguage, preferredInterviewLanguage: profile.preferredInterviewLanguage as ProfileInput['preferredInterviewLanguage'] }); }, [profile, form]);
  if (isLoading) return <Page title="Profile"><Skeleton rows={4} /></Page>;
  if (isError || !profile) return <Page title="Profile"><ErrorBox message={errText(error)} retry={() => void refetch()} /></Page>;
  if (!form) return <Page title="Profile"><Skeleton rows={4} /></Page>;
  const edit = <K extends keyof ProfileInput>(key: K, value: ProfileInput[K]) => { setSaved(false); setForm(f => f ? { ...f, [key]: value } : f); };
  const save = (e: FormEvent) => { e.preventDefault(); update.mutate({ data: form }, { onSuccess: next => { client.setQueryData(getGetProfileQueryKey(), next); client.invalidateQueries({ queryKey: getGetCurrentAccountQueryKey() }); setSaved(true); } }); };
  return <Page title="Profile & preferences" eyebrow="Make it yours">
    <div className="mx-auto max-w-4xl"><p className="mono text-[10px] uppercase tracking-[.18em] text-primary">Account settings</p><h2 className="display mt-2 text-3xl font-extrabold">Your practice, your preferences.</h2><p className="mt-2 text-sm text-muted-foreground">Choose the defaults you want to see when you set up a session.</p>
      <div className="mt-7 grid gap-5 lg:grid-cols-[.75fr_1.25fr]"><section className="panel rounded-2xl p-6"><div className="flex items-center gap-4"><div className="grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-xl font-bold text-primary">{profile.fullName.slice(0, 1)}</div><div><h3 className="display font-bold">{profile.fullName}</h3><p className="text-xs text-muted-foreground">@{profile.username}</p></div></div><div className="mt-6 border-t border-white/[.07] pt-5"><p className="text-[10px] font-bold uppercase tracking-[.15em] text-muted-foreground">Account email</p><p className="mt-2 text-sm">{profile.email}</p></div><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl bg-white/[.03] p-3"><p className="mono text-lg">{profile.totalInterviews}</p><p className="text-[10px] text-muted-foreground">Sessions</p></div><div className="rounded-xl bg-white/[.03] p-3"><p className="mono text-lg">{percent(profile.readinessScore)}</p><p className="text-[10px] text-muted-foreground">Readiness</p></div></div></section>
        <form onSubmit={save} className="panel rounded-2xl p-5 sm:p-7"><div className="flex items-center gap-2"><Settings2 size={17} className="text-primary" /><h3 className="display text-lg font-bold">Practice defaults</h3></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><Field label="Full name"><input className="control" required minLength={2} maxLength={100} value={form.fullName} onChange={e => edit('fullName', e.target.value)} data-testid="input-profile-name" /></Field><Field label="Username"><input className="control" required minLength={3} maxLength={32} value={form.username} onChange={e => edit('username', e.target.value)} data-testid="input-profile-username" /></Field><Field label="Preferred role"><input className="control" placeholder="e.g. Product Designer" value={form.preferredRole || ''} onChange={e => edit('preferredRole', e.target.value || null)} data-testid="input-profile-role" /></Field><SelectField label="Programming language" value={form.preferredProgrammingLanguage || 'JavaScript'} values={optionSet.languages} onChange={v => edit('preferredProgrammingLanguage', v)} /><SelectField label="Interview language" value={form.preferredInterviewLanguage} values={optionSet.spoken} onChange={v => edit('preferredInterviewLanguage', v as ProfileInput['preferredInterviewLanguage'])} /></div>{update.isError && <p className="mt-4 text-xs text-red-200">{errText(update.error)}</p>}{saved && <p className="mt-4 flex items-center gap-2 text-xs text-primary" role="status" data-testid="status-profile-saved"><CheckCircle2 size={14} />Preferences saved.</p>}<div className="mt-6 flex justify-end border-t border-white/[.07] pt-5"><button className="btn btn-primary" disabled={update.isPending} data-testid="button-save-profile">{update.isPending ? 'Saving…' : 'Save preferences'}<Check size={15} /></button></div></form></div>
    </div>
  </Page>;
}
function NotFound() { return <main className="app-shell grid min-h-[100dvh] place-items-center p-6"><div className="text-center"><Brand /><p className="mono mt-12 text-xs text-primary">404 · PAGE NOT FOUND</p><h1 className="display mt-3 text-3xl font-bold">This page isn’t in the practice room.</h1><Link className="btn btn-primary mt-6" href="/dashboard">Return to overview <ArrowRight size={15} /></Link></div></main>; }
function ProtectedRoutes() {
  return <Switch>
    <Route path="/dashboard" component={DashboardPage} />
    <Route path="/interviews/new" component={NewInterviewPage} />
    <Route path="/interview/:id/result" component={ResultPage} />
    <Route path="/interview/:id" component={LiveInterviewPage} />
    <Route path="/history" component={HistoryPage} />
    <Route path="/analytics" component={AnalyticsPage} />
    <Route path="/roadmap" component={RoadmapPage} />
    <Route path="/profile" component={ProfilePage} />
    <Route path="/" component={DashboardPage} />
    <Route component={NotFound} />
  </Switch>;
}
function Router() {
  return <Switch><Route path="/login"><AuthPage mode="login" /></Route><Route path="/register"><AuthPage mode="register" /></Route><Route><ProtectedRoutes /></Route></Switch>;
}
function App() {
  return <QueryClientProvider client={qc}><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter></QueryClientProvider>;
}
export default App;
