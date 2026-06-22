/**
 * useNotifications — Web Notifications API for MockJ
 * Handles permission requests and fires subtle browser notifications.
 * Used for: Auto-Speak completion, video generation completion.
 */

const ICON = '/favicon.ico';
const BADGE = '/favicon.ico';
const TAG_SPEAK = 'mockj-autospeak';
const TAG_VIDEO = 'mockj-video';

/** Request notification permission. Returns true if granted. */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

/** Returns true if notifications are supported and granted */
export function notificationsEnabled(): boolean {
  return 'Notification' in window && Notification.permission === 'granted';
}

/**
 * Fire a notification when Auto-Speak finishes reading a response.
 * @param text - The full text that was spoken; we extract the first sentence.
 */
export function notifyAutoSpeakDone(text: string): void {
  if (!notificationsEnabled()) return;

  // Extract first sentence (up to 120 chars)
  const first = extractFirstSentence(text);

  try {
    const n = new Notification('MockJ finished speaking', {
      body: first,
      icon: ICON,
      badge: BADGE,
      tag: TAG_SPEAK,     // replaces any previous speak notification
      silent: true,        // no sound — it's a subtle indicator
      requireInteraction: false,
    });

    // Auto-close after 4 seconds
    setTimeout(() => n.close(), 4000);
  } catch {
    // Non-fatal — some browsers restrict Notification constructor
  }
}

/**
 * Fire a notification when a video finishes generating.
 * @param prompt - The prompt used to generate the video.
 */
export function notifyVideoDone(prompt: string): void {
  if (!notificationsEnabled()) return;

  const preview = prompt.length > 80 ? `${prompt.slice(0, 80)}…` : prompt;

  try {
    const n = new Notification('Your MockJ video is ready! 🎬', {
      body: `"${preview}"`,
      icon: ICON,
      badge: BADGE,
      tag: TAG_VIDEO,
      silent: false,        // allow sound — user may have navigated away
      requireInteraction: true, // keep visible until user dismisses
    });

    // Clicking the notification brings user back to MockJ
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    // Non-fatal
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractFirstSentence(text: string): string {
  // Strip markdown-style formatting
  const clean = text
    .replace(/<[^>]+>/g, '')            // HTML tags
    .replace(/\*\*(.*?)\*\*/g, '$1')    // bold
    .replace(/`[^`]*`/g, '')            // inline code
    .replace(/#{1,6}\s/g, '')           // headings
    .trim();

  // Find first sentence boundary
  const match = clean.match(/^[^.!?\n]{1,150}[.!?]/);
  const sentence = match ? match[0] : clean.slice(0, 120);
  return sentence.length > 120 ? `${sentence.slice(0, 117)}…` : sentence;
}
