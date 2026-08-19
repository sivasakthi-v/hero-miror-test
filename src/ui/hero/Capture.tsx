import { useEffect, useRef } from 'react';
import { capture as copy } from '@/content/copy';

/**
 * The shutter and the keepsake overlay.
 *
 * The button is a real <button> with a real label, because a bare circle is invisible to
 * a screen reader and unreachable by keyboard — and this is the one action the whole
 * experience exists to offer.
 */
export function CaptureButton({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  return (
    <div className="capture">
      <button
        className="capture__shutter"
        type="button"
        onClick={onClick}
        disabled={busy}
        aria-label={copy.actionLabel}
      >
        <span className="capture__ring" aria-hidden="true" />
      </button>
      <p className="capture__prompt">{copy.prompt}</p>
    </div>
  );
}

/**
 * A modal, not an inline panel: the portrait is the payoff, and everything else on the
 * page competing with it makes it feel like a by-product.
 *
 * Focus moves into the dialog on open and Escape closes it, because a modal that traps a
 * keyboard user is worse than no modal.
 */
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
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  return (
    <div className="keepsake" role="dialog" aria-modal="true" aria-label="Your portrait">
      {/* Clicking the backdrop closes, which is what everyone tries first. */}
      <button className="keepsake__scrim" type="button" aria-label="Close" onClick={onDismiss} />

      <div className="keepsake__panel">
        {/*
          The print fades up rather than appearing. A polaroid develops, and those two
          seconds of watching it arrive are most of why keeping one feels good.
        */}
        <img className="keepsake__print" src={src} alt="Your portrait, by Siva Serafino" />

        <div className="keepsake__words">
          <p className="keepsake__title">{copy.done}</p>
          <p className="keepsake__thanks">{copy.thanks}</p>
        </div>

        <div className="keepsake__actions">
          <button className="hero__action hero__action--solid" type="button" onClick={onSave}>
            {copy.save}
          </button>
          {shareable && (
            <button className="hero__action" type="button" onClick={onShare}>
              {copy.share}
            </button>
          )}
          <button
            ref={closeRef}
            className="hero__action hero__action--quiet"
            type="button"
            onClick={onDismiss}
          >
            {copy.again}
          </button>
        </div>
      </div>
    </div>
  );
}
