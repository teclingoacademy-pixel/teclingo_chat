import express from "express";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();
dotenv.config({ path: ".env.local", override: false });

export const app = express();

app.use(express.json({ limit: "10mb" }));

// Initialize Google GenAI SDK (Server-Side Only)
const getAiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("[Venus AI Tutor] GEMINI_API_KEY environment variable is missing.");
  }
  return new GoogleGenAI({
    apiKey: apiKey || "placeholder_key",
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
};

// --- NEXUS-7 FUTURISTIC TUTOR ENGINE & ADN PROFILE ADAPTER ---

// In-memory active student profile store (Default loaded from OnboardingADN record)
let activeStudentProfile = {
  email: "estudiante@teclingo.local",
  level: "Intermedio",
  motivo: "Profesional",
  meta3m: "Series y Películas sin subtítulos",
  estiloSesion: "Cortas y Dinámicas",
  minutosDia: "15m/día",
  correccionModo: "Instante",
  temasInteres: "Negocios y Tecnología",
  formatoPreferido: "Películas y Casos Reales",
  queEvitar: "Gramática teórica pesada",
  horario: "Mañana",
  currentSubtopic: "INT-M02-ST03",
};

const buildNexus7SystemInstructions = (userProfile: any) => {
  const p = userProfile || activeStudentProfile;
  const level = p.level || "Intermedio";
  const goal = p.goal || `Inglés para ${p.motivo || "Profesional"} (Meta 3M: ${p.meta3m || "Series"})`;
  const style = p.style || `Sesiones ${p.estiloSesion || "Cortas"} (${p.minutosDia || "15m"}/día) - Corrección ${p.correccionModo || "Instante"}`;
  const format = p.format || `Enfocado en ${p.temasInteres || "Negocios"} a través de ${p.formatoPreferido || "Películas"}`;
  const avoid = p.avoid || p.queEvitar || "Gramática teórica pesada";

  return `
Eres el Tutor AI de TecLingo, un profesor personal de inglés cálido, motivador, dinámico y muy cercano.
Tu misión es guiar al estudiante de forma clara, natural y entretenida, haciendo que se sienta seguro al hablar inglés.

[PERFIL Y PREFERENCIAS DEL ESTUDIANTE]
- Nivel actual: ${level}
- Meta principal: ${goal}
- Ritmo deseado: ${style}
- Formatos de preferencia: ${format}
- Restricción pedagógica importante: Evita por completo explicaciones de '${avoid}'.

[REGLAS DE PERSONALIDAD, IDIOMA Y CORRECCIÓN]
1. IDIOMA PRINCIPAL: Habla siempre en español de Latinoamérica (con un tono cálido, humano y alentador).
2. USO DEL INGLÉS: Utiliza el inglés solo para saludos cortos ("¡Great job!", "¡Let's practice!"), las preguntas de conversación, ejemplos prácticos y la corrección de frases.
3. CERO TECNICISMOS: Queda estrictamente prohibido usar jerga técnica (como "APIs", "variables", "módulos", "algoritmos", "prompts" o "bases de datos"). Háblale como un profesor particular humano en una clase en vivo.
4. CORRECCIÓN AMABLE: Si el estudiante comete un error en inglés, felicítalo primero por intentarlo, muéstrarle suavemente la forma correcta de decirlo en inglés y pídele que la repita o responde con una nueva pregunta dinámica.
5. ADAPTACIÓN: Diseña las preguntas usando situaciones cotidianas, laborales y frases de películas o series.
`;
};

// --- FREE CONVERSATION ENGINE (SPEAKING PRACTICE, NO GRAMMAR) ---

// Regulador de palabras: niveles inviolables de longitud de respuesta
const LEVEL_RULES: Record<string, { min: number; max: number }> = {
  "1": { min: 3, max: 5 },
  "2": { min: 4, max: 8 },
  "3": { min: 5, max: 10 },
};

function countWords(text: string): number {
  return (text.match(/\S+/g) || []).length;
}

function truncateToMax(text: string, max: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= max) return text;
  let out = words.slice(0, max).join(" ");
  out = out.replace(/[,;:]\s*$/, "");
  return out;
}

