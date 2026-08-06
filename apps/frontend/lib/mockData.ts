import { 
  CalendarPost, 
  ConnectedAccount, 
  CompetitorMetric, 
  DirectMessageLead, 
  CommentItem, 
  KnowledgeBaseRule, 
  ChatMessage, 
  StudioArtifact,
  UnlistedPlatformScript 
} from './types';

export const USER_AVATAR = "https://lh3.googleusercontent.com/aida-public/AB6AXuBoYomdX5SQ1KYxAo95AntiMHMeGQzLBS4GRzelhIIRoAvKXxXdVvZcmtS_TfNiXDQn-n-bxiWtgwStx2nJoixV2PW6fClpGe38Jb2xGAoUurKvZzOI1MY0PJt5g_hRN0ql4nRaZk4pheKFRIDWLnV-f0uClu6-UamxjGR5rJgXYJ9B2yKO1zkPGlFJBqWeC9hgs3wfmBkgCi5ivrUOJn5qmMeAlsMpqJ-2w0wtuOnDGsQJ8VogHgzeQaVkXETYA3BeW9LWhxTrpYo";

export const IMAGES = {
  userHeadshot: USER_AVATAR,
  sarahLead: "https://lh3.googleusercontent.com/aida-public/AB6AXuCFBaXWIit8EOmHKVGYKg_RYJeUPAJnFn3lhqnyh3iB2TWYu_zvBPY6d9lwnX-LlBVNftQoTXlpUD46Gv5LgD5H9-LuwT1O2sD_iImZUjWGaUki19Nr1TExGqM4UD0z5-BkJS3wMkhq_WNCHxTrsMzUu1jUUl5coImByYAO7QVkNgL5TBBAnP36Kr70_I8Khb_P6FfRtpCyYHkxKSLktluA7BUinZ-4OpYpyb2r3i-6ym4PIE1sK18Ycrl2hoM_SVe4jmauNIxMtiA",
  userChatAvatar: "https://lh3.googleusercontent.com/aida-public/AB6AXuA1Nc8h49xKG4ho4Mpq8H5oIqtH-puAVAWuPjYttFEgNr_DNChdP6ka5nCTXNboeNPm0NtZg4Ud8zh8mSLgwhzMm8lKAqLrLVrQqlrZj6Oxj4y2Cm19ENAXjQFsoCl4fIAAErqM84YDrg6gbcJ27dG90P67RXs0vduC-vh7U3vhQ4evvYzUZvbwfr9qaFI7dqZrKIsw4WEqFtyK2BKgjG1Wte7l7FAqKCXpC1CU3w9LhjoRmDdf_yk34YC_sAtkyYbhtQYUHV1E9nc",
  serverRoom: "https://lh3.googleusercontent.com/aida-public/AB6AXuBFQlVAKmKXUuLCt2tZ_34LvszZ3u7CZAXvZlHxfN8GJ9IEkV1oI3GuxA1fqwPsVwv2TvF45JqD4nHXuPNNsnV9Zi8en6abojRTqnrygLTtddjpxOz3AFXlkh74EU0Tqs5Zzvbhv9dZ_-_qkfqaugseidbhk-8jVf9AaXVs0dMPgZ5aWtTToXGhnEoZQ26PE97N08PUTHfav6xMYv6vK4hL1tXw8AUQzJdakSy33L9YzoodMd5itrGuMd-VjcM4Ku7Ns-GFYSNmUxs",
  fiberOptics: "https://lh3.googleusercontent.com/aida-public/AB6AXuAcnld9iBLl0S8reTJX5louhz4k-DYXOWztlJj5HlqpjRHnqUL23nSMf8Is9Oxe1HXNhIPR5Li6ZgCGcdfN1FwmzhJp6cO0yjC_-ApU77735bDdjw2OA6IfeiQ3iI-XguZ0RwsK6uuTpngp5Cv-PW6V9PAq4l7IefIGib5Hr-2SYo0dbfsu5J8bJOJ47vC7T1fjMWKMbXkTJZrRdpPLYGIWWHkXyfOAYgCz6p-Qj8qW-KSBZdNHQAZrAk8tgmGJx5EX_nP6IMD8U6o",
  workstation: "https://lh3.googleusercontent.com/aida-public/AB6AXuDjYX4aPVpeKG5w_ZMQvhCJvEqu_U9hq9gOTXSP8Zwu3O052rlsQ0Y8VFcdeoia2knGN0PY-CJPxiib0xoMJcSEwF9OFXFrIzcIALgKS8on58QYziQpElKFZrJeJviXf45D-uHfhKGkaE52tkIWgA9etW3wqhcoFZWpQT9wijcVDywygn7q6JysR0G-mFhRCio2xVXCp9qgrUaJud4yIPIdDxKounVCMKn9sfmB8d4nwVQpGaG7ry-M8zkvqus4MWY3LiKFmgSNnTo",
  competitor1: "https://lh3.googleusercontent.com/aida-public/AB6AXuAZYkuypWYDHW7kNxmxVuoxJFqoocuHYLV2WtSCRP6eety0NZI34p-2bdOOWdSkvebsYVL8x86jvOXLJK6auzKwZxv0-awg9gzsUQzyKfYOcTS7ras0kauevnZO1hl-ty4Dt59sX3dtXqvZgVlaTpChwgzBBYxH_zecByVjBeO6j_51IFR9NQPr2oVjDdXKJ0Y6l_dmdwDxrSb5xRpxK__UJJ0y23SQcuGi7HUf7Hcdc_w1zvKr7cteTPCoCo2Nwb_p9acptj1W45k",
  competitor2: "https://lh3.googleusercontent.com/aida-public/AB6AXuAv36H8hZp44pZZnsGfeRk3TyaAIifClVFzdVvYaAS4wSfSABGeI6uLh--NkLec9PMHado-o6_Jz8URwwlB2QnoBTx2GH5Ek7CIWpoUT_4JIWms08wi9ZarMSzP05JuIZsJkjYmtEWJYu-rvMZLzaJfw7hRpucYs3I2yXPQHQ256Uj_eGGZGDS08PbpzR63jLw7AOQQoxLcENjYRtGO1ANpjCnuWgqldeBlpi7FrNHOoSD65a4a3oim4DgjF67ubdvBSb5lwNFzt34",
  competitor3: "https://lh3.googleusercontent.com/aida-public/AB6AXuDP5eJUUBbaL6uZ7FCK2KUjs0cJPqZz5cifnrAQyrwqa8VkSLW71dHJDfY2CwLh6_lSeX0OjK8YN9f7vKWdMlPb9fTt1vlWjVWLQNfp0GU-c5zRgN8Bq_7_RBcEWVsWnRU5wAwxR92MXo5f1M1w_6Om-8wGje_4k0Utegl-7N430MlOSZyBU6pop7Ep3al1fVE7MtqdPQlwMROGM-gZwB03cPaeQgdXxejj4G4FEBJgBKN1X25Q4k8FxBS8foEbiME27YuAtJB84Tw",
  competitor4: "https://lh3.googleusercontent.com/aida-public/AB6AXuCdRKpNkByvhNulIlRlSv2BXKkJkbStvnEAci-gLT7z3PB7CYJOZ92js7rEbb5cdF3GOPmLmsJcLme8MJHK_Pjob-nF0CBUEzG9kVD-fhcehWWG2uTu6skRx81PDL1bP6Ft3puZY9JkokvWqgGI-2EUb_5OIJxKWdnVuzq6vZZxmDf5vJj8uY5QS-jOj3Y_y-TtEOapnshMZXy3e1IRNaG3TJLQyCSPGCIM67dRSJuRnEqD214D-S_d97RW631DQQ96w_wsmLRfRD0",
  fragrance: "https://lh3.googleusercontent.com/aida-public/AB6AXuDu_8ltERm-TCJkil7N8jhsKFron4ZmtH8LlL7f4-1Dxoaull7E8x415R38_zdR_mohJA1vBGgPb94ip7KMjZV9ODIoB9z1MxFQ2ItlAppGu02Umz4wsMpuXmNhmXn8-S-LWopx_DXh9p5YNgekGHHNrlGSVuZgQzKBTj9jxW_rQ2N0BJT4ZUYFEdd73wTNVPh10G5Gg_v9i5JRjTT8dvOJ75PdvwrQCqHKyRwK5n99zJMjhZ2JOb3hSlQjVpLSnciz3iXA4zcXPc8",
  archConcept: "https://lh3.googleusercontent.com/aida-public/AB6AXuDnZemV4Vgn1NqSmlhB4Z4BquF7TYodee419mexEqgG6-QXOUhu8TJ55fxIwDuUx-PJfrvMptIlfF733Y24bsDWbxkxI5Czp8KyEn9Z_o6FsuNavMixKvTUBxiLtBxNQ7QszgNNGEyAW5nlpXwzl3CtP2minlLArWoGsAXD97RZ9YBQyfTpGtNMB_2v59M4ncvY_80etDEYANtHYmO4WZzCqN7rTfSRS2qcTzZ21JgVjyYH1C6_Le4Jpqbf5ZLcvzLUBxr6CkG-pto",
  abstractFlow: "https://lh3.googleusercontent.com/aida-public/AB6AXuDP7yWE34xL_6NP_DUZh5nrlHre1k6Ag3Ea2_XxH12WePtqWg1TznRfky4AIhx8wjZjFSyCRUsRgNjmFD3nTbFGCko0kNnXKlmc6CxCV8EJlX-BlJmVUG2lLx9taGRrJE17B_dZZzG0I1sKFq7Odf6f24cyPWbTbahr9bvGho1PA9jQXka13H7xPUU3ZwgUFqtllcoQ77dP9F_JaRQY6wrPG92gJzfPBTzsRrzv_uhhcVc5nOQkDvwDrb0MBBjGR0TvQRGTYl0n9uk",
  blogCover: "https://lh3.googleusercontent.com/aida-public/AB6AXuDjYX4aPVpeKG5w_ZMQvhCJvEqu_U9hq9gOTXSP8Zwu3O052rlsQ0Y8VFcdeoia2knGN0PY-CJPxiib0xoMJcSEwF9OFXFrIzcIALgKS8on58QYziQpElKFZrJeJviXf45D-uHfhKGkaE52tkIWgA9etW3wqhcoFZWpQT9wijcVDywygn7q6JysR0G-mFhRCio2xVXCp9qgrUaJud4yIPIdDxKounVCMKn9sfmB8d4nwVQpGaG7ry-M8zkvqus4MWY3LiKFmgSNnTo",
};

