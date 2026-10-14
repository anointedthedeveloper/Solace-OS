import { Component, type ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';

interface Props {
  children: ReactNode;
  label?: string;
}
interface State {
  error: Error | null;
}

/** Keeps a crashing app from taking the whole desktop down. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error(`[solace] ${this.props.label ?? 'component'} crashed:`, error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="grid h-full place-items-center p-6 text-center">
        <div className="flex max-w-sm flex-col items-center gap-2">
          <TriangleAlert size={28} className="text-warn" aria-hidden />
          <div className="text-[14px] font-medium text-ink">{this.props.label ?? 'This app'} ran into a problem</div>
          <div className="text-[12.5px] text-dim">Your data is stored separately and was not affected.</div>
          <button className="s-btn mt-2" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </div>
      </div>
    );
  }
}
