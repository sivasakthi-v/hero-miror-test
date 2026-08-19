/**
 * Every visitor-facing string lives here (docs/PLAN.md §7, DECISIONS.md D11).
 * Components never contain literal copy, so the whole voice can be rewritten
 * in one file without opening a single component.
 *
 * Text is the blueprint's §81 copy system, verbatim.
 */

/**
 * The line printed on the polaroid, in place of a signature.
 *
 * Structure is fixed name + verb + message, so the voice stays consistent while the
 * message never repeats for the same visitor. Each is short enough to set on one line
 * inside the frame, which is a hard constraint rather than a style preference: the band
 * is only so wide, and a caption that overflows the print ruins the object.
 *
 * Tone: warm, specific, a little funny, never saccharine. The test for each is whether
 * a stranger would smile at it and not feel sold to.
 */
export const CAPTION_NAME = 'Siva' as const;

export interface Caption {
  verb: string;
  message: string;
}

export const CAPTIONS: Caption[] = [
  { verb: 'thinks', message: "you're cool" },
  { verb: 'hopes', message: "today's kind to you" },
  { verb: 'knows', message: "you've got this" },
  { verb: 'bets', message: "you made someone's day" },
  { verb: 'says', message: 'you look great today' },
  { verb: 'reckons', message: "you're doing better than you think" },
  { verb: 'hopes', message: 'you feel proud of you' },
  { verb: 'thinks', message: "the world's luckier with you here" },
  { verb: 'wishes', message: 'you a ridiculously good day' },
  { verb: 'swears', message: 'that smile suits you' },
  { verb: 'says', message: 'take the compliment' },
  { verb: 'knows', message: "you're someone's favourite person" },
  { verb: 'hopes', message: 'you go easy on yourself today' },
  { verb: 'thinks', message: "you're doing great, actually" },
  { verb: 'bets', message: "you're braver than yesterday" },
  { verb: 'says', message: 'you deserve the good stuff' },
  { verb: 'hopes', message: 'something lovely finds you today' },
  { verb: 'knows', message: 'you were worth the wait' },
  { verb: 'thinks', message: 'you should call your people' },
  { verb: 'says', message: 'drink some water, legend' },
  { verb: 'reckons', message: "today's got your name on it" },
  { verb: 'hopes', message: 'you laugh far too loudly today' },
  { verb: 'thinks', message: "you're exactly enough" },
  { verb: 'says', message: 'keep going, it suits you' },
  { verb: 'knows', message: "you'll be just fine" },
];

export function captionText(caption: Caption): string {
  return `${CAPTION_NAME} ${caption.verb} ${caption.message}`;
}

export function pickCaption(random: () => number = Math.random): Caption {
  const index = Math.min(CAPTIONS.length - 1, Math.floor(random() * CAPTIONS.length));
  return CAPTIONS[index] ?? CAPTIONS[0]!;
}
export const CAPTURE_FILENAME = 'you-by-siva-serafino.png' as const;
export const PRINT_FILENAME_WEBP = 'you-by-siva-serafino.webp' as const;
export const SHARE_FILENAME = 'you-by-siva-serafino-share.jpg' as const;

export const intro = {
  title: 'There you are.',
  action: 'TRY CAM',
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
  // Short on purpose. The picture is the message; anything longer competes with it.
  done: 'Happy you stopped by',
  thanks:
    'Here’s a tiny piece of me, just for you. A souvenir for wanting to know the person behind the screen. Take it with you and don’t forget me along the way.',
  save: 'DOWNLOAD',
  share: 'SHARE',
  again: 'TAKE ANOTHER',
  failed: 'that one got away. try again?',
} as const;

/** Placeholder shell for the real portfolio this hero will be dropped into. */
export const nav = {
  wordmark: 'Siva Sakthi',
  links: ['Home', 'Works', 'About', 'Playground', 'Resume'],
  cta: 'GET IN TOUCH',
  email: 'sivavenkat372@gmail.com',
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
