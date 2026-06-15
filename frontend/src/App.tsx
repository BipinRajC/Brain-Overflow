import { Route, Routes, Navigate } from 'react-router-dom'
import { AppShell } from '@/components/shell/AppShell'
import { LandingPage } from '@/pages/LandingPage'
import { IdeasPage } from '@/pages/IdeasPage'
import { IdeaDetailPage } from '@/pages/IdeaDetailPage'
import { PromptsPage } from '@/pages/PromptsPage'
import { FlowsPage } from '@/pages/FlowsPage'
import { ModelsPage } from '@/pages/ModelsPage'

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/ideas" element={<IdeasPage />} />
        <Route path="/idea/:id" element={<IdeaDetailPage />} />
        <Route path="/ideas/:id" element={<IdeaDetailPage />} />
        <Route path="/prompts" element={<PromptsPage />} />
        <Route path="/flows" element={<FlowsPage />} />
        <Route path="/models" element={<ModelsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  )
}
