import { useEffect, useRef, useState } from 'react';
import { fallbackFor, identity, intro, live, permission } from '@/content/copy';
import { isCameraRunning, isFallback } from '@/engine/state/machine';
import { useCamera } from '@/ui/hooks/useCamera';
import type { Telemetry } from '@/ui/hooks/useFaceTracking';
import { CaptureButton, CapturePreview } from './Capture';
import { StylePicker } from './StylePicker';
import './hero.css';
import './frame.css';

const DEBUG = new URLSearchParams(window.location.search).has('debug');

export function Hero() {
  const {
    context,
    videoRef,
    canvasRef,
    ambientRef,
    shineRef,
    telemetryRef,
    capture,
    delegate,
    artMode,
    setArtMode,
    begin,
    retry,
  } = useCamera(DEBUG);
  const { state } = context;
  const frameRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const showIntro = state === 'boot' || state === 'idle' || state === 'requesting';
  const showFallback = isFallback(state);
  const cameraOn = isCameraRunning(state);

  /**
   * The shine is written straight to a CSS variable rather than held in state. It changes
   * every frame, and putting it through React would re-render the tree 60 times a second
   * to move a highlight (docs/PLAN.md §3).
   */
  useEffect(() => {
    if (!cameraOn) return;
    let id = 0;
    const tick = () => {
      id = requestAnimationFrame(tick);
      frameRef.current?.style.setProperty('--shine', shineRef.current.toFixed(3));
      // The shutter flash decays here rather than in the capture hook, because it is
      // purely visual and must not cost a React render per frame.
      if (capture.flashRef.current > 0) {
        capture.flashRef.current = Math.max(0, capture.flashRef.current - 1 / 22);
        stageRef.current?.style.setProperty('--flash', capture.flashRef.current.toFixed(3));
      }
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [cameraOn, shineRef, capture.flashRef]);

  return (
    <section className="hero" data-state={state}>
      {/* Real, crawlable identity — the hero is an enhancement on top of this. */}
      <h1 className="visually-hidden">
        {identity.name} — {identity.role}
      </h1>
      <p className="visually-hidden">{identity.statement}</p>

      {/* Light spilling from the picture into the room, sampled from the camera. */}
      <canvas ref={ambientRef} className="hero__ambient" aria-hidden="true" data-on={cameraOn} />

      <div className="hero__stage">
        <div className="hero__copy">
          {showIntro && <IntroCopy state={state} />}
          {showFallback && <FallbackCopy reason={context.failure} onRetry={retry} />}
          {cameraOn && <p className="hero__title">{liveCopyFor(state)}</p>}
        </div>

        <div className="hero__frame-wrap" ref={stageRef}>
          <div className="frame" ref={frameRef} data-on={cameraOn}>
            <div className="hero__aperture">
              {/*
                The video is the source, not the picture: every frame is drawn into the
                canvas so the treatment can act on its pixels. It stays in the DOM,
                playing and invisible — a display:none video stops delivering frames.
              */}
              <video
                ref={videoRef}
                className="hero__source"
                autoPlay
                muted
                playsInline
                aria-hidden="true"
              />
              <canvas
                ref={canvasRef}
                className="hero__canvas"
                data-visible={cameraOn}
                role="img"
                aria-label="Live camera portrait"
              />
              {cameraOn && !DEBUG && <StylePicker value={artMode} onChange={setArtMode} />}
              {!cameraOn && !showFallback && (
                <div className="hero__begin">
                  <button
                    className="hero__action"
                    type="button"
                    onClick={begin}
                    disabled={state === 'requesting'}
                  >
                    {state === 'requesting' ? permission.hint : intro.action}
                  </button>
                </div>
              )}
            </div>
            <span className="hero__flash" aria-hidden="true" />
          </div>

          {cameraOn && !capture.preview && (
            <CaptureButton onClick={capture.capture} busy={capture.busy} />
          )}

          {capture.preview && (
            <CapturePreview
              src={capture.preview}
              shareable={capture.shareable}
              onSave={capture.save}
              onShare={capture.share}
              onDismiss={capture.dismiss}
            />
          )}
        </div>
      </div>

      {DEBUG && (
        <DebugPanel
          state={state}
          failure={context.failure}
          delegate={delegate}
          videoRef={videoRef}
          telemetryRef={telemetryRef}
        />
      )}
    </section>
  );
}

/** The camera-on states each have their own line; `no_face` is the one that matters. */
function liveCopyFor(state: string): string {
  if (state === 'loading_model') return live.loading;
  if (state === 'no_face') return live.noFace;
  if (state === 'vision_failed') return live.firstDetection;
  return live.stabilised;
}

function IntroCopy({ state }: { state: string }) {
  const asking = state === 'requesting';
  return <p className="hero__title">{asking ? permission.requesting : intro.title}</p>;
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

/** `?debug=1`. Ungraded photo plus the tracking overlay, for checking the maths. */
function DebugPanel({
  state,
  failure,
  delegate,
  videoRef,
  telemetryRef,
}: {
  state: string;
  failure: string | null;
  delegate: 'GPU' | 'CPU' | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  telemetryRef: React.RefObject<Telemetry>;
}) {
  // Sampled rather than read during render: a ref holds no render-triggering value, and
  // the track dimensions only exist once frames start arriving.
  const [track, setTrack] = useState('no frames');
  const [signals, setSignals] = useState<Telemetry | null>(null);

  // The expression numbers are the point of this panel. Thresholds set by intuition were
  // roughly twice what a real smiling face produces, so they are tuned against this.
  useEffect(() => {
    const id = setInterval(() => {
      const video = videoRef.current;
      setTrack(video?.videoWidth ? `${video.videoWidth}×${video.videoHeight}` : 'no frames');
      setSignals({ ...telemetryRef.current });
    }, 200);
    return () => clearInterval(id);
  }, [videoRef, telemetryRef]);

  return (
    <dl className="hero__debug">
      <dt>state</dt>
      <dd>{state}</dd>
      <dt>failure</dt>
      <dd>{failure ?? '—'}</dd>
      <dt>track</dt>
      <dd>{track}</dd>
      <dt>delegate</dt>
      <dd>{delegate ?? 'loading'}</dd>
      <dt>tier</dt>
      <dd>{signals?.tier ?? '—'}</dd>
      <dt>exposure</dt>
      <dd>
        {signals ? `gain ${signals.gain.toFixed(2)} · luma ${signals.luma.toFixed(2)}` : '—'}
      </dd>
      <dt>particles</dt>
      <dd>{signals?.particles ?? '—'}</dd>
    </dl>
  );
}
