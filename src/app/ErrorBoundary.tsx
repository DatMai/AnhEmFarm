import { Component, type ErrorInfo, type ReactNode } from 'react'
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(_error: Error, _info: ErrorInfo) { /* Avoid logging private data in production. */ }
  render() { return this.state.failed ? <main className="container section"><h1>Something went wrong</h1><p>Please reload the page and try again.</p></main> : this.props.children }
}
