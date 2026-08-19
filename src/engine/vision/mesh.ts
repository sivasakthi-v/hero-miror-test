/**
 * The face oval, as index pairs into the 478-point mesh.
 *
 * This is a copy of MediaPipe's `FaceLandmarker.FACE_LANDMARKS_FACE_OVAL`, held here on
 * purpose. Importing `FaceLandmarker` on the main thread to read one constant array
 * pulled the entire vision runtime into the main bundle — 48kB gzipped, for 36 pairs of
 * numbers — when the runtime's whole point is that it lives in a worker.
 *
 * `mesh.test.ts` asserts this stays identical to the library's own list, so it cannot
 * drift silently after an upgrade.
 */
export const FACE_OVAL: readonly (readonly [number, number])[] = [
  [10, 338],
  [338, 297],
  [297, 332],
  [332, 284],
  [284, 251],
  [251, 389],
  [389, 356],
  [356, 454],
  [454, 323],
  [323, 361],
  [361, 288],
  [288, 397],
  [397, 365],
  [365, 379],
  [379, 378],
  [378, 400],
  [400, 377],
  [377, 152],
  [152, 148],
  [148, 176],
  [176, 149],
  [149, 150],
  [150, 136],
  [136, 172],
  [172, 58],
  [58, 132],
  [132, 93],
  [93, 234],
  [234, 127],
  [127, 162],
  [162, 21],
  [21, 54],
  [54, 103],
  [103, 67],
  [67, 109],
  [109, 10],
] as const;

/** The full face mesh size, used to sanity-check a result before we trust it. */
export const FACE_MESH_POINTS = 478;