export const INITIAL_UNLISTED_SCRIPTS: UnlistedPlatformScript[] = [
  {
    id: "script-custom-1",
    name: "Bluesky Social Connector",
    loginUrl: "https://bsky.app/login",
    selectors: {
      usernameField: 'input[data-testid="loginUsernameInput"]',
      passwordField: 'input[data-testid="loginPasswordInput"]',
      submitButton: 'button[data-testid="loginSubmitButton"]',
      publishContainer: 'div[aria-label="Composer"]',
      postInput: 'div[contenteditable="true"]',
      postButton: 'button[data-testid="composerPublishBtn"]'
    },
    actionsPermitted: ['publish', 'comment', 'read_dms'],
    isCommunityShared: true,
    version: "1.2.0"
  },
  {
    id: "script-custom-2",
    name: "Mastodon instance Connector",
    loginUrl: "https://mastodon.social/auth/sign_in",
    selectors: {
      usernameField: '#user_email',
      passwordField: '#user_password',
      submitButton: 'button[type="submit"]',
      postInput: 'textarea.autosuggest-textarea__textarea',
      postButton: 'button.privacy-dropdown__value'
    },
    actionsPermitted: ['publish', 'comment'],
    isCommunityShared: true,
    version: "1.0.4"
  }
];

export const INITIAL_CONNECTED_ACCOUNTS: ConnectedAccount[] = [
  {
    id: "acc-1",
    platform: "instagram",
    handle: "@palius_executive",
    name: "Palius Global Executive",
    avatar: IMAGES.userHeadshot,
    status: "CONNECTED",
    authLevel: "level-2", // OAuth 2.0
    followers: "124.5k",
    metricLabel: "Engagement Rate",
    metricValue: "4.2%",
    growth: "+18.4%",
    isPositive: true,
    disclaimerAccepted: true
  },
  {
    id: "acc-2",
    platform: "tiktok",
    handle: "palius_os_official",
    name: "Palius OS Official",
    avatar: IMAGES.userHeadshot,
    status: "CONNECTED",
    authLevel: "level-3", // Embedded Browser Session
    followers: "2.1M",
    metricLabel: "Weekly Views",
    metricValue: "8.4M",
    growth: "+34.1%",
    isPositive: true,
    disclaimerAccepted: true
  },
  {
    id: "acc-3",
    platform: "linkedin",
    handle: "palius-global-systems",
    name: "Palius Global Systems",
    avatar: IMAGES.userHeadshot,
    status: "CONNECTED",
    authLevel: "level-1", // Official API
    followers: "89.4k",
    metricLabel: "Impressions (30d)",
    metricValue: "1.8M",
    growth: "+6.8%",
    isPositive: true,
    disclaimerAccepted: true
  },
  {
    id: "acc-4",
    platform: "x",
    handle: "@palius_ai_sys",
    name: "Palius AI Systems",
    avatar: IMAGES.userHeadshot,
    status: "CONNECTED",
    authLevel: "level-2",
    followers: "89.2k",
    metricLabel: "Monthly Impressions",
    metricValue: "1.2M",
    growth: "+11.8%",
    isPositive: true,
    disclaimerAccepted: true
  },
  {
    id: "acc-5",
    platform: "reddit",
    handle: "u/Palius_AI_OS",
    name: "Palius Official Reddit",
    avatar: IMAGES.userHeadshot,
    status: "CONNECTED",
    authLevel: "level-3",
    followers: "34.1k",
    metricLabel: "Karma Growth",
    metricValue: "+14.2k",
    growth: "+22.9%",
    isPositive: true,
    disclaimerAccepted: true
  },
  {
    id: "acc-6",
    platform: "Bluesky Social",
    handle: "@palius.bsky.social",
    name: "Palius Bluesky Custom",
    avatar: IMAGES.userHeadshot,
    status: "CONNECTED",
    authLevel: "level-3",
    followers: "12.8k",
    metricLabel: "Repost Velocity",
    metricValue: "420/day",
    growth: "+45.0%",
    isPositive: true,
    isCustomUnlisted: true,
    customScript: INITIAL_UNLISTED_SCRIPTS[0],
    disclaimerAccepted: true
  }
];

