'use client';

import React, { useState } from 'react';
import { 
  NavTab, 
  EcosystemProduct, 
  CalendarPost, 
  ConnectedAccount, 
  PlatformType, 
  ChatMessage, 
  DirectMessageLead, 
  CommentItem,
  KnowledgeBaseRule,
  StudioArtifact, 
  UnlistedPlatformScript,
  AuthLevel 
} from '@/lib/types';
import { 
  INITIAL_CALENDAR_POSTS, 
  INITIAL_CONNECTED_ACCOUNTS, 
  INITIAL_COMPETITOR_METRICS, 
  INITIAL_DIRECT_MESSAGES, 
  INITIAL_COMMENTS,
  INITIAL_KNOWLEDGE_BASE,
  INITIAL_CHAT_MESSAGES, 
  INITIAL_ARTIFACTS, 
  INITIAL_UNLISTED_SCRIPTS,
  IMAGES 
} from '@/lib/mockData';

import { EcosystemBar } from '@/components/EcosystemBar';
import { Sidebar } from '@/components/Sidebar';
import { TopBar } from '@/components/TopBar';
import { DashboardView } from '@/components/DashboardView';
import { ContentCalendarView } from '@/components/ContentCalendarView';
import { SocialHubView } from '@/components/SocialHubView';
import { PlatformConnectionModal } from '@/components/PlatformConnectionModal';
import { ConnectorScriptEditorModal } from '@/components/ConnectorScriptEditorModal';
import { CreateContentFlow } from '@/components/CreateContentFlow';
import { AiAnalyzerDrawer } from '@/components/AiAnalyzerDrawer';
import { AiRepurposeModal } from '@/components/AiRepurposeModal';
import { EngagementHubView } from '@/components/EngagementHubView';
import { DMLeadManagerView } from '@/components/DMLeadManagerView';
import { AnalyticsView } from '@/components/AnalyticsView';
import { AiHubView } from '@/components/AiHubView';
import { SettingsView } from '@/components/SettingsView';
import { askAdvisor, AdvisorChatTurn } from '@/lib/api';
import { ReportIssueModal } from '@/components/ReportIssueModal';

