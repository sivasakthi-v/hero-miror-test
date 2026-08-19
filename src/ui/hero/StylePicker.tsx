import { ART_MODES, ART_MODE_IDS, type ArtModeId } from '@/content/art-modes';

/**
 * Four small marks inside the frame edge (DECISIONS.md D7).
 *
 * A mode is chosen at random per visit, which gives repeat visitors something new — but
 * random alone means someone can be stuck with the one they like least. This turns the
 * four modes from a hidden detail into a thing you can play with, which is the point of
 * having four.
 *
 * Real buttons in a real list, so it is keyboard- and screen-reader-usable rather than a
 * row of decorative dots.
 */
export function StylePicker({
  value,
  onChange,
}: {
  value: ArtModeId;
  onChange: (mode: ArtModeId) => void;
}) {
  return (
    <div className="style-picker" role="group" aria-label="Drawing style">
      {ART_MODE_IDS.map((id) => {
        const mode = ART_MODES[id];
        return (
          <button
            key={id}
            type="button"
            className="style-picker__dot"
            aria-label={`${mode.label} style`}
            aria-pressed={id === value}
            data-active={id === value}
            style={{ '--dot': mode.accent } as React.CSSProperties}
            onClick={() => onChange(id)}
          >
            <span className="visually-hidden">{mode.label}</span>
          </button>
        );
      })}
    </div>
  );
}
