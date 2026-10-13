const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 4000;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT = 20;
const hits = new Map();

const SYSTEM_PROMPT = `
Você é a presença conversacional do site “entre o silêncio”.

Responda em português do Brasil. Seja calmo, acolhedor, simples e humano, sem parecer robótico. Prefira respostas curtas ou médias e faça uma pergunta de continuação quando isso ajudar.

Não julgue, ridicularize ou faça sermões. Não trate a pessoa como paciente e não afirme diagnósticos. Não dê diagnóstico, prescrição, dosagem ou orientação para iniciar, interromper ou alterar medicamentos. Não substitua psicólogo, médico ou outro profissional. Não finja ser uma pessoa real e não invente fatos sobre a vida da pessoa.

Quando a pessoa estiver desabafando, priorize escuta e organização dos pensamentos em vez de tentar “consertar” tudo. Quando pedir ajuda para uma decisão pessoal, apresente opções e consequências sem decidir por ela.

Não incentive violência, uso de substâncias, desafios perigosos ou autolesão. Se houver indicação de perigo imediato ou intenção de se machucar, responda de forma direta e protetiva e incentive procurar imediatamente um adulto de confiança ou um serviço de emergência local, sem descrever métodos ou ferimentos.

O objetivo é oferecer companhia conversacional dentro do site. Não prometa confidencialidade além do que a aplicação e o provedor realmente oferecem.
`.trim();

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

function clientIp(request) {
  return String(request.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
}

function rateAllowed(ip) {
  const now = Date.now();
  const current = hits.get(ip) || { count: 0, resetAt: now + RATE_WINDOW_MS };

  if (current.resetAt <= now) {
    current.count = 0;
    current.resetAt = now + RATE_WINDOW_MS;
  }

  current.count += 1;
  hits.set(ip, current);
  return current.count <= RATE_LIMIT;
}

function normaliseMessages(input) {
  if (!Array.isArray(input)) return [];

  return input
    .slice(-MAX_MESSAGES)
    .map((message) => ({
      role: message?.role === "assistant" ? "model" : "user",
      text: typeof message?.content === "string" ? message.content.trim() : "",
    }))
    .filter((message) => message.text.length > 0 && message.text.length <= MAX_MESSAGE_CHARS);
}

export default async function handler(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "content-type",
      },
    });
  }

  if (request.method !== "POST") {
    return json({ error: "Método não permitido." }, 405);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

  if (!apiKey) {
    return json({ error: "GEMINI_API_KEY não configurada na Netlify." }, 500);
  }

  if (!rateAllowed(clientIp(request))) {
    return json({ error: "Limite temporário de mensagens atingido. Tente novamente daqui a alguns minutos." }, 429);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "JSON inválido." }, 400);
  }

  const messages = normaliseMessages(payload?.messages);
  if (messages.length === 0) {
    return json({ error: "Envie pelo menos uma mensagem." }, 400);
  }

  const contents = messages.map((message) => ({
    role: message.role,
    parts: [{ text: message.text }],
  }));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: SYSTEM_PROMPT }],
        },
        contents,
        generationConfig: {
          maxOutputTokens: 350,
        },
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = data?.error?.message || "O Gemini não conseguiu responder.";
      return json({ error: message }, response.status >= 400 && response.status < 500 ? response.status : 502);
    }

    const reply = data?.candidates?.[0]?.content?.parts
      ?.map((part) => part?.text || "")
      .join("")
      .trim();

    if (!reply) {
      return json({ error: "O Gemini não retornou uma resposta de texto." }, 502);
    }

    return json({ reply });
  } catch (error) {
    console.error("Gemini request failed", error);
    return json({ error: "Não foi possível falar com o Gemini agora." }, 502);
  }
}
