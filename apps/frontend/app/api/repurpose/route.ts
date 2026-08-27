import { NextResponse } from 'next/server';
import { callAI } from '@/lib/ai';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { title, originalCaption, originalPlatform, targetFormats, provider, apiKey, model, baseUrl } =
      body;

    // If the user supplied their own provider key, call the real model.
    if (provider && apiKey) {
      const prompt = buildRepurposePrompt(
        title,
        originalCaption,
        originalPlatform,
        targetFormats,
      );
      const { text } = await callAI({ provider, apiKey, model, baseUrl, prompt });
      const outputs = parseRepurpose(text, targetFormats);
      return NextResponse.json({ success: true, outputs, provider: provider, live: true });
    }

    // Otherwise fall back to the built-in mock so the demo still works.
    const outputs = mockOutputs(title, originalCaption, originalPlatform);
    return NextResponse.json({ success: true, outputs, live: false });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to repurpose content' },
      { status: 500 },
    );
  }
}

function buildRepurposePrompt(
  title: string,
  originalCaption: string,
  originalPlatform?: string,
  targetFormats?: string[],
): string {
  const targets =
    Array.isArray(targetFormats) && targetFormats.length
      ? targetFormats.join(', ')
      : 'TikTok short video, LinkedIn executive post, X/Twitter thread';
  return `You are a social media repurposing engine. Take the source post below and adapt it into distinct formats for each target platform. Keep the core message and brand voice, but tailor hook, length, hashtags and structure to each platform.

Return ONLY valid minified JSON (no markdown, no code fences), an array of objects with exactly these keys:
- platform: short id (e.g. tiktok, linkedin, x, instagram, youtube)
- format: a short label of the format
- hook: one punchy line
- caption: the full adapted caption (use \\n for line breaks)
- hashtags: an array of strings including the # symbol

SOURCE POST
Title: ${title}
Original platform: ${originalPlatform ?? 'unknown'}
Original caption: ${originalCaption ?? ''}

TARGET PLATFORMS: ${targets}`;
}

function parseRepurpose(text: string, targetFormats?: string[]): any[] {
  let jsonText = text.trim();
  // Strip ```json fences if the model ignored instructions.
  const fence = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) jsonText = fence[1].trim();
  // Take the first JSON array if extra prose is present.
  const arrStart = jsonText.indexOf('[');
  const arrEnd = jsonText.lastIndexOf(']');
  if (arrStart !== -1 && arrEnd !== -1) {
    jsonText = jsonText.slice(arrStart, arrEnd + 1);
  }
  try {
    const parsed = JSON.parse(jsonText);
    if (Array.isArray(parsed)) {
      return parsed.map((o) => ({
        platform: String(o.platform ?? 'unknown'),
        format: String(o.format ?? 'Post'),
        hook: String(o.hook ?? ''),
        caption: String(o.caption ?? ''),
        hashtags: Array.isArray(o.hashtags) ? o.hashtags.map(String) : [],
      }));
    }
  } catch {
    // Fall through to raw text fallback.
  }
  return [
    {
      platform: 'unknown',
      format: 'Adapted',
      hook: '',
      caption: text,
      hashtags: [],
    },
  ];
}

function mockOutputs(title: string, originalCaption: string, originalPlatform?: string) {
  return [
    {
      platform: 'tiktok',
      format: 'Short Video (0:45)',
      hook: 'What no one tells you about enterprise AI scaling...',
      caption: `${title}\n\nKey breakdown of our internal infrastructure tests. #AI #TechTrends #Productivity`,
      hashtags: ['#AI', '#TechTrends', '#Productivity'],
    },
    {
      platform: 'linkedin',
      format: 'Executive Carousel / Article',
      hook: '3 Lessons from scaling agentic workflows across 100k requests.',
      caption: `Over the past quarter, we analyzed how Fortune 500 tech teams deploy AI workers.\n\nHere are 3 fundamental shifts every CTO should know:\n1. Autonomous orchestration\n2. Real-time observability\n3. Zero-trust credential vaulting.\n\nWhat are your thoughts on agentic execution?`,
      hashtags: ['#ExecutiveLeadership', '#EnterpriseAI', '#CTO'],
    },
    {
      platform: 'x',
      format: 'Twitter/X Thread (5 posts)',
      hook: '1/5 Why the traditional SaaS model is dying (and what comes next): 🧵',
      caption: `1/5 Why the traditional SaaS model is dying (and what comes next):\n\n2/5 Software is no longer a tool you click—it is a digital worker you delegate to.\n\n3/5 Execution velocity increases by 10x when agents handle repetitive platform syncs.\n\n4/5 The bottleneck isn't compute; it's trust and credential security.\n\n5/5 Read our full analysis inside Palius Social Media OS.`,
      hashtags: ['#BuildInPublic', '#TechStrategy'],
    },
  ];
}
