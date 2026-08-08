export type FreeTalkLevel = "1" | "2" | "3" | "native";
export type FreeTalkSpeed = "0.5" | "0.7" | "1.0";

export interface FreeTalkTurn {
  role: "user" | "assistant";
  text: string;
  spanish?: string;
}

export interface ChatReply {
  reply: string;
  spanish?: string;
  word_count: number;
  level: string;
  min: number | null;
  max: number | null;
  status: string;
}

export const STORAGE_VERSION = "1";

const LS = {
  version: "ft_version",
  nickname: "ft_nickname",
  level: "ft_level",
  speed: "ft_speed",
  ready: "ft_ready",
  started: "ft_started",
  completed: "ft_completed",
  summaryEn: "ft_summary_en",
  summaryEs: "ft_summary_es",
  history: "ft_history",
};

export const LEVEL_LABELS: Record<FreeTalkLevel, { label: string; range: string }> = {
  "1": { label: "Nivel 1", range: "3 a 5 palabras" },
  "2": { label: "Nivel 2", range: "4 a 8 palabras" },
  "3": { label: "Nivel 3", range: "5 a 10 palabras" },
  native: { label: "Modo nativo", range: "Sin filtro" },
};

export const freeTalkStore = {
  getVersion(): string {
    return localStorage.getItem(LS.version) || "";
  },
  setVersion(v: string) {
    localStorage.setItem(LS.version, v);
  },
  getNickname(): string {
    return localStorage.getItem(LS.nickname) || "";
  },
  setNickname(n: string) {
    localStorage.setItem(LS.nickname, n);
  },
  getLevel(): FreeTalkLevel {
    const v = localStorage.getItem(LS.level) as FreeTalkLevel | null;
    return v && ["1", "2", "3", "native"].includes(v) ? v : "1";
  },
  setLevel(l: FreeTalkLevel) {
    localStorage.setItem(LS.level, l);
  },
  getSpeed(): FreeTalkSpeed {
    const v = localStorage.getItem(LS.speed) as FreeTalkSpeed | null;
    return v && ["0.5", "0.7", "1.0"].includes(v) ? v : "0.7";
  },
  setSpeed(s: FreeTalkSpeed) {
    localStorage.setItem(LS.speed, s);
  },
  isReady(): boolean {
    return localStorage.getItem(LS.ready) === "true";
  },
  markReady() {
    localStorage.setItem(LS.ready, "true");
  },
  isStarted(): boolean {
    return localStorage.getItem(LS.started) === "true";
  },
  markStarted() {
    localStorage.setItem(LS.started, "true");
  },
  isCompleted(): boolean {
    return localStorage.getItem(LS.completed) === "true";
  },
  markCompleted() {
    localStorage.setItem(LS.completed, "true");
  },
  setSummary(en: string, es: string) {
    localStorage.setItem(LS.summaryEn, en);
    localStorage.setItem(LS.summaryEs, es);
  },
  getSummary(): { en: string; es: string } {
    return {
      en: localStorage.getItem(LS.summaryEn) || "",
      es: localStorage.getItem(LS.summaryEs) || "",
    };
  },
  saveHistory(turns: FreeTalkTurn[]) {
    try {
      localStorage.setItem(LS.history, JSON.stringify(turns.slice(-40)));
    } catch {
      // Ignorar.
    }
  },
  loadHistory(): FreeTalkTurn[] {
    try {
      const raw = localStorage.getItem(LS.history);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  },
  reset() {
    Object.values(LS).forEach((k) => localStorage.removeItem(k));
  },
};

export async function sendFreeTalkMessage(
  input: string,
  history: { role: string; text: string }[],
  opts: {
    level: FreeTalkLevel;
    nickname: string;
    resume?: string;
  }
): Promise<ChatReply> {
  const ctrl = new AbortController();
  const chatTimer = setTimeout(() => ctrl.abort(), 20000);
  const res = await fetch("/api/tutor/chat", {
    signal: ctrl.signal,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_input: input,
      history,
      response_level: opts.level,
      nickname: opts.nickname,
      resume_summary: opts.resume || null,
    }),
  });
  if (!res.ok) {
  clearTimeout(chatTimer);
    throw new Error("No se pudo conectar con tu amigo de conversación.");
  }
  return res.json();
}

export async function generateSessionSummary(
  history: { role: string; text: string }[],
  nickname: string
): Promise<{ summary_en: string; summary_es: string }> {
  const res = await fetch("/api/tutor/summarize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ history, nickname }),
  });
  if (!res.ok) {
    throw new Error("No se pudo generar el resumen.");
  }
  const data = await res.json();
  return {
    summary_en: data.summary_en || "",
    summary_es: data.summary_es || "",
  };
}

