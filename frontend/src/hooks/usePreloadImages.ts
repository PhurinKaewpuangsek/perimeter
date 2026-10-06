import { useEffect, useState } from 'react'

/**
 * Downloads images ahead of time and reports when every one has settled.
 *
 * Used so the loading screen can hold the map back until its floor plans are cached too;
 * otherwise the markers would arrive first and the artwork would paint in under them. A
 * failed image still counts as settled, so a broken asset can never keep the app stuck on
 * the loading screen.
 */
const SETTLED_URLS = new Set<string>()

export function usePreloadImages(urls: readonly string[]): boolean {
  const initiallyReady = urls.length > 0 && urls.every((u) => SETTLED_URLS.has(u))
  const [ready, setReady] = useState(initiallyReady)
  const key = urls.join('|')

  useEffect(() => {
    let isMounted = true
    const images = key.split('|').filter(Boolean)

    if (images.length === 0 || images.every((u) => SETTLED_URLS.has(u))) {
      return
    }

    Promise.all(
      images.map(
        (src) =>
          new Promise<void>((resolve) => {
            if (SETTLED_URLS.has(src)) {
              resolve()
              return
            }
            const image = new Image()
            image.onload = () => {
              SETTLED_URLS.add(src)
              resolve()
            }
            image.onerror = () => {
              SETTLED_URLS.add(src)
              resolve()
            }
            image.src = src
          })
      )
    ).then(() => {
      images.forEach((u) => SETTLED_URLS.add(u))
      if (isMounted) setReady(true)
    })

    return () => {
      isMounted = false
    }
  }, [key])

  return ready
}