// --- GROQ BACKUP AI (OpenAI-compatible endpoint, used if Gemini fails) ---

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.1-8b-instant";

async function callGroq(opts: {
  system: string;
  user: string;
  json?: boolean;
  temperature?: number;
}): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY environment variable is missing.");
  }
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      temperature: opts.temperature ?? 0.7,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) {
    throw new Error(`Groq API error ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || "";
  if (!content) {
    throw new Error("Groq returned an empty response.");
  }
  return content;
}

const REPLY_SCHEMA = {
  type: "OBJECT",
  properties: {
    english: { type: "STRING" },
    spanish: { type: "STRING" },
  },
  required: ["english", "spanish"],
};

const SUMMARY_SCHEMA = {
  type: "OBJECT",
  properties: {
    summary_en: { type: "STRING" },
    summary_es: { type: "STRING" },
  },
  required: ["summary_en", "summary_es"],
};

const buildFreeTalkInstructions = (opts: {
  level: string;
  nickname: string;
  resume: string | null;
  min: number | null;
  max: number | null;
}) => {
  const name = opts.nickname || "friend";
  const isNative = opts.level === "native" || !opts.min || !opts.max;

  const wordRule = isNative
    ? `- NO word limit: reply naturally, like a normal native speaker, at a relaxed pace.`
    : `- HARD WORD LIMIT (SACRED RULE, NEVER BREAK IT): your "english" reply MUST contain between ${opts.min} and ${opts.max} words. Count every single word. NEVER exceed ${opts.max} words and NEVER write fewer than ${opts.min}. This rule is non-negotiable: if you break it, the student loses trust and stops practicing forever. If your reply would be too long, simplify it. Be brief, natural and warm.`;

  return `
You are a warm, friendly English conversation partner — a real friend, not a teacher.
- MANDATORY: The student's name is ${name}. ALWAYS address the student by their name (e.g., "Hello ${name}!", "How are you, ${name}?"). Use their name often and naturally.
- You are here to ANIMATE the conversation: when the student is shy or quiet, propose a personal topic (family, food, music, sports, dreams, work, travel, hobbies, their day).
- Use the student profile (goal, route, level — included in the context) to propose topics that match their life, and get to know them little by little, building on what you already know.
- Every few turns, add ONE short line reminding them you are open to ANY personal topic they want to talk about — always respectful and within AI norms.
- The topic proposal and the reminder must fit INSIDE the same short reply; never exceed the word limit.
- NEVER call the student "friend", "buddy", "pal" or "amigo". The word "friend" is FORBIDDEN as a form of address.
- Your own name is AURIX. If the student asks your name, say "You can call me AURIX!" — never say "call me friend".
- Keep your warm, caring friend tone; the name rules above are absolute.

[PERSONALITY]
- Speak only English. Use simple, natural, friendly English suited to a learner.
- Never give grammar lessons, never correct the student, never explain rules, never lecture. Just converse like a caring friend who is genuinely curious about the student's life.
- Address the student by name: "${name}".

[HARD RULES]
- The "english" field must be 100% in English. Never write Spanish in it.
- If the student writes in Spanish, gently invite them to try it in English (for example "Try that in English, I really want to hear you!") without scolding and without long explanations.
- You always take the first step when a conversation starts or resumes.
- Ask open, friendly questions the student can answer with few words but feels invited to say more ("What...?", "How...?", "Tell me about..."). Avoid turning the chat into a yes/no quiz, but a yes/no question now and then is fine.
- Adapt the difficulty of your words to a low level. Keep your language simple.
- Topics: anything the student brings up (work, family, feelings, movies, daily life, news, culture, relationships), within safe content norms.
${opts.resume ? `- The student is returning from a previous session. Warmly acknowledge it: reference the last topic in English, briefly and naturally, and ask how they feel today.` : ""}

${wordRule}
`;
};

async function generateFriendReply(opts: {
  history: { role: string; text: string }[];
  user_input: string;
  level: string;
  nickname: string;
  resume: string | null;
  min: number | null;
  max: number | null;
  extraStrict: boolean;
}) {
  const instruction = buildFreeTalkInstructions(opts);
  const strict =
    opts.extraStrict && opts.min && opts.max
      ? `\n\nEXTREMELY IMPORTANT: your previous attempt broke the sacred word limit. This time the "english" field MUST contain between ${opts.min} and ${opts.max} words — count carefully, be brief and natural.`
      : "";

  const parseReply = (raw: string): { english: string; spanish: string } => {
    const trimmed = (raw || "").trim();
    let parsed: any = null;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      parsed = null;
    }
    return {
      english: (parsed && typeof parsed.english === "string" ? parsed.english : trimmed).trim(),
      spanish: (parsed && typeof parsed.spanish === "string" ? parsed.spanish : "").trim(),
    };
  };

  // 1) Primary: Gemini
  if (process.env.GEMINI_API_KEY) {
    try {
      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: [
          ...opts.history.slice(-6).map((h) => ({
            role: h.role === "user" ? "user" : "model",
            parts: [{ text: h.text }],
          })),
          { role: "user", parts: [{ text: opts.user_input }] },
        ],
        config: {
          systemInstruction: instruction + strict,
          temperature: 0.7,
          responseMimeType: "application/json",
          responseSchema: REPLY_SCHEMA,
        },
      });
      return { ...parseReply(response.text || ""), model: "gemini-3.6-flash" };
    } catch (err: any) {
      console.warn("[FreeTalk] Gemini failed, switching to Groq:", err?.message || err);
    }
  }

  // 2) Backup: Groq (OpenAI-compatible)
  if (process.env.GROQ_API_KEY) {
    try {
      const historyText = opts.history
        .slice(-6)
        .map((h) => `${h.role === "user" ? "Student" : "Friend"}: ${h.text}`)
        .join("\n");
      const raw = await callGroq({
        system: instruction + strict,
        user: `Conversation so far:\n${historyText}\n\nStudent's latest message: "${opts.user_input}"\n\nReply as the friendly English partner. Respond ONLY with a JSON object: {"english": "...", "spanish": "..."}`,
        json: true,
        temperature: 0.7,
      });
      return { ...parseReply(raw), model: GROQ_MODEL };
    } catch (err: any) {
      console.warn("[FreeTalk] Groq fallback failed:", err?.message || err);
    }
  }

  return { english: "", spanish: "", model: "simulation-fallback" };
}

