/* ==================================================
   VAPE OFF — Campaña interactiva
   script.js
   ================================================== */
(() => {
  'use strict';

  // ============================================================
  // 0. UTILIDADES
  // ============================================================
  const $  = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand  = (a, b) => a + Math.random() * (b - a);

  // ============================================================
  // 1. LOADER
  // ============================================================
  window.addEventListener('load', () => {
    setTimeout(() => $('#loader')?.classList.add('is-hidden'), 450);
  });

  // ============================================================
  // 2. NAVBAR — sticky, burger, scroll active
  // ============================================================
  const nav      = $('#nav');
  const burger   = $('#navBurger');
  const navMenu  = $('#navMenu');
  const navLinks = $$('.nav__link');

  window.addEventListener('scroll', () => {
    nav.classList.toggle('is-scrolled', window.scrollY > 30);
  }, { passive: true });

  burger.addEventListener('click', () => {
    const open = navMenu.classList.toggle('is-open');
    burger.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', String(open));
  });
  navLinks.forEach(a => a.addEventListener('click', () => {
    navMenu.classList.remove('is-open');
    burger.classList.remove('is-open');
  }));

  // active link via section visibility
  const sections = $$('main section[id]');
  const setActive = (id) => {
    navLinks.forEach(l => l.classList.toggle('is-active', l.getAttribute('href') === `#${id}`));
  };
  const navObs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) setActive(e.target.id);
    });
  }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
  sections.forEach(s => navObs.observe(s));

  // ============================================================
  // 3. REVEAL on scroll
  // ============================================================
  const revealObs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('is-in');
        // bars
        $$('.bar', e.target).forEach(b => b.classList.add('is-in'));
        $$('.dmg__bar', e.target).forEach(b => b.classList.add('is-in'));
        revealObs.unobserve(e.target);
      }
    });
  }, { threshold: 0.15 });
  $$('.reveal').forEach(el => revealObs.observe(el));

  // bars dentro de cards (las cards en sí ya están reveal, pero forzamos por las dudas)
  $$('.card .bar, .dmg .dmg__bar').forEach(b => {
    new IntersectionObserver((entries, o) => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in'); o.unobserve(e.target); } });
    }, { threshold: 0.4 }).observe(b);
  });

  // ============================================================
  // 4. CARD GLOW seguimiento de mouse
  // ============================================================
  $$('.card').forEach(card => {
    card.addEventListener('mousemove', (ev) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${((ev.clientX - r.left) / r.width) * 100}%`);
      card.style.setProperty('--my', `${((ev.clientY - r.top) / r.height) * 100}%`);
    });
  });

  // ============================================================
  // 5. CONTADORES
  // ============================================================
  const animateCount = (el) => {
    const target = +el.dataset.count;
    const dur = 1800;
    const start = performance.now();
    const fmt = (n) => n >= 1000 ? n.toLocaleString('es-MX') : String(n);
    const tick = (now) => {
      const t = clamp((now - start) / dur, 0, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const val = Math.round(target * eased);
      el.textContent = fmt(val);
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const countObs = new IntersectionObserver((entries, o) => {
    entries.forEach(e => {
      if (e.isIntersecting) { animateCount(e.target); o.unobserve(e.target); }
    });
  }, { threshold: 0.4 });
  $$('.stat__num[data-count]').forEach(el => countObs.observe(el));

  // ============================================================
  // 6. SHARE
  // ============================================================
  $('#btnShare')?.addEventListener('click', async () => {
    const data = {
      title: 'VAPE OFF — Cada inhalación deja una marca',
      text: 'Una experiencia interactiva sobre los riesgos del vapeo. ¿Cuánto resistes en el juego?',
      url: location.href
    };
    try {
      if (navigator.share) await navigator.share(data);
      else {
        await navigator.clipboard.writeText(data.url);
        alert('Enlace copiado al portapapeles');
      }
    } catch (_) { /* cancelled */ }
  });

  // ============================================================
  // 7. JUEGO — PULMÓN RUN
  // ============================================================
  const canvas  = $('#gameCanvas');
  const ctx     = canvas.getContext('2d');
  const screenStart = $('#screenStart');
  const screenOver  = $('#screenOver');
  const hudScore = $('#hudScore');
  const hudLives = $('#hudLives');
  const hudLevel = $('#hudLevel');
  const hudBest  = $('#hudBest');
  const finalScore = $('#finalScore');
  const finalMsg   = $('#finalMsg');

  const W = 900, H = 540;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);

  const resizeCanvas = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // ----- estado del juego
  const state = {
    running: false,
    paused: false,
    score: 0,
    lives: 3,
    level: 1,
    elapsed: 0,
    spawnTimer: 0,
    spawnInterval: 0.95,    // segundos
    speedMul: 1,
    entities: [],
    particles: [],
    stars: [],
    player: null,
    keys: { left: false, right: false },
    touchTargetX: null,
    lastTime: 0,
    flash: 0,
  };

  const BEST_KEY = 'vapeoff_best';
  const RANK_KEY = 'vapeoff_rank';

  hudBest.textContent = (+localStorage.getItem(BEST_KEY) || 0).toString();

  // ----- generación inicial de fondo (estrellas/partículas decorativas)
  const initStars = () => {
    state.stars = [];
    for (let i = 0; i < 60; i++) {
      state.stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.5 + 0.3,
        s: Math.random() * 0.5 + 0.2,
        c: ['#00ff9d', '#b14bff', '#00d9ff', '#ffffff'][Math.floor(Math.random() * 4)],
        a: Math.random() * 0.6 + 0.2,
      });
    }
  };
  initStars();

  // ----- Player
  const newPlayer = () => ({
    x: W / 2,
    y: H - 70,
    w: 70,
    h: 56,
    speed: 420,
    invuln: 0, // ms
  });

  // ----- Entities (vape, smoke, o2, apple)
  const TYPES = {
    vape:  { color: '#b14bff', r: 22, harmful: true,  pts: 0,  glow: '#b14bff' },
    smoke: { color: '#9aa0b8', r: 28, harmful: true,  pts: 0,  glow: 'rgba(255,255,255,.4)' },
    o2:    { color: '#00d9ff', r: 16, harmful: false, pts: 10, glow: '#00d9ff' },
    apple: { color: '#00ff9d', r: 18, harmful: false, pts: 25, glow: '#00ff9d' },
  };

  const spawnEntity = () => {
    // probabilidad: 45% vape, 25% humo, 20% o2, 10% apple
    const r = Math.random();
    let type;
    if (r < 0.45) type = 'vape';
    else if (r < 0.70) type = 'smoke';
    else if (r < 0.90) type = 'o2';
    else type = 'apple';

    const t = TYPES[type];
    state.entities.push({
      type, ...t,
      x: rand(40, W - 40),
      y: -40,
      vy: rand(120, 200) * state.speedMul,
      vx: rand(-30, 30),
      rot: 0,
      vr: rand(-2, 2),
    });
  };

  // ----- Particles
  const burst = (x, y, color, n = 18) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(80, 260);
      state.particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(.4, .9),
        age: 0,
        r: rand(2, 4),
        color,
      });
    }
  };

  // ============================================================
  // INPUT
  // ============================================================
  window.addEventListener('keydown', (e) => {
    if (['ArrowLeft', 'a', 'A'].includes(e.key)) state.keys.left = true;
    if (['ArrowRight', 'd', 'D'].includes(e.key)) state.keys.right = true;
    if (e.key === ' ' && !state.running && screenStart.classList.contains('hidden') === false) {
      startGame();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (['ArrowLeft', 'a', 'A'].includes(e.key)) state.keys.left = false;
    if (['ArrowRight', 'd', 'D'].includes(e.key)) state.keys.right = false;
  });

  // touch / drag dentro del canvas
  const updateTouch = (clientX) => {
    const rect = canvas.getBoundingClientRect();
    const ratio = W / rect.width;
    state.touchTargetX = (clientX - rect.left) * ratio;
  };
  canvas.addEventListener('pointerdown', (e) => updateTouch(e.clientX));
  canvas.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'touch') updateTouch(e.clientX); });
  canvas.addEventListener('pointerup',   () => { state.touchTargetX = null; });
  canvas.addEventListener('pointerleave',() => { state.touchTargetX = null; });

  // botones móviles
  $('#touchLeft').addEventListener('pointerdown',  () => state.keys.left = true);
  $('#touchLeft').addEventListener('pointerup',    () => state.keys.left = false);
  $('#touchLeft').addEventListener('pointerleave', () => state.keys.left = false);
  $('#touchRight').addEventListener('pointerdown', () => state.keys.right = true);
  $('#touchRight').addEventListener('pointerup',   () => state.keys.right = false);
  $('#touchRight').addEventListener('pointerleave',() => state.keys.right = false);

  // ============================================================
  // CONTROL DE JUEGO
  // ============================================================
  const startGame = () => {
    state.running = true;
    state.score = 0;
    state.lives = 3;
    state.level = 1;
    state.elapsed = 0;
    state.spawnTimer = 0;
    state.spawnInterval = 0.95;
    state.speedMul = 1;
    state.entities = [];
    state.particles = [];
    state.player = newPlayer();
    state.flash = 0;
    state.lastTime = performance.now();
    updateHUD();
    screenStart.classList.add('hidden');
    screenOver.classList.add('hidden');
    requestAnimationFrame(loop);
  };

  const endGame = () => {
    state.running = false;
    finalScore.textContent = state.score.toString();
    finalMsg.textContent = motivationalMsg(state.score);

    // best
    const best = +localStorage.getItem(BEST_KEY) || 0;
    if (state.score > best) {
      localStorage.setItem(BEST_KEY, state.score);
      hudBest.textContent = state.score;
    }
    screenOver.classList.remove('hidden');
  };

  const motivationalMsg = (sc) => {
    if (sc >= 800) return 'Sobreviviste al humo… en la vida real no siempre hay reinicio.';
    if (sc >= 400) return 'Gran reflejo. Aplica esa misma alerta en tu vida real.';
    if (sc >= 150) return 'El humo es rápido. Por eso decidir antes es tu mejor jugada.';
    return 'El vape parece inofensivo… hasta que ya no puedes parar.';
  };

  $('#btnStart').addEventListener('click', startGame);
  $('#btnRestart').addEventListener('click', startGame);

  // ============================================================
  // LOOP
  // ============================================================
  const loop = (now) => {
    if (!state.running) return;
    const dt = Math.min((now - state.lastTime) / 1000, 0.05);
    state.lastTime = now;
    update(dt);
    render();
    requestAnimationFrame(loop);
  };

  const update = (dt) => {
    state.elapsed += dt;

    // dificultad creciente
    state.level = 1 + Math.floor(state.elapsed / 12);
    state.speedMul = 1 + (state.level - 1) * 0.18;
    state.spawnInterval = Math.max(0.28, 0.95 - (state.level - 1) * 0.08);

    // score por tiempo
    state.score += Math.floor(dt * 8);

    // spawn
    state.spawnTimer += dt;
    while (state.spawnTimer >= state.spawnInterval) {
      state.spawnTimer -= state.spawnInterval;
      spawnEntity();
    }

    // player
    const p = state.player;
    let dir = 0;
    if (state.keys.left)  dir -= 1;
    if (state.keys.right) dir += 1;

    if (state.touchTargetX !== null) {
      const diff = state.touchTargetX - p.x;
      if (Math.abs(diff) > 4) p.x += clamp(diff, -p.speed * dt * 1.4, p.speed * dt * 1.4);
    } else {
      p.x += dir * p.speed * dt;
    }
    p.x = clamp(p.x, p.w / 2 + 10, W - p.w / 2 - 10);
    if (p.invuln > 0) p.invuln -= dt * 1000;

    // entities
    for (let i = state.entities.length - 1; i >= 0; i--) {
      const e = state.entities[i];
      e.y += e.vy * dt;
      e.x += e.vx * dt;
      e.rot += e.vr * dt;

      // rebotar bordes
      if (e.x < e.r) { e.x = e.r; e.vx *= -1; }
      if (e.x > W - e.r) { e.x = W - e.r; e.vx *= -1; }

      // colisión con player (rect vs círculo aprox)
      const dx = Math.max(p.x - p.w / 2, Math.min(e.x, p.x + p.w / 2)) - e.x;
      const dy = Math.max(p.y - p.h / 2, Math.min(e.y, p.y + p.h / 2)) - e.y;
      const dist2 = dx * dx + dy * dy;
      if (dist2 < e.r * e.r) {
        if (e.harmful) {
          if (p.invuln <= 0) {
            state.lives -= 1;
            p.invuln = 1100;
            state.flash = 1;
            burst(e.x, e.y, e.glow, 24);
            if (state.lives <= 0) {
              state.entities.splice(i, 1);
              updateHUD();
              endGame();
              return;
            }
          }
        } else {
          state.score += e.pts;
          burst(e.x, e.y, e.glow, 16);
        }
        state.entities.splice(i, 1);
        continue;
      }

      // fuera de pantalla
      if (e.y > H + 40) state.entities.splice(i, 1);
    }

    // particles
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const pa = state.particles[i];
      pa.age += dt;
      pa.x += pa.vx * dt;
      pa.y += pa.vy * dt;
      pa.vy += 220 * dt;
      pa.vx *= 0.96;
      if (pa.age >= pa.life) state.particles.splice(i, 1);
    }

    // stars
    for (const s of state.stars) {
      s.y += s.s * (40 + state.level * 8) * dt;
      if (s.y > H) { s.y = -2; s.x = Math.random() * W; }
    }

    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt * 2.4);

    updateHUD();
  };

  const updateHUD = () => {
    hudScore.textContent = state.score;
    hudLives.textContent = state.lives;
    hudLevel.textContent = state.level;
  };

  // ============================================================
  // RENDER
  // ============================================================
  const render = () => {
    // background
    ctx.fillStyle = '#0a0d1a';
    ctx.fillRect(0, 0, W, H);

    // gradient overlay
    const g = ctx.createRadialGradient(W / 2, 0, 60, W / 2, 0, H);
    g.addColorStop(0, 'rgba(177,75,255,.18)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // grid lines
    ctx.strokeStyle = 'rgba(255,255,255,.04)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // stars
    for (const s of state.stars) {
      ctx.globalAlpha = s.a;
      ctx.fillStyle = s.c;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // entities
    for (const e of state.entities) drawEntity(e);

    // player
    drawPlayer(state.player);

    // particles
    for (const pa of state.particles) {
      const t = 1 - pa.age / pa.life;
      ctx.globalAlpha = t;
      ctx.fillStyle = pa.color;
      ctx.shadowBlur = 14; ctx.shadowColor = pa.color;
      ctx.beginPath(); ctx.arc(pa.x, pa.y, pa.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    // damage flash
    if (state.flash > 0) {
      ctx.fillStyle = `rgba(255,56,96,${state.flash * 0.35})`;
      ctx.fillRect(0, 0, W, H);
    }
  };

  const drawPlayer = (p) => {
    if (!p) return;
    const blink = p.invuln > 0 && Math.floor(p.invuln / 80) % 2 === 0;
    if (blink) { ctx.globalAlpha = 0.4; }

    // glow
    ctx.shadowBlur = 24;
    ctx.shadowColor = '#00ff9d';

    // lung pair
    ctx.save();
    ctx.translate(p.x, p.y);

    // left lung
    ctx.fillStyle = 'rgba(0,255,157,.85)';
    ctx.beginPath();
    ctx.ellipse(-18, 0, 18, 26, 0, 0, Math.PI * 2);
    ctx.fill();

    // right lung
    ctx.fillStyle = 'rgba(0,217,255,.85)';
    ctx.beginPath();
    ctx.ellipse(18, 0, 18, 26, 0, 0, Math.PI * 2);
    ctx.fill();

    // central trachea
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff';
    ctx.fillRect(-3, -32, 6, 18);
    ctx.beginPath();
    ctx.arc(0, -32, 5, 0, Math.PI * 2);
    ctx.fill();

    // outline
    ctx.strokeStyle = 'rgba(255,255,255,.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(-18, 0, 18, 26, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(18, 0, 18, 26, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  };

  const drawEntity = (e) => {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.rot);
    ctx.shadowBlur = 16;
    ctx.shadowColor = e.glow;

    if (e.type === 'vape') {
      // vape: rectángulo redondeado + boquilla
      ctx.fillStyle = e.color;
      roundRect(ctx, -8, -22, 16, 36, 4); ctx.fill();
      ctx.fillStyle = '#3a1a55';
      ctx.fillRect(-5, -6, 10, 12);
      ctx.fillStyle = '#ffd166';
      ctx.beginPath(); ctx.arc(0, -22, 3, 0, Math.PI * 2); ctx.fill();
    } else if (e.type === 'smoke') {
      // smoke: 3 burbujas
      ctx.fillStyle = 'rgba(180,184,210,.55)';
      ctx.beginPath();
      ctx.arc(-8, 0, 14, 0, Math.PI * 2);
      ctx.arc(8, -4, 16, 0, Math.PI * 2);
      ctx.arc(2, 8, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.2)';
      ctx.lineWidth = 1; ctx.stroke();
    } else if (e.type === 'o2') {
      // O2 molecule
      ctx.fillStyle = e.color;
      ctx.beginPath(); ctx.arc(-8, 0, 9, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(8, 0, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px Orbitron, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('O', -8, 0);
      ctx.fillText('O', 8, 0);
    } else if (e.type === 'apple') {
      // apple-ish
      ctx.fillStyle = e.color;
      ctx.beginPath(); ctx.arc(0, 2, 14, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#054';
      ctx.fillRect(-1, -14, 2, 6);
      ctx.fillStyle = '#0a8';
      ctx.beginPath();
      ctx.ellipse(6, -12, 5, 3, -0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
    ctx.shadowBlur = 0;
  };

  const roundRect = (c, x, y, w, h, r) => {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  };

  // render inicial (placeholder)
  const idleRender = () => {
    if (state.running) return;
    render();
    requestAnimationFrame(idleRender);
  };
  state.player = newPlayer();
  idleRender();

  // ============================================================
  // 8. RANKING / LEADERBOARD
  // ============================================================
  const loadRank = () => {
    try {
      const raw = localStorage.getItem(RANK_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (_) { return []; }
  };
  const saveRank = (arr) => localStorage.setItem(RANK_KEY, JSON.stringify(arr));

  const renderRank = (highlightId = null) => {
    const list = loadRank().sort((a, b) => b.score - a.score).slice(0, 10);
    const podium = $('#podium');
    const ol = $('#rankList');
    const empty = $('#rankEmpty');

    if (list.length === 0) {
      podium.innerHTML = '';
      ol.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    // podium top 3 visualmente: 2-1-3
    const top1 = list[0], top2 = list[1], top3 = list[2];
    const podiumHTML = [];
    podiumHTML.push(top2 ? `
      <div class="podium__step podium__step--2">
        <div class="podium__rank">2°</div>
        <div class="podium__name">${escapeHTML(top2.name)}</div>
        <div class="podium__score">${top2.score} pts</div>
      </div>` : `<div></div>`);
    podiumHTML.push(top1 ? `
      <div class="podium__step podium__step--1">
        <div class="podium__rank">1°</div>
        <div class="podium__name">${escapeHTML(top1.name)}</div>
        <div class="podium__score">${top1.score} pts</div>
      </div>` : `<div></div>`);
    podiumHTML.push(top3 ? `
      <div class="podium__step podium__step--3">
        <div class="podium__rank">3°</div>
        <div class="podium__name">${escapeHTML(top3.name)}</div>
        <div class="podium__score">${top3.score} pts</div>
      </div>` : `<div></div>`);
    podium.innerHTML = podiumHTML.join('');

    // resto: del 4 al 10
    ol.innerHTML = list.slice(3).map((r, i) => `
      <li class="rank__row ${r.id === highlightId ? 'is-me' : ''}">
        <span class="pos">${(i + 4).toString().padStart(2, '0')}</span>
        <span class="who">${escapeHTML(r.name)}</span>
        <span class="pts">${r.score}</span>
      </li>
    `).join('');
  };

  const escapeHTML = (s) => String(s).replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));

  $('#btnSave').addEventListener('click', () => {
    const input = $('#playerName');
    const name = (input.value || 'ANÓNIMO').trim().slice(0, 14);
    const id = 'r' + Date.now();
    const arr = loadRank();
    arr.push({ id, name, score: state.score, date: new Date().toISOString() });
    saveRank(arr);
    input.value = '';
    renderRank(id);
    // animación: scroll al ranking
    document.getElementById('ranking').scrollIntoView({ behavior: 'smooth' });
  });

  $('#btnClearRank').addEventListener('click', () => {
    if (confirm('¿Borrar todo el ranking local?')) {
      localStorage.removeItem(RANK_KEY);
      renderRank();
    }
  });

  renderRank();

})();
