/**
 * Clickjacking guard.
 *
 * The hero asks for camera permission. If a third party can put it in an iframe, they
 * can put their own UI over ours and trick someone into granting a camera to a page
 * they cannot see. docs/PLAN.md §9 says never run in a third-party frame — but GitHub
 * Pages cannot send X-Frame-Options, and CSP `frame-ancestors` is ignored when it comes
 * from a <meta> tag. So the page has to defend itself.
 *
 * `top.location = self.location` is blocked cross-origin, so we do not try to break
 * out. We refuse to render and offer the real link instead.
 */

export function isFramed(): boolean {
  try {
    return window.top !== window.self;
  } catch {
    // A cross-origin parent throws on access — which is itself proof of framing.
    return true;
  }
}

export function renderFrameRefusal(root: HTMLElement, href: string): void {
  root.replaceChildren();

  const wrap = document.createElement('div');
  wrap.className = 'frame-refusal';

  const line = document.createElement('p');
  line.textContent = 'This one needs its own window.';

  const link = document.createElement('a');
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Open it properly';

  wrap.append(line, link);
  root.append(wrap);
}
