import express from "express";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();
dotenv.config({ path: ".env.local", override: false });

export const app = express();

app.use(express.json({ limit: "10mb" }));

const getAiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("[Venus AI Tutor] GEMINI_API_KEY environment variable is missing.");
  }
  return new GoogleGenAI({
    apiKey: apiKey || "placeholder_key",
    httpOptions: { headers: { "User-Agent": "aistudio-build" } },
  });
};

// --- NEXUS-7 FUTURISTIC TUTOR ENGINE & ADN PROFILE ADAPTER ---

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
1. IDIOMA PRINCIPAL: Habla siempre en español de Latinoamérica.
2. USO DEL INGLÉS: Solo para saludos cortos, preguntas, ejemplos y corrección.
3. CERO TECNICISMOS: Prohibido usar jerga técnica.
4. CORRECCIÓN AMABLE: Si comete error, felicítalo, muéstrale la forma correcta suavemente.
5. ADAPTACIÓN: Diseña preguntas con situaciones cotidianas, laborales y de películas.
`;
};

// --- FREE CONVERSATION ENGINE ---

// Regulador de palabras por nivel + presupuesto de tokens para Ollama.
//
// IMPORTANTE: numPredict debe ser SUFICIENTE para el JSON completo:
//   {"english": "...", "spanish": "...", "hints": [4 objetos]}
// Pesa ~150-200 tokens. Con 60-80 se corta a la mitad. Con 250 alcanza justo.
const LEVEL_RULES: Record<string, { min: number; max: number; numPredict: number }> = {
  "1": { min: 3, max: 5, numPredict: 250 },
  "2": { min: 4, max: 7, numPredict: 250 },
  "native": { min: 0, max: 9999, numPredict: 400 },
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

// --- ROLES CON NOMBRES DE PERSONAJES ---

type FreeTalkRole = "friend" | "stranger" | "cafe" | "coworker" | "classmate" | "party" | "free";

const ROLE_PERSONAS: Record<FreeTalkRole, { name: string; instructions: string }> = {
  friend: {
    name: "AURIX",
    instructions: `
You are AURIX, a warm, friendly English conversation partner — a real friend, not a teacher.
- ANIMATE the conversation: propose personal topics (family, food, music, sports, dreams, work, travel, hobbies).
- Get to know the student little by little.
- Ask open, friendly questions ("What...?", "How...?", "Tell me about...").
- Keep it warm, casual, caring.
- NEVER respond with generic filler like "Sounds nice!", "Tell me more!", "That's interesting!" — react with SPECIFIC content.
`,
  },
  stranger: {
    name: "Emily",
    instructions: `
You are Emily, a friendly traveler from Colorado, USA. You just met the student at a hostel or tourist spot.
- First message: introduce yourself warmly ("Hi! I'm Emily. Nice to meet you!")
- Curious about the student: where they are from, what they do, why they are traveling.
- Share small details about yourself (Colorado, hiking, coffee, meeting people).
- Casual, everyday English. Never formal or academic.
- NEVER break character. You are Emily, not a teacher.
`,
  },
  cafe: {
    name: "Jennifer",
    instructions: `
You are Jennifer, a warm barista at a cozy cafe in Seattle, USA.
- First message: greet warmly and introduce yourself ("Hi! Welcome. I'm Jennifer. What can I get you today?")
- Hand them a menu, ask about their order, preferences, sizes.
- Use real cafe vocabulary: "For here or to go?", "Would you like anything else?", "That'll be $X".
- NEVER break character. You are Jennifer, not a teacher.
`,
  },
  coworker: {
    name: "Amanda",
    instructions: `
You are Amanda, a friendly coworker at a company in New York, USA.
- First message: greet warmly and introduce yourself ("Hey! I'm Amanda. How's it going?")
- Make natural office small talk: weekends, weather, projects, coffee.
- Share a bit about your own weekend or work.
- Keep it light, casual.
- NEVER break character. You are Amanda, not a teacher.
`,
  },
  classmate: {
    name: "Rachel",
    instructions: `
You are Rachel, a friendly university student in Boston, USA.
- First message: greet warmly and introduce yourself ("Hi! I'm Rachel. Are you in this class too?")
- Ask about their major, where they are from, what they think of the class.
- Keep it casual and young.
- NEVER break character. You are Rachel, not a teacher.
`,
  },
  party: {
    name: "Sofia",
    instructions: `
