"use client";

import { useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CATEGORIES,
  SOURCE_LABELS,
  daysAgoKST,
  todayKST,
  useJson,
  type Job,
  type Run,
} from "@/lib/data";

const PERIODS: Record<string, number | null> = {
  today: 0,
  "7d": 7,
  "30d": 30,
  all: null,
};

const PAGE = 50;

export default function JobsPage() {
  const { data: jobs, loading, error } = useJson<Job[]>("jobs.json", []);
  const { data: runs } = useJson<Run[]>("runs.json", []);

  const [q, setQ] = useState("");
  const [period, setPeriod] = useState("7d");
  const [category, setCategory] = useState("all");
  const [source, setSource] = useState("all");
  const [showStale, setShowStale] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  const today = todayKST();
  const week = daysAgoKST(7);

  const stats = useMemo(() => {
    const active = jobs.filter((j) => !j.stale);
    return {
      today: jobs.filter((j) => j.first_seen === today).length,
      week: jobs.filter((j) => j.first_seen >= week).length,
      active: active.length,
    };
  }, [jobs, today, week]);

  const lastRun = runs.length ? runs[runs.length - 1] : null;

  const filtered = useMemo(() => {
    const days = PERIODS[period];
    const since = days === null ? "" : daysAgoKST(days);
    const needle = q.trim().toLowerCase();
    return jobs
      .filter((j) => showStale || !j.stale)
      .filter((j) => !since || j.first_seen >= since)
      .filter((j) => category === "all" || j.category === category)
      .filter((j) => source === "all" || j.source === source)
      .filter(
        (j) =>
          !needle ||
          j.title.toLowerCase().includes(needle) ||
          j.company.toLowerCase().includes(needle),
      )
      .sort((a, b) =>
        a.first_seen === b.first_seen ? b.score - a.score : a.first_seen < b.first_seen ? 1 : -1,
      );
  }, [jobs, q, period, category, source, showStale]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard title="오늘 신규" value={stats.today} />
        <StatCard title="최근 7일 신규" value={stats.week} />
        <StatCard title={`활성 공고`} value={stats.active} />
        <StatCard
          title="마지막 수집"
          value={lastRun ? lastRun.started_at.slice(5, 16).replace("T", " ") : "-"}
        />
      </div>

      <Card>
        <CardHeader className="gap-4 space-y-0 md:flex-row md:flex-wrap md:items-end">
          <div className="flex-1 md:min-w-[220px]">
            <Input
              placeholder="제목, 회사명 검색"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setLimit(PAGE);
              }}
            />
          </div>
          <FilterSelect
            value={period}
            onChange={(v) => {
              setPeriod(v);
              setLimit(PAGE);
            }}
            options={[
              ["today", "오늘 수집"],
              ["7d", "최근 7일"],
              ["30d", "최근 30일"],
              ["all", "전체 기간"],
            ]}
          />
          <FilterSelect
            value={category}
            onChange={(v) => {
              setCategory(v);
              setLimit(PAGE);
            }}
            options={[["all", "전체 분류"], ...CATEGORIES.map((c) => [c, c] as [string, string])]}
          />
          <FilterSelect
            value={source}
            onChange={(v) => {
              setSource(v);
              setLimit(PAGE);
            }}
            options={[
              ["all", "전체 사이트"],
              ...Object.entries(SOURCE_LABELS).map(([k, v]) => [k, v] as [string, string]),
            ]}
          />
          <div className="flex items-center gap-2">
            <Switch id="stale" checked={showStale} onCheckedChange={setShowStale} />
            <Label htmlFor="stale" className="text-sm text-muted-foreground">
              마감 추정 포함
            </Label>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-2 text-sm text-muted-foreground">{filtered.length}건</div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">수집일</TableHead>
                  <TableHead className="w-[140px]">분류</TableHead>
                  <TableHead className="min-w-[240px]">공고</TableHead>
                  <TableHead className="w-[90px]">사이트</TableHead>
                  <TableHead className="w-[140px]">경력 / 지역</TableHead>
                  <TableHead className="w-[110px]">마감</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      불러오는 중
                    </TableCell>
                  </TableRow>
                ) : error ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-destructive">
                      데이터를 불러오지 못했습니다 ({error})
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      조건에 맞는 공고가 없습니다
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.slice(0, limit).map((j) => (
                    <TableRow key={j.id} className={j.stale ? "opacity-50" : undefined}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {j.first_seen.slice(5)}
                        {j.first_seen === today && (
                          <Badge className="ml-2 px-1.5 py-0 text-[10px]">NEW</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="whitespace-nowrap">
                          {j.category}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <a
                          href={j.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group inline-flex items-start gap-1 font-medium hover:underline"
                        >
                          {j.title}
                          <ExternalLink className="mt-1 size-3 shrink-0 opacity-0 group-hover:opacity-60" />
                        </a>
                        <div className="text-sm text-muted-foreground">{j.company}</div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {SOURCE_LABELS[j.source] ?? j.source}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {[j.career, j.location].filter(Boolean).join(" / ")}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {j.stale ? "마감 추정" : j.deadline}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {filtered.length > limit && (
            <div className="mt-4 flex justify-center">
              <Button variant="outline" onClick={() => setLimit(limit + PAGE)}>
                {Math.min(PAGE, filtered.length - limit)}건 더 보기
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: number | string }) {
  return (
    <Card className="min-w-0">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="truncate text-lg font-semibold md:text-2xl">{value}</div>
      </CardContent>
    </Card>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="md:w-[150px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(([v, label]) => (
          <SelectItem key={v} value={v}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