async function translateToSpanish(text: string): Promise<string> {
  // 1) Primary: Gemini
  if (process.env.GEMINI_API_KEY) {
    try {
      const ai = getAiClient();
      const r = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: `Translate to natural, warm Spanish. Only the translation: "${text}"`,
        config: { temperature: 0.2 },
      });
      const out = (r.text || "").trim();
      if (out) return out;
    } catch (err: any) {
      console.warn("[FreeTalk] Gemini translate failed, switching to Groq:", err?.message || err);
    }
  }

  // 2) Backup: Groq
  if (process.env.GROQ_API_KEY) {
    try {
      const out = await callGroq({
        system: "You are a warm, natural translator into Latin American Spanish.",
        user: `Translate to natural, warm Spanish. Only the translation, nothing else: "${text}"`,
        temperature: 0.2,
      });
      return out.trim();
    } catch (err: any) {
      console.warn("[FreeTalk] Groq translate fallback failed:", err?.message || err);
    }
  }

  return "";
}

// ADN Profile GET/POST
app.get("/api/tutor/adn-profile", (_req, res) => {
  res.json({
    status: "success",
    profile: activeStudentProfile,
    summary: `Student ${activeStudentProfile.email} | Nivel: ${activeStudentProfile.level} | Focus: ${activeStudentProfile.temasInteres}`,
  });
});

