/**
 * ChatMessage.tsx
 * Renders a single chat message with markdown, code highlighting,
 * emoji reactions, sound effects, and export support.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Copy, Check, Download, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { Message } from '@/types/chat';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ── Reaction system ──────────────────────────────────────────────────────────
type ReactionEmoji = '🔥' | '💯' | '🧠' | '💀' | '❤️';
const REACTIONS: ReactionEmoji[] = ['🔥', '💯', '🧠', '💀', '❤️'];
const STORAGE_KEY = 'mockj_reactions';

type ReactionCounts = Partial<Record<ReactionEmoji, number>>;
type ReactionStore = Record<string, ReactionCounts>;

function getMessageReactions(msgId: string): { counts: ReactionCounts; mine: ReactionEmoji | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { counts: {}, mine: null };
    const all: ReactionStore = JSON.parse(raw);
    const mineKey = `${STORAGE_KEY}_mine`;
    const mineRaw = localStorage.getItem(mineKey);
    const mineAll: Record<string, ReactionEmoji> = mineRaw ? JSON.parse(mineRaw) : {};
    return { counts: all[msgId] ?? {}, mine: mineAll[msgId] ?? null };
  } catch {
    return { counts: {}, mine: null };
  }
}

function toggleReaction(msgId: string, emoji: ReactionEmoji): { counts: ReactionCounts; mine: ReactionEmoji | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const all: ReactionStore = raw ? JSON.parse(raw) : {};
    const mineKey = `${STORAGE_KEY}_mine`;
    const mineRaw = localStorage.getItem(mineKey);
    const mineAll: Record<string, ReactionEmoji> = mineRaw ? JSON.parse(mineRaw) : {};

    const counts: ReactionCounts = { ...(all[msgId] ?? {}) };
    const current = mineAll[msgId];

    if (current === emoji) {
      // Remove reaction
      counts[emoji] = Math.max(0, (counts[emoji] ?? 1) - 1);
      if (!counts[emoji]) delete counts[emoji];
      delete mineAll[msgId];
    } else {
      // Switch or add reaction
      if (current) {
        counts[current] = Math.max(0, (counts[current] ?? 1) - 1);
        if (!counts[current]) delete counts[current];
      }
      counts[emoji] = (counts[emoji] ?? 0) + 1;
      mineAll[msgId] = emoji;
    }

    all[msgId] = counts;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    localStorage.setItem(mineKey, JSON.stringify(mineAll));
    return { counts, mine: mineAll[msgId] ?? null };
  } catch {
    return { counts: {}, mine: null };
  }
}

// ── Sound effects ─────────────────────────────────────────────────────────────
function playSoundEffect(type: 'copy' | 'reaction' | 'send') {
  try {
    const soundEnabled = localStorage.getItem('mockj_sound_enabled') !== 'false';
    if (!soundEnabled) return;
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    if (type === 'copy') {
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      oscillator.frequency.setValueAtTime(1100, ctx.currentTime + 0.05);
      gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.15);
    } else if (type === 'reaction') {
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(660, ctx.currentTime);
      oscillator.frequency.setValueAtTime(880, ctx.currentTime + 0.08);
      gainNode.gain.setValueAtTime(0.08, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.2);
    } else if (type === 'send') {
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(440, ctx.currentTime);
      oscillator.frequency.setValueAtTime(550, ctx.currentTime + 0.06);
      gainNode.gain.setValueAtTime(0.07, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.18);
    }
  } catch {
    // Audio context may not be available in all environments
  }
}

// ── Markdown renderer (minimal) ───────────────────────────────────────────────
function renderMarkdown(text: string): string {
  return text
    // Code blocks
    .replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) => {
      const escaped = code.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<pre class="code-block" data-lang="${lang ?? 'code'}"><code>${escaped}</code></pre>`;
    })
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bullet lists
    .replace(/^[•\-\*] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]+?<\/li>)/g, (match) => `<ul>${match}</ul>`)
    // Numbered lists
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // Horizontal rule
    .replace(/^---$/gm, '<hr />')
    // Line breaks
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br />')
    // Wrap in paragraph
    .replace(/^(?!<[hpuol])(.+)/, '<p>$1')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

// Strip [VERIFY] block from display text
function stripVerifyBlock(content: string): { text: string; sources: { label: string; url: string }[] } {
  const verifyMatch = content.match(/\[VERIFY\](\{.*?\})\s*$/s);
  if (!verifyMatch) return { text: content, sources: [] };
  try {
    const parsed = JSON.parse(verifyMatch[1]);
    const sources: { label: string; url: string }[] = parsed.sources ?? [];
    const text = content.replace(/\[VERIFY\]\{.*?\}\s*$/s, '').trim();
    return { text, sources };
  } catch {
    return { text: content.replace(/\[VERIFY\].*$/s, '').trim(), sources: [] };
  }
}

// ── Colors ────────────────────────────────────────────────────────────────────
const GREEN = 'hsl(142 70% 55%)';
const RED   = 'hsl(4 90% 58%)';

// ── Read receipt tick mark ────────────────────────────────────────────────────
function ReadTick({ state }: { state: 'sent' | 'delivered' | 'read' }) {
  return (
    <span className="inline-flex items-center gap-[1px] ml-1" title={state}>
      {/* First tick */}
      <svg width="11" height="8" viewBox="0 0 11 8" fill="none">
        <path
          d="M1 4L3.5 6.5L9.5 1"
          stroke={state === 'read' ? GREEN : 'rgba(160,180,220,0.4)'}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {/* Second tick — only for delivered/read */}
      {(state === 'delivered' || state === 'read') && (
        <svg width="11" height="8" viewBox="0 0 11 8" fill="none" style={{ marginLeft: -5 }}>
          <path
            d="M1 4L3.5 6.5L9.5 1"
            stroke={state === 'read' ? GREEN : 'rgba(160,180,220,0.4)'}
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface ChatMessageProps {
  message: Message;
  isLast?: boolean;
  onReact?: (msgId: string, emoji: string) => void;
  // tick state: 'sent' | 'delivered' | 'read'. Delivered when AI starts typing, read when AI responds
  tickState?: 'sent' | 'delivered' | 'read';
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ChatMessage({ message, isLast, tickState = 'sent' }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const isStreaming = message.streaming ?? false;

  // Reactions
  const [reactionState, setReactionState] = useState(() => getMessageReactions(message.id));
  const [showReactions, setShowReactions] = useState(false);
  const reactionRef = useRef<HTMLDivElement>(null);

  // Copy state
  const [copied, setCopied] = useState(false);

  // Collapse long messages
  const [collapsed, setCollapsed] = useState(false);
  const [isLong, setIsLong] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (contentRef.current && contentRef.current.scrollHeight > 600) {
      setIsLong(true);
      setCollapsed(true);
    }
  }, [message.content]);

  // Close reaction picker on outside click
  useEffect(() => {
    if (!showReactions) return;
    const handler = (e: MouseEvent) => {
      if (reactionRef.current && !reactionRef.current.contains(e.target as Node)) {
        setShowReactions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showReactions]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    playSoundEffect('copy');
    toast.success('Copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  }, [message.content]);

  const handleReact = useCallback((emoji: ReactionEmoji) => {
    const next = toggleReaction(message.id, emoji);
    setReactionState(next);
    playSoundEffect('reaction');
    setShowReactions(false);
  }, [message.id]);

  const handleExport = useCallback(() => {
    const blob = new Blob([message.content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mockj-response-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported as Markdown');
  }, [message.content]);

  // Parse verify sources + display text
  const { text: displayText, sources } = stripVerifyBlock(message.content);

  // Render content based on message type
  if (message.type === 'image' && message.mediaUrl) {
    return (
      <div className={cn('flex gap-3 px-4 py-3', isUser ? 'justify-end' : 'justify-start')}>
        <div className="max-w-sm">
          <img
            src={message.mediaUrl}
            alt={message.mediaPrompt ?? 'Generated image'}
            className="rounded-2xl border border-white/10 max-w-full shadow-lg"
            style={{ maxHeight: '400px', objectFit: 'cover' }}
          />
          {message.mediaPrompt && (
            <p className="text-xs mt-1.5 px-1" style={{ color: 'rgba(160,180,220,0.5)' }}>
              "{message.mediaPrompt}"
            </p>
          )}
        </div>
      </div>
    );
  }

  if (message.type === 'video' && message.mediaUrl) {
    return (
      <div className={cn('flex gap-3 px-4 py-3', isUser ? 'justify-end' : 'justify-start')}>
        <div className="max-w-sm">
          <video
            src={message.mediaUrl}
            controls
            className="rounded-2xl border border-white/10 max-w-full shadow-lg"
            style={{ maxHeight: '360px' }}
          />
          {message.mediaPrompt && (
            <p className="text-xs mt-1.5 px-1" style={{ color: 'rgba(160,180,220,0.5)' }}>
              "{message.mediaPrompt}"
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'group flex gap-3 px-4 py-2 transition-all duration-200',
        isUser ? 'justify-end' : 'justify-start',
        isLast && !isStreaming && 'animate-fade-in'
      )}
    >
      {/* Avatar — AI only */}
      {!isUser && (
        <div className="shrink-0 w-7 h-7 rounded-xl overflow-hidden mt-1"
          style={{ border: `1.5px solid ${GREEN}66`, boxShadow: `0 0 10px ${GREEN}33` }}>
          <img src="/mockj-icon.png" alt="MockJ" className="w-full h-full object-cover object-top" />
        </div>
      )}

      <div className={cn('flex flex-col max-w-[85%] lg:max-w-[75%]', isUser ? 'items-end' : 'items-start')}>

        {/* Bubble */}
        <div
          className="relative rounded-2xl px-4 py-3 text-sm leading-relaxed"
          style={isUser ? {
            background: `linear-gradient(135deg, hsl(142 70% 22%), hsl(142 70% 16%))`,
            border: `1px solid ${GREEN}44`,
            color: '#e8f5ec',
            borderBottomRightRadius: '6px',
          } : {
            background: 'rgba(10, 18, 12, 0.85)',
            border: '1px solid rgba(255,255,255,0.07)',
            color: 'rgba(220, 235, 225, 0.92)',
            borderBottomLeftRadius: '6px',
          }}
        >
          {/* User avatar (right side) */}
          {isUser && message.userAvatar && (
            <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full overflow-hidden border border-white/20">
              <img src={message.userAvatar} alt="You" className="w-full h-full object-cover" />
            </div>
          )}

          {/* Content */}
          <div
            ref={contentRef}
            className={cn(
              'prose-sm max-w-none overflow-hidden transition-all duration-300',
              collapsed && isLong ? 'max-h-72' : ''
            )}
            style={{ maskImage: collapsed && isLong ? 'linear-gradient(to bottom, black 60%, transparent 100%)' : 'none' }}
          >
            {isStreaming ? (
              <div className="whitespace-pre-wrap break-words">
                {displayText}
                <span className="inline-block w-1.5 h-4 ml-0.5 rounded-sm animate-pulse" style={{ background: GREEN, verticalAlign: 'text-bottom' }} />
              </div>
            ) : (
              <div
                className="chat-markdown whitespace-pre-wrap break-words"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(displayText) }}
              />
            )}
          </div>

          {/* Collapse toggle */}
          {isLong && !isStreaming && (
            <button
              onClick={() => setCollapsed(v => !v)}
              className="mt-2 flex items-center gap-1 text-xs font-semibold transition-colors"
              style={{ color: GREEN }}
            >
              {collapsed ? <><ChevronDown className="w-3 h-3" /> Show more</> : <><ChevronUp className="w-3 h-3" /> Show less</>}
            </button>
          )}
        </div>

        {/* Verify sources */}
        {sources.length > 0 && !isStreaming && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {sources.map(s => (
              <a
                key={s.url}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors hover:opacity-80"
                style={{ background: 'rgba(100,120,200,0.1)', border: '1px solid rgba(100,120,200,0.2)', color: 'rgba(160,180,240,0.75)' }}
              >
                <ExternalLink className="w-2.5 h-2.5" />
                {s.label}
              </a>
            ))}
          </div>
        )}

        {/* Reaction counts */}
        {Object.keys(reactionState.counts).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {REACTIONS.filter(e => (reactionState.counts[e] ?? 0) > 0).map(e => (
              <button
                key={e}
                onClick={() => handleReact(e)}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-all"
                style={{
                  background: reactionState.mine === e ? `${GREEN}22` : 'rgba(255,255,255,0.06)',
                  border: `1px solid ${reactionState.mine === e ? `${GREEN}66` : 'rgba(255,255,255,0.1)'}`,
                }}
              >
                <span>{e}</span>
                <span className="text-[10px] font-bold" style={{ color: reactionState.mine === e ? GREEN : 'rgba(160,180,220,0.6)' }}>
                  {reactionState.counts[e]}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Action row */}
        {!isUser && !isStreaming && (
          <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200" ref={reactionRef}>

            {/* Emoji picker trigger */}
            <div className="relative">
              <button
                onClick={() => setShowReactions(v => !v)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-xs transition-all"
                style={{ color: 'rgba(160,180,220,0.5)', background: showReactions ? 'rgba(255,255,255,0.08)' : 'transparent' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.07)'; }}
                onMouseLeave={e => { if (!showReactions) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                title="React"
              >
                😊
              </button>
              {showReactions && (
                <div
                  className="absolute bottom-8 left-0 flex gap-1 p-2 rounded-2xl z-20 shadow-2xl"
                  style={{ background: 'hsl(224 20% 8%)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
                >
                  {REACTIONS.map(e => (
                    <button
                      key={e}
                      onClick={() => handleReact(e)}
                      className="w-8 h-8 flex items-center justify-center rounded-xl text-base transition-all hover:scale-125"
                      style={{ background: reactionState.mine === e ? `${GREEN}20` : 'transparent' }}
                      title={e}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Copy */}
            <button
              onClick={handleCopy}
              className="w-7 h-7 flex items-center justify-center rounded-lg transition-all"
              style={{ color: copied ? GREEN : 'rgba(160,180,220,0.5)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.07)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
              title="Copy"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </button>

            {/* Export markdown */}
            <button
              onClick={handleExport}
              className="w-7 h-7 flex items-center justify-center rounded-lg transition-all"
              style={{ color: 'rgba(160,180,220,0.5)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.07)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
              title="Export as Markdown"
            >
              <Download className="w-3.5 h-3.5" />
            </button>

          </div>
        )}

        {/* Timestamp + read tick */}
        <span className="flex items-center gap-0.5 text-[10px] mt-1 px-1 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'rgba(120,140,160,0.5)' }}>
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          {isUser && !message.streaming && <ReadTick state={tickState} />}
        </span>
      </div>

      {/* Avatar — user only */}
      {isUser && !message.userAvatar && (
        <div className="shrink-0 w-7 h-7 rounded-xl flex items-center justify-center mt-1 text-xs font-black"
          style={{ background: `linear-gradient(135deg, ${RED}, hsl(20 90% 55%))`, color: '#fff', border: `1px solid ${RED}66` }}>
          U
        </div>
      )}
    </div>
  );
}
