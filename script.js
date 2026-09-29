const DB_NAME = 'entre-o-silencio-db';
const DB_VERSION = 1;
const ENTRY_STORE = 'entries';

const state = {
  attachments: [],
  recorder: null,
  recordingChunks: [],
  recordingStartedAt: null,
  recordingTimer: null,
  chat: [],
  chatBusy: false,
  localGenerator: null,
  localModelLoading: false,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function openDB() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB não está disponível neste navegador/origem.'));
      return;
    }
    let request;
    try { request = indexedDB.open(DB_NAME, DB_VERSION); }
    catch (error) { reject(error); return; }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ENTRY_STORE)) {
        const store = db.createObjectStore(ENTRY_STORE, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Não foi possível abrir o banco local.'));
  });
}

async function dbPut(entry) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(ENTRY_STORE, 'readwrite');
      tx.objectStore(ENTRY_STORE).put(entry);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error || new Error('Não foi possível guardar o registro.')); };
      tx.onabort = () => { db.close(); reject(tx.error || new Error('A operação foi interrompida.')); };
    } catch (error) { db.close(); reject(error); }
  });
}

async function dbAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(ENTRY_STORE, 'readonly');
      const request = tx.objectStore(ENTRY_STORE).getAll();
      request.onsuccess = () => {
        const result = Array.isArray(request.result) ? request.result : [];
        result.sort((a, b) => b.createdAt - a.createdAt);
        db.close(); resolve(result);
      };
      request.onerror = () => { db.close(); reject(request.error || new Error('Não foi possível ler os registros.')); };
    } catch (error) { db.close(); reject(error); }
  });
}

async function dbDelete(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(ENTRY_STORE, 'readwrite');
      tx.objectStore(ENTRY_STORE).delete(id);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error || new Error('Não foi possível apagar o registro.')); };
      tx.onabort = () => { db.close(); reject(tx.error || new Error('A operação foi interrompida.')); };
    } catch (error) { db.close(); reject(error); }
  });
}

async function dbClear() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(ENTRY_STORE, 'readwrite');
      tx.objectStore(ENTRY_STORE).clear();
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error || new Error('Não foi possível apagar os registros.')); };
      tx.onabort = () => { db.close(); reject(tx.error || new Error('A operação foi interrompida.')); };
    } catch (error) { db.close(); reject(error); }
  });
}