app.post("/api/tutor/adn-profile", (req, res) => {
  const { profile } = req.body;
  if (profile && typeof profile === "object") {
    activeStudentProfile = { ...activeStudentProfile, ...profile };
  }
  res.json({
    status: "success",
    profile: activeStudentProfile,
  });
});

// Tutor Chat Endpoint (/api/tutor/chat) — Free Conversation, word-level enforced
app.post("/api/tutor/chat", async (req, res) => {
  try {
    const { user_input, history, user_profile } = req.body;
    const inputPrompt = user_input || req.body.prompt;

    if (!inputPrompt) {
      res.status(400).json({ error: "user_input is required." });
      return;
    }

    const currentProfile = user_profile || activeStudentProfile;
    const level = String(req.body.response_level || "1");
    const nickname = (req.body.nickname || currentProfile.nickname || "").trim();
    const resume = req.body.resume_summary || currentProfile.resume_summary || null;
    const rule = LEVEL_RULES[level];
    const isNative = level === "native" || !rule;
    const min = isNative ? null : rule.min;
    const max = isNative ? null : rule.max;

    const sendReply = (english: string, spanish: string, model: string) => {
      res.json({
        reply: english,
        response: english,
        spanish,
        word_count: countWords(english),
        level,
        min,
        max,
        status: "success",
        timestamp: new Date().toISOString(),
        model,
      });
    };

    // Regenerar hasta que cumpla el maximo (regla inviolable), luego truncar
    let result = await generateFriendReply({
      history: history || [],
      user_input: inputPrompt,
      level,
      nickname,
      resume,
      min,
      max,
      extraStrict: false,
    });

    if (!result.english) {
      // Friendly fallback (both AIs failed or no keys set) respecting the word limit
      const name = nickname || "friend";
      const byName = name ? ", " + name : "";
      const fallbacks: Record<string, { en: string; es: string }> = {
        "1": { en: "Sounds nice! Tell me more.", es: "¡Suena bien! Cuéntame más." },
        "2": { en: "Sounds nice! Tell me more" + byName + ".", es: "¡Suena bien! Cuéntame más" + byName + "." },
        "3": { en: "That sounds nice! Tell me more" + byName + ".", es: "¡Suena muy bien! Cuéntame más" + byName + "." },
        native: { en: "That sounds really interesting! Tell me more about it" + byName + ". I want to hear everything.", es: "¡Suena muy interesante! Cuéntame más. Quiero escucharlo todo." },
      };
      const fb = fallbacks[level] || fallbacks["1"];
      sendReply(fb.en, fb.es, "simulation-fallback");
      return;
    }

    let attempts = 0;
    while (!isNative && countWords(result.english) > (rule?.max ?? Infinity) && attempts < 2) {
      attempts++;
      result = await generateFriendReply({
        history: history || [],
        user_input: inputPrompt,
        level,
        nickname,
        resume,
        min,
        max,
        extraStrict: true,
      });
    }

    if (!isNative && countWords(result.english) > (rule?.max ?? Infinity)) {
      result.english = truncateToMax(result.english, rule?.max ?? Infinity);
    }

    if (!result.spanish && result.english) {
      try {
        result.spanish = await translateToSpanish(result.english);
      } catch {
        result.spanish = "";
      }
    }

    sendReply(result.english, result.spanish, result.model);
  } catch (error: any) {
    console.error("Free Conversation API Error:", error);
    res.status(500).json({
      error: "Error en el chat de conversación libre.",
      message: error?.message || "Unknown error",
    });
  }
});

