import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { title, originalCaption, originalPlatform, targetFormats } = await req.json();

    const outputs = [
      {
        platform: 'tiktok',
        format: 'Short Video (0:45)',
        hook: 'What no one tells you about enterprise AI scaling...',
        caption: `${title}\n\nKey breakdown of our internal infrastructure tests. #AI #TechTrends #Productivity`,
        hashtags: ['#AI', '#TechTrends', '#Productivity']
      },
      {
        platform: 'linkedin',
        format: 'Executive Carousel / Article',
        hook: '3 Lessons from scaling agentic workflows across 100k requests.',
        caption: `Over the past quarter, we analyzed how Fortune 500 tech teams deploy AI workers.\n\nHere are 3 fundamental shifts every CTO should know:\n1. Autonomous orchestration\n2. Real-time observability\n3. Zero-trust credential vaulting.\n\nWhat are your thoughts on agentic execution?`,
        hashtags: ['#ExecutiveLeadership', '#EnterpriseAI', '#CTO']
      },
      {
        platform: 'x',
        format: 'Twitter/X Thread (5 posts)',
        hook: '1/5 Why the traditional SaaS model is dying (and what comes next): 🧵',
        caption: `1/5 Why the traditional SaaS model is dying (and what comes next):\n\n2/5 Software is no longer a tool you click—it is a digital worker you delegate to.\n\n3/5 Execution velocity increases by 10x when agents handle repetitive platform syncs.\n\n4/5 The bottleneck isn't compute; it's trust and credential security.\n\n5/5 Read our full analysis inside Palius Social Media OS.`,
        hashtags: ['#BuildInPublic', '#TechStrategy']
      }
    ];

    return NextResponse.json({ success: true, outputs });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to repurpose content' }, { status: 500 });
  }
}
