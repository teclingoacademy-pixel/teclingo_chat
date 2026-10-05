export type FreeTalkLevel = "1" | "2" | "native";
export type FreeTalkSpeed = "0.5" | "0.7" | "1.0";
export type FreeTalkRole = "friend" | "stranger" | "cafe" | "coworker" | "classmate" | "party" | "free";

export interface FreeTalkTurn {
  role: "user" | "assistant";
  text: string;
  spanish?: string;
  /** Hint del backend cuando la respuesta se truncó por exceder el nivel. */
  levelHint?: string;
}

export interface ChatReply {
  reply: string;
  spanish?: string;
  reply_hints?: { en: string; es: string }[];
  word_count: number;
  level: string;
  role?: FreeTalkRole;
  persona_name?: string;
  min: number | null;
  max: number | null;
  status: string;
  /** Si el backend truncó la respuesta, incluye un mensaje para el usuario. */
  level_hint?: string;
}

export const STORAGE_VERSION = "1";

const LS = {
  version: "ft_version",
  nickname: "ft_nickname",
  level: "ft_level",
  speed: "ft_speed",
  role: "ft_role",
  ready: "ft_ready",
  started: "ft_started",
  completed: "ft_completed",
  summaryEn: "ft_summary_en",
  summaryEs: "ft_summary_es",
  history: "ft_history",
};

export const LEVEL_LABELS: Record<FreeTalkLevel, { label: string; range: string }> = {
  "1": { label: "Nivel 1", range: "3 a 5 palabras" },
  "2": { label: "Nivel 2", range: "4 a 7 palabras" },
  native: { label: "Modo nativo", range: "Sin filtro" },
};

export const ROLE_LABELS: Record<FreeTalkRole, { label: string; emoji: string; personaName: string; description: string; color: string }> = {
  friend: {
    label: "Amiga",
    emoji: "💬",
    personaName: "AURIX",
    description: "Tu amiga de siempre",
    color: "#00f0ff",
  },
  stranger: {
    label: "Viajera",
    emoji: "🌍",
    personaName: "Emily",
    description: "Conoce a una viajera",
    color: "#4facfe",
  },
  cafe: {
    label: "Barista",
    emoji: "☕",
    personaName: "Jennifer",
    description: "Pide en su café",
    color: "#ff9f43",
  },
  coworker: {
    label: "Colega",
    emoji: "💼",
    personaName: "Amanda",
    description: "Small talk en la oficina",
    color: "#4ade80",
  },
  classmate: {
    label: "Compañera",
    emoji: "🎓",
    personaName: "Rachel",
    description: "Conoce a una estudiante",
    color: "#e879f9",
  },
  party: {
    label: "Fiesta",
    emoji: "🎉",
    personaName: "Sofia",
    description: "Conoce gente en una fiesta",
    color: "#a855f7",
  },
  free: {
    label: "Libre",
    emoji: "♾️",
    personaName: "AURIX",
    description: "Habla de lo que quieras",
    color: "#22d3ee",
  },
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
    const v = localStorage.getItem(LS.level) as FreeTalkLevel | string | null;
    if (!v) return "1";
    if (v === "3") {
      localStorage.setItem(LS.level, "native");
      return "native";
    }
    return ["1", "2", "native"].includes(v) ? (v as FreeTalkLevel) : "1";
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
  getRole(): FreeTalkRole {
    const v = localStorage.getItem(LS.role) as FreeTalkRole | null;
    return v && ["friend", "stranger", "cafe", "coworker", "classmate", "party", "free"].includes(v) ? v : "friend";
  },
  setRole(r: FreeTalkRole) {
    localStorage.setItem(LS.role, r);
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
    role?: FreeTalkRole;
    resume?: string;
  }
): Promise<ChatReply> {
  const ctrl = new AbortController();
  const chatTimer = setTimeout(() => ctrl.abort(), 60000);
  const res = await fetch("/api/tutor/chat", {
    signal: ctrl.signal,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_input: input,
      history,
      response_level: opts.level,
      nickname: opts.nickname,
      role: opts.role || "friend",
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