export const INITIAL_CALENDAR_POSTS: CalendarPost[] = [
  {
    id: "post-1",
    title: "Quarterly Earnings Analysis Video",
    platform: "linkedin",
    date: "16",
    time: "10:00 AM",
    status: "SCHEDULED",
    thumbnail: IMAGES.serverRoom,
    author: "Alex Morgan",
    avatar: IMAGES.userHeadshot,
    type: "video",
    optimizationScore: 88,
    caption: "Analyzing our Q3 momentum and enterprise AI infrastructure scale. The shift towards agentic workflows is accelerating 3x faster than projected.",
    suggestedHooks: [
      "Why 80% of Fortune 500s are silently rebuilding their backend AI...",
      "The exact blueprint behind our $12.8M reach surge this quarter.",
      "Stop chasing vanity metrics: Here is the real ROI of AI automation."
    ],
    hashtags: ["#ExecutiveProductivity", "#AIGovernance", "#FutureOfWork", "#Web3Leadership"],
    critiqueText: "Strong visual framing. Audio clarity at high frequency can be boosted +2dB. Pacing is optimal for C-Suite conversion.",
    duration: "00:45",
    abVariants: [
      { hook: "Why 80% of Fortune 500s are silently rebuilding their backend AI...", caption: "Analyzing Q3 momentum...", estimatedCtrBoost: "+18.4%" },
      { hook: "Stop wasting GPU compute: The executive guide to AI optimization.", caption: "Here is what we discovered in Q3...", estimatedCtrBoost: "+12.1%" }
    ]
  },
  {
    id: "post-2",
    title: "Monday Executive Mindset",
    platform: "x",
    date: "16",
    time: "08:30 AM",
    status: "AI DRAFT",
    author: "Palius AI",
    avatar: IMAGES.userHeadshot,
    type: "text",
    optimizationScore: 82,
    caption: "Great leaders don't just adapt to technology; they architect the future with purpose.",
    suggestedHooks: ["The mindset shift separating 1x executives from 10x founders..."],
    hashtags: ["#Leadership", "#ExecutiveMindset"]
  },
  {
    id: "post-3",
    title: "Optimizing Workflow with AI Automations",
    platform: "instagram",
    date: "18",
    time: "02:00 PM",
    status: "OPTIMIZING",
    thumbnail: IMAGES.workstation,
    author: "Alex Morgan",
    avatar: IMAGES.userHeadshot,
    type: "carousel",
    optimizationScore: 94,
    caption: "5 AI Automations every tech founder needs in 2024 to save 15+ hours weekly.",
    suggestedHooks: ["How we cut operational overhead by 40% with 3 simple scripts."],
    hashtags: ["#AIAutomations", "#ProductivityHack", "#ExecutiveOS"]
  },
  {
    id: "post-4",
    title: "Web3 Future & Decentralized Compute Reel",
    platform: "tiktok",
    date: "20",
    time: "05:15 PM",
    status: "SCHEDULED",
    thumbnail: IMAGES.fiberOptics,
    author: "Alex Morgan",
    avatar: IMAGES.userHeadshot,
    type: "reels",
    optimizationScore: 90,
    caption: "Is decentralized compute ready to challenge cloud giants? Here is what you need to know.",
    duration: "01:12",
    suggestedHooks: ["Why GPUs are becoming the most valuable currency on earth."],
    hashtags: ["#Web3", "#DecentralizedAI", "#TechTrends"]
  },
  {
    id: "post-5",
    title: "Product Launch Keynote Teaser",
    platform: "linkedin",
    date: "24",
    time: "09:00 AM",
    status: "PUBLISHED",
    thumbnail: IMAGES.competitor1,
    author: "Alex Morgan",
    avatar: IMAGES.userHeadshot,
    type: "image",
    optimizationScore: 96,
    caption: "Thrilled to unveil Palius OS 2.0 to the public today. Built for executives who refuse to compromise on precision.",
    suggestedHooks: ["The future of executive AI productivity is live..."],
    hashtags: ["#PaliusOS", "#ProductLaunch", "#AIExecutive"]
  }
];

