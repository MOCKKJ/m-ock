import { useState, useEffect } from 'react';
import { MessageSquare, Trash2, Image, Video, LogIn, LogOut, User, Brain, Settings, X, Coins, FolderOpen, Code2 } from 'lucide-react';
import { useTokenWallet } from '@/hooks/useTokenWallet';
import { getAutoSpeak } from '@/hooks/useAutoSpeak';
import { getTTSVolume } from '@/hooks/useTTS';
import ProjectBrain from '@/components/features/ProjectBrain';
import WalletPanel from '@/components/features/WalletPanel';
import MemoryPanel from '@/components/features/MemoryPanel';
import { Conversation, ChatMode } from '@/types/chat';
import { toast } from 'sonner';
import { PERSONALITY_PRESETS, PersonalityPreset } from '@/components/features/PersonalityPicker';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

// ── MLTX Green palette ────────────────────────────────────────────────────────
const GREEN  = 'hsl(142 70% 55%)';
const GREEN2 = 'hsl(142 70% 40%)';
const RED    = 'hsl(4 90% 58%)';

interface SidebarProps {
  onOpenWallet?: () => void;
  conversations: Conversation[];
  activeId: string | null;
  activeConversation: Conversation | null;
  onSelect: (id: string) => void;
  onNew: (mode?: ChatMode) => void;
  onDelete: (id: string) => void;
  onOpenLibrary: () => void;
  onOpenPersonality: () => void;
  onOpenPricing: () => void;
  currentPersonality: PersonalityPreset;
  onMobileClose?: () => void;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

const NAV_ITEMS = [
  { id: 'chat',            label: 'Chat',         icon: MessageSquare },
  { id: 'image-studio',    label: 'Images',       icon: Image },
  { id: 'video-studio',    label: 'Video Studio', icon: Video },
  { id: 'ide-builder',     label: 'IDE Builder',  icon: Code2 },
  { id: 'universe',        label: 'Projects',     icon: FolderOpen },
  { id: 'memory',          label: 'Memory',       icon: Brain },
  { id: 'settings',        label: 'Settings',     icon: Settings },
];

export default function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onOpenLibrary,
  onOpenPersonality,
  onOpenPricing,
  onOpenWallet,
  currentPersonality,
  onMobileClose,
  activeTab = 'chat',
  onTabChange,
}: SidebarProps) {
  const [hoveredId, setHoveredId]       = useState<string | null>(null);
  const [showBrain, setShowBrain]       = useState(false);
  const [showWallet, setShowWallet]     = useState(false);
  const [showMemory, setShowMemory]     = useState(false);
  const [showConvList, setShowConvList] = useState(false);
  const [autoSpeak, setAutoSpeakState]  = useState(() => getAutoSpeak());
  const [ttsVolume, setTtsVolume]       = useState(() => getTTSVolume());
  const { user, subscription, logout }  = useAuth();
  const { wallet }                      = useTokenWallet();
  const navigate                        = useNavigate();

  useEffect(() => {
    const handler = (e: Event) => setAutoSpeakState((e as CustomEvent<{ enabled: boolean }>).detail.enabled);
    window.addEventListener('mockj:autospeak-change', handler);
    return () => window.removeEventListener('mockj:autospeak-change', handler);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => setTtsVolume((e as CustomEvent<{ volume: number }>).detail.volume);
    window.addEventListener('mockj:tts-volume-change', handler);
    return () => window.removeEventListener('mockj:tts-volume-change', handler);
  }, []);

  const handleNavClick = (id: string) => {
    if (id === 'universe') { navigate('/universe'); return; }
    if (id === 'memory')   { setShowMemory(true);   return; }
    if (id === 'settings') { navigate('/account');  return; }
    onTabChange?.(id);
    onMobileClose?.();
  };

  return (
    <>
      <aside
        className="flex flex-col h-full w-52 shrink-0"
        style={{
          background: 'hsl(142 18% 4%)',
          borderRight: `1px solid ${GREEN}20`,
        }}
      >
        {/* ── Logo ─────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-5 pt-6 pb-5">
          <div
            className="w-11 h-11 rounded-xl overflow-hidden shrink-0"
            style={{
              boxShadow: `0 0 20px ${GREEN}55, 0 0 40px ${GREEN}18`,
              border: `1.5px solid ${GREEN}66`,
            }}
          >
            <img src="/mockj-icon.png" alt="MockJ" className="w-full h-full object-cover object-top" />
          </div>
          <div className="min-w-0">
            <h1
              className="font-black text-xl leading-none tracking-wide"
              style={{
                fontFamily: 'Space Grotesk, sans-serif',
                background: `linear-gradient(135deg, ${GREEN}, hsl(142 70% 45%), ${RED})`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              MockJ
            </h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: GREEN, boxShadow: `0 0 6px ${GREEN}` }} />
              <span className="text-[10px] font-semibold" style={{ color: GREEN }}>online</span>
            </div>
          </div>
          {onMobileClose && (
            <button
              onClick={onMobileClose}
              className="md:hidden ml-auto w-7 h-7 flex items-center justify-center rounded-lg"
              style={{ color: `${GREEN}88` }}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* ── Main Nav ─────────────────────────────────────────────── */}
        <nav className="flex flex-col px-3 gap-0.5 flex-1 overflow-y-auto">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => handleNavClick(id)}
                className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 text-left w-full"
                style={{
                  background: isActive ? `${GREEN}14` : 'transparent',
                  color:      isActive ? GREEN      : `${GREEN}66`,
                  border:     isActive ? `1px solid ${GREEN}44` : '1px solid transparent',
                  boxShadow:  isActive ? `0 0 14px ${GREEN}1a` : 'none',
                }}
                onMouseEnter={e => {
                  if (!isActive) {
                    (e.currentTarget as HTMLButtonElement).style.background = `${GREEN}08`;
                    (e.currentTarget as HTMLButtonElement).style.color = `${GREEN}bb`;
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                    (e.currentTarget as HTMLButtonElement).style.color = `${GREEN}66`;
                  }
                }}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
                {isActive && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full" style={{ background: GREEN, boxShadow: `0 0 6px ${GREEN}` }} />
                )}
              </button>
            );
          })}

          {/* Divider */}
          <div className="my-2 border-t" style={{ borderColor: `${GREEN}14` }} />

          {/* Conversation list toggle */}
          {user && conversations.length > 0 && (
            <button
              onClick={() => setShowConvList(v => !v)}
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-semibold w-full transition-all"
              style={{ color: `${GREEN}55`, background: 'transparent' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = `${GREEN}99`; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = `${GREEN}55`; }}
            >
              <MessageSquare className="w-3.5 h-3.5 shrink-0" />
              Recent Chats
              <span className="ml-auto text-[10px] font-black" style={{ color: GREEN }}>
                {conversations.length}
              </span>
            </button>
          )}

          {showConvList && user && conversations.map(conv => (
            <div
              key={conv.id}
              onMouseEnter={() => setHoveredId(conv.id)}
              onMouseLeave={() => setHoveredId(null)}
              className="group flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer transition-all duration-150 ml-2"
              style={{
                background: activeId === conv.id ? `${GREEN}10` : 'transparent',
                border:     activeId === conv.id ? `1px solid ${GREEN}38` : '1px solid transparent',
                color:      activeId === conv.id ? GREEN : `${GREEN}66`,
                boxShadow:  activeId === conv.id ? `0 0 10px ${GREEN}10` : 'none',
              }}
              onClick={() => { onSelect(conv.id); onMobileClose?.(); }}
            >
              <span className="text-xs truncate flex-1">{conv.title}</span>
              {hoveredId === conv.id && (
                <button
                  onClick={e => { e.stopPropagation(); onDelete(conv.id); }}
                  className="opacity-60 hover:opacity-100 transition-opacity"
                  style={{ color: RED }}
                >
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                </button>
              )}
            </div>
          ))}

          {!user && (
            <button
              onClick={() => navigate('/auth')}
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-left w-full transition-all"
              style={{ color: `${GREEN}77`, background: 'transparent' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = GREEN; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = `${GREEN}77`; }}
            >
              <LogIn className="w-4 h-4 shrink-0" />
              Sign In
            </button>
          )}
        </nav>

        {/* ── Bottom strip ─────────────────────────────────────────── */}
        <div className="px-3 py-4 space-y-2" style={{ borderTop: `1px solid ${GREEN}16` }}>
          {/* Token balance */}
          <button
            onClick={() => navigate('/tokens')}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl transition-all"
            style={{
              background: `${GREEN}0a`,
              border: `1px solid ${GREEN}33`,
              color: GREEN,
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = `${GREEN}14`;
              (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 0 12px ${GREEN}20`;
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = `${GREEN}0a`;
              (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
            }}
          >
            <Coins className="w-3.5 h-3.5 shrink-0" />
            <span className="text-xs font-semibold flex-1 text-left">Tokens</span>
            <span className="text-xs font-black tabular-nums">
              {wallet.loading ? '…' : wallet.balance.toLocaleString()}
            </span>
          </button>

          {/* User + logout */}
          {user ? (
            <div className="flex items-center gap-2 px-2">
              <div
                className="w-7 h-7 rounded-full overflow-hidden shrink-0 flex items-center justify-center"
                style={{ background: `${GREEN}14`, border: `1px solid ${GREEN}44` }}
              >
                {user.avatar
                  ? <img src={user.avatar} alt={user.username} className="w-full h-full object-cover" />
                  : <User className="w-3.5 h-3.5" style={{ color: GREEN }} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white truncate">{user.username}</p>
                {subscription.subscribed && (
                  <p className="text-[9px] font-bold" style={{ color: GREEN }}>Pro Active</p>
                )}
              </div>
              <button
                onClick={async () => { await logout(); toast.success('Signed out'); }}
                className="w-6 h-6 flex items-center justify-center rounded-lg transition-colors"
                style={{ color: `${GREEN}44` }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = RED; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = `${GREEN}44`; }}
              >
                <LogOut className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => navigate('/auth')}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-black transition-all shine-sweep relative overflow-hidden"
              style={{
                background: `${GREEN}10`,
                border: `1px solid ${GREEN}44`,
                color: GREEN,
                boxShadow: `0 0 12px ${GREEN}14`,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 0 20px ${GREEN}30`; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 0 12px ${GREEN}14`; }}
            >
              <LogIn className="w-3.5 h-3.5" />
              Sign In Free
            </button>
          )}
        </div>
      </aside>

      {showBrain  && <ProjectBrain onClose={() => setShowBrain(false)} />}
      {showWallet && <WalletPanel  onClose={() => setShowWallet(false)} />}
      {showMemory && <MemoryPanel  onClose={() => setShowMemory(false)} />}
    </>
  );
}
