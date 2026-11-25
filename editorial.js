/* Atalhos da página inicial. */
(() => {
  'use strict';

  document.addEventListener('click', (event) => {
    const action = event.target.closest('[data-home-action]');
    if (action) {
      const target = document.getElementById('entryText');
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        window.setTimeout(() => target.focus({ preventScroll: true }), 350);
      }
      return;
    }

    const shortcut = event.target.closest('[data-home-section]');
    if (!shortcut) return;

    const sectionId = shortcut.dataset.homeSection;
    const target = document.getElementById(sectionId);
    if (!target) return;

    if (typeof window.switchSection === 'function') {
      window.switchSection(sectionId);
    } else {
      document.querySelectorAll('.page').forEach((page) => {
        page.classList.toggle('hidden-section', page.id !== sectionId);
      });
      document.querySelectorAll('.nav-link').forEach((link) => {
        link.classList.toggle('active', link.dataset.section === sectionId);
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
})();