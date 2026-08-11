import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  sendFreeTalkMessage,
  generateSessionSummary,
  freeTalkStore,
  LEVEL_LABELS,
  FreeTalkLevel,
  FreeTalkSpeed,
  FreeTalkTurn,
  STORAGE_VERSION,
} from "../services/freeTalkService";
import { Mic, MicOff, Send, AlertTriangle, ShieldAlert, Play, RotateCcw, X, Sparkles } from "lucide-react";

type Phase = "onboarding" | "resume" | "conversation" | "finished" | "off";
const CLOUD_API = "https://script.google.com/macros/s/AKfycbw0VN6XVNz_qdEx6zmAI5YMTPQG7acYcssVqBC4q5WO0vjbXV0H8oHqfbUZWURhIHhE/exec";
const MAIN_APP_URL = "https://aurix-ver1-teclingo.vercel.app/";

function buildKickoff(_name: string): string { return "Hello, AURIX!"; }

const SUGGESTIONS = [
  "Tell me about your day",
  "What do you enjoy doing?",
  "Let's talk about my family",
  "How was your weekend?",
  "What makes you happy?",
  "Tell me about your job",
  "Let's talk about a movie you love",
  "What do you dream about?",
];

function cleanTTS(text: string): string {
  return text
    .replace(/[*_~`#]/g, "")
    .replace(/\n+/g, ". ")
    .trim();
}

let VOICES_CACHE: SpeechSynthesisVoice[] = [];
function refreshVoices() {
  if ("speechSynthesis" in window) {
    VOICES_CACHE = window.speechSynthesis.getVoices();
  }
}
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  refreshVoices();
  window.speechSynthesis.onvoiceschanged = refreshVoices;
}

const EN_NATURAL = [
  "Microsoft Aria Online (Natural)",
  "Microsoft Jenny Online (Natural)",
  "Microsoft Ashley Online (Natural)",
  "Microsoft Andrew Online (Natural)",
  "Google US English",
];
const ES_NATURAL = [
  "Microsoft Jorge Online (Natural)",
  "Microsoft Alvaro Online (Natural)",
  "Microsoft Sabina Online (Natural)",
  "Microsoft Dalia Online (Natural)",
  "Google español de Estados Unidos",
  "Google español",
];

function pickNaturalVoice(lang: string): SpeechSynthesisVoice | null {
  const voices = VOICES_CACHE.length ? VOICES_CACHE : window.speechSynthesis.getVoices();
  const pref = lang.startsWith("es") ? ES_NATURAL : EN_NATURAL;
  for (const name of pref) {
    const v = voices.find((x) => x.name === name);
    if (v) return v;
  }
  const pre = lang.split("-")[0];
  const natural = voices.find((x) => x.lang.startsWith(pre) && /natural/i.test(x.name));
  if (natural) return natural;
  const google = voices.find((x) => x.lang.startsWith(pre) && /google/i.test(x.name));
  if (google) return google;
  const online = voices.find((x) => x.lang.startsWith(pre) && /online/i.test(x.name));
  if (online) return online;
  return voices.find((x) => x.lang.startsWith(pre)) || null;
}

function buildReplyHints(text: string): { en: string; es: string }[] {
  const t = (text || "").trim().toLowerCase();
  const H = (en: string, es: string) => ({ en, es });
  const out: { en: string; es: string }[] = [];
  if (t.includes("pizza") || t.includes("food") || t.includes("eat") || t.includes("hungry")) {
    out.push(H("I love pizza too!", "¡A mí también me encanta la pizza!"));
    out.push(H("What is your favorite food?", "¿Cuál es tu comida favorita?"));
    out.push(H("I prefer pasta.", "Prefiero la pasta."));
  } else if (t.includes("music") || t.includes("song") || t.includes("sing")) {
    out.push(H("I love rock music!", "¡Me encanta el rock!"));
    out.push(H("Who is your favorite singer?", "¿Quién es tu cantante favorito?"));
    out.push(H("I listen to music every day.", "Escucho música todos los días."));
  } else if (t.includes("travel") || t.includes("trip") || t.includes("visit")) {
    out.push(H("I want to visit Europe!", "¡Quiero visitar Europa!"));
    out.push(H("Where did you go?", "¿A dónde fuiste?"));
    out.push(H("I love traveling!", "¡Me encanta viajar!"));
  } else if (t.includes("movie") || t.includes("film") || t.includes("watch")) {
    out.push(H("I like action movies!", "¡Me gustan las películas de acción!"));
    out.push(H("What is your favorite movie?", "¿Cuál es tu película favorita?"));
    out.push(H("I watched it yesterday.", "La vi ayer."));
  } else if (t.includes("family") || t.includes("brother") || t.includes("sister") || t.includes("mother") || t.includes("father")) {
    out.push(H("I have two brothers.", "Tengo dos hermanos."));
    out.push(H("My family is small.", "Mi familia es pequeña."));
    out.push(H("Tell me about your family!", "¡Cuéntame de tu familia!"));
  } else if (t.includes("job") || t.includes("work") || t.includes("teacher") || t.includes("teach")) {
    out.push(H("I am a teacher.", "Soy maestro."));
    out.push(H("I work from home.", "Trabajo desde casa."));
    out.push(H("What do you do?", "¿A qué te dedicas?"));
  } else if (t.includes("tired") || t.includes("sleep") || t.includes("busy")) {
    out.push(H("I had a long day.", "Tuve un día largo."));
    out.push(H("I need some rest.", "Necesito descansar."));
    out.push(H("But I feel better now!", "¡Pero ya me siento mejor!"));
  } else if (t.includes("sport") || t.includes("play") || t.includes("game")) {
    out.push(H("I play soccer!", "¡Juego fútbol!"));
    out.push(H("What is your favorite sport?", "¿Cuál es tu deporte favorito?"));
    out.push(H("I like watching games.", "Me gusta ver partidos."));
  } else if (t.endsWith("?")) {
    const m = t.match(/^(is|are|am|do|does|did|can|will)\b/);
    if (m) {
      const a = m[1];
      const yesMap: Record<string,string> = { is:"Yes, it is!", are:"Yes, I am!", am:"Yes, I am!", do:"Yes, I do!", does:"Yes, it does!", did:"Yes, I did!", can:"Yes, I can!", will:"Yes, I will!" };
      const noMap: Record<string,string>  = { is:"No, it is not!", are:"No, I am not!", am:"No, I am not!", do:"No, I do not!", does:"No, it does not!", did:"No, I did not!", can:"No, I cannot!", will:"No, I will not!" };
      out.push(H(yesMap[a] || "Yes!", "¡Sí!"));
      out.push(H(noMap[a] || "No!", "¡No!"));
      out.push(H("Sometimes!", "¡A veces!"));
    }
  }
  if (out.length === 0) {
    out.push(H("Tell me more!", "¡Cuéntame más!"));
    out.push(H("That is interesting!", "¡Eso es interesante!"));
    out.push(H("Why do you think that?", "¿Por qué piensas eso?"));
  }
  return out.slice(0, 4);
}

function playTransition() {
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(990, ctx.currentTime + 0.25);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch {
    // Ignorar.
  }
}

const MicOrb: React.FC<{
  state: "idle" | "listening" | "processing" | "speaking";
  onClick: () => void;
  title?: string;
}> = ({ state, onClick, title }) => (
  <div className="relative flex items-center justify-center select-none" style={{ width: 190, height: 190 }}>
    <div className="absolute w-[190px] h-[190px] rounded-full bg-gradient-to-r from-[#00f0ff]/30 via-[#4facfe]/25 to-[#7f00ff]/30 blur-3xl" />
    <div
      className={`absolute w-[160px] h-[160px] rounded-full border transition-all duration-500 ${
        state === "listening" ? "border-[#00f0ff]/60 animate-ping opacity-50" : "border-[#00f0ff]/20"
      }`}
    />
    <div className="absolute w-[150px] h-[150px] rounded-full border border-[#7f00ff]/40" />
    <button
      onClick={onClick}
      title={title}
      className="relative w-[130px] h-[130px] rounded-full bg-gradient-to-tr from-[#00f2fe] via-[#4facfe] to-[#7f00ff] p-[2.5px] shadow-[0_0_45px_rgba(0,242,254,0.45)] transition-transform duration-500 group"
    >
      <div className="w-full h-full rounded-full bg-[#0a0c12] flex items-center justify-center overflow-hidden shadow-inner">
        {state === "speaking" ? (
          <div className="flex items-center space-x-1.5">
            <span className="w-1.5 h-5 bg-[#00f0ff] rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-1.5 h-8 bg-[#00f0ff] rounded-full animate-bounce" style={{ animationDelay: "120ms" }} />
            <span className="w-1.5 h-10 bg-[#7f00ff] rounded-full animate-bounce" style={{ animationDelay: "240ms" }} />
            <span className="w-1.5 h-6 bg-[#00f0ff] rounded-full animate-bounce" style={{ animationDelay: "360ms" }} />
          </div>
        ) : state === "processing" ? (
          <Sparkles className="w-8 h-8 text-[#00f0ff] animate-spin" />
        ) : (
          <div
            className={`p-3 rounded-full bg-[#0a0c12]/60 border border-[#00f0ff]/40 group-hover:border-[#00f0ff] transition-all ${
              state === "listening" ? "shadow-[0_0_20px_rgba(0,242,254,0.5)]" : ""
            }`}
          >
            {state === "listening" ? (
              <MicOff className="w-7 h-7 text-[#00f0ff] animate-pulse" />
            ) : (
              <Mic className="w-7 h-7 text-[#00f0ff]" />
            )}
          </div>
        )}
      </div>
    </button>
  </div>
);

export const ConversationChat: React.FC<{ onExit?: () => void }> = ({ onExit }) => {
  const [phase, setPhase] = useState<Phase>("onboarding");
  const [obStep, setObStep] = useState(0);
  const [nickname, setNickname] = useState<string>("");
  const [level, setLevel] = useState<FreeTalkLevel>("1");
  const [speed, setSpeed] = useState<FreeTalkSpeed>("0.7");
  const [messages, setMessages] = useState<FreeTalkTurn[]>([]);
  const [inputText, setInputText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [narratorBusy, setNarratorBusy] = useState(false);
  const [panicOn, setPanicOn] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [listening, setListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [micStatus, setMicStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [finishing, setFinishing] = useState(false);
  const [replyHints, setReplyHints] = useState<{ en: string; es: string }[]>([]);
  const [summary, setSummary] = useState<{ en: string; es: string }>({ en: "", es: "" });
  const [cloudUsers, setCloudUsers] = useState<{ id: string; nickname: string }[]>([]);
  const [cloudTick, setCloudTick] = useState(0);

  const recognitionRef = useRef<any>(null);
  const sendMessageRef = useRef<any>(null);
  const pendingGreetRef = useRef<string>("");
  const lastSummaryRef = useRef<string>("");
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);
  const speechTimerRef = useRef<any>(null);
  const messagesRef = useRef<FreeTalkTurn[]>([]);
  const historyReadyRef = useRef(false);
  const listEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (phase === "conversation") {
      listEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, phase, isProcessing]);

  const stopSpeaking = useCallback(() => {
    if (speechTimerRef.current) {
      clearTimeout(speechTimerRef.current);
      speechTimerRef.current = null;
    }
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    speechRef.current = null;
    setIsSpeaking(false);
    setNarratorBusy(false);
  }, []);

  const speakNow = useCallback(
    (text: string, lang: string, rate: number) => {
      if (!("speechSynthesis" in window)) {
        setNarratorBusy(false);
        return;
      }
      window.speechSynthesis.cancel();
      const clean = cleanTTS(text);
      if (!clean) {
        setNarratorBusy(false);
        return;
      }
      const u = new SpeechSynthesisUtterance(clean);
      u.lang = lang;
      u.rate = rate;
      u.pitch = 1;
      const picked = pickNaturalVoice(lang);
      if (picked) {
        u.voice = picked;
        u.lang = picked.lang;
      }
      console.log("[TTS] voz:", picked ? picked.name : "default del sistema");
      const fallbackMs = Math.min(30000, Math.max(2000, Math.ceil(clean.length / 14) * 1000));
      speechTimerRef.current = setTimeout(() => setNarratorBusy(false), fallbackMs);
      u.onstart = () => {
        setIsSpeaking(true);
        setNarratorBusy(true);
      };
      u.onend = () => {
        setIsSpeaking(false);
        setNarratorBusy(false);
        if (speechTimerRef.current) {
          clearTimeout(speechTimerRef.current);
          speechTimerRef.current = null;
        }
      };
      u.onerror = () => {
        setIsSpeaking(false);
        setNarratorBusy(false);
        if (speechTimerRef.current) {
          clearTimeout(speechTimerRef.current);
          speechTimerRef.current = null;
        }
      };
      speechRef.current = u;
      window.speechSynthesis.speak(u);
    },
    []
  );

  const speakNarrator = useCallback(
    (text: string) => {
      setNarratorBusy(true);
      speakNow(text, "es-MX", 0.95);
    },
    [speakNow]
  );

  const speakFriend = useCallback(
    (text: string) => speakNow(text, "en-US", parseFloat(speed)),
    [speakNow, speed]
  );

  const ensureRecognition = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return null;
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    rec.onstart = () => {
      setListening(true);
      setLiveTranscript("");
    };
    rec.onresult = (event: any) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      setLiveTranscript(final || interim);
      if (final.trim()) {
        setListening(false);
        if (sendMessageRef.current) sendMessageRef.current(final.trim());
      }
    };
    rec.onerror = (e: any) => {
      setListening(false);
      setLiveTranscript("⚠ Error de mic: " + (e && e.error ? String(e.error) : "desconocido"));
    };
    rec.onend = () => {
      setListening(false);
    };
    recognitionRef.current = rec;
    return rec;
  }, []);

  const toggleListening = () => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    const rec = ensureRecognition();
    if (!rec) {
      alert("Tu navegador no soporta reconocimiento de voz. Puedes escribir tus mensajes.");
      return;
    }
    if (listening) {
      try { rec.stop(); } catch (e) {}
      setListening(false);
      return;
    }
    try {
      window.setTimeout(() => { try { rec.start(); } catch (err) { setListening(false); setLiveTranscript("⚠ No se pudo iniciar el microfono"); } }, 350);
      setListening(true);
    } catch (e) {
      setListening(false);
      setLiveTranscript("⚠ No se pudo iniciar el microfono");
    }
  };

  const runMicTest = async () => {
    setMicStatus("testing");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicStatus("ok");
      speakNarrator("¡Perfecto! Tu micrófono funciona muy bien.");
    } catch {
      setMicStatus("fail");
      speakNarrator(
        "No detectamos tu micrófono. Para la mejor experiencia te recomendamos contactar a nuestro equipo para resolverlo. Si continúas sin micrófono, la experiencia de hablar se pierde."
      );
    }
  };

  const sendMessage = useCallback(
    async (text: string, opts?: { silent?: boolean; asStart?: boolean }) => {
      if (isProcessing) return;
      const trimmed = text.trim();
      if (!trimmed) return;

      const current = messagesRef.current;
      const newMessages: FreeTalkTurn[] = opts?.asStart
        ? current
        : [...current, { role: "user", text: trimmed }];
      if (!opts?.asStart) {
        setMessages(newMessages);
      }
      setInputText("");
    setReplyHints([]);
      setLiveTranscript("");
      setIsProcessing(true);

      try {
        const history = (opts?.asStart ? [] : current).map((m) => ({
          role: m.role,
          text: m.text,
        }));
        const resume = freeTalkStore.getSummary().es || undefined;
        const data = await sendFreeTalkMessage(trimmed, history, {
          level,
          nickname,
          resume,
        });
        const assistant: FreeTalkTurn = {
          role: "assistant",
          text: (data.reply || "").replace(/\bfriend\b/gi, (nickname || "friend").trim()),
          spanish: data.spanish || "",
        };
        const next = [...newMessages, assistant];
        setMessages(next);
        freeTalkStore.saveHistory(next);
        historyReadyRef.current = true;
        setPhase("conversation");
      setReplyHints(buildReplyHints(data.reply));
    if (!opts?.silent) {
          speakFriend(data.reply);
        }
      } catch (err: any) {
        const assistant: FreeTalkTurn = {
          role: "assistant",
          text: "Hmm, I didn't catch that. Could you say it again?",
          spanish: "Mmm, no te entendí. ¿Puedes decirlo otra vez?",
        };
        const next = [...newMessages, assistant];
        setMessages(next);
        freeTalkStore.saveHistory(next);
        setPhase("conversation");
      } finally {
        setIsProcessing(false);
      }
    },
    [isProcessing, level, nickname, speakFriend]
  );

  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

  const startFirstMessage = useCallback(async () => {
    if ((phase === "onboarding" || phase === "resume") && narratorBusy) return;
    playTransition();
    setMessages([]);
    historyReadyRef.current = false;
    setPhase("conversation");
    await sendMessage(buildKickoff(nickname), { asStart: true, silent: true });
    const first = messagesRef.current[0];
    if (first) {
      speakFriend(first.text);
    }
  }, [sendMessage, speakFriend, phase, narratorBusy]);

  useEffect(() => {
    if (phase === "onboarding") {
      if (obStep === 0) {
        speakNarrator(
          "¡Hola! Bienvenido a tu espacio de conversación libre en inglés. Aquí practicarás speaking sin gramática, sin reglas y sin calificaciones: solo conversación con un amigo que se adapta a ti. Primero, dime: ¿cómo te llamas?"
        );
      } else if (obStep === 1) {
        speakNarrator(
          "¡Perfecto, " + (nickname || "amigo") + "! Tienes tres controles. Primero: el regulador de palabras, con tres niveles de respuesta, de cortas a largas, y un modo nativo sin filtro. Segundo: el velocímetro de la voz, lento, medio o normal. Y tercero: el botón de pánico: si no entiendes algo, tócalo y verás la traducción al español. Tú controlas todo."
        );
      } else if (obStep === 2) {
        speakNarrator("Probemos tu micrófono. Toca el botón y di una palabra en voz alta.");
      } else if (obStep === 3) {
        speakNarrator(
          "Ajusta los controles a tu gusto: qué tan cortas quieres mis respuestas, y a qué velocidad quieres escucharme. Puedes cambiarlos cuando quieras."
        );
      } else if (obStep === 4) {
        playTransition();
        speakNarrator(
          "¡Todo listo! Para activar el modo conversación, di la frase de inicio en inglés. Después de eso, todo será en inglés."
        );
      }
    } else if (phase === "resume") {
      setNarratorBusy(true);
      const s = freeTalkStore.getSummary();
      const saved = freeTalkStore.loadHistory();
      setMessages(saved);
      historyReadyRef.current = saved.length > 0;
      const name = freeTalkStore.getNickname() || "amigo";
      setNickname(name);
      const resumeText =
        s.es ||
        "La última vez tuvimos una buena conversación en inglés, y me encantó conocerte.";
      setTimeout(() => {
        speakNarrator(
          "¡Hola " +
            name +
            "! Qué gusto verte de nuevo. Recordando nuestra última plática: " +
            cleanTTS(resumeText) +
            " ¿Quieres seguir practicando? Cuando estés listo, di la frase de inicio para activar la conversación en inglés."
        );
      }, 700);
    }
  }, [phase, obStep, speakNarrator]);

  useEffect(() => {
    return () => stopSpeaking();
  }, [stopSpeaking]);

  const finishSession = async () => {
    if (finishing) return;
    setFinishing(true);
    stopSpeaking();
    const history = messagesRef.current.map((m) => ({ role: m.role, text: m.text }));
    let s = { en: "", es: "" };
    try {
      const data = await generateSessionSummary(history, nickname);
      s = { en: data.summary_en, es: data.summary_es };
    } catch {
      s = { en: "We had a nice conversation.", es: "Tuvimos una linda conversación." };
    }
    freeTalkStore.setSummary(s.en, s.es);
    try {
      let uidSum = localStorage.getItem("aurix_cloud_user") || "";
      if (!uidSum) {
        const nm = (nickname || "").trim();
        const known = cloudUsers.find((u) => u.nickname.toLowerCase() === nm.toLowerCase());
        uidSum = known ? known.id : "U-" + Date.now();
        localStorage.setItem("aurix_cloud_user", uidSum);
        try {
          fetch(CLOUD_API, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: "sync", user_id: uidSum, state: { nickname: nm } }) }).catch(() => {});
        } catch (e2) {}
      }
      if (uidSum) {
        fetch(CLOUD_API, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: "saveSummary", user_id: uidSum, summary_en: s.en, summary_es: s.es }) }).catch(() => {});
      }
    } catch (e) {}
    freeTalkStore.markCompleted();
    freeTalkStore.saveHistory(messagesRef.current);
    setSummary(s);
    setFinishing(false);
    setPhase("finished");
    setTimeout(() => {
      speakNarrator(
        "Gracias " +
          (nickname || "amigo") +
          ". Me guardé todo lo que platicamos. Nos vemos muy pronto para seguir conversando."
      );
    }, 600);
  };

  const startNewSession = () => {
    setCloudTick((t) => t + 1);
    freeTalkStore.reset();
    setMessages([]);
    setNickname("");
    setSummary({ en: "", es: "" });
    setLevel("1");
    setSpeed("0.7");
    setMicStatus("idle");
    setObStep(0);
    setPhase("onboarding");
  };

  const handleResetApp = () => {
    setCloudTick((t) => t + 1);
    if (!window.confirm("¿Borrar todo el historial y empezar el protocolo desde el inicio?")) {
      return;
    }
    stopSpeaking();
    try {
      recognitionRef.current?.abort?.();
    } catch {
      // Ignorar.
    }
    recognitionRef.current = null;

    freeTalkStore.reset();
    freeTalkStore.setVersion(STORAGE_VERSION);

    setMessages([]);
    messagesRef.current = [];
    setNickname("");
    setSummary({ en: "", es: "" });
    setLevel("1");
    setSpeed("0.7");
    setMicStatus("idle");
    setPanicOn(false);
    setListening(false);
    setIsProcessing(false);
    setIsSpeaking(false);
    setLiveTranscript("");
    setInputText("");
    setReplyHints([]);
    setObStep(0);
    setPhase("onboarding");
  };

  const sayKickoff = () => {
    if ((phase === "onboarding" || phase === "resume") && narratorBusy) return;
    const rec = ensureRecognition();
    if (!rec) {
      startFirstMessage();
      return;
    }
    toggleListening();
  };

  const isProtocolBlocked =
    (phase === "onboarding" || phase === "resume") && narratorBusy;

  const kickoff = (
    <div className="flex flex-col items-center gap-4 text-center">
      <p className="text-sm text-[#849495] font-code uppercase tracking-widest">
        Frase de inicio
      </p>
      <p className="text-xl md:text-2xl font-geist font-semibold text-white cyan-glow px-4 py-3 rounded-xl border border-[#00f0ff]/40 bg-[#0e0e0e]/80">
        "{buildKickoff(nickname)}"
      </p>
      <div className="flex gap-3">
        <button onClick={sayKickoff} disabled={isProtocolBlocked} className="ft-btn-primary flex items-center gap-2">
          <Mic className="w-4 h-4" /> Decirla
        </button>
        <button onClick={startFirstMessage} disabled={isProtocolBlocked} className="ft-btn-secondary flex items-center gap-2">
          <Play className="w-4 h-4" /> Enviarla
        </button>
      </div>
    </div>
  );

  const renderOnboarding = () => {
    let content: React.ReactNode = null;
    if (obStep === 0) {
      content = (
        <div className="flex flex-col gap-4 max-w-md w-full">
          <h2 className="text-2xl font-geist font-bold text-white">Bienvenido a tu espacio de conversación</h2>
          <p className="text-sm text-[#849495] leading-relaxed">
            Practica <b className="text-white">speaking libre</b> en inglés: sin gramática, sin reglas, sin
            calificaciones. Un amigo virtual que se adapta a tu nivel y se interesa por lo que te importa.
          </p>
          {cloudUsers.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {cloudUsers.map((u) => (
                <button
                  key={u.id}
                  onClick={() => {
                    localStorage.setItem("ft_cloud_user", u.id);
                    freeTalkStore.setNickname(u.nickname);
                    setNickname(u.nickname);
                    setObStep(1);
                  }}
                  disabled={isProtocolBlocked}
                  className="ft-pill"
                >
                  👤 {u.nickname}
                </button>
              ))}
            </div>
          )}
          {cloudUsers.length > 0 && (
            <p className="text-xs text-[#849495]">Toca tu perfil de la base de datos AURIX, o escribe otro nombre abajo.</p>
          )}
          <label className="text-xs text-[#849495] uppercase tracking-widest">¿Cómo te llamas?</label>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Tu nombre / nickname"
            className="ft-input"
          />
          <button
            onClick={() => {
              const name = nickname.trim();
              if (!name) {
                speakNarrator("Dime tu nombre para continuar, por favor.");
                return;
              }
              freeTalkStore.setNickname(name);
              setObStep(1);
            }}
            disabled={isProtocolBlocked}
            className="ft-btn-primary"
          >
            Continuar
          </button>
        </div>
      );
    }
    if (obStep === 1) {
      content = (
        <div className="flex flex-col gap-4 max-w-md w-full">
          <h2 className="text-xl font-geist font-bold text-white">Tus tres controles</h2>
          <div className="ft-card">
            <p className="text-sm text-white font-semibold">🎚 Regulador de palabras</p>
            <p className="text-xs text-[#849495]">
              Mis respuestas serán cortas (3 a 5 palabras), medianas (4 a 8), largas (5 a 10) o nativas sin filtro.
              Tú eliges.
            </p>
          </div>
          <div className="ft-card">
            <p className="text-sm text-white font-semibold">🎛 Velocímetro de la voz</p>
            <p className="text-xs text-[#849495]">
              Escúchame lento (0.5), medio (0.7) o normal (1.0). Nada de anglosajones a toda velocidad.
            </p>
          </div>
          <div className="ft-card">
            <p className="text-sm text-white font-semibold">🚨 Botón de pánico</p>
            <p className="text-xs text-[#849495]">
              Si no entiendes algo, tócalo y verás al instante la traducción al español. Las traducciones siempre
              están ocultas hasta que tú las pidas.
            </p>
          </div>
          <button onClick={() => setObStep(2)} disabled={isProtocolBlocked} className="ft-btn-primary">
            Continuar
          </button>
        </div>
      );
    }
    if (obStep === 2) {
      const canContinue = micStatus === "ok" || micStatus === "fail";
      content = (
        <div className="flex flex-col gap-4 max-w-md w-full">
          <h2 className="text-xl font-geist font-bold text-white">Prueba de micrófono</h2>
          <p className="text-sm text-[#849495]">El micrófono es el corazón de esta experiencia. Vamos a probarlo.</p>
          {micStatus === "idle" || micStatus === "testing" ? (
            <button onClick={runMicTest} disabled={micStatus === "testing" || isProtocolBlocked} className="ft-btn-primary flex items-center justify-center gap-2">
              {micStatus === "testing" ? <ShieldAlert className="w-4 h-4 animate-pulse" /> : <Mic className="w-4 h-4" />}
              {micStatus === "testing" ? "Probando..." : "Probar micrófono"}
            </button>
          ) : micStatus === "ok" ? (
            <div className="ft-card border border-[#00ff88]/40">
              <p className="text-sm text-[#00ff88] font-semibold">✔ Micrófono funcionando</p>
              <p className="text-xs text-[#849495]">Perfecto, estás listo para hablar.</p>
            </div>
          ) : (
            <div className="ft-card border border-amber-400/50">
              <p className="text-sm text-amber-300 font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> No detectamos tu micrófono
              </p>
              <p className="text-xs text-[#849495] leading-relaxed">
                Puede ser un permiso o un problema del dispositivo. <b className="text-white">Recomendamos contactar a nuestro equipo</b>{" "}
                para ayudarte a resolverlo: la experiencia de hablar se pierde sin micrófono.
              </p>
            </div>
          )}
          {micStatus === "fail" && (
            <div className="flex gap-3">
              <button onClick={() => setPhase("finished")} disabled={isProtocolBlocked} className="ft-btn-secondary flex-1">
                Salir
              </button>
              <button onClick={() => setObStep(3)} disabled={isProtocolBlocked} className="ft-btn-primary flex-1">
                Continuar sin micrófono
              </button>
            </div>
          )}
          {canContinue && (
            <button onClick={() => setObStep(3)} disabled={isProtocolBlocked} className="ft-btn-primary">
              Continuar
            </button>
          )}
        </div>
      );
    }
    if (obStep === 3) {
      content = (
        <div className="flex flex-col gap-4 max-w-md w-full">
          <h2 className="text-xl font-geist font-bold text-white">Ajusta tus controles</h2>
          <div>
            <p className="text-xs text-[#849495] uppercase tracking-widest mb-2">Longitud de mis respuestas</p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(LEVEL_LABELS) as FreeTalkLevel[]).map((l) => (
                <button
                  key={l}
                  onClick={() => setLevel(l)}
                  className={`ft-pill ${level === l ? "ft-pill-active" : ""}`}
                >
                  {LEVEL_LABELS[l].label}
                  <span className="block text-[10px] opacity-70">{LEVEL_LABELS[l].range}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-[#849495] uppercase tracking-widest mb-2">Velocidad de la voz</p>
            <div className="flex flex-wrap gap-2">
              {(["0.5", "0.7", "1.0"] as FreeTalkSpeed[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={`ft-pill ${speed === s ? "ft-pill-active" : ""}`}
                >
                  {s === "0.5" ? "Lento · 0.5" : s === "0.7" ? "Medio · 0.7" : "Normal · 1.0"}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={() => {
              freeTalkStore.setLevel(level);
              freeTalkStore.setSpeed(speed);
              freeTalkStore.markReady();
              setObStep(4);
            }}
            disabled={isProtocolBlocked}
            className="ft-btn-primary"
          >
            Continuar
          </button>
        </div>
      );
    }
    if (obStep >= 4) {
    content = (
      <div className="flex flex-col gap-4 max-w-md w-full">
        <h2 className="text-xl font-geist font-bold text-white">¡Todo listo!</h2>
        <p className="text-sm text-[#849495] leading-relaxed">
          Ya conoces los controles y ajustaste tus parámetros. Desde este momento, la conversación es{" "}
          <b className="text-white">100% en inglés</b>. Di la frase de inicio para activar el modo conversación.
        </p>
        {kickoff}
      </div>
    );
    }
    return (
      <div className="flex flex-col items-center gap-5 w-full">
        <MicOrb
          state={listening ? "listening" : micStatus === "testing" ? "processing" : "idle"}
          onClick={() => {
            if (isProtocolBlocked) return;
            if (obStep === 2 && micStatus !== "testing") runMicTest();
            else if (obStep === 4) sayKickoff();
          }}
          title="Toca para hablar"
        />
        {listening && (
          <p className="text-xs text-[#00f0ff] font-code animate-pulse text-center px-4">
            🎤 {liveTranscript || "Escuchando... di la frase de inicio"}
          </p>
        )}
        {content}
      </div>
    );
  };

  const renderResume = () => {
    const s = freeTalkStore.getSummary();
    return (
      <div className="flex flex-col gap-4 max-w-md w-full">
        <h2 className="text-2xl font-geist font-bold text-white">
          ¡Hola de nuevo, {nickname || "amigo"}! 👋
        </h2>
        <div className="ft-card">
          <p className="text-sm text-white font-semibold mb-1">Nuestra última conversación</p>
          <p className="text-sm text-[#849495] leading-relaxed">{s.es || "Platicamos en inglés y me encantó conocerte."}</p>
        </div>
        <p className="text-sm text-[#849495] leading-relaxed">
          ¿Quieres seguir practicando? Di la frase de inicio para retomar la conversación{" "}
          <b className="text-white">en inglés</b>.
        </p>
        {kickoff}
      </div>
    );
  };

  const handleExit = () => {
    stopSpeaking();
    setPhase("off");
    setTimeout(() => speakNarrator("Hasta pronto, " + (nickname || "amigo") + ". Aquí estaré cuando quieras platicar."), 400);
  };

  const renderOff = () => (
    <div className="flex flex-col items-center gap-5 text-center">
      <div className="w-24 h-24 rounded-full border border-white/10 bg-[#0a0c12] flex items-center justify-center">
        <span className="text-3xl">🌙</span>
      </div>
      <h2 className="text-xl font-geist font-bold text-white">AURIX descansa</h2>
      <p className="text-sm text-[#849495] leading-relaxed">Tu conversación quedó guardada en tu perfil. Cuando vuelvas, recordaré nuestra última plática.</p>
      <button onClick={() => setPhase("conversation")} className="ft-btn-primary flex items-center gap-2">⚡ Volver a la conversación</button>
    </div>
  );

  const renderFinished = () => (
    <div className="flex flex-col gap-4 max-w-md w-full">
      <h2 className="text-2xl font-geist font-bold text-white">Conversación guardada 💾</h2>
      <div className="ft-card">
        <p className="text-xs text-[#849495] uppercase tracking-widest mb-1">Resumen (español)</p>
        <p className="text-sm text-white leading-relaxed">{summary.es}</p>
      </div>
      <div className="ft-card">
        <p className="text-xs text-[#849495] uppercase tracking-widest mb-1">Summary (English)</p>
        <p className="text-sm text-white leading-relaxed">{summary.en}</p>
      </div>
      <p className="text-xs text-[#849495]">
        La próxima vez que vengas, el narrador te leerá este resumen y retomaremos donde quedamos.
      </p>
      <div className="flex gap-3">
        <button onClick={() => setPhase("conversation")} className="ft-btn-primary flex-1 flex items-center justify-center gap-2">
          <Mic className="w-4 h-4" /> Volver a la conversación
        </button>
        <button onClick={handleExit} className="ft-btn-secondary flex-1 flex items-center justify-center gap-2">
          🌙 Apagar / Salir
        </button>
        {onExit && (
          <button onClick={onExit} className="ft-btn-secondary">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );

  const renderConversation = () => (
    <div className="flex flex-col h-full w-full max-w-3xl mx-auto gap-3">
      {showControls && (
        <div className="ft-card !py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-[#849495] font-code uppercase tracking-widest">CONTROLES</span>
            <button
              onClick={() => setShowControls(false)}
              className="ft-pill !px-2 !py-1 text-[10px]"
              title="Ocultar controles"
            >
              ✕ Cerrar
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {(Object.keys(LEVEL_LABELS) as FreeTalkLevel[]).map((l) => (
              <button
                key={l}
                onClick={() => {
                  setLevel(l);
                  freeTalkStore.setLevel(l);
                }}
                className={`ft-pill !px-2 !py-1 text-[10px] ${level === l ? "ft-pill-active" : ""}`}
                title={LEVEL_LABELS[l].range}
              >
                {LEVEL_LABELS[l].label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {(["0.5", "0.7", "1.0"] as FreeTalkSpeed[]).map((s) => (
              <button
                key={s}
                onClick={() => {
                  setSpeed(s);
                  freeTalkStore.setSpeed(s);
                }}
                className={`ft-pill !px-2 !py-1 text-[10px] ${speed === s ? "ft-pill-active" : ""}`}
              >
                {s === "0.5" ? "🐢" : s === "0.7" ? "🐇" : "🐆"} {s}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <button
              onClick={() => setPanicOn(!panicOn)}
              className={`ft-pill !px-3 !py-1.5 text-[11px] ${panicOn ? "ft-pill-danger-on" : "ft-pill-danger"}`}
              title="Mostrar traducción al español"
            >
              🚨 {panicOn ? "Traducción visible" : "Pánico"}
            </button>
            <button
              onClick={finishSession}
              disabled={finishing}
              className="ft-pill !px-3 !py-1.5 text-[11px]"
              title="Terminar conversación"
            >
              {finishing ? "Guardando..." : "⏹ Terminar"}
            </button>
          </div>
        </div>
      )}
      <div className="flex justify-center py-1">
        <MicOrb
          state={listening ? "listening" : isProcessing ? "processing" : isSpeaking ? "speaking" : "idle"}
          onClick={toggleListening}
          title={listening ? "Detener micrófono" : "Toca para hablar"}
        />
      </div>
      <div className="flex-1 overflow-y-auto ft-scroll px-1 space-y-3">
        {messages.length === 0 && !isProcessing && (
          <div className="text-center py-6">
            <p className="text-sm text-[#849495] font-code uppercase tracking-widest">Conversando...</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`ft-bubble ${m.role === "user" ? "ft-bubble-user" : "ft-bubble-ai"}`}>
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className={`text-[10px] font-code uppercase tracking-widest ${m.role === "user" ? "text-[#c1c7cf]" : "text-[#00f0ff]"}`}>
                {m.role === "user" ? (nickname || "Tú") : "Tu amigo"}
              </span>
              <span className="text-[10px] text-[#849495]">{i + 1}</span>
            </div>
            <p className="text-sm text-white leading-relaxed whitespace-pre-wrap">{m.text}</p>
            {m.role === "assistant" && panicOn && m.spanish && (
              <p className="mt-1.5 pt-1.5 border-t border-[#00f0ff]/15 text-xs text-[#7df4ff] leading-relaxed">
                🇪🇸 {m.spanish}
              </p>
            )}
          </div>
        ))}
        {isProcessing && (
          <div className="ft-bubble ft-bubble-ai">
            <p className="text-xs text-[#00f0ff] font-code animate-pulse">typing...</p>
          </div>
        )}
        {listening && (
          <div className="ft-bubble ft-bubble-user border-[#00f0ff]/60">
            <p className="text-xs text-[#00f0ff] font-code animate-pulse">
              🎤 {liveTranscript || "Escuchando..."}
            </p>
          </div>
        )}
        <div ref={listEndRef} />
    {replyHints.length > 0 && (
      <div className="flex flex-wrap items-start gap-2 px-3 pb-2">
        <span className="text-[10px] text-[#849495] font-code uppercase tracking-widest w-full">💡 Toca para escuchar, luego dilo tú 🎤</span>
        {replyHints.map((h, idx) => (
          <button
            key={idx}
            onClick={() => speakFriend(h.en)}
            disabled={isSpeaking}
            className="ft-chip whitespace-normal !border-[#00ff88]/40 !text-[#9ff5c8] text-left"
            title="Escuchar pronunciación"
          >
            <span className="block text-[11px]">🔊 {h.en}</span>
            <span className="block text-[9px] opacity-70">🇪🇸 {h.es}</span>
          </button>
        ))}
      </div>
    )}
      </div>
      <div className="flex gap-2 overflow-x-auto ft-scroll pb-1">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => sendMessage(s)}
            disabled={isProcessing}
            className="ft-chip whitespace-nowrap"
          >
            {s}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage(inputText)}
          placeholder="Escribe en inglés..."
          className="ft-input flex-1"
          disabled={isProcessing}
        />
        <button
          onClick={() => sendMessage(inputText)}
          disabled={!inputText.trim() || isProcessing}
          className="ft-send"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("reset") === "1") {
        freeTalkStore.reset();
        window.history.replaceState({}, "", window.location.pathname);
      }
    } catch {
      // Ignorar.
    }

    if (freeTalkStore.getVersion() !== STORAGE_VERSION) {
      freeTalkStore.reset();
      freeTalkStore.setVersion(STORAGE_VERSION);
    }

    const savedName = freeTalkStore.getNickname() || "";
    const savedHistory = freeTalkStore.loadHistory();
    const savedSummary = freeTalkStore.getSummary();

    setNickname(savedName);
    setLevel(freeTalkStore.getLevel());
    setSpeed(freeTalkStore.getSpeed());

    const returning =
      savedHistory.length > 0 || Boolean(savedSummary?.es || savedSummary?.en);

    console.log("[ConversationChat] boot v3 → returning:", returning);

    if (returning && savedName) {
      setMessages(savedHistory);
      historyReadyRef.current = savedHistory.length > 0;
      setPhase("resume");
    } else {
      setObStep(0);
      setPhase("onboarding");
    }
  }, []);

  /* ---------- Nombre desde la base de datos AURIX ---------- */
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        let uid = params.get("user") || localStorage.getItem("ft_cloud_user") || "";
        if (!uid) {
          const list = await fetch(CLOUD_API + "?action=listUsers").then((r) => r.json());
          if (cancel) return;
          if (list && list.ok && Array.isArray(list.users)) {
            setCloudUsers(list.users.map((u: any) => ({ id: String(u.user_id), nickname: String(u.nickname) })));
            if (list.users.length === 1) uid = String(list.users[0].user_id);
          }
        }
        if (!uid || cancel) return;
        localStorage.setItem("ft_cloud_user", uid);
        const data = await fetch(CLOUD_API + "?action=load&user_id=" + encodeURIComponent(uid)).then((r) => r.json());
        if (cancel) return;
        if (data && data.ok && data.user && data.user.nickname) {
          const name = String(data.user.nickname).trim();
          if (!name) return;
          freeTalkStore.setNickname(name);
          let sumEs = "";
          try {
            const ls = await fetch(CLOUD_API + "?action=latestSummary&user_id=" + encodeURIComponent(uid)).then((r) => r.json());
            if (ls && ls.ok && ls.summary) sumEs = ls.summary.summary_es || "";
          } catch (e) {}
          if (!sumEs) sumEs = freeTalkStore.getSummary().es || "";
          lastSummaryRef.current = sumEs;
          if (pendingGreetRef.current) {
            const g = pendingGreetRef.current;
            pendingGreetRef.current = "";
            setTimeout(() => {
              if (sumEs) {
                speakNarrator("¡Hola " + name + "! Qué gusto verte de nuevo. La última vez platicamos sobre: " + cleanTTS(sumEs) + " ¿Continuamos donde quedamos?");
                setTimeout(() => speakFriend(g), 6000);
              } else {
                speakFriend(g);
              }
            }, 700);
          }
          setNickname(name);
          setObStep((s) => (s === 0 ? 1 : s));
        }
      } catch (e) {
        // Sin conexion a la base: captura manual.
      }
    })();
    return () => { cancel = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudTick]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [topVisible, setTopVisible] = useState(true);
  useEffect(() => {
    let t: any = null;
    const show = () => {
      setTopVisible(true);
      if (t) clearTimeout(t);
      t = setTimeout(() => setTopVisible(false), 3500);
    };
    show();
    window.addEventListener("pointermove", show);
    window.addEventListener("touchstart", show);
    return () => {
      if (t) clearTimeout(t);
      window.removeEventListener("pointermove", show);
      window.removeEventListener("touchstart", show);
    };
  }, []);

  const [endVisible, setEndVisible] = useState(true);
  const endTimerRef = useRef<any>(null);

  const showEndBtn = useCallback(() => {
    setEndVisible(true);
    if (endTimerRef.current) clearTimeout(endTimerRef.current);
    endTimerRef.current = setTimeout(() => setEndVisible(false), 6000);
  }, []);

  useEffect(() => {
    if (phase === "conversation") showEndBtn();
  }, [phase, showEndBtn]);

  useEffect(() => {
    return () => {
      if (endTimerRef.current) clearTimeout(endTimerRef.current);
    };
  }, []);

  const headerLabel =
    phase === "conversation"
      ? "CONVERSACIÓN LIBRE · INGLÉS"
      : phase === "resume"
      ? "BIENVENIDO DE NUEVO"
      : phase === "finished"
      ? "SESIÓN GUARDADA"
      : "CONVERSACIÓN LIBRE · ESPAÑOL";

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#0a0c12] text-white overflow-hidden">
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[400px] rounded-full bg-[#00f0ff]/10 blur-[120px]" />
  {/* Barra minima auto-ocultable + menu lateral */}
  <div className="relative z-10 flex items-center justify-between px-3 py-2 pointer-events-none">
    <div className={`flex items-center gap-2 transition-opacity duration-700 ${topVisible ? "opacity-70" : "opacity-0"}`}>
      <span className="w-2 h-2 rounded-full bg-[#00f0ff] animate-pulse" />
      <h1 className="font-geist font-bold text-[10px] md:text-xs tracking-widest uppercase">{headerLabel}</h1>
    </div>
    <div className="flex items-center gap-2">
      {phase === "conversation" && endVisible && (
        <button
          onClick={() => { setDrawerOpen(false); finishSession(); }}
          disabled={finishing}
          className="ft-pill !px-2.5 !py-1.5 text-[11px] pointer-events-auto"
          title="Terminar conversación"
        >
          {finishing ? "⏳ Guardando..." : "⏹ Terminar"}
        </button>
      )}
      <button
        onClick={() => setDrawerOpen(true)}
        className="ft-pill !px-2.5 !py-1.5 text-sm pointer-events-auto"
        title="Menú"
      >
        ⋮
      </button>
    </div>
  </div>

  {phase === "conversation" && !endVisible && !finishing && (
    <button
      onClick={showEndBtn}
      className="fixed top-2 right-16 z-30 ft-pill !px-2 !py-1.5 text-[11px] opacity-50 hover:opacity-100 transition-opacity"
      title="Mostrar botón de terminar conversación"
    >
      ⏹
    </button>
  )}

  {drawerOpen && (
    <div className="fixed inset-0 z-50" onClick={() => setDrawerOpen(false)}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <aside
        className="absolute right-0 top-0 h-full w-64 bg-[#0a0c12]/95 border-l border-[#00f0ff]/20 p-4 flex flex-col gap-2 overflow-y-auto ft-scroll"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="font-geist font-bold text-xs tracking-widest uppercase text-[#00f0ff]">{headerLabel}</span>
          <button onClick={() => setDrawerOpen(false)} className="ft-pill !px-2 !py-1 text-[10px]" title="Cerrar">✕</button>
        </div>
        {nickname && (
          <div className="ft-card !py-2 text-center">
            <span className="text-[11px] text-[#00ff88] font-semibold">👤 {nickname}</span>
          </div>
        )}
        <button onClick={() => { stopSpeaking(); setDrawerOpen(false); }} className="ft-pill !py-2 text-[11px]">🔇 Silenciar voz</button>
        {phase === "conversation" && (
          <button onClick={() => { setShowControls((v) => !v); setDrawerOpen(false); }} className="ft-pill !py-2 text-[11px]">⚙ Controles (nivel · velocidad · pánico · terminar)</button>
        )}
        <button onClick={() => setPanicOn((v) => !v)} className={`ft-pill !py-2 text-[11px] ${panicOn ? "ft-pill-danger-on" : "ft-pill-danger"}`}>🚨 {panicOn ? "Ocultar traducción" : "Traducción (pánico)"}</button>
        {phase === "conversation" && (
          <button onClick={() => { setDrawerOpen(false); finishSession(); }} disabled={finishing} className="ft-pill !py-2 text-[11px]">⏹ {finishing ? "Guardando..." : "Terminar conversación"}</button>
        )}
        <button onClick={() => { setDrawerOpen(false); handleResetApp(); }} className="ft-pill !py-2 text-[11px] hover:border-red-500/60 hover:text-red-300">🗑 Reiniciar protocolo</button>
        <button
          onClick={() => { stopSpeaking(); window.location.href = MAIN_APP_URL; }}
          className="ft-pill !py-2 text-[11px] hover:border-[#00f0ff]/60 hover:text-[#7df4ff]"
        >
          🏠 Volver a la app principal
        </button>
        {onExit && (
          <button onClick={onExit} className="ft-pill !py-2 text-[11px]">🚪 Salir</button>
        )}
      </aside>
    </div>
  )}
      <main className="relative z-10 flex-1 overflow-y-auto ft-scroll px-4 py-5 flex items-start justify-center">
        {phase === "onboarding" && renderOnboarding()}
        {phase === "resume" && renderResume()}
        {phase === "conversation" && (
          <div className="h-full w-full flex flex-col">{renderConversation()}</div>
        )}
        {phase === "finished" && renderFinished()}
        {phase === "off" && renderOff()}
      </main>
    </div>
  );
};










