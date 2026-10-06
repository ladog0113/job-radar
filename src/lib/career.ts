"use client";

import { callText, callTool, type Settings } from "./llm";

export type ChecklistItem = {
  id: string;
  group: "필수" | "우대" | "역량";
  requirement: string;
  what_to_show: string;
};
export type Checklist = { role_summary: string; items: ChecklistItem[] };

export type ItemResult = {
  id: string;
  status: "충족" | "부분 충족" | "미충족";
  evidence: string;
  fix: string;
};
export type Reviewer = {
  role: "5년차 실무진" | "10년차 실무진" | "인사담당자";
  doc_pass_rate: number;
  interview_pass_rate: number;
  strengths: string[];
  weaknesses: string[];
  comment: string;
};
export type Review = { checklist: ItemResult[]; reviewers: Reviewer[] };

export type Rewrite = { resume: string; changes: { section: string; change: string; reason: string }[] };

const STYLE_RULES = `문체 규칙:
- 긴 대시(—), 중앙점(·), 낫표, 이모지, 수평선을 쓰지 않는다.
- 은유, 감성 표현, "혁신적", "게임체인저", "단순한 X가 아니라 Y" 같은 상투 표현을 쓰지 않는다.
- 도입 문장, 요약 반복, 장식 수식어 없이 사실과 행동, 결과만 쓴다.`;

export async function makeChecklist(settings: Settings, title: string, company: string, posting: string) {
  return callTool<Checklist>(settings, {
    system:
      "너는 채용 공고를 분석해 지원자가 경력기술서에 반드시 담아야 할 항목을 뽑는 채용 전문가다. " +
      "공고에 실제로 적힌 요구사항만 근거로 삼고, 공고에 없는 요건은 만들지 않는다. " +
      "항목은 경력기술서에서 확인 가능한 형태(경험, 산출물, 수치, 도구, 도메인)로 구체적으로 쓴다.",
    content: `공고 제목: ${title}\n회사: ${company}\n\n공고 본문:\n${posting}`,
    name: "submit_checklist",
    schema: {
      type: "object",
      properties: {
        role_summary: { type: "string", description: "이 포지션이 원하는 사람을 2문장 이내로" },
        items: {
          type: "array",
          minItems: 5,
          maxItems: 15,
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "c1, c2 ... 순번" },
              group: { type: "string", enum: ["필수", "우대", "역량"] },
              requirement: { type: "string", description: "공고 요구사항을 한 줄로" },
              what_to_show: { type: "string", description: "경력기술서에 어떤 근거가 있어야 충족으로 보이는지" },
            },
            required: ["id", "group", "requirement", "what_to_show"],
          },
        },
      },
      required: ["role_summary", "items"],
    },
    maxTokens: 4000,
  });
}

export async function reviewResume(settings: Settings, posting: string, checklist: Checklist, resume: string) {
  return callTool<Review>(settings, {
    system:
      "너는 세 명의 평가자 역할을 각각 수행해 경력기술서를 평가한다.\n" +
      "1) 5년차 실무진: 같은 직무 5년차. 바로 실무 투입이 가능한지, 도메인과 도구 경험, 산출물의 구체성을 본다.\n" +
      "2) 10년차 실무진: 리드급. 문제 정의, 의사결정 근거, 비즈니스 임팩트, 주도성, 연차에 맞는 수준인지를 본다.\n" +
      "3) 인사담당자: 필수 요건 충족, 경력 연수와 이력 흐름, 문서 가독성, 확인이 필요한 리스크를 본다.\n" +
      "합격률은 이 공고에 지원한 일반적인 지원자 풀과 비교한 추정 확률(0~100 정수)이며, 근거 없이 높게 주지 않는다. " +
      "체크리스트 판정은 경력기술서에 적힌 내용만 근거로 하고, evidence에는 경력기술서의 해당 문장을 짧게 인용한다. " +
      "근거가 없으면 미충족으로 판정한다.",
    content:
      `공고 본문:\n${posting}\n\n체크리스트:\n${JSON.stringify(checklist.items)}\n\n경력기술서:\n${resume}`,
    name: "submit_review",
    schema: {
      type: "object",
      properties: {
        checklist: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              status: { type: "string", enum: ["충족", "부분 충족", "미충족"] },
              evidence: { type: "string", description: "경력기술서 인용. 없으면 빈 문자열" },
              fix: { type: "string", description: "보완 방법 한 줄. 충족이면 빈 문자열" },
            },
            required: ["id", "status", "evidence", "fix"],
          },
        },
        reviewers: {
          type: "array",
          minItems: 3,
          maxItems: 3,
          items: {
            type: "object",
            properties: {
              role: { type: "string", enum: ["5년차 실무진", "10년차 실무진", "인사담당자"] },
              doc_pass_rate: { type: "integer", minimum: 0, maximum: 100 },
              interview_pass_rate: { type: "integer", minimum: 0, maximum: 100 },
              strengths: { type: "array", items: { type: "string" }, maxItems: 4 },
              weaknesses: { type: "array", items: { type: "string" }, maxItems: 4 },
              comment: { type: "string", description: "이 평가자의 한 줄 총평" },
            },
            required: ["role", "doc_pass_rate", "interview_pass_rate", "strengths", "weaknesses", "comment"],
          },
        },
      },
      required: ["checklist", "reviewers"],
    },
  });
}

