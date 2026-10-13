/* Recursos extras do Melancolic: personalização, acolhimento, ritual, backup seguro e etiquetas.
   Mantém o diário no IndexedDB atual e usa chaves separadas para os dados novos. */
(() => {
  'use strict';

  const CAPSULE_KEY = 'melancolic-time-capsules-v1';
  const MOOD_KEY = 'melancolic-mood-checkins-v1';
  const KIT_KEY = 'melancolic-care-kit-v1';
  const REFUGE_KEY = 'melancolic-refuge-preset-v1';
  const RITUAL_DRAFT_KEY = 'melancolic-evening-ritual-draft-v1';
  const PIN_KEY = 'melancolic-local-pin-v1';
  const UNLOCKED_KEY = 'melancolic-local-unlocked-v1';
  const DB_NAME = 'entre-o-silencio-db';
  const DB_VERSION = 1;
  const ENTRY_STORE = 'entries';
  const BACKUP_FORMAT = 'melancolic-encrypted-backup';
  const BACKUP_VERSION = 1;
  const BACKUP_KEYS = [CAPSULE_KEY, MOOD_KEY, KIT_KEY, REFUGE_KEY, RITUAL_DRAFT_KEY];
  const MOODS = {
    calmo: { label: 'em paz', emoji: '☁' },
    feliz: { label: 'feliz', emoji: '☀' },
    ansioso: { label: 'ansioso', emoji: '〰' },
    triste: { label: 'triste', emoji: '☂' },
    cansado: { label: 'cansado', emoji: '☾' },
    confuso: { label: 'confuso', emoji: '≈' },
    irritado: { label: 'irritado', emoji: '✳' }
  };
  const SCENES = {
    night: { title: 'Noite tranquila', description: 'Um céu escuro, luz suave e espaço para respirar.' },
    sea: { title: 'Perto do mar', description: 'O horizonte se abre e tudo parece poder esperar um pouco.' },
    mist: { title: 'Entre a névoa', description: 'Formas suaves, silêncio e nenhum lugar para chegar depressa.' },
    forest: { title: 'No meio da floresta', description: 'Tons profundos e um abrigo imaginado entre as árvores.' }
  };
  const AMBIENCES = {
    rain: { label: 'chuva', filter: 'highpass', cutoff: 650, level: 0.44, modulation: 0.008, rate: 0.12 },
    ocean: { label: 'mar', filter: 'lowpass', cutoff: 680, level: 0.48, modulation: 0.10, rate: 0.075 },
    wind: { label: 'vento', filter: 'lowpass', cutoff: 330, level: 0.55, modulation: 0.06, rate: 0.11 },
    forest: { label: 'floresta', filter: 'bandpass', cutoff: 1450, level: 0.16, modulation: 0.018, rate: 0.17 }
  };
  const SUGGESTIONS = [
    'Solte os ombros e perceba o apoio da cadeira ou do chão.',
    'Tome um pouco de água e dê a si mesmo alguns instantes sem cobrança.',
    'Escolha uma música familiar e ouça apenas os primeiros minutos.',
    'Mande uma mensagem simples para alguém com quem se sente à vontade.',
    'Olhe ao redor e nomeie mentalmente cinco coisas que consegue ver.',
    'Se for possível, abra uma janela ou dê alguns passos para mudar de ambiente.',
    'Lembre-se de que descansar também é uma forma válida de cuidar de si.'
  ];

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  let selectedAmbience = 'rain';
  let audioContext = null;
  let noiseSource = null;
  let ambientFilter = null;
  let ambientGain = null;
  let ambientLfo = null;
  let ambientLfoGain = null;
  let playing = false;
  let timelineObjectUrls = [];
  let suggestionIndex = Math.floor(Math.random() * SUGGESTIONS.length);
  let currentRecoveryCode = '';

  function makeId() {
    return (window.crypto && typeof window.crypto.randomUUID === 'function')
      ? window.crypto.randomUUID()
      : String(Date.now()) + '-' + Math.random().toString(16).slice(2);
  }
  function todayISO() {
    const date = new Date();
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }
  function monthISO(timestamp) {
    const date = new Date(timestamp);
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
  }
  function formatDate(value, includeTime) {
    const options = includeTime
      ? { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
      : { day: '2-digit', month: 'long', year: 'numeric' };
    return new Intl.DateTimeFormat('pt-BR', options).format(new Date(value));
  }
  function formatDateOnly(dateString) {
    const pieces = String(dateString || '').split('-').map(Number);
    if (pieces.length !== 3 || pieces.some((part) => !part)) return String(dateString || '');
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(pieces[0], pieces[1] - 1, pieces[2]));
  }
  function readArray(key) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn('Não foi possível ler o armazenamento local para ' + key, error);
      return [];
    }
  }
  function writeArray(key, items) {
    localStorage.setItem(key, JSON.stringify(items));
  }
  function readObject(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
    } catch (error) {
      console.warn('Não foi possível ler a configuração ' + key, error);
      return null;
    }
  }
  function writeObject(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // Time capsule
  function readCapsules() {
    return readArray(CAPSULE_KEY).filter((item) => item && item.id && item.dueDate && typeof item.text === 'string');
  }
  function setDefaultCapsuleDate() {
    const dateField = $('#capsuleDate');
    if (!dateField) return;
    dateField.min = todayISO();
    if (!dateField.value) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      dateField.value = tomorrow.getFullYear() + '-' + String(tomorrow.getMonth() + 1).padStart(2, '0') + '-' + String(tomorrow.getDate()).padStart(2, '0');
    }
  }
  function saveCapsule() {
    const titleField = $('#capsuleTitle');
    const dateField = $('#capsuleDate');
    const textField = $('#capsuleText');
    const status = $('#capsuleStatus');
    const title = titleField.value.trim().slice(0, 100) || 'Uma carta para mim';
    const dueDate = dateField.value;
    const text = textField.value.trim();
    if (!dueDate) { status.textContent = 'Escolha a data em que deseja abrir sua carta.'; dateField.focus(); return; }
    if (dueDate < todayISO()) { status.textContent = 'Escolha hoje ou uma data futura para abrir a carta.'; dateField.focus(); return; }
    if (!text) { status.textContent = 'Escreva algumas palavras antes de fechar a carta.'; textField.focus(); return; }
    const capsules = readCapsules();
    capsules.unshift({
      id: makeId(), title: title, text: text.slice(0, 8000), dueDate: dueDate,
      createdAt: Date.now(), openedAt: dueDate <= todayISO() ? Date.now() : null
    });
    try {
      writeArray(CAPSULE_KEY, capsules.slice(0, 300));
      titleField.value = ''; textField.value = ''; dateField.value = ''; setDefaultCapsuleDate();
      status.textContent = dueDate <= todayISO() ? 'Sua carta foi guardada e já pode ser aberta.' : 'Sua carta foi fechada. Ela estará disponível em ' + formatDateOnly(dueDate) + '.';
      renderCapsules(); renderTimeline();
    } catch (error) {
      console.error(error); status.textContent = 'Não foi possível guardar a carta. Verifique o espaço disponível no navegador.';
    }
  }
  function renderCapsules() {
    const list = $('#capsuleList'), empty = $('#emptyCapsules'), count = $('#capsuleCount');
    if (!list || !empty || !count) return;
    const capsules = readCapsules().sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)) || b.createdAt - a.createdAt);
    list.replaceChildren();
    count.textContent = capsules.length + (capsules.length === 1 ? ' carta' : ' cartas');
    empty.classList.toggle('hidden', capsules.length > 0);
    capsules.forEach((capsule) => {
      const ready = capsule.dueDate <= todayISO();
      const opened = Boolean(capsule.openedAt);
      const card = element('article', 'capsule-card glass-card');
      const top = element('div', 'capsule-card-top');
      const titleBox = element('div');
      titleBox.append(
        element('span', 'capsule-state' + (ready ? ' is-ready' : ''), opened ? 'carta aberta' : ready ? 'pronta para abrir' : 'fechada no tempo'),
        element('h3', '', capsule.title || 'Uma carta para mim'),
        element('p', 'capsule-meta', 'Criada em ' + formatDate(capsule.createdAt, false) + ' · abrir em ' + formatDateOnly(capsule.dueDate))
      );
      top.appendChild(titleBox); card.appendChild(top);
      if (opened) {
        card.appendChild(element('p', 'capsule-body', capsule.text));
        card.appendChild(element('p', 'capsule-meta', 'Aberta em ' + formatDate(capsule.openedAt, true) + '.'));
      } else {
        card.appendChild(element('p', 'capsule-lock-note', ready
          ? 'O dia chegou. Quando se sentir pronto, abra a carta que você deixou para si.'
          : 'Esta mensagem continua fechada até ' + formatDateOnly(capsule.dueDate) + '. Volte nessa data para encontrar suas palavras.'));
      }
      const actions = element('div', 'capsule-card-actions');
      if (!opened && ready) {
        const open = element('button', 'save-button', 'abrir minha carta');
        open.type = 'button'; open.addEventListener('click', () => openCapsule(capsule.id)); actions.appendChild(open);
      } else if (!opened) actions.appendChild(element('span', 'capsule-meta', '✉ guardada até a data escolhida'));
      const remove = element('button', 'capsule-delete', 'apagar carta');
      remove.type = 'button'; remove.addEventListener('click', () => deleteCapsule(capsule.id)); actions.appendChild(remove);
      card.appendChild(actions); list.appendChild(card);
    });
  }
  function openCapsule(id) {
    const capsules = readCapsules();
    const capsule = capsules.find((item) => item.id === id);
    if (!capsule) return;
    if (capsule.dueDate > todayISO()) { $('#capsuleStatus').textContent = 'Ainda não chegou o dia de abrir esta carta.'; return; }
    capsule.openedAt = Date.now();
    try {
      writeArray(CAPSULE_KEY, capsules);
      $('#capsuleStatus').textContent = 'Sua carta foi aberta. Leia sem pressa.';
      renderCapsules(); renderTimeline();
    } catch (error) {
      console.error(error); $('#capsuleStatus').textContent = 'Não foi possível abrir a carta agora.';
    }
  }
  function deleteCapsule(id) {
    const capsules = readCapsules();
    if (!capsules.some((item) => item.id === id)) return;
    if (!window.confirm('Apagar esta carta do armazenamento deste dispositivo?')) return;
    try {
      writeArray(CAPSULE_KEY, capsules.filter((item) => item.id !== id));
      $('#capsuleStatus').textContent = 'Carta apagada.';
      renderCapsules(); renderTimeline();
    } catch (error) {
      console.error(error); $('#capsuleStatus').textContent = 'Não foi possível apagar a carta.';
    }
  }

  // Sensory refuge: visual scenes + procedural ambient noise generated by Web Audio.
  function selectScene(scene) {
    if (!SCENES[scene]) return;
    const preview = $('#refugeScene');
    preview.dataset.scene = scene;
    $('#refugeSceneTitle').textContent = SCENES[scene].title;
    $('#refugeSceneDescription').textContent = SCENES[scene].description;
    $$('.scene-option').forEach((button) => {
      const active = button.dataset.scene === scene;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }
  function selectAmbience(ambience) {
    if (!AMBIENCES[ambience]) return;
    selectedAmbience = ambience;
    $$('.ambience-option').forEach((button) => {
      const active = button.dataset.ambience === ambience;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    if (playing) startAmbientSound();
    else $('#ambienceStatus').textContent = 'Ambiente escolhido: ' + AMBIENCES[ambience].label + '. Aperte “ouvir ambiente” quando quiser começar.';
  }
  function stopAmbientSound(showStatus) {
    const wasPlaying = playing;
    if (noiseSource) { try { noiseSource.stop(); } catch (error) {} try { noiseSource.disconnect(); } catch (error) {} }
    if (ambientLfo) { try { ambientLfo.stop(); } catch (error) {} try { ambientLfo.disconnect(); } catch (error) {} }
    [ambientFilter, ambientGain, ambientLfoGain].forEach((node) => { if (node) { try { node.disconnect(); } catch (error) {} } });
    if (audioContext) { try { audioContext.close(); } catch (error) {} }
    audioContext = null; noiseSource = null; ambientFilter = null; ambientGain = null; ambientLfo = null; ambientLfoGain = null; playing = false;
    const toggle = $('#ambienceToggleButton');
    if (toggle) toggle.textContent = 'ouvir ambiente';
    if (showStatus && wasPlaying && $('#ambienceStatus')) $('#ambienceStatus').textContent = 'Som ambiente pausado.';
  }
  async function startAmbientSound() {
    stopAmbientSound(false);
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) { $('#ambienceStatus').textContent = 'Este navegador não oferece áudio gerado. Você ainda pode usar os cenários visuais.'; return; }
    try {
      audioContext = new AudioContextClass();
      await audioContext.resume();
      const sampleRate = audioContext.sampleRate;
      const buffer = audioContext.createBuffer(1, sampleRate * 3, sampleRate);
      const channel = buffer.getChannelData(0);
      for (let i = 0; i < channel.length; i += 1) channel[i] = Math.random() * 2 - 1;
      const profile = AMBIENCES[selectedAmbience];
      noiseSource = audioContext.createBufferSource(); noiseSource.buffer = buffer; noiseSource.loop = true;
      ambientFilter = audioContext.createBiquadFilter(); ambientFilter.type = profile.filter; ambientFilter.frequency.value = profile.cutoff; ambientFilter.Q.value = selectedAmbience === 'forest' ? 0.25 : 0.55;
      ambientGain = audioContext.createGain();
      const volume = Number($('#ambienceVolume').value || 25) / 100;
      ambientGain.gain.value = volume * profile.level;
      ambientLfo = audioContext.createOscillator(); ambientLfo.frequency.value = profile.rate;
      ambientLfoGain = audioContext.createGain(); ambientLfoGain.gain.value = volume * profile.modulation;
      ambientLfo.connect(ambientLfoGain); ambientLfoGain.connect(ambientGain.gain);
      noiseSource.connect(ambientFilter); ambientFilter.connect(ambientGain); ambientGain.connect(audioContext.destination);
      noiseSource.start(); ambientLfo.start(); playing = true;
      $('#ambienceToggleButton').textContent = 'silenciar ambiente';
      $('#ambienceStatus').textContent = 'Tocando: ' + profile.label + '. Som gerado no navegador.';
    } catch (error) {
      console.error('Não foi possível iniciar o som ambiente.', error);
      stopAmbientSound(false); $('#ambienceStatus').textContent = 'Não foi possível iniciar o som. Toque novamente para tentar.';
    }
  }
  function updateAmbientVolume() {
    const value = Number($('#ambienceVolume').value || 0);
    $('#ambienceVolumeLabel').textContent = value + '%';
    if (ambientGain && ambientLfoGain) {
      const profile = AMBIENCES[selectedAmbience], volume = value / 100;
      ambientGain.gain.value = volume * profile.level; ambientLfoGain.gain.value = volume * profile.modulation;
    }
  }
  function saveRefugePreset() {
    const preset = {
      name: ($('#refugePresetName').value || '').trim().slice(0, 60) || 'Meu refúgio',
      scene: $('#refugeScene').dataset.scene || 'night',
      ambience: selectedAmbience,
      volume: Number($('#ambienceVolume').value || 25),
      updatedAt: Date.now()
    };
    try {
      writeObject(REFUGE_KEY, preset);
      renderRefugePreset();
      $('#refugePresetStatus').textContent = 'Sua combinação pessoal foi guardada neste dispositivo.';
    } catch (error) {
      console.error(error); $('#refugePresetStatus').textContent = 'Não foi possível guardar. Verifique o armazenamento do navegador.';
    }
  }
  function renderRefugePreset() {
    const preset = readObject(REFUGE_KEY);
    const button = $('#loadRefugePresetButton');
    if (!button) return;
    button.disabled = !preset;
    $('#refugePresetSummary').textContent = preset
      ? 'Salvo: ' + preset.name + ' · cenário ' + (SCENES[preset.scene]?.title || 'Noite tranquila') + ' · som ' + (AMBIENCES[preset.ambience]?.label || 'chuva') + '.'
      : 'Você ainda não salvou uma combinação pessoal.';
  }
  function loadRefugePreset() {
    const preset = readObject(REFUGE_KEY);
    if (!preset) { $('#refugePresetStatus').textContent = 'Salve uma combinação antes de tentar abri-la.'; return; }
    selectScene(SCENES[preset.scene] ? preset.scene : 'night');
    selectAmbience(AMBIENCES[preset.ambience] ? preset.ambience : 'rain');
    $('#ambienceVolume').value = String(Math.min(60, Math.max(0, Number(preset.volume) || 0)));
    $('#ambienceVolumeLabel').textContent = $('#ambienceVolume').value + '%';
    updateAmbientVolume();
    $('#refugePresetName').value = preset.name || '';
    $('#refugePresetStatus').textContent = 'Sua combinação foi restaurada. O som só começa quando você pedir.';
  }

  // Care kit
  function readKit() { return readObject(KIT_KEY) || { message: '', things: '', memory: '', people: '' }; }
  function saveKit() {
    const kit = {
      message: $('#kitMessage').value.trim().slice(0, 2000),
      things: $('#kitThings').value.trim().slice(0, 1600),
      memory: $('#kitMemory').value.trim().slice(0, 1600),
      people: $('#kitPeople').value.trim().slice(0, 1000),
      updatedAt: Date.now()
    };
    try {
      writeObject(KIT_KEY, kit); renderKit();
      $('#kitStatus').textContent = 'Seu kit foi guardado neste dispositivo. Você pode voltar e editar quando quiser.';
    } catch (error) {
      console.error(error); $('#kitStatus').textContent = 'Não foi possível guardar seu kit. Verifique o armazenamento do navegador.';
    }
  }
  function addKitCard(container, eyebrow, body) {
    const card = element('article', 'kit-saved-card');
    card.appendChild(element('p', 'eyebrow', eyebrow));
    card.appendChild(element('p', '', body));
    container.appendChild(card);
  }
  function renderKit() {
    const kit = readKit(), container = $('#kitSavedList');
    if (!container) return;
    $('#kitMessage').value = kit.message || '';
    $('#kitThings').value = kit.things || '';
    $('#kitMemory').value = kit.memory || '';
    $('#kitPeople').value = kit.people || '';
    $('#kitPreviewMessage').textContent = kit.message || 'Você pode começar criando uma mensagem gentil para si mesmo.';
    $('#kitPreviewHint').textContent = kit.memory || 'Não precisa resolver tudo de uma vez. Escolha só o próximo pequeno passo.';
    container.replaceChildren();
    if (kit.message) addKitCard(container, 'suas palavras', kit.message);
    if (kit.things) {
      const card = element('article', 'kit-saved-card');
      card.appendChild(element('p', 'eyebrow', 'pequenas coisas que ajudam'));
      const list = element('ul');
      kit.things.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).forEach((line) => list.appendChild(element('li', '', line)));
      card.appendChild(list); container.appendChild(card);
    }
    if (kit.memory) addKitCard(container, 'lembrança que faz bem', kit.memory);
    if (kit.people) addKitCard(container, 'pessoas com quem conversar', kit.people);
    if (!container.childElementCount) container.appendChild(element('div', 'timeline-empty-filter', 'Seu kit está vazio por enquanto. Você pode preencher só uma parte e guardar.'));
  }
  function nextKitSuggestion() {
    if (SUGGESTIONS.length > 1) {
      let next = suggestionIndex;
      while (next === suggestionIndex) next = Math.floor(Math.random() * SUGGESTIONS.length);
      suggestionIndex = next;
    }
    $('#kitSuggestionText').textContent = SUGGESTIONS[suggestionIndex];
  }

  // Evening ritual; autosaves draft locally, diary save uses the same IndexedDB store.
  function readRitualDraft() {
    try {
      const value = JSON.parse(localStorage.getItem(RITUAL_DRAFT_KEY) || 'null');
      return value && typeof value === 'object' ? value : {};
    } catch (error) { return {}; }
  }
  function saveRitualDraft() {
    const draft = {
      thoughts: $('#ritualThoughts').value.slice(0, 3000),
      release: $('#ritualRelease').value.slice(0, 3000),
      keep: $('#ritualKeep').value.slice(0, 3000),
      updatedAt: Date.now()
    };
    try {
      localStorage.setItem(RITUAL_DRAFT_KEY, JSON.stringify(draft));
      $('#ritualStatus').textContent = 'Rascunho guardado automaticamente neste navegador. Você ainda decide se quer salvar no diário.';
    } catch (error) { $('#ritualStatus').textContent = 'Não foi possível guardar o rascunho automaticamente.'; }
  }
  function loadRitualDraft() {
    const draft = readRitualDraft();
    $('#ritualThoughts').value = draft.thoughts || '';
    $('#ritualRelease').value = draft.release || '';
    $('#ritualKeep').value = draft.keep || '';
  }
  async function openDiaryDB() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('IndexedDB indisponível.')); return; }
      let request;
      try { request = window.indexedDB.open(DB_NAME, DB_VERSION); } catch (error) { reject(error); return; }
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(ENTRY_STORE)) {
          const store = db.createObjectStore(ENTRY_STORE, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Não foi possível abrir o diário local.'));
    });
  }
  async function dbAll() {
    const db = await openDiaryDB();
    return new Promise((resolve, reject) => {
      let req;
      try {
        req = db.transaction(ENTRY_STORE, 'readonly').objectStore(ENTRY_STORE).getAll();
        req.onsuccess = () => { const items = Array.isArray(req.result) ? req.result : []; db.close(); resolve(items); };
        req.onerror = () => { db.close(); reject(req.error || new Error('Não foi possível ler o diário.')); };
      } catch (error) { db.close(); reject(error); }
    });
  }
  async function dbPut(entry) {
    const db = await openDiaryDB();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(ENTRY_STORE, 'readwrite');
        tx.objectStore(ENTRY_STORE).put(entry);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error || new Error('Não foi possível gravar o registro.')); };
        tx.onabort = () => { db.close(); reject(tx.error || new Error('Operação interrompida.')); };
      } catch (error) { db.close(); reject(error); }
    });
  }
  async function saveRitualToDiary() {
    const thoughts = $('#ritualThoughts').value.trim();
    const release = $('#ritualRelease').value.trim();
    const keep = $('#ritualKeep').value.trim();
    if (!thoughts && !release && !keep) {
      $('#ritualStatus').textContent = 'Preencha ao menos uma resposta, ou encerre sem salvar.';
      return;
    }
    const content = [
      thoughts ? 'O que ocupou minha cabeça hoje:\n' + thoughts : '',
      release ? 'O que deixo para trás por enquanto:\n' + release : '',
      keep ? 'O que merece ser lembrado:\n' + keep : ''
    ].filter(Boolean).join('\n\n');
    const entry = {
      id: makeId(),
      title: 'Ritual de encerrar o dia',
      text: content,
      tags: ['ritual-do-dia'],
      createdAt: Date.now(),
      media: []
    };
    const button = $('#saveRitualButton');
    button.disabled = true;
    $('#ritualStatus').textContent = 'Guardando no seu diário…';
    try {
      await dbPut(entry);
      localStorage.removeItem(RITUAL_DRAFT_KEY);
      $('#ritualThoughts').value = ''; $('#ritualRelease').value = ''; $('#ritualKeep').value = '';
      $('#ritualStatus').textContent = 'Ritual guardado em “Meus registros”. Você pode revisitar esta memória na linha do tempo.';
      renderTimeline();
    } catch (error) {
      console.error(error); $('#ritualStatus').textContent = 'Não foi possível salvar. O rascunho permanece guardado neste navegador.';
    } finally { button.disabled = false; }
  }
  function clearRitualDraft() {
    if (!window.confirm('Encerrar sem salvar e descartar o rascunho deste ritual?')) return;
    localStorage.removeItem(RITUAL_DRAFT_KEY);
    $('#ritualThoughts').value = ''; $('#ritualRelease').value = ''; $('#ritualKeep').value = '';
    $('#ritualStatus').textContent = 'Ritual encerrado sem guardar no diário.';
  }

  // Timeline/tag search
  function normalizeTag(tag) {
    return String(tag || '').trim().replace(/^#/, '').toLocaleLowerCase('pt-BR');
  }
  function cleanupTimelineUrls() {
    timelineObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    timelineObjectUrls = [];
  }
  async function makeTimelineItems() {
    let diary = [];
    try { diary = await dbAll(); }
    catch (error) { console.warn('A linha do tempo não conseguiu ler o diário.', error); }
    const items = [];
    diary.forEach((entry) => {
      const tags = Array.isArray(entry.tags) ? entry.tags.filter(Boolean) : [];
      items.push({
        id: entry.id, kind: 'registro', kindLabel: 'desabafo', date: Number(entry.createdAt) || Date.now(),
        title: entry.title || 'Um registro sem título', text: entry.text || '', media: Array.isArray(entry.media) ? entry.media : [],
        tags: tags, searchText: (entry.title || '') + ' ' + (entry.text || '') + ' ' + tags.join(' ')
      });
    });
    readArray(MOOD_KEY).forEach((checkin) => {
      if (!checkin || !MOODS[checkin.mood]) return;
      items.push({
        id: checkin.id, kind: 'sentimento', kindLabel: 'sentimento', mood: checkin.mood,
        date: Number(checkin.createdAt) || Date.now(), title: 'Como eu estava: ' + MOODS[checkin.mood].label,
        text: 'Intensidade ' + Number(checkin.intensity || 3) + '/5' + (checkin.note ? '\n\n' + checkin.note : ''),
        media: [], tags: [], searchText: MOODS[checkin.mood].label + ' ' + (checkin.note || '')
      });
    });
    readCapsules().forEach((capsule) => {
      if (!capsule.openedAt) return;
      items.push({
        id: capsule.id, kind: 'capsula', kindLabel: 'carta aberta',
        date: Number(capsule.openedAt) || Number(capsule.createdAt) || Date.now(),
        title: capsule.title || 'Uma carta para mim', text: capsule.text || '', media: [], tags: ['carta'],
        searchText: (capsule.title || '') + ' ' + (capsule.text || '') + ' carta'
      });
    });
    return items;
  }
  function makeTimelineCard(item) {
    const card = element('article', 'timeline-card');
    const top = element('div', 'timeline-card-top');
    const heading = element('div');
    heading.append(element('span', 'timeline-kind', item.kindLabel), element('h3', '', item.title));
    top.append(heading);
    const time = element('time', '', formatDate(item.date, true));
    time.dateTime = new Date(item.date).toISOString();
    top.append(time); card.append(top);
    if (item.text) card.appendChild(element('p', 'timeline-card-text', item.text));
    if (item.tags && item.tags.length) {
      const tags = element('div', 'timeline-tags');
      item.tags.forEach((tag) => tags.appendChild(element('span', 'timeline-tag', '#' + String(tag).replace(/^#/, ''))));
      card.appendChild(tags);
    }
    if (Array.isArray(item.media) && item.media.length) {
      const wrap = element('div', 'timeline-media');
      item.media.forEach((media) => {
        if (!media || !media.blob) return;
        const holder = element('div', 'timeline-media-item');
        const url = URL.createObjectURL(media.blob);
        timelineObjectUrls.push(url);
        if (media.type === 'image') {
          const image = element('img'); image.src = url; image.alt = media.name || 'Foto guardada no registro'; holder.appendChild(image);
        } else if (media.type === 'audio') {
          const audio = element('audio'); audio.controls = true; audio.preload = 'none'; audio.src = url; holder.appendChild(audio);
        }
        if (media.name) holder.appendChild(element('span', 'timeline-media-label', media.name));
        wrap.appendChild(holder);
      });
      if (wrap.childElementCount) card.appendChild(wrap);
    }
    return card;
  }
  async function renderTimeline() {
    const container = $('#timelineItems'), empty = $('#emptyTimeline'), count = $('#timelineCount');
    if (!container || !empty || !count) return;
    cleanupTimelineUrls();
    container.replaceChildren();
    $('#timelineStatus').textContent = 'Reunindo suas lembranças deste dispositivo…';
    const items = await makeTimelineItems();
    const tagSelect = $('#timelineTag');
    const availableTags = new Set();
    items.forEach((item) => (item.tags || []).forEach((tag) => availableTags.add(normalizeTag(tag))));
    if (tagSelect) {
      const previous = tagSelect.value || 'all';
      tagSelect.replaceChildren(new Option('todas as etiquetas', 'all'));
      [...availableTags].sort().forEach((tag) => tagSelect.appendChild(new Option('#' + tag, tag)));
      tagSelect.value = availableTags.has(previous) ? previous : 'all';
    }
    const month = $('#timelineMonth').value;
    const kind = $('#timelineType').value;
    const mood = $('#timelineMood').value;
    const tag = tagSelect ? tagSelect.value : 'all';
    const search = $('#timelineSearch').value.trim().toLocaleLowerCase('pt-BR');
    const filtered = items.filter((item) => {
      if (month && monthISO(item.date) !== month) return false;
      if (kind !== 'all' && item.kind !== kind) return false;
      if (mood !== 'all' && !(item.kind === 'sentimento' && item.mood === mood)) return false;
      if (tag !== 'all' && !(item.tags || []).some((entry) => normalizeTag(entry) === tag)) return false;
      if (search && !(item.title + ' ' + item.text + ' ' + item.searchText + ' ' + (item.tags || []).join(' ')).toLocaleLowerCase('pt-BR').includes(search)) return false;
      return true;
    }).sort((a, b) => b.date - a.date);
    count.textContent = filtered.length + (filtered.length === 1 ? ' lembrança' : ' lembranças');
    $('#timelineStatus').textContent = items.length
      ? 'Encontradas ' + filtered.length + ' de ' + items.length + ' lembranças. Tudo é lido localmente neste navegador.'
      : 'Ainda não há registros para reunir. Suas lembranças aparecerão aqui quando você guardar alguma coisa.';
    empty.classList.toggle('hidden', filtered.length > 0);
    if (!filtered.length && items.length) {
      empty.querySelector('h3').textContent = 'Nenhuma lembrança com esses filtros.';
      empty.querySelector('p').textContent = 'Experimente outro mês, tipo, sentimento, etiqueta ou palavra.';
    } else {
      empty.querySelector('h3').textContent = 'A história começa com o que você guarda.';
      empty.querySelector('p').textContent = 'Quando tiver registros, check-ins ou cartas abertas, eles vão se reunir aqui.';
    }
    filtered.forEach((item) => container.appendChild(makeTimelineCard(item)));
  }
  function clearTimelineFilters() {
    $('#timelineMonth').value = ''; $('#timelineType').value = 'all'; $('#timelineMood').value = 'all';
    $('#timelineSearch').value = ''; if ($('#timelineTag')) $('#timelineTag').value = 'all'; renderTimeline();
  }

  // Encrypted backup includes diary entries and binary media, mood check-ins, capsules, kit, refuge and ritual draft.
  function bytesToBase64(bytes) {
    let binary = '';
    const step = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += step) {
      binary += String.fromCharCode.apply(null, bytes.subarray(offset, Math.min(offset + step, bytes.length)));
    }
    return btoa(binary);
  }
  function base64ToBytes(value) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  async function blobToBase64(blob) {
    return bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
  }
  function base64ToBlob(value, type) {
    return new Blob([base64ToBytes(value)], { type: type || 'application/octet-stream' });
  }
  async function exportPayload() {
    const entries = await dbAll();
    const serialEntries = await Promise.all(entries.map(async (entry) => {
      const media = await Promise.all((Array.isArray(entry.media) ? entry.media : []).map(async (item) => {
        const copy = { id: item.id, name: item.name, type: item.type, mimeType: item.mimeType, size: item.size };
        if (item.blob instanceof Blob) {
          copy.blobBase64 = await blobToBase64(item.blob);
          copy.blobType = item.blob.type || item.mimeType || 'application/octet-stream';
        }
        return copy;
      }));
      return { ...entry, media: media };
    }));
    const local = {};
    BACKUP_KEYS.forEach((key) => { const value = localStorage.getItem(key); if (value !== null) local[key] = value; });
    return { format: 'melancolic-data', version: 1, exportedAt: new Date().toISOString(), entries: serialEntries, local: local };
  }
  async function deriveBackupKey(password, salt) {
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salt, iterations: 250000, hash: 'SHA-256' },
      material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    );
  }
  function downloadText(filename, text, mimeType) {
    const blob = new Blob([text], { type: mimeType || 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = filename; link.style.display = 'none';
    document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  async function exportEncryptedBackup() {
    const status = $('#backupStatus');
    const password = $('#backupPassword').value;
    if (password.length < 8) { status.textContent = 'Use uma senha com pelo menos 8 caracteres para proteger o backup.'; $('#backupPassword').focus(); return; }
    if (!window.crypto || !crypto.subtle) { status.textContent = 'Criptografia não está disponível neste navegador. Abra o site em HTTPS atualizado.'; return; }
    const button = $('#exportBackupButton');
    button.disabled = true; status.textContent = 'Preparando dados e criptografando…';
    try {
      const payload = await exportPayload();
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const key = await deriveBackupKey(password, salt);
      const plaintext = new TextEncoder().encode(JSON.stringify(payload));
      const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, plaintext));
      const envelope = {
        format: BACKUP_FORMAT, version: BACKUP_VERSION, cipher: 'AES-GCM-256',
        kdf: 'PBKDF2-SHA-256', iterations: 250000,
        salt: bytesToBase64(salt), iv: bytesToBase64(iv), ciphertext: bytesToBase64(encrypted)
      };
      downloadText('melancolic-backup-' + todayISO() + '.melancolic-backup', JSON.stringify(envelope), 'application/octet-stream');
      status.textContent = 'Backup criptografado baixado. Guarde o arquivo e a senha em lugares seguros.';
    } catch (error) {
      console.error(error); status.textContent = 'Não foi possível criar o backup. Verifique o armazenamento e o espaço disponível.';
    } finally { button.disabled = false; }
  }
  async function decryptBackup(envelope, password) {
    if (!envelope || envelope.format !== BACKUP_FORMAT || envelope.version !== BACKUP_VERSION ||
        envelope.cipher !== 'AES-GCM-256' || envelope.kdf !== 'PBKDF2-SHA-256' ||
        envelope.iterations !== 250000 || !envelope.salt || !envelope.iv || !envelope.ciphertext) {
      throw new Error('Este arquivo não parece ser um backup criptografado compatível do Melancolic.');
    }
    const key = await deriveBackupKey(password, base64ToBytes(envelope.salt));
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(envelope.iv) }, key, base64ToBytes(envelope.ciphertext)
    );
    const payload = JSON.parse(new TextDecoder().decode(plaintext));
    if (!payload || payload.format !== 'melancolic-data' || !Array.isArray(payload.entries)) throw new Error('O conteúdo do backup não é válido.');
    return payload;
  }
  async function importBackupFile(file) {
    const status = $('#backupStatus'), password = $('#backupPassword').value;
    if (!file) return;
    if (!password) { status.textContent = 'Digite a senha usada para criptografar esse backup.'; $('#backupPassword').focus(); $('#backupFileInput').value = ''; return; }
    if (!window.crypto || !crypto.subtle) { status.textContent = 'Criptografia não está disponível neste navegador atualizado.'; return; }
    const input = $('#backupFileInput');
    input.disabled = true; status.textContent = 'Abrindo o backup protegido…';
    try {
      const envelope = JSON.parse(await file.text());
      const payload = await decryptBackup(envelope, password);
      const existing = await dbAll();
      const byId = new Map(existing.map((entry) => [entry.id, entry]));
      let added = 0;
      for (const entry of payload.entries) {
        if (!entry || !entry.id || byId.has(entry.id)) continue;
        const media = await Promise.all((Array.isArray(entry.media) ? entry.media : []).map(async (item) => {
          const restored = { ...item };
          if (restored.blobBase64) {
            restored.blob = base64ToBlob(restored.blobBase64, restored.blobType || restored.mimeType);
            delete restored.blobBase64; delete restored.blobType;
          }
          return restored;
        }));
        const restoredEntry = { ...entry, media: media };
        await dbPut(restoredEntry); byId.set(restoredEntry.id, restoredEntry); added += 1;
      }
      const mergedCounts = {};
      BACKUP_KEYS.forEach((key) => {
        if (payload.local && typeof payload.local[key] === 'string') {
          if (key === CAPSULE_KEY || key === MOOD_KEY) {
            let incoming = [];
            try { incoming = JSON.parse(payload.local[key]); } catch (error) { incoming = []; }
            if (!Array.isArray(incoming)) return;
            const current = readArray(key), currentIds = new Set(current.map((item) => item && item.id).filter(Boolean));
            const merged = current.slice();
            incoming.forEach((item) => { if (item && item.id && !currentIds.has(item.id)) { merged.push(item); currentIds.add(item.id); } });
            writeArray(key, merged); mergedCounts[key] = merged.length - current.length;
          } else if (localStorage.getItem(key) === null) {
            localStorage.setItem(key, payload.local[key]);
          }
        }
      });
      $('#backupStatus').textContent = 'Backup importado por mesclagem. ' + added + ' registro(s) novo(s) adicionados; os existentes foram preservados.';
      renderCapsules(); renderKit(); renderRefugePreset(); await renderTimeline();
      const currentSection = document.querySelector('.nav-link.active')?.dataset.section;
      if (currentSection === 'historias' && typeof renderEntries === 'function') await renderEntries();
      if (currentSection === 'galeria' && typeof renderGallery === 'function') await renderGallery();
      if (currentSection === 'pausa') {
        const clearButton = $('#clearMoodHistoryButton');
        if (clearButton) clearButton.click && clearButton.classList.toggle('hidden', readArray(MOOD_KEY).length === 0);
      }
    } catch (error) {
      console.error(error);
      status.textContent = error && error.name === 'OperationError'
        ? 'Não foi possível abrir o backup. Confira se a senha está correta e tente novamente.'
        : (error.message || 'Não foi possível importar o backup.');
    } finally { input.disabled = false; input.value = ''; }
  }

  // Optional PIN gate: it protects casual access to the interface but does not encrypt browser storage.
  async function digestText(text) {
    const result = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return bytesToBase64(new Uint8Array(result));
  }
  function randomRecoveryCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    let result = '';
    for (let i = 0; i < bytes.length; i += 1) {
      result += alphabet[bytes[i] % alphabet.length];
      if (i === 3 || i === 7 || i === 11) result += '-';
    }
    return result;
  }
  function normalizeRecoveryCode(code) { return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function getPinConfig() { return readObject(PIN_KEY); }
  async function hashPin(pin, salt) { return digestText(salt + ':' + pin); }
  function updatePinForm() {
    const configured = Boolean(getPinConfig());
    $('#pinCurrentRow').classList.toggle('hidden', !configured);
    $('#removePinButton').disabled = !configured;
    $('#lockNowButton').disabled = !configured;
  }
  function revealRecoveryCode(code) {
    currentRecoveryCode = code;
    $('#pinRecoveryCodeText').textContent = code;
    $('#pinRecoveryNotice').classList.remove('hidden');
  }
  function hidePrivacyGate() {
    $('#privacyGate').classList.add('hidden');
    $('#pinGateInput').value = '';
    $('#pinRecoveryInput').value = '';
    sessionStorage.setItem(UNLOCKED_KEY, '1');
  }
  function showPrivacyGate() {
    if (!getPinConfig()) return;
    sessionStorage.removeItem(UNLOCKED_KEY);
    $('#privacyGate').classList.remove('hidden');
    $('#pinGateStatus').textContent = '';
    $('#pinRecoveryForm').classList.add('hidden');
    $('#pinGateInput').value = '';
    $('#pinGateInput').focus();
  }
  async function savePin() {
    const currentConfig = getPinConfig();
    const currentPin = $('#pinCurrent').value;
    const pin = $('#pinNew').value;
    const confirm = $('#pinConfirm').value;
    const status = $('#pinStatus');
    if (currentConfig) {
      if (!currentPin || (await hashPin(currentPin, currentConfig.salt)) !== currentConfig.pinHash) {
        status.textContent = 'O PIN atual está incorreto.'; return;
      }
    }
    if (!/^\d{4,12}$/.test(pin)) { status.textContent = 'Escolha um PIN de 4 a 12 dígitos numéricos.'; $('#pinNew').focus(); return; }
    if (pin !== confirm) { status.textContent = 'Os dois campos de PIN são diferentes.'; $('#pinConfirm').focus(); return; }
    if (!window.crypto || !crypto.subtle) { status.textContent = 'Web Crypto não está disponível neste navegador atualizado.'; return; }
    try {
      const saltBytes = crypto.getRandomValues(new Uint8Array(16));
      const salt = bytesToBase64(saltBytes);
      const pinHash = await hashPin(pin, salt);
      const recovery = randomRecoveryCode();
      const recoveryHash = await digestText(normalizeRecoveryCode(recovery));
      writeObject(PIN_KEY, { salt: salt, pinHash: pinHash, recoveryHash: recoveryHash, createdAt: Date.now() });
      revealRecoveryCode(recovery);
      updatePinForm();
      $('#pinCurrent').value = ''; $('#pinNew').value = ''; $('#pinConfirm').value = '';
      status.textContent = 'PIN configurado. Guarde o código de recuperação exibido abaixo antes de sair desta página.';
    } catch (error) {
      console.error(error); status.textContent = 'Não foi possível definir o PIN.';
    }
  }
  async function removePin() {
    const config = getPinConfig();
    if (!config) { $('#pinStatus').textContent = 'Não há PIN configurado.'; return; }
    const pin = $('#pinCurrent').value;
    if (!pin || (await hashPin(pin, config.salt)) !== config.pinHash) { $('#pinStatus').textContent = 'Digite o PIN atual correto para removê-lo.'; return; }
    if (!window.confirm('Remover o bloqueio por PIN deste dispositivo?')) return;
    localStorage.removeItem(PIN_KEY); sessionStorage.removeItem(UNLOCKED_KEY);
    $('#pinCurrent').value = ''; updatePinForm();
    $('#pinStatus').textContent = 'PIN removido.';
  }
  async function unlockWithPin(event) {
    event.preventDefault();
    const config = getPinConfig();
    if (!config) { hidePrivacyGate(); return; }
    try {
      const actual = await hashPin($('#pinGateInput').value, config.salt);
      if (actual === config.pinHash) {
        hidePrivacyGate();
      } else {
        $('#pinGateStatus').textContent = 'PIN incorreto. Tente novamente ou use seu código de recuperação.';
        $('#pinGateInput').value = ''; $('#pinGateInput').focus();
      }
    } catch (error) { $('#pinGateStatus').textContent = 'Não foi possível verificar o PIN neste navegador.'; }
  }
  async function recoverPin(event) {
    event.preventDefault();
    const config = getPinConfig();
    const code = normalizeRecoveryCode($('#pinRecoveryInput').value);
    if (!config || !code) { $('#pinGateStatus').textContent = 'Digite seu código de recuperação.'; return; }
    try {
      if (await digestText(code) !== config.recoveryHash) {
        $('#pinGateStatus').textContent = 'Código de recuperação não confere.'; return;
      }
      localStorage.removeItem(PIN_KEY);
      hidePrivacyGate();
      $('#pinStatus').textContent = 'Acesso recuperado e PIN removido. Você pode criar um novo PIN depois.';
      updatePinForm();
      $('#pinRecoveryNotice').classList.add('hidden');
    } catch (error) { $('#pinGateStatus').textContent = 'Não foi possível verificar o código de recuperação.'; }
  }
  function downloadRecoveryCode() {
    if (!currentRecoveryCode) return;
    downloadText('melancolic-codigo-de-recuperacao.txt', 'Código de recuperação do PIN do Melancolic:\n' + currentRecoveryCode + '\n\nGuarde em local seguro. Este código não substitui um backup criptografado.', 'text/plain;charset=utf-8');
  }
  async function copyRecoveryCode() {
    if (!currentRecoveryCode) return;
    try {
      await navigator.clipboard.writeText(currentRecoveryCode);
      $('#pinStatus').textContent = 'Código de recuperação copiado.';
    } catch (error) {
      $('#pinStatus').textContent = 'Não foi possível copiar automaticamente. Selecione o código exibido e copie manualmente.';
    }
  }

  function initFeatures() {
    if (!$('#capsula')) return;
    setDefaultCapsuleDate();
    $('#saveCapsuleButton').addEventListener('click', saveCapsule);
    $('#capsuleDate').addEventListener('change', () => { $('#capsuleStatus').textContent = ''; });
    renderCapsules();

    $$('.scene-option').forEach((button) => button.addEventListener('click', () => selectScene(button.dataset.scene)));
    $$('.ambience-option').forEach((button) => button.addEventListener('click', () => selectAmbience(button.dataset.ambience)));
    $('#ambienceToggleButton').addEventListener('click', () => { if (playing) stopAmbientSound(true); else startAmbientSound(); });
    $('#ambienceVolume').addEventListener('input', updateAmbientVolume);
    $('#saveRefugePresetButton').addEventListener('click', saveRefugePreset);
    $('#loadRefugePresetButton').addEventListener('click', loadRefugePreset);
    renderRefugePreset();
    const savedPreset = readObject(REFUGE_KEY);
    if (savedPreset) {
      selectScene(SCENES[savedPreset.scene] ? savedPreset.scene : 'night');
      selectAmbience(AMBIENCES[savedPreset.ambience] ? savedPreset.ambience : 'rain');
      $('#ambienceVolume').value = String(Math.min(60, Math.max(0, Number(savedPreset.volume) || 0)));
      $('#ambienceVolumeLabel').textContent = $('#ambienceVolume').value + '%';
      $('#refugePresetName').value = savedPreset.name || '';
    }
    updateAmbientVolume();

    $('#saveKitButton').addEventListener('click', saveKit);
    $('#kitNextSuggestionButton').addEventListener('click', nextKitSuggestion);
    renderKit(); nextKitSuggestion();

    loadRitualDraft();
    ['#ritualThoughts', '#ritualRelease', '#ritualKeep'].forEach((selector) => $(selector).addEventListener('input', saveRitualDraft));
    $('#saveRitualButton').addEventListener('click', saveRitualToDiary);
    $('#clearRitualButton').addEventListener('click', clearRitualDraft);

    $('#timelineMonth').addEventListener('change', renderTimeline);
    $('#timelineType').addEventListener('change', renderTimeline);
    $('#timelineMood').addEventListener('change', renderTimeline);
    $('#timelineSearch').addEventListener('input', renderTimeline);
    $('#timelineTag').addEventListener('change', renderTimeline);
    $('#clearTimelineFilters').addEventListener('click', clearTimelineFilters);

    $('#exportBackupButton').addEventListener('click', exportEncryptedBackup);
    $('#backupFileInput').addEventListener('change', (event) => importBackupFile(event.target.files && event.target.files[0]));
    $('#savePinButton').addEventListener('click', () => { savePin().catch((error) => { console.error(error); $('#pinStatus').textContent = 'Não foi possível configurar o PIN.'; }); });
    $('#removePinButton').addEventListener('click', () => { removePin().catch((error) => { console.error(error); $('#pinStatus').textContent = 'Não foi possível remover o PIN.'; }); });
    $('#lockNowButton').addEventListener('click', showPrivacyGate);
    $('#pinUnlockForm').addEventListener('submit', unlockWithPin);
    $('#pinRecoveryForm').addEventListener('submit', recoverPin);
    $('#showRecoveryButton').addEventListener('click', () => {
      $('#pinRecoveryForm').classList.toggle('hidden');
      $('#pinRecoveryInput').focus();
    });
    $('#copyRecoveryCodeButton').addEventListener('click', copyRecoveryCode);
    $('#downloadRecoveryCodeButton').addEventListener('click', downloadRecoveryCode);
    $('#dismissRecoveryCodeButton').addEventListener('click', () => {
      currentRecoveryCode = '';
      $('#pinRecoveryNotice').classList.add('hidden');
      $('#pinStatus').textContent = 'Certifique-se de que guardou o código de recuperação. Ele não será mostrado outra vez.';
    });
    updatePinForm();

    $$('.nav-link').forEach((button) => button.addEventListener('click', () => {
      if (button.dataset.section === 'capsula') renderCapsules();
      if (button.dataset.section === 'linha-do-tempo') renderTimeline();
      if (button.dataset.section === 'kit') renderKit();
      if (button.dataset.section !== 'refugio' && playing) stopAmbientSound(true);
    }));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && playing) stopAmbientSound(true);
    });

    const pinConfig = getPinConfig();
    if (pinConfig && sessionStorage.getItem(UNLOCKED_KEY) !== '1') {
      $('#privacyGate').classList.remove('hidden');
      window.setTimeout(() => $('#pinGateInput').focus(), 0);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initFeatures, { once: true });
  else initFeatures();
})();
