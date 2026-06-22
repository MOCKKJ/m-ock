/**
 * IDEBuilderPanel.tsx
 * MockJ IDE Builder — Full Replit-style IDE with Monaco editor, file tree,
 * live iframe sandbox, and AI chat for iterative code generation & editing.
 */

import { useState, useRef, useEffect, useCallback, lazy, Suspense } from 'react';
import MonacoEditor from '@monaco-editor/react';
import {
  FolderOpen, FileCode2, ChevronRight, ChevronDown, Play,
  Download, ExternalLink, Sparkles, Loader2, Send, X,
  Monitor, Tablet, Smartphone, Copy, Check, RefreshCw,
  Terminal, Maximize2, Minimize2, Plus, Trash2, Code2,
  MessageSquare, Eye, Save, Zap, Globe,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { getDeviceId } from '@/lib/deviceFingerprint';

// ── Colors ────────────────────────────────────────────────────────────────────
const GREEN  = 'hsl(142 70% 55%)';
const VIOLET = 'hsl(265 80% 65%)';
const CYAN   = 'hsl(191 97% 55%)';
const GOLD   = 'hsl(38 95% 60%)';
const RED    = 'hsl(4 90% 58%)';
const DIM    = 'rgba(160,185,175,0.45)';

// ── Types ─────────────────────────────────────────────────────────────────────
type Viewport = 'desktop' | 'tablet' | 'mobile';
type PanelMode = 'split' | 'editor' | 'preview' | 'chat';

interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  content?: string;
  language?: string;
  children?: FileNode[];
}

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  ts: number;
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function getLangFromName(name: string): string {
  if (name.endsWith('.html')) return 'html';
  if (name.endsWith('.css'))  return 'css';
  if (name.endsWith('.js'))   return 'javascript';
  if (name.endsWith('.ts'))   return 'typescript';
  if (name.endsWith('.json')) return 'json';
  if (name.endsWith('.md'))   return 'markdown';
  return 'plaintext';
}

function makeId() {
  return Math.random().toString(36).slice(2, 9);
}

const STARTER_TEMPLATES: Record<string, FileNode[]> = {
  blank: [
    { id: 'f1', name: 'index.html', type: 'file', language: 'html', content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>My App</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700;900&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Space Grotesk', sans-serif; }
  </style>
</head>
<body class="bg-gray-950 text-white min-h-screen flex items-center justify-center">
  <div class="text-center">
    <h1 class="text-4xl font-black mb-4">Hello World 👋</h1>
    <p class="text-gray-400">Edit this file to get started.</p>
  </div>
</body>
</html>` },
  ],
  saas: [
    { id: 'f1', name: 'index.html', type: 'file', language: 'html', content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AI SaaS Landing</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700;900&family=Inter:wght@400;500&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Inter', sans-serif; background: #020a10; }
    h1,h2,h3 { font-family: 'Space Grotesk', sans-serif; }
    .glow { box-shadow: 0 0 30px rgba(56,189,248,0.3); }
    @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
    .float { animation: float 3s ease-in-out infinite; }
  </style>
</head>
<body class="text-white">
  <nav class="fixed top-0 w-full z-50 backdrop-blur border-b border-sky-900/30 bg-gray-950/80 px-6 py-4 flex items-center justify-between">
    <span class="font-black text-xl text-sky-400">⚡ Acme AI</span>
    <div class="hidden md:flex gap-8 text-sm text-gray-400">
      <a href="#features" class="hover:text-white transition">Features</a>
      <a href="#pricing" class="hover:text-white transition">Pricing</a>
    </div>
    <button class="bg-sky-500 hover:bg-sky-400 text-black font-black px-5 py-2 rounded-xl text-sm transition glow">Get Started Free</button>
  </nav>
  <section class="min-h-screen flex items-center justify-center px-6 pt-20">
    <div class="text-center max-w-3xl">
      <div class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-sky-500/10 border border-sky-500/30 text-sky-400 text-sm mb-6">
        <span class="w-2 h-2 rounded-full bg-sky-400 animate-pulse"></span> New: AI Agent v2 released
      </div>
      <h1 class="text-5xl md:text-7xl font-black mb-6 leading-tight">Build smarter with <span class="text-sky-400">AI</span></h1>
      <p class="text-xl text-gray-400 mb-10">The most powerful AI copilot for teams who move fast. Automate, generate, and ship 10x faster.</p>
      <div class="flex flex-col sm:flex-row gap-4 justify-center">
        <button class="bg-sky-500 hover:bg-sky-400 text-black font-black px-8 py-4 rounded-2xl text-lg transition glow">Start free trial →</button>
        <button class="border border-sky-900 hover:border-sky-500 px-8 py-4 rounded-2xl text-lg transition text-gray-300">Watch demo</button>
      </div>
    </div>
  </section>
</body>
</html>` },
  ],
};

