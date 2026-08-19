import { useCallback, useEffect, useRef, useState } from 'react';
import type { ArtMode } from '@/content/art-modes';
import { encodePrint, renderPortrait, toBlob } from '@/engine/capture/capture-renderer';
import { canShareImage, downloadBlob, shareImage } from '@/engine/capture/download';
import { preloadStickers } from '@/engine/capture/stickers';
import type { SceneAnalysis } from '@/engine/render/exposure';
import { count } from '@/engine/metrics/count';
import type { FaceState } from '@/engine/vision/types';
import { CAPTURE_FILENAME, PRINT_FILENAME_WEBP, SHARE_FILENAME } from '@/content/copy';

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
  const printRef = useRef<Blob | null>(null);
  const cardRef = useRef<Blob | null>(null);
  const flashRef = useRef(0);

  // Decoded ahead of the shutter, so pressing it never waits on a network round trip.
  useEffect(() => preloadStickers(), []);

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
          const portrait = await renderPortrait({
            video: source.video!,
            face: source.face,
            mode: source.mode,
            scene: source.scene,
            aspect: source.aspect,
            sessionSeed: source.sessionSeed,
            reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
          });

          // Download keeps its alpha; the share card does not need any.
          const [print, card] = await Promise.all([
            encodePrint(portrait.print),
            toBlob(portrait.card, 'image/jpeg', 0.92),
          ]);
          if (!print) {
            onStateChange('failed');
            return;
          }

          printRef.current = print;
          cardRef.current = card;
          setShareable(card ? canShareImage(card, SHARE_FILENAME) : false);
          setPreview((old) => {
            if (old) URL.revokeObjectURL(old);
            return URL.createObjectURL(print);
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
    if (!printRef.current) return;
    // Extension follows what the browser actually encoded.
    const name = printRef.current.type === 'image/webp' ? PRINT_FILENAME_WEBP : CAPTURE_FILENAME;
    downloadBlob(printRef.current, name);
    count('portrait_saved');
  }, []);

  // Sharing sends the card, not the cut-out: a transparent PNG dropped into a feed gets
  // composited onto whatever that app uses as a background, usually white.
  const share = useCallback(() => {
    const blob = cardRef.current;
    if (!blob) return;
    void shareImage(blob, SHARE_FILENAME).then((shared) => {
      if (shared) count('portrait_saved');
    });
  }, []);

  const dismiss = useCallback(() => {
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
    printRef.current = null;
    cardRef.current = null;
    onStateChange('dismiss');
  }, [onStateChange]);

  return { preview, busy, shareable, flashRef, capture, save, share, dismiss };
}
