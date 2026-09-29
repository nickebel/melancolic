const DB_NAME = 'entre-o-silencio-db';
const DB_VERSION = 1;
const ENTRY_STORE = 'entries';

const state = {
  attachments: [],
  recorder: null,
  recordingChunks: [],
  recordingStartedAt: null,
  recordingTimer: null,
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
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      reject(error);
      return;
    }

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
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error || new Error('Não foi possível guardar o registro.'));
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error || new Error('A operação de gravação foi interrompida.'));
      };
    } catch (error) {
      db.close();
      reject(error);
    }
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
        db.close();
        resolve(result);
      };
      request.onerror = () => {
        db.close();
        reject(request.error || new Error('Não foi possível ler os registros.'));
      };
    } catch (error) {
      db.close();
      reject(error);
    }
  });
}

async function dbDelete(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(ENTRY_STORE, 'readwrite');
      tx.objectStore(ENTRY_STORE).delete(id);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error || new Error('Não foi possível apagar o registro.'));
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error || new Error('A operação foi interrompida.'));
      };
    } catch (error) {
      db.close();
      reject(error);
    }
  });
}

async function dbClear() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(ENTRY_STORE, 'readwrite');
      tx.objectStore(ENTRY_STORE).clear();
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error || new Error('Não foi possível apagar os registros.'));
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error || new Error('A operação foi interrompida.'));
      };
    } catch (error) {
      db.close();
      reject(error);
    }
  });
}

function formatDate(dateValue) {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  }).format(new Date(dateValue));
}

function formatDayShort(dateValue) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  }).format(new Date(dateValue));
}

function todayLabel() {
  const el = $('#todayLabel');
  if (!el) return;
  el.textContent = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long'
  }).format(new Date());
}

function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readableFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function addAttachment(file) {
  if (!(file instanceof Blob)) return;
  const type = file.type.startsWith('image/')
    ? 'image'
    : file.type.startsWith('audio/')
      ? 'audio'
      : null;

  if (!type) return;

  state.attachments.push({
    id: createId(),
    file,
    type,
  });

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
      const img = document.createElement('img');
      img.alt = `Pré-visualização de ${item.file.name}`;
      img.src = objectUrl;
      card.appendChild(img);
    } else {
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.src = objectUrl;
      card.appendChild(audio);
    }

    const meta = document.createElement('div');
    meta.className = 'attachment-meta';
    meta.textContent = `${item.file.name} · ${readableFileSize(item.file.size)}`;
    card.appendChild(meta);

    const remove = document.createElement('button');
    remove.className = 'remove-attachment';
    remove.type = 'button';
    remove.textContent = '×';
    remove.title = 'Remover anexo';
    remove.addEventListener('click', () => {
      URL.revokeObjectURL(objectUrl);
      state.attachments = state.attachments.filter((x) => x.id !== item.id);
      renderAttachmentPreview();
    });
    card.appendChild(remove);

    container.appendChild(card);
  });
}

function switchSection(sectionId) {
  $$('.nav-link').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.section === sectionId);
  });

  $$('.page').forEach((section) => {
    section.classList.toggle('hidden-section', section.id !== sectionId);
  });

  if (sectionId === 'historias') renderEntries();
  if (sectionId === 'galeria') renderGallery();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function makeElement(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function appendMedia(container, media) {
  if (!media || !media.blob) return;

  const objectUrl = URL.createObjectURL(media.blob);

  if (media.type === 'image') {
    const img = document.createElement('img');
    img.src = objectUrl;
    img.alt = media.name || 'Imagem anexada';
    container.appendChild(img);
  } else if (media.type === 'audio') {
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.src = objectUrl;
    container.appendChild(audio);
  }

  container.appendChild(makeElement('div', 'media-label', media.name || 'arquivo'));
}

async function renderEntries() {
  const list = $('#entriesList');
  const empty = $('#emptyEntries');
  const stats = $('#statsBox');
  const template = $('#entryTemplate');

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
        const ok = window.confirm('Apagar este registro? Esta ação não pode ser desfeita.');
        if (!ok) return;

        try {
          await dbDelete(entry.id);
          await renderEntries();
          await renderGallery();
        } catch (error) {
          console.error(error);
          window.alert('Não foi possível apagar o registro.');
        }
      });

      list.appendChild(article);
    });
  } catch (error) {
    console.error(error);
    stats.textContent = 'armazenamento indisponível';
    empty.classList.remove('hidden');
    empty.querySelector('h3').textContent = 'O armazenamento local não está disponível.';
    empty.querySelector('p').textContent = 'Abra o site em localhost ou em um servidor HTTPS para usar os registros.';
  }
}

