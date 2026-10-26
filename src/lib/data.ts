"use client";

import { useEffect, useState } from "react";

export type Job = {
  id: string;
  source: string;
  title: string;
  company: string;
  location: string;
  career: string;
  deadline: string;
  url: string;
  category: string;
  score: number;
  queries: string[];
  first_seen: string;
  last_seen: string;
  stale?: boolean;
  has_detail?: boolean;
  career_min?: number | null;
  career_max?: number | null;
  career_any?: boolean;
  company_key?: string;
};

export type Detail = { id: string; text: string; fetched_at: string };

export type SourceRun = {
  source: string;
  label: string;
  fetched: number;
  matched: number;
  new: number;
  error: string | null;
};

export type Run = {
  started_at: string;
  finished_at?: string;
  sources: SourceRun[];
};

export const SOURCE_LABELS: Record<string, string> = {
  wanted: "원티드",
  saramin: "사람인",
  jobkorea: "잡코리아",
  jobplanet: "잡플래닛",
  jasoseol: "자소설닷컴",
  remember: "리멤버",
  catch: "캐치",
  linkedin: "링크드인",
};

export const CATEGORIES = ["AI 인프라/MLOps", "LLMOps/에이전트", "AI 서비스 기획"];

const base = process.env.NEXT_PUBLIC_BASE_PATH || "";

export function useJson<T>(file: string, fallback: T) {
  const [data, setData] = useState<T>(fallback);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${base}/data/${file}`, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then((d) => setData(d))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [file]);

  return { data, loading, error };
}

export function todayKST() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export function daysAgoKST(n: number) {
  return new Date(Date.now() + 9 * 3600 * 1000 - n * 86400 * 1000).toISOString().slice(0, 10);
}

export function safeName(id: string) {
  return id.replace(/[^A-Za-z0-9_-]/g, "_");
}

export function jobHref(id: string) {
  return `/job/?id=${encodeURIComponent(id)}`;
}

// ---- 내 경력과 공고 요구 연차 비교 ----

export const DEFAULT_CAREER_START = "2022-07-25";
const PROFILE_KEY = "jr_profile";

export function loadCareerStart(): string {
  try {
    const p = JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}");
    if (typeof p.careerStart === "string" && p.careerStart) return p.careerStart;
  } catch {}
  return DEFAULT_CAREER_START;
}

export function saveCareerStart(date: string) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ careerStart: date }));
  } catch {}
}

/** 시작일부터 오늘까지 경력 (년, 소수) */
export function careerYears(start: string, today = new Date()) {
  const s = new Date(start + "T00:00:00");
  return (today.getTime() - s.getTime()) / (365.25 * 86400 * 1000);
}

export function careerLabel(start: string, today = new Date()) {
  const s = new Date(start + "T00:00:00");
  let months = (today.getFullYear() - s.getFullYear()) * 12 + (today.getMonth() - s.getMonth());
  if (today.getDate() < s.getDate()) months -= 1;
  return `${Math.floor(months / 12)}년 ${months % 12}개월`;
}

export type FitKey = "fit" | "stretch" | "hard" | "over" | "under" | "unknown";

export const FIT_LABEL: Record<FitKey, string> = {
  fit: "적합",
  stretch: "상향",
  hard: "고난도 상향",
  over: "10년 이상",
  under: "하향",
  unknown: "미확인",
};

export const FIT_ORDER: FitKey[] = ["fit", "stretch", "hard", "under", "unknown", "over"];

export function careerFit(job: Pick<Job, "career_min" | "career_max" | "career_any">, years: number): FitKey {
  const min = job.career_min ?? null;
  const max = job.career_max ?? null;
  if (job.career_any) return "fit";
  if (min === null && max === null) return "unknown";
  if (min !== null && min >= 10) return "over";
  if (max !== null && max < years - 1) return "under";
  if (min === null || min <= years) return "fit";
  if (min <= years + 3) return "stretch";
  return "hard";
}

export function requiredText(job: Pick<Job, "career_min" | "career_max" | "career_any">) {
  if (job.career_any) return "경력무관";
  const { career_min: a, career_max: b } = job;
  if (a == null && b == null) return "";
  if (a === 0 && b === 1) return "신입";
  if (a != null && b != null) return `${a}~${b}년`;
  if (a != null) return `${a}년 이상`;
  return `${b}년 이하`;
}

// ---- 잡플래닛 ----

export type JpReview = {
  date: string;
  occupation: string;
  status: string;
  overall: number | null;
  worklife: number | null;
  compensation: number | null;
  culture: number | null;
  advancement: number | null;
  management: number | null;
  recommend: boolean | null;
};

export type Company = {
  fetched_at: string;
  jp_id: number | null;
  jp_name?: string;
  rating?: number | null;
  url?: string;
  review_count?: number | null;
  overall?: number | null;
  scores?: Record<string, number | null>;
  recommend_pct?: number | null;
  ceo_pct?: number | null;
  growth_pct?: number | null;
  reviews?: JpReview[];
};

export function companyRating(c?: Company) {
  if (!c || !c.jp_id) return null;
  return c.overall ?? c.rating ?? null;
}
