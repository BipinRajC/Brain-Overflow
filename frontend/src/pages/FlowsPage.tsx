import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ArrowLeft,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
  Workflow,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import DotPattern from '@/components/ui/dot-pattern-1'
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
import {
  createFlow,
  deleteFlow,
  listFlows,
  updateFlow,
} from '@/lib/api/flows'
import { listPrompts } from '@/lib/api/prompts'
import type { Flow, Prompt } from '@/types'

interface EditingFlow {
  id?: string
  flow_name: string
  telegram_command: string
  prompt_ids: string[]
}

const BLANK: EditingFlow = { flow_name: '', telegram_command: '', prompt_ids: [] }

function SortablePromptItem({
  promptId,
  name,
  index,
  onRemove,
}: {
  promptId: string
  name: string
  index: number
  onRemove: (idx: number) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: promptId })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 1,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 border border-[color:var(--color-edge)] bg-[color:var(--color-deep)]/60 p-3 ${
        isDragging ? 'border-[color:var(--color-edge-glow)] shadow-md' : ''
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text-mute)]"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="font-pixel text-[10px] tracking-widest text-[color:var(--color-text-mute)] w-6">
        #{index + 1}
      </span>
      <span className="flex-1 font-mono text-sm">{name}</span>
      <button
        onClick={() => onRemove(index)}
        className="p-1 text-[color:var(--color-text-mute)] hover:text-[color:var(--color-weak)]"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

