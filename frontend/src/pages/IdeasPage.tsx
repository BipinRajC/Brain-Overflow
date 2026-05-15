import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Layers,
  Activity,
  CheckCircle2,
  TrendingUp,
  Search,
  ArrowDownAZ,
  Circle,
  CircleDot,
  Sparkles,
  AlertTriangle,
  TrendingDown,
  RefreshCw,
  Clock,
} from 'lucide-react'
import { FluidDropdown, type Category } from '@/components/ui/fluid-dropdown'
import { Input } from '@/components/ui/input'
import { IdeaCard } from '@/components/idea/IdeaCard'
import { useIdeas } from '@/hooks/useIdeas'
import { deleteIdea } from '@/lib/api/ideas'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

const STATUS_OPTS: Category[] = [
  { id: 'all', label: 'All Status', icon: Layers, color: '#7a8290' },
  { id: 'recorded', label: 'Recorded', icon: Circle, color: '#7a8290' },
  { id: 'processing', label: 'Processing', icon: CircleDot, color: '#d4a574' },
  { id: 'completed', label: 'Completed', icon: CheckCircle2, color: '#88c9a1' },
  { id: 'failed', label: 'Failed', icon: AlertTriangle, color: '#c97070' },
]

const SCORE_OPTS: Category[] = [
  { id: 'all', label: 'All Scores', icon: Sparkles, color: '#7a8290' },
  { id: 'strong', label: 'Strong', icon: TrendingUp, color: '#88c9a1' },
  { id: 'needs_refinement', label: 'Needs Refinement', icon: Clock, color: '#c9b870' },
  { id: 'needs_pivot', label: 'Needs Pivot', icon: RefreshCw, color: '#d4a574' },
  { id: 'weak', label: 'Weak', icon: TrendingDown, color: '#c97070' },
]

const SORT_OPTS: Category[] = [
  { id: 'created_at', label: 'Newest First', icon: ArrowDownAZ, color: '#7a8290' },
  { id: 'score', label: 'By Score', icon: TrendingUp, color: '#88c9a1' },
]

export function IdeasPage() {
  const { ideas, loading, error, refetch } = useIdeas()
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterScore, setFilterScore] = useState('all')
  const [sortBy, setSortBy] = useState('created_at')
  const [search, setSearch] = useState('')
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const arr = ideas.filter((idea) => {
      if (filterStatus !== 'all' && idea.status !== filterStatus) return false
      if (filterScore !== 'all' && idea.score !== filterScore) return false
      if (search && !idea.idea.toLowerCase().includes(search.toLowerCase()))
        return false
      return true
    })
    if (sortBy === 'score') {
      const order: Record<string, number> = {
        strong: 4,
        needs_refinement: 3,
        needs_pivot: 2,
        weak: 1,
      }
      return [...arr].sort(
        (a, b) => (order[b.score ?? ''] ?? 0) - (order[a.score ?? ''] ?? 0),
      )
    }
    return arr
  }, [ideas, filterStatus, filterScore, sortBy, search])

  const stats = useMemo(
    () => ({
      total: ideas.length,
      processing: ideas.filter((i) => i.status === 'processing').length,
      completed: ideas.filter((i) => i.status === 'completed').length,
      strong: ideas.filter((i) => i.score === 'strong').length,
    }),
    [ideas],
  )

  async function confirmDelete() {
    if (!pendingDelete) return
    try {
      await deleteIdea(pendingDelete)
      setPendingDelete(null)
      refetch()
    } catch (e) {
      console.error(e)
      setPendingDelete(null)
    }
  }

  return (
    <div className="relative min-h-[100dvh] pt-20 pb-32 px-4 md:px-8">
      <div className="mx-auto max-w-7xl">
        <motion.header
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between"
        >
          <div>
            <h1 className="font-pixel text-3xl tracking-[0.06em]">IDEAS_DASHBOARD</h1>
            <p className="mt-2 font-mono text-xs text-[color:var(--color-text-mute)]">
              {stats.total} total · {stats.processing} processing · {stats.completed} completed ·{' '}
              {stats.strong} strong
            </p>
          </div>
        </motion.header>

        {/* Stats row */}
        <div className="mb-8 grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { Icon: Layers, label: 'TOTAL', value: stats.total },
            { Icon: Activity, label: 'PROCESSING', value: stats.processing },
            { Icon: CheckCircle2, label: 'COMPLETED', value: stats.completed },
            { Icon: TrendingUp, label: 'STRONG', value: stats.strong },
          ].map(({ Icon, label, value }) => (
            <div
              key={label}
              className="border border-[color:var(--color-edge)] bg-[color:var(--color-surface)]/40 backdrop-blur p-4"
            >
              <div className="flex items-center gap-2 text-[color:var(--color-text-mute)]">
                <Icon className="h-3.5 w-3.5" />
                <span className="font-pixel text-[10px] tracking-[0.2em] uppercase">
                  {label}
                </span>
              </div>
              <p className="mt-2 font-mono text-3xl text-[color:var(--color-text)]">
                {value}
              </p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 items-start">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[color:var(--color-text-dim)]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search ideas…"
              className="pl-9 h-10"
            />
          </div>
          <FluidDropdown
            categories={STATUS_OPTS}
            value={filterStatus}
            onChange={setFilterStatus}
          />
          <FluidDropdown
            categories={SCORE_OPTS}
            value={filterScore}
            onChange={setFilterScore}
          />
          <FluidDropdown
            categories={SORT_OPTS}
            value={sortBy}
            onChange={setSortBy}
          />
        </div>

        {error && (
          <div className="mb-6 font-mono text-xs text-[color:var(--color-weak)] border border-[color:var(--color-weak)]/30 px-3 py-2">
            ! {error}
          </div>
        )}

        {loading && ideas.length === 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-32 border border-[color:var(--color-edge)] bg-[color:var(--color-surface)]/30 animate-pulse"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-24 text-center">
            <pre className="inline-block font-pixel text-[10px] leading-tight text-[color:var(--color-text-dim)] mb-6">
{`┌──────────────────┐
│   NO_SIGNAL      │
│   ────────       │
│   ▓░░░░░░░░░░    │
└──────────────────┘`}
            </pre>
            <p className="font-mono text-sm text-[color:var(--color-text-mute)]">
              {ideas.length === 0
                ? 'no ideas recorded yet. speak one from the recorder.'
                : 'no matches. adjust filters.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 auto-rows-min">
            {filtered.map((idea) => (
              <IdeaCard
                key={idea.id}
                idea={idea}
                onDelete={(id) => setPendingDelete(id)}
              />
            ))}
          </div>
        )}
      </div>

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>DELETE IDEA?</AlertDialogTitle>
            <AlertDialogDescription>
              this removes the idea and every chat_message tied to it. cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
