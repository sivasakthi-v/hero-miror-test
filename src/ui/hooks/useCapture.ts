import { useCallback, useEffect, useRef, useState } from 'react';
import type { ArtMode } from '@/content/art-modes';
import { renderPortrait, toImageBlob } from '@/engine/capture/capture-renderer';
import { canShareImage, downloadBlob, shareImage } from '@/engine/capture/download';
import type { SceneAnalysis } from '@/engine/render/exposure';
import { count } from '@/engine/metrics/count';
import type { FaceState } from '@/engine/vision/types';

/**
 * The shutter.
 *
 * The camera is deliberately left running through all of this (blueprint §23): the
 * visitor should be able to take another one without asking permission again, and a
 * frozen preview over a dead camera feels like the experience ended.
 */

export interface CaptureSource {
  video: HTMLVideoElement | null;
  face: FaceState;
  mode: ArtMode;
  scene: SceneAnalysis;
  aspect: number;
  sessionSeed: number;
}

export interface UseCapture {
  /** Object URL of the developed portrait, or null while there is nothing to show. */
  preview: string | null;
  busy: boolean;
  /** Whether the platform can hand the file to another app. */
  shareable: boolean;
  /** 0..1 exposure flash, driven by the shutter. */
  flashRef: React.RefObject<number>;
  capture: () => void;
  save: () => void;
  share: () => void;
  dismiss: () => void;
}

export function useCapture(
  getSource: () => CaptureSource,
  onStateChange: (event: 'start' | 'done' | 'failed' | 'dismiss') => void,
): UseCapture {
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shareable, setShareable] = useState(false);
  const blobRef = useRef<Blob | null>(null);
  const flashRef = useRef(0);

  // Object URLs are a leak if they outlive their preview, and a capture session can
  // produce several.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const capture = useCallback(() => {
    const source = getSource();
    if (!source.video || busy) return;

    setBusy(true);
    onStateChange('start');
    flashRef.current = 1;

    // Rendering the poster is synchronous and takes a few tens of milliseconds at print
    // size. Deferring a frame lets the flash paint first, so the shutter feels like a
    // shutter rather than a stutter.
    requestAnimationFrame(() => {
      void (async () => {
        try {
          const portrait = renderPortrait({
            video: source.video!,
            face: source.face,
            mode: source.mode,
            scene: source.scene,
            aspect: source.aspect,
            sessionSeed: source.sessionSeed,
            reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
          });

          const blob = await toImageBlob(portrait.canvas);
          if (!blob) {
            onStateChange('failed');
            return;
          }

          blobRef.current = blob;
          setShareable(canShareImage(blob));
          setPreview((old) => {
            if (old) URL.revokeObjectURL(old);
            return URL.createObjectURL(blob);
          });
          onStateChange('done');
        } catch {
          onStateChange('failed');
        } finally {
          setBusy(false);
        }
      })();
    });
  }, [busy, getSource, onStateChange]);

  const save = useCallback(() => {
    if (!blobRef.current) return;
    downloadBlob(blobRef.current);
    count('portrait_saved');
  }, []);

  const share = useCallback(() => {
    const blob = blobRef.current;
    if (!blob) return;
    void shareImage(blob).then((shared) => {
      if (shared) count('portrait_saved');
    });
  }, []);

  const dismiss = useCallback(() => {
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
    blobRef.current = null;
    onStateChange('dismiss');
  }, [onStateChange]);

  return { preview, busy, shareable, flashRef, capture, save, share, dismiss };
}