export const INITIAL_COMPETITOR_METRICS: CompetitorMetric[] = [
  {
    id: "comp-1",
    brand: "Palius OS (You)",
    postsPerDay: 4.2,
    engagementRate: "8.4%",
    growth: "+12.4k",
    isPositive: true,
    isUser: true,
    topFormat: "Reels & Longform AI Analysis",
    assetImage: IMAGES.competitor1,
    popularTopics: ["Agentic Workflows", "AI Governance", "C-Suite Productivity"]
  },
  {
    id: "comp-2",
    brand: "Vertex AI Labs",
    postsPerDay: 3.1,
    engagementRate: "6.1%",
    growth: "+8.1k",
    isPositive: true,
    isUser: false,
    topFormat: "3D Data Motion Graphics",
    assetImage: IMAGES.competitor2,
    popularTopics: ["GPU Clusters", "Neural Rendering", "Enterprise AI"]
  },
  {
    id: "comp-3",
    brand: "Sintara Labs",
    postsPerDay: 1.8,
    engagementRate: "4.9%",
    growth: "+3.2k",
    isPositive: true,
    isUser: false,
    topFormat: "Executive Interviews",
    assetImage: IMAGES.competitor3,
    popularTopics: ["Founder Mindset", "SaaS Scale", "Web3 Compute"]
  },
  {
    id: "comp-4",
    brand: "NexGen Media",
    postsPerDay: 5.8,
    engagementRate: "3.2%",
    growth: "-1.1k",
    isPositive: false,
    isUser: false,
    topFormat: "Short-form news reaction",
    assetImage: IMAGES.competitor4,
    popularTopics: ["Tech Headlines", "AI Drama", "Crypto Recaps"]
  }
];