async function renderGallery() {
  const gallery = $('#mediaGallery');
  const empty = $('#emptyGallery');

  if (!gallery || !empty) return;

  gallery.innerHTML = '';

  try {
    const entries = await dbAll();
    const media = entries.flatMap((entry) =>
      (entry.media || []).map((item) => ({ ...item, createdAt: entry.createdAt }))
    );

    empty.classList.toggle('hidden', media.length > 0);

    media.forEach((item) => {
      if (!item.blob) return;

      const card = makeElement('article', 'media-card');
      const objectUrl = URL.createObjectURL(item.blob);

      if (item.type === 'image') {
        const img = document.createElement('img');
        img.src = objectUrl;
        img.alt = item.name || 'Imagem';
        card.appendChild(img);
      } else if (item.type === 'audio') {
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.src = objectUrl;
        card.appendChild(audio);
      }

      card.appendChild(makeElement('p', '', `${item.name || 'arquivo'} · ${formatDayShort(item.createdAt)}`));
      gallery.appendChild(card);
    });
  } catch (error) {
    console.error(error);
    empty.classList.remove('hidden');
  }
}

async function saveEntry() {
  const textEl = $('#entryText');
  const titleEl = $('#entryTitle');
  const statusEl = $('#saveStatus');
  const saveButton = $('#saveButton');

  if (!textEl || !titleEl || !statusEl || !saveButton) return;

  const text = textEl.value.trim();
  const title = titleEl.value.trim();

  if (!text && state.attachments.length === 0) {
    statusEl.textContent = 'Escreva alguma coisa ou adicione um arquivo antes de guardar.';
    return;
  }

  saveButton.disabled = true;
  statusEl.textContent = 'guardando…';

  const entry = {
    id: createId(),
    title,
    text,
    createdAt: Date.now(),
    media: state.attachments.map((item) => ({
      id: item.id,
      name: item.file.name,
      type: item.type,
      mimeType: item.file.type || 'application/octet-stream',
      size: item.file.size,
      blob: item.file,
    })),
  };

  try {
    await dbPut(entry);
    titleEl.value = '';
    textEl.value = '';
    state.attachments = [];
    renderAttachmentPreview();
    statusEl.textContent = 'guardado neste dispositivo.';
    setTimeout(() => {
      if ($('#saveStatus')) $('#saveStatus').textContent = '';
    }, 3500);
  } catch (error) {
    console.error(error);
    statusEl.textContent = 'Não foi possível guardar. Abra o site em localhost ou HTTPS e tente novamente.';
  } finally {
    saveButton.disabled = false;
  }
}

function preferredAudioMimeType() {
  if (!window.MediaRecorder || typeof MediaRecorder.isTypeSupported !== 'function') return '';
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

async function startRecording() {
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function' || !window.MediaRecorder) {
    window.alert('Seu navegador não oferece gravação de áudio por esta página. Use “enviar áudio” para escolher um arquivo.');
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = preferredAudioMimeType();
    const options = mimeType ? { mimeType } : undefined;

    state.recordingChunks = [];
    state.recorder = new MediaRecorder(stream, options);
    state.recordingStartedAt = Date.now();

    state.recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        state.recordingChunks.push(event.data);
      }
    };

    state.recorder.onerror = (event) => {
      console.error('Erro no gravador:', event.error || event);
    };

    state.recorder.onstop = () => {
      const mime = state.recorder?.mimeType || mimeType || 'audio/webm';
      const blob = new Blob(state.recordingChunks, { type: mime });
      const ext = mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'm4a' : 'webm';
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const file = new File([blob], `gravacao-${timestamp}.${ext}`, { type: mime });

      addAttachment(file);
      stream.getTracks().forEach((track) => track.stop());

      state.recordingTimer = null;
      state.recordingStartedAt = null;

      $('#recordingPanel')?.classList.add('hidden');
      const button = $('#recordButton');
      if (button) button.disabled = false;
    };

    state.recorder.start();
    $('#recordingPanel')?.classList.remove('hidden');
    const button = $('#recordButton');
    if (button) button.disabled = true;
    $('#recordingLabel').textContent = 'gravando…';
    tickRecordingTimer();
  } catch (error) {
    console.error(error);
    window.alert('O microfone não foi liberado. Verifique a permissão do navegador e, de preferência, abra o site em localhost ou HTTPS.');
  }
}

