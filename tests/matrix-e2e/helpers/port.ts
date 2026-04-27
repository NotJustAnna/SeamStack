import { createConnection } from 'node:net'

function probeOne(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = createConnection({ port, host })
    const done = (ok: boolean) => {
      sock.destroy()
      resolve(ok)
    }
    sock.once('connect', () => done(true))
    sock.once('error', () => done(false))
  })
}

async function probe(port: number): Promise<boolean> {
  const [ipv4, ipv6] = await Promise.all([
    probeOne(port, '127.0.0.1'),
    probeOne(port, '::1'),
  ])
  return ipv4 || ipv6
}

export async function waitForPort(port: number, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await probe(port)) return
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`waitForPort: ${port} did not open within ${timeoutMs}ms`)
}

export async function waitForPortReleased(port: number, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!(await probe(port))) return
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`waitForPortReleased: ${port} still listening after ${timeoutMs}ms`)
}