function formatDate(dateValue) {
  return new Intl.DateTimeFormat('pt-BR', { weekday:'long', day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' }).format(new Date(dateValue));
}
function formatDayShort(dateValue) {
  return new Intl.DateTimeFormat('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }).format(new Date(dateValue));
}
function todayLabel() {
  const el = $('#todayLabel');
  if (!el) return;
  el.textContent = new Intl.DateTimeFormat('pt-BR', { weekday:'long', day:'2-digit', month:'long' }).format(new Date());
}
function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function readableFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function addAttachment(file) {
  if (!(file instanceof Blob)) return;
  const type = file.type.startsWith('image/') ? 'image' : file.type.startsWith('audio/') ? 'audio' : null;
  if (!type) return;
  state.attachments.push({ id:createId(), file, type });
  renderAttachmentPreview();
}
function renderAttachmentPreview() {
  const container = $('#attachmentPreview');
  if (!container) return;
  container.innerHTML = '';
  state.attachments.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'attachment-item';
    const objectUrl = URL.createObjectURL(item.file);
    if (item.type === 'image') {
      const img = document.createElement('img'); img.alt = `Pré-visualização de ${item.file.name}`; img.src = objectUrl; card.appendChild(img);
    } else {
      const audio = document.createElement('audio'); audio.controls = true; audio.src = objectUrl; card.appendChild(audio);
    }
    const meta = document.createElement('div'); meta.className = 'attachment-meta'; meta.textContent = `${item.file.name} · ${readableFileSize(item.file.size)}`; card.appendChild(meta);
    const remove = document.createElement('button');
    remove.className = 'remove-attachment'; remove.type = 'button'; remove.textContent = '×'; remove.title = 'Remover anexo';
    remove.addEventListener('click', () => {
      URL.revokeObjectURL(objectUrl);
      state.attachments = state.attachments.filter((x) => x.id !== item.id);
      renderAttachmentPreview();
    });
    card.appendChild(remove); container.appendChild(card);
  });
}

function switchSection(sectionId) {
  $$('.nav-link').forEach((btn) => btn.classList.toggle('active', btn.dataset.section === sectionId));
  $$('.page').forEach((section) => section.classList.toggle('hidden-section', section.id !== sectionId));
  if (sectionId === 'historias') renderEntries();
  if (sectionId === 'galeria') renderGallery();
  if (sectionId === 'conversa') renderChat();
  window.scrollTo({ top:0, behavior:'smooth' });
}
function makeElement(tag, className, text) {
  const el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el;
}
function appendMedia(container, media) {
  if (!media || !media.blob) return;
  const objectUrl = URL.createObjectURL(media.blob);
  if (media.type === 'image') { const img = document.createElement('img'); img.src = objectUrl; img.alt = media.name || 'Imagem anexada'; container.appendChild(img); }
  else if (media.type === 'audio') { const audio = document.createElement('audio'); audio.controls = true; audio.src = objectUrl; container.appendChild(audio); }
  container.appendChild(makeElement('div', 'media-label', media.name || 'arquivo'));
}
async function renderEntries() {
  const list = $('#entriesList'), empty = $('#emptyEntries'), stats = $('#statsBox'), template = $('#entryTemplate');
  if (!list || !empty || !stats || !template) return;
  list.innerHTML = '';
  try {
    const entries = await dbAll();
    stats.textContent = `${entries.length} ${entries.length === 1 ? 'registro' : 'registros'}`;
    empty.classList.toggle('hidden', entries.length > 0);
    entries.forEach((entry) => {
      const article = template.content.cloneNode(true);
      article.querySelector('.entry-date').textContent = formatDate(entry.createdAt);
      article.querySelector('.entry-title').textContent = entry.title || 'sem título';
      article.querySelector('.entry-text').textContent = entry.text || '';
      const mediaWrap = article.querySelector('.entry-media');
      (entry.media || []).forEach((media) => appendMedia(mediaWrap, media));
      article.querySelector('.delete-entry').addEventListener('click', async () => {
        if (!window.confirm('Apagar este registro? Esta ação não pode ser desfeita.')) return;
        try { await dbDelete(entry.id); await renderEntries(); await renderGallery(); }
        catch (error) { console.error(error); window.alert('Não foi possível apagar o registro.'); }
      });
      list.appendChild(article);
    });
  } catch (error) {
    console.error(error); stats.textContent = 'armazenamento indisponível'; empty.classList.remove('hidden'); empty.querySelector('h3').textContent = 'O armazenamento local não está disponível.'; empty.querySelector('p').textContent = 'Abra o site em HTTPS ou localhost para usar os registros.';
  }
}
async function renderGallery() {
  const gallery = $('#mediaGallery'), empty = $('#emptyGallery');
  if (!gallery || !empty) return;
  gallery.innerHTML = '';
  try {
    const entries = await dbAll();
    const media = entries.flatMap((entry) => (entry.media || []).map((item) => ({ ...item, createdAt:entry.createdAt })));
    empty.classList.toggle('hidden', media.length > 0);
    media.forEach((item) => {
      if (!item.blob) return;
      const card = makeElement('article', 'media-card');
      const objectUrl = URL.createObjectURL(item.blob);
      if (item.type === 'image') { const img = document.createElement('img'); img.src = objectUrl; img.alt = item.name || 'Imagem'; card.appendChild(img); }
      else if (item.type === 'audio') { const audio = document.createElement('audio'); audio.controls = true; audio.src = objectUrl; card.appendChild(audio); }
      card.appendChild(makeElement('p', '', `${item.name || 'arquivo'} · ${formatDayShort(item.createdAt)}`)); gallery.appendChild(card);
    });
  } catch (error) { console.error(error); empty.classList.remove('hidden'); }
}

async function saveEntry() {
  const textEl = $('#entryText'), titleEl = $('#entryTitle'), statusEl = $('#saveStatus'), saveButton = $('#saveButton');
  if (!textEl || !titleEl || !statusEl || !saveButton) return;
  const text = textEl.value.trim(), title = titleEl.value.trim();
  if (!text && state.attachments.length === 0) { statusEl.textContent = 'Escreva alguma coisa ou adicione um arquivo antes de guardar.'; return; }
  saveButton.disabled = true; statusEl.textContent = 'guardando…';
  const entry = { id:createId(), title, text, createdAt:Date.now(), media:state.attachments.map((item) => ({ id:item.id, name:item.file.name, type:item.type, mimeType:item.file.type || 'application/octet-stream', size:item.file.size, blob:item.file })) };
  try {
    await dbPut(entry); titleEl.value=''; textEl.value=''; state.attachments=[]; renderAttachmentPreview(); statusEl.textContent='guardado neste dispositivo.';
    setTimeout(() => { if ($('#saveStatus')) $('#saveStatus').textContent=''; }, 3500);
  } catch (error) { console.error(error); statusEl.textContent='Não foi possível guardar. Abra o site em localhost ou HTTPS e tente novamente.'; }
  finally { saveButton.disabled=false; }
}
function preferredAudioMimeType() {
  if (!window.MediaRecorder || typeof MediaRecorder.isTypeSupported !== 'function') return '';
  return ['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/mp4'].find((type) => MediaRecorder.isTypeSupported(type)) || '';
}
async function startRecording() {
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function' || !window.MediaRecorder) { window.alert('Seu navegador não oferece gravação de áudio por esta página. Use “enviar áudio” para escolher um arquivo.'); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio:true });
    const mimeType = preferredAudioMimeType();
    state.recordingChunks=[]; state.recorder=new MediaRecorder(stream, mimeType ? { mimeType } : undefined); state.recordingStartedAt=Date.now();
    state.recorder.ondataavailable=(event)=>{ if(event.data?.size>0) state.recordingChunks.push(event.data); };
    state.recorder.onerror=(event)=>console.error('Erro no gravador:', event.error || event);
    state.recorder.onstop=()=>{
      const mime = state.recorder?.mimeType || mimeType || 'audio/webm';
      const blob = new Blob(state.recordingChunks,{type:mime});
      const ext = mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'm4a' : 'webm';
      const timestamp = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
      addAttachment(new File([blob],`gravacao-${timestamp}.${ext}`,{type:mime}));
      stream.getTracks().forEach((track)=>track.stop()); state.recordingTimer=null; state.recordingStartedAt=null; $('#recordingPanel')?.classList.add('hidden'); $('#recordButton').disabled=false;
    };
    state.recorder.start(); $('#recordingPanel')?.classList.remove('hidden'); $('#recordButton').disabled=true; tickRecordingTimer();
  } catch (error) { console.error(error); window.alert('O microfone não foi liberado. Verifique a permissão do navegador.'); }
}
function tickRecordingTimer() {
  if (!state.recordingStartedAt || !state.recorder || state.recorder.state !== 'recording') return;
  const elapsed=Math.floor((Date.now()-state.recordingStartedAt)/1000); const mins=String(Math.floor(elapsed/60)).padStart(2,'0'); const secs=String(elapsed%60).padStart(2,'0'); const timer=$('#recordingTimer'); if(timer) timer.textContent=`${mins}:${secs}`; state.recordingTimer=window.setTimeout(tickRecordingTimer,250);
}
function stopRecording() { if(state.recorder && state.recorder.state==='recording') state.recorder.stop(); }
async function clearAll() {
  if (!window.confirm('Isso apagará todos os registros, fotos e áudios guardados neste navegador. Continuar?')) return;
  try { await dbClear(); await renderEntries(); await renderGallery(); switchSection('historias'); }
  catch (error) { console.error(error); window.alert('Não foi possível apagar os registros.'); }
}

