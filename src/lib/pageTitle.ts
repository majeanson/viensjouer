import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

// A real title for every screen (the tab, the history, a screen reader's first word) and focus that follows
// a navigation. The title is the page's own h1 plus the app name, kept in step as the page changes; on a NEW
// route (never the first load, never a re-render) focus moves to the main region so a keyboard or
// screen-reader user is not left on the link they just pressed.
export function usePageTitle(appName: string): void {
  const { pathname } = useLocation()
  useEffect(() => {
    const root = document.getElementById('root')
    if (!root) return
    const set = () => {
      const h1 = document.querySelector('h1')?.textContent?.trim()
      document.title = h1 ? `${h1} · ${appName}` : appName
    }
    set()
    const observer = new MutationObserver(set)
    observer.observe(root, { childList: true, subtree: true, characterData: true })
    return () => observer.disconnect()
  }, [pathname, appName])

  const previous = useRef(pathname)
  useEffect(() => {
    if (previous.current === pathname) return
    previous.current = pathname
    const id = requestAnimationFrame(() => document.getElementById('main')?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(id)
  }, [pathname])
}
