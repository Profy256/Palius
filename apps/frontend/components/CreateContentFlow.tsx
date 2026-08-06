'use client';

import React, { useRef, useState } from 'react';
import { CalendarPost } from '@/lib/types';
import { USER_AVATAR, IMAGES } from '@/lib/mockData';
import {
  X,
  Plus,
  Sparkles,
  UploadCloud,
  Globe,
  FileText,
  Bot,
  Send,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  File as FileIcon,
  PenLine,
  Zap,
  ChevronDown,
  Newspaper,
  Wand2,
  Paperclip,
  Share2,
  Image as ImageIcon,
} from 'lucide-react';
import {
  ingestContext,
  analyzeContent,
  generateContent,
  localContext,
  localAnalyze,
  localGenerate,
  ContextResponse,
  AnalyzeResponse,
  GenerateResponse,
  PlatformVariant,
  BlogDraft,
  ContextDoc,
  RequestedAsset,
  OutputMode,
} from '@/lib/api';
import { SOCIAL_PLATFORMS, BLOG_DESTINATIONS, resolveDestination, destinationPlatform } from '@/lib/platforms';

interface CreateContentFlowProps {
  isOpen: boolean;
  onClose: () => void;
  onAddPost: (post: CalendarPost) => void;
}

type Step = 'create' | 'work' | 'review';
type Phase = 'context' | 'analyze' | 'asking' | 'generate' | 'done';

interface MediaFile {
  name: string;
  type: string;
  size: string;
  url?: string;
}

const PLATFORMS = SOCIAL_PLATFORMS;

const AUDIENCES = [
  'Solo developer / indie hacker',
  'Startup (no marketing team)',
  'Small marketing team',
  'Business / SMB',
  'Influencer / Creator',
];

const CAPTION_STYLES = ['Professional', 'Funny', 'Educational', 'Sales', 'Storytelling', 'Luxury', 'Friendly'];

