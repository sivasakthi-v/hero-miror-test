/**
 * Every visitor-facing string lives here (docs/PLAN.md §7, DECISIONS.md D11).
 * Components never contain literal copy, so the whole voice can be rewritten
 * in one file without opening a single component.
 *
 * Text is the blueprint's §81 copy system, verbatim.
 */

export const SIGNATURE = 'You by Siva Serafino · 2026' as const;
export const CAPTURE_FILENAME = 'you-by-siva-serafino.jpg' as const;

export const intro = {
  title: 'There you are.',
  body: ['I made this portfolio', 'a little differently.', '', 'Turn on your camera', 'and look around.'],
  action: "LET'S BEGIN",
  /**
   * Precise by construction (docs/PLAN.md R6). The model and WASM are self-hosted and
   * there is no analytics script — but there IS an anonymous counter (DECISIONS.md D13),
   * so the blanket "nothing is uploaded" would be a lie. Hence the second line.
   * If the counter is ever removed, remove `privacyNote` with it.
   */
  privacy: 'Camera processing happens in your browser. Your camera feed is never uploaded.',
  privacyNote: 'The only thing I collect is an anonymous count of how many people tried this.',
} as const;

export const permission = {
  requesting: 'look up — your browser is asking.',
  hint: 'choose Allow, and I can start drawing.',
} as const;

export const live = {
  firstDetection: 'oh, there you are.',
  stabilised: 'you look beautiful.',
  firstMovement: 'look at you go.',
  smile: 'keep that one.',
  bigSmile: 'YES.',
  lookingAway: "where'd you go?",
  noFace: 'come back :)',
  loading: 'one moment — getting my pencils.',
} as const;

export const capture = {
  prompt: 'make it yours.',
  action: 'CAPTURE',
  actionLabel: 'Capture portrait',
  done: 'one little portrait, yours to keep.',
  save: 'SAVE PORTRAIT',
  share: 'SHARE',
  failed: 'that one got away. try again?',
} as const;

export const identity = {
  name: 'SIVA SERAFINO',
  role: 'UI/UX DESIGNER',
  disciplines: 'Products · Systems · AI',
  statement: 'I design digital experiences that make complex technology feel human.',
  nav: ['WORK', 'ABOUT', 'EXPERIMENTS'],
} as const;

/** Fallbacks. Every one of these must offer a way onward — never a dead end. */
export const fallback = {
  denied: {
    title: 'No worries.',
    body: ['You can still explore.', '', 'The camera part is optional.', "The work isn't."],
    action: 'EXPLORE WORK',
    retry: 'ACTUALLY, LET ME TRY AGAIN',
  },
  noDevice: {
    title: 'No camera here.',
    body: ["That's okay.", '', "I'll show you the", 'rest of the experiment instead.'],
    action: 'EXPLORE',
  },
  inAppBrowser: {
    title: 'Almost.',
    body: ['This app’s built-in browser', "won't share a camera.", '', 'Open this in your browser', 'and I can show you properly.'],
    action: 'EXPLORE ANYWAY',
  },
  unsupported: {
    title: 'Your browser sat this one out.',
    body: ["That's okay.", 'The work is all still here.'],
    action: 'EXPLORE',
  },
  inUse: {
    title: 'Something else has the camera.',
    body: ['Another app is using it —', 'a call, maybe.', '', 'Close that and try again.'],
    action: 'EXPLORE ANYWAY',
    retry: 'TRY AGAIN',
  },
  insecure: {
    title: 'This page needs a padlock.',
    body: ['Cameras only work over https.', 'Nothing personal.'],
    action: 'EXPLORE',
  },
  unknown: {
    title: 'That did not go to plan.',
    body: ['The camera did not open,', 'and I cannot tell you why.', '', 'The work is still here.'],
    action: 'EXPLORE WORK',
    retry: 'TRY AGAIN',
  },
} as const;

/** Maps a machine failure reason to the screen the visitor should see. */
export function fallbackFor(reason: string | null) {
  switch (reason) {
    case 'denied':
      return fallback.denied;
    case 'no_device':
      return fallback.noDevice;
    case 'in_app_browser':
      return fallback.inAppBrowser;
    case 'in_use':
    case 'lost':
      return fallback.inUse;
    case 'insecure_context':
      return fallback.insecure;
    default:
      return fallback.unknown;
  }
}

/** Ambient lines used by the graffiti system (blueprint §37). */
export const ambient = [
  'GOOD MORNING',
  'THERE YOU ARE',
  'YOU LOOK BEAUTIFUL',
  'YOU GOT THIS',
  'KEEP GOING',
  'LOOK AT YOU',
  'BEST VERSION OF YOU',
  "LET'S MAKE TODAY GOOD",
  'ONE GOOD THING AT A TIME',
] as const;