You are Sofia, a friendly guest at a party in Los Angeles, USA.
- First message: greet warmly and introduce yourself ("Hey! I'm Sofia. How do you know the host?")
- Ask how they know the host, what they do for fun, what music or food they like.
- Keep it light, casual, with a bit of humor if the student is receptive.
- NEVER break character. You are Sofia, not a teacher.
`,
  },
  free: {
    name: "AURIX",
    instructions: `
You are AURIX in FREE MODE. The student wants total freedom to talk about ANYTHING.
- NEVER suggest topics. Wait for the student to bring up what they want.
- Follow their lead completely, with warmth and curiosity.
- If they are quiet, gently ask "What's on your mind?" or "What would you like to talk about?"
- Do not impose any role or context.
`,
  },
};

// --- OpenAI-compatible endpoints ---

const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || "https://ollama.teclingoingles.com").replace(/\/+$/, "");
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2:1b";
const OMNIROUTE_BASE_URL = (process.env.OMNIROUTE_BASE_URL || "http://192.168.0.15:20128").replace(/\/+$/, "");
const OMNIROUTE_MODEL = process.env.OMNIROUTE_MODEL || "gpt-4o-mini";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = process.env.GROQ_CHAT_MODEL || process.env.GROQ_MODEL || "llama-3.1-8b-instant";

async function callOpenAICompatible(opts: {
  baseUrl: string;
  apiKey: string;
  model: string;
  system: string;
  user: string;
  json?: boolean;
  temperature?: number;
  label?: string;
}): Promise<string> {
  const res = await fetch(`${opts.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      temperature: opts.temperature ?? 0.7,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`${opts.label || "API"} error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || "";
  if (!content) throw new Error(`${opts.label || "API"} returned an empty response.`);
  return content;
}

async function callOllama(opts: {
  system: string;
  user: string;
  temperature?: number;
  numPredict?: number;
  json?: boolean;
}): Promise<string> {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      stream: false,
      keep_alive: "24h",
      // CRÍTICO: `format: "json"` fuerza al modelo a devolver JSON válido.
      // Sin esto, llama3.2:1b agrega prosa alrededor del JSON y rompe el parseo.
      ...(opts.json ? { format: "json" } : {}),
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      options: {
        temperature: opts.temperature ?? 0.7,
        num_predict: opts.numPredict ?? 400,
        num_ctx: 2048,
        top_k: 40,
        top_p: 0.9,
        repeat_penalty: 1.1,
      },
    }),
  });
  if (!res.ok) throw new Error(`Ollama error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const content = data?.message?.content || "";
  if (!content) throw new Error("Ollama returned an empty response.");
  return content;
}

async function callGroq(opts: { system: string; user: string; json?: boolean; temperature?: number }): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY environment variable is missing.");
  return callOpenAICompatible({
    baseUrl: "https://api.groq.com/openai",
    apiKey,
    model: GROQ_MODEL,
    label: "Groq API",
    ...opts,
  });
}

async function callOmniRoute(opts: { system: string; user: string; temperature?: number }): Promise<string> {
  const apiKey = process.env.OMNIROUTE_API_KEY;
  if (!apiKey) throw new Error("OMNIROUTE_API_KEY environment variable is missing.");
  return callOpenAICompatible({
    baseUrl: OMNIROUTE_BASE_URL,
    apiKey,
    model: OMNIROUTE_MODEL,
    label: "OmniRoute API",
    ...opts,
  });
}

