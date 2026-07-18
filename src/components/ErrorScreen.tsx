import { Component, type ReactNode } from 'react';

/**
 * Without this, any thrown error unmounts the whole app and leaves just the
 * page background — which is exactly what "she only sees the background on her
 * iPad" looks like. Now a crash shows a readable message (and the error text),
 * so it can be diagnosed instead of guessed at, and the player can retry.
 */
export class ErrorScreen extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Surface it in the console too, for anyone who opens dev tools.
    console.error('App crashed:', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash-screen">
        <div className="crash-card">
          <h1>🧭 Oops!</h1>
          <p>Something went wrong loading the game. This can happen on an older iPad or phone.</p>
          <p className="crash-detail">{this.state.error.message}</p>
          <button onClick={() => window.location.reload()}>↻ Try again</button>
          <p className="crash-tip">If it keeps happening, update your device's browser to the latest version.</p>
        </div>
      </div>
    );
  }
}
