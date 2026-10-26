"use client";

import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SOURCE_LABELS, useJson, type Job, type Run } from "@/lib/data";

const SITES = Object.keys(SOURCE_LABELS);

export default function SourcesPage() {
  const { data: runs, loading } = useJson<Run[]>("runs.json", []);
  const { data: jobs } = useJson<Job[]>("jobs.json", []);

  const last = runs.length ? runs[runs.length - 1] : null;
  const recent = useMemo(() => [...runs].reverse().slice(0, 14), [runs]);

  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    for (const j of jobs) if (!j.stale) t[j.source] = (t[j.source] ?? 0) + 1;
    return t;
  }, [jobs]);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            마지막 수집 {last ? last.started_at.slice(0, 16).replace("T", " ") : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>사이트</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="text-right">검색 결과</TableHead>
                <TableHead className="text-right">직무 일치</TableHead>
                <TableHead className="text-right">신규</TableHead>
                <TableHead className="text-right">활성 공고</TableHead>
                <TableHead>오류</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {SITES.map((s) => {
                const r = last?.sources.find((x) => x.source === s);
                return (
                  <TableRow key={s}>
                    <TableCell className="font-medium">{SOURCE_LABELS[s]}</TableCell>
                    <TableCell>
                      {!r ? (
                        <Badge variant="outline">{loading ? "" : "기록 없음"}</Badge>
                      ) : r.error ? (
                        <Badge variant="destructive">실패</Badge>
                      ) : (
                        <Badge variant="secondary">정상</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{r?.fetched ?? ""}</TableCell>
                    <TableCell className="text-right">{r?.matched ?? ""}</TableCell>
                    <TableCell className="text-right">{r?.new ?? ""}</TableCell>
                    <TableCell className="text-right">{totals[s] ?? 0}</TableCell>
                    <TableCell className="max-w-[360px] truncate text-sm text-muted-foreground" title={r?.error ?? ""}>
                      {r?.error ?? ""}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {last && (last.details || last.jobplanet) && (
            <div className="mt-4 flex flex-col gap-1 text-sm text-muted-foreground">
              {last.details && (
                <div>
                  공고 본문: 시도 {last.details.tried}건, 저장 {last.details.saved}건
                </div>
              )}
              {last.jobplanet && (
                <div className={last.jobplanet.error ? "text-destructive" : undefined}>
                  잡플래닛 평점: 조회 {last.jobplanet.looked ?? 0}개 회사, 연결 {last.jobplanet.found ?? 0}개, 실패{" "}
                  {last.jobplanet.failed ?? 0}개{last.jobplanet.error ? ` (${last.jobplanet.error})` : ""}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">최근 14회 신규 공고 수</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>실행일</TableHead>
                {SITES.map((s) => (
                  <TableHead key={s} className="text-right">
                    {SOURCE_LABELS[s]}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={SITES.length + 1} className="h-20 text-center text-muted-foreground">
                    {loading ? "불러오는 중" : "실행 기록이 없습니다"}
                  </TableCell>
                </TableRow>
              ) : (
                recent.map((run) => (
                  <TableRow key={run.started_at}>
                    <TableCell className="whitespace-nowrap">{run.started_at.slice(0, 10)}</TableCell>
                    {SITES.map((s) => {
                      const r = run.sources.find((x) => x.source === s);
                      return (
                        <TableCell key={s} className={`text-right ${r?.error ? "text-destructive" : ""}`}>
                          {r ? (r.error ? "실패" : r.new) : ""}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