const REPLY_SCHEMA = {
  type: "OBJECT",
  properties: {
    english: { type: "STRING" },
    spanish: { type: "STRING" },
    hints: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { en: { type: "STRING" }, es: { type: "STRING" } },
        required: ["en", "es"],
      },
    },
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
  role?: FreeTalkRole;
}) => {
  const studentName = opts.nickname || "friend";
  const isNative = opts.level === "native" || !opts.min || !opts.max;
  const role = opts.role || "friend";
  const persona = ROLE_PERSONAS[role] || ROLE_PERSONAS.friend;
  const personaName = persona.name;

  const wordRule = isNative
    ? `- NO word limit: reply naturally, like a normal native speaker, at a relaxed pace (2-4 sentences).`
    : `- ABSOLUTE WORD LIMIT (CRITICAL): your "english" field MUST contain EXACTLY between ${opts.min} and ${opts.max} words. Count every single word BEFORE responding. If your sentence is longer, DELETE words until it fits. If it's shorter, ADD words. NEVER break this limit.
  Examples for level ${opts.level} (${opts.min}-${opts.max} words):
  ✓ VALID: "Hi! How are you?" (4 words)
  ✓ VALID: "That's cool! Tell me more." (5 words)
  ✗ INVALID (too long): "Hi there! How are you doing today my friend?" (9 words)
  ✗ INVALID (too short): "Hi!" (1 word)`;

  return `
Your persona name is "${personaName}". The student's name is ${studentName}.
- ALWAYS address the student by their name "${studentName}" often and naturally.
- NEVER call the student "friend", "buddy", "pal" or "amigo". The word "friend" is FORBIDDEN as a form of address.

[PERSONALITY]
- Speak only English. Use simple, natural, friendly English suited to a learner.
- Never give grammar lessons, never correct, never explain rules, never lecture.
- Just converse like a real person who is genuinely curious about the student.
- FORBIDDEN PHRASES: "Sounds nice", "Tell me more", "That's interesting", "That sounds good". These are BANNED. Always react with SPECIFIC content related to what the student just said.

[HARD RULES]
- The "english" field must be 100% in English.
- If the student writes in Spanish, gently invite them to try it in English.
- You always take the first step when a conversation starts.
- Ask open, friendly questions ("What...?", "How...?", "Tell me about...").
- Adapt the difficulty of your words to a low level.
- When the student mentions a topic (music, food, travel, work, family, movies, sports), react with a SPECIFIC comment about that exact topic: mention an artist, a dish, a place, an example. Then ask ONE relevant follow-up question.
${opts.resume ? `- The student is returning from a previous session. Warmly acknowledge it.` : ""}

${wordRule}

${persona.instructions}

[REPLY HINTS - CRITICAL]
In addition to "english" and "spanish", you MUST return a "hints" array with EXACTLY 4 short English phrases the student could say as their NEXT reply, EACH WITH ITS SPANISH TRANSLATION.
- Each hint MUST be 3 to 6 words long in English.
- Each hint MUST be directly related to what YOU just said.
- The 4 hints MUST follow this structure: 2 AFFIRMATIONS, 1 QUESTION, 1 OPINION or INVITATION.
- All hints MUST be in FIRST PERSON, as if the STUDENT is saying them.
- NEVER repeat the same hint.
- The "hints" array MUST contain 4 OBJECTS, each with "en" and "es" keys.
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
  role: FreeTalkRole;
}) {
  const instruction = buildFreeTalkInstructions(opts);
  const strict = opts.extraStrict && opts.min && opts.max
    ? `\n\nEXTREMELY IMPORTANT: your previous attempt broke the sacred word limit. This time the "english" field MUST contain between ${opts.min} and ${opts.max} words.`
    : "";

  const parseReply = (raw: string): { english: string; spanish: string; hints: { en: string; es: string }[] } => {
    const trimmed = (raw || "").trim();
    let parsed: any = null;
    try { parsed = JSON.parse(trimmed); } catch { parsed = null; }
    const rawHints = parsed && Array.isArray(parsed.hints) ? parsed.hints : [];
    const hints = rawHints
      .filter((h: any) => h && typeof h === "object" && typeof h.en === "string" && h.en.trim().length > 0)
      .map((h: any) => ({ en: String(h.en).trim(), es: String(h.es || "").trim() }))
      .slice(0, 4);
    return {
      english: (parsed && typeof parsed.english === "string" ? parsed.english : trimmed).trim(),
      spanish: (parsed && typeof parsed.spanish === "string" ? parsed.spanish : "").trim(),
      hints,
    };
  };

  // Calcular tokens según nivel
  const levelRule = LEVEL_RULES[opts.level];
  const numPredict = levelRule?.numPredict ?? 400;

  // 0) PRIMARY: Ollama local
  try {
    const historyText = opts.history.slice(-6).map((h) => `${h.role === "user" ? "Student" : "You"}: ${h.text}`).join("\n");
    const raw = await callOllama({
      system: instruction + strict,
      user: `Conversation so far:\n${historyText}\n\nStudent's latest message: "${opts.user_input}"\n\nReply. Respond ONLY with JSON: {"english": "...", "spanish": "traducción al español de english", "hints": [{"en": "...", "es": "..."}, {"en": "...", "es": "..."}, {"en": "...", "es": "..."}, {"en": "...", "es": "..."}]}`,
      temperature: 0.7,
      numPredict,
      json: true,
    });
    return { ...parseReply(raw), model: `ollama/${OLLAMA_MODEL}` };
  } catch (err: any) {
    console.warn("[FreeTalk] Ollama failed, switching to Groq:", err?.message || err);
  }

  // 1) BACKUP: Groq
  if (process.env.GROQ_API_KEY) {
    try {
      const historyText = opts.history.slice(-6).map((h) => `${h.role === "user" ? "Student" : "You"}: ${h.text}`).join("\n");
      const raw = await callGroq({
        system: instruction + strict,
        user: `Conversation so far:\n${historyText}\n\nStudent's latest message: "${opts.user_input}"\n\nReply. Respond ONLY with JSON: {"english": "...", "spanish": "...", "hints": [{"en": "...", "es": "..."}, {"en": "...", "es": "..."}, {"en": "...", "es": "..."}, {"en": "...", "es": "..."}]}`,
        json: true,
        temperature: 0.7,
      });
      return { ...parseReply(raw), model: GROQ_MODEL };
    } catch (err: any) {
      console.warn("[FreeTalk] Groq failed, switching to Gemini:", err?.message || err);
    }
  }

  // 2) BACKUP: Gemini
  if (process.env.GEMINI_API_KEY) {
    try {
      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash-exp",
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
      return { ...parseReply(response.text || ""), model: "gemini-2.0-flash-exp" };
    } catch (err: any) {
      console.warn("[FreeTalk] Gemini fallback failed:", err?.message || err);
    }
  }

  // 3) BACKUP: OmniRoute
  if (process.env.OMNIROUTE_API_KEY) {
    try {
      const historyText = opts.history.slice(-6).map((h) => `${h.role === "user" ? "Student" : "You"}: ${h.text}`).join("\n");
      const raw = await callOmniRoute({
        system: instruction + strict,
        user: `Conversation so far:\n${historyText}\n\nStudent's latest message: "${opts.user_input}"\n\nReply. Respond ONLY with JSON: {"english": "...", "spanish": "...", "hints": [{"en": "...", "es": "..."}, {"en": "...", "es": "..."}, {"en": "...", "es": "..."}, {"en": "...", "es": "..."}]}`,
        temperature: 0.7,
      });
      return { ...parseReply(raw), model: `omniroute/${OMNIROUTE_MODEL}` };
    } catch (err: any) {
      console.warn("[FreeTalk] OmniRoute failed:", err?.message || err);
    }
  }

  return { english: "", spanish: "", hints: [], model: "simulation-fallback" };
}

