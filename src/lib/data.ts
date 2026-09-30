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
};

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