export default function Home() {
  const [currentProduct, setCurrentProduct] = useState<EcosystemProduct>('social-os');
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformType>('all');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Application Data States
  const [posts, setPosts] = useState<CalendarPost[]>(INITIAL_CALENDAR_POSTS);
  const [accounts, setAccounts] = useState<ConnectedAccount[]>(INITIAL_CONNECTED_ACCOUNTS);
  const [competitors] = useState(INITIAL_COMPETITOR_METRICS);
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_CHAT_MESSAGES);
  const [leads, setLeads] = useState<DirectMessageLead[]>(INITIAL_DIRECT_MESSAGES);
  const [comments, setComments] = useState<CommentItem[]>(INITIAL_COMMENTS);
  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeBaseRule[]>(INITIAL_KNOWLEDGE_BASE);
  const [artifacts, setArtifacts] = useState<StudioArtifact[]>(INITIAL_ARTIFACTS);
  const [unlistedScripts, setUnlistedScripts] = useState<UnlistedPlatformScript[]>(INITIAL_UNLISTED_SCRIPTS);

  // Modals & Drawers States
  const [selectedPost, setSelectedPost] = useState<CalendarPost | null>(INITIAL_CALENDAR_POSTS[0]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [connectDefaultPlatform, setConnectDefaultPlatform] = useState<string>('instagram');
  const [isComposeModalOpen, setIsComposeModalOpen] = useState(false);
  const [isScriptEditorOpen, setIsScriptEditorOpen] = useState(false);
  const [editingScript, setEditingScript] = useState<UnlistedPlatformScript | undefined>(undefined);
  const [isRepurposeOpen, setIsRepurposeOpen] = useState(false);
  const [isReportIssueOpen, setIsReportIssueOpen] = useState(false);
  const [isAdvisorThinking, setIsAdvisorThinking] = useState(false);
  const [repurposeTargetPost, setRepurposeTargetPost] = useState<CalendarPost | null>(null);

  // Handlers
  const handleSelectPost = (post: CalendarPost) => {
    setSelectedPost(post);
    setIsDrawerOpen(true);
  };

  const handleUpdatePost = (updatedPost: CalendarPost) => {
    setPosts(prev => prev.map(p => p.id === updatedPost.id ? updatedPost : p));
  };

  const handleAddPost = (newPost: CalendarPost) => {
    setPosts(prev => [newPost, ...prev]);
  };

  const handleOpenConnectModal = (platform?: string) => {
    if (platform) setConnectDefaultPlatform(platform);
    setIsConnectModalOpen(true);
  };

  const handleConnectionSuccess = (platform: string, authLevel: AuthLevel) => {
    setAccounts(prev => {
      const exists = prev.find(a => a.platform === platform);
      if (exists) {
        return prev.map(acc => acc.platform === platform ? { ...acc, status: 'CONNECTED', authLevel } : acc);
      } else {
        const newAcc: ConnectedAccount = {
          id: `acc-${Date.now()}`,
          platform,
          handle: `@palius_${platform}`,
          name: `Palius ${platform.toUpperCase()} Official`,
          avatar: IMAGES.userHeadshot,
          status: 'CONNECTED',
          authLevel,
          followers: '10.5k',
          metricLabel: 'Growth',
          metricValue: '+15.2%',
          growth: '+15.2%',
          isPositive: true,
          disclaimerAccepted: true
        };
        return [...prev, newAcc];
      }
    });
  };

  const handleOpenScriptEditor = (script?: UnlistedPlatformScript) => {
    setEditingScript(script);
    setIsScriptEditorOpen(true);
  };

  const handleSaveScript = (savedScript: UnlistedPlatformScript) => {
    setUnlistedScripts(prev => {
      const idx = prev.findIndex(s => s.id === savedScript.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = savedScript;
        return copy;
      }
      return [...prev, savedScript];
    });

    // Also add to connected accounts if new custom platform
    setAccounts(prev => {
      const exists = prev.find(a => a.customScript?.id === savedScript.id);
      if (exists) return prev;
      const newAcc: ConnectedAccount = {
        id: `acc-custom-${Date.now()}`,
        platform: savedScript.name,
        handle: `@palius.${savedScript.name.toLowerCase().replace(/\s+/g, '')}`,
        name: savedScript.name,
        avatar: IMAGES.userHeadshot,
        status: 'CONNECTED',
        authLevel: 'level-3',
        followers: '5.2k',
        metricLabel: 'Script Automation',
        metricValue: 'ACTIVE',
        growth: '+100%',
        isPositive: true,
        isCustomUnlisted: true,
        customScript: savedScript,
        disclaimerAccepted: true
      };
      return [...prev, newAcc];
    });
  };

  // AI Chat Handler — goes to the Go backend, so it uses the one provider the
  // rest of the platform uses and its token spend lands in the usage ledger.
  const handleSendMessage = async (text: string) => {
    const stamp = () =>
      new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: stamp()
    };
    setMessages(prev => [...prev, userMsg]);

    // Send the thread so the advisor can follow a conversation instead of
    // answering every message cold.
    const history: AdvisorChatTurn[] = messages.map(m => ({
      sender: m.sender === 'ai' ? 'ai' : 'user',
      text: m.text
    }));

    setIsAdvisorThinking(true);
    const res = await askAdvisor(text, history);
    setIsAdvisorThinking(false);

    // A failure says so. Inventing a confident-sounding answer here is what
    // made a dead integration look like a working feature for so long.
    const reply = res?.reply
      ?? "I couldn't reach the AI service just now. Check that the backend is running and has an AI provider configured, then try again.";

    setMessages(prev => [...prev, {
      id: `ai-${Date.now()}`,
      sender: 'ai',
      text: reply,
      timestamp: stamp()
    }]);
  };

  const handleApproveLeadReply = (leadId: string) => {
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: 'REPLIED' } : l));
  };

  const handleGenerateArtifact = (prompt: string) => {
    const newArtifact: StudioArtifact = {
      id: `art-${Date.now()}`,
      title: `${prompt.slice(0, 14).replace(/[^a-zA-Z0-9]/g, '_')}.png`,
      type: 'concept',
      url: IMAGES.archConcept,
      timestamp: 'Just now',
      tags: ['AI Generated', 'Studio Alpha']
    };
    setArtifacts(prev => [newArtifact, ...prev]);
  };

  const handleOpenRepurpose = (post: CalendarPost) => {
    setRepurposeTargetPost(post);
    setIsRepurposeOpen(true);
  };

  // Navigating always dismisses the mobile drawer — otherwise it stays parked
  // over the view the user just asked for.
  const handleSelectTab = (tab: NavTab) => {
    setCurrentTab(tab);
    setIsSidebarOpen(false);
  };

  return (
    <div className="flex flex-col h-screen bg-ink text-fg overflow-hidden font-sans">
      {/* Top Ecosystem Switcher Bar */}
      <EcosystemBar
        currentProduct={currentProduct}
        onSelectProduct={setCurrentProduct}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar — a fixed rail from lg up, a dismissible drawer below */}
        <Sidebar
          currentTab={currentTab}
          onSelectTab={handleSelectTab}
          onOpenQuickPost={() => {
            setIsComposeModalOpen(true);
            setIsSidebarOpen(false);
          }}
          unreadLeadsCount={leads.filter(l => l.status === 'NEW').length}
          pendingCommentsCount={comments.filter(c => c.status === 'PENDING').length}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />

        {/* Main Workspace */}
        <div className="flex-1 flex flex-col overflow-hidden relative bg-ink min-w-0">
          <TopBar
            currentTab={currentTab}
            onSelectTab={setCurrentTab}
            unreadDmsCount={leads.filter(l => l.status === 'NEW').length}
            onCreateContent={() => setIsComposeModalOpen(true)}
            onToggleSidebar={() => setIsSidebarOpen(v => !v)}
            onReportIssue={() => setIsReportIssueOpen(true)}
          />

          {/* View Router */}
          {currentProduct !== 'social-os' ? (
            <ProductPlaceholder
              product={currentProduct}
              onBackToSocial={() => setCurrentProduct('social-os')}
            />
          ) : (
            <>
              {currentTab === 'dashboard' && (
                <DashboardView
                  posts={posts}
                  accounts={accounts}
                  leads={leads}
                  onNavigate={setCurrentTab}
                />
              )}

              {currentTab === 'content' && (
                <ContentCalendarView
                  posts={posts}
                  onSelectPost={handleSelectPost}
                  onOpenCompose={() => setIsComposeModalOpen(true)}
                  selectedPlatform={selectedPlatform}
                  onSelectPlatform={setSelectedPlatform}
                  onOpenRepurpose={handleOpenRepurpose}
                />
              )}

              {currentTab === 'social-hub' && (
                <SocialHubView
                  accounts={accounts}
                  onOpenConnectModal={handleOpenConnectModal}
                  onOpenScriptEditor={handleOpenScriptEditor}
                />
              )}

              {currentTab === 'engagement' && (
                <EngagementHubView
                  comments={comments}
                  knowledgeBase={knowledgeBase}
                  onApproveCommentReply={(id) => {
                    setComments(prev => prev.map(c => c.id === id ? { ...c, status: 'REPLIED' } : c));
                  }}
                  onUpdateKnowledgeBase={setKnowledgeBase}
                  onNavigateToDms={() => setCurrentTab('dms')}
                />
              )}

              {currentTab === 'dms' && (
                <DMLeadManagerView
                  leads={leads}
                  onApproveLeadReply={handleApproveLeadReply}
                />
              )}

              {currentTab === 'analytics' && (
                <AnalyticsView
                  competitors={competitors}
                />
              )}

              {currentTab === 'ai-hub' && (
                <AiHubView
                  messages={messages}
                  onSendMessage={handleSendMessage}
                  isThinking={isAdvisorThinking}
                  artifacts={artifacts}
                  onGenerateArtifact={handleGenerateArtifact}
                />
              )}

              {currentTab === 'settings' && (
                <SettingsView />
              )}
            </>
          )}

          {/* Drawers & Modals */}
          <AiAnalyzerDrawer
            post={selectedPost}
            isOpen={isDrawerOpen && currentTab === 'content'}
            onClose={() => setIsDrawerOpen(false)}
            onUpdatePost={handleUpdatePost}
            onOpenRepurpose={handleOpenRepurpose}
          />

          <PlatformConnectionModal
            isOpen={isConnectModalOpen}
            onClose={() => setIsConnectModalOpen(false)}
            defaultPlatform={connectDefaultPlatform}
            onConnectionSuccess={handleConnectionSuccess}
          />

          <ConnectorScriptEditorModal
            isOpen={isScriptEditorOpen}
            onClose={() => setIsScriptEditorOpen(false)}
            script={editingScript}
            onSaveScript={handleSaveScript}
          />

          <CreateContentFlow
            isOpen={isComposeModalOpen}
            onClose={() => setIsComposeModalOpen(false)}
            onAddPost={handleAddPost}
          />

          <AiRepurposeModal
            isOpen={isRepurposeOpen}
            onClose={() => setIsRepurposeOpen(false)}
            post={repurposeTargetPost}
          />

          {/* The report carries whichever screen the user was on, so support
              does not have to open with "where did this happen?". */}
          <ReportIssueModal
            isOpen={isReportIssueOpen}
            onClose={() => setIsReportIssueOpen(false)}
            currentPage={TAB_LABELS[currentTab]}
          />
        </div>
      </div>
    </div>
  );
}