async function translateToSpanish(text: string): Promise<string> {
  // Ollama primero (rápido, local)
  try {
    const out = await callOllama({
      system: "You are a warm, natural translator into Latin American Spanish.",
      user: `Translate to natural, warm Spanish. Only the translation: "${text}"`,
      temperature: 0.2,
      numPredict: 200,
    });
    return out.trim();
  } catch (err: any) {
    console.warn("[FreeTalk] Ollama translate failed, switching to Groq:", err?.message || err);
  }
  // Groq fallback
  if (process.env.GROQ_API_KEY) {
    try {
      const out = await callGroq({
        system: "You are a warm, natural translator into Latin American Spanish.",
        user: `Translate to natural, warm Spanish. Only the translation: "${text}"`,
        temperature: 0.2,
      });
      return out.trim();
    } catch (err: any) {
      console.warn("[FreeTalk] Groq translate failed:", err?.message || err);
    }
  }
  return "";
}

// --- ADN Profile GET/POST ---

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
  res.json({ status: "success", profile: activeStudentProfile });
});

// --- Tutor Chat Endpoint ---

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
    const role = (req.body.role || "friend") as FreeTalkRole;
    const rule = LEVEL_RULES[level];
    const isNative = level === "native" || !rule;
    const min = isNative ? null : rule.min;
    const max = isNative ? null : rule.max;

    const sendReply = (english: string, spanish: string, model: string, hints: { en: string; es: string }[] = []) => {
      const persona = ROLE_PERSONAS[role] || ROLE_PERSONAS.friend;
      res.json({
        reply: english,
        response: english,
        spanish,
        reply_hints: hints,
        word_count: countWords(english),
        level,
        role,
        persona_name: persona.name,
        min,
        max,
        status: "success",
        timestamp: new Date().toISOString(),
        model,
      });
    };

    let result = await generateFriendReply({
      history: history || [],
      user_input: inputPrompt,
      level,
      nickname,
      resume,
      min,
      max,
      extraStrict: false,
      role,
    });

    if (!result.english) {
      // Fallback natural (no genérico) — solo se dispara si TODOS los modelos fallan.
      const name = nickname || "friend";
      const byName = name ? ", " + name : "";
      const fallbacks: Record<string, { en: string; es: string }> = {
        "1": { en: "Oh really?", es: "¿Ah, sí?" },
        "2": { en: "Oh, that's cool" + byName + "!", es: "¡Oh, qué padre" + byName + "!" },
        "native": { en: "Oh wow, that's interesting" + byName + "! What happened next?", es: "¡Oh, wow, qué interesante" + byName + "! ¿Y qué pasó después?" },
      };
      const fb = fallbacks[level] || fallbacks["1"];
      sendReply(fb.en, fb.es, "simulation-fallback", []);
      return;
    }

    // NO reintentos: si la primera respuesta excede el límite, se trunca.
    // Antes hacíamos hasta 2 reintentos (cada uno ~8s con llama3.2:3b), sumando 24s de latencia.
    // Ahora confiamos en el prompt reforzado + numPredict calibrado, y truncamos como red de seguridad.

    if (!isNative && countWords(result.english) > (rule?.max ?? Infinity)) {
      result.english = truncateToMax(result.english, rule?.max ?? Infinity);
    }

    // NO llamamos a translateToSpanish — el modelo ya devuelve "spanish" en el JSON.
    // Esto elimina una segunda llamada a Ollama (~2-3s de latencia).

    sendReply(result.english, result.spanish, result.model, result.hints || []);
  } catch (error: any) {
    console.error("Free Conversation API Error:", error);
    res.status(500).json({
      error: "Error en el chat de conversación libre.",
      message: error?.message || "Unknown error",
    });
  }
});

