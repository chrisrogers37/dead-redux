interface Props {
  /** The look-up failed (an error status, an unreachable host or the timeout), as against a show Relisten has no recording of. */
  failed: boolean;
  /** The show's page on relisten.net. */
  relisten: string;
}

/**
 * The now-plate without a recording: Relisten has none for this show, or the look-up failed, which says so and offers a reload. The
 * page renders per visit and a failed look-up is never cached, so Try again asks Relisten again.
 */
export function NoRecording({ failed, relisten }: Props) {
  const link = (
    <a href={relisten} target="_blank" rel="noopener noreferrer" className="t-row text-muted underline hover:text-ink inline-flex items-center min-h-11">
      Open on Relisten ↗
    </a>
  );
  if (!failed) {
    return (
      <>
        <p className="t-body text-ink">No recording for this show.</p>
        {link}
      </>
    );
  }
  return (
    <>
      <p className="t-body text-ink">Can&rsquo;t load the recording right now.</p>
      <div className="flex items-center gap-4">
        <button type="button" data-action="retry" onClick={() => window.location.reload()} className="t-row text-ink underline hover:text-accent inline-flex items-center min-h-11">
          Try again
        </button>
        {link}
      </div>
    </>
  );
}
