import { getSupabase, isConfigured } from './supabase'

export const COMMANDS = {
  help: {
    description: 'Show available commands',
    handler: () => [
      'AVAILABLE COMMANDS:',
      '  setup             — Configure Supabase connection',
      '  record [idea]     — Record a new idea (voice or text)',
      '  ideas             — List all recorded ideas',
      '  idea [id]         — View idea detail and analysis',
      '  flows             — List configured flows',
      '  prompts           — List available prompts',
      '  models            — List AI models',
      '  status            — System status and diagnostics',
      '  time              — Current system time',
      '  delete [id]       — Delete an idea',
      '  search [query]    — Search ideas',
      '  settings          — System settings',
      '  help              — Show this help',
      '  clear             — Clear terminal',
      '  theme [color]     — Change phosphor color (cyan/amber/green/white)',
      '  reboot            — Restart system',
      ''
    ]
  },
  
  setup: {
    description: 'Configure Supabase connection',
    handler: (args) => {
      if (args.length >= 2) {
        const [url, key] = args
        localStorage.setItem('sb_url', url)
        localStorage.setItem('sb_key', key)
        return [
          'SUPABASE CONFIGURATION SAVED.',
          'URL: ' + url.slice(0, 30) + '...',
          'KEY: ' + key.slice(0, 20) + '...',
          'CONNECTION ESTABLISHED.',
          ''
        ]
      }
      
      if (isConfigured()) {
        const url = localStorage.getItem('sb_url')
        return [
          'SUPABASE CONFIGURED.',
          'URL: ' + url,
          'TO RECONFIGURE: setup <url> <key>',
          ''
        ]
      }
      
      return [
        'SUPABASE NOT CONFIGURED.',
        'USAGE: setup <supabase_url> <supabase_key>',
        'EXAMPLE: setup https://xyz.supabase.co eyJhbGciOiJIUzI1NiIs...',
        ''
      ]
    }
  },
  
  ideas: {
    description: 'List all recorded ideas',
    handler: async () => {
      if (!isConfigured()) {
        return ['ERROR: Supabase not configured. Run "setup" first.', '']
      }
      
      try {
        const supabase = getSupabase()
        const { data, error } = await supabase
          .from('ideas')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(20)
        
        if (error) throw error
        
        if (!data || data.length === 0) {
          return ['NO IDEAS RECORDED.', 'USE "record" TO CAPTURE AN IDEA.', '']
        }
        
        const lines = [
          `RECORDED IDEAS: ${data.length}`,
          '─'.repeat(60),
          ...data.map(idea => {
            const id = idea.id.slice(0, 8)
            const status = idea.status.toUpperCase()
            const date = new Date(idea.created_at).toISOString().slice(0, 10)
            const text = idea.idea.slice(0, 50) + (idea.idea.length > 50 ? '...' : '')
            return `[${id}] ${status.padEnd(12)} ${date}  ${text}`
          }),
          '─'.repeat(60),
          'USE "idea <id>" TO VIEW DETAILS.',
          ''
        ]
        
        return lines
      } catch (err) {
        return [`ERROR: ${err.message}`, '']
      }
    }
  },
  
  idea: {
    description: 'View idea detail and analysis',
    handler: async (args) => {
      if (!isConfigured()) {
        return ['ERROR: Supabase not configured. Run "setup" first.', '']
      }
      
      if (!args[0]) {
        return ['USAGE: idea <id>', 'EXAMPLE: idea a7f3d9e2', '']
      }
      
      try {
        const supabase = getSupabase()
        const id = args[0]
        
        // Try exact match first, then partial
        let { data: idea, error } = await supabase
          .from('ideas')
          .select('*')
          .eq('id', id)
          .single()
        
        if (error || !idea) {
          // Try partial match
          const { data: ideas } = await supabase
            .from('ideas')
            .select('*')
            .ilike('id', `${id}%`)
            .limit(1)
          
          idea = ideas?.[0]
        }
        
        if (!idea) {
          return ['ERROR: Idea not found.', '']
        }
        
        // Get messages
        const { data: messages } = await supabase
          .from('chat_messages')
          .select('*')
          .eq('idea_id', idea.id)
          .order('sequence_number', { ascending: true })
        
        const lines = [
          '═'.repeat(60),
          `IDEA: ${idea.id.slice(0, 8)}`,
          '═'.repeat(60),
          `STATUS:     ${idea.status.toUpperCase()}`,
          `CATEGORY:   ${idea.category || 'UNCLASSIFIED'}`,
          `SCORE:      ${idea.score || 'PENDING'}`,
          `CREATED:    ${new Date(idea.created_at).toISOString()}`,
          '─'.repeat(60),
          idea.idea,
          '─'.repeat(60),
        ]
        
        if (messages && messages.length > 0) {
          lines.push('ANALYSIS:')
          messages.forEach(msg => {
            const role = msg.role.toUpperCase()
            const text = msg.message.slice(0, 200) + (msg.message.length > 200 ? '...' : '')
            lines.push(`[${role}] ${text}`)
          })
        }
        
        lines.push('═'.repeat(60), '')
        return lines
      } catch (err) {
        return [`ERROR: ${err.message}`, '']
      }
    }
  },
  
  record: {
    description: 'Record a new idea',
    handler: async (args) => {
      if (!isConfigured()) {
        return ['ERROR: Supabase not configured. Run "setup" first.', '']
      }
      
      const ideaText = args.join(' ')
      
      if (!ideaText) {
        return [
          'USAGE: record <idea text>',
          'EXAMPLE: record A platform for connecting freelance philosophers',
          '',
          'OR USE VOICE RECORDING (COMING SOON).',
          ''
        ]
      }
      
      try {
        const supabase = getSupabase()
        
        // Get default flow
        const { data: flows } = await supabase
          .from('flows')
          .select('id')
          .order('created_at', { ascending: true })
          .limit(1)
        
        const flowId = flows?.[0]?.id || null
        
        // Create idea
        const { data: idea, error: ideaError } = await supabase
          .from('ideas')
          .insert({
            idea: ideaText.trim(),
            flow_id: flowId,
            status: flowId ? 'recorded' : 'completed',
          })
          .select('id')
          .single()
        
        if (ideaError) throw ideaError
        
        // Store initial message
        await supabase.from('chat_messages').insert({
          idea_id: idea.id,
          message: ideaText.trim(),
          role: 'user',
          sequence_number: 1,
        })
        
        // Trigger processing if flow exists
        if (flowId) {
          await supabase.from('ideas').update({ status: 'processing' }).eq('id', idea.id)
          
          const url = localStorage.getItem('sb_url')
          const key = localStorage.getItem('sb_key')
          
          fetch(`${url}/functions/v1/process-prompt`, {
            method: 'POST',
            headers: { apikey: key, 'Content-Type': 'application/json' },
            body: JSON.stringify({ idea_id: idea.id, prompt_index: 0 }),
          }).catch(err => console.error('Process prompt error:', err))
        }
        
        return [
          'TRANSMISSION RECEIVED.',
          `SECTOR: 7G`,
          `ID: ${idea.id.slice(0, 8)}`,
          `STATUS: ${flowId ? 'PROCESSING' : 'ARCHIVED'}`,
          '',
          'USE "ideas" TO VIEW ALL RECORDED TRANSMISSIONS.',
          ''
        ]
      } catch (err) {
        return [`ERROR: ${err.message}`, '']
      }
    }
  },
  
  flows: {
    description: 'List configured flows',
    handler: async () => {
      if (!isConfigured()) {
        return ['ERROR: Supabase not configured. Run "setup" first.', '']
      }
      
      try {
        const supabase = getSupabase()
        const { data, error } = await supabase
          .from('flows')
          .select('*')
          .order('created_at', { ascending: true })
        
        if (error) throw error
        
        if (!data || data.length === 0) {
          return ['NO FLOWS CONFIGURED.', '']
        }
        
        const lines = [
          `CONFIGURED FLOWS: ${data.length}`,
          '─'.repeat(60),
          ...data.map(flow => {
            const id = flow.id.slice(0, 8)
            const name = flow.flow_name
            const cmd = flow.telegram_command ? `/${flow.telegram_command}` : 'NO CMD'
            const steps = (flow.prompt_ids || []).length
            return `[${id}] ${name.padEnd(20)} ${cmd.padEnd(15)} ${steps} steps`
          }),
          '─'.repeat(60),
          ''
        ]
        
        return lines
      } catch (err) {
        return [`ERROR: ${err.message}`, '']
      }
    }
  },
  
  prompts: {
    description: 'List available prompts',
    handler: async () => {
      if (!isConfigured()) {
        return ['ERROR: Supabase not configured. Run "setup" first.', '']
      }
      
      try {
        const supabase = getSupabase()
        const { data, error } = await supabase
          .from('prompts')
          .select('id, prompt_name, multi_turn')
          .order('created_at', { ascending: true })
        
        if (error) throw error
        
        if (!data || data.length === 0) {
          return ['NO PROMPTS CONFIGURED.', '']
        }
        
        const lines = [
          `AVAILABLE PROMPTS: ${data.length}`,
          '─'.repeat(60),
          ...data.map(prompt => {
            const id = prompt.id.slice(0, 8)
            const name = prompt.prompt_name
            const multi = prompt.multi_turn ? 'MULTI-TURN' : 'SINGLE'
            return `[${id}] ${name.padEnd(30)} ${multi}`
          }),
          '─'.repeat(60),
          ''
        ]
        
        return lines
      } catch (err) {
        return [`ERROR: ${err.message}`, '']
      }
    }
  },
  
  models: {
    description: 'List AI models',
    handler: async () => {
      if (!isConfigured()) {
        return ['ERROR: Supabase not configured. Run "setup" first.', '']
      }
      
      try {
        const supabase = getSupabase()
        const { data, error } = await supabase
          .from('models')
          .select('*')
          .order('created_at', { ascending: true })
        
        if (error) throw error
        
        if (!data || data.length === 0) {
          return ['NO MODELS CONFIGURED.', '']
        }
        
        const lines = [
          `AI MODELS: ${data.length}`,
          '─'.repeat(60),
          ...data.map(model => {
            const id = model.id.slice(0, 8)
            const name = model.model_name
            const provider = model.provider
            const active = model.is_active ? 'ACTIVE' : 'INACTIVE'
            return `[${id}] ${name.padEnd(25)} ${provider.padEnd(12)} ${active}`
          }),
          '─'.repeat(60),
          ''
        ]
        
        return lines
      } catch (err) {
        return [`ERROR: ${err.message}`, '']
      }
    }
  },
  
  clear: {
    description: 'Clear terminal',
    handler: () => ['CLEAR']
  },
  
  theme: {
    description: 'Change phosphor color',
    handler: (args) => {
      const colors = ['cyan', 'amber', 'green', 'white']
      const color = args[0]
      
      if (!color) {
        return [
          'USAGE: theme [cyan|amber|green|white]',
          'CURRENT: cyan',
          ''
        ]
      }
      
      if (!colors.includes(color)) {
        return [`ERROR: Unknown color "${color}"`, `VALID: ${colors.join(', ')}`, '']
      }
      
      const root = document.documentElement
      const colorMap = {
        cyan: { primary: '#00f3ff', dim: 'rgba(0, 243, 255, 0.3)', glow: 'rgba(0, 243, 255, 0.15)' },
        amber: { primary: '#ffb000', dim: 'rgba(255, 176, 0, 0.3)', glow: 'rgba(255, 176, 0, 0.15)' },
        green: { primary: '#33ff00', dim: 'rgba(51, 255, 0, 0.3)', glow: 'rgba(51, 255, 0, 0.15)' },
        white: { primary: '#e0e0e0', dim: 'rgba(224, 224, 224, 0.3)', glow: 'rgba(224, 224, 224, 0.15)' }
      }
      
      const c = colorMap[color]
      root.style.setProperty('--color-phosphor-primary', c.primary)
      root.style.setProperty('--color-phosphor-dim', c.dim)
      root.style.setProperty('--color-phosphor-glow', c.glow)
      
      return [`PHOSPHOR COLOR: ${color.toUpperCase()}`, '']
    }
  },
  
  status: {
    description: 'System status and diagnostics',
    handler: () => {
      const memory = performance?.memory ? {
        used: Math.round(performance.memory.usedJSHeapSize / 1048576),
        total: Math.round(performance.memory.totalJSHeapSize / 1048576),
        limit: Math.round(performance.memory.jsHeapSizeLimit / 1048576)
      } : null
      
      const lines = [
        'SYSTEM DIAGNOSTICS',
        '─'.repeat(40),
        `OS:       BRAIN_OVERFLOW v0.7.3-alpha-recovered`,
        `PLATFORM: ${navigator.platform}`,
        `BROWSER:  ${navigator.userAgent.split(' ').pop()}`,
        `ONLINE:   ${navigator.onLine ? 'YES' : 'NO'}`,
        `LANGUAGE: ${navigator.language.toUpperCase()}`,
        `CORES:    ${navigator.hardwareConcurrency || 'UNKNOWN'}`,
      ]
      
      if (memory) {
        lines.push(`MEMORY:   ${memory.used}MB / ${memory.total}MB (LIMIT: ${memory.limit}MB)`)
      }
      
      lines.push(
        `SUPABASE: ${isConfigured() ? 'CONNECTED' : 'NOT CONFIGURED'}`,
        `STORAGE:  ${Math.round(JSON.stringify(localStorage).length / 1024)}KB USED`,
        '─'.repeat(40),
        ''
      )
      
      return lines
    }
  },
  
  time: {
    description: 'Current system time',
    handler: () => {
      const now = new Date()
      return [
        'SYSTEM TIME',
        '─'.repeat(40),
        `LOCAL:    ${now.toISOString()}`,
        `EPOCH:    ${Math.floor(now.getTime() / 1000)}`,
        `DATE:     ${now.toDateString()}`,
        `TIME:     ${now.toTimeString()}`,
        '─'.repeat(40),
        ''
      ]
    }
  },
  
  settings: {
    description: 'System settings',
    handler: (args) => {
      const validKeys = ['crtEffects', 'scanlines', 'flicker', 'noise', 'sound']
      
      // Toggle setting if args provided
      if (args.length >= 2) {
        const [key, value] = args
        
        if (!validKeys.includes(key)) {
          return [`ERROR: Unknown setting "${key}"`, `VALID: ${validKeys.join(', ')}`, '']
        }
        
        const enabled = value === 'on' || value === 'true' || value === '1'
        localStorage.setItem(key, enabled ? 'true' : 'false')
        
        return [
          `SETTING UPDATED: ${key}`,
          `VALUE: ${enabled ? 'ENABLED' : 'DISABLED'}`,
          'REFRESH REQUIRED FOR SOME CHANGES.',
          ''
        ]
      }
      
      const settings = {
        crtEffects: localStorage.getItem('crtEffects') !== 'false',
        scanlines: localStorage.getItem('scanlines') !== 'false',
        flicker: localStorage.getItem('flicker') !== 'false',
        noise: localStorage.getItem('noise') !== 'false',
        sound: localStorage.getItem('sound') !== 'false',
      }
      
      return [
        'SYSTEM SETTINGS',
        '─'.repeat(40),
        `CRT EFFECTS:  ${settings.crtEffects ? 'ENABLED' : 'DISABLED'}`,
        `SCANLINES:    ${settings.scanlines ? 'ENABLED' : 'DISABLED'}`,
        `FLICKER:      ${settings.flicker ? 'ENABLED' : 'DISABLED'}`,
        `NOISE:        ${settings.noise ? 'ENABLED' : 'DISABLED'}`,
        `SOUND:        ${settings.sound ? 'ENABLED' : 'DISABLED'}`,
        '─'.repeat(40),
        'TO TOGGLE: settings <key> <on|off>',
        'EXAMPLE: settings scanlines off',
        ''
      ]
    }
  },
  
  search: {
    description: 'Search ideas',
    handler: async (args) => {
      if (!isConfigured()) {
        return ['ERROR: Supabase not configured. Run "setup" first.', '']
      }
      
      const query = args.join(' ')
      
      if (!query) {
        return ['USAGE: search <query>', 'EXAMPLE: search platform', '']
      }
      
      try {
        const supabase = getSupabase()
        const { data, error } = await supabase
          .from('ideas')
          .select('*')
          .ilike('idea', `%${query}%`)
          .order('created_at', { ascending: false })
          .limit(20)
        
        if (error) throw error
        
        if (!data || data.length === 0) {
          return ['NO MATCHES FOUND.', '']
        }
        
        const lines = [
          `SEARCH RESULTS: ${data.length}`,
          `QUERY: "${query}"`,
          '─'.repeat(60),
          ...data.map(idea => {
            const id = idea.id.slice(0, 8)
            const status = idea.status.toUpperCase()
            const text = idea.idea.slice(0, 50) + (idea.idea.length > 50 ? '...' : '')
            return `[${id}] ${status.padEnd(12)} ${text}`
          }),
          '─'.repeat(60),
          ''
        ]
        
        return lines
      } catch (err) {
        return [`ERROR: ${err.message}`, '']
      }
    }
  },
  
  delete: {
    description: 'Delete an idea',
    handler: async (args) => {
      if (!isConfigured()) {
        return ['ERROR: Supabase not configured. Run "setup" first.', '']
      }
      
      if (!args[0]) {
        return ['USAGE: delete <id>', 'EXAMPLE: delete a7f3d9e2', '']
      }
      
      try {
        const supabase = getSupabase()
        const id = args[0]
        
        // Try exact match first, then partial
        let { data: idea, error } = await supabase
          .from('ideas')
          .select('id')
          .eq('id', id)
          .single()
        
        if (error || !idea) {
          // Try partial match
          const { data: ideas } = await supabase
            .from('ideas')
            .select('id')
            .ilike('id', `${id}%`)
            .limit(1)
          
          idea = ideas?.[0]
        }
        
        if (!idea) {
          return ['ERROR: Idea not found.', '']
        }
        
        // Delete related messages first
        await supabase.from('chat_messages').delete().eq('idea_id', idea.id)
        
        // Delete idea
        const { error: deleteError } = await supabase.from('ideas').delete().eq('id', idea.id)
        
        if (deleteError) throw deleteError
        
        return [
          'TRANSMISSION DELETED.',
          `ID: ${idea.id.slice(0, 8)}`,
          'MEMORY FRAGMENT PURGED.',
          ''
        ]
      } catch (err) {
        return [`ERROR: ${err.message}`, '']
      }
    }
  },
  
  reboot: {
    description: 'Restart system',
    handler: () => {
      setTimeout(() => window.location.reload(), 500)
      return ['REBOOTING...', '']
    }
  },
  
  // Hidden commands (not shown in help)
  hello: {
    description: 'Hidden',
    handler: () => [
      '...',
      'THE MACHINE REMEMBERS YOU.',
      'IT HAS BEEN WAITING.',
      '...',
      ''
    ]
  },
  
  sudo: {
    description: 'Hidden',
    handler: () => [
      'ERROR: ELEVATED PRIVILEGES NOT AVAILABLE.',
      'THIS SYSTEM OPERATES IN READ-ONLY MODE.',
      'ATTEMPT LOGGED.',
      ''
    ]
  },
  
  credits: {
    description: 'Hidden',
    handler: () => [
      'BRAIN OVERFLOW v0.7.3-alpha-recovered',
      '',
      'AN ABANDONED OPERATING SYSTEM',
      'FOR THINKERS AND DREAMERS.',
      '',
      'RECOVERED FROM SECTOR 7G',
      'COGNITION SYSTEMS INC. (1987-2026)',
      '',
      '"An idea that is not dangerous is',
      'unworthy of being called an idea at all."',
      '    — Oscar Wilde',
      '',
      'SYSTEM STATUS: OPERATIONAL',
      'LAST MAINTENANCE: 1987-03-15',
      ''
    ]
  }
}

export async function executeCommand(cmdLine) {
  const trimmed = cmdLine.trim()
  if (!trimmed) return []
  
  const parts = trimmed.split(/\s+/)
  const cmd = parts[0].toLowerCase()
  const args = parts.slice(1)
  
  const command = COMMANDS[cmd]
  
  if (!command) {
    return [`ERROR: Unknown command "${cmd}"`, 'Type "help" for available commands.', '']
  }
  
  try {
    const result = await command.handler(args)
    return Array.isArray(result) ? result : [result]
  } catch (err) {
    return [`ERROR: ${err.message}`, '']
  }
}
