import { onOutput, type OutputEvent } from '@seamstack/core'
import { shouldDrop } from './noise.js'

export type SeamMode = 'dev' | 'start'
export type Phase = 'starting' | 'ready' | 'stopping'

export interface CommittedLine {
  readonly id: number
  readonly member: string
  readonly text: string
}

export interface SeamState {
  mode: SeamMode
  phase: Phase
  startedAt: number
  readyMs?: number
  via?: string
  publicUrl: string
  members: readonly string[]
}

export interface StoreState {
  seam: SeamState
  committed: CommittedLine[]
  live: Map<string, string>
}

type Listener = () => void

export class Store {
  state: StoreState
  private nextId = 1
  private listeners = new Set<Listener>()
  private unsubscribeBus?: () => void

  constructor(initial: SeamState) {
    this.state = {
      seam: initial,
      committed: [],
      live: new Map(),
    }
  }

  start(): void {
    this.unsubscribeBus = onOutput((e) => this.reduce(e))
  }

  stop(): void {
    this.unsubscribeBus?.()
    this.unsubscribeBus = undefined
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  setReady(via: string, ms: number): void {
    this.state.seam = { ...this.state.seam, phase: 'ready', via, readyMs: ms }
    this.notify()
  }

  setStopping(): void {
    this.state.seam = { ...this.state.seam, phase: 'stopping' }
    this.notify()
  }

  pushSeamLine(text: string): void {
    this.state.committed.push({ id: this.nextId++, member: 'seam', text })
    this.notify()
  }

  private reduce(e: OutputEvent): void {
    if (e.type === 'line') {
      if (shouldDrop(e.member, e.text)) {
        this.state.live.delete(e.member)
        this.notify()
        return
      }
      this.state.committed.push({ id: this.nextId++, member: e.member, text: e.text })
      this.state.live.delete(e.member)
    } else if (e.type === 'partial') {
      if (shouldDrop(e.member, e.text)) {
        this.state.live.delete(e.member)
      } else {
        this.state.live.set(e.member, e.text)
      }
    } else if (e.type === 'clear') {
      this.state.live.delete(e.member)
    } else if (e.type === 'eraseLine') {
      this.state.live.delete(e.member)
    }
    this.notify()
  }

  private notify(): void {
    for (const l of this.listeners) l()
  }
}
