import { useEffect, useRef, useState } from 'react';
import { capture as copy } from '@/content/copy';
import { playShutter } from '@/engine/audio/shutter';

/**
 * The shutter and the keepsake overlay.
 *
 * The button is a real <button> with a real label, because a bare circle is invisible to
 * a screen reader and unreachable by keyboard — and this is the one action the whole
 * experience exists to offer.
 */
export function CaptureButton({ onClick, busy }: { onClick: () => boolean; busy: boolean }) {
  const [firing, setFiring] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const press = () => {
    if (busy) return;
    // Ask first, then celebrate. Firing the sound and the blades before knowing a photo
    // was actually taken means a lost camera still gives the visitor the full feedback of
    // a successful capture, and they wait for a portrait that never arrives.
    if (!onClick()) return;

    // Fired from the press rather than the result: a shutter that goes off after the
    // picture has been taken feels like lag even when nothing is slow.
    playShutter();
    setFiring(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setFiring(false), 420);
  };

  return (
    <div className="capture">
      <button
        className="capture__shutter"
        type="button"
        onClick={press}
        disabled={busy}
        data-firing={firing}
        aria-label={copy.actionLabel}
      >
        <span className="capture__ring" aria-hidden="true">
          {/* Six blades closing and rotating together — the movement a real iris makes.
              Decorative, so the whole assembly is hidden from assistive tech. */}
          <span className="capture__iris">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <span
                key={i}
                className="capture__blade"
                style={{ '--i': i } as React.CSSProperties}
              />
            ))}
          </span>
        </span>
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

  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    closeRef.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onDismiss();
        return;
      }
      if (event.key !== 'Tab') return;

      // aria-modal tells a screen reader the rest of the page is not there; without a
      // trap, Tab walks straight out into controls the visitor has just been told do not
      // exist, behind an opaque panel they cannot see past.
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !panelRef.current?.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  return (
    <div className="keepsake" role="dialog" aria-modal="true" aria-label="Your portrait">
      {/* Clicking the backdrop closes, which is what everyone tries first. */}
      <button className="keepsake__scrim" type="button" aria-label="Close" onClick={onDismiss} />

      <div className="keepsake__panel" ref={panelRef}>
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
          <button className="btn btn--primary" type="button" onClick={onSave}>
            {copy.save}
          </button>
          {shareable && (
            <button className="btn btn--secondary" type="button" onClick={onShare}>
              {copy.share}
            </button>
          )}
          <button ref={closeRef} className="btn btn--ghost" type="button" onClick={onDismiss}>
            {copy.again}
          </button>
        </div>
      </div>
    </div>
  );
}
