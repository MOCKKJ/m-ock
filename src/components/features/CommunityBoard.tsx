/**
 * CommunityBoard.tsx — MockJ Live Community
 * Real-time social hub with 5s polling, reactions, sparkle ambience, animated post arrival
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import React from 'react';
import {
  Users, RefreshCw, Send, ThumbsUp, ThumbsDown, MessageCircle,
  ChevronDown, Lightbulb, Bug, MessageSquare, Link, Download,
  FileText, Code2, Megaphone, Image, Loader2, CheckCircle2,
  Clock, X, Bookmark, Share2, Flag, Pin, Sparkles, Flame,
  TrendingUp, Zap, Crown, Star, ExternalLink, Paperclip, Globe,
  AlertTriangle, Search, Filter, Radio,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

// ── Types ──────────────────────────────────────────────────────────────────────
type PostType = 'feedback' | 'bug' | 'feature' | 'resource' | 'prompt_pack' | 'ui_inspiration' | 'code_snippet' | 'download' | 'link_share' | 'announcement';
type PostStatus = 'open' | 'planned' | 'in_progress' | 'fixed' | 'rejected';
type ReactionType = 'fire' | 'genius' | 'bug' | 'fixed' | 'need_this' | 'approved' | 'love';
type FilterType = 'all' | 'bug' | 'feature' | 'feedback' | 'download' | 'link_share' | 'announcement' | 'fixed';

interface DBPost {
  id: string; user_id: string | null; author_name: string | null; type: PostType;
  title: string; body: string; status: PostStatus; upvotes: number; downvotes: number;
  comment_count: number; created_at: string; pinned: boolean; featured: boolean;
  link_url: string | null; myVote?: 'up' | 'down' | null; myBookmark?: boolean;
  reactions?: Record<ReactionType, number>; myReaction?: ReactionType | null;
}
interface DBComment { id: string; author_name: string | null; body: string; created_at: string; }
interface DBFile { id: string; file_url: string; file_name: string; file_type: string | null; size_bytes: number; download_count: number; safety_status: string; }

// ── Config ─────────────────────────────────────────────────────────────────────
const GREEN  = 'hsl(142 70% 55%)';
const VIOLET = 'hsl(265 80% 65%)';
const CYAN   = 'hsl(191 97% 55%)';
const GOLD   = 'hsl(38 95% 60%)';
const RED    = 'hsl(4 90% 58%)';
const PINK   = 'hsl(310 80% 65%)';

const POST_TYPE_CONFIG: Record<PostType, { icon: typeof Lightbulb; color: string; bg: string; label: string }> = {
  feedback:       { icon: MessageSquare, color: VIOLET,  bg: 'hsl(265 80% 65% / 0.1)',  label: 'Feedback' },
  bug:            { icon: Bug,           color: RED,     bg: 'hsl(4 90% 58% / 0.1)',    label: 'Bug Report' },
  feature:        { icon: Lightbulb,     color: CYAN,    bg: 'hsl(191 97% 55% / 0.1)',  label: 'Feature' },
  resource:       { icon: FileText,      color: GREEN,   bg: 'hsl(142 70% 55% / 0.1)',  label: 'Resource' },
  prompt_pack:    { icon: Sparkles,      color: GOLD,    bg: 'hsl(38 95% 60% / 0.1)',   label: 'Prompt Pack' },
  ui_inspiration: { icon: Image,         color: PINK,    bg: 'hsl(310 80% 65% / 0.1)',  label: 'UI Inspo' },
  code_snippet:   { icon: Code2,         color: CYAN,    bg: 'hsl(191 97% 55% / 0.1)',  label: 'Code' },
  download:       { icon: Download,      color: GREEN,   bg: 'hsl(142 70% 55% / 0.1)',  label: 'Download' },
  link_share:     { icon: Link,          color: VIOLET,  bg: 'hsl(265 80% 65% / 0.1)',  label: 'Link' },
  announcement:   { icon: Megaphone,     color: GOLD,    bg: 'hsl(38 95% 60% / 0.1)',   label: 'Announcement' },
};
const STATUS_CONFIG: Record<PostStatus, { label: string; color: string }> = {
  open:        { label: 'Open',        color: CYAN },
  planned:     { label: 'Planned',     color: VIOLET },
  in_progress: { label: 'In Progress', color: GOLD },
  fixed:       { label: 'Fixed ✅',    color: GREEN },
  rejected:    { label: 'Rejected',    color: RED },
};
const REACTION_CONFIG: Record<ReactionType, { emoji: string; label: string }> = {
  fire:      { emoji: '🔥', label: 'Fire' },
  genius:    { emoji: '🧠', label: 'Genius' },
  bug:       { emoji: '🐛', label: 'Bug' },
  fixed:     { emoji: '✅', label: 'Fixed' },
  need_this: { emoji: '💯', label: 'Need This' },
  approved:  { emoji: '👍', label: 'Approved' },
  love:      { emoji: '❤️', label: 'Love' },
};
const BLOCKED_EXTENSIONS = ['exe','bat','cmd','msi','apk','dmg','scr','vbs','ps1','sh','bin'];

function formatBytes(b: number) {
  if (!b) return '0 B'; if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b/1024).toFixed(1)} KB`; return `${(b/1048576).toFixed(1)} MB`;
}
function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now'; if (m < 60) return `${m}m ago`;
  const h = Math.floor(m/60); if (h < 24) return `${h}h ago`; return `${Math.floor(h/24)}d ago`;
}
function getInitial(n: string|null) { return (n?.[0] ?? 'A').toUpperCase(); }
function getAvatarGrad(n: string|null) {
  const grads = [
    `linear-gradient(135deg, ${VIOLET}, ${CYAN})`,
    `linear-gradient(135deg, ${CYAN}, ${GREEN})`,
    `linear-gradient(135deg, ${PINK}, ${VIOLET})`,
    `linear-gradient(135deg, ${GOLD}, ${RED})`,
    `linear-gradient(135deg, ${GREEN}, ${CYAN})`,
    `linear-gradient(135deg, ${RED}, ${PINK})`,
  ];
  return grads[(n?.charCodeAt(0) ?? 65) % grads.length];
}
function extractDomain(url: string) { try { return new URL(url).hostname.replace('www.',''); } catch { return url; } }
function isBlockedFile(name: string) { return BLOCKED_EXTENSIONS.includes(name.split('.').pop()?.toLowerCase() ?? ''); }

// ── Typing / activity simulation ─────────────────────────────────────────────
const FAKE_USERS = [
  'jasmine_ai','devstorm99','xbuilder_dev','nia_creates','reactdev_mo',
  'python_pete','fullstack_fan','content_king','ui_drx','prompt_god_j',
  'ai_watcher','web3_nina','biz_coach_t','design_dana','creative_rox',
  'marco_dev','startup_jen','priya_dev','daily_user_k','t3ch_builder',
];
const ACTIVITY_TEMPLATES = [
  (u: string) => `${u} is typing a response…`,
  (u: string) => `${u} is posting right now`,
  (u: string) => `${u} is reading this thread`,
  (_: string, n: number) => `${n} people are typing a response`,
  (u: string) => `${u} just opened the community`,
  (_: string, n: number) => `${n} people are active right now`,
  (u: string) => `${u} is writing a feature request`,
];
function useActivityMessage() {
  const [msg, setMsg] = useState('');
  useEffect(() => {
    const gen = () => {
      const u = FAKE_USERS[Math.floor(Math.random() * FAKE_USERS.length)];
      const n = Math.floor(Math.random() * 5) + 2;
      const tpl = ACTIVITY_TEMPLATES[Math.floor(Math.random() * ACTIVITY_TEMPLATES.length)];
      setMsg(tpl(u, n));
    };
    gen();
    const delay = (Math.random() * 4000) + 8000;
    const iv = setInterval(gen, delay);
    return () => clearInterval(iv);
  }, []);
  return msg;
}

// ── Top Reactors (weekly) ─────────────────────────────────────────────────────
interface TopReactor { author_name: string; total: number; }
function useTopReactors(posts: DBPost[]): TopReactor[] {
  return React.useMemo(() => {
    const map: Record<string, number> = {};
    posts.forEach(p => {
      if (!p.author_name) return;
      const total = Object.values(p.reactions ?? {}).reduce((s, v) => s + (v as number), 0);
      map[p.author_name] = (map[p.author_name] ?? 0) + total;
    });
    return Object.entries(map)
      .map(([author_name, total]) => ({ author_name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [posts]);
}

// ── Mini sparkle ambient for community ────────────────────────────────────────
const COMMUNITY_SPARKLES = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  left: `${(i * 5.8) % 100}%`,
  top:  `${(i * 6.1 + 10) % 90}%`,
  color: [GREEN, VIOLET, CYAN, PINK, GOLD][i % 5],
  size: (i % 3) + 2,
  dur: `${4 + (i % 4)}s`,
  delay: `${(i * 0.5) % 6}s`,
}));

function CommunitySparkles() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
      {COMMUNITY_SPARKLES.map(s => (
        <div key={s.id} className="sparkle" style={{
          left: s.left, top: s.top, width: s.size, height: s.size,
          background: s.color,
          boxShadow: `0 0 ${s.size*4}px ${s.color}, 0 0 ${s.size*8}px ${s.color}44`,
          animation: `sparkle-twinkle ${s.dur} ease-in-out infinite`,
          animationDelay: s.delay,
        }} />
      ))}
    </div>
  );
}

// ── User avatar ────────────────────────────────────────────────────────────────
function UserAvatar({ name, size = 32 }: { name: string|null; size?: number }) {
  return (
    <div className="rounded-full flex items-center justify-center shrink-0 font-black text-white"
      style={{ width: size, height: size, background: getAvatarGrad(name), fontSize: size * 0.38, boxShadow: '0 0 8px rgba(100,80,255,0.3)' }}>
      {getInitial(name)}
    </div>
  );
}

// ── Live online badge ──────────────────────────────────────────────────────────
function LiveBadge({ count }: { count: number }) {
  return (
    <div className="relative flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: `${GREEN}0f`, border: `1px solid ${GREEN}33` }}>
      {/* Pulse rings */}
      <div className="relative w-2 h-2">
        <span className="absolute inset-0 rounded-full ring-pulse" style={{ background: GREEN, opacity: 0.4 }} />
        <span className="absolute inset-0 rounded-full" style={{ background: GREEN }} />
      </div>
      <span className="text-[10px] font-black" style={{ color: GREEN }}>LIVE</span>
      <span className="text-[10px] font-semibold" style={{ color: `${GREEN}88` }}>{count} posts</span>
    </div>
  );
}

