import { Hero } from '@/ui/hero/Hero';

export function App() {
  return (
    <>
      <a className="skip-link" href="#work">
        Skip to the work
      </a>
      <main>
        <Hero />
        {/* P6: Work / About / Experiments / Contact. */}
        <div id="work" />
      </main>
    </>
  );
}
