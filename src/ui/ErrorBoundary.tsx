import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  onReset: () => void;
}

interface State {
  error: Error | null;
}

/** Evita tela em branco: mostra o erro e permite voltar ao menu. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error('[Pokeru] erro de interface', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="modal-back">
        <div className="modal panel">
          <h3>Ops! Algo deu errado.</h3>
          <p className="muted small" style={{ maxWidth: 480, whiteSpace: 'pre-wrap' }}>
            {this.state.error.message}
          </p>
          <div className="row gap center">
            <button
              className="btn btn-gold"
              onClick={() => {
                this.setState({ error: null });
                this.props.onReset();
              }}
            >
              Voltar ao menu
            </button>
          </div>
        </div>
      </div>
    );
  }
}
