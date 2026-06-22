/**
 * MemoryPanel.tsx
 * MockJ Memory — save personal context (name, business, preferences) to
 * user_knowledge_base so MockJ remembers you across sessions.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Brain, Plus, Trash2, Edit3, Check, X, Tag, Loader2,
  Sparkles, ChevronDown, ChevronUp, Info,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ─────────────────────────────────────────────────────────────────────────────

interface MemoryEntry {
  id: string;
  title: string;
  content: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

interface MemoryPanelProps {
  onClose: () => void;
}

// Quick-add templates
const TEMPLATES: { icon: string; title: string; content: string; tags: string[] }[] = [
  {
    icon: '👤',
    title: 'My Name & Role',
    content: 'My name is [Your Name]. I am a [your role/profession] based in [city/country].',
    tags: ['identity'],
  },
  {
    icon: '🏢',
    title: 'My Business',
    content: 'My business is called [Business Name]. We [describe what you do]. Our target customers are [target audience]. Current focus: [current goal].',
    tags: ['business'],
  },
  {
    icon: '🎯',
    title: 'My Goals',
    content: 'My current main goals are: 1) [Goal 1] 2) [Goal 2] 3) [Goal 3]. Timeline: [timeframe].',
    tags: ['goals'],
  },
  {
    icon: '💰',
    title: 'Trading Style',
    content: 'I trade [stocks/crypto/forex]. My preferred timeframe is [timeframe]. My risk tolerance is [low/medium/high]. Account size: [range]. Preferred strategies: [strategies].',
    tags: ['trading', 'finance'],
  },
  {
    icon: '⚙️',
    title: 'Tech Stack',
    content: 'My tech stack includes: [languages/frameworks]. I primarily work with [specific tools]. Experience level: [beginner/intermediate/senior].',
    tags: ['tech', 'coding'],
  },
  {
    icon: '🎨',
    title: 'Creative Preferences',
    content: 'My design/creative style preferences: [style]. Brand colors: [colors]. Tone of voice for my projects: [tone]. Audience: [audience].',
    tags: ['creative', 'design'],
  },
];

// ─────────────────────────────────────────────────────────────────────────────

export default function MemoryPanel({ onClose }: MemoryPanelProps) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  // New / edit form state
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formTags, setFormTags] = useState('');

  // ── Load entries ─────────────────────────────────────────────────────────
  const fetchEntries = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('user_knowledge_base')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });
    if (error) {
      toast.error('Failed to load memory entries');
    } else {
      setEntries((data ?? []) as MemoryEntry[]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  // ── Save (create or update) ──────────────────────────────────────────────
  const handleSave = async () => {
    if (!user) { toast.error('Sign in to save memories'); return; }
    if (!formTitle.trim() || !formContent.trim()) {
      toast.error('Title and content are required');
      return;
    }
    setSaving(true);
    const tags = formTags
      .split(',')
      .map(t => t.trim().toLowerCase())
      .filter(Boolean);

    if (editingId) {
      const { error } = await supabase
        .from('user_knowledge_base')
        .update({ title: formTitle.trim(), content: formContent.trim(), tags, updated_at: new Date().toISOString() })
        .eq('id', editingId)
        .eq('user_id', user.id);
      if (error) { toast.error('Failed to update memory'); }
      else {
        toast.success('Memory updated ✓');
        resetForm();
        fetchEntries();
      }
    } else {
      const { error } = await supabase
        .from('user_knowledge_base')
        .insert({ user_id: user.id, title: formTitle.trim(), content: formContent.trim(), tags });
      if (error) { toast.error('Failed to save memory'); }
      else {
        toast.success('Memory saved — MockJ will remember this 🧠');
        resetForm();
        fetchEntries();
      }
    }
    setSaving(false);
  };

  // ── Delete ───────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!user) return;
    const { error } = await supabase
      .from('user_knowledge_base')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) { toast.error('Failed to delete memory'); }
    else {
      toast.success('Memory removed');
      setEntries(prev => prev.filter(e => e.id !== id));
      if (editingId === id) resetForm();
    }
  };

  // ── Edit ─────────────────────────────────────────────────────────────────
  const startEdit = (entry: MemoryEntry) => {
    setEditingId(entry.id);
    setFormTitle(entry.title);
    setFormContent(entry.content);
    setFormTags(entry.tags.join(', '));
    setShowAdd(true);
    setShowTemplates(false);
  };

  const resetForm = () => {
    setEditingId(null);
    setFormTitle('');
    setFormContent('');
    setFormTags('');
    setShowAdd(false);
  };

  // ── Use template ─────────────────────────────────────────────────────────
  const useTemplate = (tpl: typeof TEMPLATES[0]) => {
    setFormTitle(tpl.title);
    setFormContent(tpl.content);
    setFormTags(tpl.tags.join(', '));
    setEditingId(null);
    setShowTemplates(false);
    setShowAdd(true);
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4">
      <div
        className="relative w-full sm:max-w-lg bg-[hsl(224_20%_7%)] border border-border rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: '92vh' }}
      >
        {/* ── Header ── */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-[hsl(224_20%_6%)] shrink-0">
          <div className="w-9 h-9 rounded-xl bg-[hsl(191_97%_55%_/_0.12)] border border-[hsl(191_97%_55%_/_0.3)] flex items-center justify-center shrink-0">
            <Brain className="w-4.5 h-4.5 text-[hsl(191_97%_55%)]" style={{ width: '18px', height: '18px' }} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-sm text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              MockJ Memory
            </h2>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {entries.length} saved · Injected into every chat
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center border border-border text-muted-foreground hover:text-foreground hover:border-[hsl(224_15%_26%)] transition-all"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* ── How it works banner ── */}
        <div className="mx-4 mt-3 px-3 py-2.5 rounded-xl border border-[hsl(191_97%_55%_/_0.2)] bg-[hsl(191_97%_55%_/_0.05)] flex items-start gap-2.5 shrink-0">
          <Info className="w-3.5 h-3.5 text-[hsl(191_97%_55%)] mt-0.5 shrink-0" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Everything you save here is silently injected at the start of every chat — MockJ will know your name, business, preferences, and goals without you having to repeat them.
          </p>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">

          {/* ── Not signed in ── */}
          {!user && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
              <Brain className="w-10 h-10 text-muted-foreground opacity-30" />
              <p className="text-sm font-semibold text-foreground">Sign in to use MockJ Memory</p>
              <p className="text-xs text-muted-foreground">Memories are private and synced to your account.</p>
            </div>
          )}

          {/* ── Loading ── */}
          {user && loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 text-[hsl(191_97%_55%)] animate-spin" />
            </div>
          )}

          {/* ── Content ── */}
          {user && !loading && (
            <>
              {/* Add / Edit form */}
              {showAdd ? (
                <div className="rounded-2xl border border-[hsl(191_97%_55%_/_0.35)] bg-[hsl(191_97%_55%_/_0.04)] p-4 space-y-3">
                  <div className="flex items-center justify-between mb-0.5">
                    <p className="text-xs font-bold text-[hsl(191_97%_55%)]">
                      {editingId ? 'Edit Memory' : 'New Memory'}
                    </p>
                    <button
                      onClick={resetForm}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Title */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                      Title
                    </label>
                    <input
                      value={formTitle}
                      onChange={e => setFormTitle(e.target.value)}
                      placeholder="e.g. My Business, My Goals, Trading Style..."
                      maxLength={100}
                      className="w-full bg-[hsl(224_15%_9%)] border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-[hsl(191_97%_55%_/_0.5)] transition-all"
                    />
                  </div>

                  {/* Content */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                      Content
                    </label>
                    <textarea
                      value={formContent}
                      onChange={e => setFormContent(e.target.value)}
                      placeholder="Describe what MockJ should remember about you..."
                      rows={4}
                      maxLength={2000}
                      className="w-full bg-[hsl(224_15%_9%)] border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-[hsl(191_97%_55%_/_0.5)] resize-none transition-all leading-relaxed"
                    />
                    <p className="text-[10px] text-muted-foreground/50 text-right">
                      {formContent.length}/2000
                    </p>
                  </div>

                  {/* Tags */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                      Tags (comma separated)
                    </label>
                    <input
                      value={formTags}
                      onChange={e => setFormTags(e.target.value)}
                      placeholder="e.g. business, trading, personal"
                      className="w-full bg-[hsl(224_15%_9%)] border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-[hsl(191_97%_55%_/_0.5)] transition-all"
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={handleSave}
                      disabled={saving || !formTitle.trim() || !formContent.trim()}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 active:scale-[0.97]',
                        formTitle.trim() && formContent.trim() && !saving
                          ? 'bg-[hsl(191_97%_55%)] text-[hsl(224_20%_6%)] hover:bg-[hsl(191_97%_65%)] shadow-[0_0_16px_hsl(191_97%_55%_/_0.25)]'
                          : 'bg-[hsl(224_15%_12%)] text-muted-foreground cursor-not-allowed'
                      )}
                    >
                      {saving
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Check className="w-4 h-4" />
                      }
                      {saving ? 'Saving…' : editingId ? 'Update Memory' : 'Save Memory'}
                    </button>
                    <button
                      onClick={resetForm}
                      className="px-4 py-2.5 rounded-xl text-sm font-medium border border-border text-muted-foreground hover:text-foreground hover:border-[hsl(224_15%_24%)] transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* Action Buttons Row */
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setShowAdd(true); setShowTemplates(false); setEditingId(null); }}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold bg-[hsl(191_97%_55%_/_0.1)] border border-[hsl(191_97%_55%_/_0.35)] text-[hsl(191_97%_55%)] hover:bg-[hsl(191_97%_55%_/_0.18)] transition-all duration-200 active:scale-[0.97]"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Memory
                  </button>
                  <button
                    onClick={() => setShowTemplates(v => !v)}
                    className={cn(
                      'flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold border transition-all duration-200',
                      showTemplates
                        ? 'bg-[hsl(265_80%_65%_/_0.12)] border-[hsl(265_80%_65%_/_0.4)] text-[hsl(265_80%_65%)]'
                        : 'border-border text-muted-foreground hover:text-foreground hover:border-[hsl(224_15%_24%)]'
                    )}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Templates
                    {showTemplates
                      ? <ChevronUp className="w-3 h-3" />
                      : <ChevronDown className="w-3 h-3" />
                    }
                  </button>
                </div>
              )}

              {/* Templates grid */}
              {showTemplates && !showAdd && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 animate-message-in">
                  {TEMPLATES.map((tpl, i) => (
                    <button
                      key={i}
                      onClick={() => useTemplate(tpl)}
                      className="flex items-start gap-2.5 p-3 rounded-xl border border-border bg-[hsl(224_15%_9%)] hover:border-[hsl(265_80%_65%_/_0.4)] hover:bg-[hsl(265_80%_65%_/_0.05)] transition-all duration-150 text-left group"
                    >
                      <span className="text-lg shrink-0 mt-0.5">{tpl.icon}</span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foreground group-hover:text-[hsl(265_80%_75%)] transition-colors">
                          {tpl.title}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                          {tpl.content.slice(0, 80)}…
                        </p>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {tpl.tags.map(tag => (
                            <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded-full bg-[hsl(265_80%_65%_/_0.1)] border border-[hsl(265_80%_65%_/_0.2)] text-[hsl(265_80%_65%)]">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Memory List */}
              {entries.length === 0 && !showAdd && !showTemplates && (
                <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                  <div className="w-12 h-12 rounded-xl bg-[hsl(191_97%_55%_/_0.08)] border border-[hsl(191_97%_55%_/_0.2)] flex items-center justify-center">
                    <Brain className="w-5 h-5 text-[hsl(191_97%_55%_/_0.5)]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">No memories yet</p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      Add your name, business info, goals or preferences — MockJ will know this in every conversation.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowTemplates(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-[hsl(191_97%_55%_/_0.1)] border border-[hsl(191_97%_55%_/_0.3)] text-[hsl(191_97%_55%)] hover:bg-[hsl(191_97%_55%_/_0.18)] transition-all"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Browse Templates
                  </button>
                </div>
              )}

              {entries.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest px-0.5">
                    Saved Memories ({entries.length})
                  </p>
                  {entries.map(entry => (
                    <MemoryCard
                      key={entry.id}
                      entry={entry}
                      onEdit={() => startEdit(entry)}
                      onDelete={() => handleDelete(entry.id)}
                      isEditing={editingId === entry.id}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-5 py-3 border-t border-border bg-[hsl(224_20%_6%)] shrink-0">
          <p className="text-[10px] text-muted-foreground/50 text-center">
            Memories are private · Only you can see them · Encrypted at rest
          </p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MemoryCard
// ─────────────────────────────────────────────────────────────────────────────

function MemoryCard({
  entry,
  onEdit,
  onDelete,
  isEditing,
}: {
  entry: MemoryEntry;
  onEdit: () => void;
  onDelete: () => void;
  isEditing: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLong = entry.content.length > 140;

  return (
    <div
      className={cn(
        'group rounded-xl border bg-[hsl(224_15%_9%)] transition-all duration-200 overflow-hidden',
        isEditing
          ? 'border-[hsl(191_97%_55%_/_0.5)] shadow-[0_0_12px_hsl(191_97%_55%_/_0.1)]'
          : 'border-border hover:border-[hsl(224_15%_22%)]'
      )}
    >
      {/* Card header */}
      <div className="flex items-start gap-2.5 px-3.5 pt-3 pb-2">
        <Brain className="w-3.5 h-3.5 text-[hsl(191_97%_55%)] mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground truncate">{entry.title}</p>
          <p className="text-[10px] text-muted-foreground/50 mt-0.5">
            Updated {new Date(entry.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={onEdit}
            className="w-6 h-6 rounded-lg flex items-center justify-center border border-border text-muted-foreground hover:text-[hsl(191_97%_55%)] hover:border-[hsl(191_97%_55%_/_0.4)] transition-all"
            title="Edit"
          >
            <Edit3 className="w-3 h-3" />
          </button>
          <button
            onClick={onDelete}
            className="w-6 h-6 rounded-lg flex items-center justify-center border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-all"
            title="Delete"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-3.5 pb-2">
        <p className={cn(
          'text-xs text-muted-foreground leading-relaxed',
          !expanded && isLong ? 'line-clamp-3' : ''
        )}>
          {entry.content}
        </p>
        {isLong && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="flex items-center gap-1 text-[10px] text-[hsl(191_97%_55%)] mt-1 hover:underline transition-all"
          >
            {expanded ? <><ChevronUp className="w-3 h-3" /> Show less</> : <><ChevronDown className="w-3 h-3" /> Show more</>}
          </button>
        )}
      </div>

      {/* Tags */}
      {entry.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3.5 pb-3">
          {entry.tags.map(tag => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full border border-[hsl(191_97%_55%_/_0.2)] bg-[hsl(191_97%_55%_/_0.07)] text-[hsl(191_97%_65%)]"
            >
              <Tag className="w-2 h-2" />{tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