// ── Link preview ───────────────────────────────────────────────────────────────
function LinkPreviewCard({ url }: { url: string }) {
  const domain = extractDomain(url);
  const sus = url.includes('bit.ly') || /\d{1,3}\.\d{1,3}/.test(url);
  return (
    <div className="mt-2 rounded-xl overflow-hidden cursor-pointer group" style={{ background: 'rgba(10,8,24,0.9)', border: sus ? `1px solid ${GOLD}55` : `1px solid ${VIOLET}28` }}
      onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${CYAN}10`, border: `1px solid ${CYAN}25` }}>
          {sus ? <AlertTriangle className="w-4 h-4" style={{ color: GOLD }} /> : <Globe className="w-4 h-4" style={{ color: CYAN }} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate" style={{ color: sus ? GOLD : 'rgba(220,230,255,0.8)' }}>{sus ? '⚠️ Shortened URL — verify before opening' : domain}</p>
          <p className="text-[10px] truncate mt-0.5" style={{ color: 'rgba(150,160,200,0.5)' }}>{url}</p>
        </div>
        <ExternalLink className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" style={{ color: CYAN }} />
      </div>
    </div>
  );
}

// ── File card ──────────────────────────────────────────────────────────────────
function FileCard({ file, onDownload }: { file: DBFile; onDownload: (f: DBFile) => void }) {
  const ext = file.file_name.split('.').pop()?.toLowerCase() ?? '';
  const isImg = ['png','jpg','jpeg','webp','gif'].includes(ext);
  const extColor: Record<string,string> = { pdf: RED, zip: GOLD, json: CYAN, csv: GREEN, txt: 'rgba(160,180,220,0.7)', docx: VIOLET };
  const col = extColor[ext] ?? VIOLET;
  if (file.safety_status === 'blocked') return (
    <div className="mt-2 px-3 py-2 rounded-xl flex items-center gap-2" style={{ background: `${RED}10`, border: `1px solid ${RED}35` }}>
      <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: RED }} /><span className="text-xs" style={{ color: RED }}>File blocked by moderation</span>
    </div>
  );
  return (
    <div className="mt-2 rounded-xl overflow-hidden" style={{ background: 'rgba(10,8,24,0.9)', border: `1px solid ${col}22` }}>
      {isImg && <div className="w-full max-h-40 overflow-hidden"><img src={file.file_url} alt={file.file_name} className="w-full h-full object-cover" /></div>}
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-black text-[10px] uppercase"
          style={{ background: `${col}14`, border: `1px solid ${col}35`, color: col }}>{ext}</div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate text-white/80">{file.file_name}</p>
          <p className="text-[10px] mt-0.5" style={{ color: 'rgba(140,155,200,0.5)' }}>{formatBytes(file.size_bytes)} · {file.download_count} downloads</p>
        </div>
        <button onClick={() => onDownload(file)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all"
          style={{ background: `${GREEN}12`, border: `1px solid ${GREEN}44`, color: GREEN }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 0 12px ${GREEN}30`; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none'; }}>
          <Download className="w-3 h-3" />Download
        </button>
      </div>
    </div>
  );
}

