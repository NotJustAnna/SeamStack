import { Box, Text } from 'ink'
import { useEffect, useState } from 'react'
import { memberInkColor } from './colors.js'
import type { CommittedLine, Store } from './store.js'

const BAR = '┃'

function useStoreSnapshot(store: Store): number {
  const [version, setVersion] = useState(0)
  useEffect(() => store.subscribe(() => setVersion((v) => v + 1)), [store])
  return version
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

function timestamp(): string {
  const d = new Date()
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

interface LineRowProps {
  entry: CommittedLine
}

function LineRow({ entry }: LineRowProps): React.ReactElement {
  const color = memberInkColor(entry.member)
  return (
    <Box>
      <Text color={color}>{BAR} </Text>
      <Text>{entry.text}</Text>
    </Box>
  )
}

interface LiveRowProps {
  member: string
  text: string
}

function LiveRow({ member, text }: LiveRowProps): React.ReactElement {
  const color = memberInkColor(member)
  return (
    <Box>
      <Text color={color} dimColor>
        {BAR}{' '}
      </Text>
      <Text dimColor>{text}</Text>
    </Box>
  )
}

interface HeaderProps {
  store: Store
}

function Header({ store }: HeaderProps): React.ReactElement {
  const { seam } = store.state
  const seamColor = memberInkColor('seam')
  const ts = timestamp()

  if (seam.phase === 'starting') {
    return <Box />
  }

  if (seam.phase === 'ready') {
    return (
      <Box>
        <Text dimColor>{ts}</Text>
        <Text> </Text>
        <Text color={seamColor} bold>
          [seam]
        </Text>
        <Text color="green"> ✓</Text>
        <Text> ready in </Text>
        <Text bold>{seam.readyMs ?? 0}ms</Text>
        <Text> — </Text>
        {seam.mode === 'dev' && seam.via ? (
          <>
            <Text>use </Text>
            <Text bold color={memberInkColor(seam.via)}>
              {seam.via}
            </Text>
            <Text>'s url</Text>
          </>
        ) : (
          <Text bold color="cyan">
            {seam.publicUrl}
          </Text>
        )}
      </Box>
    )
  }

  return (
    <Box>
      <Text dimColor>{ts}</Text>
      <Text> </Text>
      <Text color={seamColor} bold>
        [seam]
      </Text>
      <Text> stopping…</Text>
    </Box>
  )
}

interface AppProps {
  store: Store
}

export function App({ store }: AppProps): React.ReactElement {
  useStoreSnapshot(store)
  const { committed, live } = store.state
  const liveEntries = Array.from(live.entries())

  return (
    <Box flexDirection="column">
      {committed.map((entry) => (
        <LineRow key={entry.id} entry={entry} />
      ))}
      <Box flexDirection="column" marginTop={committed.length > 0 ? 1 : 0}>
        <Header store={store} />
        {liveEntries.map(([member, text]) => (
          <LiveRow key={member} member={member} text={text} />
        ))}
      </Box>
    </Box>
  )
}
