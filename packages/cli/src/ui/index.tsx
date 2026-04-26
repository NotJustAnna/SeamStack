import { render, type Instance } from 'ink'
import { App } from './app.js'
import { memberColor } from './colors.js'
import { log } from '../logger.js'
import { Store, type SeamState } from './store.js'

let instance: Instance | undefined
let activeStore: Store | undefined

export interface MountOptions {
  readonly mode: 'dev' | 'start'
  readonly publicUrl: string
  readonly members: readonly string[]
}

export function mountUI(options: MountOptions): Store {
  if (instance) throw new Error('UI already mounted')
  const seam: SeamState = {
    mode: options.mode,
    phase: 'starting',
    startedAt: Date.now(),
    publicUrl: options.publicUrl,
    members: options.members,
  }
  const store = new Store(seam)
  store.start()

  // Emit the starting banner as a plain log line above the live area, so it
  // stays in scrollback after the header flips to 'ready'.
  const tagged = options.members.map((m) => memberColor(m)(m)).join(', ')
  log.info(`starting: ${tagged}…`)

  instance = render(<App store={store} />)
  activeStore = store
  return store
}

export async function unmountUI(): Promise<void> {
  if (!instance) return
  activeStore?.setStopping()
  activeStore?.stop()
  instance.unmount()
  await instance.waitUntilExit().catch(() => {
    /* ignore */
  })
  instance = undefined
  activeStore = undefined
}

export function getStore(): Store | undefined {
  return activeStore
}

export { Store } from './store.js'
export type { SeamState, StoreState, CommittedLine, Phase } from './store.js'