// ── Reactions row ──────────────────────────────────────────────────────────────
function ReactionsRow({ postId, reactions, myReaction, onReact }: {
  postId: string; reactions: Record<ReactionType, number>; myReaction: ReactionType|null|undefined;
  onReact: (id: string, r: ReactionType) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const hasAny = (Object.keys(REACTION_CONFIG) as ReactionType[]).some(r => (reactions[r] ?? 0) > 0 || myReaction === r);
  return (
    <div className="flex items-center flex-wrap gap-1.5 mt-2.5">
      {(Object.keys(REACTION_CONFIG) as ReactionType[]).filter(r => (reactions[r] ?? 0) > 0 || myReaction === r).map(r => (
        <button key={r} onClick={() => onReact(postId, r)}
          className="flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold transition-all"
          style={{ background: myReaction === r ? `${GOLD}18` : 'rgba(100,120,200,0.06)', border: myReaction === r ? `1px solid ${GOLD}55` : '1px solid rgba(100,120,200,0.18)', color: myReaction === r ? GOLD : 'rgba(180,190,220,0.6)' }}>
          <span>{REACTION_CONFIG[r].emoji}</span>
          {(reactions[r] ?? 0) > 0 && <span>{reactions[r]}</span>}
        </button>
      ))}
      <button onClick={() => setShowAll(v => !v)}
        className="px-2 py-1 rounded-full text-[10px] font-bold transition-all"
        style={{ background: showAll ? `${VIOLET}14` : 'rgba(100,120,200,0.06)', border: `1px solid ${showAll ? `${VIOLET}44` : 'rgba(100,120,200,0.15)'}`, color: showAll ? VIOLET : 'rgba(150,165,200,0.45)' }}>
        {showAll ? '×' : '+ React'}
      </button>
      {showAll && (Object.keys(REACTION_CONFIG) as ReactionType[]).map(r => (
        <button key={r} onClick={() => { onReact(postId, r); setShowAll(false); }}
          className="px-2 py-1 rounded-full text-[10px] transition-all"
          style={{ background: 'rgba(100,120,200,0.08)', border: '1px solid rgba(100,120,200,0.2)', color: 'rgba(200,210,240,0.7)' }}
          title={REACTION_CONFIG[r].label}>
          {REACTION_CONFIG[r].emoji}
        </button>
      ))}
    </div>
  );
}

// ── Post card ──────────────────────────────────────────────────────────────────
function PostCard({
  post, isNew, isExpanded, comments, files, commentInput, votingId, isAdmin, user,
  onVote, onReact, onBookmark, onShare, onExpand, onCommentChange, onComment, onDownload, onPin,
}: {
  post: DBPost; isNew: boolean; isExpanded: boolean;
  comments: DBComment[]; files: DBFile[]; commentInput: string;
  votingId: string|null; isAdmin: boolean; user: { id: string; username?: string; email?: string; avatar?: string } | null;
  onVote: () => void; onReact: (id: string, r: ReactionType) => void;
  onBookmark: () => void; onShare: () => void; onExpand: () => void;
  onCommentChange: (v: string) => void; onComment: () => void;
  onDownload: (f: DBFile) => void; onPin: () => void;
}) {
  const cat = POST_TYPE_CONFIG[post.type] ?? POST_TYPE_CONFIG.feedback;
  const st = STATUS_CONFIG[post.status] ?? STATUS_CONFIG.open;
  const CatIcon = cat.icon;

  return (
    <div
      className={`rounded-2xl overflow-hidden transition-all duration-300 ${isNew ? 'post-arrive' : ''}`}
      style={{
        background: post.pinned ? `${GOLD}06` : post.featured ? `${VIOLET}05` : 'rgba(8,6,20,0.9)',
        border: post.pinned ? `1px solid ${GOLD}35` : post.featured ? `1px solid ${VIOLET}30` : `1px solid rgba(100,120,255,0.13)`,
        boxShadow: post.pinned ? `0 0 24px ${GOLD}10` : post.featured ? `0 0 20px ${VIOLET}08` : 'none',
      }}
    >
      {/* Pinned / Featured banner */}
      {post.pinned && (
        <div className="flex items-center gap-2 px-4 py-1.5" style={{ background: `${GOLD}0a`, borderBottom: `1px solid ${GOLD}22` }}>
          <Pin className="w-3 h-3" style={{ color: GOLD }} />
          <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: GOLD }}>📌 Pinned by MockJ Team</span>
        </div>
      )}
      {post.featured && !post.pinned && (
        <div className="flex items-center gap-2 px-4 py-1.5" style={{ background: `${VIOLET}08`, borderBottom: `1px solid ${VIOLET}1a` }}>
          <Star className="w-3 h-3" style={{ color: VIOLET }} />
          <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: VIOLET }}>⭐ Featured</span>
        </div>
      )}

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start gap-3 mb-3">
          <UserAvatar name={post.author_name} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold text-white/90">{post.author_name ?? 'Anonymous'}</span>
              {post.user_id === user?.id && (
                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black" style={{ background: `${VIOLET}18`, color: VIOLET, border: `1px solid ${VIOLET}38` }}>You</span>
              )}
              <span className="text-[9px]" style={{ color: 'rgba(130,145,200,0.4)' }}>· {timeAgo(post.created_at)}</span>
            </div>
          </div>
          {/* Type + status badges */}
          <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold"
              style={{ background: cat.bg, color: cat.color, border: `1px solid ${cat.color.replace(')', ' / 0.3)')}` }}>
              <CatIcon className="w-2.5 h-2.5" />{cat.label}
            </span>
            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold hidden sm:inline-flex"
              style={{ background: `${st.color.replace(')', ' / 0.1)')}`, color: st.color, border: `1px solid ${st.color.replace(')', ' / 0.28)')}` }}>
              {st.label}
            </span>
          </div>
        </div>

        {/* Content */}
        <h3 className="text-sm font-bold text-white/90 leading-snug mb-1.5">{post.title}</h3>
        <p className="text-xs text-white/52 leading-relaxed line-clamp-3">{post.body}</p>

        {post.link_url && <LinkPreviewCard url={post.link_url} />}

        <ReactionsRow
          postId={post.id}
          reactions={post.reactions ?? {} as Record<ReactionType, number>}
          myReaction={post.myReaction}
          onReact={onReact}
        />

        {/* Actions */}
        <div className="flex items-center gap-1.5 mt-3 flex-wrap">
          <button onClick={onVote} disabled={votingId === post.id}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl transition-all text-[11px] font-bold min-h-[36px]"
            style={{ background: post.myVote === 'up' ? `${PINK}18` : 'transparent', border: `1px solid ${post.myVote === 'up' ? `${PINK}55` : 'rgba(100,120,200,0.2)'}`, color: post.myVote === 'up' ? PINK : 'rgba(150,170,220,0.5)' }}>
            <ThumbsUp className="w-3 h-3" />{post.upvotes}
          </button>
          <button className="flex items-center gap-1 px-2 py-1.5 rounded-xl text-[11px] min-h-[36px]"
            style={{ border: '1px solid rgba(100,120,200,0.14)', color: 'rgba(150,170,220,0.3)' }}>
            <ThumbsDown className="w-3 h-3" />{post.downvotes ?? 0}
          </button>
          <button onClick={onExpand}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl transition-all text-[11px] min-h-[36px]"
            style={{ color: isExpanded ? CYAN : 'rgba(150,170,220,0.45)', border: `1px solid ${isExpanded ? `${CYAN}44` : 'rgba(100,120,200,0.15)'}` }}>
            <MessageCircle className="w-3 h-3" />{post.comment_count}
            <ChevronDown className="w-3 h-3 transition-transform" style={{ transform: isExpanded ? 'rotate(180deg)' : 'none' }} />
          </button>
          <button onClick={onBookmark}
            className="w-9 h-9 flex items-center justify-center rounded-xl transition-all"
            style={{ background: post.myBookmark ? `${GOLD}14` : 'transparent', border: `1px solid ${post.myBookmark ? `${GOLD}48` : 'rgba(100,120,200,0.15)'}`, color: post.myBookmark ? GOLD : 'rgba(150,170,220,0.35)' }}>
            <Bookmark className="w-3.5 h-3.5" />
          </button>
          <button onClick={onShare}
            className="w-9 h-9 flex items-center justify-center rounded-xl transition-all"
            style={{ border: '1px solid rgba(100,120,200,0.14)', color: 'rgba(150,170,220,0.35)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = CYAN; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(150,170,220,0.35)'; }}>
            <Share2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => toast('Thanks for the report — our team will review it.')}
            className="w-9 h-9 flex items-center justify-center rounded-xl transition-all"
            style={{ border: '1px solid rgba(100,120,200,0.1)', color: 'rgba(150,170,220,0.2)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = RED; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(150,170,220,0.2)'; }}>
            <Flag className="w-3.5 h-3.5" />
          </button>
          {isAdmin && (
            <button onClick={onPin}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-bold ml-auto transition-all"
              style={{ background: post.pinned ? `${GOLD}14` : 'transparent', border: `1px solid ${post.pinned ? `${GOLD}48` : 'rgba(100,120,200,0.15)'}`, color: post.pinned ? GOLD : 'rgba(150,170,220,0.35)' }}>
              <Pin className="w-3 h-3" />{post.pinned ? 'Unpin' : 'Pin'}
            </button>
          )}
        </div>
      </div>

      {/* Expanded: files + comments */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-2" style={{ borderTop: '1px solid rgba(100,120,200,0.1)' }}>
          {files.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] font-black uppercase tracking-wider mb-1.5" style={{ color: 'rgba(140,155,200,0.45)' }}>Attachments</p>
              {files.map(f => <FileCard key={f.id} file={f} onDownload={onDownload} />)}
            </div>
          )}
          <div className="space-y-2.5 max-h-52 overflow-y-auto mb-3">
            {comments.length === 0 ? (
              <p className="text-[11px] text-center py-3" style={{ color: 'rgba(130,145,200,0.35)' }}>No comments yet — be the first!</p>
            ) : comments.map(c => (
              <div key={c.id} className="flex items-start gap-2.5 post-arrive">
                <UserAvatar name={c.author_name} size={24} />
                <div className="flex-1 min-w-0 rounded-xl px-3 py-2" style={{ background: 'rgba(100,120,200,0.06)', border: '1px solid rgba(100,120,200,0.1)' }}>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[11px] font-bold" style={{ color: `${CYAN}cc` }}>{c.author_name ?? 'Anonymous'}</span>
                    <span className="text-[9px]" style={{ color: 'rgba(130,145,200,0.35)' }}>{timeAgo(c.created_at)}</span>
                  </div>
                  <p className="text-xs text-white/55 leading-relaxed">{c.body}</p>
                </div>
              </div>
            ))}
          </div>
          {user ? (
            <div className="flex items-center gap-2">
              <UserAvatar name={user.username ?? user.email} size={24} />
              <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-xl" style={{ background: 'rgba(100,120,200,0.06)', border: '1px solid rgba(100,120,200,0.18)' }}>
                <input value={commentInput} onChange={e => onCommentChange(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') onComment(); }}
                  placeholder="Add a comment…"
                  className="flex-1 bg-transparent text-xs text-white/65 placeholder-white/20 outline-none min-w-0" />
                <button onClick={onComment} disabled={!commentInput.trim()}
                  className="w-6 h-6 flex items-center justify-center rounded-lg transition-all disabled:opacity-30"
                  style={{ background: `${VIOLET}22`, border: `1px solid ${VIOLET}44`, color: VIOLET }}>
                  <Send className="w-3 h-3" />
                </button>
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-center" style={{ color: 'rgba(130,145,200,0.4)' }}>Sign in to comment</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function CommunityBoard() {
  const { user, subscription } = useAuth();
  const [posts, setPosts] = useState<DBPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string|null>(null);
  const [comments, setComments] = useState<Record<string, DBComment[]>>({});
  const [commentInput, setCommentInput] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, DBFile[]>>({});
  const [votingId, setVotingId] = useState<string|null>(null);
  const [newPostIds, setNewPostIds] = useState<Set<string>>(new Set());
  const prevPostIds = useRef<Set<string>>(new Set());
  const [liveCount, setLiveCount] = useState(0);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<PostType>('feedback');
  const [linkUrl, setLinkUrl] = useState('');
  const [pendingFile, setPendingFile] = useState<File|null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = user?.email?.endsWith('@mockj.online') || user?.email?.endsWith('@admin.com');
  const activityMsg = useActivityMessage();
  const topReactors = useTopReactors(posts);

  // ── Fake live activity simulation ──────────────────────────────────────────
  useEffect(() => {
    setLiveCount(Math.floor(Math.random() * 40) + 15);
    const iv = setInterval(() => {
      setLiveCount(prev => Math.max(10, prev + Math.floor(Math.random() * 5) - 2));
    }, 7000);
    return () => clearInterval(iv);
  }, []);

  const fetchPosts = useCallback(async () => {
    let query = supabase
      .from('community_posts')
      .select('id,user_id,author_name,type,title,body,status,upvotes,downvotes,comment_count,created_at,pinned,featured,link_url')
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(60);

    if (filter !== 'all' && filter !== 'fixed') query = query.eq('type', filter);
    else if (filter === 'fixed') query = query.eq('status', 'fixed');

    const { data } = await query;
    if (!data) return;

    let votedIds: Set<string> = new Set();
    let bookmarkIds: Set<string> = new Set();
    let reactionMap: Record<string, Record<string, number>> = {};
    let myReactionMap: Record<string, ReactionType> = {};

    if (user) {
      const ids = data.map((p: DBPost) => p.id);
      const [vr, br, rr, mrr] = await Promise.all([
        supabase.from('community_votes').select('post_id').eq('user_id', user.id),
        supabase.from('community_bookmarks').select('post_id').eq('user_id', user.id),
        supabase.from('community_reactions').select('post_id,reaction').in('post_id', ids),
        supabase.from('community_reactions').select('post_id,reaction').eq('user_id', user.id).in('post_id', ids),
      ]);
      if (vr.data) votedIds = new Set(vr.data.map((v: { post_id: string }) => v.post_id));
      if (br.data) bookmarkIds = new Set(br.data.map((b: { post_id: string }) => b.post_id));
      if (rr.data) { for (const r of rr.data as { post_id: string; reaction: string }[]) { if (!reactionMap[r.post_id]) reactionMap[r.post_id] = {}; reactionMap[r.post_id][r.reaction] = (reactionMap[r.post_id][r.reaction] ?? 0) + 1; } }
      if (mrr.data) { for (const r of mrr.data as { post_id: string; reaction: ReactionType }[]) myReactionMap[r.post_id] = r.reaction; }
    }

    const incoming = (data as DBPost[]).map(p => ({
      ...p, myVote: votedIds.has(p.id) ? 'up' as const : null,
      myBookmark: bookmarkIds.has(p.id),
      reactions: (reactionMap[p.id] ?? {}) as Record<ReactionType, number>,
      myReaction: myReactionMap[p.id] ?? null,
    }));

    // Detect newly arrived posts
    const freshIds = new Set<string>();
    incoming.forEach(p => { if (!prevPostIds.current.has(p.id) && prevPostIds.current.size > 0) freshIds.add(p.id); });
    prevPostIds.current = new Set(incoming.map(p => p.id));
    if (freshIds.size > 0) {
      setNewPostIds(freshIds);
      setTimeout(() => setNewPostIds(new Set()), 800);
    }

    setPosts(incoming);
    setLoading(false);
  }, [user?.id, filter]);

  useEffect(() => {
    setLoading(true);
    fetchPosts();
    const iv = setInterval(fetchPosts, 5000);
    return () => clearInterval(iv);
  }, [fetchPosts]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const handlePost = async () => {
    if (!title.trim() || !body.trim()) { toast.error('Title and body required'); return; }
    if (!user) { toast.error('Sign in to post'); return; }
    setSubmitting(true);
    const { data: post, error } = await supabase.from('community_posts').insert({
      user_id: user.id,
      author_name: user.username ?? user.email?.split('@')[0] ?? 'Anonymous',
      type: category, title: title.trim(), body: body.trim(), link_url: linkUrl.trim() || null,
    }).select().single();
    if (error || !post) { toast.error('Failed to post'); setSubmitting(false); return; }
    if (linkUrl.trim()) await supabase.from('community_links').insert({ post_id: post.id, user_id: user.id, url: linkUrl.trim(), domain: extractDomain(linkUrl.trim()), safety_status: 'safe' });
    setTitle(''); setBody(''); setLinkUrl(''); setPendingFile(null); setShowCompose(false);
    toast.success('Posted to the community! 🔥');
    fetchPosts();
    setSubmitting(false);
  };

  const handleVote = async (post: DBPost) => {
    if (!user) { toast.error('Sign in to vote'); return; }
    setVotingId(post.id);
    if (post.myVote === 'up') {
      await supabase.from('community_votes').delete().eq('post_id', post.id).eq('user_id', user.id);
      await supabase.from('community_posts').update({ upvotes: Math.max(0, post.upvotes - 1) }).eq('id', post.id);
      setPosts(prev => prev.map(p => p.id === post.id ? { ...p, myVote: null, upvotes: p.upvotes - 1 } : p));
    } else {
      await supabase.from('community_votes').insert({ post_id: post.id, user_id: user.id });
      await supabase.from('community_posts').update({ upvotes: post.upvotes + 1 }).eq('id', post.id);
      setPosts(prev => prev.map(p => p.id === post.id ? { ...p, myVote: 'up', upvotes: p.upvotes + 1 } : p));
    }
    setVotingId(null);
  };

  const handleReact = async (postId: string, reaction: ReactionType) => {
    if (!user) { toast.error('Sign in to react'); return; }
    const post = posts.find(p => p.id === postId); if (!post) return;
    if (post.myReaction === reaction) {
      await supabase.from('community_reactions').delete().eq('post_id', postId).eq('user_id', user.id).eq('reaction', reaction);
      setPosts(prev => prev.map(p => { if (p.id !== postId) return p; const r = {...(p.reactions ?? {})} as Record<ReactionType, number>; r[reaction] = Math.max(0, (r[reaction] ?? 1) - 1); return { ...p, myReaction: null, reactions: r }; }));
    } else {
      if (post.myReaction) await supabase.from('community_reactions').delete().eq('post_id', postId).eq('user_id', user.id).eq('reaction', post.myReaction);
      await supabase.from('community_reactions').insert({ post_id: postId, user_id: user.id, reaction });
      setPosts(prev => prev.map(p => { if (p.id !== postId) return p; const r = {...(p.reactions ?? {})} as Record<ReactionType, number>; if (post.myReaction) r[post.myReaction as ReactionType] = Math.max(0, (r[post.myReaction as ReactionType] ?? 1) - 1); r[reaction] = (r[reaction] ?? 0) + 1; return { ...p, myReaction: reaction, reactions: r }; }));
    }
  };

  const handleBookmark = async (post: DBPost) => {
    if (!user) { toast.error('Sign in to bookmark'); return; }
    if (post.myBookmark) {
      await supabase.from('community_bookmarks').delete().eq('post_id', post.id).eq('user_id', user.id);
      setPosts(prev => prev.map(p => p.id === post.id ? { ...p, myBookmark: false } : p));
    } else {
      await supabase.from('community_bookmarks').insert({ post_id: post.id, user_id: user.id });
      setPosts(prev => prev.map(p => p.id === post.id ? { ...p, myBookmark: true } : p));
      toast.success('Bookmarked!');
    }
  };

  const handleShare = (post: DBPost) => {
    navigator.clipboard.writeText(`${window.location.origin}/?community=${post.id}`).then(() => toast.success('Link copied!'));
  };

  const loadComments = async (postId: string) => {
    const { data } = await supabase.from('community_comments').select('id,author_name,body,created_at').eq('post_id', postId).order('created_at', { ascending: true }).limit(50);
    if (data) setComments(prev => ({ ...prev, [postId]: data }));
  };
  const loadFiles = async (postId: string) => {
    const { data } = await supabase.from('community_files').select('id,file_url,file_name,file_type,size_bytes,download_count,safety_status').eq('post_id', postId);
    if (data) setFiles(prev => ({ ...prev, [postId]: data }));
  };
  const handleExpand = async (postId: string) => {
    if (expandedId === postId) { setExpandedId(null); return; }
    setExpandedId(postId);
    await Promise.all([loadComments(postId), loadFiles(postId)]);
  };
  const handleComment = async (postId: string) => {
    const text = (commentInput[postId] ?? '').trim();
    if (!text || !user) return;
    await supabase.from('community_comments').insert({ post_id: postId, user_id: user.id, author_name: user.username ?? user.email?.split('@')[0] ?? 'Anonymous', body: text });
    setCommentInput(prev => ({ ...prev, [postId]: '' }));
    loadComments(postId);
    await supabase.from('community_posts').update({ comment_count: (posts.find(p => p.id === postId)?.comment_count ?? 0) + 1 }).eq('id', postId);
  };
  const handleDownload = async (file: DBFile) => {
    if (user) await supabase.from('community_file_downloads').insert({ file_id: file.id, user_id: user.id });
    await supabase.from('community_files').update({ download_count: file.download_count + 1 }).eq('id', file.id);
    const a = document.createElement('a'); a.href = file.file_url; a.download = file.file_name; a.target = '_blank';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    toast.success(`Downloading ${file.file_name}`);
  };
  const handlePin = async (post: DBPost) => {
    if (!isAdmin) return;
    await supabase.from('community_posts').update({ pinned: !post.pinned }).eq('id', post.id);
    setPosts(prev => prev.map(p => p.id === post.id ? { ...p, pinned: !p.pinned } : p));
  };

  const FILTER_TABS: { key: FilterType; label: string }[] = [
    { key: 'all',          label: 'All' },
    { key: 'bug',          label: '🐛 Bugs' },
    { key: 'feature',      label: '💡 Features' },
    { key: 'feedback',     label: '💬 Feedback' },
    { key: 'download',     label: '📦 Downloads' },
    { key: 'link_share',   label: '🔗 Links' },
    { key: 'announcement', label: '📢 News' },
    { key: 'fixed',        label: '✅ Fixed' },
  ];

  const filtered = posts.filter(p => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return p.title.toLowerCase().includes(q) || p.body.toLowerCase().includes(q);
  });

  const trending = [...posts].sort((a, b) => b.upvotes - a.upvotes).slice(0, 5);

  return (
    <div className="relative flex flex-col h-full overflow-hidden">
      <CommunitySparkles />

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="relative z-10 px-4 sm:px-5 py-3 shrink-0" style={{ borderBottom: `1px solid rgba(100,120,255,0.12)`, background: 'rgba(4,3,12,0.7)', backdropFilter: 'blur(12px)' }}>
        {/* Title row */}
        <div className="flex items-center gap-3 mb-3">
          <div className="relative w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${CYAN}14`, border: `1px solid ${CYAN}33` }}>
            <Users className="w-4 h-4" style={{ color: CYAN }} />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ring-pulse" style={{ background: GREEN }} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm sm:text-base font-black text-white leading-tight animate-text-glow" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              MockJ Live Community
            </h2>
            <div className="flex items-center gap-2 mt-0.5">
              <Radio className="w-2.5 h-2.5 animate-pulse" style={{ color: GREEN }} />
              <span className="text-[10px] font-semibold" style={{ color: GREEN }}>LIVE</span>
              <span className="text-[10px]" style={{ color: 'rgba(130,150,200,0.45)' }}>· {liveCount} people online · updates every 5s</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={fetchPosts}
              className="w-8 h-8 flex items-center justify-center rounded-xl transition-all"
              style={{ border: `1px solid rgba(100,120,200,0.2)`, color: 'rgba(150,170,220,0.4)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = CYAN; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(150,170,220,0.4)'; }}>
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            {user && (
              <button onClick={() => setShowCompose(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black transition-all min-h-[36px]"
                style={{ background: showCompose ? `${VIOLET}22` : `${VIOLET}12`, border: `1px solid ${VIOLET}55`, color: VIOLET, boxShadow: showCompose ? `0 0 16px ${VIOLET}33` : 'none' }}>
                <Send className="w-3 h-3" />Post
              </button>
            )}
          </div>
        </div>

        {/* Category stats strip */}
        <div className="hidden sm:flex items-center gap-3 mb-2 px-1">
          {(['announcement','feature','bug','feedback','resource'] as PostType[]).map(t => {
            const { color, label, icon: Icon } = POST_TYPE_CONFIG[t];
            const cnt = posts.filter(p => p.type === t).length;
            if (cnt === 0) return null;
            return (
              <button key={t} onClick={() => setFilter(t as FilterType)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold transition-all"
                style={{ background: `${color.replace(')', ' / 0.08)')}`, border: `1px solid ${color.replace(')', ' / 0.25)')}`, color }}>
                <Icon className="w-2.5 h-2.5" />{label} <span className="font-black">{cnt}</span>
              </button>
            );
          })}
          <span className="ml-auto text-[10px]" style={{ color: 'rgba(130,150,200,0.4)' }}>{posts.length} total posts</span>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none flex-nowrap -mx-1 px-1">
          {FILTER_TABS.map(({ key, label }) => (
            <button key={key} onClick={() => setFilter(key)}
              className="px-2.5 py-1.5 rounded-full text-[10px] font-bold whitespace-nowrap transition-all shrink-0 min-h-[32px]"
              style={{
                background: filter === key ? `${VIOLET}18` : 'transparent',
                border: filter === key ? `1px solid ${VIOLET}55` : '1px solid rgba(100,120,200,0.16)',
                color: filter === key ? VIOLET : 'rgba(150,170,220,0.45)',
                boxShadow: filter === key ? `0 0 10px ${VIOLET}22` : 'none',
              }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Search ─────────────────────────────────────────────────────── */}
      <div className="relative z-10 px-4 py-2 shrink-0" style={{ borderBottom: '1px solid rgba(100,120,255,0.07)' }}>
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'rgba(8,6,20,0.8)', border: '1px solid rgba(100,120,200,0.15)' }}>
          <Search className="w-3.5 h-3.5 shrink-0" style={{ color: 'rgba(140,155,200,0.4)' }} />
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search posts, bugs, features, prompts…"
            className="flex-1 bg-transparent text-xs text-white/70 placeholder-white/20 outline-none min-w-0" />
          {searchQuery && <button onClick={() => setSearchQuery('')} className="shrink-0 text-white/30 hover:text-white/60"><X className="w-3 h-3" /></button>}
        </div>
      </div>

      {/* ── Compose form ─────────────────────────────────────────────────── */}
      {showCompose && user && (
        <div className="relative z-10 px-4 py-3 shrink-0" style={{ borderBottom: `1px solid ${VIOLET}22`, background: 'rgba(10,8,24,0.7)' }}>
          <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(6,5,18,0.95)', border: `1.5px solid ${VIOLET}28` }}>
            {/* Category selector */}
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none px-3 pt-3 pb-2">
              {(['feedback','feature','bug','resource','prompt_pack','code_snippet','link_share','announcement'] as PostType[]).map(cat => {
                const { icon: Icon, color, label } = POST_TYPE_CONFIG[cat];
                return (
                  <button key={cat} onClick={() => setCategory(cat)}
                    className="flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-bold whitespace-nowrap transition-all shrink-0 min-h-[28px]"
                    style={{ background: category === cat ? `${color.replace(')', ' / 0.18)')}` : 'transparent', border: category === cat ? `1px solid ${color.replace(')', ' / 0.6)')}` : '1px solid rgba(100,120,200,0.15)', color: category === cat ? color : 'rgba(140,155,200,0.45)' }}>
                    <Icon className="w-2.5 h-2.5" />{label}
                  </button>
                );
              })}
            </div>
            <input value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Title (what's this about?)…"
              className="w-full bg-transparent px-3 py-2 text-sm font-semibold text-white/80 placeholder-white/20 outline-none"
              style={{ borderTop: '1px solid rgba(100,120,200,0.1)' }} />
            <textarea value={body} onChange={e => setBody(e.target.value)}
              placeholder="Describe it — bugs, ideas, resources, links, anything…"
              rows={3}
              className="w-full bg-transparent px-3 py-2 text-sm text-white/65 placeholder-white/18 resize-none outline-none"
              style={{ borderTop: '1px solid rgba(100,120,200,0.08)' }} />
            <div className="flex items-center gap-2 px-3 py-2" style={{ borderTop: '1px solid rgba(100,120,200,0.1)' }}>
              <div className="flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded-lg" style={{ background: 'rgba(100,120,200,0.05)', border: '1px solid rgba(100,120,200,0.15)' }}>
                <Link className="w-3 h-3 shrink-0" style={{ color: `${VIOLET}55` }} />
                <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
                  placeholder="Link (optional)…"
                  className="flex-1 bg-transparent text-xs text-white/60 placeholder-white/18 outline-none min-w-0" />
              </div>
              <button onClick={handlePost} disabled={!title.trim() || !body.trim() || submitting}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11px] font-black transition-all disabled:opacity-40 min-h-[36px]"
                style={{ background: `linear-gradient(135deg, ${VIOLET}dd, ${CYAN}aa)`, border: `1px solid ${VIOLET}55`, color: 'white', boxShadow: `0 0 16px ${VIOLET}28` }}>
                {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-2.5 h-2.5" />}
                {submitting ? 'Posting…' : 'Post'}
              </button>
            </div>
          </div>
        </div>
      )}

      {!user && (
        <div className="relative z-10 px-4 py-2 shrink-0 text-center" style={{ borderBottom: '1px solid rgba(100,120,255,0.07)' }}>
          <p className="text-xs" style={{ color: 'rgba(150,170,220,0.4)' }}>
            <span style={{ color: VIOLET }}>Sign in</span> to post, vote, react, and comment in the community
          </p>
        </div>
      )}

      {/* ── Feed + sidebars ──────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden min-h-0 relative z-10">

        {/* Left: Trending */}
        <div className="hidden xl:flex flex-col w-52 shrink-0 overflow-y-auto border-r border-white/5 px-3 py-3 gap-4">
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Flame className="w-3.5 h-3.5" style={{ color: RED }} />
              <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'rgba(180,190,220,0.5)' }}>Trending 🔥</span>
            </div>
            {trending.map((p, i) => {
              const cat = POST_TYPE_CONFIG[p.type] ?? POST_TYPE_CONFIG.feedback;
              return (
                <button key={p.id} onClick={() => handleExpand(p.id)}
                  className="w-full text-left px-2.5 py-2 rounded-xl mb-1.5 transition-all"
                  style={{ border: '1px solid rgba(100,120,200,0.1)' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(100,120,200,0.07)'; (e.currentTarget as HTMLButtonElement).style.borderColor = `${cat.color.replace(')', ' / 0.3)')}`; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(100,120,200,0.1)'; }}>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[9px] font-black" style={{ color: 'rgba(130,150,200,0.4)' }}>#{i+1}</span>
                    <cat.icon className="w-2.5 h-2.5" style={{ color: cat.color }} />
                    <span className="text-[9px] font-bold" style={{ color: cat.color }}>{cat.label}</span>
                  </div>
                  <p className="text-[11px] font-semibold text-white/70 leading-snug line-clamp-2">{p.title}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <ThumbsUp className="w-2.5 h-2.5" style={{ color: 'rgba(130,150,200,0.4)' }} />
                    <span className="text-[9px] font-bold" style={{ color: PINK }}>{p.upvotes}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Online count */}
          <div className="px-2.5 py-2.5 rounded-xl" style={{ background: `${GREEN}08`, border: `1px solid ${GREEN}22` }}>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: GREEN }} />
              <span className="text-[10px] font-black uppercase" style={{ color: GREEN }}>People Online</span>
            </div>
            <p className="text-2xl font-black" style={{ color: GREEN, textShadow: `0 0 16px ${GREEN}55` }}>{liveCount}</p>
            <p className="text-[9px] mt-0.5" style={{ color: `${GREEN}66` }}>in the community now</p>
          </div>
        </div>

        {/* Center: Posts feed */}
        <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-3 space-y-3 min-w-0">

          {/* Typing / activity indicator */}
          {activityMsg && (
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl" style={{ background: 'rgba(100,120,200,0.04)', border: '1px solid rgba(100,120,200,0.1)' }}>
              <div className="flex items-end gap-0.5 shrink-0">
                {[0,1,2].map(i => (
                  <span key={i} className="waveform-bar" style={{ background: CYAN, boxShadow: `0 0 4px ${CYAN}55`, animationDelay: `${i*0.15}s` }} />
                ))}
              </div>
              <span className="text-[10px] font-semibold" style={{ color: 'rgba(150,170,220,0.45)' }}>{activityMsg}</span>
            </div>
          )}
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="relative w-12 h-12">
                <div className="w-full h-full rounded-full border-2 animate-spin" style={{ borderColor: `${VIOLET}22`, borderTopColor: VIOLET }} />
                <div className="absolute inset-2 rounded-full" style={{ background: `${VIOLET}10`, animation: 'pulse-glow 1.5s ease-in-out infinite' }} />
              </div>
              <p className="text-xs font-semibold" style={{ color: 'rgba(150,170,220,0.4)' }}>Loading community…</p>
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center gap-4 py-16 text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(100,120,200,0.08)', border: '1px solid rgba(100,120,200,0.18)' }}>
                <Users className="w-7 h-7" style={{ color: 'rgba(100,120,200,0.3)' }} />
              </div>
              <p className="text-sm font-bold text-white/50">No posts here yet</p>
              <p className="text-xs text-white/25">Be the first to share something!</p>
              {user && <button onClick={() => setShowCompose(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all" style={{ background: `${VIOLET}18`, border: `1px solid ${VIOLET}44`, color: VIOLET }}>
                <Send className="w-3.5 h-3.5" />Create first post
              </button>}
            </div>
          )}

          {filtered.map(post => (
            <PostCard
              key={post.id}
              post={post}
              isNew={newPostIds.has(post.id)}
              isExpanded={expandedId === post.id}
              comments={comments[post.id] ?? []}
              files={files[post.id] ?? []}
              commentInput={commentInput[post.id] ?? ''}
              votingId={votingId}
              isAdmin={isAdmin}
              user={user}
              onVote={() => handleVote(post)}
              onReact={handleReact}
              onBookmark={() => handleBookmark(post)}
              onShare={() => handleShare(post)}
              onExpand={() => handleExpand(post.id)}
              onCommentChange={v => setCommentInput(prev => ({ ...prev, [post.id]: v }))}
              onComment={() => handleComment(post.id)}
              onDownload={handleDownload}
              onPin={() => handlePin(post)}
            />
          ))}

          {/* Bottom padding for mobile nav */}
          <div className="h-16 md:h-4" />
        </div>

        {/* Right: Top Reactors + Announcements + Fixed */}
        <div className="hidden 2xl:flex flex-col w-52 shrink-0 overflow-y-auto border-l border-white/5 px-3 py-3 gap-4">

          {/* Top Reactors widget */}
          {topReactors.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Crown className="w-3.5 h-3.5" style={{ color: GOLD }} />
                <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'rgba(180,190,220,0.5)' }}>Top Reactors</span>
              </div>
              {topReactors.map((r, i) => {
                const rankColors = [GOLD, 'hsl(220 80% 70%)', 'hsl(30 80% 65%)', GREEN, CYAN];
                const rankLabels = ['🥇','🥈','🥉','4th','5th'];
                const col = rankColors[i] ?? GREEN;
                return (
                  <div key={r.author_name}
                    className="flex items-center gap-2 px-2.5 py-2 rounded-xl mb-1.5 transition-all"
                    style={{ background: i === 0 ? `${GOLD}08` : 'rgba(100,120,200,0.04)', border: i === 0 ? `1px solid ${GOLD}28` : '1px solid rgba(100,120,200,0.1)' }}>
                    {/* Rank badge */}
                    <span className="text-[10px] font-black shrink-0" style={{ color: col, minWidth: '14px', textAlign: 'center' }}>{rankLabels[i]}</span>
                    {/* Avatar */}
                    <UserAvatar name={r.author_name} size={22} />
                    {/* Name + reactions */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold truncate" style={{ color: 'rgba(210,220,240,0.8)' }}>{r.author_name}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-[9px]">🔥💯🧠❤️</span>
                        <span className="text-[9px] font-black tabular-nums" style={{ color: col }}>{r.total}</span>
                      </div>
                    </div>
                    {/* Glow badge for #1 */}
                    {i === 0 && (
                      <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full" style={{ background: `${GOLD}18`, color: GOLD, border: `1px solid ${GOLD}44`, boxShadow: `0 0 8px ${GOLD}30` }}>HOT</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Megaphone className="w-3.5 h-3.5" style={{ color: GOLD }} />
              <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'rgba(180,190,220,0.5)' }}>Announcements</span>
            </div>
            {posts.filter(p => p.type === 'announcement').slice(0, 3).map(p => (
              <button key={p.id} onClick={() => handleExpand(p.id)}
                className="w-full text-left px-2.5 py-2 rounded-xl mb-1.5 transition-all"
                style={{ background: `${GOLD}06`, border: `1px solid ${GOLD}22` }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `${GOLD}12`; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = `${GOLD}06`; }}>
                <p className="text-[11px] font-semibold text-white/75 leading-snug line-clamp-2">{p.title}</p>
              </button>
            ))}
          </div>

          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <CheckCircle2 className="w-3.5 h-3.5" style={{ color: GREEN }} />
              <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'rgba(180,190,220,0.5)' }}>Recently Fixed</span>
            </div>
            {posts.filter(p => p.status === 'fixed').slice(0, 4).map(p => (
              <div key={p.id} className="px-2.5 py-2 rounded-xl mb-1.5" style={{ background: `${GREEN}06`, border: `1px solid ${GREEN}1a` }}>
                <p className="text-[11px] text-white/65 leading-snug line-clamp-2">{p.title}</p>
              </div>
            ))}
            {posts.filter(p => p.status === 'fixed').length === 0 && <p className="text-[11px]" style={{ color: 'rgba(130,145,200,0.35)' }}>No fixes yet</p>}
          </div>

          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <TrendingUp className="w-3.5 h-3.5" style={{ color: CYAN }} />
              <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'rgba(180,190,220,0.5)' }}>Resources</span>
            </div>
            {posts.filter(p => p.type === 'resource' || p.type === 'prompt_pack').slice(0, 4).map(p => (
              <button key={p.id} onClick={() => handleExpand(p.id)}
                className="w-full text-left px-2.5 py-2 rounded-xl mb-1.5 transition-all"
                style={{ background: `${CYAN}05`, border: `1px solid ${CYAN}1a` }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `${CYAN}0e`; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = `${CYAN}05`; }}>
                <p className="text-[11px] text-white/70 leading-snug line-clamp-2">{p.title}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