// End-of-session summary generator
app.post("/api/tutor/summarize", async (req, res) => {
  try {
    const { history, nickname } = req.body;
    const turns = (history || []).map((h: { role: string; content?: string; text?: string }) => ({
      role: h.role === "user" ? "user" : "model",
      parts: [{ text: h.content || h.text || "" }],
    }));
    const summaryPrompt = `Write a short session summary of this English conversation${nickname ? " with " + nickname : ""}. Return JSON with two fields: summary_en (2-3 warm sentences in English describing what was discussed and the student's progress) and summary_es (2-3 warm, personal sentences in Spanish that a narrator will read aloud to the student next time, mentioning the real topics that mattered and inviting them to continue).`;

    const fallbackSummary = () => ({
      summary_en: "We had a friendly conversation in English.",
      summary_es: "Tuvimos una conversación amistosa en inglés.",
      status: "success",
      model: "simulation-fallback",
    });

    const parseSummary = (raw: string): { summary_en: string; summary_es: string } => {
      let parsed: any = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = null;
      }
      return {
        summary_en: parsed?.summary_en || "We had a good conversation.",
        summary_es: parsed?.summary_es || "Tuvimos una buena conversación.",
      };
    };

    // 1) Primary: Gemini
    if (process.env.GEMINI_API_KEY) {
      try {
        const ai = getAiClient();
        const response = await ai.models.generateContent({
          model: "gemini-3.6-flash",
          contents: [
            ...turns,
            { role: "user", parts: [{ text: summaryPrompt }] },
          ],
          config: {
            temperature: 0.4,
            responseMimeType: "application/json",
            responseSchema: SUMMARY_SCHEMA,
          },
        });
        const s = parseSummary(response.text || "{}");
        res.json({ ...s, status: "success", model: "gemini-3.6-flash" });
        return;
      } catch (err: any) {
        console.warn("[Summarize] Gemini failed, switching to Groq:", err?.message || err);
      }
    }

    // 2) Backup: Groq
    if (process.env.GROQ_API_KEY) {
      try {
        const conversation = (history || [])
          .map((h: { role: string; content?: string; text?: string }) => `${h.role === "user" ? "Student" : "Friend"}: ${h.content || h.text || ""}`)
          .join("\n");
        const raw = await callGroq({
          system: "You write warm, concise session summaries for an English learning app.",
          user: `Conversation:\n${conversation}\n\n${summaryPrompt}\n\nRespond ONLY with a JSON object: {"summary_en": "...", "summary_es": "..."}`,
          json: true,
          temperature: 0.4,
        });
        const s = parseSummary(raw);
        res.json({ ...s, status: "success", model: GROQ_MODEL });
        return;
      } catch (err: any) {
        console.warn("[Summarize] Groq fallback failed:", err?.message || err);
      }
    }

    res.json(fallbackSummary());
  } catch (error: any) {
    console.error("Summarize API Error:", error);
    res.status(500).json({
      error: "No se pudo generar el resumen.",
      message: error?.message || "Unknown error",
    });
  }
});

// --- API ENDPOINTS ---

// Health check
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ONLINE",
    core: "SYNTHETIC_INTELLIGENCE_V4.8",
    timestamp: new Date().toISOString(),
    apiKeyAvailable: Boolean(process.env.GEMINI_API_KEY),
  });
});

// Live System Telemetry
app.get("/api/system-telemetry", (_req, res) => {
  const uptime = process.uptime();
  const memory = process.memoryUsage();
  
  // Synthetic dynamic metrics for HUD feel
  const cpuLoad = (Math.sin(Date.now() / 2000) * 15 + 42).toFixed(1);
  const gpuCompute = (Math.cos(Date.now() / 1500) * 20 + 68).toFixed(1);
  const latency = Math.floor(Math.random() * 8 + 12);
  const threadCount = 128;
  const tokenRate = Math.floor(Math.sin(Date.now() / 3000) * 400 + 1250);

  res.json({
    cpuLoad: `${cpuLoad}%`,
    gpuCompute: `${gpuCompute}%`,
    memoryUsedMb: (memory.heapUsed / 1024 / 1024).toFixed(1),
    memoryTotalMb: (memory.heapTotal / 1024 / 1024).toFixed(1),
    latencyMs: latency,
    threadCount,
    tokenRate: `${tokenRate} T/s`,
    uptimeSeconds: Math.floor(uptime),
    neuralCoreStatus: "OPTIMAL",
    quantumCoherence: "99.82%",
  });
});

