import type { ReactNode } from 'react'
export function PageState({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="page-state" role="status"><h2>{title}</h2>{children && <p>{children}</p>}</div>
}
