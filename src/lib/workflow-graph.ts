export type ActionKind = 'call_tool' | 'send_webhook' | 'tag_conversation' | 'tag_with_ai' | 'send_summary'
export type ConditionKind = 'duration_over' | 'summary_contains' | 'agent_is' | 'ai_check'
export type Mapping = { key: string; source: 'literal' | 'conversation.id' | 'conversation.summary' | 'conversation.duration_seconds' | 'conversation.agent_id' | 'conversation.channel' | 'transcript'; value: string }
export type WorkflowNode = { id: string; type: 'trigger' | 'condition' | 'action' | 'end'; x: number; y: number; kind?: ActionKind | ConditionKind; value?: string; mappings?: Mapping[] }
export type WorkflowEdge = { id: string; source: string; target: string; outcome?: 'yes' | 'no' }
export type WorkflowGraph = { version: 1; nodes: WorkflowNode[]; edges: WorkflowEdge[] }
export type LegacyStep = { kind: string; value: string; if?: { kind: string; value: string } }
export const ACTIONS: Record<ActionKind, string> = { call_tool: 'Call a tool', send_webhook: 'Send a webhook', tag_conversation: 'Tag conversation', tag_with_ai: 'Tag with AI', send_summary: 'Send call details to an address' }
export const CONDITIONS: Record<ConditionKind, string> = { duration_over: 'Call longer than (seconds)', summary_contains: 'Summary contains', agent_is: 'Handled by agent', ai_check: 'AI check' }
export const SOURCES: Record<Mapping['source'], string> = { literal: 'Fixed value', 'conversation.id': 'Call ID', 'conversation.summary': 'Call summary', 'conversation.duration_seconds': 'Call duration', 'conversation.agent_id': 'Agent ID', 'conversation.channel': 'Channel', transcript: 'Transcript' }
const uid = () => crypto.randomUUID()
export function newGraph(): WorkflowGraph { return { version: 1, nodes: [{ id: uid(), type: 'trigger', x: 70, y: 180 }], edges: [] } }
export function asGraph(raw: unknown): WorkflowGraph {
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && (raw as WorkflowGraph).version === 1) return raw as WorkflowGraph
  const graph = newGraph()
  let prev = graph.nodes[0]?.id ?? uid()
  const pendingNo: string[] = []
  const legacySteps = (Array.isArray(raw) ? raw : []).filter((step): step is LegacyStep => Boolean(step) && typeof step === 'object' && typeof (step as LegacyStep).kind === 'string' && typeof (step as LegacyStep).value === 'string')
  for (const [i, step] of legacySteps.entries()) {
    if (step.if && step.if.kind !== 'none') {
      const c = { id: uid(), type: 'condition' as const, x: 350 + i * 280, y: 180, kind: step.if.kind as ConditionKind, value: step.if.value }
      graph.nodes.push(c); graph.edges.push({ id: uid(), source: prev, target: c.id });
      for (const source of pendingNo.splice(0)) graph.edges.push({ id: uid(), source, target: c.id, outcome: 'no' });
      prev = c.id; pendingNo.push(c.id)
    } else if (pendingNo.length) {
      // The previous condition's No branch skips its action and resumes here.
    }
    const a = { id: uid(), type: 'action' as const, x: 350 + i * 280, y: 180, kind: step.kind as ActionKind, value: step.value }
    graph.nodes.push(a); graph.edges.push({ id: uid(), source: prev, target: a.id, ...(step.if && step.if.kind !== 'none' ? { outcome: 'yes' as const } : {}) });
    if (!(step.if && step.if.kind !== 'none')) for (const source of pendingNo.splice(0)) graph.edges.push({ id: uid(), source, target: a.id, outcome: 'no' });
    prev = a.id
  }
  const end = { id: uid(), type: 'end' as const, x: 350 + graph.nodes.length * 280, y: 180 }
  graph.nodes.push(end); graph.edges.push({ id: uid(), source: prev, target: end.id })
  for (const source of pendingNo) graph.edges.push({ id: uid(), source, target: end.id, outcome: 'no' })
  return graph
}
export function graphErrors(g: WorkflowGraph, refs?: { tools: string[]; hooks: string[]; agents: string[] }): string[] {
  const errors: string[] = []
  if (!g || typeof g !== 'object' || g.version !== 1 || !Array.isArray(g.nodes) || !Array.isArray(g.edges)) return ['The workflow diagram is not valid.']
  if (g.nodes.some(n => !n || typeof n !== 'object' || typeof n.id !== 'string' || !n.id || !['trigger', 'condition', 'action', 'end'].includes(n.type))) return ['The workflow contains an invalid node.']
  if (g.edges.some(e => !e || typeof e !== 'object' || typeof e.id !== 'string' || !e.id || typeof e.source !== 'string' || typeof e.target !== 'string')) return ['The workflow contains an invalid connection.']
  if (g.nodes.some(n => n.type === 'action' && n.mappings != null && (!Array.isArray(n.mappings) || n.mappings.some(m => !m || typeof m !== 'object' || typeof m.key !== 'string' || typeof m.source !== 'string' || (m.source === 'literal' && typeof m.value !== 'string'))))) return ['The workflow contains an invalid input mapping.']
  const starts = g.nodes.filter(n => n.type === 'trigger')
  if (starts.length !== 1) errors.push('Add exactly one start node.')
  if (!g.nodes.some(n => n.type === 'action')) errors.push('Add an action.')
  if (g.nodes.filter(n => n.type === 'end').length !== 1) errors.push('Add exactly one end node so every path has a single explicit finish.')
  if (g.nodes.length > 80) errors.push('Keep workflows under 80 nodes.')
  const ids = new Set(g.nodes.map(n => n.id))
  if (ids.size !== g.nodes.length) errors.push('Node IDs must be unique.')
  if (new Set(g.edges.map(e => e.id)).size !== g.edges.length) errors.push('Connection IDs must be unique.')
  if (new Set(g.edges.map(e => `${e.source}\u0000${e.target}\u0000${e.outcome ?? ''}`)).size !== g.edges.length) errors.push('Remove duplicate connections.')
  if (g.edges.some(e => !ids.has(e.source) || !ids.has(e.target) || e.source === e.target)) errors.push('Fix disconnected connections.')
  for (const n of g.nodes) {
    const incoming = g.edges.filter(e => e.target === n.id)
    const outgoing = g.edges.filter(e => e.source === n.id)
    if (n.type === 'trigger' ? incoming.length !== 0 : incoming.length < 1) errors.push(`Connect ${n.type === 'trigger' ? 'the start' : n.type} node correctly.`)
    if (!['trigger', 'condition', 'action', 'end'].includes(n.type)) continue
    if (n.type === 'condition') {
      if (!Object.keys(CONDITIONS).includes(n.kind ?? '') || !n.value?.trim()) errors.push('Set every condition and its value.')
      if (n.kind === 'duration_over' && (!Number.isFinite(Number(n.value)) || Number(n.value) < 0)) errors.push('Enter a valid call duration.')
      if (outgoing.length !== 2 || new Set(outgoing.map(e => e.outcome)).size !== 2 || !outgoing.some(e => e.outcome === 'yes') || !outgoing.some(e => e.outcome === 'no')) errors.push('Connect both Yes and No paths on each condition.')
      if (n.kind === 'agent_is' && refs && !refs.agents.includes(n.value ?? '')) errors.push('Choose an available agent for the condition.')
      if (n.kind === 'ai_check' && (n.value ?? '').trim().length > 300) errors.push('Keep AI checks under 300 characters.')
    } else if (n.type === 'action') {
      if (!Object.keys(ACTIONS).includes(n.kind ?? '') || !n.value?.trim()) errors.push('Set every action and its destination.')
      if (n.kind === 'call_tool' && refs && !refs.tools.includes(n.value ?? '')) errors.push('Choose an available tool.')
      if (n.kind === 'send_webhook' && refs && !refs.hooks.includes(n.value ?? '')) errors.push('Choose an available webhook.')
      if (n.kind === 'send_summary' && !/^https:\/\//.test(n.value ?? '')) errors.push('Use a secure HTTPS address.')
      if (n.kind === 'tag_conversation' && (n.value ?? '').trim().length > 80) errors.push('Keep tags under 80 characters.')
      if (n.kind === 'tag_with_ai') {
        const tags = (n.value ?? '').split(',').map(t => t.trim()).filter(Boolean)
        if (tags.length < 2) errors.push('List at least two tags, separated by commas.')
        if (tags.some(t => t.length > 80)) errors.push('Keep tags under 80 characters.')
      }
      if ((n.mappings ?? []).some(m => !m.key.trim() || !Object.keys(SOURCES).includes(m.source) || (m.source === 'literal' && !m.value.trim()))) errors.push('Complete each input mapping.')
      if (new Set((n.mappings ?? []).map(m => m.key)).size !== (n.mappings ?? []).length) errors.push('Input names must be unique.')
      if (outgoing.length !== 1 || outgoing.some(e => e.outcome)) errors.push('An action can connect to one next node.')
    } else if (n.type === 'trigger' && (outgoing.length !== 1 || outgoing.some(e => e.outcome))) errors.push('Connect the start to one node.')
    else if (n.type === 'end' && outgoing.length) errors.push('The end cannot connect to another node.')
  }
  const visited = new Set<string>(), active = new Set<string>()
  function walk(id: string) { if (active.has(id)) { errors.push('Loops are not supported.'); return } if (visited.has(id)) return; active.add(id); visited.add(id); for (const e of g.edges.filter(e => e.source === id)) walk(e.target); active.delete(id) }
  if (starts[0]) walk(starts[0].id)
  if (visited.size !== g.nodes.length) errors.push('Connect every node to the start.')
  const ends = new Set(g.nodes.filter(n => n.type === 'end').map(n => n.id))
  const canFinish = new Set(ends)
  let changed = true
  while (changed) {
    changed = false
    for (const e of g.edges) if (canFinish.has(e.target) && !canFinish.has(e.source)) { canFinish.add(e.source); changed = true }
  }
  if (g.nodes.some(n => n.type !== 'end' && !canFinish.has(n.id))) errors.push('Every path must lead to an end node.')
  for (const e of g.edges) {
    const source = g.nodes.find(n => n.id === e.source)
    if (source?.type === 'condition' && e.outcome !== 'yes' && e.outcome !== 'no') errors.push('Condition connections must use Yes or No outcomes.')
    if (source && source.type !== 'condition' && e.outcome != null) errors.push('Only condition connections can have Yes or No outcomes.')
  }
  for (const n of g.nodes.filter(n => n.type === 'condition')) {
    for (const e of g.edges.filter(edge => edge.source === n.id)) if (!canFinish.has(e.target)) errors.push('Both condition paths must lead to an end node.')
  }
  return [...new Set(errors)]
}
export function needsCall(g: WorkflowGraph) { return g.nodes.some(n => n.type === 'condition' || (n.type === 'action' && (n.kind === 'tag_conversation' || n.kind === 'tag_with_ai')) || (n.mappings ?? []).some(m => m.source !== 'literal')) }