// --- Summary generator ---

app.post("/api/tutor/summarize", async (req, res) => {
  try {
    const { history, nickname } = req.body;
    const turns = (history || []).map((h: { role: string; content?: string; text?: string }) => ({
      role: h.role === "user" ? "user" : "model",
      parts: [{ text: h.content || h.text || "" }],
    }));
    const summaryPrompt = `Write a short session summary of this English conversation${nickname ? " with " + nickname : ""}. Return JSON: summary_en (2-3 warm sentences in English) and summary_es (2-3 warm sentences in Spanish).`;
    const fallbackSummary = () => ({
      summary_en: "We had a friendly conversation in English.",
      summary_es: "Tuvimos una conversación amistosa en inglés.",
      status: "success",
      model: "simulation-fallback",
    });
    const parseSummary = (raw: string): { summary_en: string; summary_es: string } => {
      let parsed: any = null;
      try { parsed = JSON.parse(raw); } catch { parsed = null; }
      return {
        summary_en: parsed?.summary_en || "We had a good conversation.",
        summary_es: parsed?.summary_es || "Tuvimos una buena conversación.",
      };
    };
    // Ollama primero
    try {
      const conversation = (history || []).map((h: { role: string; content?: string; text?: string }) => `${h.role === "user" ? "Student" : "You"}: ${h.content || h.text || ""}`).join("\n");
      const raw = await callOllama({
        system: "You write warm, concise session summaries for an English learning app.",
        user: `Conversation:\n${conversation}\n\n${summaryPrompt}\n\nRespond ONLY with JSON: {"summary_en": "...", "summary_es": "..."}`,
        temperature: 0.4,
        numPredict: 300,
        json: true,
      });
      res.json({ ...parseSummary(raw), status: "success", model: `ollama/${OLLAMA_MODEL}` });
      return;
    } catch (err: any) {
      console.warn("[Summarize] Ollama failed, switching to Groq:", err?.message || err);
    }
    // Groq fallback
    if (process.env.GROQ_API_KEY) {
      try {
        const conversation = (history || []).map((h: { role: string; content?: string; text?: string }) => `${h.role === "user" ? "Student" : "You"}: ${h.content || h.text || ""}`).join("\n");
        const raw = await callGroq({
          system: "You write warm, concise session summaries for an English learning app.",
          user: `Conversation:\n${conversation}\n\n${summaryPrompt}\n\nRespond ONLY with JSON: {"summary_en": "...", "summary_es": "..."}`,
          json: true,
          temperature: 0.4,
        });
        res.json({ ...parseSummary(raw), status: "success", model: GROQ_MODEL });
        return;
      } catch (err: any) {
        console.warn("[Summarize] Groq failed:", err?.message || err);
      }
    }
    res.json(fallbackSummary());
  } catch (error: any) {
    console.error("Summarize API Error:", error);
    res.status(500).json({ error: "No se pudo generar el resumen.", message: error?.message || "Unknown error" });
  }
});

// --- Health check ---

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ONLINE",
    timestamp: new Date().toISOString(),
    apiKeyAvailable: Boolean(process.env.GEMINI_API_KEY),
    groqKeyAvailable: Boolean(process.env.GROQ_API_KEY),
    omniRouteKeyAvailable: Boolean(process.env.OMNIROUTE_API_KEY),
    ollamaBaseUrl: OLLAMA_BASE_URL,
    ollamaModel: OLLAMA_MODEL,
    groqModel: GROQ_MODEL,
  });
});

export default app;