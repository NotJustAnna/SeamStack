/**
 * Minimal fetch-based GraphQL client. Bring your own framework integration
 * (urql, apollo, relay) when you need caching/subscriptions.
 */
export async function graphqlRequest(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const r = await fetch('/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  const body = (await r.json())> }
  if (body.errors?.length) {
    throw new Error(body.errors.map((e) => e.message).join('; '))
  }
  if (!body.data) throw new Error('GraphQL response missing data')
  return body.data
}
