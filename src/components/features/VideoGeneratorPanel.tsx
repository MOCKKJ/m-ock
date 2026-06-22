import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Video, RefreshCw, Sparkles, Download, Play, Pause, Clock,
  Loader2, CheckCircle2, AlertCircle, History, Trash2, ZoomIn, X, Maximize2, Coins, Zap, Crown, Lock,
  Upload,
} from 'lucide-react';
import { Analytics } from '@/lib/analytics';
import { normalizeCreativePrompt } from '@/lib/promptNormalizer';
import { VideoGenRequest } from '@/types/chat';
import { createVideoTask, checkVideoTask } from '@/lib/mockAI';
import {
  saveVideoGeneration, loadVideoHistory, deleteVideoGeneration, VideoHistoryItem,
} from '@/lib/storage';
import { requestNotificationPermission, notifyVideoDone } from '@/hooks/useNotifications';
import { useTokenWallet } from '@/hooks/useTokenWallet';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const STYLES: { value: VideoGenRequest['style']; label: string; desc: string; emoji: string }[] = [
  { value: 'cinematic',    label: 'Cinematic',    desc: 'Film-grade quality', emoji: '🎬' },
  { value: 'animation',   label: 'Animation',    desc: 'Vivid & stylized',   emoji: '✨' },
  { value: 'documentary', label: 'Documentary',  desc: 'Natural & real',     emoji: '🎥' },
  { value: 'abstract',    label: 'Abstract',     desc: 'Artistic motion',    emoji: '🌀' },
];

const DURATIONS: { value: VideoGenRequest['duration']; label: string; seconds: number }[] = [
  { value: '4s',  label: '4 sec',  seconds: 4  },
  { value: '8s',  label: '8 sec',  seconds: 8  },
  { value: '12s', label: '12 sec', seconds: 12 },
];

const VALID_SECONDS = [4, 8, 12];

const RATIOS = [
  { value: '16:9', label: '16:9', desc: 'Landscape', soraRatio: 'landscape' },
  { value: '9:16', label: '9:16', desc: 'Portrait',  soraRatio: 'portrait'  },
  { value: '1:1',  label: '1:1',  desc: 'Square',    soraRatio: 'square'    },
];

const PROMPT_IDEAS = [
  'Ocean waves crashing on a volcanic black sand beach at golden hour, cinematic wide shot',
  'Time-lapse of a futuristic city skyline transforming from day to night, rain reflects neon signs',
  'Abstract geometric shapes morphing and dissolving in a dark digital void, electronic pulse',
  'Dense ancient forest fog slowly dissolving as shafts of morning sunlight break through the canopy',
];

const POLLING_STATUS_MESSAGES = [
  'Starting your video generation...',
  'AI is analyzing your prompt...',
  'Rendering frames...',
  'Adding motion and lighting...',
  'Applying cinematic effects...',
  'Finalizing your video...',
  'Almost ready — polishing final frames...',
];

type TaskStatus = 'idle' | 'creating' | 'polling' | 'succeeded' | 'failed';
type PanelMode = 'generate' | 'history';
type GenMode = 'text' | 'image';

const TOKEN_COST: Record<string, number> = { '4s': 300, '8s': 600, '12s': 900 };

