/* src/content/hydrate/syllabus.js */

function hydrateSyllabusDetail(root) {
    const links = Array.from(root.querySelectorAll('.ku-rightnav-link[href^="#"]'));
    if (!links.length) return;
    const sections = links
      .map((link) => {
        const id = link.getAttribute('href').slice(1);
        const section = root.querySelector(`#${CSS.escape(id)}`);
        return section ? { link, section } : null;
      })
      .filter(Boolean);
    if (!sections.length) return;

    const setActive = (activeId = '') => {
      sections.forEach(({ link, section }) => {
        link.classList.toggle('active', section.id === activeId);
      });
    };

    sections.forEach(({ link, section }) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setActive(section.id);
      });
    });

    if (typeof IntersectionObserver !== 'function') {
      setActive(sections[0].section.id);
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
      if (visible?.target?.id) {
        setActive(visible.target.id);
      }
    }, {
      root: document.getElementById(SYLLABUS_ROOT_ID),
      rootMargin: '-15% 0px -55% 0px',
      threshold: [0.1, 0.25, 0.5, 0.75]
    });

    sections.forEach(({ section }) => observer.observe(section));
    setActive(sections[0].section.id);
  }
