/**
 * PhotoRecreator — MockJ Photo Recreator
 * Upload a photo → choose a creation option → AI generates while preserving identity
 * Supports both modal overlay (default) and inline (isInline) modes.
 */
import { useState, useRef, useCallback } from 'react';
import {
  X, Upload, Sparkles, CheckCircle2, Shield, Camera,
  UserCheck, Briefcase, Film, Instagram, Wand2, AlertTriangle, Loader2,
} from 'lucide-react';
import { generateImage } from '@/lib/mockAI';
import { Analytics } from '@/lib/analytics';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface PhotoRecreatorProps {
  onClose: () => void;
  onResult?: (imageUrl: string, prompt: string) => void;
  /** When true, renders inline inside a panel (no modal overlay). */
  isInline?: boolean;
}

interface Option {
  id: string;
  icon: typeof Camera;
  label: string;
  desc: string;
  color: string;
  promptFn: (custom?: string) => string;
}

const OPTIONS: Option[] = [
  {
    id: 'realistic',
    icon: UserCheck,
    label: 'Recreate Realistically',
    desc: 'Ultra-realistic portrait with clean lighting',
    color: 'hsl(191 97% 55%)',
    promptFn: () =>
      'Recreate this person as an ultra-realistic portrait. Preserve their facial features, skin tone, hair, and identity exactly. Use clean, professional photography lighting, sharp focus, natural skin texture, high detail. Keep everything true to the original person.',
  },
  {
    id: 'outfit',
    icon: Wand2,
    label: 'New Outfit',
    desc: 'Put them in a stylish new look',
    color: 'hsl(265 80% 65%)',
    promptFn: () =>
      "Keep the person's face, identity, and physical features exactly the same. Change only their outfit to a modern, stylish, fashionable look. Professional photography quality, clean background, natural lighting, sharp details.",
  },
  {
    id: 'headshot',
    icon: Briefcase,
    label: 'Professional Headshot',
    desc: 'LinkedIn-ready corporate photo',
    color: 'hsl(142 70% 55%)',
    promptFn: () =>
      'Create a professional corporate headshot of this person. Preserve their exact facial features and identity. Use clean studio lighting, neutral background (white, gray, or soft gradient), business-appropriate attire, sharp focus, high resolution. LinkedIn/resume quality portrait.',
  },
  {
    id: 'cinematic',
    icon: Film,
    label: 'Cinematic Portrait',
    desc: 'Movie-grade dramatic lighting',
    color: 'hsl(4 90% 58%)',
    promptFn: () =>
      'Transform this person into a cinematic movie portrait. Preserve their exact face and identity. Apply dramatic film-grade lighting, shallow depth of field, cinematic color grading, professional camera look. Bokeh background, high production value, Hollywood quality.',
  },
  {
    id: 'social',
    icon: Instagram,
    label: 'Social Media Photo',
    desc: 'Vibrant, high-engagement photo',
    color: 'hsl(38 95% 60%)',
    promptFn: () =>
      'Create a vibrant, eye-catching social media photo of this person. Keep their face and identity identical. Use beautiful natural lighting, colorful/interesting background, trendy composition, high energy, Instagram/TikTok quality, warm and engaging look.',
  },
  {
    id: 'custom',
    icon: Camera,
    label: 'Custom Prompt',
    desc: 'Describe exactly what you want',
    color: 'hsl(200 80% 60%)',
    promptFn: (custom) =>
      `Transform this person as follows: ${custom ?? 'describe a creative transformation'}. Always preserve the exact facial features, identity, skin tone, and physical characteristics of the original person. High realism, sharp details, natural skin texture.`,
  },
];

