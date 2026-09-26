import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'Tab' && panel.current) {
        const items = Array.from(panel.current.querySelectorAll<HTMLElement>('button,a,input,[tabindex]:not([tabindex="-1"])')).filter(item => !item.hasAttribute('disabled'))
        if (!items.length) return
        const first = items[0], last = items[items.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    panel.current?.querySelector<HTMLElement>('button,a,input')?.focus()
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); previous?.focus() }
  }, [onClose])
  return createPortal(<div className="overlay modal-overlay" onMouseDown={onClose}><div ref={panel} className="dialog-panel" role="dialog" aria-modal="true" aria-label={title} onMouseDown={event => event.stopPropagation()}><button type="button" className="dialog-close" onClick={onClose} aria-label="Close dialog">×</button><h2>{title}</h2>{children}</div></div>, document.body)
}