function tickRecordingTimer() {
  const recorder = state.recorder;
  if (!state.recordingStartedAt || !recorder || recorder.state !== 'recording') return;

  const elapsed = Math.floor((Date.now() - state.recordingStartedAt) / 1000);
  const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const secs = String(elapsed % 60).padStart(2, '0');
  const timer = $('#recordingTimer');
  if (timer) timer.textContent = `${mins}:${secs}`;

  state.recordingTimer = window.setTimeout(tickRecordingTimer, 250);
}

function stopRecording() {
  if (state.recorder && state.recorder.state === 'recording') {
    state.recorder.stop();
  }
}

async function clearAll() {
  const ok = window.confirm('Isso apagará todos os registros, fotos e áudios guardados neste navegador. Continuar?');
  if (!ok) return;

  try {
    await dbClear();
    await renderEntries();
    await renderGallery();
    switchSection('historias');
  } catch (error) {
    console.error(error);
    window.alert('Não foi possível apagar os registros.');
  }
}



const mascotState = {
  pose: 'idle',
  clickCount: 0,
  idleTimer: null,
};

const mascotPoses = {
  idle: { src: 'assets/mascot-idle.png', text: 'eu fico aqui com você.' },
  wave: { src: 'assets/mascot-wave.png', text: 'oi. pode falar comigo.' },
  sleep: { src: 'assets/mascot-sleep.png', text: 'não precisa falar agora. podemos só ficar em silêncio.' },
  hug: { src: 'assets/mascot-hug.png', text: 'vem cá. respira um pouquinho.' },
};

function setMascotPose(pose, message) {
  const image = $('#mascotImage');
  const bubble = $('#mascotBubble');
  if (!image || !bubble || !mascotPoses[pose]) return;

  const data = mascotPoses[pose];
  mascotState.pose = pose;
  image.classList.remove('mascot-switch');
  void image.offsetWidth;
  image.classList.add('mascot-switch');
  image.src = data.src;
  bubble.textContent = message || data.text;
}

function resetMascotIdle(delay = 7000) {
  window.clearTimeout(mascotState.idleTimer);
  mascotState.idleTimer = window.setTimeout(() => {
    setMascotPose('idle');
  }, delay);
}

function mascotFromText() {
  const text = $('#entryText')?.value?.toLowerCase() || '';
  if (!text.trim()) {
    setMascotPose('wave', 'pode começar quando quiser. eu espero.');
    resetMascotIdle(5000);
    return;
  }

  const sadWords = ['triste', 'difícil', 'cansado', 'cansaço', 'ansioso', 'ansiedade', 'chor', 'dor', 'sozinho', 'solidão', 'medo'];
  const match = sadWords.some((word) => text.includes(word));

  if (match) {
    setMascotPose('hug', 'eu li um pouquinho. fica aqui comigo.');
  } else {
    setMascotPose('wave', 'continua. não precisa deixar bonito.');
  }
  resetMascotIdle(6500);
}

