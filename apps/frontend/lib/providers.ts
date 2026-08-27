// Provider registry shared by the Settings UI and the server-side AI caller.
// Every provider is OpenAI-compatible except Gemini (REST) and Anthropic
// (separate messages API). Users bring their own key — nothing is hardcoded.

export type ProviderId = 'gemini' | 'openrouter' | 'openai' | 'anthropic' | 'openai-compatible';

export interface ProviderDef {
  id: ProviderId;
  label: string;
  /** Where the API key goes. */
  auth: 'query' | 'bearer' | 'x-api-key' | 'openai-compatible-bearer';
  /** Base URL for the chat/completions endpoint. */
  baseUrl: string;
  /** Default model if the user leaves the field blank. */
  defaultModel: string;
  /** Placeholder shown in the model field. */
  modelHint: string;
  /** Docs link so users can grab a key. */
  docsUrl: string;
  /** Whether the model field is free text (true) or a known suggestion. */
  freeformModel: boolean;
}

export const PROVIDERS: ProviderDef[] = [
  {
    id: 'gemini',
    label: 'Google Gemini',
    auth: 'query',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.0-flash',
    modelHint: 'gemini-2.0-flash',
    docsUrl: 'https://aistudio.google.com/apikey',
    freeformModel: false,
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    auth: 'bearer',
    baseUrl: 'https://openrouter.ai/api/v1',
    // `openrouter/auto` is OpenRouter's auto-router: it picks a suitable model
    // per prompt. That makes "paste key, done" the default experience — a
    // specific model is still just a free-text edit away.
    defaultModel: 'openrouter/auto',
    modelHint: 'openrouter/auto',
    docsUrl: 'https://openrouter.ai/keys',
    freeformModel: true,
  },
  {
    id: 'openai',
    label: 'OpenAI',
    auth: 'bearer',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    modelHint: 'gpt-4o-mini',
    docsUrl: 'https://platform.openai.com/api-keys',
    freeformModel: false,
  },
  {
    id: 'anthropic',
    label: 'Anthropic Claude',
    auth: 'x-api-key',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-5-sonnet-latest',
    modelHint: 'claude-3-5-sonnet-latest',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    freeformModel: false,
  },
  {
    id: 'openai-compatible',
    label: 'OpenAI-compatible (custom)',
    auth: 'openai-compatible-bearer',
    baseUrl: '',
    defaultModel: '',
    modelHint: 'your-model-name',
    docsUrl: '',
    freeformModel: true,
  },
];

export function getProvider(id: string): ProviderDef | undefined {
  return PROVIDERS.find((p) => p.id === id);
}
