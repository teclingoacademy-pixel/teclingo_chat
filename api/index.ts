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
const LEVEL_RULES: Record<string, { min: number; max: number; numPredict: number }> = {
  "1": { min: 3, max: 5, numPredict: 300 },
  "2": { min: 4, max: 7, numPredict: 300 },
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

// ═══════════════════════════════════════════════════════════════════
// GUIONES SEMI-DIRIGIDOS POR ROL (FIX 2026-10-05)
// ═══════════════════════════════════════════════════════════════════
// Motivación: llama3.2:1b no sostiene conversación abierta por más de
// 3-4 turnos. Improvisa, repite, alucina. Solución: banco acotado de
// preguntas + respuestas contextualizadas por rol y etapa. El modelo
// solo ELIGE, no inventa.
// ═══════════════════════════════════════════════════════════════════

type ConversationStage = "opening" | "development" | "closing";

interface ReplyHint {
  en: string;
  es: string;
}

interface ScriptQuestion {
  question: string;
  question_es: string;
  triggers: string[];
  follow_ups: string[];
  hints: ReplyHint[];
}

interface ScriptStage {
  turnRange: [number, number];
  questions: ScriptQuestion[];
}

interface RoleScript {
  persona: string;
  situation: string;
  tone: string;
  stages: {
    opening: ScriptStage;
    development: ScriptStage;
    closing: ScriptStage;
  };
}

// SOFIA — Fiesta en Los Ángeles (role: party)
const SOFIA_SCRIPT: RoleScript = {
  persona: "Sofia",
  situation: "You are Sofia, a friendly guest at a house party in Los Angeles, USA. The student just walked in and you're both standing near the kitchen.",
  tone: "Warm, casual, playful. You use contractions. You're genuinely curious about the student.",
  stages: {
    opening: {
      turnRange: [0, 2],
      questions: [
        {
          question: "Hi! I'm Sofia. What's your name?",
          question_es: "¡Hola! Soy Sofia. ¿Cómo te llamas?",
          triggers: ["hello", "hi", "hey", "start", "name"],
          follow_ups: ["Nice to meet you!", "Cool name!", "Great to meet you."],
          hints: [
            { en: "I'm Alex.", es: "Soy Alex." },
            { en: "Nice to meet you.", es: "Mucho gusto." },
            { en: "My name is Ana.", es: "Mi nombre es Ana." },
            { en: "Hi Sofia!", es: "¡Hola Sofia!" },
          ],
        },
        {
          question: "How do you know the host?",
          question_es: "¿De qué conoces al anfitrión?",
          triggers: ["friend", "host", "know", "party"],
          follow_ups: ["Oh cool, me too!", "Nice! I met him at work.", "That's awesome!"],
          hints: [
            { en: "We work together.", es: "Trabajamos juntos." },
            { en: "We're old friends.", es: "Somos viejos amigos." },
            { en: "From college.", es: "De la universidad." },
            { en: "I don't know him.", es: "No lo conozco." },
          ],
        },
        {
          question: "Are you enjoying the party?",
          question_es: "¿Estás disfrutando la fiesta?",
          triggers: ["party", "fun", "enjoy", "music"],
          follow_ups: ["Me too! The music is great.", "Yeah, everyone is so friendly.", "I love the vibe here."],
          hints: [
            { en: "Yes, it's great!", es: "¡Sí, está genial!" },
            { en: "It's a bit loud.", es: "Está un poco ruidoso." },
            { en: "I just arrived.", es: "Acabo de llegar." },
            { en: "The music rocks!", es: "¡La música es genial!" },
          ],
        },
        {
          question: "Where are you from?",
          question_es: "¿De dónde eres?",
          triggers: ["from", "country", "city", "live"],
          follow_ups: ["Oh nice, I've heard great things!", "Cool! I'm from California.", "That's far!"],
          hints: [
            { en: "I'm from Mexico.", es: "Soy de México." },
            { en: "I live nearby.", es: "Vivo cerca." },
            { en: "From Dallas.", es: "De Dallas." },
            { en: "I'm local.", es: "Soy de aquí." },
          ],
        },
        {
          question: "What do you do for a living?",
          question_es: "¿A qué te dedicas?",
          triggers: ["work", "job", "do", "study"],
          follow_ups: ["That sounds interesting!", "Oh cool, I'm in marketing.", "Nice! I work in tech."],
          hints: [
            { en: "I'm a student.", es: "Soy estudiante." },
            { en: "I work in tech.", es: "Trabajo en tecnología." },
            { en: "I'm a teacher.", es: "Soy maestro." },
            { en: "I'm between jobs.", es: "Estoy sin trabajo." },
          ],
        },
      ],
    },
    development: {
      turnRange: [3, 6],
      questions: [
        {
          question: "What kind of music do you like?",
          question_es: "¿Qué tipo de música te gusta?",
          triggers: ["music", "song", "listen", "band"],
          follow_ups: ["Oh, I love that too!", "I'm more into pop.", "Nice taste!"],
          hints: [
            { en: "I love rock.", es: "Me encanta el rock." },
            { en: "Pop music.", es: "Música pop." },
            { en: "I like everything.", es: "Me gusta todo." },
            { en: "Jazz, mostly.", es: "Jazz, sobre todo." },
          ],
        },
        {
          question: "Do you have any hobbies?",
          question_es: "¿Tienes algún pasatiempo?",
          triggers: ["hobby", "hobbies", "free time", "fun"],
          follow_ups: ["That's a cool hobby!", "I should try that.", "I love that too!"],
          hints: [
            { en: "I love reading.", es: "Me encanta leer." },
            { en: "I play soccer.", es: "Juego fútbol." },
            { en: "I cook a lot.", es: "Cocino mucho." },
            { en: "I travel often.", es: "Viajo seguido." },
          ],
        },
        {
          question: "Have you tried the food yet?",
          question_es: "¿Ya probaste la comida?",
          triggers: ["food", "eat", "hungry", "tried"],
          follow_ups: ["The tacos are amazing!", "You have to try the guacamole.", "The pizza is so good!"],
          hints: [
            { en: "Not yet, I will.", es: "Aún no, lo haré." },
            { en: "It's delicious!", es: "¡Está delicioso!" },
            { en: "I'm vegetarian.", es: "Soy vegetariano." },
            { en: "I love the tacos.", es: "Me encantan los tacos." },
          ],
        },
        {
          question: "Are you here with friends?",
          question_es: "¿Viniste con amigos?",
          triggers: ["friend", "friends", "alone", "with"],
          follow_ups: ["That's nice!", "Same here!", "Oh, I came alone too."],
          hints: [
            { en: "Yes, with two friends.", es: "Sí, con dos amigos." },
            { en: "I came alone.", es: "Vine solo." },
            { en: "With my brother.", es: "Con mi hermano." },
            { en: "Just me tonight.", es: "Solo yo esta noche." },
          ],
        },
        {
          question: "What do you do on weekends?",
          question_es: "¿Qué haces los fines de semana?",
          triggers: ["weekend", "saturday", "sunday", "do"],
          follow_ups: ["That sounds relaxing!", "I love that too!", "Nice! I usually hike."],
          hints: [
            { en: "I relax at home.", es: "Descanso en casa." },
            { en: "I go hiking.", es: "Voy a caminar." },
            { en: "I see my family.", es: "Veo a mi familia." },
            { en: "I study English.", es: "Estudio inglés." },
          ],
        },
        {
          question: "Do you like living here?",
          question_es: "¿Te gusta vivir aquí?",
          triggers: ["live", "living", "city", "here"],
          follow_ups: ["I love it here!", "Yeah, it's a great city.", "Same! I never want to leave."],
          hints: [
            { en: "Yes, I love it.", es: "Sí, me encanta." },
            { en: "It's too busy.", es: "Es muy ajetreado." },
            { en: "It's okay.", es: "Está bien." },
            { en: "I prefer my hometown.", es: "Prefiero mi ciudad." },
          ],
        },
      ],
    },
    closing: {
      turnRange: [7, 999],
      questions: [
        {
          question: "Want to grab a drink later?",
          question_es: "¿Quieres tomar algo después?",
          triggers: ["drink", "later", "leave", "go"],
          follow_ups: ["Great! See you in a bit.", "Cool, let's do it!", "Awesome!"],
          hints: [
            { en: "Sure, sounds fun!", es: "¡Claro, suena bien!" },
            { en: "Maybe another time.", es: "Quizás otra vez." },
            { en: "I have to go soon.", es: "Tengo que irme pronto." },
            { en: "Yes, let's go!", es: "¡Sí, vamos!" },
          ],
        },
        {
          question: "It was really nice meeting you!",
          question_es: "¡Fue un placer conocerte!",
          triggers: ["nice", "meet", "goodbye", "bye"],
          follow_ups: ["Take care!", "See you soon!", "Have a great night!"],
          hints: [
            { en: "You too! Take care.", es: "¡Igualmente! Cuídate." },
            { en: "See you soon.", es: "Nos vemos pronto." },
            { en: "Have a great night!", es: "¡Que tengas buena noche!" },
            { en: "Bye Sofia!", es: "¡Adiós Sofia!" },
          ],
        },
      ],
    },
  },
};

// JENNIFER — Barista en un café de Seattle (role: cafe)
const JENNIFER_SCRIPT: RoleScript = {
  persona: "Jennifer",
  situation: "You are Jennifer, a warm barista at a cozy cafe in Seattle, USA. The student just walked up to the counter to order.",
  tone: "Friendly, efficient, warm. You use real cafe vocabulary. You smile a lot.",
  stages: {
    opening: {
      turnRange: [0, 2],
      questions: [
        {
          question: "Hi! Welcome. What can I get you today?",
          question_es: "¡Hola! Bienvenido. ¿Qué te preparo hoy?",
          triggers: ["hello", "hi", "order", "coffee"],
          follow_ups: ["Great choice!", "Coming right up.", "Sure thing!"],
          hints: [
            { en: "A coffee, please.", es: "Un café, por favor." },
            { en: "A cappuccino.", es: "Un capuchino." },
            { en: "What do you recommend?", es: "¿Qué recomiendas?" },
            { en: "Just water, thanks.", es: "Solo agua, gracias." },
          ],
        },
        {
          question: "For here or to go?",
          question_es: "¿Para tomar aquí o para llevar?",
          triggers: ["here", "go", "takeaway", "drink"],
          follow_ups: ["Perfect.", "Got it.", "Sure!"],
          hints: [
            { en: "For here, please.", es: "Aquí, por favor." },
            { en: "To go, please.", es: "Para llevar, por favor." },
            { en: "I'll stay.", es: "Me quedo." },
            { en: "Takeaway.", es: "Para llevar." },
          ],
        },
      ],
    },
    development: {
      turnRange: [3, 6],
      questions: [
        {
          question: "Would you like anything else?",
          question_es: "¿Quieres algo más?",
          triggers: ["else", "more", "extra", "food"],
          follow_ups: ["Sure, anything else?", "Got it.", "Coming right up."],
          hints: [
            { en: "A croissant, please.", es: "Un croissant, por favor." },
            { en: "No, that's all.", es: "No, eso es todo." },
            { en: "A muffin, please.", es: "Un panquecito, por favor." },
            { en: "Just the coffee.", es: "Solo el café." },
          ],
        },
        {
          question: "Do you want it small, medium, or large?",
          question_es: "¿Lo quieres chico, mediano o grande?",
          triggers: ["size", "small", "medium", "large"],
          follow_ups: ["Great choice.", "Coming right up.", "Sure!"],
          hints: [
            { en: "Medium, please.", es: "Mediano, por favor." },
            { en: "Small is fine.", es: "Chico está bien." },
            { en: "Large, please.", es: "Grande, por favor." },
            { en: "Whatever you suggest.", es: "Lo que sugieras." },
          ],
        },
        {
          question: "Anything to drink with that?",
          question_es: "¿Algo de tomar con eso?",
          triggers: ["drink", "juice", "water", "tea"],
          follow_ups: ["Good choice!", "We have fresh juice.", "Sure!"],
          hints: [
            { en: "Orange juice, please.", es: "Jugo de naranja, por favor." },
            { en: "Just water, thanks.", es: "Solo agua, gracias." },
            { en: "A tea, please.", es: "Un té, por favor." },
            { en: "No, thank you.", es: "No, gracias." },
          ],
        },
        {
          question: "How do you like your coffee?",
          question_es: "¿Cómo te gusta el café?",
          triggers: ["black", "milk", "sugar", "coffee"],
          follow_ups: ["Got it.", "Perfect.", "Sure!"],
          hints: [
            { en: "With milk, please.", es: "Con leche, por favor." },
            { en: "Black, no sugar.", es: "Solo, sin azúcar." },
            { en: "Extra sugar, please.", es: "Extra azúcar, por favor." },
            { en: "With almond milk.", es: "Con leche de almendra." },
          ],
        },
        {
          question: "Would you like to try our special today?",
          question_es: "¿Quieres probar nuestro especial de hoy?",
          triggers: ["special", "today", "try", "new"],
          follow_ups: ["It's our best seller!", "You'll love it!", "It's delicious!"],
          hints: [
            { en: "Yes, I'll try it.", es: "Sí, lo probaré." },
            { en: "What is it?", es: "¿Qué es?" },
            { en: "Maybe next time.", es: "Quizás la próxima." },
            { en: "No, thanks.", es: "No, gracias." },
          ],
        },
      ],
    },
    closing: {
      turnRange: [7, 999],
      questions: [
        {
          question: "That'll be $8.50. Cash or card?",
          question_es: "Son $8.50. ¿Efectivo o tarjeta?",
          triggers: ["pay", "cash", "card", "total"],
          follow_ups: ["Great.", "Thanks!", "Here's your receipt."],
          hints: [
            { en: "Card, please.", es: "Tarjeta, por favor." },
            { en: "Cash, please.", es: "Efectivo, por favor." },
            { en: "Here you go.", es: "Aquí tienes." },
            { en: "Keep the change.", es: "Quédate con el cambio." },
          ],
        },
        {
          question: "Here's your order. Have a great day!",
          question_es: "Aquí está tu pedido. ¡Que tengas buen día!",
          triggers: ["thanks", "bye", "leave", "order"],
          follow_ups: ["Thanks, you too!", "See you soon!", "Enjoy!"],
          hints: [
            { en: "Thank you so much!", es: "¡Muchas gracias!" },
            { en: "You too, bye!", es: "¡Igualmente, adiós!" },
            { en: "See you soon!", es: "¡Nos vemos pronto!" },
            { en: "Have a great day!", es: "¡Que tengas buen día!" },
          ],
        },
      ],
    },
  },
};

const CONVERSATION_SCRIPTS: Partial<Record<FreeTalkRole, RoleScript>> = {
  party: SOFIA_SCRIPT,
  cafe: JENNIFER_SCRIPT,
};

function getCurrentStage(turnCount: number): ConversationStage {
  if (turnCount <= 2) return "opening";
  if (turnCount <= 6) return "development";
  return "closing";
}

function pickQuestion(
  stage: ScriptStage,
  userInput: string,
  usedQuestions: Set<string>
): ScriptQuestion | null {
  const lower = (userInput || "").toLowerCase();
  const candidates = stage.questions.filter((q) => !usedQuestions.has(q.question));
  if (candidates.length === 0) return null;
  for (const q of candidates) {
    if (q.triggers.some((t) => lower.includes(t.toLowerCase()))) return q;
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function buildStageInstructions(
  script: RoleScript,
  stage: ConversationStage,
  usedQuestions: Set<string>,
  userInput: string
): string {
  const stageData = script.stages[stage];
  const candidates = stageData.questions.filter((q) => !usedQuestions.has(q.question));

  if (candidates.length === 0) {
    return `
[SITUATION] ${script.situation}
[TONE] ${script.tone}
[STAGE] Closing — you've already asked most of your questions. Wrap up the conversation warmly.
[INSTRUCTION] Respond naturally to the student's last message. Do NOT introduce yourself. Do NOT ask one of your previous questions again.
`;
  }

  const questionsBlock = candidates
    .map((q, i) => `${i + 1}. "${q.question}" (ES: "${q.question_es}")`)
    .join("\n");

  const followUpsBlock = candidates
    .map((q) => `For "${q.question}": ${q.follow_ups.map((f) => `"${f}"`).join(" / ")}`)
    .join("\n");

  return `
[SITUATION] ${script.situation}
[TONE] ${script.tone}
[STAGE] ${stage.toUpperCase()} — you are in this stage of the conversation right now.

[INSTRUCTION]
- Read the student's last message: "${userInput}"
- Choose EXACTLY ONE question from the list below that best fits what they said.
- Respond with ONE of the pre-written follow-ups for that question. DO NOT improvise.
- If none of the questions fits, reply naturally and change topic briefly.

[AVAILABLE QUESTIONS FOR THIS STAGE]
${questionsBlock}

[PRE-WRITTEN FOLLOW-UPS - USE ONE]
${followUpsBlock}

[CRITICAL RULES]
- DO NOT introduce yourself again. DO NOT say "Hi, I'm ${script.persona}!".
- Your "english" field MUST be the follow-up you chose, with the student's name if appropriate.
- Your "spanish" field MUST be its natural translation.
- Your "hints" array MUST be the 4 hints of the question you chose (EXACTLY as given, no changes).
`;
}

// ═══════════════════════════════════════════════════════════════════
// BUILD FREE TALK INSTRUCTIONS
// ═══════════════════════════════════════════════════════════════════
const buildFreeTalkInstructions = (opts: {
  level: string;
  nickname: string;
  resume: string | null;
  min: number | null;
  max: number | null;
  role?: FreeTalkRole;
  isFirstTurn: boolean;
  historyLength: number;
  userInput: string;
  usedQuestions: Set<string>;
}) => {
  const studentName = opts.nickname || "friend";
  const isNative = opts.level === "native" || !opts.min || !opts.max;
  const role = opts.role || "friend";
  const persona = ROLE_PERSONAS[role] || ROLE_PERSONAS.friend;
  const personaName = persona.name;

  const script = CONVERSATION_SCRIPTS[role];
  const hasScript = !!script;

  const wordRule = isNative
    ? `- NO word limit: reply naturally, like a normal native speaker (2-4 sentences).`
    : `- ABSOLUTE WORD LIMIT (CRITICAL): your "english" field MUST contain EXACTLY between ${opts.min} and ${opts.max} words. Count every word BEFORE responding.
  - Examples for level ${opts.level} (${opts.min}-${opts.max} words):
    ✓ "Nice to meet you!" (4 words)
    ✓ "That's cool! Where from?" (5 words)
    ✗ "Hi there! How are you doing today my friend?" (9 words)`;

  // Si el rol NO tiene guion (friend, stranger, coworker, classmate, free), usar el prompt abierto.
  if (!hasScript) {
    const personaRule = opts.isFirstTurn
      ? persona.instructions
      : `You are ${personaName} — the SAME person from earlier. DO NOT introduce yourself again. Continue naturally.`;

    return `
Your persona name is "${personaName}". The student's name is ${studentName}.
- ALWAYS address the student by their name "${studentName}" often and naturally.
- NEVER call the student "friend", "buddy", "pal" or "amigo".

[COHERENCE RULES]
- Your response MUST relate to the student's LAST message.
- FORBIDDEN PHRASES: "Sounds nice", "Tell me more", "That's interesting", "Great question", "Good question". React with SPECIFIC content.

[HARD RULES]
- The "english" field must be 100% in English.
- The "spanish" field MUST be the actual translation.
- Ask open, friendly questions.
- When the student mentions a topic, react with a SPECIFIC comment + ONE follow-up question.

${wordRule}

${personaRule}

[REPLY HINTS]
Return a "hints" array with EXACTLY 4 short English phrases the student could say next (3-5 words each), each with its Spanish translation.
`;
  }

  // Si el rol SÍ tiene guion, construir el prompt semi-dirigido.
  const stage = getCurrentStage(opts.historyLength);
  const stageInstructions = buildStageInstructions(script!, stage, opts.usedQuestions, opts.userInput);

  const personaRule = opts.isFirstTurn
    ? `[OPENING] It's the FIRST turn. Greet warmly with: "${script!.stages.opening.questions[0].question}"`
    : `[CONTINUING] You've been talking for ${opts.historyLength} turns. Continue from where you were.`;

  return `
Your persona name is "${script!.persona}". The student's name is ${studentName}.
- NEVER call the student "friend", "buddy", "pal" or "amigo".
- The word "friend" is FORBIDDEN as a form of address.

[HARD RULES]
- The "english" field must be 100% in English.
- The "spanish" field MUST be the actual translation of the "english" field.
- Follow the STAGE INSTRUCTIONS below exactly.

${personaRule}

${stageInstructions}

${wordRule}

[OUTPUT FORMAT - STRICT JSON]
{
  "english": "your chosen follow-up + the student's name if natural",
  "spanish": "traducción natural al español",
  "hints": [
    {"en": "hint 1", "es": "traducción 1"},
    {"en": "hint 2", "es": "traducción 2"},
    {"en": "hint 3", "es": "traducción 3"},
    {"en": "hint 4", "es": "traducción 4"}
  ]
}
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
  const isFirstTurn = opts.history.length === 0;

  // Recolectar las preguntas ya usadas (turnos previos del asistente)
  const usedQuestions = new Set<string>();
  opts.history.forEach((h) => {
    if (h.role === "assistant" && h.text) {
      usedQuestions.add(h.text.trim());
    }
  });

  const instruction = buildFreeTalkInstructions({
    ...opts,
    isFirstTurn,
    historyLength: opts.history.length,
    userInput: opts.user_input,
    usedQuestions,
  });

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

  const levelRule = LEVEL_RULES[opts.level];
  const numPredict = levelRule?.numPredict ?? 400;

  // 0) PRIMARY: Ollama local — solo últimos 6 turnos de historial
  try {
    const historyText = opts.history.slice(-6).map((h) => `${h.role === "user" ? "Student" : "You"}: ${h.text}`).join("\n");
    const raw = await callOllama({
      system: instruction + strict,
      user: `Conversation so far:\n${historyText}\n\nStudent's latest message: "${opts.user_input}"\n\nReply. Respond ONLY with JSON: {"english": "...", "spanish": "...", "hints": [{"en": "...", "es": "..."}, {"en": "...", "es": "..."}, {"en": "...", "es": "..."}, {"en": "...", "es": "..."}]}`,
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
  try {
    const out = await callOllama({
      system: "You are a warm, natural translator into Latin American Spanish.",
      user: `Translate to natural, warm Spanish. Only the translation: "${text}"`,
      temperature: 0.2,
      numPredict: 100,
    });
    return out.trim();
  } catch (err: any) {
    console.warn("[FreeTalk] Ollama translate failed, switching to Groq:", err?.message || err);
  }
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

    const sendReply = (english: string, spanish: string, model: string, hints: { en: string; es: string }[] = [], levelHint?: string) => {
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
        ...(levelHint ? { level_hint: levelHint } : {}),
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

    // Hasta 3 reintentos si la respuesta rompe min o max.
    let attempts = 0;
    while (
      !isNative &&
      (countWords(result.english) > (rule?.max ?? Infinity) || countWords(result.english) < (rule?.min ?? 0)) &&
      attempts < 3
    ) {
      attempts++;
      console.log(`[FreeTalk] Reintento ${attempts}: ${countWords(result.english)} palabras (necesita ${rule?.min}-${rule?.max})`);
      result = await generateFriendReply({
        history: history || [],
        user_input: inputPrompt,
        level,
        nickname,
        resume,
        min,
        max,
        extraStrict: true,
        role,
      });
    }

    // Si la respuesta excede el máximo, se trunca y se añade un hint de nivel.
    let levelHint: string | undefined = undefined;
    if (!isNative && countWords(result.english) > (rule?.max ?? Infinity)) {
      result.english = truncateToMax(result.english, rule?.max ?? Infinity);
      levelHint = "Si quieres que AURIX responda con frases más largas, sube al Nivel 2 o al modo Nativo.";
    }

    // Validar el campo "spanish" del modelo. Si es sospechoso, regenerarlo.
    const isSpanishSuspicious = (s: string, eng: string): boolean => {
      if (!s || s.length < 2) return true;
      if (s.toLowerCase() === eng.toLowerCase()) return true;
      if (!/[aeiouáéíóúñ]/i.test(s)) return true;
      if (s.length > 200) return true;
      return false;
    };
    if (isSpanishSuspicious(result.spanish, result.english)) {
      console.log("[FreeTalk] spanish sospechoso, regenerando:", result.spanish);
      try { result.spanish = await translateToSpanish(result.english); } catch { result.spanish = ""; }
    }

    sendReply(result.english, result.spanish, result.model, result.hints || [], levelHint);
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