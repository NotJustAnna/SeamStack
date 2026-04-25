import { pushOutput } from './output-bus.js'

const ESC = '\x1b'

/**
 * Pipe a child's readable stream into the seam output bus, tagged with `member`.
 *
 * Recognizes a small subset of ANSI escapes:
 * - CSI 2J / 3J / ESC c → emit `clear` (drop that member's buffer)
 * - CSI K / 0K / 2K / cursor-up / cursor-up+line-start → emit `eraseLine`
 * - CSI <…>m (SGR colors / styles) → preserved inline in the line text
 * - Everything else (cursor positioning, OSC title sets, etc.) → silently dropped
 *
 * Newlines split lines; `\r` without `\n` triggers `eraseLine` (carriage return
 * progress bars). Partial lines flush as `partial` events so the renderer can
 * show them live before a newline lands.
 */
export function wrapStream(
  member: string,
  stream: NodeJS.ReadableStream | null | undefined,
): void {
  if (!stream) return
  const parser = new StreamParser(member)
  const setEnc = (stream as { setEncoding?: (e: string) => void }).setEncoding
  if (typeof setEnc === 'function') setEnc.call(stream, 'utf8')
  stream.on('data', (chunk: string | Buffer) => {
    parser.feed(typeof chunk === 'string' ? chunk : chunk.toString('utf8'))
  })
  stream.on('end', () => parser.end())
}

export class StreamParser {
  private leftover = ''
  private currentLine = ''

  constructor(private readonly member: string) {}

  feed(chunk: string): void {
    const s = this.leftover + chunk
    this.leftover = ''
    let i = 0
    let lineDirty = false

    while (i < s.length) {
      const ch = s[i]!

      if (ch === '\n') {
        pushOutput({ type: 'line', member: this.member, text: this.currentLine })
        this.currentLine = ''
        lineDirty = true
        i++
        continue
      }

      if (ch === '\r') {
        if (s[i + 1] === '\n') {
          i++
          continue
        }
        pushOutput({ type: 'eraseLine', member: this.member })
        this.currentLine = ''
        lineDirty = true
        i++
        continue
      }

      if (ch === ESC) {
        const r = parseEscape(s, i)
        if (r === null) {
          this.leftover = s.slice(i)
          break
        }
        if (r.event === 'clear') {
          pushOutput({ type: 'clear', member: this.member })
          this.currentLine = ''
          lineDirty = true
        } else if (r.event === 'eraseLine') {
          pushOutput({ type: 'eraseLine', member: this.member })
          this.currentLine = ''
          lineDirty = true
        } else if (r.passthrough) {
          this.currentLine += s.slice(i, i + r.length)
          lineDirty = true
        }
        i += r.length
        continue
      }

      this.currentLine += ch
      lineDirty = true
      i++
    }

    if (lineDirty && this.currentLine.length > 0) {
      pushOutput({ type: 'partial', member: this.member, text: this.currentLine })
    }
  }

  end(): void {
    if (this.currentLine.length > 0) {
      pushOutput({ type: 'line', member: this.member, text: this.currentLine })
      this.currentLine = ''
    }
  }
}

interface EscapeResult {
  length: number
  event: 'clear' | 'eraseLine' | null
  passthrough: boolean
}

function parseEscape(s: string, start: number): EscapeResult | null {
  if (start + 1 >= s.length) return null
  const next = s[start + 1]!

  if (next === 'c') {
    return { length: 2, event: 'clear', passthrough: false }
  }

  if (next === ']') {
    // OSC: ESC ] params (BEL | ESC \)
    let i = start + 2
    while (i < s.length) {
      if (s[i] === '\x07') return { length: i - start + 1, event: null, passthrough: false }
      if (s[i] === ESC && s[i + 1] === '\\') {
        return { length: i - start + 2, event: null, passthrough: false }
      }
      i++
    }
    return null
  }

  if (next === '[') {
    let i = start + 2
    if (s[i] === '?') i++
    while (i < s.length && /[0-9;]/.test(s[i]!)) i++
    if (i >= s.length) return null
    const finalCh = s[i]!
    const params = s.slice(start + (s[start + 2] === '?' ? 3 : 2), i)
    const length = i - start + 1

    if (finalCh === 'J') {
      const n = params === '' ? 0 : Number(params)
      if (n === 2 || n === 3) {
        return { length, event: 'clear', passthrough: false }
      }
      return { length, event: 'eraseLine', passthrough: false }
    }
    if (finalCh === 'K') {
      return { length, event: 'eraseLine', passthrough: false }
    }
    if (finalCh === 'A' || finalCh === 'F') {
      return { length, event: 'eraseLine', passthrough: false }
    }
    if (finalCh === 'm') {
      return { length, event: null, passthrough: true }
    }
    return { length, event: null, passthrough: false }
  }

  return { length: 2, event: null, passthrough: false }
}