const EXAMPLE_BUILDS = [
  { label: 'SaaS Landing', prompt: 'Create a futuristic AI SaaS landing page with animated hero, features section, pricing table, and FAQ accordion. Dark theme, cyan/purple accents.', template: 'saas' },
  { label: 'Portfolio', prompt: 'Build a minimal dark-mode developer portfolio with animated hero, projects grid, skills, and contact form. Clean, typography-focused.', template: 'blank' },
  { label: 'Dashboard UI', prompt: 'Generate a dark analytics dashboard with sidebar nav, KPI metric cards (revenue, users, sessions), a line chart placeholder, and recent activity table.', template: 'blank' },
  { label: 'E-Commerce', prompt: 'Create an e-commerce store homepage with hero banner, product card grid, categories nav, and shopping cart icon. Minimal, luxury aesthetic.', template: 'blank' },
];

const VIEWPORT_CONFIG = {
  desktop: { width: '100%',   icon: Monitor,    label: 'Desktop' },
  tablet:  { width: '768px',  icon: Tablet,     label: 'Tablet' },
  mobile:  { width: '390px',  icon: Smartphone, label: 'Mobile' },
} as const;

// ── AI call ───────────────────────────────────────────────────────────────────
async function callAI(messages: { role: string; content: string }[], systemPrompt?: string): Promise<string> {
  const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL as string;
  const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  const { data: { session } } = await supabase.auth.getSession();
  const authToken = session?.access_token ?? supabaseKey;

  const res = await fetch(`${supabaseUrl}/functions/v1/mocka-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
      'apikey': supabaseKey,
      'x-device-id': getDeviceId(),
    },
    body: JSON.stringify({
      type: 'chat',
      messages,
      stream: false,
      systemOverride: systemPrompt ?? IDE_SYSTEM_PROMPT,
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `AI request failed: ${res.status}`);
  }

  const data = await res.json();
  return data?.content ?? data?.choices?.[0]?.message?.content ?? '';
}

const IDE_SYSTEM_PROMPT = `You are MockJ IDE — an elite AI developer assistant embedded in a browser-based code editor.

Your role: help users build, edit, debug, and improve web projects in real time.

WHEN GENERATING/EDITING HTML:
- Always return a COMPLETE, valid HTML file starting with <!DOCTYPE html>
- Include Tailwind CSS CDN, Google Fonts, and all CSS/JS inline
- Make it visually stunning and production-quality
- Include smooth animations, hover effects, and responsive design
- NO markdown fences — return raw HTML only

WHEN ANSWERING CODE QUESTIONS:
- Be concise and direct
- Provide working code snippets
- Explain complex parts briefly

WHEN ASKED TO EDIT:
- Return the COMPLETE updated file, not a diff
- Keep the same structure unless asked to redesign
- Apply the change precisely and improve the overall quality

Always respond with intention to SHIP production-ready code.`;

// Monaco language map
const MONACO_LANG_MAP: Record<string, string> = {
  html: 'html', css: 'css', javascript: 'javascript', typescript: 'typescript',
  json: 'json', markdown: 'markdown', plaintext: 'plaintext',
};

// ── File Tree Item ────────────────────────────────────────────────────────────
function FileTreeItem({ node, activeId, depth, onSelect, onDelete }: {
  node: FileNode;
  activeId: string;
  depth: number;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const isActive = node.id === activeId;
  const langColors: Record<string, string> = {
    html: '#e44d26', css: '#264de4', javascript: '#f7df1e',
    typescript: '#007acc', json: GOLD, markdown: DIM,
  };
  const dotColor = langColors[node.language ?? ''] ?? DIM;

  if (node.type === 'folder') {
    return (
      <div>
        <button
          onClick={() => setOpen(v => !v)}
          className="w-full flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-white/5 transition-all text-left"
          style={{ paddingLeft: `${8 + depth * 12}px` }}
        >
          {open ? <ChevronDown className="w-3 h-3 shrink-0" style={{ color: GOLD }} /> : <ChevronRight className="w-3 h-3 shrink-0" style={{ color: GOLD }} />}
          <FolderOpen className="w-3.5 h-3.5 shrink-0" style={{ color: GOLD }} />
          <span className="text-[11px] font-medium text-white/70">{node.name}</span>
        </button>
        {open && node.children?.map(child => (
          <FileTreeItem key={child.id} node={child} activeId={activeId} depth={depth + 1} onSelect={onSelect} onDelete={onDelete} />
        ))}
      </div>
    );
  }

  return (
    <div
      className="group flex items-center gap-1.5 px-2 py-1 rounded-lg cursor-pointer transition-all"
      style={{
        paddingLeft: `${8 + depth * 12}px`,
        background: isActive ? `${GREEN}14` : 'transparent',
        border: isActive ? `1px solid ${GREEN}33` : '1px solid transparent',
      }}
      onClick={() => onSelect(node.id)}
      onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.04)'; }}
      onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
    >
      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor, boxShadow: isActive ? `0 0 6px ${dotColor}` : 'none' }} />
      <span className="text-[11px] font-mono flex-1 truncate" style={{ color: isActive ? '#fff' : 'rgba(200,220,210,0.6)' }}>
        {node.name}
      </span>
      <button
        onClick={e => { e.stopPropagation(); onDelete(node.id); }}
        className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center rounded transition-all"
        style={{ color: RED }}
      >
        <X className="w-2.5 h-2.5" />
      </button>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function IDEBuilderPanel() {
  const { user } = useAuth();
  const iframeRef   = useRef<HTMLIFrameElement>(null);
  const chatEndRef  = useRef<HTMLDivElement>(null);
  const dragRef     = useRef<{ startX: number; startW: number } | null>(null);

  const [files, setFiles]           = useState<FileNode[]>(STARTER_TEMPLATES.blank);
  const [activeFileId, setActiveFileId] = useState<string>('f1');
  const [editorWidth, setEditorWidth]   = useState(50); // percent
  const [viewport, setViewport]         = useState<Viewport>('desktop');
  const [panelMode, setPanelMode]       = useState<PanelMode>('split');
  const [chatOpen, setChatOpen]         = useState(true);

  const [chatInput, setChatInput]       = useState('');
  const [chatMsgs, setChatMsgs]         = useState<ChatMsg[]>([
    { role: 'assistant', content: "Hey! I'm MockJ IDE. Describe what you want to build or paste some code and I'll help you build, edit, or debug it. 🔥", ts: Date.now() },
  ]);
  const [chatLoading, setChatLoading]   = useState(false);

  const [building, setBuilding]         = useState(false);
  const [buildPrompt, setBuildPrompt]   = useState('');
  const [showTemplates, setShowTemplates] = useState(false);
  const [copiedId, setCopiedId]         = useState('');
  const [newFileName, setNewFileName]   = useState('');
  const [addingFile, setAddingFile]     = useState(false);
  const [previewKey, setPreviewKey]     = useState(0);

  // ── Active file ──────────────────────────────────────────────────────────
  const activeFile = files.find(f => f.id === activeFileId) ?? files[0];

  const updateActiveContent = useCallback((content: string) => {
    setFiles(prev => prev.map(f => f.id === activeFileId ? { ...f, content } : f));
  }, [activeFileId]);

  // ── Sync preview ─────────────────────────────────────────────────────────
  const syncPreview = useCallback(() => {
    const html = files.find(f => f.name === 'index.html')?.content ?? activeFile?.content ?? '';
    const iframe = iframeRef.current;
    if (!iframe || !html) return;
    const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
  }, [files, activeFile]);

  useEffect(() => {
    const timer = setTimeout(syncPreview, 500);
    return () => clearTimeout(timer);
  }, [syncPreview]);

  // ── Drag resize ──────────────────────────────────────────────────────────
  const startDrag = (e: React.MouseEvent) => {
    dragRef.current = { startX: e.clientX, startW: editorWidth };
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', stopDrag);
  };

  const onDrag = (e: MouseEvent) => {
    if (!dragRef.current) return;
    const container = document.getElementById('ide-workspace');
    if (!container) return;
    const containerWidth = container.getBoundingClientRect().width;
    const dx = e.clientX - dragRef.current.startX;
    const newW = Math.min(85, Math.max(25, dragRef.current.startW + (dx / containerWidth) * 100));
    setEditorWidth(newW);
  };

  const stopDrag = () => {
    dragRef.current = null;
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', stopDrag);
  };

  // ── Delete file ──────────────────────────────────────────────────────────
  const deleteFile = (id: string) => {
    setFiles(prev => {
      const updated = prev.filter(f => f.id !== id);
      if (id === activeFileId && updated.length > 0) setActiveFileId(updated[0].id);
      return updated;
    });
  };

  // ── Add file ─────────────────────────────────────────────────────────────
  const addFile = () => {
    if (!newFileName.trim()) return;
    const id = makeId();
    const lang = getLangFromName(newFileName);
    setFiles(prev => [...prev, { id, name: newFileName.trim(), type: 'file', language: lang, content: '' }]);
    setActiveFileId(id);
    setNewFileName('');
    setAddingFile(false);
  };

  // ── Build from prompt ─────────────────────────────────────────────────────
  const handleBuild = async () => {
    if (!buildPrompt.trim()) { toast.error('Describe what to build'); return; }
    setBuilding(true);
    try {
      const html = await callAI([{ role: 'user', content: `Build this: ${buildPrompt}` }]);
      const cleaned = cleanHTML(html);
      const existing = files.find(f => f.name === 'index.html');
      if (existing) {
        setFiles(prev => prev.map(f => f.name === 'index.html' ? { ...f, content: cleaned } : f));
        setActiveFileId(existing.id);
      } else {
        const id = makeId();
        setFiles(prev => [{ id, name: 'index.html', type: 'file', language: 'html', content: cleaned }, ...prev]);
        setActiveFileId(id);
      }
      setPreviewKey(k => k + 1);
      toast.success('Built! Previewing in the right pane 🔥');
      setBuildPrompt('');
      setShowTemplates(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Build failed');
    } finally {
      setBuilding(false);
    }
  };

  // ── AI Chat ───────────────────────────────────────────────────────────────
  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = chatInput.trim();
    setChatInput('');
    setChatMsgs(prev => [...prev, { role: 'user', content: userMsg, ts: Date.now() }]);
    setChatLoading(true);

    try {
      const currentCode = activeFile?.content ?? '';
      const contextMsg = currentCode
        ? `Current file (${activeFile?.name}):\n\`\`\`\n${currentCode.slice(0, 4000)}\n\`\`\`\n\nUser request: ${userMsg}`
        : userMsg;

      const history = chatMsgs.slice(-6).map(m => ({ role: m.role, content: m.content }));
      const reply = await callAI([...history, { role: 'user', content: contextMsg }]);

      // If reply contains HTML, extract and apply it
      const htmlMatch = reply.match(/<!DOCTYPE html[\s\S]*<\/html>/i);
      if (htmlMatch) {
        const cleaned = cleanHTML(htmlMatch[0]);
        const target = files.find(f => f.name === 'index.html');
        if (target) {
          setFiles(prev => prev.map(f => f.name === 'index.html' ? { ...f, content: cleaned } : f));
          setActiveFileId(target.id);
        } else {
          const id = makeId();
          setFiles(prev => [{ id, name: 'index.html', type: 'file', language: 'html', content: cleaned }, ...prev]);
          setActiveFileId(id);
        }
        setPreviewKey(k => k + 1);
        setChatMsgs(prev => [...prev, { role: 'assistant', content: '✅ Code applied to editor — check the preview!', ts: Date.now() }]);
      } else {
        setChatMsgs(prev => [...prev, { role: 'assistant', content: reply, ts: Date.now() }]);
      }
    } catch (err) {
      setChatMsgs(prev => [...prev, { role: 'assistant', content: '⚠️ Error — ' + (err instanceof Error ? err.message : 'AI unavailable'), ts: Date.now() }]);
    } finally {
      setChatLoading(false);
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMsgs]);

  // ── Copy file content ─────────────────────────────────────────────────────
  const copyFile = () => {
    navigator.clipboard.writeText(activeFile?.content ?? '').then(() => {
      setCopiedId(activeFileId);
      setTimeout(() => setCopiedId(''), 2000);
      toast.success('Copied!');
    });
  };

  // ── Download project ──────────────────────────────────────────────────────
  const downloadProject = () => {
    const html = files.find(f => f.name === 'index.html')?.content ?? activeFile?.content ?? '';
    if (!html) { toast.error('Nothing to download yet'); return; }
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'index.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Downloaded!');
  };

  // ── Open preview in new tab ───────────────────────────────────────────────
  const openPreview = () => {
    const html = files.find(f => f.name === 'index.html')?.content ?? activeFile?.content ?? '';
    if (!html) return;
    const blob = new Blob([html], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  function cleanHTML(raw: string): string {
    let s = raw.trim()
      .replace(/^```html\s*/i, '').replace(/\s*```\s*$/i, '').trim()
      .replace(/^```\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    const idx = s.indexOf('<!DOCTYPE');
    return idx >= 0 ? s.slice(idx) : s;
  }

  // ── Layout helpers ────────────────────────────────────────────────────────
  const isEditorVisible  = panelMode === 'split' || panelMode === 'editor';
  const isPreviewVisible = panelMode === 'split' || panelMode === 'preview';

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: '#010a02', fontFamily: 'Inter, sans-serif' }}>

      {/* ═══ TOP BAR ═══════════════════════════════════════════════════════ */}
      <div
        className="flex items-center gap-2 px-3 py-2 shrink-0 z-20"
        style={{ background: 'rgba(1, 8, 2, 0.98)', borderBottom: `1px solid ${GREEN}22` }}
      >
        {/* Brand */}
        <div className="flex items-center gap-2 shrink-0 mr-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${GREEN}14`, border: `1px solid ${GREEN}44`, boxShadow: `0 0 10px ${GREEN}22` }}>
            <Code2 className="w-3.5 h-3.5" style={{ color: GREEN }} />
          </div>
          <span className="text-xs font-black text-white hidden sm:block" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>MockJ IDE</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded-full font-black hidden sm:block" style={{ background: `${VIOLET}18`, color: VIOLET, border: `1px solid ${VIOLET}33` }}>BETA</span>
        </div>

        {/* Build prompt bar */}
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <div
            className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${GREEN}22` }}
          >
            <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color: VIOLET }} />
            <input
              value={buildPrompt}
              onChange={e => setBuildPrompt(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleBuild(); }}
              placeholder="Describe what to build and hit Enter…"
              className="flex-1 bg-transparent outline-none text-xs text-white/70 placeholder-white/20 min-w-0"
            />
            <button
              onClick={() => setShowTemplates(v => !v)}
              className="text-[9px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap transition-all hidden sm:block"
              style={{ background: `${CYAN}10`, color: CYAN, border: `1px solid ${CYAN}30` }}
            >
              Examples
            </button>
          </div>
          <button
            onClick={handleBuild}
            disabled={!buildPrompt.trim() || building}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-black transition-all disabled:opacity-40"
            style={{ background: `linear-gradient(135deg, hsl(142 70% 25%), hsl(142 70% 18%))`, border: `1px solid ${GREEN}55`, color: '#fff', boxShadow: `0 0 12px ${GREEN}33` }}
          >
            {building ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{building ? 'Building…' : 'Build'}</span>
          </button>
        </div>

        {/* Panel mode toggles */}
        <div className="flex items-center rounded-xl overflow-hidden shrink-0" style={{ border: `1px solid ${GREEN}22` }}>
          {([
            { mode: 'editor' as PanelMode, icon: FileCode2, label: 'Editor' },
            { mode: 'split'  as PanelMode, icon: Maximize2, label: 'Split' },
            { mode: 'preview' as PanelMode, icon: Eye, label: 'Preview' },
          ] as const).map(({ mode, icon: Icon }, i) => (
            <button
              key={mode}
              onClick={() => setPanelMode(mode)}
              title={mode}
              className="w-8 h-8 flex items-center justify-center transition-all"
              style={{
                background: panelMode === mode ? `${GREEN}18` : 'transparent',
                color: panelMode === mode ? GREEN : `${GREEN}44`,
                borderRight: i < 2 ? `1px solid ${GREEN}18` : 'none',
              }}
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>

        {/* Chat toggle */}
        <button
          onClick={() => setChatOpen(v => !v)}
          className="w-8 h-8 flex items-center justify-center rounded-xl transition-all shrink-0"
          style={{ background: chatOpen ? `${VIOLET}18` : 'transparent', border: `1px solid ${chatOpen ? VIOLET : `${VIOLET}22`}`, color: chatOpen ? VIOLET : `${VIOLET}44` }}
          title="AI Chat"
        >
          <MessageSquare className="w-3.5 h-3.5" />
        </button>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={copyFile} className="w-8 h-8 flex items-center justify-center rounded-xl transition-all" style={{ background: 'transparent', color: DIM, border: `1px solid transparent` }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `${CYAN}10`; (e.currentTarget as HTMLButtonElement).style.color = CYAN; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = DIM; }} title="Copy code">
            {copiedId === activeFileId ? <Check className="w-3.5 h-3.5" style={{ color: GREEN }} /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button onClick={() => setPreviewKey(k => k + 1)} className="w-8 h-8 flex items-center justify-center rounded-xl transition-all" style={{ background: 'transparent', color: DIM, border: 'transparent' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `${GREEN}10`; (e.currentTarget as HTMLButtonElement).style.color = GREEN; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = DIM; }} title="Refresh preview">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button onClick={openPreview} className="w-8 h-8 flex items-center justify-center rounded-xl transition-all" style={{ background: 'transparent', color: DIM, border: 'transparent' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `${CYAN}10`; (e.currentTarget as HTMLButtonElement).style.color = CYAN; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = DIM; }} title="Open in new tab">
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={downloadProject}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-black transition-all"
            style={{ background: `${GREEN}14`, border: `1px solid ${GREEN}44`, color: GREEN }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 0 14px ${GREEN}33`; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none'; }}
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </div>

      {/* ─── Example templates dropdown ─────────────────────────────────── */}
      {showTemplates && (
        <div
          className="absolute top-14 left-1/2 -translate-x-1/2 z-50 w-96 rounded-2xl overflow-hidden shadow-2xl"
          style={{ background: 'rgba(2, 12, 4, 0.97)', border: `1px solid ${GREEN}33`, boxShadow: `0 20px 60px rgba(0,0,0,0.8), 0 0 30px ${GREEN}10` }}
        >
          <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: `1px solid ${GREEN}15` }}>
            <span className="text-xs font-black" style={{ color: GREEN }}>Example Builds</span>
            <button onClick={() => setShowTemplates(false)} style={{ color: DIM }}><X className="w-3.5 h-3.5" /></button>
          </div>
          {EXAMPLE_BUILDS.map(ex => (
            <button
              key={ex.label}
              onClick={() => { setBuildPrompt(ex.prompt); setShowTemplates(false); }}
              className="w-full text-left px-4 py-3 flex items-center gap-3 transition-all"
              style={{ borderBottom: `1px solid ${GREEN}08` }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `${GREEN}08`; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
            >
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${VIOLET}14`, border: `1px solid ${VIOLET}33` }}>
                <Globe className="w-4 h-4" style={{ color: VIOLET }} />
              </div>
              <div>
                <p className="text-xs font-bold text-white">{ex.label}</p>
                <p className="text-[10px] mt-0.5 line-clamp-1" style={{ color: DIM }}>{ex.prompt.slice(0, 60)}…</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ═══ WORKSPACE ═════════════════════════════════════════════════════ */}
      <div className="flex flex-1 overflow-hidden min-h-0">

        {/* ── FILE SIDEBAR ──────────────────────────────────────────────── */}
        <div
          className="flex flex-col shrink-0 overflow-y-auto"
          style={{ width: 180, background: 'rgba(1, 6, 2, 0.98)', borderRight: `1px solid ${GREEN}18` }}
        >
          {/* Files header */}
          <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: `1px solid ${GREEN}10` }}>
            <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: `${GREEN}66` }}>Files</span>
            <button
              onClick={() => setAddingFile(v => !v)}
              className="w-5 h-5 flex items-center justify-center rounded transition-all"
              style={{ color: addingFile ? GREEN : `${GREEN}55` }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = GREEN; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = addingFile ? GREEN : `${GREEN}55`; }}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Add file input */}
          {addingFile && (
            <div className="px-2 py-1.5" style={{ borderBottom: `1px solid ${GREEN}10` }}>
              <input
                autoFocus
                value={newFileName}
                onChange={e => setNewFileName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addFile(); if (e.key === 'Escape') setAddingFile(false); }}
                placeholder="filename.html"
                className="w-full bg-transparent outline-none text-[11px] font-mono text-white/70 placeholder-white/20 px-2 py-1 rounded-lg"
                style={{ background: `${GREEN}08`, border: `1px solid ${GREEN}33` }}
              />
            </div>
          )}

          {/* File tree */}
          <div className="flex-1 py-1.5 overflow-y-auto">
            {files.map(node => (
              <FileTreeItem
                key={node.id}
                node={node}
                activeId={activeFileId}
                depth={0}
                onSelect={setActiveFileId}
                onDelete={deleteFile}
              />
            ))}
          </div>

          {/* Bottom info */}
          <div className="px-3 py-2" style={{ borderTop: `1px solid ${GREEN}10` }}>
            <p className="text-[9px]" style={{ color: `${GREEN}44` }}>{files.length} file{files.length !== 1 ? 's' : ''}</p>
            <p className="text-[9px]" style={{ color: `${GREEN}33` }}>{activeFile?.content?.length ?? 0} chars</p>
          </div>
        </div>

        {/* ── MAIN WORKSPACE ────────────────────────────────────────────── */}
        <div id="ide-workspace" className="flex flex-1 overflow-hidden min-w-0">

          {/* EDITOR PANE */}
          {isEditorVisible && (
            <div
              className="flex flex-col overflow-hidden"
              style={{ width: panelMode === 'editor' ? '100%' : `${editorWidth}%` }}
            >
              {/* Editor tab bar */}
              <div
                className="flex items-center gap-0 shrink-0 overflow-x-auto"
                style={{ background: 'rgba(1, 6, 2, 0.98)', borderBottom: `1px solid ${GREEN}15`, minHeight: 34 }}
              >
                {files.map(f => {
                  const isActive = f.id === activeFileId;
                  const dotColors: Record<string, string> = { html: '#e44d26', css: '#264de4', javascript: '#f7df1e', typescript: '#007acc' };
                  const dot = dotColors[f.language ?? ''] ?? DIM;
                  return (
                    <button
                      key={f.id}
                      onClick={() => setActiveFileId(f.id)}
                      className="flex items-center gap-2 px-4 py-2 text-[11px] font-mono whitespace-nowrap transition-all border-r"
                      style={{
                        background: isActive ? 'rgba(255,255,255,0.05)' : 'transparent',
                        color: isActive ? '#fff' : 'rgba(200,220,210,0.45)',
                        borderRightColor: `${GREEN}15`,
                        borderBottom: isActive ? `1px solid ${GREEN}` : '1px solid transparent',
                      }}
                    >
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: dot }} />
                      {f.name}
                    </button>
                  );
                })}
              </div>

              {/* Monaco Editor */}
              <div className="flex-1 overflow-hidden" style={{ background: '#010802' }}>
                <MonacoEditor
                  value={activeFile?.content ?? ''}
                  language={MONACO_LANG_MAP[activeFile?.language ?? 'html'] ?? 'html'}
                  theme="vs-dark"
                  onChange={(val) => updateActiveContent(val ?? '')}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 12,
                    lineHeight: 20,
                    fontFamily: '"Fira Code", "Cascadia Code", "JetBrains Mono", monospace',
                    fontLigatures: true,
                    padding: { top: 12, bottom: 12 },
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                    automaticLayout: true,
                    tabSize: 2,
                    insertSpaces: true,
                    formatOnPaste: true,
                    formatOnType: false,
                    bracketPairColorization: { enabled: true },
                    guides: { bracketPairs: true, indentation: true },
                    scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
                    lineNumbersMinChars: 3,
                    glyphMargin: false,
                    folding: true,
                    renderLineHighlight: 'line',
                    suggest: { showKeywords: true, showSnippets: true },
                    quickSuggestions: { other: true, comments: false, strings: false },
                    acceptSuggestionOnEnter: 'smart',
                    cursorBlinking: 'smooth',
                    smoothScrolling: true,
                    overviewRulerLanes: 0,
                  }}
                  loading={
                    <div className="w-full h-full flex items-center justify-center" style={{ background: '#010802' }}>
                      <Loader2 className="w-5 h-5 animate-spin" style={{ color: GREEN }} />
                    </div>
                  }
                />
              </div>
            </div>
          )}

          {/* DRAG HANDLE */}
          {panelMode === 'split' && (
            <div
              className="w-1.5 shrink-0 cursor-col-resize hover:w-2 transition-all group flex items-center justify-center"
              style={{ background: `${GREEN}08`, borderLeft: `1px solid ${GREEN}18`, borderRight: `1px solid ${GREEN}18` }}
              onMouseDown={startDrag}
            >
              <div className="w-0.5 h-8 rounded-full opacity-0 group-hover:opacity-100 transition-all" style={{ background: GREEN }} />
            </div>
          )}

          {/* PREVIEW PANE */}
          {isPreviewVisible && (
            <div
              className="flex flex-col overflow-hidden"
              style={{ flex: panelMode === 'preview' ? 1 : undefined, width: panelMode === 'split' ? `${100 - editorWidth - 0.5}%` : undefined }}
            >
              {/* Preview toolbar */}
              <div
                className="flex items-center gap-2 px-3 py-1.5 shrink-0"
                style={{ background: 'rgba(1, 6, 2, 0.98)', borderBottom: `1px solid ${GREEN}15`, minHeight: 34 }}
              >
                {/* Browser dots */}
                <div className="flex items-center gap-1 mr-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'rgba(255,90,90,0.6)' }} />
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'rgba(255,190,80,0.6)' }} />
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'rgba(70,210,70,0.6)' }} />
                </div>

                {/* URL bar */}
                <div className="flex-1 px-2.5 py-0.5 rounded-md text-[10px] font-mono text-center" style={{ background: 'rgba(255,255,255,0.04)', color: `${GREEN}55` }}>
                  localhost:3000 / {activeFile?.name ?? 'index.html'}
                </div>

                {/* Viewport */}
                <div className="flex items-center rounded-lg overflow-hidden" style={{ border: `1px solid ${GREEN}18` }}>
                  {(Object.entries(VIEWPORT_CONFIG) as [Viewport, typeof VIEWPORT_CONFIG[Viewport]][]).map(([vp, { icon: Icon }]) => (
                    <button
                      key={vp}
                      onClick={() => setViewport(vp)}
                      className="w-6 h-6 flex items-center justify-center transition-all"
                      style={{ background: viewport === vp ? `${GREEN}18` : 'transparent', color: viewport === vp ? GREEN : `${GREEN}33` }}
                    >
                      <Icon className="w-3 h-3" />
                    </button>
                  ))}
                </div>

                <button onClick={() => setPreviewKey(k => k + 1)} className="w-6 h-6 flex items-center justify-center rounded transition-all" style={{ color: `${GREEN}44` }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = GREEN; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = `${GREEN}44`; }}>
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>

              {/* Iframe wrapper */}
              <div className="flex-1 overflow-auto flex items-start justify-center p-0" style={{ background: 'hsl(224 20% 5%)' }}>
                <div
                  className="h-full"
                  style={{
                    width: VIEWPORT_CONFIG[viewport].width,
                    maxWidth: '100%',
                    minWidth: 300,
                    transition: 'width 0.3s ease',
                  }}
                >
                  <iframe
                    key={previewKey}
                    ref={iframeRef}
                    className="w-full h-full"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                    title="Live Preview"
                    style={{ border: 'none', background: '#fff' }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── AI CHAT SIDEBAR ───────────────────────────────────────────── */}
        {chatOpen && (
          <div
            className="flex flex-col shrink-0 overflow-hidden"
            style={{ width: 280, borderLeft: `1px solid ${VIOLET}22`, background: 'rgba(4, 2, 12, 0.98)' }}
          >
            {/* Chat header */}
            <div className="flex items-center gap-2 px-3 py-2.5 shrink-0" style={{ borderBottom: `1px solid ${VIOLET}18` }}>
              <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: `${VIOLET}18`, border: `1px solid ${VIOLET}44` }}>
                <Sparkles className="w-3.5 h-3.5" style={{ color: VIOLET }} />
              </div>
              <span className="text-xs font-black text-white">MockJ AI</span>
              <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: `${GREEN}14`, color: GREEN, border: `1px solid ${GREEN}33` }}>
                <span className="animate-pulse inline-block w-1 h-1 rounded-full mr-1" style={{ background: GREEN }} />
                Live
              </span>
              <button onClick={() => setChatOpen(false)} className="w-4 h-4 flex items-center justify-center ml-1" style={{ color: DIM }}>
                <X className="w-3 h-3" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
              {chatMsgs.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className="max-w-[90%] px-3 py-2 rounded-xl text-[11px] leading-relaxed"
                    style={msg.role === 'user'
                      ? { background: `${GREEN}18`, border: `1px solid ${GREEN}33`, color: '#e8f5e9' }
                      : { background: 'rgba(255,255,255,0.05)', border: `1px solid rgba(255,255,255,0.08)`, color: 'rgba(200,220,210,0.8)' }
                    }
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="px-3 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${VIOLET}22` }}>
                    <Loader2 className="w-3 h-3 animate-spin" style={{ color: VIOLET }} />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="px-3 py-2.5 shrink-0" style={{ borderTop: `1px solid ${VIOLET}18` }}>
              <div className="flex items-end gap-2 px-3 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${VIOLET}25` }}>
                <textarea
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                  placeholder="Ask me to edit, explain, or build anything…"
                  rows={2}
                  className="flex-1 bg-transparent resize-none outline-none text-[11px] text-white/60 placeholder-white/20 leading-relaxed"
                />
                <button
                  onClick={sendChat}
                  disabled={!chatInput.trim() || chatLoading}
                  className="w-6 h-6 flex items-center justify-center rounded-lg transition-all disabled:opacity-30"
                  style={{ background: `${VIOLET}22`, border: `1px solid ${VIOLET}44`, color: VIOLET }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `${VIOLET}35`; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = `${VIOLET}22`; }}
                >
                  <Send className="w-3 h-3" />
                </button>
              </div>
              <p className="text-[9px] mt-1.5 text-center" style={{ color: `${VIOLET}44` }}>
                Enter to send · Shift+Enter for new line
              </p>
            </div>

            {/* Quick prompts */}
            <div className="px-3 pb-3 flex flex-wrap gap-1.5">
              {[
                'Add dark mode toggle',
                'Make it mobile-friendly',
                'Add smooth animations',
                'Improve the design',
                'Add a contact form',
              ].map(q => (
                <button
                  key={q}
                  onClick={() => setChatInput(q)}
                  className="px-2 py-1 rounded-full text-[9px] font-bold transition-all"
                  style={{ background: `${VIOLET}0c`, border: `1px solid ${VIOLET}25`, color: `${VIOLET}88` }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `${VIOLET}18`; (e.currentTarget as HTMLButtonElement).style.color = VIOLET; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = `${VIOLET}0c`; (e.currentTarget as HTMLButtonElement).style.color = `${VIOLET}88`; }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