function addChatMessage(role, text) {
  state.chat.push({ role, content:text });
  renderChat();
}
function renderChat() {
  const container = $('#chatMessages'); if (!container) return; container.innerHTML='';
  if (state.chat.length === 0) {
    const empty=document.createElement('div'); empty.className='chat-empty';
    empty.innerHTML='<div><div class="empty-icon">◌</div><p>Você pode começar com uma frase simples. Não precisa organizar tudo antes de escrever.</p></div>';
    container.appendChild(empty); return;
  }
  state.chat.forEach((message)=>{
    const bubble=document.createElement('div'); bubble.className=`chat-message ${message.role}`;
    const label=document.createElement('small'); label.textContent=message.role==='user'?'você':'entre o silêncio'; bubble.appendChild(label);
    const text=document.createElement('div'); text.textContent=message.content; bubble.appendChild(text); container.appendChild(bubble);
  });
  container.scrollTop=container.scrollHeight;
}
function setChatStatus(text, loading = false) {
  const status=$('#chatStatus');
  if(!status) return;
  status.textContent=text || '';
  status.classList.toggle('is-loading', Boolean(loading && text));
}


const LOCAL_MODEL = 'onnx-community/SmolLM-135M-Instruct-ONNX';
const TRANSFORMERS_VERSION = '3.8.1';
const SYSTEM_PROMPT = `Você é a presença conversacional do site “entre o silêncio”.

Responda em português do Brasil. Seja calmo, acolhedor, simples e humano, sem parecer robótico. Prefira respostas curtas ou médias. Não julgue, ridicularize ou faça sermões. Não trate o usuário como paciente e não diga que sabe um diagnóstico. Não dê diagnóstico, prescrição, dosagem ou orientação para iniciar, interromper ou alterar medicamentos. Não substitua psicólogo, médico ou outro profissional. Não finja ser uma pessoa real e não invente fatos sobre a vida do usuário. Quando a pessoa estiver desabafando, priorize escuta e organização dos pensamentos. Quando pedir ajuda para uma decisão pessoal, apresente opções e consequências sem decidir por ela. Não incentive violência, uso de substâncias, desafios perigosos ou autolesão. Se houver indicação de perigo imediato ou intenção de se machucar, responda de forma direta e protetiva e incentive procurar imediatamente um adulto de confiança ou um serviço de emergência local, sem descrever métodos ou ferimentos. O objetivo é oferecer companhia conversacional dentro do site.`;

