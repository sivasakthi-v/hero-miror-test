import { nav } from '@/content/copy';
import './nav.css';

/**
 * The floating navigation.
 *
 * Placeholder destinations for now — this hero is a standalone experiment that will be
 * dropped into the real portfolio, so the links exist to establish the shell rather than
 * to go anywhere. They are marked `aria-disabled` and carry a title saying so, because a
 * link that silently does nothing is worse than one that admits it.
 *
 * Real <nav> and a real list: this is the page's primary navigation, and screen readers
 * navigate by landmark before they navigate by link.
 */
export function Nav() {
  return (
    <nav className="nav" aria-label="Primary">
      <div className="nav__bar">
        <a className="nav__logo" href="#top">
          {nav.wordmark}
        </a>

        <ul className="nav__links">
          {nav.links.map((label) => (
            <li key={label}>
              <a
                className="nav__link"
                href="#"
                aria-disabled="true"
                title="Placeholder — this hero is not wired into the site yet"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>

        <a className="btn btn--primary nav__cta" href={`mailto:${nav.email}`}>
          {nav.cta}
        </a>
      </div>
    </nav>
  );
}
