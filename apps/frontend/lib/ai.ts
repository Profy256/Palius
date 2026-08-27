// Provider-agnostic server-side AI caller. The frontend sends the user's own
// provider + key + model with each request, so the desktop app needs no shared
// backend credential. Supports Gemini, OpenRouter, OpenAI, Anthropic, and any
// OpenAI-compatible endpoint.

import { getProvider, type ProviderId } from './providers';

export interface AIRequest {
  provider: ProviderId | string;
  apiKey: string;
  model?: string;
  baseUrl?: string; // for openai-compatible
  prompt: string;
  system?: string;
}

export interface AIResult {
  text: string;
}

export async function callAI(req: AIRequest): Promise<AIResult> {
  const provider = getProvider(req.provider);
  if (!provider) throw new Error(`Unknown provider: ${req.provider}`);
  if (!req.apiKey) throw new Error('No API key provided for the selected provider.');

  let model = req.model || provider.defaultModel;
  if (!model) throw new Error('A model name is required for this provider.');

  // OpenRouter's auto-router is `openrouter/auto`. Users reasonably just type
  // "auto", which OpenRouter rejects as an unknown model — accept both.
  if (req.provider === 'openrouter' && model.trim().toLowerCase() === 'auto') {
    model = 'openrouter/auto';
  }

  switch (req.provider) {
    case 'gemini':
      return callGemini(provider.baseUrl, model, req.apiKey, req.prompt, req.system);
    case 'anthropic':
      return callAnthropic(provider.baseUrl, model, req.apiKey, req.prompt, req.system);
    default: {
      const base =
        req.provider === 'openai-compatible'
          ? req.baseUrl || provider.baseUrl
          : provider.baseUrl;
      if (!base) throw new Error('A base URL is required for a custom OpenAI-compatible provider.');
      // OpenRouter uses these for app attribution on its dashboard; other
      // OpenAI-compatible endpoints ignore unknown headers.
      const extraHeaders =
        req.provider === 'openrouter'
          ? { 'HTTP-Referer': 'https://palius.app', 'X-Title': 'Palius Social Media OS' }
          : undefined;
      return callOpenAI(base, model, req.apiKey, req.prompt, req.system, extraHeaders);
    }
  }
}

async function callGemini(
  baseUrl: string,
  model: string,
  apiKey: string,
  prompt: string,
  system?: string,
): Promise<AIResult> {
  const url = `${baseUrl}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body: any = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.8 },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Gemini error ${res.status}: ${detail}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? '';
  if (!text) throw new Error('Gemini returned an empty response.');
  return { text };
}

async function callOpenAI(
  baseUrl: string,
  model: string,
  apiKey: string,
  prompt: string,
  system?: string,
  extraHeaders?: Record<string, string>,
): Promise<AIResult> {
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  const messages: any[] = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...extraHeaders,
    },
    body: JSON.stringify({ model, messages, temperature: 0.8 }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Provider error ${res.status}: ${detail}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? '';
  if (!text) throw new Error('The provider returned an empty response.');
  return { text };
}

async function callAnthropic(
  baseUrl: string,
  model: string,
  apiKey: string,
  prompt: string,
  system?: string,
): Promise<AIResult> {
  const url = `${baseUrl.replace(/\/$/, '')}/messages`;
  const body: any = {
    model,
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  };
  if (system) body.system = system;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Anthropic error ${res.status}: ${detail}`);
  }
  const data = await res.json();
  const text = (data?.content ?? []).map((c: any) => c.text ?? '').join('');
  if (!text) throw new Error('Anthropic returned an empty response.');
  return { text };
}
