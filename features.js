/* Recursos do Melancolic: cápsula do tempo, refúgio sensorial e linha do tempo.
   As cartas e filtros ficam no navegador. O diário existente continua no IndexedDB atual. */
(() => {
  'use strict';

  const CAPSULE_KEY = 'melancolic-time-capsules-v1';
  const MOOD_KEY = 'melancolic-mood-checkins-v1';
  const DB_NAME = 'entre-o-silencio-db';
  const DB_VERSION = 1;
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

  function readCapsules() {
    return readArray(CAPSULE_KEY).filter((item) => item && item.id && item.dueDate && typeof item.text === 'string');
  }

  function saveCapsule() {
    const titleField = $('#capsuleTitle');
    const dateField = $('#capsuleDate');
    const textField = $('#capsuleText');
    const status = $('#capsuleStatus');
    const title = titleField.value.trim().slice(0, 100) || 'Uma carta para mim';
    const dueDate = dateField.value;
    const text = textField.value.trim();

    if (!dueDate) {
      status.textContent = 'Escolha a data em que deseja abrir sua carta.';
      dateField.focus();
      return;
    }
    if (dueDate < todayISO()) {
      status.textContent = 'Escolha hoje ou uma data futura para abrir a carta.';
      dateField.focus();
      return;
    }
    if (!text) {
      status.textContent = 'Escreva algumas palavras antes de fechar a carta.';
      textField.focus();
      return;
    }

    const capsules = readCapsules();
    capsules.unshift({
      id: makeId(),
      title: title,
      text: text.slice(0, 8000),
      dueDate: dueDate,
      createdAt: Date.now(),
      openedAt: dueDate <= todayISO() ? Date.now() : null
    });

    try {
      writeArray(CAPSULE_KEY, capsules.slice(0, 300));
      titleField.value = '';
      textField.value = '';
      dateField.value = '';
      setDefaultCapsuleDate();
      status.textContent = dueDate <= todayISO()
        ? 'Sua carta foi guardada e já pode ser aberta.'
        : 'Sua carta foi fechada. Ela estará disponível em ' + formatDateOnly(dueDate) + '.';
      renderCapsules();
      renderTimeline();
    } catch (error) {
      console.error(error);
      status.textContent = 'Não foi possível guardar a carta. Verifique o espaço disponível no navegador.';
    }
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

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function renderCapsules() {
    const list = $('#capsuleList');
    const empty = $('#emptyCapsules');
    const count = $('#capsuleCount');
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
      const state = element('span', 'capsule-state' + (ready ? ' is-ready' : ''), opened ? 'carta aberta' : ready ? 'pronta para abrir' : 'fechada no tempo');
      const title = element('h3', '', capsule.title || 'Uma carta para mim');
      const meta = element('p', 'capsule-meta', 'Criada em ' + formatDate(capsule.createdAt, false) + ' · abrir em ' + formatDateOnly(capsule.dueDate));
      titleBox.append(state, title, meta);
      top.appendChild(titleBox);
      card.appendChild(top);

      if (opened) {
        const body = element('p', 'capsule-body', capsule.text);
        card.appendChild(body);
        if (capsule.openedAt) {
          card.appendChild(element('p', 'capsule-meta', 'Aberta em ' + formatDate(capsule.openedAt, true) + '.'));
        }
      } else {
        const lockText = element('p', 'capsule-lock-note', ready
          ? 'O dia chegou. Quando se sentir pronto, abra a carta que você deixou para si.'
          : 'Esta mensagem continua fechada até ' + formatDateOnly(capsule.dueDate) + '. Volte nessa data para encontrar suas palavras.');
        card.appendChild(lockText);
      }

      const actions = element('div', 'capsule-card-actions');
      if (!opened && ready) {
        const open = element('button', 'save-button', 'abrir minha carta');
        open.type = 'button';
        open.addEventListener('click', () => openCapsule(capsule.id));
        actions.appendChild(open);
      } else if (!opened) {
        actions.appendChild(element('span', 'capsule-meta', '✉ guardada até a data escolhida'));
      }
      const remove = element('button', 'capsule-delete', 'apagar carta');
      remove.type = 'button';
      remove.addEventListener('click', () => deleteCapsule(capsule.id));
      actions.appendChild(remove);
      card.appendChild(actions);
      list.appendChild(card);
    });
  }

  function openCapsule(id) {
    const capsules = readCapsules();
    const capsule = capsules.find((item) => item.id === id);
    if (!capsule) return;
    if (capsule.dueDate > todayISO()) {
      $('#capsuleStatus').textContent = 'Ainda não chegou o dia de abrir esta carta.';
      return;
    }
    capsule.openedAt = Date.now();
    try {
      writeArray(CAPSULE_KEY, capsules);
      $('#capsuleStatus').textContent = 'Sua carta foi aberta. Leia sem pressa.';
      renderCapsules();
      renderTimeline();
    } catch (error) {
      console.error(error);
      $('#capsuleStatus').textContent = 'Não foi possível abrir a carta agora.';
    }
  }

  function deleteCapsule(id) {
    const capsules = readCapsules();
    const capsule = capsules.find((item) => item.id === id);
    if (!capsule || !window.confirm('Apagar esta carta do armazenamento deste dispositivo?')) return;
    try {
      writeArray(CAPSULE_KEY, capsules.filter((item) => item.id !== id));
      $('#capsuleStatus').textContent = 'Carta apagada.';
      renderCapsules();
      renderTimeline();
    } catch (error) {
      console.error(error);
      $('#capsuleStatus').textContent = 'Não foi possível apagar a carta.';
    }
  }

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

  async function startAmbientSound() {
    stopAmbientSound(false);
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      $('#ambienceStatus').textContent = 'Este navegador não oferece áudio gerado. Você ainda pode usar os cenários visuais.';
      return;
    }

    try {
      audioContext = new AudioContextClass();
      await audioContext.resume();
      const sampleRate = audioContext.sampleRate;
      const buffer = audioContext.createBuffer(1, sampleRate * 3, sampleRate);
      const channel = buffer.getChannelData(0);
      for (let i = 0; i < channel.length; i += 1) channel[i] = Math.random() * 2 - 1;

      const profile = AMBIENCES[selectedAmbience];
      noiseSource = audioContext.createBufferSource();
      noiseSource.buffer = buffer;
      noiseSource.loop = true;

      ambientFilter = audioContext.createBiquadFilter();
      ambientFilter.type = profile.filter;
      ambientFilter.frequency.value = profile.cutoff;
      ambientFilter.Q.value = selectedAmbience === 'forest' ? 0.25 : 0.55;

      ambientGain = audioContext.createGain();
      const volume = Number($('#ambienceVolume').value || 25) / 100;
      ambientGain.gain.value = volume * profile.level;

      ambientLfo = audioContext.createOscillator();
      ambientLfo.frequency.value = profile.rate;
      ambientLfoGain = audioContext.createGain();
      ambientLfoGain.gain.value = volume * profile.modulation;
      ambientLfo.connect(ambientLfoGain);
      ambientLfoGain.connect(ambientGain.gain);

      noiseSource.connect(ambientFilter);
      ambientFilter.connect(ambientGain);
      ambientGain.connect(audioContext.destination);
      noiseSource.start();
      ambientLfo.start();
      playing = true;
      $('#ambienceToggleButton').textContent = 'silenciar ambiente';
      $('#ambienceStatus').textContent = 'Tocando: ' + profile.label + '. O som foi gerado no seu navegador.';
    } catch (error) {
      console.error('Não foi possível iniciar o som ambiente.', error);
      stopAmbientSound(false);
      $('#ambienceStatus').textContent = 'Não foi possível iniciar o som. Toque novamente para tentar.';
    }
  }

  function stopAmbientSound(showStatus) {
    if (noiseSource) {
      try { noiseSource.stop(); } catch (error) { /* fonte já encerrada */ }
      try { noiseSource.disconnect(); } catch (error) { /* nó já desconectado */ }
    }
    if (ambientLfo) {
      try { ambientLfo.stop(); } catch (error) { /* oscilador já encerrado */ }
      try { ambientLfo.disconnect(); } catch (error) { /* nó já desconectado */ }
    }
    [ambientFilter, ambientGain, ambientLfoGain].forEach((node) => {
      if (node) { try { node.disconnect(); } catch (error) { /* nó já desconectado */ } }
    });
    if (audioContext) {
      try { audioContext.close(); } catch (error) { /* contexto já encerrado */ }
    }
    audioContext = null;
    noiseSource = null;
    ambientFilter = null;
    ambientGain = null;
    ambientLfo = null;
    ambientLfoGain = null;
    const wasPlaying = playing;
    playing = false;
    const toggle = $('#ambienceToggleButton');
    if (toggle) toggle.textContent = 'ouvir ambiente';
    if (showStatus && wasPlaying) $('#ambienceStatus').textContent = 'Som ambiente pausado.';
  }

  function updateAmbientVolume() {
    const value = Number($('#ambienceVolume').value || 0);
    $('#ambienceVolumeLabel').textContent = value + '%';
    if (ambientGain && ambientLfoGain) {
      const profile = AMBIENCES[selectedAmbience];
      const volume = value / 100;
      ambientGain.gain.value = volume * profile.level;
      ambientLfoGain.gain.value = volume * profile.modulation;
    }
  }

  function openDiaryDB() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) { resolve([]); return; }
      let request;
      try { request = window.indexedDB.open(DB_NAME, DB_VERSION); }
      catch (error) { reject(error); return; }
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('entries')) {
          const store = db.createObjectStore('entries', { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('entries')) {
          db.close();
          resolve([]);
          return;
        }
        let transaction;
        try {
          transaction = db.transaction('entries', 'readonly');
          const requestAll = transaction.objectStore('entries').getAll();
          requestAll.onsuccess = () => {
            const items = Array.isArray(requestAll.result) ? requestAll.result : [];
            db.close();
            resolve(items);
          };
          requestAll.onerror = () => { db.close(); reject(requestAll.error || new Error('Falha ao ler os registros.')); };
        } catch (error) { db.close(); reject(error); }
      };
      request.onerror = () => reject(request.error || new Error('Não foi possível abrir o diário local.'));
    });
  }

  function makeTimelineCard(item) {
    const card = element('article', 'timeline-card');
    const top = element('div', 'timeline-card-top');
    const heading = element('div');
    heading.appendChild(element('span', 'timeline-kind', item.kindLabel));
    heading.appendChild(element('h3', '', item.title));
    top.appendChild(heading);
    const time = element('time', '', formatDate(item.date, true));
    time.dateTime = new Date(item.date).toISOString();
    top.appendChild(time);
    card.appendChild(top);

    if (item.text) card.appendChild(element('p', 'timeline-card-text', item.text));
    if (Array.isArray(item.media) && item.media.length) {
      const wrap = element('div', 'timeline-media');
      item.media.forEach((media) => {
        if (!media || !media.blob) return;
        const holder = element('div', 'timeline-media-item');
        const url = URL.createObjectURL(media.blob);
        timelineObjectUrls.push(url);
        if (media.type === 'image') {
          const image = element('img');
          image.src = url;
          image.alt = media.name || 'Foto guardada no registro';
          holder.appendChild(image);
        } else if (media.type === 'audio') {
          const audio = element('audio');
          audio.controls = true;
          audio.preload = 'none';
          audio.src = url;
          holder.appendChild(audio);
        }
        if (media.name) holder.appendChild(element('span', 'timeline-media-label', media.name));
        wrap.appendChild(holder);
      });
      if (wrap.childElementCount) card.appendChild(wrap);
    }
    return card;
  }

  async function renderTimeline() {
    const container = $('#timelineItems');
    const empty = $('#emptyTimeline');
    const count = $('#timelineCount');
    if (!container || !empty || !count) return;
    timelineObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    timelineObjectUrls = [];
    container.replaceChildren();
    $('#timelineStatus').textContent = 'Reunindo suas lembranças deste dispositivo…';

    let diary = [];
    try {
      diary = await openDiaryDB();
    } catch (error) {
      console.warn('A linha do tempo não conseguiu ler o diário.', error);
      $('#timelineStatus').textContent = 'Não foi possível ler os registros do diário. Sentimentos e cartas ainda podem aparecer.';
    }

    const items = [];
    diary.forEach((entry) => {
      items.push({
        kind: 'registro',
        kindLabel: 'desabafo',
        date: Number(entry.createdAt) || Date.now(),
        title: entry.title || 'Um registro sem título',
        text: entry.text || '',
        media: Array.isArray(entry.media) ? entry.media : [],
        searchText: (entry.title || '') + ' ' + (entry.text || '')
      });
    });

    readArray(MOOD_KEY).forEach((checkin) => {
      if (!checkin || !MOODS[checkin.mood]) return;
      items.push({
        kind: 'sentimento',
        kindLabel: 'sentimento',
        mood: checkin.mood,
        date: Number(checkin.createdAt) || Date.now(),
        title: 'Como eu estava: ' + MOODS[checkin.mood].label,
        text: 'Intensidade ' + Number(checkin.intensity || 3) + '/5' + (checkin.note ? '\n\n' + checkin.note : ''),
        media: [],
        searchText: MOODS[checkin.mood].label + ' ' + (checkin.note || '')
      });
    });

    readCapsules().forEach((capsule) => {
      if (!capsule.openedAt) return;
      items.push({
        kind: 'capsula',
        kindLabel: 'carta aberta',
        date: Number(capsule.openedAt) || Number(capsule.createdAt) || Date.now(),
        title: capsule.title || 'Uma carta para mim',
        text: capsule.text || '',
        media: [],
        searchText: (capsule.title || '') + ' ' + (capsule.text || '')
      });
    });

    const month = $('#timelineMonth').value;
    const kind = $('#timelineType').value;
    const mood = $('#timelineMood').value;
    const search = $('#timelineSearch').value.trim().toLocaleLowerCase('pt-BR');
    let filtered = items.filter((item) => {
      if (month && monthISO(item.date) !== month) return false;
      if (kind !== 'all' && item.kind !== kind) return false;
      if (mood !== 'all' && !(item.kind === 'sentimento' && item.mood === mood)) return false;
      if (search && !(item.title + ' ' + item.text + ' ' + item.searchText).toLocaleLowerCase('pt-BR').includes(search)) return false;
      return true;
    });
    filtered.sort((a, b) => b.date - a.date);
    count.textContent = filtered.length + (filtered.length === 1 ? ' lembrança' : ' lembranças');
    $('#timelineStatus').textContent = items.length
      ? 'Encontradas ' + filtered.length + ' de ' + items.length + ' lembranças. Tudo é lido localmente neste navegador.'
      : 'Ainda não há registros para reunir. Suas lembranças aparecerão aqui quando você guardar alguma coisa.';
    empty.classList.toggle('hidden', filtered.length > 0);
    if (!filtered.length && items.length) {
      empty.querySelector('h3').textContent = 'Nenhuma lembrança com esses filtros.';
      empty.querySelector('p').textContent = 'Experimente outro mês, tipo, sentimento ou palavra.';
    } else {
      empty.querySelector('h3').textContent = 'A história começa com o que você guarda.';
      empty.querySelector('p').textContent = 'Quando tiver registros, check-ins ou cartas abertas, eles vão se reunir aqui.';
    }
    filtered.forEach((item) => container.appendChild(makeTimelineCard(item)));
  }

  function clearTimelineFilters() {
    $('#timelineMonth').value = '';
    $('#timelineType').value = 'all';
    $('#timelineMood').value = 'all';
    $('#timelineSearch').value = '';
    renderTimeline();
  }

  function initFeatures() {
    if (!$('#capsula')) return;
    setDefaultCapsuleDate();
    $('#saveCapsuleButton').addEventListener('click', saveCapsule);
    $('#capsuleDate').addEventListener('change', () => { $('#capsuleStatus').textContent = ''; });
    renderCapsules();

    $$('.scene-option').forEach((button) => button.addEventListener('click', () => selectScene(button.dataset.scene)));
    $$('.ambience-option').forEach((button) => button.addEventListener('click', () => selectAmbience(button.dataset.ambience)));
    $('#ambienceToggleButton').addEventListener('click', () => {
      if (playing) stopAmbientSound(true);
      else startAmbientSound();
    });
    $('#ambienceVolume').addEventListener('input', updateAmbientVolume);

    $('#timelineMonth').addEventListener('change', renderTimeline);
    $('#timelineType').addEventListener('change', renderTimeline);
    $('#timelineMood').addEventListener('change', renderTimeline);
    $('#timelineSearch').addEventListener('input', renderTimeline);
    $('#clearTimelineFilters').addEventListener('click', clearTimelineFilters);

    $$('.nav-link').forEach((button) => button.addEventListener('click', () => {
      if (button.dataset.section === 'capsula') renderCapsules();
      if (button.dataset.section === 'linha-do-tempo') renderTimeline();
      if (button.dataset.section !== 'refugio' && playing) stopAmbientSound(true);
    }));

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && playing) stopAmbientSound(true);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFeatures, { once: true });
  } else {
    initFeatures();
  }
})();