export async function rewriteResume(
  settings: Settings,
  posting: string,
  checklist: Checklist,
  review: Review,
  resume: string,
) {
  return callTool<Rewrite>(settings, {
    system:
      "너는 경력기술서를 특정 공고에 맞게 고쳐 쓰는 편집자다.\n" +
      "규칙:\n" +
      "- 원문에 없는 경험, 회사, 수치, 성과를 만들어내지 않는다. 수치가 필요한데 원문에 없으면 [ ]로 비워 둔다.\n" +
      "- 체크리스트 중 원문에 근거가 있는 항목이 공고 용어로 드러나도록 순서와 표현을 조정한다.\n" +
      "- 원문에 근거가 전혀 없는 항목은 본문에 넣지 않고 changes에 '근거 없음'으로 남긴다.\n" +
      "- 형식: '# 이름', '## 섹션', '### 프로젝트', '- 항목' 마크다운만 사용한다.\n" +
      STYLE_RULES,
    content:
      `공고 본문:\n${posting}\n\n체크리스트:\n${JSON.stringify(checklist.items)}\n\n` +
      `평가 결과:\n${JSON.stringify(review)}\n\n원본 경력기술서:\n${resume}`,
    name: "submit_rewrite",
    schema: {
      type: "object",
      properties: {
        resume: { type: "string", description: "수정한 경력기술서 전문" },
        changes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              section: { type: "string" },
              change: { type: "string" },
              reason: { type: "string" },
            },
            required: ["section", "change", "reason"],
          },
        },
      },
      required: ["resume", "changes"],
    },
    maxTokens: 16000,
  });
}

export function matchRate(results: ItemResult[]) {
  if (!results.length) return 0;
  const score = results.reduce((s, r) => s + (r.status === "충족" ? 1 : r.status === "부분 충족" ? 0.5 : 0), 0);
  return Math.round((score / results.length) * 100);
}

/** 업로드 파일을 텍스트로 변환 (txt, md, docx, pdf) */
export async function fileToText(file: File, settings: Settings): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".txt") || name.endsWith(".md")) return file.text();
  if (name.endsWith(".docx")) {
    const mammoth = (await import("mammoth")).default;
    const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return value;
  }
  if (name.endsWith(".pdf")) {
    const buf = new Uint8Array(await file.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return callText(settings, {
      system: "PDF의 텍스트를 원문 그대로 옮긴다. 설명, 요약, 머리말 없이 본문 텍스트만 출력한다.",
      content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: btoa(bin) } },
        { type: "text", text: "이 문서의 텍스트를 그대로 옮겨줘." },
      ],
      maxTokens: 16000,
    });
  }
  throw new Error("txt, md, docx, pdf 파일만 지원합니다");
}

/** 마크다운 형식 경력기술서를 .docx로 저장 */
export async function downloadDocx(markdown: string, filename: string) {
  const { Document, Packer, Paragraph, HeadingLevel, TextRun } = await import("docx");
  const paragraphs = markdown.split("\n").map((line) => {
    const t = line.trimEnd();
    if (t.startsWith("### ")) return new Paragraph({ text: t.slice(4), heading: HeadingLevel.HEADING_3 });
    if (t.startsWith("## ")) return new Paragraph({ text: t.slice(3), heading: HeadingLevel.HEADING_2 });
    if (t.startsWith("# ")) return new Paragraph({ text: t.slice(2), heading: HeadingLevel.HEADING_1 });
    if (/^\s*[-*] /.test(t)) {
      const level = Math.min(Math.floor((t.match(/^\s*/)?.[0].length ?? 0) / 2), 3);
      return new Paragraph({ children: runs(t.replace(/^\s*[-*] /, ""), TextRun), bullet: { level } });
    }
    return new Paragraph({ children: runs(t, TextRun) });
  });
  const doc = new Document({
    styles: { default: { document: { run: { font: "Malgun Gothic", size: 21 } } } },
    sections: [{ children: paragraphs }],
  });
  saveBlob(await Packer.toBlob(doc), filename);
}

// **굵게** 표기를 실제 굵게로
function runs(text: string, TextRun: typeof import("docx").TextRun) {
  return text.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((part) =>
    part.startsWith("**") && part.endsWith("**")
      ? new TextRun({ text: part.slice(2, -2), bold: true })
      : new TextRun({ text: part }),
  );
}

export function downloadText(text: string, filename: string) {
  saveBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), filename);
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
