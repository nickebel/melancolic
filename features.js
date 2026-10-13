/* Recursos extras do Melancolic: personalização, acolhimento, ritual, backup seguro e etiquetas.
   Mantém o diário no IndexedDB atual e usa chaves separadas para os dados novos. */
(() => {
  'use strict';

  const CAPSULE_KEY = 'melancolic-time-capsules-v1';
  const MOOD_KEY = 'melancolic-mood-checkins-v1';
  const KIT_KEY = 'melancolic-care-kit-v1';
  const REFUGE_KEY = 'melancolic-refuge-preset-v1';
  const REFUGE_PRESETS_KEY = 'melancolic-refuge-presets-v2';
  const REFUGE_PERSONAL_KEY = 'melancolic-refuge-personal-v1';
  const RITUAL_DRAFT_KEY = 'melancolic-evening-ritual-draft-v1';
  const PIN_KEY = 'melancolic-local-pin-v1';
  const UNLOCKED_KEY = 'melancolic-local-unlocked-v1';
  const DB_NAME = 'entre-o-silencio-db';
  const DB_VERSION = 1;
  const ENTRY_STORE = 'entries';
  const BACKUP_FORMAT = 'melancolic-encrypted-backup';
  const BACKUP_VERSION = 1;
  const BACKUP_KEYS = [CAPSULE_KEY, MOOD_KEY, KIT_KEY, REFUGE_KEY, REFUGE_PRESETS_KEY, REFUGE_PERSONAL_KEY, RITUAL_DRAFT_KEY, 'melancolic-personal-museum-v1', 'melancolic-personal-messages-v1', 'melancolic-interior-weather-v1', 'melancolic-deep-writing-draft-v1'];
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
    forest: { title: 'No meio da floresta', description: 'Tons profundos e um abrigo imaginado entre as árvores.' },
    sunset: { title: 'Depois do pôr do sol', description: 'Um céu morno, como o final de um dia que pode descansar.' },
    aurora: { title: 'Sob uma aurora', description: 'Luzes suaves no escuro, movimento lento e espaço para imaginar.' },
    cabin: { title: 'Uma cabana quieta', description: 'Um canto protegido do lado de fora, com espaço para recolher-se.' },
    rain: { title: 'Perto de uma janela chuvosa', description: 'A chuva fica do lado de fora; você pode permanecer aqui dentro.' }
  };
  const AMBIENCES = {
    rain: { label: 'chuva suave', filter: 'highpass', cutoff: 650, level: 0.38, modulation: 0.008, rate: 0.12 },
    ocean: { label: 'mar', filter: 'lowpass', cutoff: 680, level: 0.42, modulation: 0.10, rate: 0.075 },
    wind: { label: 'vento', filter: 'lowpass', cutoff: 330, level: 0.40, modulation: 0.06, rate: 0.11 },
    forest: { label: 'folhas', filter: 'bandpass', cutoff: 1450, level: 0.14, modulation: 0.018, rate: 0.17 },
    brook: { label: 'riacho', filter: 'bandpass', cutoff: 980, level: 0.22, modulation: 0.045, rate: 0.22 },
    embers: { label: 'brasa suave', filter: 'bandpass', cutoff: 560, level: 0.14, modulation: 0.035, rate: 1.25 },
    night: { label: 'noite sutil', filter: 'highpass', cutoff: 1950, level: 0.08, modulation: 0.022, rate: 1.45 },
    white: { label: 'ruído uniforme', filter: 'lowpass', cutoff: 1750, level: 0.13, modulation: 0.008, rate: 0.04 }
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
  function readRefugePresets() {
    let saved = readArray(REFUGE_PRESETS_KEY).filter((item) => item && typeof item === 'object');
    if (!saved.length) {
      const legacy = readObject(REFUGE_KEY);
      if (legacy && typeof legacy === 'object') {
        saved = [{ ...legacy, id: legacy.id || makeId(), accent: legacy.accent || '#82b3a2', phrase: legacy.phrase || '' }];
        try { writeObject(REFUGE_PRESETS_KEY, saved); } catch (error) {}
      }
    }
    return saved;
  }
  function refugeColorToRgba(hex, alpha) {
    const value = String(hex || '#82b3a2').replace('#','');
    const safe = /^[0-9a-f]{6}$/i.test(value) ? value : '82b3a2';
    return 'rgba(' + parseInt(safe.slice(0,2),16) + ',' + parseInt(safe.slice(2,4),16) + ',' + parseInt(safe.slice(4,6),16) + ',' + alpha + ')';
  }
  function setRefugeAccent(color, saveSetting = false) {
    const hex = /^#[0-9a-f]{6}$/i.test(String(color)) ? String(color) : '#82b3a2';
    $('#refugeScene')?.style.setProperty('--refuge-tint', refugeColorToRgba(hex,0.23));
    if ($('#refugeAccentColor')) $('#refugeAccentColor').value = hex;
    if ($('#refugeAccentLabel')) $('#refugeAccentLabel').textContent = hex.toUpperCase();
    if (saveSetting) { try { writeObject(REFUGE_PERSONAL_KEY,{...(readObject(REFUGE_PERSONAL_KEY)||{}),accent:hex}); } catch(error){} }
  }
  function setRefugePhrase(phrase, saveSetting = false) {
    const value = String(phrase || '').trim().slice(0,140);
    const preview = $('#refugePersonalPhrase');
    if (preview) { preview.textContent=value ? '“'+value+'”' : ''; preview.classList.toggle('hidden',!value); }
    if ($('#refugePersonalPhraseInput')) $('#refugePersonalPhraseInput').value=value;
    if (saveSetting) { try { writeObject(REFUGE_PERSONAL_KEY,{...(readObject(REFUGE_PERSONAL_KEY)||{}),phrase:value}); } catch(error){} }
  }
  function applyRefugePreset(preset, updateName = true) {
    if (!preset) return;
    selectScene(SCENES[preset.scene] ? preset.scene : 'night');
    selectAmbience(AMBIENCES[preset.ambience] ? preset.ambience : 'rain');
    $('#ambienceVolume').value=String(Math.min(60,Math.max(0,Number(preset.volume ?? 25))));
    $('#ambienceVolumeLabel').textContent=$('#ambienceVolume').value+'%';
    setRefugeAccent(preset.accent || '#82b3a2');
    setRefugePhrase(preset.phrase || '');
    updateAmbientVolume();
    if(updateName && $('#refugePresetName')) $('#refugePresetName').value=preset.name || '';
  }
  function saveRefugePreset() {
    const name=($('#refugePresetName').value||'').trim().slice(0,60)||'Meu refúgio';
    const preset={id:makeId(),name,scene:$('#refugeScene').dataset.scene||'night',ambience:selectedAmbience,volume:Number($('#ambienceVolume').value||25),accent:$('#refugeAccentColor')?.value||'#82b3a2',phrase:$('#refugePersonalPhraseInput')?.value?.trim().slice(0,140)||'',updatedAt:Date.now()};
    try {
      const presets=readRefugePresets();
      const existingIndex=presets.findIndex(item=>String(item.name||'').toLocaleLowerCase('pt-BR')===name.toLocaleLowerCase('pt-BR'));
      if(existingIndex>=0){preset.id=presets[existingIndex].id||preset.id;presets[existingIndex]=preset;} else presets.push(preset);
      writeObject(REFUGE_PRESETS_KEY,presets.slice(-20));
      writeObject(REFUGE_KEY,preset);
      writeObject(REFUGE_PERSONAL_KEY,{accent:preset.accent,phrase:preset.phrase});
      renderRefugePreset();
      if($('#refugePresetSelect')) $('#refugePresetSelect').value=preset.id;
      $('#refugePresetStatus').textContent=existingIndex>=0?'A combinação com esse nome foi atualizada.':'Sua combinação ficou guardada. Você pode salvar outros ambientes também.';
    } catch(error){console.error(error);$('#refugePresetStatus').textContent='Não foi possível guardar. Verifique o armazenamento do navegador.';}
  }
  function renderRefugePreset() {
    const presets=readRefugePresets(), button=$('#loadRefugePresetButton'), select=$('#refugePresetSelect');
    if(select){
      const previous=select.value;
      select.replaceChildren(new Option(presets.length?'escolha um ambiente salvo':'nenhum ambiente salvo',''));
      presets.slice().reverse().forEach(preset=>select.appendChild(new Option(preset.name||'Meu refúgio',String(preset.id||''))));
      if(presets.some(p=>String(p.id||'')===previous)) select.value=previous;
      else if(presets.length) select.value=String(presets[presets.length-1].id||'');
    }
    if(button) button.disabled=!presets.length;
    $('#refugePresetSummary').textContent=presets.length?presets.length+(presets.length===1?' combinação salva neste dispositivo.':' combinações salvas neste dispositivo.')+' Você pode escolher qualquer uma acima.':'Você ainda não salvou uma combinação pessoal.';
  }
  function loadRefugePreset() {
    const select=$('#refugePresetSelect'), presets=readRefugePresets();
    const preset=presets.find(item=>String(item.id||'')===String(select&&select.value))||presets[presets.length-1];
    if(!preset){$('#refugePresetStatus').textContent='Salve uma combinação antes de tentar abri-la.';return;}
    applyRefugePreset(preset);
    $('#refugePresetStatus').textContent='“'+(preset.name||'Meu refúgio')+'” foi restaurado. O som só começa quando você pedir.';
  }
  function applyRefugeQuickPreset(kind) {
    const preset=kind==='hard'
      ? {name:'Dia difícil',scene:'mist',ambience:'rain',volume:15,accent:'#91a9b3',phrase:'Você não precisa resolver tudo agora. Só atravesse este instante.'}
      : {name:'Momento tranquilo',scene:'sea',ambience:'ocean',volume:20,accent:'#82b3a2',phrase:'Este momento também pode ser simples. Permita-se descansar.'};
    applyRefugePreset(preset);setRefugeAccent(preset.accent,true);setRefugePhrase(preset.phrase,true);
    $('#refugePresetName').value=preset.name;
    $('#refugePresetStatus').textContent='Combinação sugerida aplicada. Você pode ajustar qualquer opção e salvar com o nome que preferir.';
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


  const MUSEUM_KEY = 'melancolic-personal-museum-v1';
  const PERSONAL_MESSAGES_KEY = 'melancolic-personal-messages-v1';
  const WEATHER_KEY = 'melancolic-interior-weather-v1';
  const DEEP_WRITING_DRAFT_KEY = 'melancolic-deep-writing-draft-v1';
  const DEFAULT_COLLECTIONS = ['Momentos que guardo', 'Dias difíceis', 'Pequenas alegrias'];
  const WEATHER_INFO = {
    sun: { title: 'Um pouco de sol por dentro.', name: 'ensolarado', icon: '☀', text: 'Há espaço para a leveza — sem precisar que tudo esteja perfeito.' },
    breeze: { title: 'Uma brisa passando.', name: 'brisa', icon: '♧', text: 'Talvez exista um pouco de calma ou espaço para respirar.' },
    cloud: { title: 'Hoje o céu está nublado.', name: 'nublado', icon: '☁', text: 'Dias mais lentos também fazem parte da vida. Você não precisa se apressar.' },
    rain: { title: 'Deixe a chuva existir.', name: 'chuva', icon: '☂', text: 'Tristeza e saudade merecem espaço, sem cobrança para passar depressa.' },
    fog: { title: 'Nem tudo precisa estar claro.', name: 'neblina', icon: '≋', text: 'Você pode seguir aos poucos, mesmo sem enxergar o caminho inteiro.' },
    storm: { title: 'Existe intensidade no ar.', name: 'tempestade', icon: 'ϟ', text: 'Quando tudo parece forte demais, tente se dar espaço antes de exigir respostas.' }
  };
  const MOOD_WEATHER = { feliz:'sun', calmo:'breeze', cansado:'cloud', triste:'rain', confuso:'fog', ansioso:'fog', irritado:'storm' };
  let creativeMuseumUrls = [];
  let creativePastEntries = [];
  let creativeConstellationItems = [];
  let selectedInteriorWeather = 'cloud';
  let deepWritingInterval = null;
  let deepWritingSeconds = 0;

  function creativeReadArray(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(value) ? value : [];
    } catch (error) { return []; }
  }
  function creativeMakeId() {
    return (window.crypto && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : String(Date.now()) + '-' + Math.random().toString(16).slice(2);
  }
  function creativeDate(value, includeTime) {
    const date = new Date(Number(value) || value || Date.now());
    const options = includeTime
      ? { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }
      : { day:'2-digit', month:'long', year:'numeric' };
    return new Intl.DateTimeFormat('pt-BR', options).format(date);
  }
  function creativeToday() {
    const now = new Date();
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  }
  function creativeNode(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined && value !== null) node.textContent = String(value);
    return node;
  }

  async function renderConstellation() {
    const field = $('#constellationStars');
    const filter = $('#constellationTagFilter');
    const count = $('#constellationCount');
    if (!field || !filter || !count) return;
    field.replaceChildren();
    let diary = [];
    try { diary = await dbAll(); }
    catch (error) { count.textContent = 'Não foi possível ler o diário neste navegador.'; return; }
    const tags = new Set();
    diary.forEach((entry) => (Array.isArray(entry.tags) ? entry.tags : []).forEach((tag) => { if (tag) tags.add(String(tag).replace(/^#/, '').trim()); }));
    const previous = filter.value || 'all';
    filter.replaceChildren(new Option('todas as memórias', 'all'));
    Array.from(tags).sort((a,b) => a.localeCompare(b, 'pt-BR')).forEach((tag) => filter.appendChild(new Option('#' + tag, tag)));
    filter.value = Array.from(tags).includes(previous) ? previous : 'all';

    const memories = diary.map((entry) => ({
      key:'entry:' + entry.id, id:entry.id, kind:'registro',
      title:entry.title || 'Um registro sem título',
      text:entry.text || (entry.media && entry.media.length ? 'Você guardou um arquivo neste momento.' : ''),
      date:Number(entry.createdAt) || Date.now(),
      tags:Array.isArray(entry.tags) ? entry.tags.filter(Boolean) : []
    }));
    creativeReadArray(MOOD_KEY).forEach((item) => {
      const mood = MOODS[item.mood];
      if (!mood) return;
      memories.push({
        key:'mood:' + item.id, id:item.id, kind:'sentimento',
        title:'Como eu estava: ' + mood.label,
        text:(item.note || '').trim() || 'Você registrou esse sentimento, mesmo que não tenha encontrado palavras para ele.',
        date:Number(item.createdAt) || Date.now(), tags:[]
      });
    });
    const chosenTag = filter.value;
    creativeConstellationItems = memories.filter((item) => chosenTag === 'all' || item.tags.some((tag) => String(tag).replace(/^#/, '').trim() === chosenTag)).sort((a,b) => b.date - a.date);
    count.textContent = creativeConstellationItems.length + (creativeConstellationItems.length === 1 ? ' estrela para revisitar' : ' estrelas para revisitar');
    if (!creativeConstellationItems.length) {
      const empty = creativeNode('p','constellation-empty', chosenTag === 'all' ? 'As memórias que você guardar aparecerão aqui como estrelas.' : 'Ainda não há memórias com essa etiqueta.');
      field.appendChild(empty);
      const detail = $('#constellationDetail');
      if (detail) { detail.replaceChildren(creativeNode('p','eyebrow','uma lembrança por vez'), creativeNode('h2','', 'Ainda não há estrelas por aqui.'), creativeNode('p','', 'Você pode voltar depois, sem pressa.')); }
      return;
    }
    creativeConstellationItems.forEach((item, index) => {
      const star = creativeNode('button','constellation-star', '✦');
      const seed = index + 1;
      const x = 7 + ((seed * 37 + Math.floor(item.date / 86400000) % 29) % 86);
      const y = 10 + ((seed * 53 + Math.floor(item.date / 3600000) % 31) % 76);
      star.style.setProperty('--star-x', x + '%');
      star.style.setProperty('--star-y', y + '%');
      star.style.setProperty('--star-delay', (index % 9) * 0.16 + 's');
      star.dataset.memoryKey = item.key;
      star.setAttribute('aria-label', item.title + ', ' + creativeDate(item.date, false));
      star.title = item.title + ' · ' + creativeDate(item.date, false);
      if (item.tags.length) star.dataset.tag = item.tags[0];
      field.appendChild(star);
    });
  }
  function showConstellationMemory(memory) {
    const detail = $('#constellationDetail');
    if (!detail || !memory) return;
    detail.replaceChildren();
    detail.appendChild(creativeNode('p','eyebrow', memory.kind === 'sentimento' ? 'um sentimento registrado' : 'um fragmento da sua história'));
    detail.appendChild(creativeNode('h2','',memory.title));
    detail.appendChild(creativeNode('p','constellation-date',creativeDate(memory.date,true)));
    detail.appendChild(creativeNode('p','constellation-memory-text',memory.text || 'Você guardou esse momento sem escrever um texto.'));
    if (memory.tags && memory.tags.length) {
      const tags = creativeNode('p','creative-tags',memory.tags.map((tag) => '#' + tag).join('  '));
      detail.appendChild(tags);
    }
    const go = creativeNode('button','tool-button','abrir meus registros');
    go.type = 'button';
    go.addEventListener('click', () => {
      const nav = document.querySelector('.nav-link[data-section="historias"]');
      if (nav) nav.click();
    });
    detail.appendChild(go);
  }

  async function renderPastMemory() {
    const select = $('#pastEntrySelector');
    if (!select) return;
    const previous = select.value;
    try { creativePastEntries = await dbAll(); }
    catch (error) { creativePastEntries = []; }
    select.replaceChildren();
    if (!creativePastEntries.length) {
      select.appendChild(new Option('nenhum registro salvo ainda', ''));
      showPastMemory('');
      $('#pastReflectionStatus').textContent = 'Guarde primeiro um registro na área “desabafar”; ele poderá ser escolhido aqui depois.';
      return;
    }
    creativePastEntries.sort((a,b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
    creativePastEntries.forEach((entry) => {
      const title = entry.title || (entry.text || '').trim().slice(0, 54) || 'registro sem título';
      select.appendChild(new Option(creativeDate(entry.createdAt, false) + ' — ' + title, entry.id));
    });
    const valid = creativePastEntries.some((entry) => String(entry.id) === previous);
    select.value = valid ? previous : String(creativePastEntries[0].id);
    showPastMemory(select.value);
  }
  function showPastMemory(id) {
    const card = $('#pastMemoryCard');
    if (!card) return;
    const entry = creativePastEntries.find((item) => String(item.id) === String(id));
    card.replaceChildren();
    card.appendChild(creativeNode('p','eyebrow','o que você viveu'));
    if (!entry) {
      card.appendChild(creativeNode('h2','', 'Ainda não há registro para reler.'));
      card.appendChild(creativeNode('p','', 'Quando guardar um momento no diário, ele poderá ser escolhido aqui.'));
      return;
    }
    card.appendChild(creativeNode('h2','',entry.title || 'Um registro sem título'));
    card.appendChild(creativeNode('p','past-memory-date',creativeDate(entry.createdAt,true)));
    card.appendChild(creativeNode('p','past-memory-text',entry.text || 'Esse momento ficou guardado sem palavras.'));
    if (Array.isArray(entry.tags) && entry.tags.length) card.appendChild(creativeNode('p','creative-tags',entry.tags.map((tag) => '#' + tag).join('  ')));
  }
  async function savePastReflection() {
    const status = $('#pastReflectionStatus');
    const id = $('#pastEntrySelector').value;
    const entry = creativePastEntries.find((item) => String(item.id) === String(id));
    const reflection = $('#pastReflectionText').value.trim();
    if (!entry) { status.textContent = 'Escolha um registro antigo antes de responder.'; return; }
    if (!reflection) { status.textContent = 'Escreva ao menos uma frase para sua versão de antes.'; $('#pastReflectionText').focus(); return; }
    const sourceDate = creativeDate(entry.createdAt,true);
    const text = 'Uma resposta para um registro de ' + sourceDate + ':\n\n' + (entry.text || entry.title || 'Um momento que guardei.') + '\n\nO que eu diria hoje:\n' + reflection;
    try {
      await dbPut({ id:creativeMakeId(), title:'Uma resposta para meu eu do passado', text:text, tags:['eu-do-passado'], createdAt:Date.now(), media:[], sourceEntryId:entry.id });
      status.textContent = 'Sua resposta foi guardada no diário.';
      $('#pastReflectionText').value = '';
    } catch (error) { status.textContent = 'Não foi possível guardar esta resposta. Tente novamente.'; }
  }

  function readMuseumState() {
    let raw = {};
    try { raw = JSON.parse(localStorage.getItem(MUSEUM_KEY) || '{}') || {}; } catch (error) { raw = {}; }
    const collections = Array.isArray(raw.collections) ? raw.collections.filter((name) => typeof name === 'string' && name.trim()) : DEFAULT_COLLECTIONS.slice();
    return {
      collections:Array.from(new Set(collections)),
      assignments:raw.assignments && typeof raw.assignments === 'object' ? raw.assignments : {}
    };
  }
  function writeMuseumState(state) {
    localStorage.setItem(MUSEUM_KEY, JSON.stringify(state));
  }
  function cleanupMuseumUrls() {
    creativeMuseumUrls.forEach((url) => URL.revokeObjectURL(url));
    creativeMuseumUrls = [];
  }
  function updateMuseumCollectionControls(state) {
    const collectionFilter = $('#museumCollectionFilter');
    const previous = collectionFilter.value || 'all';
    collectionFilter.replaceChildren(new Option('todas as coleções','all'));
    state.collections.forEach((name) => collectionFilter.appendChild(new Option(name,name)));
    collectionFilter.value = state.collections.includes(previous) ? previous : 'all';
    const chips = $('#museumCollections');
    chips.replaceChildren();
    state.collections.forEach((name) => {
      const chip = creativeNode('span','museum-collection-chip','◇ ' + name);
      chips.appendChild(chip);
    });
  }
  async function renderMuseum() {
    const container = $('#museumItems');
    const empty = $('#museumEmpty');
    if (!container || !empty) return;
    cleanupMuseumUrls();
    container.replaceChildren();
    let entries = [];
    try { entries = await dbAll(); } catch (error) {
      $('#museumStatus').textContent = 'Não foi possível abrir os registros deste dispositivo.';
      empty.classList.remove('hidden');
      return;
    }
    const museum = readMuseumState();
    updateMuseumCollectionControls(museum);
    const type = $('#museumTypeFilter').value || 'all';
    const collection = $('#museumCollectionFilter').value || 'all';
    const items = entries.filter((entry) => {
      const media = Array.isArray(entry.media) ? entry.media : [];
      const hasImage = media.some((item) => item.type === 'image');
      const hasAudio = media.some((item) => item.type === 'audio');
      const hasText = Boolean((entry.text || '').trim());
      const typeMatch = type === 'all' || (type === 'image' && hasImage) || (type === 'audio' && hasAudio) || (type === 'text' && hasText);
      const collectionMatch = collection === 'all' || museum.assignments[entry.id] === collection;
      return typeMatch && collectionMatch;
    });
    $('#museumStatus').textContent = entries.length ? 'As memórias permanecem no armazenamento local deste navegador.' : 'Seu diário ainda não tem registros para organizar.';
    empty.classList.toggle('hidden', items.length > 0);
    if (!items.length) {
      empty.querySelector('h3').textContent = entries.length ? 'Nenhum item neste recorte.' : 'Seu museu está começando.';
      empty.querySelector('p').textContent = entries.length ? 'Mude os filtros ou atribua um registro a uma coleção.' : 'Guarde um texto, uma fotografia ou um áudio na área de desabafo; depois, ele poderá aparecer nesta galeria.';
    }
    items.forEach((entry) => {
      const card = creativeNode('article','museum-memory glass-card');
      const head = creativeNode('div','museum-memory-head');
      const copy = creativeNode('div','');
      copy.appendChild(creativeNode('p','eyebrow',creativeDate(entry.createdAt,false)));
      copy.appendChild(creativeNode('h3','',entry.title || 'Um registro sem título'));
      head.appendChild(copy);
      const select = creativeNode('select','museum-assignment');
      select.setAttribute('aria-label','Coleção deste registro');
      select.dataset.museumAssign = entry.id;
      select.appendChild(new Option('sem coleção',''));
      museum.collections.forEach((name) => select.appendChild(new Option(name,name)));
      select.value = museum.assignments[entry.id] || '';
      head.appendChild(select);
      card.appendChild(head);
      if ((entry.text || '').trim()) card.appendChild(creativeNode('p','museum-memory-text',entry.text));
      const mediaWrap = creativeNode('div','museum-memory-media');
      (Array.isArray(entry.media) ? entry.media : []).forEach((media) => {
        if (!media || !media.blob) return;
        const itemWrap = creativeNode('div','museum-media-item');
        const url = URL.createObjectURL(media.blob);
        creativeMuseumUrls.push(url);
        if (media.type === 'image') {
          const image = creativeNode('img','', '');
          image.src = url; image.alt = media.name || 'Fotografia guardada';
          itemWrap.appendChild(image);
        } else if (media.type === 'audio') {
          const audio = document.createElement('audio');
          audio.controls = true; audio.src = url; audio.preload = 'none';
          itemWrap.appendChild(audio);
        }
        if (media.name) itemWrap.appendChild(creativeNode('p','museum-media-name',media.name));
        mediaWrap.appendChild(itemWrap);
      });
      if (mediaWrap.childElementCount) card.appendChild(mediaWrap);
      if (Array.isArray(entry.tags) && entry.tags.length) card.appendChild(creativeNode('p','creative-tags',entry.tags.map((tag) => '#' + tag).join('  ')));
      container.appendChild(card);
    });
  }

  function renderPersonalMessages() {
    const list = $('#personalMessageList');
    const empty = $('#personalMessageEmpty');
    if (!list || !empty) return;
    list.replaceChildren();
    const messages = creativeReadArray(PERSONAL_MESSAGES_KEY).sort((a,b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
    empty.classList.toggle('hidden', messages.length > 0);
    messages.forEach((message) => {
      const card = creativeNode('article','personal-message-card');
      const header = creativeNode('div','personal-message-heading');
      const text = creativeNode('div','');
      text.appendChild(creativeNode('p','eyebrow',message.situationLabel || 'para um momento especial'));
      text.appendChild(creativeNode('h3','',message.title || 'Uma mensagem para mim'));
      header.appendChild(text);
      const remove = creativeNode('button','message-delete','apagar');
      remove.type = 'button'; remove.dataset.deletePersonalMessage = message.id;
      remove.setAttribute('aria-label','Apagar mensagem ' + (message.title || 'sem título'));
      header.appendChild(remove);
      card.appendChild(header);
      card.appendChild(creativeNode('p','personal-message-copy',message.body));
      list.appendChild(card);
    });
  }
  function savePersonalMessage(event) {
    event.preventDefault();
    const body = $('#personalMessageBody').value.trim();
    if (!body) { $('#personalMessageStatus').textContent = 'Escreva o recado que gostaria de guardar.'; return; }
    const select = $('#personalMessageSituation');
    const situation = select.options[select.selectedIndex];
    const items = creativeReadArray(PERSONAL_MESSAGES_KEY);
    items.unshift({ id:creativeMakeId(), situation:select.value, situationLabel:situation ? situation.textContent : 'para mim', title:$('#personalMessageTitle').value.trim().slice(0,70), body:body.slice(0,1200), createdAt:Date.now() });
    try {
      localStorage.setItem(PERSONAL_MESSAGES_KEY, JSON.stringify(items.slice(0,300)));
      $('#personalMessageTitle').value = '';
      $('#personalMessageBody').value = '';
      $('#personalMessageStatus').textContent = 'Seu recado ficou guardado neste navegador.';
      renderPersonalMessages();
    } catch (error) { $('#personalMessageStatus').textContent = 'Não foi possível guardar. Talvez o armazenamento esteja cheio.'; }
  }
  function showSurpriseMessage() {
    const messages = creativeReadArray(PERSONAL_MESSAGES_KEY);
    if (!messages.length) {
      $('#messageSurpriseTitle').textContent = 'Deixe uma palavra sua para outro dia.';
      $('#messageSurpriseBody').textContent = 'Quando você guardar mensagens, poderá sortear uma delas aqui.';
      return;
    }
    const message = messages[Math.floor(Math.random() * messages.length)];
    $('#messageSurpriseTitle').textContent = message.title || message.situationLabel || 'Uma mensagem para mim';
    $('#messageSurpriseBody').textContent = message.body;
  }

  function readTodayWeather() {
    return creativeReadArray(WEATHER_KEY).find((item) => item.date === creativeToday()) || null;
  }
  function recentMood() {
    return creativeReadArray(MOOD_KEY).sort((a,b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0))[0] || null;
  }
  function setInteriorWeather(weather, focusNote) {
    if (!WEATHER_INFO[weather]) return;
    selectedInteriorWeather = weather;
    $('#weatherOptions .weather-option').forEach((button) => {
      const selected = button.dataset.weather === weather;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    const info = WEATHER_INFO[weather];
    $('#weatherCurrentIcon').textContent = info.icon;
    $('#weatherCurrentTitle').textContent = info.title;
    $('#weatherCurrentText').textContent = info.text;
    if (focusNote !== undefined) $('#weatherNote').value = focusNote;
  }
  function renderWeatherHistory() {
    const list = $('#weatherHistory');
    if (!list) return;
    list.replaceChildren();
    const history = creativeReadArray(WEATHER_KEY).sort((a,b) => String(b.date).localeCompare(String(a.date))).slice(0,12);
    if (!history.length) {
      list.appendChild(creativeNode('p','weather-history-empty','Seus climas aparecerão aqui quando você guardar o primeiro.'));
      return;
    }
    history.forEach((item) => {
      const info = WEATHER_INFO[item.weather] || WEATHER_INFO.cloud;
      const row = creativeNode('article','weather-history-item');
      row.appendChild(creativeNode('span','weather-history-icon',info.icon));
      const details = creativeNode('div','');
      details.appendChild(creativeNode('h3','',info.name + ' · ' + creativeDate(item.createdAt || item.date,false)));
      if (item.note) details.appendChild(creativeNode('p','',item.note));
      if (item.moodLabel) details.appendChild(creativeNode('small','', 'check-in: ' + item.moodLabel));
      row.appendChild(details);
      list.appendChild(row);
    });
  }
  function renderWeather() {
    const today = readTodayWeather();
    const mood = recentMood();
    const moodInfo = mood && MOODS[mood.mood] ? MOODS[mood.mood] : null;
    const moodSuggested = moodInfo ? (MOOD_WEATHER[mood.mood] || 'cloud') : 'cloud';
    const selected = today ? today.weather : moodSuggested;
    const note = today ? today.note || '' : '';
    setInteriorWeather(selected, note);
    $('#weatherMoodLink').textContent = today
      ? 'Clima escolhido por você hoje.' + (today.moodLabel ? ' Check-in relacionado: ' + today.moodLabel + '.' : '')
      : (moodInfo ? 'Seu último check-in foi “' + moodInfo.label + '”. Esse sentimento pode lembrar um clima de ' + WEATHER_INFO[moodSuggested].name + ', mas a escolha é sempre sua.' : 'Você ainda não fez um check-in emocional. Escolha o símbolo que combina com seu dia.');
    renderWeatherHistory();
  }
  function saveWeatherToday() {
    const notes = $('#weatherNote').value.trim().slice(0,700);
    const existing = creativeReadArray(WEATHER_KEY).filter((item) => item.date !== creativeToday());
    const mood = recentMood();
    const moodInfo = mood && MOODS[mood.mood] ? MOODS[mood.mood] : null;
    existing.unshift({ id:creativeMakeId(), date:creativeToday(), weather:selectedInteriorWeather, note:notes, moodLabel:moodInfo ? moodInfo.label : '', createdAt:Date.now() });
    try {
      localStorage.setItem(WEATHER_KEY, JSON.stringify(existing.slice(0,365)));
      $('#weatherStatus').textContent = 'O clima de hoje ficou guardado neste navegador.';
      renderWeatherHistory();
      $('#weatherMoodLink').textContent = 'Clima escolhido por você hoje.' + (moodInfo ? ' Check-in relacionado: ' + moodInfo.label + '.' : '');
    } catch (error) { $('#weatherStatus').textContent = 'Não foi possível guardar esse clima neste navegador.'; }
  }

  function updateDeepWritingTimer() {
    const seconds = Math.max(0, deepWritingSeconds);
    const minutes = String(Math.floor(seconds / 60)).padStart(2,'0');
    const rest = String(seconds % 60).padStart(2,'0');
    $('#writingTimerDisplay').textContent = minutes + ':' + rest;
  }
  function stopDeepWritingTimer() {
    if (deepWritingInterval) window.clearInterval(deepWritingInterval);
    deepWritingInterval = null;
  }
  function startDeepWritingTimer() {
    if (deepWritingInterval) { stopDeepWritingTimer(); $('#writingTimerStart').textContent = 'continuar'; return; }
    if (deepWritingSeconds <= 0) deepWritingSeconds = Number($('#writingTimerLength').value || 5) * 60;
    updateDeepWritingTimer();
    $('#writingTimerStart').textContent = 'pausar';
    deepWritingInterval = window.setInterval(() => {
      deepWritingSeconds = Math.max(0, deepWritingSeconds - 1);
      updateDeepWritingTimer();
      if (deepWritingSeconds <= 0) {
        stopDeepWritingTimer();
        $('#writingTimerStart').textContent = 'começar de novo';
        $('#deepWritingStatus').textContent = 'O tempo terminou. Você pode continuar escrevendo ou parar por aqui — sem obrigação.';
      }
    },1000);
  }
  function resetDeepWritingTimer() {
    stopDeepWritingTimer();
    deepWritingSeconds = Number($('#writingTimerLength').value || 5) * 60;
    $('#writingTimerStart').textContent = 'começar';
    updateDeepWritingTimer();
  }
  async function saveDeepWriting() {
    const text = $('#deepWritingText').value.trim();
    if (!text) { $('#deepWritingStatus').textContent = 'Escreva um pouco antes de guardar no diário.'; $('#deepWritingText').focus(); return; }
    try {
      await dbPut({ id:creativeMakeId(), title:'Escrita profunda', text:text, tags:['escrita-profunda'], createdAt:Date.now(), media:[] });
      $('#deepWritingStatus').textContent = 'Seu texto foi guardado no diário. O rascunho continua aqui até você decidir limpá-lo.';
    } catch (error) { $('#deepWritingStatus').textContent = 'Não foi possível guardar no diário. Tente novamente.'; }
  }
  function clearDeepWritingDraft() {
    if (!$('#deepWritingText').value.trim()) {
      localStorage.removeItem(DEEP_WRITING_DRAFT_KEY);
      $('#deepWritingStatus').textContent = 'O rascunho está vazio.';
      return;
    }
    if (!window.confirm('Quer apagar este rascunho deste dispositivo? Ele não poderá ser recuperado.')) return;
    $('#deepWritingText').value = '';
    localStorage.removeItem(DEEP_WRITING_DRAFT_KEY);
    $('#deepWritingStatus').textContent = 'Rascunho apagado.';
  }
  function initCreativeFeatures() {
    const stars = $('#constellationStars');
    if (stars) stars.addEventListener('click', (event) => {
      const star = event.target.closest('[data-memory-key]');
      if (!star) return;
      const item = creativeConstellationItems.find((memory) => memory.key === star.dataset.memoryKey);
      showConstellationMemory(item);
    });
    $('#constellationTagFilter')?.addEventListener('change', renderConstellation);

    $('#pastEntrySelector')?.addEventListener('change', (event) => showPastMemory(event.target.value));
    $('#savePastReflectionButton')?.addEventListener('click', savePastReflection);

    $('#museumCollectionForm')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const field = $('#museumCollectionName');
      const name = field.value.trim().slice(0,40);
      if (!name) { $('#museumStatus').textContent = 'Dê um nome para essa coleção.'; field.focus(); return; }
      const state = readMuseumState();
      if (state.collections.some((item) => item.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))) {
        $('#museumStatus').textContent = 'Essa coleção já existe.';
        return;
      }
      state.collections.push(name);
      try {
        writeMuseumState(state);
        field.value = '';
        $('#museumStatus').textContent = 'Coleção criada. Você pode atribuir registros a ela.';
        renderMuseum();
      } catch (error) { $('#museumStatus').textContent = 'Não foi possível guardar essa coleção.'; }
    });
    $('#museumTypeFilter')?.addEventListener('change', renderMuseum);
    $('#museumCollectionFilter')?.addEventListener('change', renderMuseum);
    $('#museumItems')?.addEventListener('change', (event) => {
      const select = event.target.closest('[data-museum-assign]');
      if (!select) return;
      const state = readMuseumState();
      if (select.value) state.assignments[select.dataset.museumAssign] = select.value;
      else delete state.assignments[select.dataset.museumAssign];
      try { writeMuseumState(state); $('#museumStatus').textContent = 'Coleção atualizada.'; }
      catch (error) { $('#museumStatus').textContent = 'Não foi possível atualizar a coleção.'; }
    });

    $('#personalMessageForm')?.addEventListener('submit', savePersonalMessage);
    $('#surpriseMessageButton')?.addEventListener('click', showSurpriseMessage);
    $('#personalMessageList')?.addEventListener('click', (event) => {
      const remove = event.target.closest('[data-delete-personal-message]');
      if (!remove) return;
      const remaining = creativeReadArray(PERSONAL_MESSAGES_KEY).filter((item) => String(item.id) !== remove.dataset.deletePersonalMessage);
      try { localStorage.setItem(PERSONAL_MESSAGES_KEY, JSON.stringify(remaining)); renderPersonalMessages(); $('#personalMessageStatus').textContent = 'Mensagem apagada.'; }
      catch (error) { $('#personalMessageStatus').textContent = 'Não foi possível apagar essa mensagem.'; }
    });

    $('#weatherOptions .weather-option').forEach((button) => button.addEventListener('click', () => setInteriorWeather(button.dataset.weather)));
    $('#saveWeatherButton')?.addEventListener('click', saveWeatherToday);

    $('#deepWritingText')?.addEventListener('input', () => {
      try { localStorage.setItem(DEEP_WRITING_DRAFT_KEY, $('#deepWritingText').value); $('#deepWritingStatus').textContent = 'Rascunho salvo automaticamente neste navegador.'; }
      catch (error) { $('#deepWritingStatus').textContent = 'Não foi possível salvar automaticamente. Copie seu texto por segurança.'; }
    });
    $('#writingFocusButton')?.addEventListener('click', () => {
      document.body.classList.add('writing-focus');
      $('#deepWritingText').focus();
    });
    $('#exitWritingFocusButton')?.addEventListener('click', () => document.body.classList.remove('writing-focus'));
    $('#writingTimerStart')?.addEventListener('click', startDeepWritingTimer);
    $('#writingTimerReset')?.addEventListener('click', resetDeepWritingTimer);
    $('#writingTimerLength')?.addEventListener('change', resetDeepWritingTimer);
    $('#saveDeepWritingButton')?.addEventListener('click', saveDeepWriting);
    $('#clearDeepWritingDraftButton')?.addEventListener('click', clearDeepWritingDraft);
    $('#deepWritingText').value = localStorage.getItem(DEEP_WRITING_DRAFT_KEY) || '';
    resetDeepWritingTimer();
    renderPersonalMessages();
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
    const personalRefuge=readObject(REFUGE_PERSONAL_KEY)||{};
    setRefugeAccent(personalRefuge.accent||'#82b3a2');setRefugePhrase(personalRefuge.phrase||'');
    const savedPresets=readRefugePresets(),savedPreset=savedPresets[savedPresets.length-1]||readObject(REFUGE_KEY);
    if(savedPreset)applyRefugePreset(savedPreset);
    renderRefugePreset();
    $('#refugeAccentColor').addEventListener('input',()=>setRefugeAccent($('#refugeAccentColor').value));
    $('#refugeAccentColor').addEventListener('change',()=>setRefugeAccent($('#refugeAccentColor').value,true));
    $('#refugePersonalPhraseInput').addEventListener('input',()=>setRefugePhrase($('#refugePersonalPhraseInput').value));
    $('#refugePersonalPhraseInput').addEventListener('change',()=>setRefugePhrase($('#refugePersonalPhraseInput').value,true));
    $('.refuge-mood-preset').forEach(button=>button.addEventListener('click',()=>applyRefugeQuickPreset(button.dataset.refugeMood)));
    $('#refugePresetSelect').addEventListener('change',()=>{
      const selected=readRefugePresets().find(item=>String(item.id||'')===$('#refugePresetSelect').value);
      if(selected&&$('#refugePresetName'))$('#refugePresetName').value=selected.name||'';
    });
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
      if (button.dataset.section === 'constelacao') renderConstellation();
      if (button.dataset.section === 'eu-passado') renderPastMemory();
      if (button.dataset.section === 'museu') renderMuseum();
      if (button.dataset.section === 'mensagens') renderPersonalMessages();
      if (button.dataset.section === 'clima') renderWeather();
      if (button.dataset.section === 'escrita') { document.body.classList.remove('writing-focus'); if (!deepWritingSeconds) resetDeepWritingTimer(); }
      if (button.dataset.section !== 'refugio' && playing) stopAmbientSound(true);
    }));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && playing) stopAmbientSound(true);
    });

    initCreativeFeatures();

    const pinConfig = getPinConfig();
    if (pinConfig && sessionStorage.getItem(UNLOCKED_KEY) !== '1') {
      $('#privacyGate').classList.remove('hidden');
      window.setTimeout(() => $('#pinGateInput').focus(), 0);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initFeatures, { once: true });
  else initFeatures();
})();
