import { useEffect, useState } from 'preact/hooks'

export type Route = 'tasks' | 'brief'

export function routeFromHash(hash: string): Route {
  return hash === '#/uebergabe' ? 'brief' : 'tasks'
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(routeFromHash(location.hash))
  useEffect(() => {
    const onChange = () => setRoute(routeFromHash(location.hash))
    addEventListener('hashchange', onChange)
    return () => removeEventListener('hashchange', onChange)
  }, [])
  return route
}