function setupMascot() {
  const mascotButton = $('#mascotButton');
  if (!mascotButton) return;

  mascotButton.addEventListener('click', () => {
    mascotState.clickCount += 1;
    const cycle = ['wave', 'hug', 'sleep', 'idle'];
    const pose = cycle[mascotState.clickCount % cycle.length];
    const messages = {
      wave: 'oi. eu ainda estou aqui.',
      hug: 'um abraço silencioso também conta.',
      sleep: 'shhh… podemos descansar um instante.',
      idle: 'pronto. pode voltar quando quiser.',
    };
    setMascotPose(pose, messages[pose]);
    resetMascotIdle();
  });

  mascotButton.addEventListener('dblclick', (event) => {
    event.preventDefault();
    setMascotPose('hug', 'ok. abraço demorado.');
    resetMascotIdle(9000);
  });

  mascotButton.addEventListener('mouseenter', () => {
    if (mascotState.pose === 'idle') {
      setMascotPose('wave', 'ei…');
    }
  });

  mascotButton.addEventListener('mouseleave', () => {
    if (mascotState.pose === 'wave') resetMascotIdle(1800);
  });

  $$('.mascot-actions [data-mascot-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.mascotAction;
      if (action === 'talk') {
        mascotFromText();
      } else if (action === 'hug') {
        setMascotPose('hug', 'fica aqui. você não precisa resolver tudo agora.');
        resetMascotIdle(9000);
      } else if (action === 'quiet') {
        setMascotPose('sleep', 'tudo bem ficar em silêncio.');
        resetMascotIdle(10000);
      }
    });
  });

  $('#entryText')?.addEventListener('input', () => {
    window.clearTimeout(mascotState.idleTimer);
    mascotState.idleTimer = window.setTimeout(() => mascotFromText(), 1400);
  });
}



const ambientState = {
  enabled: false,
  volume: 0.48,
};

function setSoundLabel() {
  const button = $('#soundToggle');
  const label = $('#soundLabel');
  if (!button || !label) return;
  button.setAttribute('aria-pressed', String(ambientState.enabled));
  button.setAttribute('aria-label', ambientState.enabled ? 'Silenciar chuva' : 'Ativar chuva');
  label.textContent = ambientState.enabled ? 'chuva ligada' : 'chuva desligada';
}

async function startAmbientSound() {
  const audio = $('#rainAudio');
  if (!audio) return false;
  audio.volume = ambientState.volume;
  try {
    await audio.play();
    ambientState.enabled = true;
    setSoundLabel();
    return true;
  } catch (error) {
    console.warn('Autoplay bloqueado pelo navegador:', error);
    ambientState.enabled = false;
    setSoundLabel();
    return false;
  }
}

function stopAmbientSound() {
  const audio = $('#rainAudio');
  if (!audio) return;
  audio.pause();
  ambientState.enabled = false;
  setSoundLabel();
}

function setupAmbientSound() {
  const enterButton = $('#enterButton');
  const welcome = $('#welcomeScreen');
  const soundToggle = $('#soundToggle');
  const audio = $('#rainAudio');
  if (!welcome || !enterButton || !soundToggle || !audio) return;

  audio.volume = ambientState.volume;
  setSoundLabel();

  enterButton.addEventListener('click', async () => {
    await startAmbientSound();
    welcome.classList.add('is-hidden');
  });

  soundToggle.addEventListener('click', async () => {
    if (ambientState.enabled) {
      stopAmbientSound();
    } else {
      await startAmbientSound();
    }
  });

  // Alguns navegadores permitem iniciar o áudio depois de qualquer interação.
  const firstInteraction = async () => {
    if (!welcome.classList.contains('is-hidden')) return;
    if (!ambientState.enabled) await startAmbientSound();
  };
  window.addEventListener('pointerdown', firstInteraction, { once: true, passive: true });
}

function init() {
  todayLabel();
  setupMascot();
  setupAmbientSound();

  $('#photoInput')?.addEventListener('change', (event) => {
    Array.from(event.target.files || []).forEach(addAttachment);
    event.target.value = '';
  });

  $('#audioInput')?.addEventListener('change', (event) => {
    Array.from(event.target.files || []).forEach(addAttachment);
    event.target.value = '';
  });

  $('#saveButton')?.addEventListener('click', saveEntry);
  $('#recordButton')?.addEventListener('click', startRecording);
  $('#stopRecordingButton')?.addEventListener('click', stopRecording);
  $('#clearDataButton')?.addEventListener('click', clearAll);

  $$('.nav-link').forEach((btn) => {
    btn.addEventListener('click', () => switchSection(btn.dataset.section));
  });

  $('#entryText')?.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      saveEntry();
    }
  });

  renderEntries();
  renderGallery();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
