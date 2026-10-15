/* Navegação do Melancolic: separado para manter a troca de páginas independente dos outros recursos. */
(() => {
  'use strict';

  const nav = document.getElementById('mainNav');
  const toggle = document.getElementById('menuToggleButton');
  if (!nav || !toggle) return;

  function closeMenu() {
    nav.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Abrir menu de navegação');
  }

  function openSection(sectionId, button) {
    const target = document.getElementById(sectionId);
    const pages = Array.from(document.querySelectorAll('.page'));
    if (!target || !pages.includes(target)) {
      console.error('[Melancolic] A seção de navegação não foi encontrada:', sectionId);
      return;
    }

    const parentGroup = button && button.closest('.nav-group');
    if (parentGroup) {
      parentGroup.classList.add('is-open');
      const disclosure = parentGroup.querySelector('.nav-group-toggle');
      if (disclosure) disclosure.setAttribute('aria-expanded', 'true');
    }

    if (typeof window.switchSection === 'function') {
      // Reuse the main controller so records and media refresh when those pages are opened.
      window.switchSection(sectionId);
    } else {
      document.body.classList.remove('writing-focus');
      pages.forEach((page) => {
        page.classList.toggle('hidden-section', page.id !== sectionId);
      });
      document.querySelectorAll('.nav-link').forEach((link) => {
        link.classList.toggle('active', link === button);
      });
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); }
      catch (error) { window.scrollTo(0, 0); }
    }
    closeMenu();
  }

  toggle.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const opening = !nav.classList.contains('is-open');
    nav.classList.toggle('is-open', opening);
    toggle.setAttribute('aria-expanded', String(opening));
    toggle.setAttribute('aria-label', opening ? 'Fechar menu de navegação' : 'Abrir menu de navegação');
  });

  // Delegação de eventos: cada item continua navegando mesmo se outro script de recurso falhar.
  nav.addEventListener('click', (event) => {
    const disclosure = event.target.closest ? event.target.closest('.nav-group-toggle') : null;
    if (disclosure && nav.contains(disclosure)) {
      event.preventDefault();
      const group = disclosure.closest('.nav-group');
      const opening = !group.classList.contains('is-open');
      group.classList.toggle('is-open', opening);
      disclosure.setAttribute('aria-expanded', String(opening));
      return;
    }
    const button = event.target.closest ? event.target.closest('.nav-link') : null;
    if (!button || !nav.contains(button)) return;
    event.preventDefault();
    openSection(button.dataset.section, button);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest || !event.target.closest('.topbar')) closeMenu();
  });
})();