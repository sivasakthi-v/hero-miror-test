import { Hero } from '@/ui/hero/Hero';
import { Nav } from '@/ui/nav/Nav';
import { identity } from '@/content/copy';

export function App() {
  return (
    <>
      <a className="skip-link" href="#work">
        Skip to the work
      </a>
      <Nav />
      <main>
        <Hero />
        {/* tabindex="-1" so the skip link actually moves focus here — a plain div is
            not focusable, and Safari and Firefox leave focus on the link without it. */}
        <section id="work" tabIndex={-1} aria-labelledby="work-heading">
          <h2 id="work-heading" className="visually-hidden">
            Selected work
          </h2>
          {/* P6 fills this in. */}
          <p className="visually-hidden">{identity.statement}</p>
        </section>
      </main>
    </>
  );
}