export function FlowsPage() {
  const [flows, setFlows] = useState<Flow[]>([])
  const [prompts, setPrompts] = useState<Prompt[]>([])
  const [editing, setEditing] = useState<EditingFlow | null>(null)
  const [form, setForm] = useState<EditingFlow | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  async function fetchAll() {
    try {
      const [f, p] = await Promise.all([listFlows(), listPrompts()])
      setFlows(f)
      setPrompts(p)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load')
    }
  }

  useEffect(() => {
    fetchAll()
  }, [])

  function promptName(id: string) {
    return prompts.find((p) => p.id === id)?.prompt_name ?? id.slice(0, 8)
  }

  function validateTelegram(cmd: string): string | null {
    if (!cmd) return null
    if (!/^[a-z0-9_]+$/.test(cmd))
      return 'Telegram command must be lowercase letters, numbers, or underscores'
    return null
  }

  async function createNew() {
    if (!form) return
    if (!form.flow_name.trim()) {
      setErr('Flow name required')
      return
    }
    const tErr = validateTelegram(form.telegram_command.trim().toLowerCase())
    if (tErr) {
      setErr(tErr)
      return
    }
    setBusy(true)
    setErr('')
    try {
      const flow = await createFlow({
        flow_name: form.flow_name.trim(),
        telegram_command: form.telegram_command.trim().toLowerCase() || null,
        prompt_ids: [],
      })
      setForm(null)
      setEditing({
        id: flow.id,
        flow_name: flow.flow_name,
        telegram_command: flow.telegram_command ?? '',
        prompt_ids: [],
      })
      fetchAll()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to create')
    } finally {
      setBusy(false)
    }
  }

  async function saveEdit() {
    if (!editing || !editing.id) return
    const tErr = validateTelegram(editing.telegram_command.trim().toLowerCase())
    if (tErr) {
      setErr(tErr)
      return
    }
    setBusy(true)
    setErr('')
    try {
      await updateFlow(editing.id, {
        flow_name: editing.flow_name,
        telegram_command: editing.telegram_command.trim().toLowerCase() || null,
        prompt_ids: editing.prompt_ids,
      })
      setEditing(null)
      fetchAll()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setBusy(false)
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    try {
      await deleteFlow(pendingDelete)
      setPendingDelete(null)
      fetchAll()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to delete')
      setPendingDelete(null)
    }
  }

  function handleDragEnd(event: any) {
    if (!editing) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = editing.prompt_ids.indexOf(active.id)
    const newIdx = editing.prompt_ids.indexOf(over.id)
    setEditing({ ...editing, prompt_ids: arrayMove(editing.prompt_ids, oldIdx, newIdx) })
  }

  // EDIT VIEW
  if (editing) {
    const unused = prompts.filter((p) => !editing.prompt_ids.includes(p.id))

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.24 }}
        className="relative min-h-[100dvh] pt-20 pb-32 px-4 md:px-8"
      >
        <div className="mx-auto max-w-4xl">
          <button
            onClick={() => {
              setEditing(null)
              setErr('')
            }}
            className="mb-6 inline-flex items-center gap-2 font-mono text-xs text-[color:var(--color-text-mute)] hover:text-[color:var(--color-text)] transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> back to flows
          </button>

          <h1 className="mb-8 font-pixel text-2xl tracking-[0.06em]">EDIT_FLOW</h1>

          {err && (
            <div className="mb-6 font-mono text-xs text-[color:var(--color-weak)] border border-[color:var(--color-weak)]/30 px-3 py-2 flex items-center justify-between">
              <span>! {err}</span>
              <button onClick={() => setErr('')}>
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="border border-[color:var(--color-edge)] bg-[color:var(--color-surface)]/40 backdrop-blur p-5">
              <h2 className="font-pixel text-[10px] tracking-[0.22em] uppercase text-[color:var(--color-text-mute)] mb-4">
                FLOW_SETTINGS
              </h2>
              <div className="space-y-4">
                <div>
                  <Label>FLOW_NAME</Label>
                  <Input
                    value={editing.flow_name}
                    onChange={(e) =>
                      setEditing({ ...editing, flow_name: e.target.value })
                    }
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>TELEGRAM_COMMAND</Label>
                  <Input
                    value={editing.telegram_command}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        telegram_command: e.target.value.toLowerCase(),
                      })
                    }
                    placeholder="startup"
                    className="mt-2"
                  />
                  <p className="mt-2 font-mono text-[10px] text-[color:var(--color-text-dim)]">
                    users type{' '}
                    <code className="text-[color:var(--color-text-mute)]">
                      /{editing.telegram_command || 'command'} idea text
                    </code>{' '}
                    in telegram
                  </p>
                </div>
              </div>
            </div>

            <div className="border border-[color:var(--color-edge)] bg-[color:var(--color-surface)]/40 backdrop-blur p-5">
              <h2 className="font-pixel text-[10px] tracking-[0.22em] uppercase text-[color:var(--color-text-mute)] mb-4">
                PROMPT_CHAIN ({editing.prompt_ids.length} step{editing.prompt_ids.length === 1 ? '' : 's'})
              </h2>
              {editing.prompt_ids.length === 0 ? (
                <p className="py-6 text-center font-mono text-xs text-[color:var(--color-text-mute)]">
                  add prompts below. drag to reorder.
                </p>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={editing.prompt_ids}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2">
                      {editing.prompt_ids.map((pid, idx) => (
                        <SortablePromptItem
                          key={pid}
                          promptId={pid}
                          name={promptName(pid)}
                          index={idx}
                          onRemove={(removeIdx) =>
                            setEditing({
                              ...editing,
                              prompt_ids: editing.prompt_ids.filter(
                                (_, i) => i !== removeIdx,
                              ),
                            })
                          }
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>
          </div>

          <div className="mt-6">
            <h2 className="font-pixel text-[10px] tracking-[0.22em] uppercase text-[color:var(--color-text-mute)] mb-3">
              AVAILABLE_PROMPTS
            </h2>
            {unused.length === 0 ? (
              <p className="py-6 text-center font-mono text-xs text-[color:var(--color-text-mute)]">
                all prompts in chain.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {unused.map((p) => (
                  <button
                    key={p.id}
                    onClick={() =>
                      setEditing({
                        ...editing,
                        prompt_ids: [...editing.prompt_ids, p.id],
                      })
                    }
                    className="group flex items-center justify-between border border-[color:var(--color-edge)] bg-[color:var(--color-surface)]/40 backdrop-blur p-3 hover:border-[color:var(--color-edge-glow)] transition-colors text-left"
                  >
                    <span className="font-mono text-sm truncate">{p.prompt_name}</span>
                    <Plus className="h-3.5 w-3.5 text-[color:var(--color-text-mute)]" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-8 flex gap-3">
            <Button onClick={saveEdit} disabled={busy}>
              {busy ? 'SAVING…' : 'SAVE_FLOW'}
            </Button>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              CANCEL
            </Button>
          </div>
        </div>
      </motion.div>
    )
  }

  // LIST VIEW
  return (
    <div className="relative min-h-[100dvh] pt-20 pb-32 px-4 md:px-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Workflow className="h-5 w-5 text-[color:var(--color-text-mute)]" />
            <h1 className="font-pixel text-2xl tracking-[0.06em]">FLOWS</h1>
          </div>
          <Button
            onClick={() => {
              setForm({ ...BLANK })
              setErr('')
            }}
          >
            <Plus className="h-4 w-4" />
            NEW FLOW
          </Button>
        </header>

        <p className="mb-6 font-mono text-xs text-[color:var(--color-text-mute)]">
          flows chain prompts. set telegram_command so users can type{' '}
          <code className="text-[color:var(--color-text)]">/startup</code> in telegram.
        </p>

        <AnimatePresence>
          {err && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-6 font-mono text-xs text-[color:var(--color-weak)] border border-[color:var(--color-weak)]/30 px-3 py-2 flex items-center justify-between"
            >
              <span>! {err}</span>
              <button onClick={() => setErr('')}>
                <X className="h-3 w-3" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {form && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-8 border border-[color:var(--color-edge-glow)] bg-[color:var(--color-surface)]/60 backdrop-blur p-6"
            >
              <h2 className="font-pixel text-sm tracking-[0.2em] uppercase mb-5">
                NEW_FLOW
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>FLOW_NAME</Label>
                  <Input
                    value={form.flow_name}
                    onChange={(e) => setForm({ ...form, flow_name: e.target.value })}
                    placeholder="Startup Analysis"
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>TELEGRAM_COMMAND</Label>
                  <Input
                    value={form.telegram_command}
                    onChange={(e) =>
                      setForm({ ...form, telegram_command: e.target.value.toLowerCase() })
                    }
                    placeholder="startup"
                    className="mt-2"
                  />
                </div>
              </div>
              <div className="mt-6 flex gap-3">
                <Button onClick={createNew} disabled={busy}>
                  {busy ? 'CREATING…' : 'CREATE'}
                </Button>
                <Button variant="ghost" onClick={() => setForm(null)}>
                  CANCEL
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {flows.length === 0 && !form ? (
          <div className="py-24 text-center font-mono text-sm text-[color:var(--color-text-mute)]">
            no flows yet. create one to chain prompts.
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {flows.map((flow) => (
                <motion.div
                  key={flow.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  className="group relative overflow-hidden border border-[color:var(--color-edge)] bg-[color:var(--color-surface)]/40 backdrop-blur p-5"
                >
                  <DotPattern
                    width={6}
                    height={6}
                    className="fill-[color:var(--color-edge-glow)] opacity-25"
                  />
                  <span className="absolute -left-px -top-px h-2 w-2 bg-[color:var(--color-text-dim)]" />
                  <span className="absolute -right-px -top-px h-2 w-2 bg-[color:var(--color-text-dim)]" />
                  <span className="absolute -bottom-px -left-px h-2 w-2 bg-[color:var(--color-text-dim)]" />
                  <span className="absolute -bottom-px -right-px h-2 w-2 bg-[color:var(--color-text-dim)]" />

                  <div className="relative flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-pixel text-sm tracking-[0.04em] uppercase">
                          {flow.flow_name}
                        </h3>
                        {flow.telegram_command && (
                          <span className="font-pixel text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-mute)] border border-[color:var(--color-edge)] px-2 py-0.5">
                            /{flow.telegram_command}
                          </span>
                        )}
                      </div>
                      <p className="font-mono text-xs text-[color:var(--color-text-mute)]">
                        {(flow.prompt_ids || []).length} prompt
                        {(flow.prompt_ids || []).length === 1 ? '' : 's'} ·{' '}
                        {(flow.prompt_ids || []).map((id) => promptName(id)).join(' → ') ||
                          'no prompts'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() =>
                          setEditing({
                            id: flow.id,
                            flow_name: flow.flow_name,
                            telegram_command: flow.telegram_command ?? '',
                            prompt_ids: [...(flow.prompt_ids ?? [])],
                          })
                        }
                        className="p-1.5 text-[color:var(--color-text-mute)] hover:text-[color:var(--color-text)]"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setPendingDelete(flow.id)}
                        className="p-1.5 text-[color:var(--color-text-mute)] hover:text-[color:var(--color-weak)]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>DELETE FLOW?</AlertDialogTitle>
            <AlertDialogDescription>
              ideas tied to this flow keep their flow_id reference. cannot be undone.
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
