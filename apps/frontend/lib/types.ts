export type NavTab =
  | 'dashboard'
  | 'content'
  | 'social-hub'
  | 'engagement'
  | 'dms'
  | 'analytics'
  | 'ai-hub'
  | 'settings';

export type EcosystemProduct = 
  | 'social-os'
  | 'studio'
  | 'analytics'
  | 'automations'
  | 'crm'
  | 'commerce';

export type PlatformType = 
  | 'all'
  | 'tiktok'
  | 'instagram'
  | 'facebook'
  | 'reddit'
  | 'x'
  | 'linkedin'
  | 'threads'
  | 'pinterest'
  | 'youtube'
  | 'whatsapp'
  | 'telegram'
  | string; // Allows unlisted custom platforms

export type AuthLevel = 'level-1' | 'level-2' | 'level-3';

export interface UnlistedPlatformScript {
  id: string;
  name: string;
  loginUrl: string;
  selectors: {
    usernameField: string;
    passwordField: string;
    submitButton: string;
    publishContainer?: string;
    postInput?: string;
    postButton?: string;
    commentContainer?: string;
  };
  actionsPermitted: ('publish' | 'comment' | 'read_dms')[];
  isCommunityShared?: boolean;
  version: string;
}

export interface ConnectedAccount {
  id: string;
  platform: PlatformType;
  handle: string;
  name: string;
  avatar: string;
  status: 'CONNECTED' | 'DISCONNECTED' | 'ACTION REQUIRED' | 'CONNECTING';
  authLevel: AuthLevel; // Level 1: Official API, Level 2: OAuth 2.0, Level 3: Embedded Browser Session
  followers: string;
  metricLabel: string;
  metricValue: string;
  growth: string;
  isPositive: boolean;
  isCustomUnlisted?: boolean;
  customScript?: UnlistedPlatformScript;
  disclaimerAccepted?: boolean;
}

export interface CalendarPost {
  id: string;
  title: string;
  platform: PlatformType;
  date: string;
  time: string;
  status: 'SCHEDULED' | 'AI DRAFT' | 'OPTIMIZING' | 'PUBLISHED' | 'MISSED';
  thumbnail?: string;
  author: string;
  avatar: string;
  type: 'video' | 'image' | 'carousel' | 'text' | 'reels' | 'shorts';
  optimizationScore: number;
  caption: string;
  suggestedHooks: string[];
  hashtags: string[];
  critiqueText?: string;
  duration?: string;
  repurposedFromId?: string;
  abVariants?: { hook: string; caption: string; estimatedCtrBoost: string }[];
  targetAudienceSegment?: string;
}

export interface CompetitorMetric {
  id: string;
  brand: string;
  postsPerDay: number;
  engagementRate: string;
  growth: string;
  isPositive: boolean;
  isUser: boolean;
  topFormat: string;
  assetImage: string;
  popularTopics?: string[];
}

export interface DirectMessageLead {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  platform: PlatformType;
  message: string;
  time: string;
  aiSuggestedReply: string;
  purchaseIntentScore: number; // 0 to 100
  status: 'NEW' | 'ESCALATED' | 'REPLIED' | 'QUALIFIED';
}

export interface CommentItem {
  id: string;
  platform: PlatformType;
  author: string;
  avatar: string;
  text: string;
  time: string;
  category: 'Question' | 'Complaint' | 'Praise' | 'Spam' | 'Sales Inquiry' | 'Refund Request';
  aiSuggestedReply: string;
  status: 'PENDING' | 'REPLIED' | 'IGNORED';
  postTitle?: string;
}

export interface KnowledgeBaseRule {
  id: string;
  category: string;
  keywords: string[];
  responseTemplate: string;
  autoReplyEnabled: boolean;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
  cardData?: {
    title: string;
    description: string;
    actions: { label: string; actionId: string }[];
  };
}

export interface StudioArtifact {
  id: string;
  title: string;
  type: 'image' | 'video' | 'concept' | 'script';
  url: string;
  timestamp: string;
  tags: string[];
}