// What the owner wants out of this run. Not everyone wants to post on social —
// some owners only ever want the blog.
const OUTPUT_MODES: { id: OutputMode; label: string; hint: string }[] = [
  { id: 'both', label: 'Social + blog', hint: 'Posts everywhere, plus a companion long-form piece' },
  { id: 'social', label: 'Social posts only', hint: 'No blog is written' },
  { id: 'blog', label: 'Blog only', hint: 'Long-form only — nothing is posted to social media' },
];

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function CreateContentFlow({ isOpen, onClose, onAddPost }: CreateContentFlowProps) {
  const [step, setStep] = useState<Step>('create');
  const [phase, setPhase] = useState<Phase>('done');

  // Create form
  const [media, setMedia] = useState<MediaFile[]>([]);
  const [prompt, setPrompt] = useState('');
  const [caption, setCaption] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [platforms, setPlatforms] = useState<string[]>(['tiktok', 'instagram', 'linkedin', 'x']);
  const [audience, setAudience] = useState<string>('');
  const [style, setStyle] = useState<string>('');
  const [outputMode, setOutputMode] = useState<OutputMode>('both');
  const [blogApproved, setBlogApproved] = useState(true);
  const [blogTopic, setBlogTopic] = useState('');
  const [approvedDests, setApprovedDests] = useState<string[]>([]);

  // Product context
  const [description, setDescription] = useState('');
  const [docs, setDocs] = useState<ContextDoc[]>([]);

  // Assets the AI asked for after planning, and the cover the owner uploaded
  // for them. The AI never substitutes a visual it was not given.
  const [pendingAssets, setPendingAssets] = useState<RequestedAsset[]>([]);
  const [pendingAssetDone, setPendingAssetDone] = useState<boolean[]>([]);
  const [coverUrl, setCoverUrl] = useState<string | undefined>(undefined);

  // AI results
  const [contextResult, setContextResult] = useState<ContextResponse | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [generated, setGenerated] = useState<GenerateResponse | null>(null);

  // Asking-for-context
  const [askingQuestions, setAskingQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [requestedAssets, setRequestedAssets] = useState<RequestedAsset[]>([]);
  const [attachedAsset, setAttachedAsset] = useState<boolean[]>([]);
  const pendingAnswers = useRef<{ resolve: (answers: string[]) => void } | null>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const assetInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const pendingAssetInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  if (!isOpen) return null;

  const blogOnly = outputMode === 'blog';
  const wantsBlog = blogOnly || (outputMode === 'both' && blogApproved);

  const hasContextInputs = () => description.trim() !== '' || websiteUrl.trim() !== '' || docs.length > 0;

  // Whether the AI already has something real to look at. If not, it asks for
  // visuals rather than inventing them.
  const hasVisuals = () =>
    media.some((m) => m.type.startsWith('image') || m.type.startsWith('video')) ||
    docs.some((d) => d.kind === 'image' || d.kind === 'screenshot');

  const contextRequest = () => ({
    description: description || undefined,
    websiteUrl: websiteUrl || undefined,
    audience: audience,
    documents: docs,
  });

  const analyzeRequest = (ctx: string) => ({
    caption,
    prompt,
    websiteUrl,
    platform: blogOnly ? 'blog' : platforms[0] ?? 'tiktok',
    context: ctx,
    contentType: media.some((m) => m.type.startsWith('video')) ? 'video' : media.length ? 'image' : 'text',
    hasMedia: media.length > 0,
    mediaTypes: media.map((m) => m.type.split('/')[0]),
  });

  const generateRequest = (ctx: string) => ({
    caption,
    prompt,
    websiteUrl,
    platforms: blogOnly ? [] : platforms,
    style,
    context: ctx,
    outputMode,
    blogApproved: wantsBlog,
    blogTopic,
    audience,
    contentType: media.some((m) => m.type.startsWith('video')) ? 'video' : media.length ? 'image' : 'text',
    hasVisuals: hasVisuals(),
  });

  const handleMediaFiles = (files: FileList | null) => {
    if (!files) return;
    const next: MediaFile[] = Array.from(files).slice(0, 3).map((f) => {
      const isPreview = f.type.startsWith('image') || f.type.startsWith('video');
      return {
        name: f.name,
        type: f.type || 'file',
        size: `${(f.size / 1024).toFixed(0)} KB`,
        url: isPreview ? URL.createObjectURL(f) : undefined,
      };
    });
    setMedia((prev) => [...prev, ...next].slice(0, 3));
  };

  const addFilesToDocs = async (files: FileList | null) => {
    if (!files) return;
    const docsToAdd: ContextDoc[] = [];
    for (const f of Array.from(files).slice(0, 5)) {
      const isImage = f.type.startsWith('image/');
      const isPdf = f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
      let kind = 'file';
      let summary = `Attached document: ${f.name}`;
      if (isImage) {
        kind = 'image';
        summary = `Screenshot / image: ${f.name} — shows the product visually.`;
        // Keep the first real product image as the cover the blog can use, so
        // nothing has to be invented for it later.
        setCoverUrl((prev) => prev ?? URL.createObjectURL(f));
      } else if (isPdf) {
        kind = 'pdf';
        summary = `PDF document: ${f.name} (product documentation / spec sheet).`;
      } else if (
        f.type === 'text/plain' ||
        f.type === 'text/markdown' ||
        f.type === 'text/html' ||
        f.type === 'application/json' ||
        f.type === 'text/csv' ||
        f.name.endsWith('.md') ||
        f.name.endsWith('.mdx') ||
        f.name.endsWith('.txt') ||
        f.name.endsWith('.html') ||
        f.name.endsWith('.json') ||
        f.name.endsWith('.csv')
      ) {
        kind = 'text';
        try {
          const text = await f.text();
          summary = text.slice(0, 8000);
        } catch {
          /* ignore */
        }
      } else {
        kind = 'file';
        summary = `Document: ${f.name} (${f.type || 'binary file'}) — text not extracted in browser.`;
      }
      docsToAdd.push({ name: f.name, contentType: f.type || 'document', summary, kind });
    }
    setDocs((prev) => [...prev, ...docsToAdd].slice(0, 8));
  };

  const handleDocFiles = async (files: FileList | null) => {
    await addFilesToDocs(files);
  };

  const runWorkflow = async () => {
    setStep('work');
    setPhase('context');

    let contextSummary = '';
    let missing: string[] = [];
    let contextAssets: RequestedAsset[] = [];

    if (hasContextInputs()) {
      await delay(500);
      const req = contextRequest();
      const ctx = (await ingestContext(req)) ?? localContext(req);
      setContextResult(ctx);
      contextSummary = ctx.summary;
      missing = ctx.missing ?? [];
      contextAssets = ctx.requestedAssets ?? [];
    }

    setPhase('analyze');
    await delay(500);
    const req = analyzeRequest(contextSummary);
    const analysisRes = (await analyzeContent(req)) ?? localAnalyze(req);
    setAnalysis(analysisRes);

    const questions = [
      ...(analysisRes.contextQuestions ?? []),
      ...missing,
    ].filter(Boolean);
    const assets = [
      ...contextAssets,
      ...(analysisRes.requestedAssets ?? []),
    ].filter((a) => a && a.type);
    if (analysisRes.needsMoreContext || questions.length > 0 || assets.length > 0) {
      const unique = Array.from(new Set(questions));
      const docsBefore = docs.length;
      setAskingQuestions(unique);
      setAnswers(Array(unique.length).fill(''));
      setRequestedAssets(assets);
      setAttachedAsset(Array(assets.length).fill(false));
      setPhase('asking');
      const userAnswers = await new Promise<string[]>((resolve) => {
        pendingAnswers.current = { resolve };
      });
      pendingAnswers.current = null;
      const appended = [description.trim(), ...userAnswers.map((a, i) => `${i + 1}. ${a.trim()}`).filter(Boolean)]
        .filter(Boolean)
        .join('\n');
      if (appended || docs.length !== docsBefore) {
        setDescription(appended);
        const req2 = { ...contextRequest(), description: appended || undefined };
        const ctx2 = (await ingestContext(req2)) ?? localContext(req2);
        setContextResult(ctx2);
        contextSummary = ctx2.summary;
      }
    }

    setPhase('generate');
    await delay(700);
    const genReq = generateRequest(contextSummary);
    const gen = (await generateContent(genReq)) ?? localGenerate(genReq);
    setGenerated(gen);
    setApprovedDests([]);
    // Whatever the AI still needs after planning — a screenshot for the blog
    // cover, a product photo for a carousel — it asks for on the review screen
    // instead of guessing at it.
    const asked = gen.requestedAssets ?? [];
    setPendingAssets(asked);
    setPendingAssetDone(Array(asked.length).fill(false));
    setPhase('done');
    setStep('review');
  };

  const submitAnswers = () => {
    if (pendingAnswers.current) {
      pendingAnswers.current.resolve(answers);
    }
  };

  const handleAssetUpload = async (files: FileList | null, index: number) => {
    if (!files || !files.length) return;
    await addFilesToDocs(files);
    setAttachedAsset((prev) => {
      const copy = [...prev];
      copy[index] = true;
      return copy;
    });
  };

  // Uploads for the assets the AI asked for after it had already planned.
  const handlePendingAssetUpload = async (files: FileList | null, index: number) => {
    if (!files || !files.length) return;
    await addFilesToDocs(files);
    setPendingAssetDone((prev) => {
      const copy = [...prev];
      copy[index] = true;
      return copy;
    });
  };

  // Nothing publishes while the AI is still missing something it said it needs.
  const blockingAssets = pendingAssets.filter((a, i) => a.required && !pendingAssetDone[i]);

  // The owner's own image for the blog cover — never a stock stand-in.
  const blogCover = media[0]?.url ?? coverUrl;

  // Destinations the AI proposed, resolved to real catalog ids so loose names
  // like "substack" or "linkedin-article" line up with the list below.
  const suggestedDests = (generated?.blog?.suitableFor ?? []).map((d) => resolveDestination(d).id);

  const assetAccept = (type: string) =>
    type === 'screenshot' || type === 'image' ? 'image/*'
    : type === 'video' ? 'video/*'
    : type === 'pdf' ? 'application/pdf,.pdf'
    : type === 'markdown' ? '.md,.mdx,text/markdown,text/plain'
    : type === 'document' ? '.pdf,.doc,.docx,.md,.txt,.html,.json,.csv'
    : '*/*';

  const assetLabel = (type: string) =>
    ({ screenshot: 'Screenshot', image: 'Image / photo', video: 'Video', pdf: 'PDF', markdown: 'Markdown / notes', document: 'Document', other: 'File' } as Record<string, string>)[type] ?? 'File';

  const handlePublish = () => {
    if (!generated || blockingAssets.length) return;
    const now = new Date();
    const day = now.getDate().toString();
    const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    generated.variants.forEach((v, i) => {
      const format = v.format.toLowerCase();
      const type = format.includes('carousel') ? 'carousel' : v.platform === 'reddit' || format.includes('text') || format.includes('thread') ? 'text' : 'video';
      const post: CalendarPost = {
        id: `post-${Date.now()}-${i}`,
        title: v.caption.slice(0, 48) || `New ${v.platform} post`,
        platform: v.platform,
        date: day,
        time,
        status: 'SCHEDULED',
        thumbnail: media[0]?.url ?? IMAGES.serverRoom,
        author: 'Palius AI',
        avatar: USER_AVATAR,
        type,
        optimizationScore: generated.score,
        caption: v.caption,
        suggestedHooks: v.hooks,
        hashtags: v.hashtags,
      };
      onAddPost(post);
    });

    if (generated.blog && approvedDests.length > 0) {
      // Blog posts to platform blogs / micro-blogs — but only to the
      // destinations the owner explicitly approved.
      approvedDests.forEach((dest, i) => {
        const blogPost: CalendarPost = {
          id: `post-${Date.now()}-blog-${i}`,
          title: generated.blog!.title,
          platform: destinationPlatform(dest),
          date: day,
          time,
          // Manual targets (Product Hunt, Substack) have no write API — they
          // land as a prepared draft rather than pretending to be scheduled.
          status: resolveDestination(dest).manual ? 'AI DRAFT' : 'SCHEDULED',
          // Only the owner's own visuals — a required cover is asked for above,
          // never filled in with a stock image.
          thumbnail: blogCover ?? IMAGES.serverRoom,
          author: 'Palius AI',
          avatar: USER_AVATAR,
          type: 'text',
          optimizationScore: generated.score,
          caption: generated.blog!.intro,
          suggestedHooks: generated.blog!.sections,
          hashtags: [],
        };
        onAddPost(blogPost);
      });
    }

    onClose();
  };

  const reset = () => {
    setStep('create');
    setPhase('done');
    setGenerated(null);
    setAnalysis(null);
    setContextResult(null);
    setAskingQuestions([]);
    setAnswers([]);
    setRequestedAssets([]);
    setAttachedAsset([]);
    setApprovedDests([]);
    setPendingAssets([]);
    setPendingAssetDone([]);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const togglePlatform = (id: string) => {
    setPlatforms((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const currentContextSummary = contextResult?.summary ?? '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="w-full max-w-5xl h-[92vh] rounded-2xl bg-surface border border-line flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-4 border-b border-line bg-surface flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-500 border border-brand-400 flex items-center justify-center text-ink shadow-md">
              <Plus className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Create &amp; Publish Everywhere</h2>
              <p className="text-[11px] text-zinc-400">Upload like TikTok, prompt like Gemini — the AI adapts &amp; publishes where it fits.</p>
            </div>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-2 text-[11px] font-semibold">
            {(['create', 'work', 'review'] as Step[]).map((s, i) => {
              const active = step === s;
              const done = (step === 'work' && i < 1) || (step === 'review' && i < 2);
              return (
                <div key={s} className="flex items-center gap-2">
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${
                    active ? 'bg-brand-500/15 border-brand-500/40 text-brand-300' : done ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-card border-line text-zinc-400'
                  }`}>
                    {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : <span className="w-3.5 h-3.5 rounded-full border border-current flex items-center justify-center text-[9px]">{i + 1}</span>}
                    {s === 'create' ? 'Create' : s === 'work' ? 'AI Work' : 'Review & Publish'}
                  </div>
                  {i < 2 && <span className="text-zinc-500">—</span>}
                </div>
              );
            })}
          </div>

          <button onClick={handleClose} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-raised">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ============================================================ STEP 1: CREATE */}
        {step === 'create' && (
          <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-5">
            {/* Media drop zone — TikTok-style */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleMediaFiles(e.dataTransfer.files);
              }}
              onClick={() => mediaInputRef.current?.click()}
              className={`rounded-2xl border-2 border-dashed p-4 transition-all cursor-pointer ${
                media.length ? 'border-brand-500/40 bg-brand-500/5' : 'border-line-strong bg-well hover:border-brand-500/40 hover:bg-panel'
              }`}
            >
              <input
                ref={mediaInputRef}
                type="file"
                accept="video/*,image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  handleMediaFiles(e.target.files);
                  e.target.value = '';
                }}
              />
              {media.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-brand-500/10 border border-brand-500/30 flex items-center justify-center">
                    <UploadCloud className="w-7 h-7 text-brand-400" />
                  </div>
                  <p className="text-sm font-bold text-white">Add your video, image or carousel</p>
                  <p className="text-[11px] text-zinc-400">Drag &amp; drop here, or click to browse — just like TikTok</p>
                  <p className="text-[10px] text-zinc-400 font-mono">MP4 · MOV · PNG · JPG · WEBP</p>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  {media.map((m, i) => (
                    <div key={i} className="relative w-24 h-24 rounded-xl overflow-hidden border border-line-strong bg-card flex items-center justify-center shrink-0">
                      {m.type.startsWith('image') && m.url ? (
                        <img src={m.url} alt={m.name} className="w-full h-full object-cover" />
                      ) : m.type.startsWith('video') && m.url ? (
                        <video src={m.url} className="w-full h-full object-cover" muted />
                      ) : (
                        <FileIcon className="w-6 h-6 text-zinc-400" />
                      )}
                      <span className="absolute bottom-0 inset-x-0 text-[8px] text-zinc-300 bg-black/70 px-1 py-0.5 truncate">{m.name}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMedia((prev) => prev.filter((_, idx) => idx !== i));
                        }}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-zinc-300 hover:text-white text-[10px] flex items-center justify-center"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      mediaInputRef.current?.click();
                    }}
                    className="w-24 h-24 rounded-xl border border-dashed border-line-strong text-zinc-400 hover:text-brand-400 hover:border-brand-500/40 flex flex-col items-center justify-center gap-1 shrink-0"
                  >
                    <Plus className="w-5 h-5" />
                    <span className="text-[9px] font-semibold">Add more</span>
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Left: prompt + caption + url */}
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-brand-400" /> What do you want to create? <span className="text-[10px] text-zinc-400 font-mono">PROMPT</span>
                  </label>
                  <textarea
                    rows={3}
                    placeholder="e.g. Launch teaser for my AI scheduling tool — make it feel like a movie trailer for solo developers..."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    className="w-full bg-card border border-line rounded-xl p-3.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand-500/50 leading-relaxed resize-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                    <PenLine className="w-3.5 h-3.5 text-brand-400" /> Caption (the AI will rewrite per platform)
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Draft your main caption here..."
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    className="w-full bg-card border border-line rounded-xl p-3.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand-500/50 leading-relaxed resize-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-emerald-400" /> Website / Product URL <span className="text-[10px] text-zinc-400">(optional)</span>
                  </label>
                  <input
                    type="url"
                    placeholder="https://yourproduct.com"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    className="w-full bg-card border border-line rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50"
                  />
                  <p className="text-[10px] text-zinc-500 leading-relaxed">
                    Only needed when the AI doesn&apos;t already know your product — it reads the page to learn what you&apos;re
                    marketing. Uploading docs below does the same job. If you add it, posts will also link back to it.
                  </p>
                </div>
              </div>

              {/* Right: what to produce + platforms + audience + style + blog */}
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                    <Newspaper className="w-3.5 h-3.5 text-brand-400" /> What should the AI produce?
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {OUTPUT_MODES.map((m) => {
                      const active = outputMode === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setOutputMode(m.id)}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                            active ? 'bg-brand-500 text-ink shadow-sm' : 'bg-card text-zinc-400 hover:text-zinc-200 border border-line'
                          }`}
                        >
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-zinc-500">{OUTPUT_MODES.find((m) => m.id === outputMode)?.hint}</p>
                </div>

                {!blogOnly && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                      <Share2 className="w-3.5 h-3.5 text-cyan-400" /> Publish to
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {PLATFORMS.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => togglePlatform(p.id)}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                            platforms.includes(p.id)
                              ? 'bg-brand-500 text-ink shadow-sm'
                              : 'bg-card text-zinc-400 hover:text-zinc-200 border border-line'
                          }`}
                        >
                          <span className="mr-1">{p.icon}</span>{p.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-zinc-500">
                      Any other site can be added from Social Hub → Connect platform.
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-300">
                      Target audience
                      {!audience && (
                        <span className="ml-1.5 text-[10px] font-normal text-brand-400/80">AI decides automatically</span>
                      )}
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {AUDIENCES.map((a) => {
                        const active = audience === a;
                        return (
                          <button
                            key={a}
                            type="button"
                            onClick={() => setAudience(active ? '' : a)}
                            className={`rounded-full px-2.5 py-1 text-[11px] transition ${
                              active
                                ? 'bg-brand-500 text-ink shadow-sm'
                                : 'bg-card text-zinc-400 hover:text-zinc-200 border border-line'
                            }`}
                          >
                            {a}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-300">
                      Caption style
                      {!style && (
                        <span className="ml-1.5 text-[10px] font-normal text-brand-400/80">AI decides automatically</span>
                      )}
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {CAPTION_STYLES.map((s) => {
                        const active = style === s;
                        return (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setStyle(active ? '' : s)}
                            className={`rounded-full px-2.5 py-1 text-[11px] transition ${
                              active
                                ? 'bg-brand-500 text-ink shadow-sm'
                                : 'bg-card text-zinc-400 hover:text-zinc-200 border border-line'
                            }`}
                          >
                            {s}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Blog approval — the toggle only exists when both outputs are
                    on the table. Blog-only mode has nothing to approve. */}
                {outputMode === 'both' && (
                  <button
                    onClick={() => setBlogApproved(!blogApproved)}
                    className={`w-full p-3 rounded-xl border text-left transition-all ${
                      blogApproved ? 'bg-brand-500/10 border-brand-500/40' : 'bg-card border-line'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white flex items-center gap-1.5">
                        <Newspaper className="w-4 h-4 text-brand-400" /> Also write a blog / micro-blog
                      </span>
                      <span className={`w-9 h-5 rounded-full p-0.5 transition-all ${blogApproved ? 'bg-brand-500' : 'bg-raised'}`}>
                        <span className={`block w-4 h-4 rounded-full bg-white transition-all ${blogApproved ? 'ml-4' : ''}`} />
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-1.5">
                      The AI writes a companion blog / micro-blog and publishes it to platforms where long-form content fits (your website, LinkedIn articles, Medium, Substack).
                    </p>
                    {blogApproved && (
                      <input
                        type="text"
                        placeholder="Optional blog topic — e.g. 'How we built our AI scheduler'"
                        value={blogTopic}
                        onChange={(e) => setBlogTopic(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full mt-2 bg-well border border-line rounded-lg px-3 py-2 text-[11px] text-white placeholder-zinc-500 focus:outline-none focus:border-brand-500/50"
                      />
                    )}
                  </button>
                )}

                {blogOnly && (
                  <div className="w-full p-3 rounded-xl border bg-brand-500/10 border-brand-500/40">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Newspaper className="w-4 h-4 text-brand-400" /> Blog / micro-blog only
                    </span>
                    <p className="text-[11px] text-zinc-400 mt-1.5">
                      Nothing will be posted to social media. The AI writes the long-form piece and you choose which blog
                      destinations it goes to.
                    </p>
                    <input
                      type="text"
                      placeholder="Optional blog topic — e.g. 'How we built our AI scheduler'"
                      value={blogTopic}
                      onChange={(e) => setBlogTopic(e.target.value)}
                      className="w-full mt-2 bg-well border border-line rounded-lg px-3 py-2 text-[11px] text-white placeholder-zinc-500 focus:outline-none focus:border-brand-500/50"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Product context */}
            <div className="rounded-2xl bg-panel border border-line overflow-hidden">
              <details className="group">
                <summary className="flex items-center justify-between px-4 py-3 cursor-pointer select-none list-none">
                  <span className="text-xs font-bold text-white flex items-center gap-2">
                    <Bot className="w-4 h-4 text-brand-400" /> Product context — teach the AI about your product
                  </span>
                  <ChevronDown className="w-4 h-4 text-zinc-400 group-open:rotate-180 transition-transform" />
                </summary>
                <div className="px-4 pb-4 space-y-3">
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    If the AI doesn't have enough context, it will <span className="text-brand-300 font-semibold">ask you questions</span> before generating — it never guesses at your product. Describe it here, upload documentation (PDF, DOC/DOCX, .md, .txt, photos), or paste your URL above: any one of them is enough.
                  </p>
                  <textarea
                    rows={2}
                    placeholder="Describe your product, what it does, who it's for, what problem it solves..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full bg-well border border-line rounded-xl p-3 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand-500/50 leading-relaxed resize-none"
                  />
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleDocFiles(e.dataTransfer.files);
                    }}
                  >
                    <input
                      ref={docInputRef}
                      type="file"
                      accept=".pdf,.doc,.docx,.md,.txt,image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        handleDocFiles(e.target.files);
                        e.target.value = '';
                      }}
                    />
                    <button
                      onClick={() => docInputRef.current?.click()}
                      className="w-full py-2.5 rounded-xl bg-card border border-dashed border-line-strong text-[11px] font-semibold text-zinc-300 hover:text-brand-300 hover:border-brand-500/40 flex items-center justify-center gap-2 transition-all"
                    >
                      <Paperclip className="w-3.5 h-3.5" /> Upload documentation (PDF · DOC · MD · TXT · photos)
                    </button>
                  </div>
                  {docs.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {docs.map((d, i) => (
                        <span key={i} className="px-2 py-1 rounded-lg bg-card border border-line text-[10px] text-zinc-300 font-mono flex items-center gap-1.5">
                          <FileText className="w-3 h-3 text-brand-400" /> {d.name}
                          <button onClick={() => setDocs((prev) => prev.filter((_, idx) => idx !== i))} className="text-zinc-500 hover:text-red-400">✕</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </details>
            </div>
          </div>
        )}

        {/* ============================================================ STEP 2: AI WORK */}
        {step === 'work' && (
          <div className="flex-1 p-8 overflow-y-auto flex flex-col items-center justify-center gap-6">
            <div className="w-16 h-16 rounded-2xl bg-brand-500/10 border border-brand-500/40 flex items-center justify-center">
              <Bot className="w-8 h-8 text-brand-400" />
            </div>

            {/* Phase checklist */}
            <div className="w-full max-w-md space-y-2.5">
              {([
                { key: 'context', label: 'Learning your product context' },
                { key: 'analyze', label: 'Analyzing content & viral potential' },
                { key: 'generate', label: blogOnly ? 'Writing your long-form draft' : 'Adapting captions for every platform' },
              ] as { key: Phase; label: string }[]).map((item) => {
                const done = phase === 'done' || ['analyze', 'generate', 'done'].includes(item.key) && phase !== 'context' || (item.key === 'context' && phase === 'analyze') || (item.key === 'context' && phase === 'asking') || (item.key === 'analyze' && (phase === 'generate' || phase === 'asking'));
                const active = phase === item.key;
                return (
                  <div key={item.key} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-line">
                    {done ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : active ? (
                      <Loader2 className="w-4 h-4 text-brand-400 animate-spin shrink-0" />
                    ) : (
                      <span className="w-4 h-4 rounded-full border border-line-strong shrink-0" />
                    )}
                    <span className={`text-xs font-semibold ${done ? 'text-zinc-400' : active ? 'text-white' : 'text-zinc-400'}`}>{item.label}</span>
                  </div>
                );
              })}
            </div>

            {/* Asking for context */}
            {phase === 'asking' && (
              <div className="w-full max-w-lg rounded-2xl bg-panel border border-brand-500/40 p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-brand-400" />
                  <h4 className="text-sm font-bold text-white">I need a bit more context about your product</h4>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Answer these, or upload what I asked for (screenshots, PDFs, .md files...). The more real product material you give me, the better the content.
                </p>

                {/* Requested uploads — e.g. screenshots for video / carousel */}
                {requestedAssets.length > 0 && (
                  <div className="space-y-2">
                    {requestedAssets.map((asset, i) => (
                      <div key={i} className="rounded-xl bg-well border border-line p-2.5 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-semibold text-cyan-300 flex items-center gap-1.5">
                            <ImageIcon className="w-3.5 h-3.5" />
                            {assetLabel(asset.type)}
                            {asset.required && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-brand-500/15 border border-brand-500/40 text-brand-300">REQUIRED</span>}
                          </label>
                          {attachedAsset[i] ? (
                            <span className="text-[10px] font-bold text-emerald-400">✓ Attached</span>
                          ) : (
                            <span className="text-[10px] text-zinc-500">not uploaded</span>
                          )}
                        </div>
                        <p className="text-[11px] text-zinc-400 leading-snug">{asset.reason}</p>
                        <input
                          ref={(el) => { assetInputRefs.current[i] = el; }}
                          type="file"
                          accept={assetAccept(asset.type)}
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            handleAssetUpload(e.target.files, i);
                            e.target.value = '';
                          }}
                        />
                        <button
                          onClick={() => assetInputRefs.current[i]?.click()}
                          className={`w-full py-2 rounded-xl border border-dashed text-[11px] font-semibold flex items-center justify-center gap-2 transition-all ${
                            attachedAsset[i]
                              ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                              : 'bg-card border-line-strong text-zinc-300 hover:text-cyan-300 hover:border-cyan-500/40'
                          }`}
                        >
                          <Paperclip className="w-3.5 h-3.5" />
                          {attachedAsset[i] ? 'Uploaded — click to add more' : `Upload ${assetLabel(asset.type).toLowerCase()}`}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Text questions */}
                {askingQuestions.length > 0 && (
                  <div className="space-y-2">
                    {askingQuestions.map((q, i) => (
                      <div key={i} className="space-y-1">
                        <label className="text-[11px] font-semibold text-brand-300">{q}</label>
                        <input
                          type="text"
                          value={answers[i] ?? ''}
                          onChange={(e) => setAnswers((prev) => {
                            const copy = [...prev];
                            copy[i] = e.target.value;
                            return copy;
                          })}
                          className="w-full bg-well border border-line rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand-500/50"
                          placeholder="Type your answer..."
                        />
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={submitAnswers}
                  className="w-full py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-lg shadow-brand-500/20 transition-all"
                >
                  <Send className="w-3.5 h-3.5" /> Continue with these answers
                </button>
              </div>
            )}
          </div>
        )}

        {/* ============================================================ STEP 3: REVIEW */}
        {step === 'review' && generated && (
          <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-5">
            {/* Score header */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-panel border border-line">
                <span className="text-[10px] text-zinc-400 font-mono font-bold uppercase">Content Score</span>
                <div className="text-2xl font-extrabold text-brand-400 mt-1">{generated.score}/100</div>
                <p className="text-[11px] text-emerald-400 font-medium mt-1">Ready to publish</p>
              </div>
              <div className="p-4 rounded-xl bg-panel border border-line">
                <span className="text-[10px] text-zinc-400 font-mono font-bold uppercase">{blogOnly ? 'Output' : 'Adapted For'}</span>
                <div className="text-2xl font-extrabold text-white mt-1">{blogOnly ? '1' : generated.variants.length}</div>
                <p className="text-[11px] text-zinc-400 font-medium mt-1">
                  {blogOnly ? 'long-form piece · no social posts' : 'platforms'}
                </p>
              </div>
              <div className="p-4 rounded-xl bg-panel border border-line">
                <span className="text-[10px] text-zinc-400 font-mono font-bold uppercase">Website Link</span>
                <div className="text-sm font-bold text-white mt-2 truncate">{websiteUrl || 'Not set'}</div>
                <p className="text-[11px] text-emerald-400 font-medium mt-1">
                  {websiteUrl ? 'Traffic will point here' : 'Optional — add one if you want posts to link back'}
                </p>
              </div>
            </div>

            {/* What the AI still needs after planning. It asks rather than
                filling in a visual it was never given. */}
            {pendingAssets.length > 0 && (
              <div className="p-4 rounded-xl bg-cyan-500/5 border border-cyan-500/40 space-y-2.5">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                  <h4 className="text-xs font-bold text-white">The AI planned this — here is what it still needs from you</h4>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  It will not invent or substitute anything it was not given. Upload what it asked for, or tell it what to do instead.
                </p>
                {pendingAssets.map((asset, i) => (
                  <div key={i} className="rounded-xl bg-well border border-line p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-semibold text-cyan-300 flex items-center gap-1.5">
                        <ImageIcon className="w-3.5 h-3.5" />
                        {assetLabel(asset.type)}
                        {asset.for && <span className="text-[10px] font-normal text-zinc-400">for {asset.for}</span>}
                        {asset.required && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-brand-500/15 border border-brand-500/40 text-brand-300">REQUIRED</span>}
                      </label>
                      {pendingAssetDone[i] ? (
                        <span className="text-[10px] font-bold text-emerald-400">✓ Attached</span>
                      ) : (
                        <span className="text-[10px] text-zinc-500">not uploaded</span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-snug">{asset.reason}</p>
                    <input
                      ref={(el) => { pendingAssetInputRefs.current[i] = el; }}
                      type="file"
                      accept={assetAccept(asset.type)}
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        handlePendingAssetUpload(e.target.files, i);
                        e.target.value = '';
                      }}
                    />
                    <button
                      onClick={() => pendingAssetInputRefs.current[i]?.click()}
                      className={`w-full py-2 rounded-xl border border-dashed text-[11px] font-semibold flex items-center justify-center gap-2 transition-all ${
                        pendingAssetDone[i]
                          ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                          : 'bg-card border-line-strong text-zinc-300 hover:text-cyan-300 hover:border-cyan-500/40'
                      }`}
                    >
                      <Paperclip className="w-3.5 h-3.5" />
                      {pendingAssetDone[i] ? 'Uploaded — click to replace' : `Upload ${assetLabel(asset.type).toLowerCase()}`}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Context summary */}
            {currentContextSummary && (
              <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/30">
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-white">What the AI learned about your product</span>
                  {contextResult && <span className="text-[10px] font-mono text-emerald-400">confidence {contextResult.confidence}%</span>}
                </div>
                {contextResult?.scraped && (
                  <span className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-[10px] font-mono text-cyan-300">
                    <Globe className="w-3 h-3" /> scraped live from {contextResult.scrapedSource}
                  </span>
                )}
                <p className="text-xs text-zinc-300 mt-1.5 leading-relaxed">{currentContextSummary}</p>
              </div>
            )}

            {/* Analysis */}
            {analysis && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-panel border border-line">
                  <h4 className="text-xs font-bold text-white mb-2 flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Strengths</h4>
                  <ul className="space-y-1.5">
                    {analysis.strengths.map((s, i) => (
                      <li key={i} className="text-[11px] text-zinc-300 flex gap-2"><span className="text-emerald-400">▸</span>{s}</li>
                    ))}
                  </ul>
                </div>
                <div className="p-4 rounded-xl bg-panel border border-line">
                  <h4 className="text-xs font-bold text-white mb-2 flex items-center gap-1.5"><Wand2 className="w-3.5 h-3.5 text-brand-400" /> Improvements</h4>
                  <ul className="space-y-1.5">
                    {analysis.improvements.map((s, i) => (
                      <li key={i} className="text-[11px] text-zinc-300 flex gap-2"><span className="text-brand-400">▸</span>{s}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Platform variants — absent entirely in blog-only mode */}
            <div className={generated.variants.length ? 'space-y-3' : 'hidden'}>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <UploadCloud className="w-4 h-4 text-cyan-400" /> Platform-Adapted Versions <span className="text-[10px] text-zinc-500 font-mono">EDIT BEFORE PUBLISH</span>
              </h3>
              {generated.variants.map((v, i) => (
                <VariantCard key={i} variant={v} index={i} onChange={(nv) => {
                  const copy = [...generated.variants];
                  copy[i] = nv;
                  setGenerated({ ...generated, variants: copy });
                }} />
              ))}
            </div>

            {/* Blog preview — requires owner approval before posting */}
            {generated.blog && (
              <div className="p-4 rounded-xl bg-panel border border-line">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-white flex items-center gap-2">
                    <Newspaper className="w-4 h-4 text-brand-400" /> Blog / Micro-blog draft
                  </h4>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${
                    approvedDests.length
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                      : 'bg-brand-500/10 border-brand-500/40 text-brand-300'
                  }`}>
                    {approvedDests.length
                      ? `✓ Approved for ${approvedDests.length} destination${approvedDests.length === 1 ? '' : 's'}`
                      : '⏳ Needs your approval'}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 mt-1.5">
                  Long-form is only posted to the blogs / micro-blogs you approve below — it will never go out automatically.
                </p>
                <p className="text-sm font-bold text-brand-200 mt-2">{generated.blog.title}</p>
                <p className="text-[11px] text-zinc-300 leading-relaxed mt-1.5">{generated.blog.intro}</p>
                <ul className="space-y-1 mt-2">
                  {generated.blog.sections.map((s, i) => (
                    <li key={i} className="text-[11px] text-zinc-400">{s}</li>
                  ))}
                </ul>
                <p className="text-[11px] text-emerald-400 font-semibold mt-2">{generated.blog.cta}</p>

                {/* Required cover / screenshot — some blogs won't publish
                    without one, and the AI will not pick one for you. */}
                {generated.blog.requiresImage && (
                  <div className="mt-3 rounded-xl bg-card border border-line p-2.5 flex items-center gap-3">
                    <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 flex items-center justify-center bg-gradient-to-br from-brand-500/30 to-brand-600/30 border border-brand-500/30">
                      {blogCover ? (
                        <img src={blogCover} alt="Blog cover" className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon className="w-6 h-6 text-brand-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className={`text-[10px] font-bold uppercase tracking-wide ${blogCover ? 'text-emerald-300' : 'text-brand-300'}`}>
                        {blogCover ? 'Cover attached — your own image' : 'Cover / screenshot required'}
                      </p>
                      <p className="text-[11px] text-zinc-400 leading-snug">{generated.blog.image || 'Attach an app screenshot or product hero — this destination will not publish without one.'}</p>
                    </div>
                  </div>
                )}

                {/* Per-destination approval */}
                <div className="mt-3">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide mb-1.5">
                    Post to (approve each — nothing posts until you do)
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {/* Every destination is listed, not just the ones the AI
                        picked — the owner decides where long-form goes. */}
                    {BLOG_DESTINATIONS.map((dest) => {
                      const active = approvedDests.includes(dest.id);
                      const suggested = suggestedDests.includes(dest.id);
                      return (
                        <button
                          key={dest.id}
                          type="button"
                          title={dest.note}
                          onClick={() => setApprovedDests((prev) => (active ? prev.filter((x) => x !== dest.id) : [...prev, dest.id]))}
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                            active
                              ? 'bg-emerald-500 text-ink shadow-sm'
                              : suggested
                                ? 'bg-card text-zinc-200 border border-brand-500/40'
                                : 'bg-card text-zinc-400 hover:text-zinc-200 border border-line'
                          }`}
                        >
                          {active ? '✓ ' : ''}{dest.label}
                          {suggested && !active && <span className="ml-1 text-[9px] text-brand-300">AI pick</span>}
                          {dest.manual && <span className="ml-1 text-[9px] text-zinc-500">manual</span>}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-1.5">
                    Unapproved destinations stay as drafts and are never posted. <span className="text-zinc-400">Manual</span> targets
                    have no write API — Palius prepares a paste-ready kit or export instead of publishing for you.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer actions */}
        <div className="p-4 border-t border-line bg-surface flex items-center justify-between shrink-0">
          {step === 'create' && (
            <>
              <button onClick={handleClose} className="px-4 py-2.5 rounded-xl bg-raised hover:bg-raised text-zinc-300 text-xs font-semibold">
                Cancel
              </button>
              <button
                onClick={runWorkflow}
                disabled={!caption.trim() && !prompt.trim()}
                className="px-6 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-zinc-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-brand-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Sparkles className="w-4 h-4" /> Generate with AI
              </button>
            </>
          )}

          {step === 'work' && (
            <>
              <button
                onClick={() => { setStep('create'); setPhase('done'); }}
                className="px-4 py-2.5 rounded-xl bg-raised hover:bg-raised text-zinc-300 text-xs font-semibold flex items-center gap-2"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
              <div className="text-[11px] text-zinc-400 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-400" /> {phase === 'asking' ? 'Waiting for your answers' : 'AI is working...'}
              </div>
            </>
          )}

          {step === 'review' && (
            <>
              <button
                onClick={() => { setStep('create'); setPhase('done'); }}
                className="px-4 py-2.5 rounded-xl bg-raised hover:bg-raised text-zinc-300 text-xs font-semibold flex items-center gap-2"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back & edit
              </button>
              <div className="flex items-center gap-2">
                {blockingAssets.length > 0 && (
                  <span className="text-[11px] text-brand-300 font-semibold">
                    Waiting on {blockingAssets.length} upload{blockingAssets.length === 1 ? '' : 's'} the AI asked for
                  </span>
                )}
                <button
                  onClick={handleClose}
                  className="px-4 py-2.5 rounded-xl bg-raised hover:bg-raised text-zinc-300 text-xs font-semibold"
                >
                  Save draft
                </button>
                <button
                  onClick={handlePublish}
                  disabled={blockingAssets.length > 0 || (blogOnly && approvedDests.length === 0)}
                  className="px-6 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-brand-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Send className="w-4 h-4" />
                  {blogOnly ? (
                    approvedDests.length
                      ? `Publish blog to ${approvedDests.length} destination${approvedDests.length === 1 ? '' : 's'}`
                      : 'Blog needs destination approval'
                  ) : (
                    <>
                      Publish to {generated?.variants.length ?? 0} platform{(generated?.variants.length ?? 0) === 1 ? '' : 's'}
                      {generated?.blog && (approvedDests.length
                        ? ` + blog (${approvedDests.length} approved)`
                        : ' · blog needs approval')}
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------- Variant card -
function VariantCard({ variant, index, onChange }: { variant: PlatformVariant; index: number; onChange: (v: PlatformVariant) => void }) {
  const set = (patch: Partial<PlatformVariant>) => onChange({ ...variant, ...patch });
  return (
    <div className="rounded-xl bg-panel border border-line p-4 space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-lg bg-brand-500/15 text-brand-300 border border-brand-500/30 text-[10px] font-bold uppercase">{variant.platform}</span>
          <span className="text-[10px] text-zinc-400 font-mono">{variant.format}</span>
        </div>
        <span className="text-[10px] text-zinc-500 font-mono">{variant.urlInBio ? `🔗 ${variant.linkPlace}` : 'no link'}</span>
      </div>
      <textarea
        rows={3}
        value={variant.caption}
        onChange={(e) => set({ caption: e.target.value })}
        className="w-full bg-card border border-line rounded-xl p-3 text-xs text-white focus:outline-none focus:border-brand-500/50 leading-relaxed resize-none"
      />
      <div className="flex flex-wrap gap-1.5">
        {variant.hooks.map((h, i) => (
          <span key={i} className="px-2 py-1 rounded-lg bg-card border border-line text-[10px] text-brand-300">🎣 {h}</span>
        ))}
        {variant.hashtags.map((h, i) => (
          <span key={i} className="px-2 py-1 rounded-lg bg-card border border-line text-[10px] text-cyan-300 font-mono">{h}</span>
        ))}
      </div>
      <span className="text-[10px] text-zinc-600 font-mono">variant #{index + 1}</span>
    </div>
  );
}
