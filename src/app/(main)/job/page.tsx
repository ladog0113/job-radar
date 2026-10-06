"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  downloadDocx,
  downloadText,
  fileToText,
  makeChecklist,
  matchRate,
  reviewResume,
  rewriteResume,
  type Checklist,
  type Review,
  type Rewrite,
} from "@/lib/career";
import { SOURCE_LABELS, safeName, useJson, type Detail, type Job } from "@/lib/data";
import { loadLocal, loadSettings, saveLocal, type Settings } from "@/lib/llm";

export default function JobPage() {
  return (
    <Suspense fallback={<div className="text-sm text-muted-foreground">불러오는 중</div>}>
      <JobDetail />
    </Suspense>
  );
}

const base = process.env.NEXT_PUBLIC_BASE_PATH || "";

function JobDetail() {
  const id = useSearchParams().get("id") ?? "";
  const key = safeName(id);
  const { data: jobs, loading } = useJson<Job[]>("jobs.json", []);
  const job = useMemo(() => jobs.find((j) => j.id === id), [jobs, id]);

  const [settings, setSettings] = useState<Settings>({ apiKey: "", model: "" });
  const [crawled, setCrawled] = useState<string | null>(null);
  const [crawledLoaded, setCrawledLoaded] = useState(false);
  const [pasted, setPasted] = useState("");
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [rewrite, setRewrite] = useState<Rewrite | null>(null);
  const [resume, setResume] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("posting");

  useEffect(() => {
    setSettings(loadSettings());
    setResume(loadLocal<string>("jr_resume") ?? "");
    setPasted(loadLocal<string>(`jr_post_${key}`) ?? "");
    setChecklist(loadLocal<Checklist>(`jr_cl_${key}`));
    setReview(loadLocal<Review>(`jr_rv_${key}`));
    setRewrite(loadLocal<Rewrite>(`jr_rw_${key}`));
  }, [key]);

  useEffect(() => {
    if (!id) return;
    fetch(`${base}/data/details/${key}.json`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Detail | null) => setCrawled(d?.text ?? null))
      .catch(() => setCrawled(null))
      .finally(() => setCrawledLoaded(true));
  }, [id, key]);

  const posting = (crawled ?? "").trim() || pasted.trim();
  const ready = Boolean(settings.apiKey && settings.model);

  async function run<T>(label: string, fn: () => Promise<T>) {
    setBusy(label);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function ensureChecklist() {
    if (checklist) return checklist;
    const cl = await makeChecklist(settings, job?.title ?? "", job?.company ?? "", posting);
    setChecklist(cl);
    saveLocal(`jr_cl_${key}`, cl);
    return cl;
  }

  const onChecklist = () =>
    run("checklist", async () => {
      const cl = await makeChecklist(settings, job?.title ?? "", job?.company ?? "", posting);
      setChecklist(cl);
      saveLocal(`jr_cl_${key}`, cl);
      setReview(null); // 체크리스트가 바뀌면 이전 진단은 맞지 않음
      saveLocal(`jr_rv_${key}`, null);
    });

  const onReview = (text = resume) =>
    run("review", async () => {
      const cl = await ensureChecklist();
      const rv = await reviewResume(settings, posting, cl, text);
      setReview(rv);
      saveLocal(`jr_rv_${key}`, rv);
      return rv;
    });

  const onRewrite = () =>
    run("rewrite", async () => {
      const cl = await ensureChecklist();
      let rv = review;
      if (!rv) {
        rv = await reviewResume(settings, posting, cl, resume);
        setReview(rv);
        saveLocal(`jr_rv_${key}`, rv);
      }
      const rw = await rewriteResume(settings, posting, cl, rv, resume);
      setRewrite(rw);
      saveLocal(`jr_rw_${key}`, rw);
    });

  function updateResume(text: string) {
    setResume(text);
    saveLocal("jr_resume", text);
  }

  if (loading) return <div className="text-sm text-muted-foreground">불러오는 중</div>;
  if (!job)
    return (
      <div className="flex flex-col gap-3">
        <BackLink />
        <div className="text-sm text-muted-foreground">공고를 찾을 수 없습니다 ({id})</div>
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <BackLink />
      <Card>
        <CardHeader className="gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{job.category}</Badge>
            <Badge variant="outline">{SOURCE_LABELS[job.source] ?? job.source}</Badge>
            {job.stale && <Badge variant="outline">마감 추정</Badge>}
          </div>
          <CardTitle className="text-xl leading-snug">{job.title}</CardTitle>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>{job.company}</span>
            {job.career && <span>{job.career}</span>}
            {job.location && <span>{job.location}</span>}
            {job.deadline && <span>마감 {job.deadline}</span>}
            <span>수집 {job.first_seen}</span>
            <a href={job.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline">
              원문 <ExternalLink className="size-3" />
            </a>
          </div>
        </CardHeader>
      </Card>

      {!ready && (
        <Card>
          <CardContent className="py-4 text-sm">
            체크리스트와 진단 기능은 <Link href="/settings" className="underline">설정</Link>에서 API 키와 모델을 저장한 뒤 사용할 수 있습니다.
          </CardContent>
        </Card>
      )}
      {error && (
        <Card className="border-destructive">
          <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="posting">공고 내용</TabsTrigger>
          <TabsTrigger value="checklist">체크리스트</TabsTrigger>
          <TabsTrigger value="review">경력기술서 진단</TabsTrigger>
          <TabsTrigger value="rewrite">수정본</TabsTrigger>
        </TabsList>

        <TabsContent value="posting">
          <Card>
            <CardContent className="pt-6">
              {!crawledLoaded ? (
                <div className="text-sm text-muted-foreground">불러오는 중</div>
              ) : crawled ? (
                <div className="whitespace-pre-wrap text-sm leading-relaxed">{crawled}</div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="text-sm text-muted-foreground">
                    본문이 아직 수집되지 않았습니다. 원문에서 공고 내용을 복사해 붙여넣으면 체크리스트와 진단에 사용됩니다.
                  </div>
                  <Textarea
                    rows={16}
                    value={pasted}
                    onChange={(e) => {
                      setPasted(e.target.value);
                      saveLocal(`jr_post_${key}`, e.target.value);
                    }}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="checklist">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-base">경력기술서 체크리스트</CardTitle>
              <Button size="sm" onClick={onChecklist} disabled={!ready || !posting || busy !== null}>
                {busy === "checklist" ? "생성 중" : checklist ? "다시 생성" : "체크리스트 생성"}
              </Button>
            </CardHeader>
            <CardContent>
              {!posting && <div className="text-sm text-muted-foreground">공고 본문이 있어야 생성할 수 있습니다.</div>}
              {checklist && (
                <div className="flex flex-col gap-3">
                  <p className="text-sm">{checklist.role_summary}</p>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[70px]">구분</TableHead>
                          <TableHead>요구사항</TableHead>
                          <TableHead>경력기술서에 있어야 할 근거</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {checklist.items.map((it) => (
                          <TableRow key={it.id}>
                            <TableCell><Badge variant={it.group === "필수" ? "default" : "secondary"}>{it.group}</Badge></TableCell>
                            <TableCell className="text-sm">{it.requirement}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{it.what_to_show}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="review" className="flex flex-col gap-4">
          <ResumeInput
            resume={resume}
            onChange={updateResume}
            settings={settings}
            onError={setError}
            disabled={busy !== null}
          />
          <div>
            <Button onClick={() => onReview()} disabled={!ready || !posting || !resume.trim() || busy !== null}>
              {busy === "review" ? "진단 중" : review ? "다시 진단" : "진단하기"}
            </Button>
          </div>
          {review && checklist && <ReviewResult review={review} checklist={checklist} />}
        </TabsContent>

        <TabsContent value="rewrite" className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Button onClick={onRewrite} disabled={!ready || !posting || !resume.trim() || busy !== null}>
              {busy === "rewrite" ? "작성 중" : rewrite ? "다시 작성" : "수정본 작성"}
            </Button>
            {rewrite && (
              <>
                <Button variant="outline" onClick={() => downloadDocx(rewrite.resume, `경력기술서_${job.company}.docx`)}>
                  .docx 다운로드
                </Button>
                <Button variant="outline" onClick={() => downloadText(rewrite.resume, `경력기술서_${job.company}.md`)}>
                  .md 다운로드
                </Button>
                <Button
                  variant="outline"
                  disabled={busy !== null}
                  onClick={async () => {
                    updateResume(rewrite.resume);
                    const rv = await onReview(rewrite.resume);
                    if (rv) setTab("review");
                  }}
                >
                  수정본으로 다시 진단
                </Button>
              </>
            )}
          </div>
          {!resume.trim() && <div className="text-sm text-muted-foreground">경력기술서 진단 탭에서 경력기술서를 먼저 입력하세요.</div>}
          {rewrite && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">수정본</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    rows={24}
                    className="font-mono text-sm"
                    value={rewrite.resume}
                    onChange={(e) => {
                      const rw = { ...rewrite, resume: e.target.value };
                      setRewrite(rw);
                      saveLocal(`jr_rw_${key}`, rw);
                    }}
                  />
                </CardContent>
              </Card>
              {rewrite.changes.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">변경 내역</CardTitle>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[140px]">위치</TableHead>
                          <TableHead>변경</TableHead>
                          <TableHead>이유</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rewrite.changes.map((c, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-sm">{c.section}</TableCell>
                            <TableCell className="text-sm">{c.change}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{c.reason}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:underline">
      <ArrowLeft className="size-4" /> 채용공고
    </Link>
  );
}

function ResumeInput({
  resume,
  onChange,
  settings,
  onError,
  disabled,
}: {
  resume: string;
  onChange: (t: string) => void;
  settings: Settings;
  onError: (e: string | null) => void;
  disabled: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);

  async function onFile(f: File | undefined) {
    if (!f) return;
    setReading(true);
    onError(null);
    try {
      onChange(await fileToText(f, settings));
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">내 경력기술서</CardTitle>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.md,.docx,.pdf"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          <Button size="sm" variant="outline" disabled={disabled || reading} onClick={() => fileRef.current?.click()}>
            {reading ? "읽는 중" : "파일 업로드"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Textarea
          rows={14}
          placeholder="경력기술서 텍스트를 붙여넣거나 txt, md, docx, pdf 파일을 업로드"
          value={resume}
          onChange={(e) => onChange(e.target.value)}
        />
        <div className="mt-1 text-right text-xs text-muted-foreground">{resume.length.toLocaleString()}자</div>
      </CardContent>
    </Card>
  );
}

const STATUS_VARIANT = { 충족: "default", "부분 충족": "secondary", 미충족: "destructive" } as const;

function ReviewResult({ review, checklist }: { review: Review; checklist: Checklist }) {
  const rate = matchRate(review.checklist);
  const count = (s: string) => review.checklist.filter((r) => r.status === s).length;
  const byId = Object.fromEntries(checklist.items.map((i) => [i.id, i]));

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">체크리스트 부합도</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-semibold">{rate}%</span>
            <span className="text-sm text-muted-foreground">
              충족 {count("충족")} / 부분 {count("부분 충족")} / 미충족 {count("미충족")}
            </span>
          </div>
          <Progress value={rate} />
        </CardContent>
      </Card>

      <div>
        <div className="mb-2 text-xs text-muted-foreground">합격률은 모델 추정치입니다.</div>
        <div className="grid gap-4 lg:grid-cols-3">
          {review.reviewers.map((r) => (
            <Card key={r.role}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{r.role}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-xs text-muted-foreground">서류 합격</div>
                    <div className="text-2xl font-semibold">{r.doc_pass_rate}%</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">면접 합격</div>
                    <div className="text-2xl font-semibold">{r.interview_pass_rate}%</div>
                  </div>
                </div>
                <p>{r.comment}</p>
                <div>
                  <div className="mb-1 text-xs font-medium text-muted-foreground">강점</div>
                  <ul className="list-disc space-y-1 pl-4">
                    {r.strengths.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium text-muted-foreground">보완점</div>
                  <ul className="list-disc space-y-1 pl-4">
                    {r.weaknesses.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">항목별 판정</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[70px]">구분</TableHead>
                <TableHead>요구사항</TableHead>
                <TableHead className="w-[90px]">판정</TableHead>
                <TableHead>경력기술서 근거</TableHead>
                <TableHead>보완</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {review.checklist.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">{byId[r.id]?.group}</TableCell>
                  <TableCell className="text-sm">{byId[r.id]?.requirement ?? r.id}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[r.status] ?? "outline"} className="whitespace-nowrap">{r.status}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.evidence}</TableCell>
                  <TableCell className="text-sm">{r.fix}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
