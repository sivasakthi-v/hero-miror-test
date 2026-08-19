import { capture as copy } from '@/content/copy';

/**
 * The shutter button and the developed print.
 *
 * The button is a real <button> with a real label, because a bare circle is invisible to
 * a screen reader and unreachable by keyboard — and this is the one action the whole
 * experience exists to offer.
 */
export function CaptureButton({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  return (
    <div className="capture">
      <p className="capture__prompt">{copy.prompt}</p>
      <button
        className="capture__shutter"
        type="button"
        onClick={onClick}
        disabled={busy}
        aria-label={copy.actionLabel}
      >
        <span className="capture__ring" aria-hidden="true" />
        <span className="capture__label">{copy.action}</span>
      </button>
    </div>
  );
}

export function CapturePreview({
  src,
  shareable,
  onSave,
  onShare,
  onDismiss,
}: {
  src: string;
  shareable: boolean;
  onSave: () => void;
  onShare: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="develop" role="dialog" aria-label="Your portrait">
      <div className="develop__sheet">
        {/*
          The print fades up rather than appearing: a polaroid develops, and the two
          seconds of watching it arrive are most of why keeping one feels good.
        */}
        <img className="develop__print" src={src} alt="Your portrait, by Siva Serafino" />
      </div>

      <p className="develop__caption">{copy.done}</p>

      <div className="develop__actions">
        <button className="hero__action" type="button" onClick={onSave}>
          {copy.save}
        </button>
        {shareable && (
          <button className="hero__action hero__action--quiet" type="button" onClick={onShare}>
            {copy.share}
          </button>
        )}
        <button className="hero__action hero__action--quiet" type="button" onClick={onDismiss}>
          AGAIN
        </button>
      </div>
    </div>
  );
}