// Human-readable screen names, attached to any issue reported from them.
const TAB_LABELS: Record<NavTab, string> = {
  dashboard: 'Dashboard',
  content: 'Content Calendar',
  'social-hub': 'Social Hub',
  engagement: 'Engagement Hub',
  dms: 'DM Assistant',
  analytics: 'Analytics',
  'ai-hub': 'AI Hub',
  settings: 'Settings',
};

// ---------------------------------------------------------------------------
// The ecosystem bar switches between six CHAK products, but only Social Media
// OS ships today. Selecting any other one used to change state and render
// nothing, so the tab looked broken. Say what it is instead.
// ---------------------------------------------------------------------------
const PRODUCT_COPY: Record<Exclude<EcosystemProduct, 'social-os'>, { name: string; blurb: string }> = {
  studio: {
    name: 'Palius Studio',
    blurb:
      'AI creative studio — images, video, product photography, thumbnails, logos, voice and scripts, feeding straight into your publishing queue.',
  },
  analytics: {
    name: 'Palius Analytics',
    blurb:
      'Business intelligence across social, web traffic, campaigns, sales and conversion funnels, with plain-language explanations and forecasting.',
  },
  automations: {
    name: 'Palius Automations',
    blurb:
      'No-code visual workflow automation — lead routing, follow-ups, notifications and AI agent workflows, built without writing code.',
  },
  crm: {
    name: 'Palius CRM',
    blurb:
      'Leads captured from comments and DMs drop straight into a sales pipeline with AI qualification, segmentation and automated follow-up.',
  },
  commerce: {
    name: 'Palius Commerce',
    blurb:
      'Product catalog, inventory, orders and payments with live selling and social commerce promoted through Social Media OS.',
  },
};

function ProductPlaceholder({
  product,
  onBackToSocial,
}: {
  product: Exclude<EcosystemProduct, 'social-os'>;
  onBackToSocial: () => void;
}) {
  const copy = PRODUCT_COPY[product];

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-xl mt-10 rounded-2xl bg-panel border border-line p-8 text-center space-y-4">
        <span className="inline-block px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/30 text-brand-400 text-[11px] font-bold font-mono uppercase tracking-wider">
          On the roadmap
        </span>
        <h2 className="text-xl font-extrabold text-white">{copy.name}</h2>
        <p className="text-xs text-zinc-300 leading-relaxed">{copy.blurb}</p>
        <p className="text-[11px] text-zinc-400 leading-relaxed">
          Every product shares one AI brain, so what Social Media OS learns about your brand carries
          over the moment this one lands.
        </p>
        <button
          onClick={onBackToSocial}
          className="px-4 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-400 text-ink font-bold text-xs transition-colors"
        >
          Back to Social Media OS
        </button>
      </div>
    </div>
  );
}
