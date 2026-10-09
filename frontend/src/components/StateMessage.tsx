/**
 * StateMessage: the shared loading and error display for data-driven components.
 *
 *   const { data, loading, error, reload } = useHeatmap();
 *   if (loading || error || !data) return <StateMessage loading={loading} error={error} onRetry={reload} what="heatmap" />;
 */
interface StateMessageProps {
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  /** Short noun for the thing being loaded, used in messages and aria-labels. */
  what: string;
}

export default function StateMessage({ loading, error, onRetry, what }: StateMessageProps) {
  if (error) {
    return (
      <div className="state state--error" role="alert">
        <p className="state__title">Could not load {what}</p>
        <p>{error}</p>
        {onRetry && (
          <button type="button" className="btn" onClick={onRetry} aria-label={`Try loading the ${what} again`}>
            Try again
          </button>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="state" role="status" aria-live="polite">
        <p className="state__title">Loading {what}</p>
      </div>
    );
  }

  return null;
}