export const INITIAL_DIRECT_MESSAGES: DirectMessageLead[] = [
  {
    id: "dm-1",
    name: "Sarah Jenkins",
    handle: "@s_jenkins_vc",
    avatar: IMAGES.sarahLead,
    platform: "linkedin",
    message: "Hey Alex! Loved your post on agentic workflow infrastructure. We're looking to invest in Q1. Let's schedule 15m?",
    time: "4m ago",
    aiSuggestedReply: "Hi Sarah! Thanks for reaching out. I'd be happy to discuss our Q1 expansion roadmap. Here is my Calendly link: https://calendly.com/palius-executive/15min",
    purchaseIntentScore: 95,
    status: "NEW"
  },
  {
    id: "dm-2",
    name: "Marcus Vance",
    handle: "@marcus_vance_tech",
    avatar: IMAGES.userHeadshot,
    platform: "x",
    message: "Would love to feature Palius OS in our upcoming AI Executive Podcast next Tuesday!",
    time: "1h ago",
    aiSuggestedReply: "Hey Marcus! Thanks for the invite. Sounds fantastic. Sending my team's contact to coordinate topics.",
    purchaseIntentScore: 78,
    status: "NEW"
  },
  {
    id: "dm-3",
    name: "Elena Rostova",
    handle: "@elena_ai_ventures",
    avatar: IMAGES.sarahLead,
    platform: "instagram",
    message: "Your latest reel hit 500k views! What tool did you use for the real-time audio sync?",
    time: "3h ago",
    aiSuggestedReply: "Thanks Elena! We built Palius OS Studio Alpha with real-time audio & Gemini 3.6 Flash. Happy to share a demo link!",
    purchaseIntentScore: 84,
    status: "NEW"
  },
  {
    id: "dm-4",
    name: "Kai Tanaka",
    handle: "@kaibuilds",
    avatar: IMAGES.userHeadshot,
    platform: "tiktok",
    message: "yo is there a student plan? been watching your build series all week 👀",
    time: "5h ago",
    aiSuggestedReply: "Hey Kai! Yes — 50% off with a student email. Here's the link, and thanks for following the build series!",
    purchaseIntentScore: 61,
    status: "NEW"
  },
  {
    id: "dm-5",
    name: "Priya Raman",
    handle: "+44 7700 900312",
    avatar: IMAGES.sarahLead,
    platform: "whatsapp",
    message: "Hi, we're an agency with 12 clients. Do you offer team seats and invoicing in GBP?",
    time: "6h ago",
    aiSuggestedReply: "Hi Priya! Yes — team seats start at 5 users with GBP invoicing available. Shall I send the agency pricing sheet?",
    purchaseIntentScore: 88,
    status: "NEW"
  },
  {
    id: "dm-6",
    name: "Tomas Weber",
    handle: "@tweber_dev",
    avatar: IMAGES.userHeadshot,
    platform: "telegram",
    message: "Does the self-hosted version support custom connector scripts?",
    time: "yesterday",
    aiSuggestedReply: "It does — connector scripts are JSON selector maps you can upload in-app, no redeploy needed. Docs link below.",
    purchaseIntentScore: 54,
    status: "NEW"
  }
];

