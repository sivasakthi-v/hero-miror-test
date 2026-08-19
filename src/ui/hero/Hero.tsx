import { useEffect, useState } from 'react';
import { fallbackFor, identity, intro, live, permission } from '@/content/copy';
import { isCameraRunning, isFallback } from '@/engine/state/machine';
import { useCamera } from '@/ui/hooks/useCamera';
import './hero.css';

const DEBUG = new URLSearchParams(window.location.search).has('debug');

export function Hero() {
  const { context, videoRef, begin, retry } = useCamera();
  const { state } = context;

  const showIntro = state === 'boot' || state === 'idle' || state === 'requesting';
  const showFallback = isFallback(state);
  const cameraOn = isCameraRunning(state);

  return (
    <section className="hero" data-state={state}>
      {/* Real, crawlable identity — the hero is an enhancement on top of this. */}
      <h1 className="visually-hidden">
        {identity.name} — {identity.role}
      </h1>
      <p className="visually-hidden">{identity.statement}</p>

      <div className="hero__stage">
        <div className="hero__copy">
          {showIntro && <IntroCopy state={state} onBegin={begin} />}
          {showFallback && <FallbackCopy reason={context.failure} onRetry={retry} />}
          {/* P1 has no face detection, so the machine sits in `no_face` — showing the
              "come back" line to someone plainly sitting in frame reads as broken.
              Until P2 wires MediaPipe, the camera-on state just greets them. */}
          {cameraOn && <p className="hero__title">{live.firstDetection}</p>}
        </div>

        <div className="hero__aperture">
          {/* Mirrored, because a visitor expects a mirror. The single mirror lives here
              and in the transform module's `mirrored` flag — never applied twice. */}
          <video
            ref={videoRef}
            className="hero__video"
            autoPlay
            muted
            playsInline
            aria-label="Live camera preview"
            data-visible={cameraOn}
          />
          {!cameraOn && (
            <span className="hero__placeholder" aria-hidden="true">
              {state === 'requesting' ? permission.hint : ''}
            </span>
          )}
        </div>
      </div>

      {DEBUG && <DebugPanel state={state} failure={context.failure} videoRef={videoRef} />}
    </section>
  );
}

function IntroCopy({ state, onBegin }: { state: string; onBegin: () => void }) {
  const asking = state === 'requesting';
  return (
    <>
      <p className="hero__title">{asking ? permission.requesting : intro.title}</p>
      {!asking && (
        <div className="hero__body">
          {intro.body.map((line, i) => (line === '' ? <br key={i} /> : <p key={i}>{line}</p>))}
        </div>
      )}

      <button className="hero__action" type="button" onClick={onBegin} disabled={asking}>
        {asking ? '…' : intro.action}
      </button>

      <p className="hero__privacy">{intro.privacy}</p>
      <p className="hero__privacy hero__privacy--note">{intro.privacyNote}</p>
    </>
  );
}

function FallbackCopy({ reason, onRetry }: { reason: string | null; onRetry: () => void }) {
  const copy = fallbackFor(reason);
  const retryLabel = 'retry' in copy ? copy.retry : null;
  return (
    <>
      <p className="hero__title">{copy.title}</p>
      <div className="hero__body">
        {copy.body.map((line, i) => (line === '' ? <br key={i} /> : <p key={i}>{line}</p>))}
      </div>
      <div className="hero__actions">
        <a className="hero__action" href="#work">
          {copy.action}
        </a>
        {retryLabel && (
          <button className="hero__action hero__action--quiet" type="button" onClick={onRetry}>
            {retryLabel}
          </button>
        )}
      </div>
    </>
  );
}

/** `?debug=1`. Verifies tracking, cropping and mirroring before any artwork exists. */
function DebugPanel({
  state,
  failure,
  videoRef,
}: {
  state: string;
  failure: string | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}) {
  // Sampled rather than read during render: a ref holds no render-triggering value, and
  // the track dimensions only exist once frames start arriving.
  const [track, setTrack] = useState('no frames');

  useEffect(() => {
    const id = setInterval(() => {
      const video = videoRef.current;
      setTrack(video?.videoWidth ? `${video.videoWidth}×${video.videoHeight}` : 'no frames');
    }, 500);
    return () => clearInterval(id);
  }, [videoRef]);

  return (
    <dl className="hero__debug">
      <dt>state</dt>
      <dd>{state}</dd>
      <dt>failure</dt>
      <dd>{failure ?? '—'}</dd>
      <dt>track</dt>
      <dd>{track}</dd>
      <dt>dpr</dt>
      <dd>{window.devicePixelRatio}</dd>
    </dl>
  );
}
