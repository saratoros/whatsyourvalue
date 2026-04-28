import { Component } from 'react'

export class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: 24,
            fontFamily: 'system-ui, sans-serif',
            maxWidth: 520,
            lineHeight: 1.5,
          }}
        >
          <h1 style={{ fontSize: 18, margin: '0 0 12px' }}>Something went wrong</h1>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              fontSize: 12,
              color: '#a40000',
              background: '#fafafa',
              padding: 12,
              borderRadius: 6,
            }}
          >
            {this.state.error?.message ?? String(this.state.error)}
          </pre>
          <p style={{ fontSize: 13, color: '#555', marginTop: 16 }}>
            Open the browser devtools (F12 → Console) for the full stack trace. Try a
            hard refresh (Cmd+Shift+R on Mac, Ctrl+Shift+R on Windows) in case an old
            script is cached.
          </p>
        </div>
      )
    }
    return this.props.children
  }
}