export const INITIAL_COMMENTS: CommentItem[] = [
  {
    id: "comm-1",
    platform: "instagram",
    author: "david_tech_lead",
    avatar: IMAGES.userHeadshot,
    text: "How much does the enterprise tier cost per seat monthly?",
    time: "12m ago",
    category: "Sales Inquiry",
    aiSuggestedReply: "Hi David! Enterprise seats start at $149/mo with unlimited AI workflow automations. DM us for a custom corporate trial!",
    status: "PENDING",
    postTitle: "Optimizing Workflow with AI Automations"
  },
  {
    id: "comm-2",
    platform: "linkedin",
    author: "amanda_growth",
    avatar: IMAGES.sarahLead,
    text: "This breakdown on agentic workflows is brilliant! Saving this post.",
    time: "45m ago",
    category: "Praise",
    aiSuggestedReply: "Appreciate it Amanda! Glad the insights resonated with your team.",
    status: "PENDING",
    postTitle: "Quarterly Earnings Analysis Video"
  },
  {
    id: "comm-3",
    platform: "tiktok",
    author: "crypto_fan_99",
    avatar: IMAGES.userHeadshot,
    text: "Follow back for instant 10k followers click link in bio!!",
    time: "1h ago",
    category: "Spam",
    aiSuggestedReply: "[Flagged as Spam - Auto Hidden]",
    status: "IGNORED",
    postTitle: "Web3 Future & Decentralized Compute Reel"
  }
];

