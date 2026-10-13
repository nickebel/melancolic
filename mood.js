/* Minha pausa: check-in emocional, perguntas reflexivas e respiração guiada.
   Funciona no navegador e usa uma chave separada para não alterar o diário existente. */
(() => {
  'use strict';

  const STORAGE_KEY = 'melancolic-mood-checkins-v1';
  const moods = {
    calmo: { label: 'em paz', emoji: '☁', prompt: 'O que está ajudando você a sentir um pouco de paz?', support: 'Existe algo pequeno deste momento que você gostaria de guardar?' },
    feliz: { label: 'feliz', emoji: '☀', prompt: 'O que você gostaria de guardar deste momento?', support: 'Com quem ou com o que você gostaria de compartilhar essa alegria?' },
    ansioso: { label: 'ansioso', emoji: '〰', prompt: 'Qual é a menor coisa que você pode resolver agora?', support: 'O que pode ficar para depois, sem precisar ser resolvido neste instante?' },
    triste: { label: 'triste', emoji: '☂', prompt: 'O que você precisava ouvir hoje?', support: 'Do que você precisa um pouco mais: descanso, companhia, espaço ou cuidado?' },
    cansado: { label: 'cansado', emoji: '☾', prompt: 'O que pode esperar até amanhã?', support: 'Qual seria uma forma gentil de diminuir a cobrança por hoje?' },
    confuso: { label: 'confuso', emoji: '≈', prompt: 'O que você já sabe, mesmo sem ter todas as respostas?', support: 'Qual é a próxima pequena coisa que pode ficar mais clara?' },
    irritado: { label: 'irritado', emoji: '✳', prompt: 'Qual limite seu precisa ser respeitado?', support: 'O que ajudaria você a responder com mais calma, sem ignorar o que sente?' }
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  let selectedMood = '';
  let breathInterval = null;
  let breathPhaseTimeout = null;
  let breathStartedAt = 0;
  let breathPhase = 'inhale';
  let breathPhaseRemaining = 4;
  let breathSecondsLeft = 60;

  function readCheckins() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.filter((item) => item && item.id && moods[item.mood]) : [];
    } catch (error) {
      console.warn('Não foi possível ler o mapa de sentimentos.', error);
      return [];
    }
  }

  function writeCheckins(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  function formatMoodDate(timestamp, includeTime = true) {
    const options = includeTime
      ? { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
      : { day: '2-digit', month: 'short' };
    return new Intl.DateTimeFormat('pt-BR', options).format(new Date(timestamp));
  }

  function setMood(mood) {
    selectedMood = mood;
    $$('.mood-option').forEach((button) => {
      const active = button.dataset.mood === mood;
      button.setAttribute('aria-pressed', String(active));
    });
    const info = moods[mood];
    if (!info) return;
    $('#reflectionTitle').textContent = info.prompt;
    $('#reflectionText').textContent = info.support;
    $('#reflectionBox').classList.add('has-selection');
    $('#moodStatus').textContent = '';
  }

  function saveMood() {
    const status = $('#moodStatus');
    if (!selectedMood || !moods[selectedMood]) {
      status.textContent = 'Escolha um sentimento antes de guardar.';
      $('#moodOptions')?.focus();
      return;
    }

    const intensity = Number($('#moodIntensity').value);
    const note = $('#moodNote').value.trim();
    const checkins = readCheckins();
    checkins.unshift({
      id: (window.crypto && typeof crypto.randomUUID === 'function') ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      mood: selectedMood,
      intensity: Math.max(1, Math.min(5, intensity || 3)),
      note: note.slice(0, 1000),
      createdAt: Date.now()
    });

    try {
      writeCheckins(checkins.slice(0, 500));
      $('#moodNote').value = '';
      status.textContent = 'Check-in guardado neste dispositivo.';
      renderMoodHistory();
    } catch (error) {
      console.error(error);
      status.textContent = 'Não foi possível guardar. Verifique o armazenamento do navegador.';
    }
  }

  function makeHistoryItem(item) {
    const info = moods[item.mood];
    const article = document.createElement('article');
    article.className = 'mood-history-item';

    const emoji = document.createElement('div');
    emoji.className = 'mood-history-emoji';
    emoji.setAttribute('aria-hidden', 'true');
    emoji.textContent = info.emoji;

    const content = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = `${info.label} · intensidade ${item.intensity}/5`;
    content.appendChild(title);
    if (item.note) {
      const note = document.createElement('p');
      note.textContent = item.note;
      content.appendChild(note);
    }

    const date = document.createElement('time');
    date.dateTime = new Date(item.createdAt).toISOString();
    date.textContent = formatMoodDate(item.createdAt);

    article.append(emoji, content, date);
    return article;
  }

  function renderMoodHistory() {
    const history = $('#moodHistory');
    const map = $('#moodMap');
    const empty = $('#emptyMoodHistory');
    const stats = $('#moodStats');
    if (!history || !map || !empty || !stats) return;

    const checkins = readCheckins();
    history.replaceChildren();
    map.replaceChildren();
    stats.textContent = `${checkins.length} ${checkins.length === 1 ? 'check-in' : 'check-ins'}`;
    empty.classList.toggle('hidden', checkins.length > 0);
    $('#clearMoodHistoryButton')?.classList.toggle('hidden', checkins.length === 0);

    const latestByDay = new Map();
    checkins.forEach((item) => {
      const day = new Date(item.createdAt);
      const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
      if (!latestByDay.has(key)) latestByDay.set(key, item);
    });

    const today = new Date();
    for (let i = 13; i >= 0; i -= 1) {
      const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
      const item = latestByDay.get(key);
      const cell = document.createElement('div');
      cell.className = `mood-day${item ? '' : ' is-empty'}`;
      const number = document.createElement('span');
      number.className = 'day-number';
      number.textContent = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit' }).format(day).replace('.', '');
      const emoji = document.createElement('span');
      emoji.className = 'day-emoji';
      emoji.textContent = item ? moods[item.mood].emoji : '·';
      const label = document.createElement('span');
      label.className = 'day-label';
      label.textContent = item ? moods[item.mood].label : 'sem registro';
      cell.title = item ? `${moods[item.mood].label}, intensidade ${item.intensity}/5` : 'Nenhum check-in neste dia';
      cell.append(number, emoji, label);
      map.appendChild(cell);
    }

    checkins.slice(0, 12).forEach((item) => history.appendChild(makeHistoryItem(item)));
  }

  function updateIntensity() {
    const value = Number($('#moodIntensity').value || 3);
    $('#intensityValue').textContent = `${value} de 5`;
  }

  function setBreathPhase(phase) {
    breathPhase = phase;
    const visual = $('#breathVisual');
    visual.classList.toggle('is-inhale', phase === 'inhale');
    visual.classList.toggle('is-exhale', phase === 'exhale');
    $('#breathPhase').textContent = phase === 'inhale' ? 'inspire' : 'expire';
    breathPhaseRemaining = phase === 'inhale' ? 4 : 6;
  }

  function updateBreathLabels() {
    $('#breathCountdown').textContent = `${breathSecondsLeft} s`;
    $('#breathStatus').textContent = breathSecondsLeft > 0
      ? 'Sem forçar. Se ficar desconfortável, respire normalmente e encerre.'
      : 'Pausa concluída. Leve o tempo que precisar antes de continuar.';
  }

  function stopBreathing(completed = false) {
    if (breathInterval) window.clearInterval(breathInterval);
    if (breathPhaseTimeout) window.clearTimeout(breathPhaseTimeout);
    breathInterval = null;
    breathPhaseTimeout = null;
    $('#breathVisual').classList.remove('is-inhale', 'is-exhale');
    $('#breathPhase').textContent = completed ? 'bem aqui' : 'pausa';
    $('#breathStartButton').classList.toggle('hidden', completed);
    $('#breathStopButton').classList.add('hidden');
    $('#breathStartButton').textContent = completed ? 'fazer novamente' : 'continuar quando quiser';
    if (completed) {
      breathSecondsLeft = 0;
      $('#breathCountdown').textContent = 'feito';
      $('#breathStatus').textContent = 'Você reservou um minuto para si. Não precisa sentir nada específico agora.';
    } else {
      $('#breathStatus').textContent = 'Exercício encerrado. Continue respirando do jeito que for natural para você.';
    }
  }

  function startBreathing() {
    if (breathInterval) return;
    breathSecondsLeft = 60;
    setBreathPhase('inhale');
    breathPhaseRemaining = 4;
    $('#breathStartButton').classList.add('hidden');
    $('#breathStopButton').classList.remove('hidden');
    $('#breathStatus').textContent = 'Inspire suavemente por 4 segundos e expire por 6, sem prender o ar.';
    updateBreathLabels();

    breathInterval = window.setInterval(() => {
      breathSecondsLeft -= 1;
      breathPhaseRemaining -= 1;
      updateBreathLabels();

      if (breathSecondsLeft <= 0) {
        stopBreathing(true);
        return;
      }
      if (breathPhaseRemaining <= 0) {
        setBreathPhase(breathPhase === 'inhale' ? 'exhale' : 'inhale');
      }
    }, 1000);
  }

  function clearMoodHistory() {
    const ok = window.confirm('Apagar todos os check-ins do mapa de sentimentos deste dispositivo? Isso não apaga seus desabafos, fotos ou áudios.');
    if (!ok) return;
    try {
      localStorage.removeItem(STORAGE_KEY);
      renderMoodHistory();
      $('#moodStatus').textContent = 'Mapa de sentimentos apagado.';
    } catch (error) {
      console.error(error);
      $('#moodStatus').textContent = 'Não foi possível apagar os registros.';
    }
  }

  function initMoodSpace() {
    if (!$('#pausa')) return;
    $('#moodTodayLabel').textContent = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date());
    $$('.mood-option').forEach((button) => button.addEventListener('click', () => setMood(button.dataset.mood)));
    $('#moodIntensity')?.addEventListener('input', updateIntensity);
    $('#saveMoodButton')?.addEventListener('click', saveMood);
    $('#breathStartButton')?.addEventListener('click', startBreathing);
    $('#breathStopButton')?.addEventListener('click', () => stopBreathing(false));
    $('#clearMoodHistoryButton')?.addEventListener('click', clearMoodHistory);
    $$('.nav-link').forEach((button) => button.addEventListener('click', () => {
      if (button.dataset.section === 'pausa') renderMoodHistory();
    }));
    updateIntensity();
    renderMoodHistory();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMoodSpace, { once: true });
  } else {
    initMoodSpace();
  }
})();
