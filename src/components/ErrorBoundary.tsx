import { Component, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidCatch(err: Error) { console.error(err); }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <div className="panel max-w-md p-8 text-center">
          <p className="text-4xl">🍃</p>
          <h1 className="mt-3 font-display text-2xl font-bold">Something went wrong</h1>
          <p className="mt-2 text-sm text-paper/70">{this.state.err.message}</p>
          <a href="/" className="btn-lantern mt-6">Back to home</a>
        </div>
      </div>
    );
  }
}
