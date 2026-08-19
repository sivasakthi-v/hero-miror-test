import { CAPTURE_FILENAME } from '@/content/copy';

/**
 * Getting the picture off the page and onto the visitor's device.
 *
 * Everything here is local: a blob made from a canvas, handed to the browser. The image
 * is never uploaded, which is what keeps the promise on the intro screen literally true
 * rather than nearly true.
 */

export function downloadBlob(blob: Blob, filename = CAPTURE_FILENAME): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoked on the next tick rather than immediately: some browsers have not finished
  // reading the blob when click() returns, and revoking too early gives a failed save.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function canShareImage(blob: Blob, filename = CAPTURE_FILENAME): boolean {
  if (typeof navigator.canShare !== 'function' || typeof navigator.share !== 'function') {
    return false;
  }
  try {
    return navigator.canShare({ files: [new File([blob], filename, { type: blob.type })] });
  } catch {
    return false;
  }
}

/**
 * The share sheet, where the platform has one (DECISIONS.md D8). This is how the portrait
 * reaches Instagram or WhatsApp with Siva's name already inside the image.
 *
 * Returns false if the visitor dismissed the sheet, so the caller can leave the save
 * button in place rather than pretending something happened.
 */
export async function shareImage(blob: Blob, filename = CAPTURE_FILENAME): Promise<boolean> {
  if (!canShareImage(blob, filename)) return false;
  try {
    await navigator.share({
      files: [new File([blob], filename, { type: blob.type })],
      title: 'You by Siva Serafino',
    });
    return true;
  } catch {
    // AbortError when dismissed; anything else is a platform refusing. Both mean "no".
    return false;
  }
}