export default function PhotoRecreator({ onClose, onResult, isInline = false }: PhotoRecreatorProps) {
  const [phase, setPhase] = useState<'upload' | 'options' | 'generating' | 'result'>('upload');
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [selectedOption, setSelectedOption] = useState<Option | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [dragging, setDragging] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadFile = useCallback((file: File) => {
    if (file.size > 10 * 1024 * 1024) { toast.error('Image must be under 10MB'); return; }
    if (!file.type.startsWith('image/')) { toast.error('Please upload an image file'); return; }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setPhotoDataUrl(reader.result as string);
      setPhase('options');
    };
    reader.readAsDataURL(file);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (f) loadFile(f);
  };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
  const handleDragLeave = () => setDragging(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files?.[0]; if (f) loadFile(f);
  };

  const handleGenerate = async () => {
    if (!selectedOption || !photoDataUrl) return;
    if (selectedOption.id === 'custom' && !customPrompt.trim()) {
      toast.error('Please describe what you want to create.');
      return;
    }

    setPhase('generating');
    setError(null);

    const prompt = selectedOption.promptFn(
      selectedOption.id === 'custom' ? customPrompt.trim() : undefined
    );

    try {
      Analytics.imageSent();
      const url = await generateImage({
        prompt,
        style: 'realistic',
        aspectRatio: '1:1',
        quality: '2K',
        sourceImageDataUrl: photoDataUrl,
      });
      setResultUrl(url);
      setPhase('result');
      onResult?.(url, prompt);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Generation failed';
      setError(msg);
      setPhase('options');
      toast.error(msg);
    }
  };

  const handleReset = () => {
    setPhase('upload');
    setPhotoDataUrl(null);
    setSelectedOption(null);
    setCustomPrompt('');
    setResultUrl(null);
    setError(null);
    setConsentChecked(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDownload = () => {
    if (!resultUrl) return;
    const a = document.createElement('a');
    a.href = resultUrl;
    a.download = `mockj-photo-${Date.now()}.png`;
    a.target = '_blank';
    a.click();
  };

  // ── Shared body content ──────────────────────────────────────────────────
  const body = (
    <>
      {/* UPLOAD */}
      {phase === 'upload' && (
        <div className="p-6 space-y-5">
          <div className="flex items-start gap-3 p-4 rounded-xl bg-[hsl(191_97%_55%_/_0.06)] border border-[hsl(191_97%_55%_/_0.2)]">
            <Shield className="w-4 h-4 text-[hsl(191_97%_55%)] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs font-semibold text-foreground">Safety &amp; Consent</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Only upload photos of yourself or photos you have permission to use.
                Sexual, nude, or exploitative requests are blocked.
              </p>
            </div>
          </div>
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'flex flex-col items-center gap-4 py-10 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200',
              dragging ? 'border-[hsl(4_90%_58%)] bg-[hsl(4_90%_58%_/_0.08)]'
                       : 'border-border hover:border-[hsl(4_90%_58%_/_0.4)] hover:bg-[hsl(4_90%_58%_/_0.03)]'
            )}
          >
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'hsl(4 90% 58% / 0.1)', border: '1px solid hsl(4 90% 58% / 0.3)' }}>
              <Upload className="w-6 h-6" style={{ color: 'hsl(4 90% 58%)' }} />
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-foreground">Upload your photo</p>
              <p className="text-xs text-muted-foreground mt-1">Click or drag &amp; drop · PNG, JPG, WebP · Max 10MB</p>
            </div>
          </div>
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFileChange} className="hidden" />
          <label className="flex items-start gap-3 cursor-pointer group">
            <div
              onClick={() => setConsentChecked(v => !v)}
              className={cn('w-4 h-4 rounded border shrink-0 mt-0.5 flex items-center justify-center transition-all', consentChecked ? 'bg-[hsl(4_90%_58%)] border-[hsl(4_90%_58%)]' : 'border-border')}
            >
              {consentChecked && <CheckCircle2 className="w-3 h-3 text-white" />}
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed group-hover:text-foreground transition-colors">
              I confirm this photo is of me or I have permission to use it. I agree not to create exploitative or harmful content.
            </p>
          </label>
        </div>
      )}

      {/* OPTIONS */}
      {phase === 'options' && photoDataUrl && (
        <div className="p-5 space-y-5">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-[hsl(224_15%_10%)] border border-border">
            <div className="w-14 h-14 rounded-xl overflow-hidden border border-border shrink-0">
              <img src={photoDataUrl} alt="Your photo" className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">{fileName}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Photo uploaded — choose what to create</p>
            </div>
            <button onClick={handleReset} className="w-7 h-7 rounded-lg flex items-center justify-center border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-all shrink-0">
              <X className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">What do you want to create?</p>
            <div className="grid grid-cols-1 gap-2">
              {OPTIONS.map(opt => {
                const Icon = opt.icon;
                const active = selectedOption?.id === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => setSelectedOption(opt)}
                    className={cn('flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all duration-150', active ? '' : 'border-border text-muted-foreground hover:text-foreground')}
                    style={active ? { borderColor: opt.color.replace(')', ' / 0.5)').replace('hsl(', 'hsl('), background: opt.color.replace(')', ' / 0.08)').replace('hsl(', 'hsl(') } : undefined}
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: opt.color.replace(')', ' / 0.12)').replace('hsl(', 'hsl('), border: `1px solid ${opt.color.replace(')', ' / 0.3)').replace('hsl(', 'hsl(')}` }}>
                      <Icon className="w-4 h-4" style={{ color: opt.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground">{opt.label}</p>
                      <p className="text-[10px] text-muted-foreground">{opt.desc}</p>
                    </div>
                    {active && <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: opt.color }} />}
                  </button>
                );
              })}
            </div>
          </div>
          {selectedOption?.id === 'custom' && (
            <div className="space-y-2">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Describe what you want</label>
              <textarea
                value={customPrompt}
                onChange={e => setCustomPrompt(e.target.value)}
                placeholder="e.g. Put me in a medieval knight armor in front of a castle at sunset..."
                rows={3}
                className="w-full bg-[hsl(224_15%_9%)] border border-border rounded-xl px-3.5 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none resize-none focus:border-[hsl(4_90%_58%_/_0.5)] transition-all"
              />
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-destructive/8 border border-destructive/25">
              <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}
          <button
            onClick={handleGenerate}
            disabled={!selectedOption || (selectedOption.id === 'custom' && !customPrompt.trim())}
            className={cn('w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed')}
            style={{
              background: selectedOption ? 'linear-gradient(135deg, hsl(4 90% 58%), hsl(265 80% 65%))' : undefined,
              color: selectedOption ? 'white' : undefined,
              boxShadow: selectedOption ? '0 4px 24px hsl(4 90% 58% / 0.3)' : undefined,
            }}
          >
            <Sparkles className="w-4 h-4" />
            Generate Photo
          </button>
        </div>
      )}

      {/* GENERATING */}
      {phase === 'generating' && (
        <div className="flex flex-col items-center justify-center gap-6 p-10">
          <div className="relative">
            <div className="w-24 h-24 rounded-2xl overflow-hidden border border-border">
              {photoDataUrl && <img src={photoDataUrl} alt="Processing" className="w-full h-full object-cover opacity-60" />}
            </div>
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-2xl">
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'hsl(4 90% 58%)' }} />
            </div>
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-foreground">Recreating your photo…</p>
            <p className="text-xs text-muted-foreground mt-1">Preserving identity · Applying style · High realism</p>
          </div>
        </div>
      )}

      {/* RESULT */}
      {phase === 'result' && resultUrl && (
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest text-center">Original</p>
              <div className="rounded-xl overflow-hidden border border-border">
                <img src={photoDataUrl!} alt="Original" className="w-full object-cover" style={{ maxHeight: '180px' }} />
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-center" style={{ color: 'hsl(4 90% 58%)' }}>
                {selectedOption?.label ?? 'Generated'}
              </p>
              <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'hsl(4 90% 58% / 0.3)' }}>
                <img src={resultUrl} alt="Generated" className="w-full object-cover" style={{ maxHeight: '180px' }} />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleReset} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold border border-border text-muted-foreground hover:text-foreground transition-all">
              <Upload className="w-3.5 h-3.5" /> New Photo
            </button>
            <button onClick={() => { setPhase('options'); setResultUrl(null); }} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold border border-border text-muted-foreground hover:text-foreground transition-all">
              <Sparkles className="w-3.5 h-3.5" /> Try Another
            </button>
            <button onClick={handleDownload} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold text-white transition-all" style={{ background: 'linear-gradient(135deg, hsl(4 90% 58%), hsl(265 80% 65%))' }}>
              Download
            </button>
          </div>
        </div>
      )}
    </>
  );

  // ── Inline mode: no modal wrapper ────────────────────────────────────────
  if (isInline) {
    return (
      <div className="flex-1 overflow-y-auto">
        {body}
      </div>
    );
  }

  // ── Modal mode: fullscreen overlay ───────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-md p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg bg-[hsl(224_20%_7%)] border border-border rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: '92vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'hsl(4 90% 58% / 0.12)', border: '1px solid hsl(4 90% 58% / 0.35)' }}>
              <Camera className="w-4 h-4" style={{ color: 'hsl(4 90% 58%)' }} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground leading-none" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                MockJ Photo Recreator
              </h2>
              <p className="text-[10px] text-muted-foreground mt-0.5">Upload · Choose · Generate</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground border border-border transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {body}
        </div>
      </div>
    </div>
  );
}
