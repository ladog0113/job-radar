"use client";

import { useEffect, useState } from "react";

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
import { listModels, loadSettings, saveSettings } from "@/lib/llm";

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [models, setModels] = useState<{ id: string; display_name?: string }[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const s = loadSettings();
    setApiKey(s.apiKey);
    setModel(s.model);
    if (s.model) setModels([{ id: s.model }]);
  }, []);

  async function fetchModels() {
    setLoading(true);
    setStatus(null);
    try {
      const list = await listModels(apiKey.trim());
      setModels(list);
      if (!list.some((m) => m.id === model)) {
        const pick = list.find((m) => m.id.includes("sonnet")) ?? list[0];
        if (pick) setModel(pick.id);
      }
      setStatus(`모델 ${list.length}개를 불러왔습니다`);
    } catch (e) {
      setStatus(`불러오기 실패: ${e instanceof Error ? e.message : e}`);
    } finally {
      setLoading(false);
    }
  }

  function save() {
    saveSettings({ apiKey: apiKey.trim(), model });
    setStatus("저장했습니다");
  }

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="text-base">Anthropic API</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="key">API 키</Label>
          <Input
            id="key"
            type="password"
            autoComplete="off"
            placeholder="sk-ant-..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">이 브라우저에만 저장되고 Anthropic API 외에는 전송되지 않습니다.</p>
        </div>
        <div className="flex flex-col gap-2">
          <Label>모델</Label>
          <div className="flex gap-2">
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="모델 선택" />
              </SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.display_name ? `${m.display_name} (${m.id})` : m.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={fetchModels} disabled={!apiKey.trim() || loading}>
              {loading ? "불러오는 중" : "모델 불러오기"}
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={!apiKey.trim() || !model}>
            저장
          </Button>
          {status && <span className="text-sm text-muted-foreground">{status}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