export const INITIAL_KNOWLEDGE_BASE: KnowledgeBaseRule[] = [
  {
    id: "kb-1",
    category: "Pricing & Enterprise",
    keywords: ["price", "pricing", "cost", "subscription", "enterprise", "discount"],
    responseTemplate: "Our plans range from Pro ($49/mo) to Enterprise ($149/mo). Free 14-day trial available with full AI features.",
    autoReplyEnabled: true
  },
  {
    id: "kb-2",
    category: "Support & SLA",
    keywords: ["refund", "billing", "support", "help", "bug", "broken"],
    responseTemplate: "Our executive support team monitors 24/7. Please send your account ID to support@palius-os.ai for priority escalation.",
    autoReplyEnabled: true
  },
  {
    id: "kb-3",
    category: "Product Capabilities",
    keywords: ["playwright", "unlisted", "custom platform", "api", "integration"],
    responseTemplate: "Palius OS uses embedded Playwright automation and custom JSON scripts to connect to any web interface without code deploys.",
    autoReplyEnabled: true
  }
];

export const INITIAL_CHAT_MESSAGES: ChatMessage[] = [
  {
    id: "msg-1",
    sender: "ai",
    text: "Welcome back, Alex. I have generated your weekly cross-platform content strategy. Total projected reach boost: **+24.8%** across LinkedIn & TikTok.",
    timestamp: "10:14 AM",
    cardData: {
      title: "Optimized Content Plan Ready",
      description: "4 High-Impact Reels, 2 Executive Carousels, 1 Keynote Analysis.",
      actions: [
        { label: "Review Plan", actionId: "review-plan" },
        { label: "Show me the data", actionId: "show-data" },
        { label: "Generate carousels", actionId: "generate-carousels" }
      ]
    }
  },
  {
    id: "msg-2",
    sender: "user",
    text: "Why did the reach drop specifically on the 'AI Ethics' post?",
    timestamp: "10:16 AM"
  },
  {
    id: "msg-3",
    sender: "ai",
    text: "Analysis complete for 'AI Ethics':\n1. **Hook Duration:** Viewers dropped off within the first 1.8 seconds due to a low-contrast opening frame.\n2. **Platform Shift:** LinkedIn suppressed posts containing external links in the first comment block by 14%.\n3. **Recommendation:** Apply our High-Contrast AI Opening Hook + move external links to bio.",
    timestamp: "10:16 AM"
  }
];

export const INITIAL_ARTIFACTS: StudioArtifact[] = [
  {
    id: "art-1",
    title: "Fragrance_V1.png",
    type: "image",
    url: IMAGES.fragrance,
    timestamp: "12m ago",
    tags: ["Product Concept", "Lux Dark"]
  },
  {
    id: "art-2",
    title: "Arch_Concept.png",
    type: "image",
    url: IMAGES.archConcept,
    timestamp: "45m ago",
    tags: ["Architecture", "Glass & Metal"]
  },
  {
    id: "art-3",
    title: "Abstract_Flow.png",
    type: "concept",
    url: IMAGES.abstractFlow,
    timestamp: "2h ago",
    tags: ["Data Visualization", "3D Motion"]
  }
];