export default function VideoGeneratorPanel() {
  const { user, subscription } = useAuth();
  const { wallet } = useTokenWallet();
  const isSubscribed = subscription.subscribed;
  const [showUpgradeBanner, setShowUpgradeBanner] = useState(false);
  const navigate = useNavigate();

  const [totalVideoCount, setTotalVideoCount] = useState<number | null>(null);
  useEffect(() => {
    if (!user) return;
    import('@/lib/supabase').then(({ supabase }) => {
      supabase.from('video_generations').select('id', { count: 'exact', head: true }).eq('user_id', user.id)
        .then(({ count }) => { if (count !== null) setTotalVideoCount(count); });
    });
  }, [user?.id]);

  const isPremiumDuration = (d: VideoGenRequest['duration']) => d === '8s' || d === '12s';
  const [panelMode, setPanelMode] = useState<PanelMode>('generate');
  const [genMode, setGenMode] = useState<GenMode>('text');

  // Form state
  const [prompt, setPrompt]     = useState('');
  const [style, setStyle]       = useState<VideoGenRequest['style']>('cinematic');
  const [duration, setDuration] = useState<VideoGenRequest['duration']>('8s');
  const [ratio, setRatio]       = useState('16:9');
  const [refImage, setRefImage] = useState<string | null>(null);
  const [refImageName, setRefImageName] = useState('');
  const imgInputRef = useRef<HTMLInputElement>(null);

  // Task state
  const [taskStatus, setTaskStatus]     = useState<TaskStatus>('idle');
  const [predictionId, setPredictionId] = useState<string | null>(null);
  const [progress, setProgress]         = useState(0);
  const [videoUrl, setVideoUrl]         = useState<string | null>(null);
  const [errorMsg, setErrorMsg]         = useState<string | null>(null);
  const [statusMsgIdx, setStatusMsgIdx] = useState(0);
  const [isPlaying, setIsPlaying]       = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // History state
  const [historyItems, setHistoryItems]     = useState<VideoHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [playingItem, setPlayingItem]       = useState<VideoHistoryItem | null>(null);
  const [lightboxPlaying, setLightboxPlaying] = useState(false);

  const pollingRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusMsgRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoRef         = useRef<HTMLVideoElement>(null);
  const lightboxRef      = useRef<HTMLVideoElement>(null);
  const videoUploadedRef = useRef(false);
  const pollErrorCount   = useRef(0);
  const pendingMetaRef   = useRef<{ prompt: string; style: string; duration: string; ratio: string } | null>(null);

  const handleRequestFullscreen = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.requestFullscreen) el.requestFullscreen();
    else if ((el as HTMLVideoElement & { webkitEnterFullscreen?: () => void }).webkitEnterFullscreen) {
      (el as HTMLVideoElement & { webkitEnterFullscreen: () => void }).webkitEnterFullscreen();
    }
  }, []);

  const stopPolling = useCallback(() => {
    if (pollingRef.current)   clearInterval(pollingRef.current);
    if (statusMsgRef.current) clearInterval(statusMsgRef.current);
    if (elapsedRef.current)   clearInterval(elapsedRef.current);
    pollingRef.current = statusMsgRef.current = elapsedRef.current = null;
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  useEffect(() => {
    if (panelMode !== 'history') return;
    setHistoryLoading(true);
    loadVideoHistory().then(items => { setHistoryItems(items); setHistoryLoading(false); });
  }, [panelMode]);

  const startPolling = useCallback((id: string) => {
    videoUploadedRef.current = false;
    pollErrorCount.current = 0;
    setElapsedSeconds(0);
    elapsedRef.current = setInterval(() => setElapsedSeconds(s => s + 1), 1000);
    statusMsgRef.current = setInterval(() => setStatusMsgIdx(i => (i + 1) % POLLING_STATUS_MESSAGES.length), 4500);
    pollingRef.current = setInterval(async () => {
      if (videoUploadedRef.current) return;
      try {
        const task = await checkVideoTask(id);
        pollErrorCount.current = 0;
        if (task.progress && task.progress > 0) setProgress(task.progress);
        else setElapsedSeconds(prev => { const est = Math.min(92, (prev / 150) * 100); setProgress(est); return prev; });
        if (task.status === 'succeeded' && task.videoUrl) {
          if (videoUploadedRef.current) return;
          videoUploadedRef.current = true;
          stopPolling();
          setProgress(100);
          setVideoUrl(task.videoUrl);
          setTaskStatus('succeeded');
          Analytics.videoSent();
          toast.success('🎬 Your video is ready!');
          const meta = pendingMetaRef.current;
          if (meta) {
            saveVideoGeneration({ prompt: meta.prompt, style: meta.style, duration: meta.duration, aspectRatio: meta.ratio, videoUrl: task.videoUrl });
            notifyVideoDone(meta.prompt);
          }
        } else if (task.status === 'failed') {
          stopPolling();
          setErrorMsg(task.error ?? 'Video generation failed. Please try a different prompt.');
          setTaskStatus('failed');
        }
      } catch (err) {
        pollErrorCount.current += 1;
        if (pollErrorCount.current >= 4) {
          stopPolling();
          setErrorMsg(err instanceof Error ? err.message : 'Connection error. Please try again.');
          setTaskStatus('failed');
        }
      }
    }, 5000);
  }, [stopPolling]);

  const tokenCost = TOKEN_COST[duration] ?? 600;
  const hasEnoughTokens = isSubscribed || !user || wallet.balance >= tokenCost;
  const canGenerate = genMode === 'text' ? !!prompt.trim() : (!!refImage || !!prompt.trim());

  const handleGenerate = async () => {
    if (!canGenerate || taskStatus === 'creating' || taskStatus === 'polling') return;
    if (user && !isSubscribed && wallet.balance < tokenCost) {
      toast.error(`You need ${tokenCost} tokens but only have ${wallet.balance}.`, { action: { label: 'Top Up', onClick: () => window.location.href = '/tokens' } });
      return;
    }
    const selectedSeconds = Number(duration.replace('s', ''));
    if (!VALID_SECONDS.includes(selectedSeconds)) { toast.error('Please choose 4, 8, or 12 seconds.'); return; }
    requestNotificationPermission();
    stopPolling();
    setTaskStatus('creating');
    setVideoUrl(null);
    setErrorMsg(null);
    setPredictionId(null);
    setProgress(0);
    setStatusMsgIdx(0);

    let normalizedPrompt = prompt.trim() || (genMode === 'image' ? 'Animate this image with smooth natural motion' : '');
    try {
      const norm = await normalizeCreativePrompt(normalizedPrompt, 'video');
      if (norm.safetyStatus === 'unsafe') { toast.error(`Prompt not allowed: ${norm.safetyReason ?? 'content policy'}`); setTaskStatus('idle'); return; }
      normalizedPrompt = norm.finalPromptForGeneration || normalizedPrompt;
    } catch { /* fallback */ }

    pendingMetaRef.current = { prompt: prompt.trim(), style, duration, ratio };
    try {
      const task = await createVideoTask({ prompt: normalizedPrompt, style, duration, aspectRatio: ratio });
      setPredictionId(task.id);
      setTaskStatus('polling');
      startPolling(task.id);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to start video generation');
      setTaskStatus('failed');
    }
  };

  const handleReset = () => { stopPolling(); setTaskStatus('idle'); setVideoUrl(null); setErrorMsg(null); setPredictionId(null); setProgress(0); };
  const handleDownload = (url?: string) => {
    const href = url ?? videoUrl; if (!href) return;
    const a = document.createElement('a'); a.href = href; a.download = `mocka-video-${Date.now()}.mp4`; a.target = '_blank'; a.click();
  };
  const togglePlay = () => { if (!videoRef.current) return; isPlaying ? videoRef.current.pause() : videoRef.current.play(); setIsPlaying(!isPlaying); };
  const handleDeleteHistory = async (id: string) => {
    await deleteVideoGeneration(id);
    setHistoryItems(prev => prev.filter(i => i.id !== id));
    if (playingItem?.id === id) setPlayingItem(null);
    toast.success('Deleted from history');
  };

  const isLoading = taskStatus === 'creating' || taskStatus === 'polling';
  const formatElapsed = (s: number) => { const m = Math.floor(s / 60); const sec = s % 60; return m > 0 ? `${m}m ${sec}s` : `${sec}s`; };

  const ControlsPanel = (
    <div className="w-full md:w-80 md:shrink-0 border-b md:border-b-0 md:border-r border-border bg-[hsl(224_20%_5%)] flex flex-col">
      <div className="p-5 space-y-5 flex-1 overflow-y-auto">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[hsl(191_97%_55%_/_0.1)] border border-[hsl(191_97%_55%_/_0.3)] flex items-center justify-center shrink-0">
            <Video className="w-4 h-4 text-[hsl(191_97%_55%)]" />
          </div>
          <div>
            <h2 className="font-bold text-sm text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Video Studio</h2>
            <p className="text-[10px] text-muted-foreground">MockJ Video Studio · Cinematic AI</p>
            <div className="flex flex-wrap gap-1 mt-1.5">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold"
                style={{ background: 'hsl(191 97% 55% / 0.12)', border: '1px solid hsl(191 97% 55% / 0.4)', color: 'hsl(191 97% 55%)' }}>
                🎥 Sora 2
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold"
                style={{ background: 'hsl(265 80% 65% / 0.1)', border: '1px solid hsl(265 80% 65% / 0.35)', color: 'hsl(265 80% 65%)' }}>
                ⬆️ Img2Vid
              </span>
            </div>
          </div>
        </div>

        {/* Panel mode toggle */}
        <div className="flex rounded-xl border border-border overflow-hidden p-1 bg-[hsl(224_15%_9%)] gap-1">
          {(['generate', 'history'] as PanelMode[]).map(m => (
            <button key={m} onClick={() => setPanelMode(m)}
              className={cn('flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-medium transition-all duration-200',
                panelMode === m ? 'bg-[hsl(191_97%_55%_/_0.15)] border border-[hsl(191_97%_55%_/_0.4)] text-[hsl(191_97%_55%)]' : 'text-muted-foreground hover:text-foreground')}>
              {m === 'generate' ? <><Sparkles className="w-3 h-3" /> Generate</> : <>
                <History className="w-3 h-3" /> History
                {totalVideoCount !== null && totalVideoCount > 0 && (
                  <span className="ml-0.5 flex items-center justify-center rounded-full text-[9px] font-black leading-none px-1.5 py-0.5 min-w-[18px]"
                    style={{ background: panelMode === 'history' ? 'hsl(191 97% 55% / 0.25)' : 'hsl(224 15% 18%)', color: panelMode === 'history' ? 'hsl(191 97% 65%)' : 'hsl(210 20% 55%)' }}>
                    {totalVideoCount}
                  </span>
                )}
              </>}
            </button>
          ))}
        </div>

        {panelMode === 'history' && (
          <div className="p-4 rounded-xl border border-[hsl(191_97%_55%_/_0.2)] bg-[hsl(191_97%_55%_/_0.05)] space-y-2">
            <div className="flex items-center gap-2"><History className="w-4 h-4 text-[hsl(191_97%_55%)]" /><p className="text-xs font-semibold text-foreground">Your Video History</p></div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">All generated videos are saved here. Click any video to play, download, or delete it.</p>
            <div className="flex items-center gap-1.5 pt-1"><span className="w-2 h-2 rounded-full bg-[hsl(142_70%_55%)]" /><span className="text-[10px] text-muted-foreground">Logged-in: synced to cloud</span></div>
            <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[hsl(38_95%_60%)]" /><span className="text-[10px] text-muted-foreground">Guests: stored locally (up to 20)</span></div>
          </div>
        )}

        {panelMode === 'generate' && (
          <>
            {/* Generation mode: Text vs Image */}
            <div className="flex rounded-xl border border-border overflow-hidden p-1 bg-[hsl(224_15%_9%)] gap-1">
              {([['text', '✍️ Text to Video'], ['image', '🖼️ Image to Video']] as [GenMode, string][]).map(([m, label]) => (
                <button key={m} onClick={() => setGenMode(m)}
                  className={cn('flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-[11px] font-medium transition-all duration-200',
                    genMode === m ? 'bg-[hsl(191_97%_55%_/_0.15)] border border-[hsl(191_97%_55%_/_0.4)] text-[hsl(191_97%_55%)]' : 'text-muted-foreground hover:text-foreground')}>
                  {label}
                </button>
              ))}
            </div>

            {/* Image upload (img-to-video) */}
            {genMode === 'image' && (
              <div className="space-y-2">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Reference Image</label>
                <input ref={imgInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0]; if (!file) return;
                    if (file.size > 10 * 1024 * 1024) { toast.error('Image must be under 10MB'); return; }
                    const reader = new FileReader();
                    reader.onload = ev => { setRefImage(ev.target?.result as string); setRefImageName(file.name); };
                    reader.readAsDataURL(file);
                  }}
                />
                {refImage ? (
                  <div className="relative rounded-xl overflow-hidden border border-[hsl(191_97%_55%_/_0.3)]">
                    <img src={refImage} alt="Reference" className="w-full object-cover" style={{ maxHeight: 140 }} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                      <span className="text-[10px] text-white/80 truncate">{refImageName}</span>
                      <button onClick={() => { setRefImage(null); setRefImageName(''); if (imgInputRef.current) imgInputRef.current.value = ''; }}
                        className="w-6 h-6 rounded-full bg-black/60 flex items-center justify-center text-white/70 hover:text-white transition-all">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => imgInputRef.current?.click()} disabled={isLoading}
                    className="w-full flex flex-col items-center gap-2 py-6 rounded-xl border-2 border-dashed transition-all duration-200 disabled:opacity-50"
                    style={{ borderColor: 'hsl(191 97% 55% / 0.3)', background: 'hsl(191 97% 55% / 0.04)' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'hsl(191 97% 55% / 0.6)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'hsl(191 97% 55% / 0.3)'; }}>
                    <Upload className="w-6 h-6" style={{ color: 'hsl(191 97% 55% / 0.6)' }} />
                    <span className="text-xs text-muted-foreground">Upload image <span className="text-[hsl(191_97%_55%)]">(PNG, JPG, WebP · max 10MB)</span></span>
                    <span className="text-[10px] text-muted-foreground/50">MockJ will animate your photo into a video</span>
                  </button>
                )}
              </div>
            )}

            {/* Prompt */}
            <div className="space-y-2">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                {genMode === 'image' ? 'Animation Instructions (optional)' : 'Scene Description'}
              </label>
              <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
                placeholder={genMode === 'image'
                  ? 'Describe how to animate — e.g. "gentle camera drift, wind in hair, cinematic bokeh"'
                  : 'A majestic eagle soaring over snow-capped mountains at golden hour...'}
                rows={genMode === 'image' ? 3 : 4} disabled={isLoading}
                className="w-full bg-[hsl(224_15%_9%)] border border-border rounded-xl px-3.5 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none resize-none focus:border-[hsl(191_97%_55%_/_0.5)] transition-all duration-200 leading-relaxed disabled:opacity-50"
              />
              {genMode === 'text' && (
                <div className="flex flex-col gap-1.5">
                  {PROMPT_IDEAS.map(idea => (
                    <button key={idea} onClick={() => setPrompt(idea)} disabled={isLoading}
                      className="text-[10px] px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-[hsl(191_97%_55%_/_0.35)] hover:bg-[hsl(191_97%_55%_/_0.04)] transition-all duration-150 text-left leading-relaxed disabled:opacity-50">
                      {idea}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Style */}
            <div className="space-y-2">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Visual Style</label>
              <div className="grid grid-cols-2 gap-1.5">
                {STYLES.map(s => (
                  <button key={s.value} onClick={() => setStyle(s.value)} disabled={isLoading}
                    className={cn('flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-all duration-200 disabled:opacity-50',
                      style === s.value ? 'bg-[hsl(191_97%_55%_/_0.12)] border-[hsl(191_97%_55%_/_0.45)] text-[hsl(191_97%_55%)]' : 'border-border text-muted-foreground hover:border-[hsl(224_15%_22%)] hover:text-foreground')}>
                    <span>{s.emoji}</span>
                    <div className="text-left"><div>{s.label}</div><div className="text-[9px] opacity-60">{s.desc}</div></div>
                  </button>
                ))}
              </div>
            </div>

            {/* Duration */}
            <div className="space-y-2">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Duration</label>
              <div className="grid grid-cols-2 gap-1.5">
                {DURATIONS.map(d => {
                  const locked = isPremiumDuration(d.value) && !isSubscribed;
                  return (
                    <button key={d.value} onClick={() => { if (locked) { setShowUpgradeBanner(true); return; } setDuration(d.value); }} disabled={isLoading}
                      className={cn('py-2.5 rounded-lg text-xs font-medium border transition-all duration-200 disabled:opacity-50 relative overflow-hidden',
                        duration === d.value && !locked ? 'bg-[hsl(191_97%_55%_/_0.12)] border-[hsl(191_97%_55%_/_0.45)] text-[hsl(191_97%_55%)]'
                        : locked ? 'border-[hsl(265_80%_65%_/_0.3)] text-muted-foreground/50 bg-[hsl(265_80%_65%_/_0.04)] cursor-pointer'
                        : 'border-border text-muted-foreground hover:border-[hsl(224_15%_22%)] hover:text-foreground')}>
                      {locked && <Lock className="w-2.5 h-2.5 absolute top-1.5 right-1.5 text-[hsl(265_80%_65%_/_0.6)]" />}
                      {d.label}
                      {locked && <span className="block text-[8px] text-[hsl(265_80%_65%_/_0.7)] mt-0.5">Pro only</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Aspect Ratio */}
            <div className="space-y-2">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Aspect Ratio</label>
              <div className="grid grid-cols-3 gap-1.5">
                {RATIOS.map(r => (
                  <button key={r.value} onClick={() => setRatio(r.value)} disabled={isLoading}
                    className={cn('py-2 rounded-lg text-xs font-medium border transition-all duration-200 disabled:opacity-50',
                      ratio === r.value ? 'bg-[hsl(191_97%_55%_/_0.12)] border-[hsl(191_97%_55%_/_0.45)] text-[hsl(191_97%_55%)]' : 'border-border text-muted-foreground hover:border-[hsl(224_15%_22%)] hover:text-foreground')}>
                    <div className="text-[9px] opacity-70">{r.desc}</div>
                    <div className="font-bold">{r.label}</div>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer with generate button */}
      {panelMode === 'generate' && (
        <div className="sticky bottom-0 p-4 border-t border-border bg-[hsl(224_20%_5%)] z-10 space-y-2.5">
          {showUpgradeBanner && !isSubscribed && (
            <div className="relative flex items-start gap-3 px-3 py-3 rounded-xl border overflow-hidden"
              style={{ background: 'hsl(265 80% 65% / 0.06)', borderColor: 'hsl(265 80% 65% / 0.35)' }}>
              <div className="w-7 h-7 rounded-lg bg-[hsl(265_80%_65%_/_0.12)] border border-[hsl(265_80%_65%_/_0.4)] flex items-center justify-center shrink-0 mt-0.5">
                <Crown className="w-3.5 h-3.5 text-[hsl(265_80%_65%)]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-foreground">Pro Required</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">8s and 12s durations require a MockJ subscription.</p>
                <div className="flex gap-2 mt-2">
                  <button onClick={() => navigate('/tokens?tab=shop')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-black transition-all active:scale-95"
                    style={{ background: 'linear-gradient(135deg, hsl(265 80% 65%), hsl(191 97% 55%))', color: '#fff' }}>
                    <Crown className="w-2.5 h-2.5" /> Upgrade Now
                  </button>
                  <button onClick={() => { setShowUpgradeBanner(false); setDuration('4s'); }}
                    className="px-3 py-1.5 rounded-lg text-[10px] font-semibold text-muted-foreground border border-border hover:text-foreground transition-all">
                    Use 4s Free
                  </button>
                </div>
              </div>
              <button onClick={() => setShowUpgradeBanner(false)} className="w-5 h-5 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {user && !isSubscribed && !isLoading && (
            <div className={cn('flex items-center justify-between px-3 py-2 rounded-xl border text-xs font-medium',
              hasEnoughTokens ? 'border-[hsl(191_97%_55%_/_0.25)] bg-[hsl(191_97%_55%_/_0.06)] text-[hsl(191_97%_65%)]' : 'border-destructive/35 bg-destructive/6 text-destructive')}>
              <div className="flex items-center gap-1.5"><Coins className="w-3.5 h-3.5" /><span>Cost: <strong>{tokenCost} tokens</strong></span></div>
              <div className="flex items-center gap-1.5">
                {hasEnoughTokens ? <><Zap className="w-3 h-3" /><span>Balance: {wallet.balance.toLocaleString()}</span></> : <a href="/tokens" className="underline">Top up ↗</a>}
              </div>
            </div>
          )}

          {isLoading ? (
            <button onClick={handleReset} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm border border-border text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-all duration-200">
              <AlertCircle className="w-4 h-4" /> Cancel Generation
            </button>
          ) : isPremiumDuration(duration) && !isSubscribed ? (
            <button onClick={() => setShowUpgradeBanner(true)} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all duration-200 active:scale-[0.97]"
              style={{ background: 'linear-gradient(135deg, hsl(265 80% 65% / 0.15), hsl(191 97% 55% / 0.15))', border: '1px solid hsl(265 80% 65% / 0.4)', color: 'hsl(265 80% 70%)' }}>
              <Lock className="w-4 h-4" /> Unlock with Pro — Subscribe
            </button>
          ) : (
            <button onClick={handleGenerate} disabled={!canGenerate}
              className={cn('w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all duration-200 active:scale-[0.97]',
                canGenerate ? 'bg-[hsl(191_97%_55%)] text-[hsl(224_20%_6%)] hover:bg-[hsl(191_97%_65%)] shadow-[0_0_20px_hsl(191_97%_55%_/_0.3)]' : 'bg-[hsl(224_15%_12%)] text-muted-foreground cursor-not-allowed')}>
              <Sparkles className="w-4 h-4" />
              {genMode === 'image' ? 'Animate Image' : 'Generate Video'}
            </button>
          )}
        </div>
      )}
    </div>
  );

  const HistoryContent = (
    <div className="flex-1 overflow-y-auto p-4 md:p-6">
      <div className="flex items-center justify-between mb-4 sticky top-0 bg-[hsl(224_20%_6%)] pb-3 z-10">
        <div>
          <h3 className="font-bold text-foreground text-sm" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Video History</h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">{historyItems.length} video{historyItems.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => { setHistoryLoading(true); loadVideoHistory().then(items => { setHistoryItems(items); setHistoryLoading(false); }); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:border-[hsl(224_15%_24%)] transition-all">
          <RefreshCw className={cn('w-3 h-3', historyLoading && 'animate-spin')} /> Refresh
        </button>
      </div>
      {historyLoading && (
        <div className="flex flex-col items-center justify-center h-48 gap-3">
          <div className="flex gap-1.5">{[0,1,2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-[hsl(191_97%_55%)] animate-bounce" style={{ animationDelay: `${i*150}ms` }} />)}</div>
          <p className="text-xs text-muted-foreground">Loading history…</p>
        </div>
      )}
      {!historyLoading && historyItems.length === 0 && (
        <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[hsl(191_97%_55%_/_0.08)] border border-[hsl(191_97%_55%_/_0.2)] flex items-center justify-center">
            <Clock className="w-6 h-6 text-[hsl(191_97%_55%_/_0.5)]" />
          </div>
          <div><p className="text-sm font-semibold text-foreground">No videos yet</p><p className="text-xs text-muted-foreground mt-1">Generate your first video to see it here.</p></div>
          <button onClick={() => setPanelMode('generate')} className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-[hsl(191_97%_55%_/_0.12)] border border-[hsl(191_97%_55%_/_0.35)] text-[hsl(191_97%_55%)] hover:bg-[hsl(191_97%_55%_/_0.2)] transition-all">
            <Sparkles className="w-3.5 h-3.5" /> Generate your first video
          </button>
        </div>
      )}
      {!historyLoading && historyItems.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {historyItems.map(item => (
            <div key={item.id} className="group relative rounded-xl overflow-hidden border border-border hover:border-[hsl(191_97%_55%_/_0.4)] transition-all duration-200 bg-[hsl(224_15%_8%)] cursor-pointer"
              onClick={() => { setPlayingItem(item); setLightboxPlaying(false); }}>
              <div className="relative w-full bg-black" style={{ aspectRatio: item.aspectRatio?.replace(':', '/') || '16/9' }}>
                <video src={item.videoUrl} preload="metadata" className="w-full h-full object-cover" muted />
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 group-hover:bg-black/25 transition-all duration-200">
                  <div className="w-10 h-10 rounded-full bg-[hsl(191_97%_55%_/_0.85)] flex items-center justify-center shadow-[0_0_20px_hsl(191_97%_55%_/_0.5)] group-hover:scale-110 transition-transform duration-200">
                    <Play className="w-4 h-4 text-[hsl(224_20%_6%)] ml-0.5" />
                  </div>
                </div>
                <div className="absolute top-2 right-2 w-6 h-6 rounded-lg bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><ZoomIn className="w-3 h-3 text-white" /></div>
                <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-black/70 text-[9px] font-semibold text-white">{item.duration}</div>
              </div>
              <div className="p-3">
                <p className="text-xs text-foreground line-clamp-2 leading-relaxed mb-2">"{item.prompt}"</p>
                <div className="flex items-center justify-between">
                  <div className="flex flex-wrap gap-1">
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[hsl(224_15%_14%)] border border-border text-muted-foreground capitalize">{item.style}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[hsl(224_15%_14%)] border border-border text-muted-foreground">{item.aspectRatio}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={e => { e.stopPropagation(); handleDownload(item.videoUrl); }} className="w-6 h-6 rounded-lg flex items-center justify-center border border-border text-muted-foreground hover:text-[hsl(191_97%_55%)] hover:border-[hsl(191_97%_55%_/_0.4)] transition-all" title="Download"><Download className="w-3 h-3" /></button>
                    <button onClick={e => { e.stopPropagation(); handleDeleteHistory(item.id); }} className="w-6 h-6 rounded-lg flex items-center justify-center border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-all" title="Delete"><Trash2 className="w-3 h-3" /></button>
                  </div>
                </div>
                <p className="text-[9px] text-muted-foreground/50 mt-1.5">{new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const PreviewContent = (
    <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 bg-[hsl(224_20%_6%)] overflow-y-auto min-h-[280px] md:min-h-0">
      {taskStatus === 'idle' && (
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-[hsl(191_97%_55%_/_0.08)] border border-[hsl(191_97%_55%_/_0.2)] flex items-center justify-center mx-auto mb-4">
            <Video className="w-7 h-7 text-[hsl(191_97%_55%_/_0.5)]" />
          </div>
          <h3 className="font-semibold text-foreground mb-2" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Your studio is ready</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">Text to video or upload a photo and animate it — MockJ AI does the rest.</p>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[hsl(191_97%_55%_/_0.08)] border border-[hsl(191_97%_55%_/_0.2)]">
            <Clock className="w-3 h-3 text-[hsl(191_97%_55%)]" />
            <span className="text-[11px] text-[hsl(191_97%_55%)]">4s · 8s · 12s · Generation takes 1–3 min</span>
          </div>
        </div>
      )}

      {(taskStatus === 'creating' || taskStatus === 'polling') && (
        <div className="w-full max-w-lg space-y-5 animate-message-in">
          <div className="w-full rounded-2xl overflow-hidden border border-[hsl(191_97%_55%_/_0.2)] relative"
            style={{ aspectRatio: ratio.replace(':', '/'), maxHeight: '400px', minHeight: '160px' }}>
            <div className="absolute inset-0 bg-[hsl(224_20%_5%)]" />
            <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(hsl(191 97% 55% / 0.04) 1px, transparent 1px), linear-gradient(90deg, hsl(191 97% 55% / 0.04) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
              <div className="relative w-14 h-14">
                <div className="absolute inset-0 rounded-full bg-[hsl(191_97%_55%_/_0.15)] animate-ping" />
                <div className="relative w-full h-full rounded-full border-2 border-[hsl(191_97%_55%_/_0.5)] border-t-[hsl(191_97%_55%)] animate-spin flex items-center justify-center">
                  <Video className="w-5 h-5 text-[hsl(191_97%_55%_/_0.7)]" />
                </div>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[hsl(224_20%_5%_/_0.8)] border border-[hsl(191_97%_55%_/_0.25)] backdrop-blur-sm">
                <span className="text-[11px] font-semibold text-[hsl(191_97%_65%)]">{taskStatus === 'creating' ? 'Initializing Sora 2…' : POLLING_STATUS_MESSAGES[statusMsgIdx]}</span>
              </div>
            </div>
          </div>
          <div className="bg-[hsl(224_15%_9%)] border border-border rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><Loader2 className="w-4 h-4 text-[hsl(191_97%_55%)] animate-spin" /><span className="text-sm font-medium text-foreground">Generating your video…</span></div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock className="w-3 h-3" />{formatElapsed(elapsedSeconds)}</div>
            </div>
            <div className="space-y-1.5">
              <div className="h-1.5 bg-[hsl(224_15%_14%)] rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-[hsl(191_97%_55%)] to-[hsl(191_97%_75%)] rounded-full" style={{ width: `${Math.max(3, progress)}%`, transition: 'width 2s ease-out' }} />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{POLLING_STATUS_MESSAGES[statusMsgIdx]}</p>
                <span className="text-[10px] font-mono text-muted-foreground/50">{Math.round(Math.max(3, progress))}%</span>
              </div>
            </div>
            {predictionId && <p className="text-[10px] text-muted-foreground/40 font-mono">Task: {predictionId.slice(0, 12)}…</p>}
          </div>
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[hsl(191_97%_55%_/_0.05)] border border-[hsl(191_97%_55%_/_0.15)]">
            <CheckCircle2 className="w-3.5 h-3.5 text-[hsl(191_97%_55%)] shrink-0" />
            <p className="text-[11px] text-muted-foreground/70">Takes 1–3 min. You'll get a notification when done — feel free to browse.</p>
          </div>
        </div>
      )}

      {taskStatus === 'succeeded' && videoUrl && (
        <div className="w-full max-w-lg animate-message-in space-y-4">
          <div className="rounded-2xl overflow-hidden border border-[hsl(191_97%_55%_/_0.3)] shadow-[0_0_40px_hsl(191_97%_55%_/_0.1)] bg-black relative group/video">
            <video ref={videoRef} src={videoUrl} loop playsInline onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} className="w-full object-contain" style={{ maxHeight: '450px' }} />
            {!isPlaying && (
              <button onClick={togglePlay} className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/20 transition-all duration-200 group">
                <div className="w-16 h-16 rounded-full bg-[hsl(191_97%_55%_/_0.9)] flex items-center justify-center group-hover:scale-110 transition-transform duration-200 shadow-[0_0_30px_hsl(191_97%_55%_/_0.5)]">
                  <Play className="w-7 h-7 text-[hsl(224_20%_6%)] ml-1" />
                </div>
              </button>
            )}
            {isPlaying && <button onClick={togglePlay} className="absolute bottom-3 right-12 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80 transition-all duration-150"><Pause className="w-3.5 h-3.5 text-white" /></button>}
            <button onClick={handleRequestFullscreen} className="absolute bottom-3 right-3 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80 transition-all duration-150 md:opacity-0 md:group-hover/video:opacity-100" title="Fullscreen">
              <Maximize2 className="w-3.5 h-3.5 text-white" />
            </button>
            <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[hsl(191_97%_55%_/_0.15)] border border-[hsl(191_97%_55%_/_0.4)] backdrop-blur-sm">
              <CheckCircle2 className="w-3 h-3 text-[hsl(191_97%_55%)]" /><span className="text-[10px] font-semibold text-[hsl(191_97%_55%)]">MockJ · Video Studio</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground truncate">"{prompt}"</p>
              <p className="text-[10px] text-muted-foreground/50 mt-0.5">{STYLES.find(s => s.value === style)?.label} · {duration} · {ratio} · {formatElapsed(elapsedSeconds)} to generate</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={handleReset} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:border-[hsl(224_15%_24%)] transition-all duration-150"><RefreshCw className="w-3 h-3" /> New</button>
              <button onClick={() => handleDownload()} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-[hsl(191_97%_55%_/_0.12)] border border-[hsl(191_97%_55%_/_0.35)] text-[hsl(191_97%_55%)] hover:bg-[hsl(191_97%_55%_/_0.22)] transition-all duration-150"><Download className="w-3 h-3" /> Download</button>
              <button onClick={() => setPanelMode('history')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:border-[hsl(224_15%_24%)] transition-all duration-150"><History className="w-3 h-3" /> History</button>
            </div>
          </div>
        </div>
      )}

      {taskStatus === 'failed' && (
        <div className="w-full max-w-lg animate-message-in space-y-4">
          <div className="p-5 rounded-2xl border border-destructive/30 bg-destructive/5 text-center space-y-2">
            <AlertCircle className="w-8 h-8 text-destructive mx-auto" />
            <p className="text-sm text-destructive font-medium">Video generation failed</p>
            <p className="text-xs text-muted-foreground">{errorMsg}</p>
          </div>
          <button onClick={handleGenerate} disabled={!canGenerate} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border border-[hsl(191_97%_55%_/_0.3)] text-[hsl(191_97%_55%)] hover:bg-[hsl(191_97%_55%_/_0.08)] transition-all duration-150">
            <RefreshCw className="w-4 h-4" /> Try Again
          </button>
        </div>
      )}
    </div>
  );

  return (
    <>
      <div className="flex flex-col md:flex-row h-full w-full overflow-y-auto md:overflow-hidden">
        {ControlsPanel}
        <div className="flex-1 flex flex-col overflow-hidden bg-[hsl(224_20%_6%)] min-h-[280px] md:min-h-0">
          {panelMode === 'history' ? HistoryContent : PreviewContent}
        </div>
      </div>

      {/* Video Lightbox */}
      {playingItem && (
        <div className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-md flex flex-col" onClick={() => setPlayingItem(null)}>
          <div className="flex items-center justify-between px-4 py-3 shrink-0 bg-black/60 backdrop-blur-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2"><History className="w-3.5 h-3.5 text-[hsl(191_97%_55%)]" /><span className="text-xs font-semibold text-white/80 max-w-[200px] truncate">"{playingItem.prompt}"</span></div>
            <div className="flex items-center gap-2">
              <button onClick={() => handleDownload(playingItem.videoUrl)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[hsl(191_97%_55%_/_0.12)] border border-[hsl(191_97%_55%_/_0.35)] text-[hsl(191_97%_55%)] hover:bg-[hsl(191_97%_55%_/_0.22)] transition-all"><Download className="w-3 h-3" /> Download</button>
              <button onClick={async (e) => { e.stopPropagation(); await handleDeleteHistory(playingItem.id); setPlayingItem(null); }} className="w-8 h-8 rounded-lg flex items-center justify-center border border-white/20 text-white/60 hover:text-destructive hover:border-destructive/40 transition-all" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
              <button onClick={() => setPlayingItem(null)} className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/10 border border-white/20 text-white hover:bg-white/20 transition-all"><X className="w-3.5 h-3.5" /></button>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center p-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="relative rounded-2xl overflow-hidden border border-[hsl(191_97%_55%_/_0.3)] shadow-[0_0_40px_hsl(191_97%_55%_/_0.15)] w-full max-w-3xl" style={{ maxHeight: 'calc(100vh - 120px)' }}>
              <video ref={lightboxRef} src={playingItem.videoUrl} loop playsInline autoPlay controls onPlay={() => setLightboxPlaying(true)} onPause={() => setLightboxPlaying(false)} className="w-full h-full object-contain bg-black" style={{ maxHeight: 'calc(100vh - 140px)' }} />
            </div>
          </div>
          <div className="flex items-center justify-center gap-3 px-4 py-3 shrink-0" onClick={e => e.stopPropagation()}>
            {[{ label: 'Style', value: playingItem.style }, { label: 'Duration', value: playingItem.duration }, { label: 'Ratio', value: playingItem.aspectRatio }].map(({ label, value }) => (
              <div key={label} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10">
                <span className="text-[10px] text-white/40">{label}:</span><span className="text-[10px] font-semibold text-white/70 capitalize">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
