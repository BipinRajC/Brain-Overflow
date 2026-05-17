import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Cpu, Info, Pencil, Plus, Star, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import DotPattern from '@/components/ui/dot-pattern-1'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  createModel,
  deleteModel,
  listModels,
  setActiveModel,
  updateModel,
} from '@/lib/api/models'
import { getModelProfile, updateModelProfile, createModelProfile } from '@/lib/api/model-profiles'
import type { Model, Provider, ModelProfile } from '@/types'

interface FormState {
  id?: string
  model_name: string
  model_id: string
  provider: string
}

const BLANK: FormState = { model_name: '', model_id: '', provider: 'fireworks' }

export function ModelsPage() {
  const [models, setModels] = useState<Model[]>([])
  const [form, setForm] = useState<FormState | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [configuringModel, setConfiguringModel] = useState<string | null>(null)
  const [modelProfile, setModelProfile] = useState<Partial<ModelProfile>>({})

  async function fetchAll() {
    try {
      setModels(await listModels())
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load models')
    }
  }

  useEffect(() => {
    fetchAll()
  }, [])

  async function save() {
    if (!form) return
    if (!form.model_name.trim() || !form.model_id.trim()) {
      setErr('All fields required')
      return
    }
    setBusy(true)
    setErr('')
    try {
      if (form.id) {
        await updateModel(form.id, {
          model_name: form.model_name,
          model_id: form.model_id,
          provider: form.provider,
        })
      } else {
        await createModel({
          model_name: form.model_name,
          model_id: form.model_id,
          provider: form.provider,
        })
      }
      setForm(null)
      fetchAll()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setBusy(false)
    }
  }

  async function activate(id: string) {
    setBusy(true)
    setErr('')
    try {
      await setActiveModel(id)
      fetchAll()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to activate')
    } finally {
      setBusy(false)
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    try {
      await deleteModel(pendingDelete)
      setPendingDelete(null)
      fetchAll()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to delete')
      setPendingDelete(null)
    }
  }

  async function loadAndConfigureModel(modelId: string) {
    setBusy(true)
    setErr('')
    try {
      const profile = await getModelProfile(modelId)
      setModelProfile(profile ?? {
        temperature: 0.3,
        max_tokens: 8192,
        reasoning_budget: 0,
        timeout_ms: 60000,
        max_retries: 2,
        prompt_format: 'json_schema',
        strip_reasoning: true,
      })
      setConfiguringModel(modelId)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load profile')
    } finally {
      setBusy(false)
    }
  }

  async function saveModelProfile() {
    if (!configuringModel) return
    setBusy(true)
    setErr('')
    try {
      const existing = await getModelProfile(configuringModel)
      if (existing) {
        await updateModelProfile(configuringModel, modelProfile)
      } else {
        await createModelProfile(configuringModel, modelProfile)
      }
      setConfiguringModel(null)
      setModelProfile({})
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save profile')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative min-h-[100dvh] pt-20 pb-32 px-4 md:px-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Cpu className="h-5 w-5 text-[color:var(--color-text-mute)]" />
            <h1 className="font-pixel text-3xl tracking-[0.06em]">MODELS</h1>
          </div>
          <Button
            onClick={() => {
              setForm({ ...BLANK })
              setErr('')
            }}
          >
            <Plus className="h-4 w-4" />
            ADD MODEL
          </Button>
        </header>

        <p className="mb-6 font-mono text-xs text-[color:var(--color-text-mute)]">
          the <span className="text-[color:var(--color-strong)]">active</span> model is used for all
          llm processing. exactly one model can be active at a time.
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
              <h2 className="font-pixel text-base tracking-[0.2em] uppercase mb-5">
                {form.id ? 'EDIT_MODEL' : 'ADD_MODEL'}
              </h2>

              <div className="space-y-4">
                <div>
                  <Label>DISPLAY_NAME</Label>
                  <Input
                    value={form.model_name}
                    onChange={(e) => setForm({ ...form, model_name: e.target.value })}
                    placeholder="e.g. Llama 3.1 70B"
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>PROVIDER</Label>
                  <Input
                    value={form.provider}
                    onChange={(e) => setForm({ ...form, provider: e.target.value })}
                    placeholder="e.g. fireworks, openai, anthropic, gemini, groq"
                    className="mt-2 text-sm"
                  />
                </div>
                <div>
                  <Label>MODEL_ID</Label>
                  <Input
                    value={form.model_id}
                    onChange={(e) => setForm({ ...form, model_id: e.target.value })}
                    placeholder="model-id"
                    className="mt-2"
                  />
                </div>
              </div>

              <div className="mt-6 flex gap-3">
                <Button onClick={save} disabled={busy}>
                  {busy ? 'SAVING…' : 'SAVE'}
                </Button>
                <Button variant="ghost" onClick={() => setForm(null)}>
                  CANCEL
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {configuringModel && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-8 border border-[color:var(--color-edge-glow)] bg-[color:var(--color-surface)]/60 backdrop-blur p-6"
            >
              <h2 className="font-pixel text-base tracking-[0.2em] uppercase mb-5">
                MODEL_CONFIG
              </h2>

              <div className="space-y-4">
                <div>
                  <Label>TEMPERATURE: {(modelProfile.temperature ?? 0.3).toFixed(1)}</Label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.1}
                    value={modelProfile.temperature ?? 0.3}
                    onChange={(e) => setModelProfile({ ...modelProfile, temperature: parseFloat(e.target.value) })}
                    className="mt-2 w-full accent-[color:var(--color-edge-glow)]"
                  />
                </div>

                <div>
                  <Label>MAX TOKENS</Label>
                  <Input
                    type="number"
                    value={modelProfile.max_tokens ?? 8192}
                    onChange={(e) => setModelProfile({ ...modelProfile, max_tokens: parseInt(e.target.value) })}
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label>REASONING BUDGET</Label>
                  <Input
                    type="number"
                    value={modelProfile.reasoning_budget ?? 0}
                    onChange={(e) => setModelProfile({ ...modelProfile, reasoning_budget: parseInt(e.target.value) })}
                    className="mt-2"
                  />
                  <p className="text-xs text-[color:var(--color-text-mute)] mt-1">
                    Output budget: {(modelProfile.max_tokens ?? 8192) - (modelProfile.reasoning_budget ?? 0)} tokens
                  </p>
                </div>

                <div>
                  <Label>TIMEOUT (MS)</Label>
                  <Input
                    type="number"
                    value={modelProfile.timeout_ms ?? 60000}
                    onChange={(e) => setModelProfile({ ...modelProfile, timeout_ms: parseInt(e.target.value) })}
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label>MAX RETRIES</Label>
                  <Input
                    type="number"
                    value={modelProfile.max_retries ?? 2}
                    onChange={(e) => setModelProfile({ ...modelProfile, max_retries: parseInt(e.target.value) })}
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label>PROMPT FORMAT</Label>
                  <Select
                    value={modelProfile.prompt_format ?? 'json_schema'}
                    onValueChange={(v) => setModelProfile({ ...modelProfile, prompt_format: v as ModelProfile['prompt_format'] })}
                  >
                    <SelectTrigger className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="json_schema">JSON Schema</SelectItem>
                      <SelectItem value="xml_tags">XML Tags</SelectItem>
                      <SelectItem value="markdown_sections">Markdown Sections</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="strip-reasoning"
                    checked={modelProfile.strip_reasoning !== false}
                    onChange={(e) => setModelProfile({ ...modelProfile, strip_reasoning: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="strip-reasoning" className="mb-0 cursor-pointer">Strip reasoning tokens</Label>
                </div>
              </div>

              <div className="mt-6 flex gap-3">
                <Button onClick={saveModelProfile} disabled={busy}>
                  {busy ? 'SAVING…' : 'SAVE CONFIG'}
                </Button>
                <Button variant="ghost" onClick={() => { setConfiguringModel(null); setModelProfile({}) }}>
                  CANCEL
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {models.length === 0 && !form ? (
          <div className="py-24 text-center font-mono text-sm text-[color:var(--color-text-mute)]">
            no models configured. add one to start processing.
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {models.map((m) => (
                <motion.div
                  key={m.id}
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

                  <div className="relative flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <h3 className="font-pixel text-base tracking-[0.04em] uppercase">
                          {m.model_name}
                        </h3>
                        <span className="font-mono text-[11px] uppercase tracking-widest text-[color:var(--color-text-mute)] border border-[color:var(--color-edge)] px-2 py-0.5">
                          {m.provider}
                        </span>
                        {m.is_active && (
                          <span className="font-pixel text-[11px] tracking-[0.18em] uppercase text-[color:var(--color-strong)] border border-[color:var(--color-strong)]/40 px-2 py-0.5 flex items-center gap-1">
                            <Star className="h-3 w-3" />
                            ACTIVE
                          </span>
                        )}
                      </div>
                      <code className="font-mono text-xs text-[color:var(--color-text-mute)] break-all">
                        {m.model_id}
                      </code>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => loadAndConfigureModel(m.id)}
                        disabled={busy}
                      >
                        CONFIGURE
                      </Button>
                      {!m.is_active && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => activate(m.id)}
                          disabled={busy}
                        >
                          SET ACTIVE
                        </Button>
                      )}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => {
                            setForm({
                              id: m.id,
                              model_name: m.model_name,
                              model_id: m.model_id,
                              provider: m.provider,
                            })
                            setErr('')
                          }}
                          className="p-1.5 text-[color:var(--color-text-mute)] hover:text-[color:var(--color-text)]"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setPendingDelete(m.id)}
                          className="p-1.5 text-[color:var(--color-text-mute)] hover:text-[color:var(--color-weak)]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
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
            <AlertDialogTitle>DELETE MODEL?</AlertDialogTitle>
            <AlertDialogDescription>
              if this is the active model, processing falls back to the first model by created_at.
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
