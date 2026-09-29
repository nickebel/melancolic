import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2";

// V5: foco em aparelhos modestos. O modelo é pequeno e roda localmente.
// Não é enviado texto para um servidor de IA.
env.allowLocalModels = false;
env.useBrowserCache = true;

const MODEL = "onnx-community/SmolLM-135M-Instruct-ONNX";
const chatEl = document.querySelector("#chat");
const input = document.querySelector("#input");
const send = document.querySelector("#send");
const newChat = document.querySelector("#newChat");
const loading = document.querySelector("#loading");
const statusText = document.querySelector("#statusText");
const statusDot = document.querySelector("#statusDot");

let generator = null;
let busy = false;
let messages = [];
let initialized = false;

const SYSTEM = `Você é a IA do site Melancolic.
Responda sempre em português do Brasil.
Seja natural, acolhedor, direto e breve.
Responda somente ao que a pessoa perguntou.
Não invente fatos, não continue textos aleatórios e não mude para inglês.
Use no máximo 3 parágrafos curtos, salvo se for necessário explicar algo.
Você está conversando em um site chamado Melancolic.`;

function setStatus(text, kind="") {
  statusText.textContent = text;
  statusDot.className = "dot" + (kind ? " " + kind : "");
}

function escapeText(s) { return String(s); }

function addMessage(role, text) {
  const welcome = chatEl.querySelector(".welcome");
  if (welcome) welcome.remove();

  const row = document.createElement("div");
  row.className = `message ${role}`;
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;
  row.appendChild(bubble);
  chatEl.appendChild(row);
  chatEl.scrollTop = chatEl.scrollHeight;
}

function resizeInput() {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 120) + "px";
}
input.addEventListener("input", resizeInput);

function showLoading(v) {
  loading.classList.toggle("hidden", !v);
  send.disabled = v || !initialized;
}

async function init() {
  try {
    setStatus("Carregando IA local…", "busy");
    send.disabled = true;

    // CPU/WASM é usado por padrão para evitar exigir WebGPU.
    generator = await pipeline("text-generation", MODEL, {
      device: "wasm",
      dtype: "q8",
      progress_callback: (p) => {
        if (p?.status === "progress" && Number.isFinite(p.progress)) {
          const pct = Math.round(p.progress);
          setStatus(`Baixando modelo… ${pct}%`, "busy");
        } else if (p?.status === "ready") {
          setStatus("IA pronta", "ready");
        }
      }
    });

    initialized = true;
    setStatus("IA pronta", "ready");
    send.disabled = false;
  } catch (err) {
    console.error(err);
    setStatus("Não foi possível carregar a IA", "error");
    addMessage("ai", "Não consegui carregar a IA neste aparelho. Recarregue a página e tente novamente. Se continuar travando, feche outros aplicativos antes de abrir o Melancolic.");
  }
}

function buildPrompt(userText) {
  // Mantém somente algumas mensagens recentes para economizar RAM e tokens.
  const recent = messages.slice(-5);
  let prompt = SYSTEM + "\n\n";
  for (const m of recent) {
    prompt += `${m.role === "user" ? "Usuário" : "Assistente"}: ${m.text}\n`;
  }
  prompt += `Usuário: ${userText}\nAssistente:`;
  return prompt;
}

function cleanAnswer(text) {
  let t = String(text || "").trim();
  t = t.replace(/^Assistente\s*:\s*/i, "");
  t = t.split(/\n(?:Usuário|User)\s*:/i)[0].trim();
  // Evita continuações muito longas do modelo pequeno.
  if (t.length > 700) t = t.slice(0, 700).replace(/\s+\S*$/, "") + "…";
  return t || "Desculpe, não consegui formular uma resposta agora.";
}

async function ask(text) {
  if (!generator || busy || !text.trim()) return;
  busy = true;
  showLoading(true);
  setStatus("Pensando…", "busy");

  const userText = text.trim();
  messages.push({role:"user", text:userText});
  addMessage("user", userText);

  try {
    const prompt = buildPrompt(userText);
    const out = await generator(prompt, {
      max_new_tokens: 80,
      do_sample: true,
      temperature: 0.45,
      top_p: 0.85,
      repetition_penalty: 1.15,
      return_full_text: false
    });

    const answer = cleanAnswer(out?.[0]?.generated_text);
    messages.push({role:"assistant", text:answer});
    addMessage("ai", answer);
    setStatus("IA pronta", "ready");
  } catch (err) {
    console.error(err);
    setStatus("Erro ao responder", "error");
    addMessage("ai", "Tive um problema ao gerar a resposta. Tente enviar a mensagem novamente.");
  } finally {
    busy = false;
    showLoading(false);
  }
}

document.querySelector("#composer").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = input.value;
  input.value = "";
  resizeInput();
  await ask(text);
  input.focus();
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    document.querySelector("#composer").requestSubmit();
  }
});

newChat.addEventListener("click", () => {
  if (busy) return;
  messages = [];
  chatEl.innerHTML = `
    <div class="welcome">
      <div class="welcome-mark">M</div>
      <h2>Olá.</h2>
      <p>Sou a IA local do Melancolic. Posso conversar com você sem enviar suas mensagens para uma API.</p>
    </div>`;
  input.value = "";
  resizeInput();
  input.focus();
});

init();
