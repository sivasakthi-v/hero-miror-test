import { useReducer } from 'react';
import { INITIAL_CONTEXT, reduce } from '@/engine/state/machine';
import { identity, intro } from '@/content/copy';
import './hero.css';

/**
 * P0 shell. Renders the intro beat only — no camera, no canvas yet.
 * It exists so the FSM, tokens and copy are wired end-to-end before P1 adds
 * the stream. See docs/PLAN.md §11.
 */
export function Hero() {
  const [context, dispatch] = useReducer(reduce, INITIAL_CONTEXT);

  return (
    <section className="hero" data-state={context.state}>
      {/* Real, crawlable identity — the hero is an enhancement on top of this. */}
      <h1 className="visually-hidden">
        {identity.name} — {identity.role}
      </h1>
      <p className="visually-hidden">{identity.statement}</p>

      <div className="hero__stage">
        <div className="hero__intro">
          <p className="hero__title">{intro.title}</p>
          <div className="hero__body">
            {intro.body.map((line, i) =>
              line === '' ? <br key={i} /> : <p key={i}>{line}</p>,
            )}
          </div>

          <button
            className="hero__action"
            type="button"
            onClick={() => {
              dispatch({ type: 'SUPPORT_CHECKED', supported: true });
              dispatch({ type: 'BEGIN' });
            }}
          >
            {intro.action}
          </button>

          <p className="hero__privacy">{intro.privacy}</p>
          <p className="hero__privacy hero__privacy--note">{intro.privacyNote}</p>
        </div>

        <div className="hero__aperture" aria-hidden="true">
          <span className="hero__placeholder">state: {context.state}</span>
        </div>
      </div>
    </section>
  );
}
