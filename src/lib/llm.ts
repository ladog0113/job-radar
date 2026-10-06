"use client";

// 브라우저에서 Anthropic API를 직접 호출한다. API 키는 이 브라우저의 localStorage에만 저장된다.

export type Settings = { apiKey: string; model: string };

const SETTINGS_KEY = "jr_settings";

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { apiKey: "", model: "", ...JSON.parse(raw) };
  } catch {}
  return { apiKey: "", model: "" };
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {}
}

export function loadLocal<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

const API = "https://api.anthropic.com/v1";

function headers(apiKey: string) {
  return {
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true",
    "content-type": "application/json",
  };
}

export async function listModels(apiKey: string): Promise<{ id: string; display_name?: string }[]> {
  const r = await fetch(`${API}/models?limit=100`, { headers: headers(apiKey) });
  if (!r.ok) throw new Error(await errorText(r));
  const j = await r.json();
  return j.data ?? [];
}

async function errorText(r: Response) {
  try {
    const j = await r.json();
    return `${r.status} ${j?.error?.message ?? ""}`.trim();
  } catch {
    return `${r.status}`;
  }
}

type Content = string | Record<string, unknown>[];

async function post(settings: Settings, body: Record<string, unknown>) {
  if (!settings.apiKey) throw new Error("설정에서 API 키를 먼저 입력하세요");
  if (!settings.model) throw new Error("설정에서 모델을 먼저 선택하세요");
  const r = await fetch(`${API}/messages`, {
    method: "POST",
    headers: headers(settings.apiKey),
    body: JSON.stringify({ model: settings.model, ...body }),
  });
  if (!r.ok) throw new Error(await errorText(r));
  return r.json();
}

/** 정해진 JSON 스키마로 답을 받는다 (tool use 강제) */
export async function callTool<T>(
  settings: Settings,
  opts: { system: string; content: Content; name: string; schema: Record<string, unknown>; maxTokens?: number },
): Promise<T> {
  const j = await post(settings, {
    max_tokens: opts.maxTokens ?? 8000,
    system: opts.system,
    tools: [{ name: opts.name, description: "결과를 이 형식으로 제출", input_schema: opts.schema }],
    tool_choice: { type: "tool", name: opts.name },
    messages: [{ role: "user", content: opts.content }],
  });
  const block = (j.content ?? []).find((b: { type: string }) => b.type === "tool_use");
  if (!block) throw new Error("응답 형식 오류: 다시 시도하세요");
  if (j.stop_reason === "max_tokens") throw new Error("응답이 길어 잘렸습니다. 경력기술서를 줄이거나 다시 시도하세요");
  return block.input as T;
}

/** 일반 텍스트 응답 */
export async function callText(settings: Settings, opts: { system: string; content: Content; maxTokens?: number }) {
  const j = await post(settings, {
    max_tokens: opts.maxTokens ?? 8000,
    system: opts.system,
    messages: [{ role: "user", content: opts.content }],
  });
  return (j.content ?? [])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("\n");
}