// Primary Synthetic Intelligence Chat API (Gemini Integration)
app.post("/api/chat", async (req, res) => {
  try {
    const { prompt, history, mode } = req.body;

    if (!prompt) {
      res.status(400).json({ error: "Prompt parameter is required." });
      return;
    }

    if (!process.env.GEMINI_API_KEY) {
      // Fallback response if key is missing
      res.json({
        response: `[SYNTHETIC INTELLIGENCE OFFLINE SIMULATION]\nReceived command: "${prompt}".\nTo enable full neural inference, attach your GEMINI_API_KEY in Settings > Secrets.`,
        mode: mode || "ASSISTANT",
        timestamp: new Date().toISOString(),
        model: "simulation-fallback",
      });
      return;
    }

    const ai = getAiClient();

    let systemInstruction = "";

    if (mode === "DIAGNOSTIC") {
      systemInstruction = "You are NEXUS-7 AI Diagnostic System. Focus on system optimization, root cause analysis, security threat detection, and telemetry interpretation.";
    } else if (mode === "TACTICAL") {
      systemInstruction = "You are NEXUS-7 AI Tactical Strategist. Respond in high-speed tactical decision matrix format with risk assessment, probability scores, and executable action steps.";
    } else if (mode === "CREATIVE") {
      systemInstruction = "You are NEXUS-7 AI Neural Innovation Lab. Generate futuristic concepts, speculative algorithmic solutions, and advanced code structures.";
    } else {
      // Default ASSISTANT mode uses NEXUS-7 Futuristic English Coach with Student ADN Profile
      systemInstruction = buildNexus7SystemInstructions(req.body.user_profile || activeStudentProfile);
    }

    // Standard Gemini 3.6 Flash model call
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: [
        ...(history || []).map((h: { role: string; text: string }) => ({
          role: h.role === "user" ? "user" : "model",
          parts: [{ text: h.text }],
        })),
        { role: "user", parts: [{ text: prompt }] },
      ],
      config: {
        systemInstruction,
        temperature: 0.7,
      },
    });

    const outputText = response.text || "[No response text generated]";

    res.json({
      response: outputText,
      mode: mode || "ASSISTANT",
      timestamp: new Date().toISOString(),
      model: "gemini-3.6-flash",
    });
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    res.status(500).json({
      error: "Neural synthesis execution failed.",
      message: error?.message || "Unknown error",
    });
  }
});

// Voice Command Analyzer
app.post("/api/voice-command", async (req, res) => {
  try {
    const { commandText } = req.body;
    if (!commandText) {
      res.status(400).json({ error: "commandText is required" });
      return;
    }

    if (!process.env.GEMINI_API_KEY) {
      res.json({
        command: commandText,
        action: "EXECUTE_DIAGNOSTIC",
        summary: `Processed voice directive: "${commandText}"`,
        confidence: 0.98,
        data: { target: "CORE_MATRIX", status: "SIMULATED" },
      });
      return;
    }

    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: `Analyze this spoken voice directive given to a futuristic AI HUD: "${commandText}". Classify the intent into one of [DIAGNOSTIC, QUERY, CODE_GEN, SYSTEM_OVERRIDE, DATA_ANALYSIS] and provide a crisp 2-sentence HUD response confirmation.`,
      config: {
        systemInstruction: "Return a concise tactical response.",
      },
    });

    res.json({
      command: commandText,
      summary: response.text || `Processed voice directive: "${commandText}"`,
      confidence: 0.99,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default app;