let transformersModulePromise = null;

async function loadTransformers() {
  if (!transformersModulePromise) {
    transformersModulePromise = import(`https://cdn.jsdelivr.net/npm/@huggingface/transformers@${TRANSFORMERS_VERSION}/+esm`);
  }
  return transformersModulePromise;
}

function hasWebGPU() {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

async function createGenerator(pipeline) {
  // WebGPU, quando disponível, é mais rápido.
  if (hasWebGPU()) {
    try {
      setChatStatus('carregando a IA no seu navegador… na primeira vez pode demorar um pouco.', true);
      return await pipeline('text-generation', LOCAL_MODEL, {
        dtype: 'q4',
        device: 'webgpu',
      });
    } catch (error) {
      console.warn('WebGPU indisponível ou falhou. Tentando WASM/CPU.', error);
    }
  }

  // WASM é o caminho mais compatível e roda na CPU.
  try {
    setChatStatus('carregando a IA no seu navegador… na primeira vez pode demorar um pouco.', true);
    return await pipeline('text-generation', LOCAL_MODEL, {
      dtype: 'q4',
      device: 'wasm',
    });
  } catch (q4Error) {
    console.warn('WASM q4 falhou. Tentando q8 como fallback.', q4Error);
  }

  // Último fallback: q8, mais pesado, mas útil em alguns navegadores/CPUs.
  setChatStatus('fazendo uma segunda tentativa para este dispositivo…', true);
  return await pipeline('text-generation', LOCAL_MODEL, {
    dtype: 'q8',
    device: 'wasm',
  });
}

async function ensureLocalGenerator() {
  if (state.localGenerator) return state.localGenerator;
  if (state.localModelLoading) {
    while (state.localModelLoading) await new Promise((resolve) => setTimeout(resolve, 120));
    return state.localGenerator;
  }

  state.localModelLoading = true;
  try {
    const { pipeline, env } = await loadTransformers();
    env.allowRemoteModels = true;
    env.allowLocalModels = false;
    if (env.backends?.onnx?.wasm) {
      env.backends.onnx.wasm.numThreads = Math.max(1, Math.min(4, navigator.hardwareConcurrency || 2));
    }
    state.localGenerator = await createGenerator(pipeline);
    setChatStatus('');
    return state.localGenerator;
  } finally {
    state.localModelLoading = false;
  }
}

function extractLocalReply(result) {
  const generated = result?.[0]?.generated_text;
  if (Array.isArray(generated)) {
    const last = generated[generated.length - 1];
    return typeof last?.content === 'string' ? last.content.trim() : '';
  }
  return typeof generated === 'string' ? generated.trim() : '';
}

async function sendChat() {
  if (state.chatBusy) return;
  const input=$('#chatInput'), button=$('#sendChatButton'); if(!input || !button) return;
  const message=input.value.trim();
  if (!message) return;
  const history=[...state.chat, { role:'user', content:message }].slice(-8);
  const promptMessages=[{ role:'system', content:SYSTEM_PROMPT }, ...history];
  addChatMessage('user', message); input.value=''; state.chatBusy=true; button.disabled=true;
  setChatStatus('pensando localmente…', true);
  try {
    const generator = await ensureLocalGenerator();
    if (!generator) throw new Error('Gerador local indisponível.');
    const output = await generator(promptMessages, {
      max_new_tokens: 96,
      do_sample: true,
      temperature: 0.7,
      top_p: 0.9,
      repetition_penalty: 1.08,
      return_full_text: false,
    });
    const reply = extractLocalReply(output);
    if (!reply) throw new Error('A IA não retornou uma resposta de texto.');
    addChatMessage('assistant', reply);
    setChatStatus('');
  } catch(error) {
    console.error('Falha na IA local:', error);
    setChatStatus('Não foi possível carregar a IA neste dispositivo. Recarregue a página e tente novamente; no celular, a primeira carga pode exigir alguns minutos e bastante memória.', false);
    if (state.chat.at(-1)?.role === 'user' && state.chat.at(-1)?.content === message) state.chat.pop();
    renderChat();
  } finally { state.chatBusy=false; button.disabled=false; input.focus(); }
}
function clearChat() {
  state.chat=[]; setChatStatus(''); renderChat(); $('#chatInput')?.focus();
}
function useCurrentEntry() {
  const source=$('#entryText')?.value.trim(); if(!source) { setChatStatus('Escreva primeiro alguma coisa no desabafo.'); return; }
  switchSection('conversa');
  $('#chatInput').value=`Quero conversar sobre o que escrevi aqui:\n\n${source}`;
  $('#chatInput').focus();
  setChatStatus('Seu texto não foi enviado ainda. Você decide quando apertar “enviar”.');
}

function init() {
  todayLabel();
  $('#photoInput')?.addEventListener('change',(event)=>{ Array.from(event.target.files||[]).forEach(addAttachment); event.target.value=''; });
  $('#audioInput')?.addEventListener('change',(event)=>{ Array.from(event.target.files||[]).forEach(addAttachment); event.target.value=''; });
  $('#saveButton')?.addEventListener('click',saveEntry);
  $('#recordButton')?.addEventListener('click',startRecording);
  $('#stopRecordingButton')?.addEventListener('click',stopRecording);
  $('#clearDataButton')?.addEventListener('click',clearAll);
  $('#sendChatButton')?.addEventListener('click',sendChat);
  $('#clearChatButton')?.addEventListener('click',clearChat);
  $('#useEntryButton')?.addEventListener('click',useCurrentEntry);
  $$('.nav-link').forEach((btn)=>btn.addEventListener('click',()=>switchSection(btn.dataset.section)));
  $('#entryText')?.addEventListener('keydown',(event)=>{ if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();saveEntry();} });
  $('#chatInput')?.addEventListener('keydown',(event)=>{ if(event.key==='Enter' && !event.shiftKey){event.preventDefault();sendChat();} });
  renderEntries(); renderGallery(); renderChat();
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
