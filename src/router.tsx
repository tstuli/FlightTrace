/* eslint-disable react-refresh/only-export-components */
import type { AnchorHTMLAttributes, MouseEvent } from 'react'

export function navigate(to: string) {
  const target = to.startsWith('/') ? to : `/${to}`
  window.location.hash = `#${target}`
}

export function Link({ to, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  return <a href={`#${to}`} {...props} onClick={(event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event)
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    navigate(to)
  }} />
}
