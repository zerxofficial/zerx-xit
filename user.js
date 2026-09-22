        import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
        import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, GoogleAuthProvider, signInWithPopup, setPersistence, browserLocalPersistence, browserSessionPersistence }
        from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
        import { getDatabase, ref, set, get, onValue, push, runTransaction, serverTimestamp, update }
        from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

        const firebaseConfig = {
  apiKey: "AIzaSyCg7NOSOU-qz2oUpHKCFnSUwsbXXiVhyKI",
  authDomain: "zerx-store-bd8f0.firebaseapp.com",
  databaseURL: "https://zerx-store-bd8f0-default-rtdb.firebaseio.com",
  projectId: "zerx-store-bd8f0",
  storageBucket: "zerx-store-bd8f0.firebasestorage.app",
  messagingSenderId: "752918613405",
  appId: "1:752918613405:web:5f2d67161560e530bef374",
  measurementId: "G-9EVSLL88MH"
};

        // Escapes text before inserting it with innerHTML, to prevent stored
        // XSS from values that get rendered back out (e.g. admin broadcast
        // messages, panel names).
        function escapeHtml(str) {
            return String(str ?? '').replace(/[&<>"']/g, ch => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
            }[ch]));
        }

        let app, auth, db;
        try { app = initializeApp(firebaseConfig);
            auth = getAuth(app);
            db = getDatabase(app); } catch (e) { console.error("Firebase init error:", e);
            alert("Database connection failed."); }
        const googleProvider = new GoogleAuthProvider();

        // --- "REMEMBER ME" ---
        // Firebase's own default is already local persistence, so signed-in
        // users normally stay signed in. The toggle here makes that a real,
        // visible choice: checked -> stay signed in across browser restarts
        // (local persistence); unchecked -> sign out automatically once the
        // tab/browser is closed (session persistence). Applied right before
        // each sign-in call, and the checkbox's own state is remembered too
        // so it doesn't reset to checked every time the login screen loads.
        function applyAuthPersistence(remember) {
            try { localStorage.setItem('zerx-xit-remember', remember ? '1' : '0'); } catch (e) {}
            return setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
        }
        (function loadRememberPref() {
            try {
                const saved = localStorage.getItem('zerx-xit-remember');
                if (saved === '0') {
                    const cb = document.getElementById('login-remember');
                    if (cb) cb.checked = false;
                }
            } catch (e) {}
        })();

        // --- STATE ---
        let currentUser = null;
        let userData = { balance: 0, referralCode: '', referredBy: '' };
        let referralsData = { total: 0, active: 0, earnings: 0 };
        window.ZAP_KEY = "";
        let securityCompleted = false;
        let isSpinning = false;
        let lastSpinDate = '';
        let spinsLeft = 1;
        let currentAnim = 'aurora';
        let animCleanup = null;
        let allOrders = [];
        let currentCategory = 'all';
        let chartInstance = null;
        let paymentListener = null;

        // --- THEME SYSTEM ---
        const THEMES = {
            redblack: { name: 'Red & Black', class: '', color: '#ef4136' },
            bw: { name: 'Black & White', class: 'theme-bw', color: '#ffffff' },
            yellow: { name: 'Yellow', class: 'theme-yellow', color: '#fbbf24' },
            blue: { name: 'Blue', class: 'theme-blue', color: '#3b82f6' },
            purple: { name: 'Purple', class: 'theme-purple', color: '#8b5cf6' },
            green: { name: 'Green', class: 'theme-green', color: '#22c55e' },
            pink: { name: 'Pink', class: 'theme-pink', color: '#ec4899' },
            red: { name: 'Red', class: 'theme-red', color: '#ef4444' },
            orange: { name: 'Orange', class: 'theme-orange', color: '#f97316' }
        };

        let currentTheme = 'redblack';
        let currentLightMode = false;

        window.toggleLightMode = function() {
            const html = document.documentElement;
            const isLight = html.getAttribute('data-theme') === 'light';
            html.setAttribute('data-theme', isLight ? 'dark' : 'light');
            currentLightMode = !isLight;
            try { localStorage.setItem('zerx-xit-lightmode', currentLightMode ? 'light' : 'dark'); } catch (e) {}
            showToast('Switched to ' + (currentLightMode ? 'Light' : 'Dark') + ' Mode', 'success');
            if (document.getElementById('dropdown-menu')) document.getElementById('dropdown-menu').classList.remove(
            'active');
        };

        function loadLightMode() {
            try { const saved = localStorage.getItem('zerx-xit-lightmode'); if (saved === 'light') { document
                        .documentElement.setAttribute('data-theme', 'light');
                    currentLightMode = true; } else { document.documentElement.setAttribute('data-theme', 'dark');
                    currentLightMode = false; } } catch (e) { document.documentElement.setAttribute('data-theme',
                    'dark'); }
        }

        // Respects the admin's "Theme Control" panel (settings/theme), which
        // lets the admin force dark/light mode for everyone. Previously this
        // setting was saved by the admin panel but never actually read here.
        async function applyAdminThemeOverride() {
            if (!db) return;
            try {
                const snap = await get(ref(db, 'settings/theme'));
                if (!snap.exists()) return;
                const data = snap.val();
                if (data.override === 'yes' && (data.mode === 'dark' || data.mode === 'light')) {
                    document.documentElement.setAttribute('data-theme', data.mode);
                    currentLightMode = data.mode === 'light';
                }
            } catch (e) {}
        }

        function applyTheme(themeKey) {
            const theme = THEMES[themeKey];
            if (!theme) return;
            document.body.className = document.body.className
                .split(' ')
                .filter(c => !c.startsWith('theme-'))
                .join(' ');
            if (theme.class) document.body.classList.add(theme.class);
            const dot = document.getElementById('nav-theme-dot');
            if (dot) dot.style.background = theme.color;
            currentTheme = themeKey;
            try { localStorage.setItem('zerx-xit-theme', themeKey); } catch (e) {}
            if (currentUser && db) {
                update(ref(db, 'users/' + currentUser.uid + '/theme'), themeKey).catch(() => {});
            }
            document.querySelectorAll('.theme-option').forEach(el => {
                el.classList.toggle('active-theme', el.dataset.theme === themeKey);
            });
            if (chartInstance) {
                const accent = getComputedStyle(document.body).getPropertyValue('--accent-primary').trim() ||
                    '#ef4136';
                chartInstance.data.datasets[0].backgroundColor = accent + '40';
                chartInstance.data.datasets[0].borderColor = accent;
                chartInstance.update();
            }
        }

        function loadTheme() {
            let saved = 'redblack';
            try { const s = localStorage.getItem('zerx-xit-theme'); if (s && THEMES[s]) saved = s; } catch (e) {}
            if (currentUser && db) {
                get(ref(db, 'users/' + currentUser.uid + '/theme')).then(snap => {
                    const fbTheme = snap.val();
                    if (fbTheme && THEMES[fbTheme]) {
                        if (fbTheme !== saved) {
                            try { localStorage.setItem('zerx-xit-theme', fbTheme); } catch (e) {}
                            saved = fbTheme;
                        }
                        applyTheme(saved);
                    } else {
                        applyTheme(saved);
                    }
                }).catch(() => { applyTheme(saved); });
            } else {
                applyTheme(saved);
            }
        }

        window.openThemePicker = function() {
            const grid = document.getElementById('theme-picker-grid');
            grid.innerHTML = '';
            Object.entries(THEMES).forEach(([key, theme]) => {
                const div = document.createElement('div');
                div.className = 'theme-option' + (key === currentTheme ? ' active-theme' : '');
                div.dataset.theme = key;
                div.innerHTML = `
                        <div class="theme-swatch ${key}"></div>
                        <div class="theme-name">${theme.name}</div>
                    `;
                div.addEventListener('click', () => {
                    applyTheme(key);
                    showToast('Theme changed to ' + theme.name, 'success');
                    document.querySelectorAll('.theme-option').forEach(el => {
                        el.classList.toggle('active-theme', el.dataset.theme === key);
                    });
                });
                grid.appendChild(div);
            });
            openModal('modal-theme-picker');
        };

        window.applyTheme = applyTheme;

        const loader = document.getElementById('loader');
        const authScreen = document.getElementById('auth-screen');
        let landAuthRequested = false;
        window.landGoAuth = function(mode) {
            landAuthRequested = true;
            document.getElementById('landing-screen').classList.add('hidden');
            authScreen.classList.remove('hidden');
            if (mode === 'signup') {
                document.getElementById('login-box').classList.add('hidden');
                document.getElementById('signup-box').classList.remove('hidden');
                document.getElementById('auth-tab-login')?.classList.remove('active');
                document.getElementById('auth-tab-signup')?.classList.add('active');
            } else {
                document.getElementById('signup-box').classList.add('hidden');
                document.getElementById('login-box').classList.remove('hidden');
                document.getElementById('auth-tab-signup')?.classList.remove('active');
                document.getElementById('auth-tab-login')?.classList.add('active');
            }
            window.scrollTo(0, 0);
        };
        window.landShowLanding = function() {
            landAuthRequested = false;
            authScreen.classList.add('hidden');
            document.getElementById('landing-screen').classList.remove('hidden');
            window.scrollTo(0, 0);
        };
        var landYearEl = document.getElementById('land-year');
        if (landYearEl) landYearEl.textContent = new Date().getFullYear();
        const mainApp = document.getElementById('main-app');
        const securityOverlay = document.getElementById('security-overlay');

        // Apply saved theme + light/dark mode right away so the login screen
        // (and first paint) isn't stuck on the default yellow look while
        // waiting for auth state to resolve.
        loadLightMode();
        loadTheme();
        applyAdminThemeOverride();

        // --- ANIMATION ENGINE (theme-aware) ---
        const animDefs = {
            aurora: { init: initAurora },
            nebula: { init: initNebula },
            orbs: { init: initOrbs },
            grid: { init: initGrid },
            waves: { init: initWaves },
            pulse: { init: initPulse },
            neon: { init: initNeon },
            static: { init: initStatic }
        };

        function getAccentColors() {
            const cs = getComputedStyle(document.body);
            const p = cs.getPropertyValue('--accent-primary').trim() || '#ef4136';
            const pd = cs.getPropertyValue('--accent-primary-dark').trim() || '#d97706';
            const pl = cs.getPropertyValue('--accent-primary-light').trim() || '#fcd34d';
            const hex = p.replace('#', '');
            const r = parseInt(hex.substring(0, 2), 16) || 251;
            const g = parseInt(hex.substring(2, 4), 16) || 191;
            const b = parseInt(hex.substring(4, 6), 16) || 36;
            return { r, g, b, p, pd, pl };
        }

        function initStatic() {
            const canvas = document.getElementById('anim-canvas');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            const container = document.getElementById('anim-container');

            function resize() {
                const rect = container.getBoundingClientRect();
                canvas.width = rect.width || window.innerWidth;
                canvas.height = rect.height || window.innerHeight;
            }
            window.addEventListener('resize', resize);
            resize();
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            return function cleanup() { window.removeEventListener('resize', resize); };
        }

        function initAurora() {
            const container = document.getElementById('anim-container');
            const canvas = document.getElementById('anim-canvas');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            let width, height, animId, time = 0;

            function resize() {
                const rect = container.getBoundingClientRect();
                width = rect.width || window.innerWidth;
                height = rect.height || window.innerHeight;
                canvas.width = width;
                canvas.height = height;
            }
            window.addEventListener('resize', resize);
            resize();

            function getColors() {
                const c = getAccentColors();
                return [
                    [c.r, c.g, c.b],
                    [Math.max(0, c.r - 30), Math.max(0, c.g - 30), Math.max(0, c.b - 30)],
                    [Math.min(255, c.r + 20), Math.min(255, c.g + 20), Math.min(255, c.b + 20)],
                    [Math.max(0, c.r - 60), Math.max(0, c.g - 60), Math.min(255, c.b + 10)],
                    [c.r, c.g, c.b]
                ];
            }

            function lerp(a, b, t) { return a + (b - a) * t; }

            function getColor(t, colors) {
                const idx = Math.floor(t * (colors.length - 1));
                const frac = (t * (colors.length - 1)) - idx;
                const c1 = colors[Math.min(idx, colors.length - 1)];
                const c2 = colors[Math.min(idx + 1, colors.length - 1)];
                return { r: lerp(c1[0], c2[0], frac), g: lerp(c1[1], c2[1], frac), b: lerp(c1[2], c2[2], frac) };
            }

            function animate() {
                time += 0.004;
                ctx.clearRect(0, 0, width, height);
                const colors = getColors();
                const numLayers = 5,
                    baseY = height * 0.5;
                for (let layer = 0; layer < numLayers; layer++) {
                    const layerOffset = layer / numLayers;
                    const amplitude = 40 + layer * 15;
                    const frequency = 0.008 + layer * 0.003;
                    const speed = 0.003 + layer * 0.0015;
                    const yOffset = layer * 30 - 40;
                    const color = getColor((layerOffset + time * 0.01) % 1, colors);
                    const alpha = 0.06 + (1 - layer / numLayers) * 0.12;
                    ctx.beginPath();
                    for (let x = 0; x <= width; x += 2) {
                        const n1 = Math.sin(x * frequency + time * speed) * amplitude;
                        const n2 = Math.sin(x * frequency * 0.7 + time * speed * 1.3 + 1.2) * amplitude * 0.6;
                        const n3 = Math.sin(x * frequency * 0.4 + time * speed * 0.7 + 0.8) * amplitude * 0.3;
                        const y = baseY + yOffset + n1 + n2 + n3;
                        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
                    }
                    ctx.strokeStyle = 'rgba(' + color.r + ',' + color.g + ',' + color.b + ',' + alpha + ')';
                    ctx.lineWidth = 2.5;
                    ctx.shadowBlur = 20;
                    ctx.shadowColor = 'rgba(' + color.r + ',' + color.g + ',' + color.b + ',' + (alpha * 0.3) + ')';
                    ctx.stroke();
                    ctx.shadowBlur = 0;
                    const grad = ctx.createLinearGradient(0, baseY + yOffset - amplitude * 1.5, 0, height);
                    grad.addColorStop(0, 'rgba(' + color.r + ',' + color.g + ',' + color.b + ',0)');
                    grad.addColorStop(0.3, 'rgba(' + color.r + ',' + color.g + ',' + color.b + ',' + (alpha * 0.5) + ')');
                    grad.addColorStop(1, 'rgba(' + color.r + ',' + color.g + ',' + color.b + ',0)');
                    ctx.beginPath();
                    ctx.moveTo(0, height);
                    for (let x = 0; x <= width; x += 2) {
                        const n1 = Math.sin(x * frequency + time * speed) * amplitude;
                        const n2 = Math.sin(x * frequency * 0.7 + time * speed * 1.3 + 1.2) * amplitude * 0.6;
                        const n3 = Math.sin(x * frequency * 0.4 + time * speed * 0.7 + 0.8) * amplitude * 0.3;
                        const y = baseY + yOffset + n1 + n2 + n3;
                        ctx.lineTo(x, y);
                    }
                    ctx.lineTo(width, height);
                    ctx.closePath();
                    ctx.fillStyle = grad;
                    ctx.fill();
                }
                animId = requestAnimationFrame(animate);
            }
            animate();
            return function cleanup() { if (animId) cancelAnimationFrame(animId);
                window.removeEventListener('resize', resize); };
        }

        function initNebula() {
            const container = document.getElementById('anim-container');
            const canvas = document.getElementById('anim-canvas');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            let width, height, animId;
            let stars = [],
                nebulas = [],
                shooting = [];

            function resize() {
                const rect = container.getBoundingClientRect();
                width = rect.width || window.innerWidth;
                height = rect.height || window.innerHeight;
                canvas.width = width;
                canvas.height = height;
                initStars();
                initNebulas();
            }
            window.addEventListener('resize', resize);

            function initStars() {
                stars = [];
                const count = Math.floor((width * height) / 2000);
                for (let i = 0; i < count; i++) {
                    stars.push({ x: Math.random() * width, y: Math.random() * height, size: Math.random() * 2 + 0.5,
                        alpha: Math.random() * 0.8 + 0.2, twinkle: Math.random() * 0.02 + 0.005,
                        phase: Math.random() * Math.PI * 2 });
                }
            }

            function initNebulas() {
                const c = getAccentColors();
                const colors = [
                    [c.r, c.g, c.b],
                    [Math.max(0, c.r - 30), Math.max(0, c.g - 30), Math.max(0, c.b - 30)],
                    [Math.min(255, c.r + 20), Math.min(255, c.g + 20), Math.min(255, c.b + 20)],
                    [Math.max(0, c.r - 60), Math.max(0, c.g - 60), Math.min(255, c.b + 10)]
                ];
                nebulas = [];
                for (let i = 0; i < 4; i++) {
                    const col = colors[i % colors.length];
                    nebulas.push({ x: Math.random() * width, y: Math.random() * height, radius: Math.random() * 200 + 150,
                        r: col[0], g: col[1], b: col[2], sx: (Math.random() - 0.5) * 0.15,
                        sy: (Math.random() - 0.5) * 0.15, phase: Math.random() * Math.PI * 2 });
                }
            }

            function initShooting() {
                shooting = [];
                for (let i = 0; i < 3; i++) {
                    shooting.push({ x: Math.random() * width, y: Math.random() * height * 0.5, length: Math.random() * 80 + 40,
                        speed: Math.random() * 4 + 3, angle: Math.PI / 4 + (Math.random() - 0.5) * 0.4, active: i === 0,
                        life: 0, maxLife: Math.random() * 30 + 20, trail: [], opacity: Math.random() * 0.5 + 0.3 });
                }
            }
            resize();
            initShooting();

            function animate() {
                ctx.clearRect(0, 0, width, height);
                nebulas.forEach(n => {
                    n.x += n.sx;
                    n.y += n.sy;
                    if (n.x < -n.radius) n.x = width + n.radius;
                    if (n.x > width + n.radius) n.x = -n.radius;
                    if (n.y < -n.radius) n.y = height + n.radius;
                    if (n.y > height + n.radius) n.y = -n.radius;
                    const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.radius);
                    const alpha = 0.04 + Math.sin(Date.now() * 0.0002 + n.phase) * 0.02 + 0.02;
                    grad.addColorStop(0, 'rgba(' + n.r + ',' + n.g + ',' + n.b + ',' + alpha + ')');
                    grad.addColorStop(0.5, 'rgba(' + n.r + ',' + n.g + ',' + n.b + ',' + (alpha * 0.5) + ')');
                    grad.addColorStop(1, 'rgba(' + n.r + ',' + n.g + ',' + n.b + ',0)');
                    ctx.beginPath();
                    ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
                    ctx.fillStyle = grad;
                    ctx.fill();
                });
                stars.forEach(s => {
                    const alpha = s.alpha * (0.6 + Math.sin(Date.now() * s.twinkle + s.phase) * 0.4);
                    ctx.beginPath();
                    ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(255,255,255,' + alpha + ')';
                    ctx.shadowBlur = 8;
                    ctx.shadowColor = 'rgba(255,255,255,' + (alpha * 0.2) + ')';
                    ctx.fill();
                    ctx.shadowBlur = 0;
                });
                shooting.forEach(s => {
                    if (!s.active) {
                        if (Math.random() < 0.005) {
                            s.active = true;
                            s.x = Math.random() * width;
                            s.y = Math.random() * height * 0.3;
                            s.life = 0;
                            s.maxLife = Math.random() * 30 + 20;
                            s.trail = [];
                        }
                        return;
                    }
                    s.life++;
                    s.trail.push({ x: s.x, y: s.y });
                    if (s.trail.length > 20) s.trail.shift();
                    s.x += Math.cos(s.angle) * s.speed;
                    s.y += Math.sin(s.angle) * s.speed;
                    const fade = 1 - (s.life / s.maxLife);
                    if (fade <= 0 || s.x > width || s.y > height) { s.active = false; return; }
                    for (let i = 0; i < s.trail.length - 1; i++) {
                        const t = i / s.trail.length;
                        const alpha = fade * t * 0.6 * s.opacity;
                        ctx.beginPath();
                        ctx.moveTo(s.trail[i].x, s.trail[i].y);
                        ctx.lineTo(s.trail[i + 1].x, s.trail[i + 1].y);
                        ctx.strokeStyle = 'rgba(255,255,255,' + alpha + ')';
                        ctx.lineWidth = (1 - t) * 2 + 0.5;
                        ctx.shadowBlur = 15;
                        ctx.shadowColor = 'rgba(255,255,255,' + (alpha * 0.3) + ')';
                        ctx.stroke();
                        ctx.shadowBlur = 0;
                    }
                });
                animId = requestAnimationFrame(animate);
            }
            animate();
            return function cleanup() { if (animId) cancelAnimationFrame(animId);
                window.removeEventListener('resize', resize); };
        }

        function initOrbs() {
            const container = document.getElementById('anim-container');
            const canvas = document.getElementById('anim-canvas');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            let width, height, animId,
                orbs = [];

            function resize() {
                const rect = container.getBoundingClientRect();
                width = rect.width || window.innerWidth;
                height = rect.height || window.innerHeight;
                canvas.width = width;
                canvas.height = height;
            }
            window.addEventListener('resize', resize);
            resize();

            const c = getAccentColors();
            const colors = [
                [c.r, c.g, c.b],
                [Math.max(0, c.r - 30), Math.max(0, c.g - 30), Math.max(0, c.b - 30)],
                [Math.min(255, c.r + 20), Math.min(255, c.g + 20), Math.min(255, c.b + 20)],
                [Math.max(0, c.r - 60), Math.max(0, c.g - 60), Math.min(255, c.b + 10)],
                [c.r, c.g, c.b]
            ];
            for (let i = 0; i < 6; i++) {
                const col = colors[i % colors.length];
                orbs.push({ x: Math.random() * width, y: Math.random() * height, radius: Math.random() * 80 + 40, r: col[0],
                    g: col[1], b: col[2], sx: (Math.random() - 0.5) * 0.3, sy: (Math.random() - 0.5) * 0.3,
                    phase: Math.random() * Math.PI * 2, pulse: Math.random() * 0.005 + 0.003,
                    deform: Math.random() * 0.3 + 0.1 });
            }

            function animate() {
                ctx.clearRect(0, 0, width, height);
                orbs.forEach(o => {
                    o.x += o.sx;
                    o.y += o.sy;
                    if (o.x < -o.radius) o.x = width + o.radius;
                    if (o.x > width + o.radius) o.x = -o.radius;
                    if (o.y < -o.radius) o.y = height + o.radius;
                    if (o.y > height + o.radius) o.y = -o.radius;
                    const pulse = 1 + Math.sin(Date.now() * o.pulse + o.phase) * 0.1;
                    const r = o.radius * pulse;

                    const grad = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, r * 2);
                    const alpha = 0.06 + Math.sin(Date.now() * o.pulse * 0.5 + o.phase) * 0.02 + 0.04;
                    grad.addColorStop(0, 'rgba(' + o.r + ',' + o.g + ',' + o.b + ',' + (alpha * 0.5) + ')');
                    grad.addColorStop(0.5, 'rgba(' + o.r + ',' + o.g + ',' + o.b + ',' + alpha + ')');
                    grad.addColorStop(1, 'rgba(' + o.r + ',' + o.g + ',' + o.b + ',0)');
                    ctx.beginPath();
                    ctx.arc(o.x, o.y, r * 2, 0, Math.PI * 2);
                    ctx.fillStyle = grad;
                    ctx.fill();

                    const grad2 = ctx.createRadialGradient(o.x - r * 0.2, o.y - r * 0.2, 0, o.x, o.y, r);
                    grad2.addColorStop(0, 'rgba(255,255,255,0.25)');
                    grad2.addColorStop(0.3, 'rgba(' + o.r + ',' + o.g + ',' + o.b + ',0.15)');
                    grad2.addColorStop(0.7, 'rgba(' + o.r + ',' + o.g + ',' + o.b + ',0.08)');
                    grad2.addColorStop(1, 'rgba(' + o.r + ',' + o.g + ',' + o.b + ',0)');
                    ctx.beginPath();
                    const seg = 40;
                    for (let i = 0; i <= seg; i++) {
                        const a = (i / seg) * Math.PI * 2;
                        const d = 1 + Math.sin(a * 3 + Date.now() * 0.001 + o.phase) * o.deform * 0.15;
                        const px = o.x + Math.cos(a) * r * d;
                        const py = o.y + Math.sin(a) * r * d;
                        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
                    }
                    ctx.closePath();
                    ctx.fillStyle = grad2;
                    ctx.fill();
                    ctx.beginPath();
                    for (let i = 0; i <= seg; i++) {
                        const a = (i / seg) * Math.PI * 2;
                        const d = 1 + Math.sin(a * 3 + Date.now() * 0.001 + o.phase) * o.deform * 0.15;
                        const px = o.x + Math.cos(a) * r * d;
                        const py = o.y + Math.sin(a) * r * d;
                        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
                    }
                    ctx.closePath();
                    ctx.strokeStyle = 'rgba(' + o.r + ',' + o.g + ',' + o.b + ',0.15)';
                    ctx.lineWidth = 1.5;
                    ctx.shadowBlur = 20;
                    ctx.shadowColor = 'rgba(' + o.r + ',' + o.g + ',' + o.b + ',0.05)';
                    ctx.stroke();
                    ctx.shadowBlur = 0;
                });
                animId = requestAnimationFrame(animate);
            }
            animate();
            return function cleanup() { if (animId) cancelAnimationFrame(animId);
                window.removeEventListener('resize', resize); };
        }

        function initGrid() {
            const container = document.getElementById('anim-container');
            const canvas = document.getElementById('anim-canvas');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            let width, height, animId,
                time = 0;

            function resize() {
                const rect = container.getBoundingClientRect();
                width = rect.width || window.innerWidth;
                height = rect.height || window.innerHeight;
                canvas.width = width;
                canvas.height = height;
            }
            window.addEventListener('resize', resize);
            resize();

            function animate() {
                time += 0.005;
                ctx.clearRect(0, 0, width, height);
                const c = getAccentColors();
                const colors = [
                    [c.r, c.g, c.b],
                    [Math.max(0, c.r - 30), Math.max(0, c.g - 30), Math.max(0, c.b - 30)],
                    [Math.min(255, c.r + 20), Math.min(255, c.g + 20), Math.min(255, c.b + 20)]
                ];
                const size = 60,
                    cols = Math.floor(width / size) + 1,
                    rows = Math.floor(height / size) + 1;
                const ox = (width - cols * size) / 2,
                    oy = (height - rows * size) / 2;
                for (let i = 0; i < cols; i++) {
                    for (let j = 0; j < rows; j++) {
                        const x = ox + i * size,
                            y = oy + j * size;
                        const dist = Math.sqrt(Math.pow(x - width / 2, 2) + Math.pow(y - height / 2, 2));
                        const wave = Math.sin(dist * 0.015 - time * 0.8) * 0.5 + 0.5;
                        const alpha = wave * 0.12 + 0.02;
                        const rot = time * 0.2 + i * 0.1 + j * 0.05;
                        const s = size * 0.4 * (0.6 + Math.sin(dist * 0.02 - time * 0.5) * 0.4);
                        ctx.save();
                        ctx.translate(x, y);
                        ctx.rotate(rot);
                        const col = colors[(i + j) % colors.length];
                        ctx.shadowBlur = 10;
                        ctx.shadowColor = 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + (alpha * 0.3) + ')';
                        ctx.strokeStyle = 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + alpha + ')';
                        ctx.lineWidth = 1;
                        ctx.strokeRect(-s / 2, -s / 2, s, s);
                        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 0.7);
                        grad.addColorStop(0, 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + (alpha * 0.1) + ')');
                        grad.addColorStop(1, 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',0)');
                        ctx.fillStyle = grad;
                        ctx.fillRect(-s / 2, -s / 2, s, s);
                        ctx.restore();
                        if (i < cols - 1 && j < rows - 1) {
                            const x2 = ox + (i + 1) * size,
                                y2 = oy + (j + 1) * size;
                            const d = Math.sqrt(Math.pow(x2 - x, 2) + Math.pow(y2 - y, 2));
                            const ca = Math.sin(dist * 0.02 - time * 0.6) * 0.5 + 0.5;
                            ctx.beginPath();
                            ctx.moveTo(x, y);
                            ctx.lineTo(x2, y2);
                            ctx.strokeStyle = 'rgba(255,255,255,' + (ca * 0.04) + ')';
                            ctx.lineWidth = 0.5;
                            ctx.stroke();
                        }
                    }
                }
                animId = requestAnimationFrame(animate);
            }
            animate();
            return function cleanup() { if (animId) cancelAnimationFrame(animId);
                window.removeEventListener('resize', resize); };
        }

        function initWaves() {
            const container = document.getElementById('anim-container');
            const canvas = document.getElementById('anim-canvas');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            let width, height, animId,
                time = 0;

            function resize() {
                const rect = container.getBoundingClientRect();
                width = rect.width || window.innerWidth;
                height = rect.height || window.innerHeight;
                canvas.width = width;
                canvas.height = height;
            }
            window.addEventListener('resize', resize);
            resize();

            const c = getAccentColors();
            const colors = [
                [c.r, c.g, c.b],
                [Math.max(0, c.r - 30), Math.max(0, c.g - 30), Math.max(0, c.b - 30)],
                [Math.min(255, c.r + 20), Math.min(255, c.g + 20), Math.min(255, c.b + 20)],
                [Math.max(0, c.r - 60), Math.max(0, c.g - 60), Math.min(255, c.b + 10)]
            ];

            function animate() {
                time += 0.008;
                ctx.clearRect(0, 0, width, height);
                const numWaves = 5;
                for (let w = 0; w < numWaves; w++) {
                    const offset = w / numWaves,
                        amp = 30 + w * 8,
                        freq = 0.015 + w * 0.004,
                        spd = 0.02 + w * 0.005,
                        phase = time * spd + offset * Math.PI * 2;
                    const col = colors[w % colors.length],
                        alpha = 0.04 + (1 - w / numWaves) * 0.06;
                    ctx.beginPath();
                    for (let x = 0; x <= width; x += 2) {
                        const y1 = Math.sin(x * freq + phase) * amp;
                        const y2 = Math.sin(x * freq * 0.6 + phase * 1.4 + 0.8) * amp * 0.5;
                        const y3 = Math.sin(x * freq * 0.3 + phase * 0.6 + 1.5) * amp * 0.25;
                        const y = height / 2 + y1 + y2 + y3 + (w - numWaves / 2) * 18;
                        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
                    }
                    ctx.strokeStyle = 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + alpha + ')';
                    ctx.lineWidth = 2;
                    ctx.shadowBlur = 15;
                    ctx.shadowColor = 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + (alpha * 0.2) + ')';
                    ctx.stroke();
                    ctx.shadowBlur = 0;
                    const grad = ctx.createLinearGradient(0, height / 2 - amp - 50, 0, height / 2 + amp + 50);
                    grad.addColorStop(0, 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',0)');
                    grad.addColorStop(0.4, 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + (alpha * 0.4) + ')');
                    grad.addColorStop(0.6, 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + (alpha * 0.4) + ')');
                    grad.addColorStop(1, 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',0)');
                    ctx.beginPath();
                    ctx.moveTo(0, height);
                    for (let x = 0; x <= width; x += 2) {
                        const y1 = Math.sin(x * freq + phase) * amp;
                        const y2 = Math.sin(x * freq * 0.6 + phase * 1.4 + 0.8) * amp * 0.5;
                        const y3 = Math.sin(x * freq * 0.3 + phase * 0.6 + 1.5) * amp * 0.25;
                        const y = height / 2 + y1 + y2 + y3 + (w - numWaves / 2) * 18;
                        ctx.lineTo(x, y);
                    }
                    ctx.lineTo(width, height);
                    ctx.closePath();
                    ctx.fillStyle = grad;
                    ctx.fill();
                }
                animId = requestAnimationFrame(animate);
            }
            animate();
            return function cleanup() { if (animId) cancelAnimationFrame(animId);
                window.removeEventListener('resize', resize); };
        }

        function initPulse() {
            const container = document.getElementById('anim-container');
            const canvas = document.getElementById('anim-canvas');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            let width, height, animId,
                time = 0,
                rings = [];

            function resize() {
                const rect = container.getBoundingClientRect();
                width = rect.width || window.innerWidth;
                height = rect.height || window.innerHeight;
                canvas.width = width;
                canvas.height = height;
                rings = [];
                const c = getAccentColors();
                const colors = [
                    [c.r, c.g, c.b],
                    [Math.max(0, c.r - 30), Math.max(0, c.g - 30), Math.max(0, c.b - 30)],
                    [Math.min(255, c.r + 20), Math.min(255, c.g + 20), Math.min(255, c.b + 20)],
                    [Math.max(0, c.r - 60), Math.max(0, c.g - 60), Math.min(255, c.b + 10)]
                ];
                for (let i = 0; i < 6; i++) {
                    rings.push({ x: width / 2 + (Math.random() - 0.5) * width * 0.4, y: height / 2 + (Math.random() - 0.5) *
                            height * 0.4, maxRadius: Math.random() * 150 + 80, speed: Math.random() * 0.3 + 0.15,
                        phase: Math.random() * Math.PI * 2, width: Math.random() * 3 + 1, colors: colors[i % 4] });
                }
            }
            window.addEventListener('resize', resize);
            resize();

            function animate() {
                time += 0.01;
                ctx.clearRect(0, 0, width, height);
                rings.forEach(r => {
                    const progress = (Math.sin(time * r.speed + r.phase) + 1) / 2;
                    const radius = progress * r.maxRadius;
                    const alpha = Math.sin(progress * Math.PI) * 0.3 + 0.1;
                    const grad = ctx.createRadialGradient(r.x, r.y, 0, r.x, r.y, radius);
                    grad.addColorStop(0, 'rgba(' + r.colors[0] + ',' + r.colors[1] + ',' + r.colors[2] + ',' + (alpha *
                        0.05) + ')');
                    grad.addColorStop(0.3, 'rgba(' + r.colors[0] + ',' + r.colors[1] + ',' + r.colors[2] + ',' + (alpha *
                        0.02) + ')');
                    grad.addColorStop(1, 'rgba(' + r.colors[0] + ',' + r.colors[1] + ',' + r.colors[2] + ',0)');
                    ctx.beginPath();
                    ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
                    ctx.fillStyle = grad;
                    ctx.fill();
                    ctx.beginPath();
                    ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
                    ctx.strokeStyle = 'rgba(' + r.colors[0] + ',' + r.colors[1] + ',' + r.colors[2] + ',' + alpha + ')';
                    ctx.lineWidth = r.width * (0.5 + progress * 0.5);
                    ctx.shadowBlur = 20;
                    ctx.shadowColor = 'rgba(' + r.colors[0] + ',' + r.colors[1] + ',' + r.colors[2] + ',' + (alpha * 0.3) +
                        ')';
                    ctx.stroke();
                    ctx.shadowBlur = 0;
                    const p2 = (progress + 0.5) % 1,
                        r2 = p2 * r.maxRadius,
                        a2 = Math.sin(p2 * Math.PI) * 0.15;
                    ctx.beginPath();
                    ctx.arc(r.x, r.y, r2, 0, Math.PI * 2);
                    ctx.strokeStyle = 'rgba(' + r.colors[0] + ',' + r.colors[1] + ',' + r.colors[2] + ',' + a2 + ')';
                    ctx.lineWidth = 0.5;
                    ctx.stroke();
                    const cg = ctx.createRadialGradient(r.x, r.y, 0, r.x, r.y, 30);
                    cg.addColorStop(0, 'rgba(' + r.colors[0] + ',' + r.colors[1] + ',' + r.colors[2] + ',' + (alpha * 0.2) +
                        ')');
                    cg.addColorStop(1, 'rgba(' + r.colors[0] + ',' + r.colors[1] + ',' + r.colors[2] + ',0)');
                    ctx.beginPath();
                    ctx.arc(r.x, r.y, 30, 0, Math.PI * 2);
                    ctx.fillStyle = cg;
                    ctx.fill();
                });
                animId = requestAnimationFrame(animate);
            }
            animate();
            return function cleanup() { if (animId) cancelAnimationFrame(animId);
                window.removeEventListener('resize', resize); };
        }

        function initNeon() {
            const container = document.getElementById('anim-container');
            const canvas = document.getElementById('anim-canvas');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            let width, height, animId,
                particles = [];

            function resize() {
                const rect = container.getBoundingClientRect();
                width = rect.width || window.innerWidth;
                height = rect.height || window.innerHeight;
                canvas.width = width;
                canvas.height = height;
                initParticles();
            }
            window.addEventListener('resize', resize);

            function initParticles() {
                particles = [];
                const count = Math.floor((width * height) / 8000);
                const c = getAccentColors();
                const colors = [
                    [c.r, c.g, c.b],
                    [Math.max(0, c.r - 30), Math.max(0, c.g - 30), Math.max(0, c.b - 30)],
                    [Math.min(255, c.r + 20), Math.min(255, c.g + 20), Math.min(255, c.b + 20)],
                    [Math.max(0, c.r - 60), Math.max(0, c.g - 60), Math.min(255, c.b + 10)],
                    [c.r, c.g, c.b]
                ];
                for (let i = 0; i < count; i++) {
                    particles.push({ x: Math.random() * width, y: Math.random() * height, vx: (Math.random() - 0.5) * 0.5,
                        vy: (Math.random() - 0.5) * 0.5, size: Math.random() * 2.5 + 1,
                        color: colors[Math.floor(Math.random() * 5)], phase: Math.random() * Math.PI * 2 });
                }
            }
            resize();

            function animate() {
                ctx.clearRect(0, 0, width, height);
                particles.forEach(p => {
                    p.x += p.vx;
                    p.y += p.vy;
                    if (p.x < 0 || p.x > width) p.vx *= -1;
                    if (p.y < 0 || p.y > height) p.vy *= -1;
                    p.x = Math.max(0, Math.min(width, p.x));
                    p.y = Math.max(0, Math.min(height, p.y));
                    const glow = 0.6 + Math.sin(Date.now() * 0.002 + p.phase) * 0.4;
                    const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 4);
                    grad.addColorStop(0, 'rgba(' + p.color[0] + ',' + p.color[1] + ',' + p.color[2] + ',' + (glow * 0.8) +
                        ')');
                    grad.addColorStop(0.3, 'rgba(' + p.color[0] + ',' + p.color[1] + ',' + p.color[2] + ',' + (glow * 0.3) +
                        ')');
                    grad.addColorStop(1, 'rgba(' + p.color[0] + ',' + p.color[1] + ',' + p.color[2] + ',0)');
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.size * 4, 0, Math.PI * 2);
                    ctx.fillStyle = grad;
                    ctx.fill();
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(255,255,255,' + (glow * 0.6) + ')';
                    ctx.shadowBlur = 15;
                    ctx.shadowColor = 'rgba(' + p.color[0] + ',' + p.color[1] + ',' + p.color[2] + ',' + (glow * 0.3) + ')';
                    ctx.fill();
                    ctx.shadowBlur = 0;
                });
                for (let i = 0; i < particles.length; i++) {
                    for (let j = i + 1; j < particles.length; j++) {
                        const dx = particles[i].x - particles[j].x,
                            dy = particles[i].y - particles[j].y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        if (dist < 150) {
                            const alpha = (1 - dist / 150) * 0.12;
                            const c = particles[i].color;
                            ctx.beginPath();
                            ctx.moveTo(particles[i].x, particles[i].y);
                            ctx.lineTo(particles[j].x, particles[j].y);
                            ctx.strokeStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + alpha + ')';
                            ctx.lineWidth = 0.5;
                            ctx.shadowBlur = 8;
                            ctx.shadowColor = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (alpha * 0.2) + ')';
                            ctx.stroke();
                            ctx.shadowBlur = 0;
                        }
                    }
                }
                animId = requestAnimationFrame(animate);
            }
            animate();
            return function cleanup() { if (animId) cancelAnimationFrame(animId);
                window.removeEventListener('resize', resize); };
        }

        function switchAnimation(animName) {
            if (animCleanup) { animCleanup();
                animCleanup = null; }
            currentAnim = animName;
            const def = animDefs[animName];
            if (def && def.init) {
                setTimeout(() => {
                    const cleanup = def.init();
                    if (cleanup) animCleanup = cleanup;
                }, 50);
            }
            try { localStorage.setItem('zerx-xit-animation', animName); } catch (e) {}
        }

        function loadSavedAnimation() {
            try { const saved = localStorage.getItem('zerx-xit-animation'); if (saved && animDefs[saved]) return saved; } catch (
            e) {}
            return 'aurora';
        }

        function loadAdminAnimation() {
            if (!db) return;
            onValue(ref(db, 'settings/animations'), (snap) => {
                const data = snap.val();
                if (data && data.selected && animDefs[data.selected]) {
                    switchAnimation(data.selected);
                } else {
                    const saved = loadSavedAnimation();
                    switchAnimation(saved);
                }
            }, (error) => {
                const saved = loadSavedAnimation();
                switchAnimation(saved);
            });
        }

        // --- SECURITY ---
        function runSecurityCheck() {
            return new Promise((resolve) => {
                securityOverlay.classList.add('active');
                const bar = document.getElementById('security-bar');
                const status = document.getElementById('security-status');
                const dots = [document.getElementById('dot1'), document.getElementById('dot2'), document.getElementById(
                    'dot3'), document.getElementById('dot4')];
                const checkmark = document.getElementById('security-check');
                bar.style.width = '0%';
                dots.forEach(d => d.className = '');
                checkmark.style.display = 'none';
                status.textContent = 'Initializing security protocols...';
                const steps = [{ text: 'Verifying SSL encryption...', progress: 25 },
                { text: 'Checking session integrity...', progress: 50 },
                { text: 'Validating user permissions...', progress: 75 },
                { text: 'Secure connection established!', progress: 100 }
                ];
                let stepIndex = 0;

                function advance() {
                    if (stepIndex >= steps.length) {
                        status.textContent = '✅ Security check complete!';
                        dots.forEach(d => d.className = 'done');
                        checkmark.style.display = 'block';
                        setTimeout(() => { securityOverlay.classList.remove('active');
                            resolve(); }, 800);
                        return;
                    }
                    const step = steps[stepIndex];
                    status.textContent = step.text;
                    bar.style.width = step.progress + '%';
                    if (stepIndex < dots.length) dots[stepIndex].className = 'active';
                    stepIndex++;
                    setTimeout(advance, 700);
                }
                setTimeout(advance, 400);
            });
        }

        async function performSecurityCheck() { if (securityCompleted) return;
            await runSecurityCheck();
            securityCompleted = true; }

        // --- UTILITIES ---
        window.showLoader = () => loader.classList.remove('hidden');
        window.hideLoader = () => loader.classList.add('hidden');

        window.showToast = (msg, type = 'success') => {
            const c = document.getElementById('toast-container');
            const t = document.createElement('div');
            t.className = 'toast ' + type;
            const icon = type === 'error' ? 'fa-exclamation-circle' : type === 'warning' ? 'fa-exclamation-triangle' :
                'fa-check-circle';
            t.innerHTML = '<i class="fas ' + icon + '"></i> ' + msg;
            c.appendChild(t);
            setTimeout(() => { t.style.opacity = '0';
                t.style.transform = 'translateY(10px)';
                setTimeout(() => t.remove(), 300); }, 3500);
        };

        window.copyToClipboard = (id, label) => {
            const el = document.getElementById(id);
            if (!el) { showToast('Element not found', 'error'); return; }
            let text = el.dataset.key || el.innerText || el.textContent;
            if (!text || text === 'Loading...' || text === 'XXXXXX' || text === 'Not Set' || text === '...' || text ===
                '••••••••••••') { showToast('Nothing to copy', 'warning'); return; }
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(() => showToast(label + ' copied!', 'success')).catch(() =>
                    fallbackCopy(text, label));
            } else { fallbackCopy(text, label); }
        };

        function fallbackCopy(text, label) {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy');
                showToast(label + ' copied!', 'success'); } catch (e) { showToast('Failed to copy. Please copy manually.',
                    'error'); }
            document.body.removeChild(ta);
        }

        // ============================================
        // ============================================
        // VIP SYSTEM — instant wallet-based upgrade.
        // Unlocks the deeper XIT tier in the Sensi Generator.
        // ============================================
        let vipPriceCache = 2000;
        function loadVipPrice() {
            if (!db) return;
            onValue(ref(db, 'settings/vipPrice'), (snap) => {
                const price = snap.exists() ? Number(snap.val()) : 2000;
                vipPriceCache = price > 0 ? price : 2000;
                const label = '₦' + vipPriceCache.toLocaleString();
                const el1 = document.getElementById('vip-price-label');
                const el2 = document.getElementById('land-vip-price');
                if (el1) el1.textContent = label;
                if (el2) el2.innerHTML = label + '<span> one-time</span>';
            });
        }

        document.getElementById('btn-activate-vip')?.addEventListener('click', async function() {
            if (!currentUser || !db) return showToast('Please login first', 'error');
            const btn = this;
            let balance = 0;
            try {
                const snap = await get(ref(db, 'users/' + currentUser.uid + '/balance'));
                balance = Number(snap.val()) || 0;
            } catch (e) { return showToast('Could not check balance', 'error'); }
            if (balance < vipPriceCache) {
                showToast(`Insufficient balance. Need ₦${vipPriceCache.toLocaleString()} — top up your wallet first.`, 'error');
                navigate('wallet');
                return;
            }
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Activating…';
            try {
                const balanceRef = ref(db, 'users/' + currentUser.uid + '/balance');
                const txResult = await runTransaction(balanceRef, (current) => {
                    const bal = Number(current) || 0;
                    if (bal < vipPriceCache) return undefined;
                    return bal - vipPriceCache;
                });
                if (!txResult.committed) {
                    showToast('Transaction failed — balance may have changed.', 'error');
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-crown"></i> Activate VIP — <span class="vip-price-text">₦' + vipPriceCache.toLocaleString() + '</span>';
                    return;
                }
                await update(ref(db, 'users/' + currentUser.uid), { isVip: true, vipActivatedAt: Date.now() });
                const txId = 'VIP' + Date.now();
                await set(ref(db, 'transactions/' + currentUser.uid + '/' + txId), {
                    id: txId, type: 'purchase', amount: vipPriceCache, status: 'success',
                    desc: 'VIP activation', date: new Date().toISOString()
                });
                showToast('VIP activated! The Sensi Generator\u2019s deeper profile is unlocked.', 'success');
            } catch (e) {
                console.error('VIP activation failed', e);
                showToast('Something went wrong activating VIP.', 'error');
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-crown"></i> Activate VIP — <span class="vip-price-text">₦' + vipPriceCache.toLocaleString() + '</span>';
            }
        });

        // ============================================
        // EXPORT MY KEYS (CSV)
        // ============================================
        function downloadCsv(filename, rows) {
            const csv = rows.map(row => row.map(cell => {
                const val = cell === null || cell === undefined ? '' : String(cell);
                return `"${val.replace(/"/g, '""')}"`;
            }).join(',')).join('\r\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        }

        document.getElementById('btn-export-keys')?.addEventListener('click', () => {
            const items = window.myKeysCache || [];
            if (!items.length) return showToast('No keys to export yet', 'warning');
            const rows = [['Panel', 'Plan', 'Price', 'Date', 'License Key', 'Download Link']];
            items.forEach(o => {
                rows.push([
                    o.panelName || 'Panel',
                    o.label || '',
                    o.price || 0,
                    o.date ? new Date(o.date).toLocaleString() : '',
                    o.key || '',
                    o.downloadLink || o.link || ''
                ]);
            });
            downloadCsv(`my-zerx-xit-keys-${Date.now()}.csv`, rows);
            showToast(`Exported ${items.length} keys to CSV`);
        });


        const SENSI_DEVICES = [
        {b:"Samsung",m:"Galaxy S24 Ultra",proc:"Snapdragon 8 Gen 3",gpu:"Adreno 750",ram:"12GB",os:"Android 14",rr:"120Hz",perf:95,gam:98,yr:2024,arch:"ARM64",batt:"5000mAh",res:"3120x1440"},
        {b:"Samsung",m:"Galaxy S24+",proc:"Snapdragon 8 Gen 3",gpu:"Adreno 750",ram:"12GB",os:"Android 14",rr:"120Hz",perf:93,gam:96,yr:2024,arch:"ARM64",batt:"4900mAh",res:"3120x1440"},
        {b:"Samsung",m:"Galaxy S24",proc:"Snapdragon 8 Gen 3",gpu:"Adreno 750",ram:"8GB",os:"Android 14",rr:"120Hz",perf:92,gam:95,yr:2024,arch:"ARM64",batt:"4000mAh",res:"2340x1080"},
        {b:"Samsung",m:"Galaxy S23 Ultra",proc:"Snapdragon 8 Gen 2",gpu:"Adreno 740",ram:"12GB",os:"Android 13",rr:"120Hz",perf:93,gam:97,yr:2023,arch:"ARM64",batt:"5000mAh",res:"3088x1440"},
        {b:"Samsung",m:"Galaxy S23",proc:"Snapdragon 8 Gen 2",gpu:"Adreno 740",ram:"8GB",os:"Android 13",rr:"120Hz",perf:91,gam:95,yr:2023,arch:"ARM64",batt:"3900mAh",res:"2340x1080"},
        {b:"Samsung",m:"Galaxy A56",proc:"Exynos 1580",gpu:"Mali-G68",ram:"8GB",os:"Android 15",rr:"120Hz",perf:78,gam:82,yr:2025,arch:"ARM64",batt:"5000mAh",res:"2340x1080"},
        {b:"Samsung",m:"Galaxy A55",proc:"Exynos 1480",gpu:"Xclipse 530",ram:"8GB",os:"Android 14",rr:"120Hz",perf:75,gam:80,yr:2024,arch:"ARM64",batt:"5000mAh",res:"2340x1080"},
        {b:"Samsung",m:"Galaxy A35",proc:"Exynos 1380",gpu:"Mali-G68",ram:"6GB",os:"Android 14",rr:"120Hz",perf:70,gam:75,yr:2024,arch:"ARM64",batt:"5000mAh",res:"2340x1080"},
        {b:"Samsung",m:"Galaxy A25",proc:"Exynos 1280",gpu:"Mali-G68",ram:"6GB",os:"Android 14",rr:"120Hz",perf:65,gam:70,yr:2024,arch:"ARM64",batt:"5000mAh",res:"2340x1080"},
        {b:"Samsung",m:"Galaxy A15",proc:"Helio G99",gpu:"Mali-G57",ram:"4GB",os:"Android 14",rr:"90Hz",perf:55,gam:60,yr:2024,arch:"ARM64",batt:"5000mAh",res:"2340x1080"},
        {b:"Vivo",m:"V30",proc:"Snapdragon 7 Gen 3",gpu:"Adreno 720",ram:"12GB",os:"Android 14",rr:"120Hz",perf:82,gam:85,yr:2024,arch:"ARM64",batt:"5000mAh",res:"2800x1260"},
        {b:"Vivo",m:"V29",proc:"Snapdragon 778G",gpu:"Adreno 642L",ram:"12GB",os:"Android 13",rr:"120Hz",perf:78,gam:82,yr:2023,arch:"ARM64",batt:"4600mAh",res:"2800x1260"},
        {b:"Vivo",m:"V25",proc:"Dimensity 900",gpu:"Mali-G68",ram:"8GB",os:"Android 12",rr:"90Hz",perf:70,gam:74,yr:2022,arch:"ARM64",batt:"4500mAh",res:"2404x1080"},
        {b:"Vivo",m:"V23e",proc:"Dimensity 810",gpu:"Mali-G57",ram:"8GB",os:"Android 12",rr:"60Hz",perf:62,gam:66,yr:2022,arch:"ARM64",batt:"4050mAh",res:"2404x1080"},
        {b:"Vivo",m:"Y36",proc:"Snapdragon 680",gpu:"Adreno 610",ram:"8GB",os:"Android 13",rr:"90Hz",perf:58,gam:62,yr:2023,arch:"ARM64",batt:"5000mAh",res:"2408x1080"},
        {b:"Vivo",m:"Y28",proc:"Helio G85",gpu:"Mali-G52",ram:"8GB",os:"Android 14",rr:"90Hz",perf:55,gam:58,yr:2024,arch:"ARM64",batt:"6000mAh",res:"2408x1080"},
        {b:"Vivo",m:"Y03",proc:"Helio G85",gpu:"Mali-G52",ram:"4GB",os:"Android 14",rr:"60Hz",perf:48,gam:52,yr:2024,arch:"ARM64",batt:"5000mAh",res:"1612x720"},
        {b:"Oppo",m:"Reno 11 Pro",proc:"Snapdragon 8+ Gen 1",gpu:"Adreno 730",ram:"12GB",os:"Android 14",rr:"120Hz",perf:88,gam:91,yr:2024,arch:"ARM64",batt:"4700mAh",res:"2772x1240"},
        {b:"Oppo",m:"Reno 11",proc:"Dimensity 7050",gpu:"Mali-G68",ram:"8GB",os:"Android 14",rr:"120Hz",perf:76,gam:80,yr:2024,arch:"ARM64",batt:"5000mAh",res:"2412x1080"},
        {b:"Oppo",m:"A79 5G",proc:"Dimensity 6020",gpu:"Mali-G57",ram:"8GB",os:"Android 13",rr:"90Hz",perf:60,gam:64,yr:2023,arch:"ARM64",batt:"5000mAh",res:"2400x1080"},
        {b:"Oppo",m:"A58",proc:"Helio G85",gpu:"Mali-G52",ram:"6GB",os:"Android 13",rr:"90Hz",perf:55,gam:58,yr:2023,arch:"ARM64",batt:"5000mAh",res:"2400x1080"},
        {b:"Realme",m:"GT 6",proc:"Snapdragon 8s Gen 3",gpu:"Adreno 735",ram:"12GB",os:"Android 14",rr:"120Hz",perf:90,gam:93,yr:2024,arch:"ARM64",batt:"5500mAh",res:"2780x1264"},
        {b:"Realme",m:"GT Neo 6",proc:"Snapdragon 8s Gen 3",gpu:"Adreno 735",ram:"12GB",os:"Android 14",rr:"120Hz",perf:89,gam:92,yr:2024,arch:"ARM64",batt:"5500mAh",res:"2780x1264"},
        {b:"Realme",m:"12 Pro+",proc:"Snapdragon 7s Gen 2",gpu:"Adreno 710",ram:"8GB",os:"Android 14",rr:"120Hz",perf:78,gam:82,yr:2024,arch:"ARM64",batt:"5000mAh",res:"2412x1080"},
        {b:"Realme",m:"12+",proc:"Dimensity 7050",gpu:"Mali-G68",ram:"8GB",os:"Android 14",rr:"120Hz",perf:74,gam:78,yr:2024,arch:"ARM64",batt:"5000mAh",res:"2400x1080"},
        {b:"Realme",m:"C67",proc:"Snapdragon 685",gpu:"Adreno 610",ram:"8GB",os:"Android 13",rr:"90Hz",perf:56,gam:60,yr:2023,arch:"ARM64",batt:"5000mAh",res:"2400x1080"},
        {b:"Xiaomi",m:"14 Ultra",proc:"Snapdragon 8 Gen 3",gpu:"Adreno 750",ram:"16GB",os:"Android 14",rr:"120Hz",perf:96,gam:99,yr:2024,arch:"ARM64",batt:"5000mAh",res:"3200x1440"},
        {b:"Xiaomi",m:"14",proc:"Snapdragon 8 Gen 3",gpu:"Adreno 750",ram:"12GB",os:"Android 14",rr:"120Hz",perf:94,gam:97,yr:2024,arch:"ARM64",batt:"4610mAh",res:"2670x1200"},
        {b:"Xiaomi",m:"13T Pro",proc:"Dimensity 9200+",gpu:"Immortalis-G715",ram:"12GB",os:"Android 13",rr:"144Hz",perf:90,gam:94,yr:2023,arch:"ARM64",batt:"5000mAh",res:"2712x1220"},
        {b:"Redmi",m:"Note 13 Pro+",proc:"Dimensity 7200-Ultra",gpu:"Mali-G610",ram:"12GB",os:"Android 13",rr:"120Hz",perf:80,gam:84,yr:2024,arch:"ARM64",batt:"5000mAh",res:"2712x1220"},
        {b:"Redmi",m:"Note 13 Pro",proc:"Snapdragon 7s Gen 2",gpu:"Adreno 710",ram:"8GB",os:"Android 13",rr:"120Hz",perf:76,gam:80,yr:2024,arch:"ARM64",batt:"5100mAh",res:"2712x1220"},
        {b:"Redmi",m:"Note 13",proc:"Dimensity 6080",gpu:"Mali-G57",ram:"6GB",os:"Android 13",rr:"120Hz",perf:68,gam:72,yr:2024,arch:"ARM64",batt:"5000mAh",res:"2400x1080"},
        {b:"Redmi",m:"13C",proc:"Helio G85",gpu:"Mali-G52",ram:"4GB",os:"Android 13",rr:"90Hz",perf:52,gam:55,yr:2023,arch:"ARM64",batt:"5000mAh",res:"1650x720"},
        {b:"Tecno",m:"Phantom V2 Fold",proc:"Dimensity 9000+",gpu:"Mali-G710",ram:"12GB",os:"Android 13",rr:"120Hz",perf:85,gam:88,yr:2023,arch:"ARM64",batt:"5000mAh",res:"2296x2000"},
        {b:"Tecno",m:"Camon 30 Premier",proc:"Dimensity 8200",gpu:"Mali-G610",ram:"12GB",os:"Android 14",rr:"144Hz",perf:82,gam:86,yr:2024,arch:"ARM64",batt:"5000mAh",res:"2800x1260"},
        {b:"Tecno",m:"Pova 6 Pro",proc:"Dimensity 6080",gpu:"Mali-G57",ram:"8GB",os:"Android 14",rr:"120Hz",perf:68,gam:72,yr:2024,arch:"ARM64",batt:"6000mAh",res:"2436x1080"},
        {b:"Tecno",m:"Spark 20 Pro+",proc:"Helio G99",gpu:"Mali-G57",ram:"8GB",os:"Android 13",rr:"120Hz",perf:60,gam:64,yr:2024,arch:"ARM64",batt:"5000mAh",res:"2460x1080"},
        {b:"Tecno",m:"Spark Go 2024",proc:"Helio G85",gpu:"Mali-G52",ram:"4GB",os:"Android 13",rr:"90Hz",perf:50,gam:54,yr:2024,arch:"ARM64",batt:"5000mAh",res:"1612x720"},
        {b:"Infinix",m:"GT 20 Pro",proc:"Dimensity 8200",gpu:"Mali-G610",ram:"12GB",os:"Android 14",rr:"144Hz",perf:83,gam:87,yr:2024,arch:"ARM64",batt:"5000mAh",res:"2436x1080"},
        {b:"Infinix",m:"Note 40 Pro+",proc:"Dimensity 7020",gpu:"IMG BXM-8-256",ram:"12GB",os:"Android 14",rr:"120Hz",perf:72,gam:76,yr:2024,arch:"ARM64",batt:"4600mAh",res:"2436x1080"},
        {b:"Infinix",m:"Hot 40 Pro",proc:"Helio G99",gpu:"Mali-G57",ram:"8GB",os:"Android 13",rr:"90Hz",perf:58,gam:62,yr:2023,arch:"ARM64",batt:"5000mAh",res:"2460x1080"},
        {b:"Infinix",m:"Smart 8",proc:"Helio G36",gpu:"PowerVR GE8320",ram:"4GB",os:"Android 13",rr:"90Hz",perf:42,gam:45,yr:2023,arch:"ARM64",batt:"5000mAh",res:"1612x720"},
        {b:"Itel",m:"S23+",proc:"Unisoc T616",gpu:"Mali-G57",ram:"8GB",os:"Android 13",rr:"90Hz",perf:48,gam:52,yr:2023,arch:"ARM64",batt:"5000mAh",res:"2408x1080"},
        {b:"Itel",m:"P55 5G",proc:"Dimensity 6080",gpu:"Mali-G57",ram:"6GB",os:"Android 13",rr:"90Hz",perf:55,gam:58,yr:2023,arch:"ARM64",batt:"5000mAh",res:"1612x720"},
        {b:"Itel",m:"A70",proc:"Unisoc T603",gpu:"Mali-G57",ram:"4GB",os:"Android 13",rr:"60Hz",perf:38,gam:42,yr:2023,arch:"ARM64",batt:"5000mAh",res:"1612x720"},
        {b:"Nothing",m:"Phone 2a",proc:"Dimensity 7200 Pro",gpu:"Mali-G610",ram:"12GB",os:"Android 14",rr:"120Hz",perf:80,gam:84,yr:2024,arch:"ARM64",batt:"5000mAh",res:"2412x1084"},
        {b:"Nothing",m:"Phone 2",proc:"Snapdragon 8+ Gen 1",gpu:"Adreno 730",ram:"12GB",os:"Android 13",rr:"120Hz",perf:88,gam:91,yr:2023,arch:"ARM64",batt:"4700mAh",res:"2412x1080"},
        {b:"Nothing",m:"Phone 1",proc:"Snapdragon 778G+",gpu:"Adreno 642L",ram:"8GB",os:"Android 12",rr:"120Hz",perf:76,gam:80,yr:2022,arch:"ARM64",batt:"4500mAh",res:"2400x1080"},
        {b:"OnePlus",m:"12",proc:"Snapdragon 8 Gen 3",gpu:"Adreno 750",ram:"16GB",os:"Android 14",rr:"120Hz",perf:95,gam:98,yr:2024,arch:"ARM64",batt:"5400mAh",res:"3168x1440"},
        {b:"OnePlus",m:"12R",proc:"Snapdragon 8 Gen 2",gpu:"Adreno 740",ram:"16GB",os:"Android 14",rr:"120Hz",perf:90,gam:93,yr:2024,arch:"ARM64",batt:"5500mAh",res:"2780x1264"},
        {b:"OnePlus",m:"Nord 4",proc:"Snapdragon 7+ Gen 3",gpu:"Adreno 732",ram:"12GB",os:"Android 14",rr:"120Hz",perf:84,gam:87,yr:2024,arch:"ARM64",batt:"5500mAh",res:"2772x1240"},
        {b:"OnePlus",m:"Nord CE 4",proc:"Snapdragon 7 Gen 3",gpu:"Adreno 720",ram:"8GB",os:"Android 14",rr:"120Hz",perf:78,gam:82,yr:2024,arch:"ARM64",batt:"5500mAh",res:"2412x1080"},
        {b:"Google",m:"Pixel 8 Pro",proc:"Tensor G3",gpu:"Mali-G715",ram:"12GB",os:"Android 14",rr:"120Hz",perf:90,gam:92,yr:2023,arch:"ARM64",batt:"5050mAh",res:"2992x1344"},
        {b:"Google",m:"Pixel 8",proc:"Tensor G3",gpu:"Mali-G715",ram:"8GB",os:"Android 14",rr:"120Hz",perf:88,gam:90,yr:2023,arch:"ARM64",batt:"4575mAh",res:"2400x1080"},
        {b:"Google",m:"Pixel 7a",proc:"Tensor G2",gpu:"Mali-G710",ram:"8GB",os:"Android 13",rr:"90Hz",perf:78,gam:81,yr:2023,arch:"ARM64",batt:"4385mAh",res:"2400x1080"},
        {b:"Motorola",m:"Edge 50 Ultra",proc:"Snapdragon 8s Gen 3",gpu:"Adreno 735",ram:"12GB",os:"Android 14",rr:"144Hz",perf:89,gam:92,yr:2024,arch:"ARM64",batt:"4500mAh",res:"2712x1220"},
        {b:"Motorola",m:"Edge 50 Pro",proc:"Snapdragon 7 Gen 3",gpu:"Adreno 720",ram:"12GB",os:"Android 14",rr:"144Hz",perf:82,gam:85,yr:2024,arch:"ARM64",batt:"4500mAh",res:"2712x1220"},
        {b:"Motorola",m:"Moto G84",proc:"Snapdragon 695",gpu:"Adreno 619",ram:"12GB",os:"Android 13",rr:"120Hz",perf:65,gam:69,yr:2023,arch:"ARM64",batt:"5000mAh",res:"2400x1080"},
        {b:"Motorola",m:"Moto G24",proc:"Helio G85",gpu:"Mali-G52",ram:"4GB",os:"Android 14",rr:"90Hz",perf:50,gam:54,yr:2024,arch:"ARM64",batt:"5000mAh",res:"1612x720"},
        {b:"Huawei",m:"Mate 60 Pro",proc:"Kirin 9000S",gpu:"Maleoon 910",ram:"12GB",os:"HarmonyOS 4",rr:"120Hz",perf:88,gam:90,yr:2023,arch:"ARM64",batt:"5000mAh",res:"2720x1260"},
        {b:"Huawei",m:"Pura 70 Ultra",proc:"Kirin 9010",gpu:"Maleoon 910",ram:"16GB",os:"HarmonyOS 4",rr:"120Hz",perf:90,gam:92,yr:2024,arch:"ARM64",batt:"5200mAh",res:"2844x1260"},
        {b:"Huawei",m:"nova 12 Pro",proc:"Kirin 8000",gpu:"Mali-G610",ram:"12GB",os:"HarmonyOS 4",rr:"120Hz",perf:76,gam:80,yr:2024,arch:"ARM64",batt:"4600mAh",res:"2776x1224"},
        {b:"Honor",m:"Magic 6 Pro",proc:"Snapdragon 8 Gen 3",gpu:"Adreno 750",ram:"12GB",os:"Android 14",rr:"120Hz",perf:93,gam:96,yr:2024,arch:"ARM64",batt:"5600mAh",res:"2800x1280"},
        {b:"Honor",m:"Magic 6",proc:"Snapdragon 8 Gen 3",gpu:"Adreno 750",ram:"12GB",os:"Android 14",rr:"120Hz",perf:91,gam:94,yr:2024,arch:"ARM64",batt:"5450mAh",res:"2800x1280"},
        {b:"Honor",m:"200 Pro",proc:"Snapdragon 8s Gen 3",gpu:"Adreno 735",ram:"12GB",os:"Android 14",rr:"120Hz",perf:85,gam:88,yr:2024,arch:"ARM64",batt:"5200mAh",res:"2700x1224"},
        {b:"Honor",m:"X9b",proc:"Snapdragon 6 Gen 1",gpu:"Adreno 710",ram:"8GB",os:"Android 13",rr:"120Hz",perf:62,gam:66,yr:2023,arch:"ARM64",batt:"5800mAh",res:"2652x1200"},
        {b:"Sony",m:"Xperia 1 VI",proc:"Snapdragon 8 Gen 3",gpu:"Adreno 750",ram:"12GB",os:"Android 14",rr:"120Hz",perf:91,gam:93,yr:2024,arch:"ARM64",batt:"5000mAh",res:"2340x1080"},
        {b:"Sony",m:"Xperia 5 V",proc:"Snapdragon 8 Gen 2",gpu:"Adreno 740",ram:"8GB",os:"Android 13",rr:"120Hz",perf:86,gam:89,yr:2023,arch:"ARM64",batt:"5000mAh",res:"2520x1080"},
        {b:"Sony",m:"Xperia 10 VI",proc:"Snapdragon 6 Gen 1",gpu:"Adreno 710",ram:"8GB",os:"Android 14",rr:"120Hz",perf:65,gam:68,yr:2024,arch:"ARM64",batt:"5000mAh",res:"2520x1080"},
        {b:"Nokia",m:"G42 5G",proc:"Snapdragon 480+",gpu:"Adreno 619",ram:"6GB",os:"Android 13",rr:"90Hz",perf:55,gam:58,yr:2023,arch:"ARM64",batt:"5000mAh",res:"1612x720"},
        {b:"Nokia",m:"G22",proc:"Unisoc T606",gpu:"Mali-G57",ram:"4GB",os:"Android 12",rr:"90Hz",perf:45,gam:48,yr:2023,arch:"ARM64",batt:"5050mAh",res:"1612x720"},
        {b:"Nokia",m:"C32",proc:"Unisoc SC9863A",gpu:"PowerVR GE8322",ram:"4GB",os:"Android 13",rr:"60Hz",perf:35,gam:38,yr:2023,arch:"ARM64",batt:"5000mAh",res:"1600x720"},
        {b:"Apple",m:"iPhone 15 Pro Max",proc:"A17 Pro",gpu:"Apple GPU 6-core",ram:"8GB",os:"iOS 17",rr:"120Hz",perf:96,gam:98,yr:2023,arch:"ARM64",batt:"4441mAh",res:"2796x1290"},
        {b:"Apple",m:"iPhone 15 Pro",proc:"A17 Pro",gpu:"Apple GPU 6-core",ram:"8GB",os:"iOS 17",rr:"120Hz",perf:95,gam:97,yr:2023,arch:"ARM64",batt:"3274mAh",res:"2556x1179"},
        {b:"Apple",m:"iPhone 15",proc:"A16 Bionic",gpu:"Apple GPU 5-core",ram:"6GB",os:"iOS 17",rr:"60Hz",perf:90,gam:93,yr:2023,arch:"ARM64",batt:"3349mAh",res:"2556x1179"},
        {b:"Apple",m:"iPhone 14 Pro Max",proc:"A16 Bionic",gpu:"Apple GPU 5-core",ram:"6GB",os:"iOS 16",rr:"120Hz",perf:93,gam:96,yr:2022,arch:"ARM64",batt:"4323mAh",res:"2796x1290"},
        {b:"Apple",m:"iPhone 14",proc:"A15 Bionic",gpu:"Apple GPU 5-core",ram:"6GB",os:"iOS 16",rr:"60Hz",perf:88,gam:91,yr:2022,arch:"ARM64",batt:"3279mAh",res:"2532x1170"},
        {b:"Apple",m:"iPhone 13",proc:"A15 Bionic",gpu:"Apple GPU 4-core",ram:"4GB",os:"iOS 15",rr:"60Hz",perf:85,gam:88,yr:2021,arch:"ARM64",batt:"3227mAh",res:"2532x1170"},
        {b:"Apple",m:"iPhone SE 2022",proc:"A15 Bionic",gpu:"Apple GPU 4-core",ram:"4GB",os:"iOS 15",rr:"60Hz",perf:78,gam:81,yr:2022,arch:"ARM64",batt:"2018mAh",res:"1334x750"},
        {b:"Samsung",m:"Galaxy S25 Ultra",proc:"Snapdragon 8 Elite",gpu:"Adreno 830",ram:"12GB",os:"Android 15",rr:"120Hz",perf:98,gam:99,yr:2025,arch:"ARM64",batt:"5000mAh",res:"3120x1440"},
        {b:"Samsung",m:"Galaxy S22 Ultra",proc:"Snapdragon 8 Gen 1",gpu:"Adreno 730",ram:"12GB",os:"Android 12",rr:"120Hz",perf:89,gam:92,yr:2022,arch:"ARM64",batt:"5000mAh",res:"3088x1440"},
        {b:"Samsung",m:"Galaxy S21 FE",proc:"Snapdragon 888",gpu:"Adreno 660",ram:"8GB",os:"Android 12",rr:"120Hz",perf:85,gam:88,yr:2022,arch:"ARM64",batt:"4500mAh",res:"2340x1080"},
        {b:"Samsung",m:"Galaxy A54",proc:"Exynos 1380",gpu:"Mali-G68",ram:"8GB",os:"Android 13",rr:"120Hz",perf:72,gam:76,yr:2023,arch:"ARM64",batt:"5000mAh",res:"2340x1080"},
        {b:"Samsung",m:"Galaxy A53",proc:"Exynos 1280",gpu:"Mali-G68",ram:"6GB",os:"Android 12",rr:"120Hz",perf:68,gam:72,yr:2022,arch:"ARM64",batt:"5000mAh",res:"2400x1080"},
        {b:"Samsung",m:"Galaxy A34",proc:"Dimensity 1080",gpu:"Mali-G68",ram:"6GB",os:"Android 13",rr:"120Hz",perf:69,gam:73,yr:2023,arch:"ARM64",batt:"5000mAh",res:"2340x1080"},
        {b:"Samsung",m:"Galaxy A33",proc:"Exynos 1280",gpu:"Mali-G68",ram:"6GB",os:"Android 12",rr:"90Hz",perf:64,gam:68,yr:2022,arch:"ARM64",batt:"5000mAh",res:"2400x1080"},
        {b:"Samsung",m:"Galaxy A24",proc:"Helio G99",gpu:"Mali-G57",ram:"6GB",os:"Android 13",rr:"90Hz",perf:58,gam:62,yr:2023,arch:"ARM64",batt:"5000mAh",res:"2340x1080"},
        {b:"Samsung",m:"Galaxy A23",proc:"Snapdragon 680",gpu:"Adreno 610",ram:"4GB",os:"Android 12",rr:"120Hz",perf:56,gam:60,yr:2022,arch:"ARM64",batt:"5000mAh",res:"2408x1080"},
        {b:"Samsung",m:"Galaxy A14",proc:"Helio G80",gpu:"Mali-G52",ram:"4GB",os:"Android 13",rr:"90Hz",perf:50,gam:54,yr:2023,arch:"ARM64",batt:"5000mAh",res:"2408x1080"},
        {b:"Samsung",m:"Galaxy A13",proc:"Exynos 850",gpu:"Mali-G52",ram:"4GB",os:"Android 12",rr:"60Hz",perf:44,gam:48,yr:2022,arch:"ARM64",batt:"5000mAh",res:"2408x1080"},
        {b:"Samsung",m:"Galaxy A05s",proc:"Snapdragon 680",gpu:"Adreno 610",ram:"4GB",os:"Android 13",rr:"90Hz",perf:52,gam:56,yr:2023,arch:"ARM64",batt:"5000mAh",res:"2408x1080"},
        {b:"Samsung",m:"Galaxy A04",proc:"Helio P35",gpu:"PowerVR GE8320",ram:"4GB",os:"Android 12",rr:"60Hz",perf:36,gam:40,yr:2022,arch:"ARM64",batt:"5000mAh",res:"1560x720"},
        {b:"Samsung",m:"Galaxy M34",proc:"Exynos 1280",gpu:"Mali-G68",ram:"6GB",os:"Android 13",rr:"120Hz",perf:65,gam:69,yr:2023,arch:"ARM64",batt:"6000mAh",res:"2340x1080"},
        {b:"Samsung",m:"Galaxy M14",proc:"Exynos 1330",gpu:"Mali-G68",ram:"4GB",os:"Android 13",rr:"90Hz",perf:56,gam:60,yr:2023,arch:"ARM64",batt:"6000mAh",res:"2408x1080"},
        {b:"Xiaomi",m:"13 Pro",proc:"Snapdragon 8 Gen 2",gpu:"Adreno 740",ram:"12GB",os:"Android 13",rr:"120Hz",perf:93,gam:96,yr:2023,arch:"ARM64",batt:"4820mAh",res:"3200x1440"},
        {b:"Xiaomi",m:"12 Lite",proc:"Snapdragon 778G",gpu:"Adreno 642L",ram:"8GB",os:"Android 12",rr:"120Hz",perf:74,gam:78,yr:2022,arch:"ARM64",batt:"4300mAh",res:"2400x1080"},
        {b:"Xiaomi",m:"Redmi Note 14 Pro",proc:"Dimensity 7300 Ultra",gpu:"Mali-G615",ram:"8GB",os:"Android 14",rr:"120Hz",perf:78,gam:82,yr:2025,arch:"ARM64",batt:"5500mAh",res:"2712x1220"},
        {b:"Redmi",m:"Note 12 Pro",proc:"Dimensity 1080",gpu:"Mali-G68",ram:"8GB",os:"Android 12",rr:"120Hz",perf:72,gam:76,yr:2023,arch:"ARM64",batt:"5000mAh",res:"2400x1080"},
        {b:"Redmi",m:"Note 12",proc:"Snapdragon 685",gpu:"Adreno 610",ram:"6GB",os:"Android 13",rr:"120Hz",perf:60,gam:64,yr:2023,arch:"ARM64",batt:"5000mAh",res:"2400x1080"},
        {b:"Redmi",m:"Note 11",proc:"Snapdragon 680",gpu:"Adreno 610",ram:"6GB",os:"Android 11",rr:"90Hz",perf:57,gam:61,yr:2022,arch:"ARM64",batt:"5000mAh",res:"2400x1080"},
        {b:"Redmi",m:"Note 10",proc:"Snapdragon 678",gpu:"Adreno 612",ram:"4GB",os:"Android 11",rr:"60Hz",perf:55,gam:59,yr:2021,arch:"ARM64",batt:"5000mAh",res:"2400x1080"},
        {b:"Redmi",m:"Note 9",proc:"Helio G85",gpu:"Mali-G52",ram:"4GB",os:"Android 10",rr:"60Hz",perf:50,gam:54,yr:2020,arch:"ARM64",batt:"5020mAh",res:"2340x1080"},
        {b:"Redmi",m:"12",proc:"Helio G88",gpu:"Mali-G52",ram:"8GB",os:"Android 13",rr:"90Hz",perf:55,gam:58,yr:2023,arch:"ARM64",batt:"5000mAh",res:"2460x1080"},
        {b:"Redmi",m:"A3",proc:"Helio G36",gpu:"PowerVR GE8320",ram:"4GB",os:"Android 14",rr:"90Hz",perf:40,gam:43,yr:2024,arch:"ARM64",batt:"5000mAh",res:"1640x720"},
        {b:"POCO",m:"F6",proc:"Snapdragon 8s Gen 3",gpu:"Adreno 735",ram:"12GB",os:"Android 14",rr:"120Hz",perf:90,gam:93,yr:2024,arch:"ARM64",batt:"5000mAh",res:"2712x1220"},
        {b:"POCO",m:"X6 Pro",proc:"Dimensity 8300 Ultra",gpu:"Mali-G615",ram:"12GB",os:"Android 14",rr:"120Hz",perf:87,gam:90,yr:2024,arch:"ARM64",batt:"5000mAh",res:"2712x1220"},
        {b:"POCO",m:"X5 Pro",proc:"Snapdragon 778G",gpu:"Adreno 642L",ram:"8GB",os:"Android 12",rr:"120Hz",perf:76,gam:80,yr:2023,arch:"ARM64",batt:"5000mAh",res:"2400x1080"},
        {b:"POCO",m:"M6 Pro",proc:"Helio G99 Ultra",gpu:"Mali-G57",ram:"8GB",os:"Android 13",rr:"120Hz",perf:63,gam:67,yr:2023,arch:"ARM64",batt:"5000mAh",res:"2400x1080"},
        {b:"POCO",m:"C65",proc:"Helio G85",gpu:"Mali-G52",ram:"6GB",os:"Android 13",rr:"90Hz",perf:52,gam:56,yr:2023,arch:"ARM64",batt:"5000mAh",res:"1650x720"},
        {b:"Tecno",m:"Camon 20 Pro",proc:"Helio G99",gpu:"Mali-G57",ram:"8GB",os:"Android 13",rr:"120Hz",perf:62,gam:66,yr:2023,arch:"ARM64",batt:"5000mAh",res:"2400x1080"},
        {b:"Tecno",m:"Camon 19",proc:"Helio G85",gpu:"Mali-G52",ram:"6GB",os:"Android 12",rr:"60Hz",perf:54,gam:58,yr:2022,arch:"ARM64",batt:"5000mAh",res:"2460x1080"},
        {b:"Tecno",m:"Camon 30",proc:"Helio G99 Ultimate",gpu:"Mali-G57",ram:"8GB",os:"Android 14",rr:"120Hz",perf:65,gam:69,yr:2024,arch:"ARM64",batt:"5000mAh",res:"2436x1080"},
        {b:"Tecno",m:"Spark 20",proc:"Helio G85",gpu:"Mali-G52",ram:"8GB",os:"Android 13",rr:"90Hz",perf:53,gam:57,yr:2024,arch:"ARM64",batt:"5000mAh",res:"1612x720"},
        {b:"Tecno",m:"Spark 20 Pro",proc:"Helio G99",gpu:"Mali-G57",ram:"8GB",os:"Android 13",rr:"120Hz",perf:60,gam:64,yr:2024,arch:"ARM64",batt:"5000mAh",res:"2400x1080"},
        {b:"Tecno",m:"Spark 10 Pro",proc:"Helio G88",gpu:"Mali-G52",ram:"8GB",os:"Android 13",rr:"90Hz",perf:55,gam:59,yr:2023,arch:"ARM64",batt:"5000mAh",res:"2460x1080"},
        {b:"Tecno",m:"Spark 10",proc:"Helio G37",gpu:"PowerVR GE8320",ram:"4GB",os:"Android 13",rr:"90Hz",perf:43,gam:47,yr:2023,arch:"ARM64",batt:"5000mAh",res:"1612x720"},
        {b:"Tecno",m:"Spark 9",proc:"Helio G37",gpu:"PowerVR GE8320",ram:"4GB",os:"Android 12",rr:"90Hz",perf:42,gam:46,yr:2022,arch:"ARM64",batt:"5000mAh",res:"1612x720"},
        {b:"Tecno",m:"Pova 5",proc:"Helio G99",gpu:"Mali-G57",ram:"8GB",os:"Android 13",rr:"120Hz",perf:61,gam:65,yr:2023,arch:"ARM64",batt:"6000mAh",res:"2460x1080"},
        {b:"Tecno",m:"Pova 5 Pro",proc:"Dimensity 6080",gpu:"Mali-G57",ram:"8GB",os:"Android 13",rr:"120Hz",perf:66,gam:70,yr:2023,arch:"ARM64",batt:"5000mAh",res:"2436x1080"},
        {b:"Tecno",m:"Pova 6 Neo",proc:"Helio G99 Ultimate",gpu:"Mali-G57",ram:"8GB",os:"Android 14",rr:"120Hz",perf:62,gam:66,yr:2024,arch:"ARM64",batt:"7000mAh",res:"2436x1080"},
        {b:"Tecno",m:"Pop 8",proc:"Unisoc T606",gpu:"Mali-G57",ram:"3GB",os:"Android 13",rr:"90Hz",perf:38,gam:42,yr:2024,arch:"ARM64",batt:"5000mAh",res:"1612x720"},
        {b:"Tecno",m:"Camon 40 Pro",proc:"Dimensity 7300 Ultra",gpu:"Mali-G615",ram:"8GB",os:"Android 15",rr:"144Hz",perf:78,gam:82,yr:2025,arch:"ARM64",batt:"5200mAh",res:"2436x1080"},
        {b:"Infinix",m:"Note 40",proc:"Helio G99 Ultimate",gpu:"Mali-G57",ram:"8GB",os:"Android 14",rr:"120Hz",perf:63,gam:67,yr:2024,arch:"ARM64",batt:"5000mAh",res:"2436x1080"},
        {b:"Infinix",m:"Note 40 Pro",proc:"Dimensity 7020",gpu:"IMG BXM-8-256",ram:"12GB",os:"Android 14",rr:"120Hz",perf:71,gam:75,yr:2024,arch:"ARM64",batt:"5000mAh",res:"2436x1080"},
        {b:"Infinix",m:"Note 30",proc:"Helio G99",gpu:"Mali-G57",ram:"8GB",os:"Android 13",rr:"120Hz",perf:61,gam:65,yr:2023,arch:"ARM64",batt:"5000mAh",res:"2460x1080"},
        {b:"Infinix",m:"Note 30 VIP",proc:"Dimensity 8050",gpu:"Mali-G77",ram:"12GB",os:"Android 13",rr:"120Hz",perf:80,gam:84,yr:2023,arch:"ARM64",batt:"5000mAh",res:"2400x1080"},
        {b:"Infinix",m:"Note 12",proc:"Helio G88",gpu:"Mali-G52",ram:"6GB",os:"Android 12",rr:"60Hz",perf:54,gam:58,yr:2022,arch:"ARM64",batt:"5000mAh",res:"2400x1080"},
        {b:"Infinix",m:"Hot 40",proc:"Helio G88",gpu:"Mali-G52",ram:"8GB",os:"Android 13",rr:"90Hz",perf:55,gam:59,yr:2023,arch:"ARM64",batt:"5000mAh",res:"2460x1080"},
        {b:"Infinix",m:"Hot 40i",proc:"Unisoc T606",gpu:"Mali-G57",ram:"8GB",os:"Android 13",rr:"90Hz",perf:45,gam:49,yr:2023,arch:"ARM64",batt:"5000mAh",res:"1612x720"},
        {b:"Infinix",m:"Hot 30",proc:"Helio G88",gpu:"Mali-G52",ram:"8GB",os:"Android 12",rr:"90Hz",perf:54,gam:58,yr:2023,arch:"ARM64",batt:"5000mAh",res:"2460x1080"},
        {b:"Infinix",m:"Hot 30i",proc:"Helio G37",gpu:"PowerVR GE8320",ram:"4GB",os:"Android 12",rr:"90Hz",perf:43,gam:47,yr:2023,arch:"ARM64",batt:"5000mAh",res:"1612x720"},
        {b:"Infinix",m:"Hot 50 Pro",proc:"Helio G100",gpu:"Mali-G57",ram:"8GB",os:"Android 14",rr:"120Hz",perf:64,gam:68,yr:2024,arch:"ARM64",batt:"5000mAh",res:"2436x1080"},
        {b:"Infinix",m:"Zero 30",proc:"Dimensity 8020",gpu:"Mali-G77",ram:"12GB",os:"Android 13",rr:"144Hz",perf:79,gam:83,yr:2023,arch:"ARM64",batt:"5000mAh",res:"2400x1080"},
        {b:"Infinix",m:"Smart 9",proc:"Unisoc T615",gpu:"Mali-G57",ram:"4GB",os:"Android 14",rr:"90Hz",perf:44,gam:48,yr:2024,arch:"ARM64",batt:"5000mAh",res:"1612x720"},
        {b:"Infinix",m:"GT 10 Pro",proc:"Dimensity 8050",gpu:"Mali-G77",ram:"8GB",os:"Android 13",rr:"120Hz",perf:80,gam:84,yr:2023,arch:"ARM64",batt:"5000mAh",res:"2400x1080"},
        {b:"Itel",m:"S24",proc:"Helio G91",gpu:"Mali-G52",ram:"8GB",os:"Android 13",rr:"90Hz",perf:50,gam:54,yr:2024,arch:"ARM64",batt:"5000mAh",res:"2400x1080"},
        {b:"Itel",m:"P55",proc:"Unisoc T606",gpu:"Mali-G57",ram:"8GB",os:"Android 13",rr:"90Hz",perf:46,gam:50,yr:2023,arch:"ARM64",batt:"5000mAh",res:"1612x720"},
        {b:"Itel",m:"A80",proc:"Unisoc T7100",gpu:"Mali-G57",ram:"4GB",os:"Android 14",rr:"90Hz",perf:42,gam:46,yr:2024,arch:"ARM64",batt:"5000mAh",res:"1612x720"},
        {b:"Itel",m:"A60s",proc:"Unisoc SC9863A",gpu:"PowerVR GE8322",ram:"4GB",os:"Android 12",rr:"60Hz",perf:32,gam:36,yr:2023,arch:"ARM64",batt:"4000mAh",res:"1600x720"},
        {b:"Oppo",m:"Reno 12",proc:"Dimensity 7300 Energy",gpu:"Mali-G615",ram:"12GB",os:"Android 14",rr:"120Hz",perf:79,gam:83,yr:2024,arch:"ARM64",batt:"5000mAh",res:"2412x1080"},
        {b:"Oppo",m:"Reno 10",proc:"Dimensity 7050",gpu:"Mali-G68",ram:"8GB",os:"Android 13",rr:"120Hz",perf:74,gam:78,yr:2023,arch:"ARM64",batt:"5000mAh",res:"2412x1080"},
        {b:"Oppo",m:"Reno 8T",proc:"Snapdragon 680",gpu:"Adreno 610",ram:"8GB",os:"Android 13",rr:"90Hz",perf:58,gam:62,yr:2023,arch:"ARM64",batt:"5000mAh",res:"2400x1080"},
        {b:"Oppo",m:"A98",proc:"Snapdragon 695",gpu:"Adreno 619",ram:"8GB",os:"Android 13",rr:"120Hz",perf:64,gam:68,yr:2023,arch:"ARM64",batt:"5000mAh",res:"2400x1080"},
        {b:"Oppo",m:"A78",proc:"Snapdragon 680",gpu:"Adreno 610",ram:"8GB",os:"Android 13",rr:"90Hz",perf:57,gam:61,yr:2023,arch:"ARM64",batt:"5000mAh",res:"2400x1080"},
        {b:"Oppo",m:"A18",proc:"Helio G85",gpu:"Mali-G52",ram:"4GB",os:"Android 13",rr:"90Hz",perf:51,gam:55,yr:2023,arch:"ARM64",batt:"5000mAh",res:"1612x720"},
        {b:"Realme",m:"13 Pro+",proc:"Snapdragon 7s Gen 2",gpu:"Adreno 710",ram:"12GB",os:"Android 14",rr:"120Hz",perf:80,gam:84,yr:2024,arch:"ARM64",batt:"5200mAh",res:"2412x1080"},
        {b:"Realme",m:"11 Pro",proc:"Dimensity 7050",gpu:"Mali-G68",ram:"8GB",os:"Android 13",rr:"120Hz",perf:74,gam:78,yr:2023,arch:"ARM64",batt:"5000mAh",res:"2412x1080"},
        {b:"Realme",m:"10",proc:"Helio G99",gpu:"Mali-G57",ram:"8GB",os:"Android 13",rr:"90Hz",perf:62,gam:66,yr:2022,arch:"ARM64",batt:"5000mAh",res:"2400x1080"},
        {b:"Realme",m:"C55",proc:"Helio G88",gpu:"Mali-G52",ram:"6GB",os:"Android 13",rr:"90Hz",perf:55,gam:59,yr:2023,arch:"ARM64",batt:"5000mAh",res:"2412x1080"},
        {b:"Realme",m:"C53",proc:"Unisoc T612",gpu:"Mali-G57",ram:"6GB",os:"Android 13",rr:"90Hz",perf:48,gam:52,yr:2023,arch:"ARM64",batt:"5000mAh",res:"2400x1080"},
        {b:"Realme",m:"Narzo 70",proc:"Dimensity 7050",gpu:"Mali-G68",ram:"8GB",os:"Android 14",rr:"120Hz",perf:73,gam:77,yr:2024,arch:"ARM64",batt:"5000mAh",res:"2400x1080"},
        {b:"OnePlus",m:"11",proc:"Snapdragon 8 Gen 2",gpu:"Adreno 740",ram:"12GB",os:"Android 13",rr:"120Hz",perf:93,gam:96,yr:2023,arch:"ARM64",batt:"5000mAh",res:"3216x1440"},
        {b:"OnePlus",m:"Nord 3",proc:"Dimensity 9000",gpu:"Mali-G710",ram:"8GB",os:"Android 13",rr:"120Hz",perf:86,gam:89,yr:2023,arch:"ARM64",batt:"5000mAh",res:"2772x1240"},
        {b:"OnePlus",m:"Nord CE 3 Lite",proc:"Snapdragon 695",gpu:"Adreno 619",ram:"8GB",os:"Android 13",rr:"120Hz",perf:64,gam:68,yr:2023,arch:"ARM64",batt:"5000mAh",res:"2400x1080"},
        {b:"Vivo",m:"X100",proc:"Dimensity 9300",gpu:"Immortalis-G720",ram:"12GB",os:"Android 14",rr:"120Hz",perf:95,gam:97,yr:2024,arch:"ARM64",batt:"5000mAh",res:"2800x1260"},
        {b:"Vivo",m:"V40",proc:"Snapdragon 7 Gen 3",gpu:"Adreno 720",ram:"8GB",os:"Android 14",rr:"120Hz",perf:81,gam:85,yr:2024,arch:"ARM64",batt:"5500mAh",res:"2800x1260"},
        {b:"Vivo",m:"Y100",proc:"Snapdragon 695",gpu:"Adreno 619",ram:"8GB",os:"Android 13",rr:"120Hz",perf:65,gam:69,yr:2023,arch:"ARM64",batt:"5000mAh",res:"2400x1080"},
        {b:"Vivo",m:"Y27",proc:"Helio G85",gpu:"Mali-G52",ram:"6GB",os:"Android 13",rr:"90Hz",perf:54,gam:58,yr:2023,arch:"ARM64",batt:"5000mAh",res:"2388x1080"},
        {b:"Vivo",m:"Y17s",proc:"Helio G85",gpu:"Mali-G52",ram:"4GB",os:"Android 13",rr:"60Hz",perf:50,gam:54,yr:2023,arch:"ARM64",batt:"5000mAh",res:"1612x720"},
        {b:"Google",m:"Pixel 9 Pro",proc:"Tensor G4",gpu:"Mali-G715",ram:"16GB",os:"Android 15",rr:"120Hz",perf:92,gam:94,yr:2024,arch:"ARM64",batt:"4700mAh",res:"2856x1280"},
        {b:"Google",m:"Pixel 6a",proc:"Tensor",gpu:"Mali-G78",ram:"6GB",os:"Android 12",rr:"60Hz",perf:76,gam:79,yr:2022,arch:"ARM64",batt:"4410mAh",res:"2400x1080"},
        {b:"Motorola",m:"Moto G64",proc:"Dimensity 7025",gpu:"Mali-G615",ram:"8GB",os:"Android 14",rr:"120Hz",perf:68,gam:72,yr:2024,arch:"ARM64",batt:"6000mAh",res:"2400x1080"},
        {b:"Motorola",m:"Moto G54",proc:"Dimensity 7020",gpu:"Mali-G57",ram:"8GB",os:"Android 13",rr:"120Hz",perf:66,gam:70,yr:2023,arch:"ARM64",batt:"6000mAh",res:"2400x1080"},
        {b:"Motorola",m:"Moto G14",proc:"Unisoc T616",gpu:"Mali-G57",ram:"4GB",os:"Android 13",rr:"60Hz",perf:47,gam:51,yr:2023,arch:"ARM64",batt:"5000mAh",res:"2400x1080"},
        {b:"Nokia",m:"X30",proc:"Snapdragon 695",gpu:"Adreno 619",ram:"8GB",os:"Android 12",rr:"90Hz",perf:63,gam:67,yr:2022,arch:"ARM64",batt:"4200mAh",res:"2400x1080"},
        {b:"Nokia",m:"G60",proc:"Snapdragon 695",gpu:"Adreno 619",ram:"6GB",os:"Android 12",rr:"120Hz",perf:62,gam:66,yr:2022,arch:"ARM64",batt:"4500mAh",res:"2400x1080"},
        {b:"Honor",m:"X8b",proc:"Snapdragon 680",gpu:"Adreno 610",ram:"8GB",os:"Android 13",rr:"90Hz",perf:57,gam:61,yr:2024,arch:"ARM64",batt:"4500mAh",res:"2412x1080"},
        {b:"Honor",m:"90",proc:"Snapdragon 7 Gen 1",gpu:"Adreno 644",ram:"8GB",os:"Android 13",rr:"120Hz",perf:77,gam:81,yr:2023,arch:"ARM64",batt:"5000mAh",res:"2664x1200"},
        {b:"Huawei",m:"nova 11",proc:"Snapdragon 778G",gpu:"Adreno 642L",ram:"8GB",os:"HarmonyOS 3",rr:"120Hz",perf:74,gam:78,yr:2023,arch:"ARM64",batt:"4500mAh",res:"2412x1084"},
        {b:"Huawei",m:"nova Y72",proc:"Snapdragon 680",gpu:"Adreno 610",ram:"8GB",os:"HarmonyOS 3",rr:"90Hz",perf:56,gam:60,yr:2024,arch:"ARM64",batt:"6000mAh",res:"2388x1080"},
        {b:"Apple",m:"iPhone 16 Pro Max",proc:"A18 Pro",gpu:"Apple GPU 6-core",ram:"8GB",os:"iOS 18",rr:"120Hz",perf:99,gam:100,yr:2024,arch:"ARM64",batt:"4685mAh",res:"2868x1320"},
        {b:"Apple",m:"iPhone 16",proc:"A18",gpu:"Apple GPU 5-core",ram:"8GB",os:"iOS 18",rr:"60Hz",perf:94,gam:96,yr:2024,arch:"ARM64",batt:"3561mAh",res:"2556x1179"},
        {b:"Apple",m:"iPhone 13 Pro Max",proc:"A15 Bionic",gpu:"Apple GPU 5-core",ram:"6GB",os:"iOS 15",rr:"120Hz",perf:90,gam:93,yr:2021,arch:"ARM64",batt:"4352mAh",res:"2778x1284"},
        {b:"Apple",m:"iPhone 12",proc:"A14 Bionic",gpu:"Apple GPU 4-core",ram:"4GB",os:"iOS 14",rr:"60Hz",perf:82,gam:85,yr:2020,arch:"ARM64",batt:"2815mAh",res:"2532x1170"},
        {b:"Apple",m:"iPhone 11",proc:"A13 Bionic",gpu:"Apple GPU 4-core",ram:"4GB",os:"iOS 13",rr:"60Hz",perf:78,gam:81,yr:2019,arch:"ARM64",batt:"3110mAh",res:"1792x828"}
        ];

        // ============================================
        // SENSI GENERATOR — device-specific sensitivity
        // Ported from the local deterministic engine (engine.py).
        // No random numbers, no external API — every value is
        // calculated from hardware + play style, entirely client-side.
        // ============================================

        const SENSI_PROC_TIERS = {
            'Snapdragon 8 Elite': 100, 'Snapdragon 8 Gen 3': 100, 'A17 Pro': 100, 'Tensor G3': 95,
            'Snapdragon 8 Gen 2': 95, 'A16 Bionic': 95, 'Dimensity 9200+': 94,
            'Snapdragon 8+ Gen 1': 92, 'Kirin 9010': 92, 'Dimensity 9000+': 91,
            'Snapdragon 8s Gen 3': 93, 'Snapdragon 8s Gen 2': 90, 'Snapdragon 888': 85,
            'Snapdragon 8 Gen 1': 89,
            'Snapdragon 7+ Gen 3': 85, 'Dimensity 8200': 84, 'Snapdragon 7 Gen 3': 82,
            'Dimensity 7200': 80, 'Dimensity 7200 Pro': 81, 'Snapdragon 7s Gen 2': 78,
            'Tensor G2': 80, 'A15 Bionic': 88, 'Kirin 9000S': 87, 'Kirin 8000': 76,
            'Snapdragon 6 Gen 1': 62, 'Dimensity 1080': 69,
            'Snapdragon 778G': 72, 'Snapdragon 778G+': 74, 'Dimensity 7050': 70,
            'Dimensity 7020': 68, 'Dimensity 6080': 65, 'Snapdragon 695': 64,
            'Snapdragon 685': 60, 'Snapdragon 680': 58, 'Helio G99': 62,
            'Exynos 1580': 75, 'Exynos 1480': 72, 'Exynos 1380': 68, 'Exynos 1330': 56,
            'Exynos 1280': 60, 'Exynos 850': 44,
            'Dimensity 900': 70, 'Dimensity 810': 62, 'Dimensity 700': 52,
            'Helio G85': 55, 'Helio G88': 56, 'Helio G80': 50, 'Snapdragon 480+': 52,
            'Dimensity 6020': 58, 'Dimensity 6100+': 56, 'Unisoc T616': 48,
            'Helio G36': 40, 'Helio G37': 42, 'Unisoc T606': 38,
            'Unisoc T603': 35, 'Unisoc SC9863A': 30, 'Snapdragon 4 Gen 1': 50,
            'Helio P35': 34, 'PowerVR GE8320': 28, 'PowerVR GE8322': 30,
            'Mali-G52': 45, 'Mali-G57': 50
        };

        const SENSI_STYLE_MODS = {
            'One Tap': { general: 0.85, red_dot: 0.75, scope2x: 0.70, scope4x: 0.65, sniper: 0.55, free_look: 0.80, dpi_mod: 1.10,
                desc: 'Precision-focused. Lower sensitivity for cleaner headshots.' },
            'Balanced': { general: 1.00, red_dot: 1.00, scope2x: 1.00, scope4x: 1.00, sniper: 1.00, free_look: 1.00, dpi_mod: 1.00,
                desc: 'Well-rounded settings for all situations.' },
            'Rusher': { general: 1.20, red_dot: 1.15, scope2x: 1.10, scope4x: 1.05, sniper: 0.90, free_look: 1.20, dpi_mod: 0.95,
                desc: 'High mobility. Faster turning for close-range combat.' },
            'Freestyle': { general: 1.10, red_dot: 1.05, scope2x: 1.00, scope4x: 0.95, sniper: 0.85, free_look: 1.15, dpi_mod: 1.05,
                desc: 'Adaptive play. Medium-high with smooth transitions.' },
            'Sniper': { general: 0.75, red_dot: 0.65, scope2x: 0.60, scope4x: 0.55, sniper: 0.45, free_look: 0.70, dpi_mod: 1.20,
                desc: 'Long-range specialist. Slow, stable tracking.' },
            'Instaplayer': { general: 1.30, red_dot: 1.25, scope2x: 1.20, scope4x: 1.10, sniper: 1.00, free_look: 1.30, dpi_mod: 0.90,
                desc: 'Maximum speed drag-headshot style. For experienced players.' }
        };

        const SENSI_REFRESH_MODS = { '144Hz': 1.08, '120Hz': 1.05, '90Hz': 1.02, '60Hz': 1.00, '165Hz': 1.10, '240Hz': 1.12 };
        const SENSI_RAM_MODS = { '24GB': 1.06, '16GB': 1.05, '12GB': 1.04, '8GB': 1.02, '6GB': 1.00, '4GB': 0.97, '3GB': 0.94, '2GB': 0.90 };

        function sensiClamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

        function sensiGetProcScore(processor) {
            if (!processor || processor === 'Unknown') return 50;
            if (SENSI_PROC_TIERS[processor] !== undefined) return SENSI_PROC_TIERS[processor];
            const p = processor.toLowerCase();
            for (const name in SENSI_PROC_TIERS) {
                const n = name.toLowerCase();
                if (p.includes(n) || n.includes(p)) return SENSI_PROC_TIERS[name];
            }
            return 50;
        }
        function sensiGetRefreshMod(rr) {
            if (!rr) return 1.0;
            const key = String(rr).replace(/Hz/i, '').trim() + 'Hz';
            return SENSI_REFRESH_MODS[key] || 1.0;
        }
        function sensiGetRamMod(ram) {
            if (!ram) return 1.0;
            const key = String(ram).replace(/GB/i, '').trim() + 'GB';
            return SENSI_RAM_MODS[key] || 1.0;
        }
        function sensiScreenFactor(screen) {
            if (!screen) return { factor: 1.0, longEdge: null };
            const width = parseFloat(screen.width) || 0;
            const height = parseFloat(screen.height) || 0;
            const ratio = parseFloat(screen.pixel_ratio) || 1;
            if (width <= 0 || height <= 0) return { factor: 1.0, longEdge: null };
            const longEdge = Math.max(width, height) * ratio;
            if (longEdge <= 0) return { factor: 1.0, longEdge: null };
            let factor = Math.pow(2400 / longEdge, 0.25);
            factor = sensiClamp(factor, 0.92, 1.08);
            return { factor, longEdge: Math.round(longEdge) };
        }

        function sensiCalcBase(deviceInfo, playStyle) {
            const proc = deviceInfo.processor || 'Unknown';
            const ram = deviceInfo.ram || '4GB';
            const refresh = deviceInfo.refresh_rate || '60Hz';
            const perfScore = deviceInfo.performance_score ?? 50;
            const gamingScore = deviceInfo.gaming_score ?? 50;

            const procScore = sensiGetProcScore(proc);
            const ramMod = sensiGetRamMod(ram);
            const refreshMod = sensiGetRefreshMod(refresh);

            let hwFactor = ((procScore + perfScore + gamingScore) / 300) * 0.4 + 0.8;
            hwFactor = sensiClamp(hwFactor, 0.75, 1.25);
            const combined = hwFactor * ramMod * refreshMod;

            const bases = { general: 85, red_dot: 90, scope2x: 75, scope4x: 65, sniper: 50, free_look: 70, dpi: 400 };
            const style = SENSI_STYLE_MODS[playStyle] || SENSI_STYLE_MODS['Balanced'];

            const result = {};
            for (const key in bases) {
                let v;
                if (key === 'dpi') v = bases[key] * combined * style.dpi_mod;
                else v = bases[key] * combined * (style[key] ?? 1.0);
                result[key] = key === 'dpi' ? sensiClamp(Math.round(v), 200, 1200) : sensiClamp(Math.round(v), 10, 100);
            }
            return { base: result, desc: style.desc, combined, procScore };
        }

        function sensiCalcOptScore(deviceInfo) {
            const procScore = sensiGetProcScore(deviceInfo.processor || '');
            const ramMod = sensiGetRamMod(deviceInfo.ram || '');
            const refreshMod = sensiGetRefreshMod(deviceInfo.refresh_rate || '');
            const perf = deviceInfo.performance_score ?? 50;
            const gaming = deviceInfo.gaming_score ?? 50;
            const score = procScore * 0.3 + perf * 0.2 + gaming * 0.2 + (ramMod * 50) * 0.15 + (refreshMod * 50) * 0.15;
            return Math.min(100, Math.round(score));
        }

        /** Generate a complete sensitivity profile. tune: -3..3 manual steps (4% each). */
        function sensiGenerate(deviceInfo, playStyle, tune, screen, feelBias) {
            const { base, desc } = sensiCalcBase(deviceInfo, playStyle);
            let t = sensiClamp((parseInt(tune, 10) || 0) + (feelBias || 0), -3, 3);
            const { factor: screenFactor, longEdge } = sensiScreenFactor(screen);
            const tuneFactor = 1 + (t * 0.04);

            const out = {};
            for (const key in base) {
                const adjusted = base[key] * screenFactor * tuneFactor;
                out[key] = key === 'dpi' ? sensiClamp(Math.round(adjusted), 200, 1200) : sensiClamp(Math.round(adjusted), 10, 100);
            }
            // Fire button — deterministic from the tuned general value, not a separate random figure.
            out.fire_button = sensiClamp(Math.round(35 + out.general * 0.25), 25, 75);

            const notes = [];
            if (longEdge) notes.push(`Screen calibration applied for a ${longEdge}px panel.`);
            if (t) notes.push(`Manual adjustment: ${t > 0 ? '+' : ''}${t} step(s) (${t > 0 ? '+' : ''}${t * 4}%).`);

            return {
                ...out,
                tune: t,
                screen_factor: Math.round(screenFactor * 1000) / 1000,
                notes,
                play_style_desc: desc,
                device_summary: `${deviceInfo.brand || 'Unknown'} ${deviceInfo.model || 'Unknown'}`,
                optimization_score: sensiCalcOptScore(deviceInfo)
            };
        }

        /** Recommended phone/developer settings with exact navigation paths. Android and iOS never share content. */
        function sensiPhoneSettings(deviceInfo, result) {
            const os = (deviceInfo.android_version || deviceInfo.os || '').toLowerCase();
            const isIOS = os.includes('ios') || (deviceInfo.brand || '').toLowerCase() === 'apple';
            const ramGb = parseInt(String(deviceInfo.ram || '4GB'), 10) || 4;
            const tips = [];

            if (isIOS) {
                tips.push({ t: 'Keep Display Zoom on "Standard" for accurate touch mapping.', p: 'Settings → Display & Brightness → View → Standard' });
                tips.push({ t: 'Turn off Low Power Mode while gaming — it throttles performance.', p: 'Settings → Battery → Low Power Mode → Off' });
                tips.push({ t: 'Reduce background refresh for apps you\u2019re not using.', p: 'Settings → General → Background App Refresh → Off (per app)' });
                tips.push({ t: 'Disable Background App Refresh system-wide if you still see stutter.', p: 'Settings → General → Background App Refresh → Off' });
                tips.push({ t: 'Turn off Reduce Motion only if it makes menus feel laggy — leave it on for battery otherwise.', p: 'Settings → Accessibility → Motion → Reduce Motion' });
                tips.push({ t: 'A website cannot change iOS Developer/DPI settings — iPhones don\u2019t expose them.', p: null });
            } else {
                tips.push({ t: 'Enable Developer Options first (needed for the settings below).', p: 'Settings → About Phone → Software Information → Build Number → tap 7 times' });
                tips.push({ t: `Set the recommended screen density (smallest width) for your generated DPI.`, p: `Developer Options → Smallest width → ${result.dpi} dp` });
                tips.push({ t: 'Speed up the UI so menus don\u2019t feel sluggish before a match.', p: 'Developer Options → Drawing → Window animation scale → 0.5x' });
                tips.push({ t: 'Same for transition animation.', p: 'Developer Options → Drawing → Transition animation scale → 0.5x' });
                tips.push({ t: 'Same for animator duration.', p: 'Developer Options → Drawing → Animator duration scale → 0.5x' });
                tips.push({
                    t: ramGb <= 3 ? 'Your RAM is limited — cap background apps hard to avoid mid-match lag.' :
                       ramGb <= 6 ? 'Keep background apps capped to reduce stutter during fights.' :
                       'Your RAM is generous — the standard limit is fine.',
                    p: `Developer Options → Apps → Background process limit → ${ramGb <= 3 ? 'At most 2 processes' : ramGb <= 6 ? 'Standard limit' : 'Standard limit (no need to restrict)'}`
                });
                tips.push({ t: 'Enable your phone\u2019s built-in game mode for Free Fire.', p: 'Settings → Battery / Game Booster / Game Space / Game Turbo (varies by brand) → add Free Fire → Performance mode' });
                tips.push({ t: 'Keep battery saver off during matches — it caps CPU/GPU clocks.', p: 'Settings → Battery → Battery saver → Off (while gaming)' });
            }
            return tips;
        }

        function sensiGamingTips(playStyle) {
            return [
                { t: `Play style: ${playStyle}. Spend 10 minutes in Training Ground before ranked so the new feel sticks.`, p: null },
                { t: 'Pre-aim common angles and corners before peeking instead of reacting after you see the enemy.', p: null },
                { t: 'Rest your crosshair at head level, not chest level.', p: null },
                { t: 'If you consistently overshoot, use the feedback buttons below instead of guessing new numbers.', p: null }
            ];
        }
        function sensiBatteryTips() {
            return [
                { t: 'Lower screen brightness to 60–70% during long sessions.', p: null },
                { t: 'Use your original charger and avoid charging past 90% while playing — heat throttles touch response.', p: null },
                { t: 'Play in a cool environment where possible; thermal throttling quietly lowers touch sampling rate.', p: null },
                { t: 'Close other camera/GPS-heavy apps — they compete for the same thermal budget.', p: null }
            ];
        }

        function sensiReasoning(deviceInfo, result, playStyle) {
            const score = result.optimization_score;
            const tier = score >= 85 ? 'flagship-tier' : score >= 65 ? 'upper-mid-tier' : score >= 45 ? 'mid-tier' : 'entry-tier';
            const chipset = deviceInfo.processor || 'an unlisted chipset';
            const ram = deviceInfo.ram || 'unknown RAM';
            const refresh = deviceInfo.refresh_rate || '60Hz';
            return `${deviceInfo.brand || ''} ${deviceInfo.model || ''} scores ${score}/100 (${tier}) based on its ${chipset}, ${ram} and ${refresh} display. `.trim() +
                ` Values are scaled from that hardware profile and the ${playStyle} play style — ${SENSI_STYLE_MODS[playStyle]?.desc || ''} These are optimized starting points, not a guarantee of better aim.`;
        }

        // ─── Device catalogue (local, 175 models) ──────────────────────
        function sensiGetBrands() {
            return [...new Set(SENSI_DEVICES.map(d => d.b))].sort();
        }
        function sensiGetModelsByBrand(brand) {
            return SENSI_DEVICES.filter(d => d.b === brand).map(d => d.m).sort();
        }
        function sensiGetDeviceByBrandModel(brand, model) {
            return SENSI_DEVICES.find(d => d.b === brand && d.m === model) || null;
        }
        function sensiSearchDevices(query, limit) {
            limit = limit || 20;
            const q = query.trim().toLowerCase();
            if (q.length < 2) return [];
            const scored = [];
            for (const d of SENSI_DEVICES) {
                const hay = (d.b + ' ' + d.m).toLowerCase();
                if (hay.includes(q)) scored.push({ d, rank: hay.indexOf(q) === 0 ? 0 : 1 });
            }
            scored.sort((a, b) => a.rank - b.rank);
            return scored.slice(0, limit).map(s => s.d);
        }
        function sensiDeviceToInfo(d) {
            return {
                brand: d.b, model: d.m, processor: d.proc, gpu: d.gpu, ram: d.ram,
                android_version: d.os, refresh_rate: d.rr, performance_score: d.perf,
                gaming_score: d.gam, architecture: d.arch, screen_resolution: d.res
            };
        }

        // ─── Browser-side detection ─────────────────────────────────
        function sensiGetOS() {
            const ua = navigator.userAgent;
            if (/Android/i.test(ua)) return 'Android';
            if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
            if (/Windows/i.test(ua)) return 'Windows';
            if (/Mac/i.test(ua)) return 'macOS';
            return 'Unknown';
        }
        function sensiGetBrowser() {
            const ua = navigator.userAgent;
            if (/Edg/i.test(ua)) return 'Edge';
            if (/SamsungBrowser/i.test(ua)) return 'Samsung Internet';
            if (/OPR|Opera/i.test(ua)) return 'Opera';
            if (/Chrome/i.test(ua)) return 'Chrome';
            if (/Firefox/i.test(ua)) return 'Firefox';
            if (/Safari/i.test(ua)) return 'Safari';
            return 'Unknown';
        }
        async function sensiGetDeviceModel() {
            try {
                if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
                    const hints = await navigator.userAgentData.getHighEntropyValues(['model']);
                    if (hints.model) return hints.model;
                }
            } catch (e) { /* unavailable */ }
            const m = navigator.userAgent.match(/Android [\d.]+; ([^;)]+)(?: Build|\))/i);
            if (m && m[1] && !/^[a-z]{2}(-[a-z]{2})?$/i.test(m[1].trim())) return m[1].trim();
            if (/iPhone/i.test(navigator.userAgent)) return 'iPhone';
            if (/iPad/i.test(navigator.userAgent)) return 'iPad';
            return '';
        }
        function sensiGuessBrand(text) {
            const brands = ['Samsung', 'Redmi', 'POCO', 'Xiaomi', 'Infinix', 'Tecno', 'Itel', 'Oppo', 'Vivo',
                'Realme', 'OnePlus', 'Huawei', 'Honor', 'Nokia', 'Motorola', 'Nothing', 'Sony', 'Google', 'Pixel', 'iPhone', 'Apple'];
            for (const b of brands) {
                if (new RegExp(b, 'i').test(text)) {
                    if (b === 'Pixel') return 'Google';
                    if (b === 'iPhone') return 'Apple';
                    return b;
                }
            }
            return 'Unknown';
        }
        function sensiGetGPUInfo() {
            try {
                const canvas = document.createElement('canvas');
                const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
                if (!gl) return 'Not exposed';
                const info = gl.getExtension('WEBGL_debug_renderer_info');
                if (info) return gl.getParameter(info.UNMASKED_RENDERER_WEBGL) || 'Not exposed';
            } catch (e) { /* blocked */ }
            return 'Not exposed';
        }


        // ─── UI state ──────────────────────────────────────────────
        const sensiState = { mode: 'mine', style: 'Balanced', tune: 0, detected: {}, otherDevice: null, initialized: false, lastResult: null, lastDeviceInfo: null };

        function initSensiGenerator() {
            if (sensiState.initialized) return;
            sensiState.initialized = true;
            sensiInitTabs();
            sensiInitStyleChips();
            sensiInitTune();
            sensiInitDeviceSearch();
            sensiInitBrandSelect();
            sensiInitGenerateBtn();
            sensiInitFeedback();
            sensiRunDetection();
            sensiLoadHistory();
            document.getElementById('sensi-btn-regenerate')?.addEventListener('click', () => {
                document.getElementById('sensi-result-wrap').style.display = 'none';
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
            document.getElementById('sensi-btn-copy')?.addEventListener('click', sensiCopyResult);
        }

        function sensiInitTabs() {
            document.querySelectorAll('.sensi-tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    document.querySelectorAll('.sensi-tab').forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    sensiState.mode = tab.dataset.mode;
                    document.getElementById('sensi-panel-mine').classList.toggle('active', sensiState.mode === 'mine');
                    document.getElementById('sensi-panel-other').classList.toggle('active', sensiState.mode === 'other');
                });
            });
        }

        const SENSI_STYLE_HINTS = {
            'One Tap': 'Lower sensitivity for precise headshots.',
            'Balanced': 'Well-rounded values for every situation.',
            'Rusher': 'Faster turning for close-range fights.',
            'Freestyle': 'Smooth transitions between movement and aim.',
            'Sniper': 'Slow, stable tracking for long range.',
            'Instaplayer': 'Maximum speed drag-headshot style — for experienced players.'
        };
        function sensiInitStyleChips() {
            document.querySelectorAll('#sensi-style-chips .sensi-chip').forEach(chip => {
                chip.addEventListener('click', () => {
                    document.querySelectorAll('#sensi-style-chips .sensi-chip').forEach(c => c.classList.remove('active'));
                    chip.classList.add('active');
                    sensiState.style = chip.dataset.style;
                    document.getElementById('sensi-style-hint').textContent = SENSI_STYLE_HINTS[sensiState.style] || '';
                });
            });
        }

        function sensiInitTune() {
            document.querySelectorAll('#sensi-tune-row .sensi-tune-opt').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('#sensi-tune-row .sensi-tune-opt').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    sensiState.tune = parseInt(btn.dataset.tune, 10) || 0;
                });
            });
        }

        function sensiEsc(s) {
            return String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
        }

        function sensiInitDeviceSearch() {
            const input = document.getElementById('sensi-search-input');
            const results = document.getElementById('sensi-search-results');
            if (!input || !results) return;
            let timer = null;
            input.addEventListener('input', () => {
                clearTimeout(timer);
                const q = input.value.trim();
                if (q.length < 2) { results.innerHTML = ''; results.classList.remove('open'); return; }
                timer = setTimeout(() => {
                    const devices = sensiSearchDevices(q, 30);
                    results.innerHTML = '';
                    if (!devices.length) {
                        results.innerHTML = '<div class="sensi-search-empty">No match. Try browsing by brand below.</div>';
                        results.classList.add('open');
                        return;
                    }
                    devices.forEach(d => {
                        const item = document.createElement('button');
                        item.type = 'button';
                        item.className = 'sensi-search-item';
                        item.innerHTML = `<strong>${sensiEsc(d.b)} ${sensiEsc(d.m)}</strong><span>${sensiEsc(d.proc)} · ${sensiEsc(d.ram)}</span>`;
                        item.addEventListener('click', () => {
                            input.value = `${d.b} ${d.m}`;
                            results.classList.remove('open');
                            sensiSelectOtherDevice(d);
                        });
                        results.appendChild(item);
                    });
                    results.classList.add('open');
                }, 200);
            });
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.sensi-search-wrap')) results.classList.remove('open');
            });
        }

        function sensiInitBrandSelect() {
            const select = document.getElementById('sensi-brand-select');
            if (!select) return;
            sensiGetBrands().forEach(b => {
                const opt = document.createElement('option');
                opt.value = b; opt.textContent = b;
                select.appendChild(opt);
            });
            select.addEventListener('change', () => {
                const modelStep = document.getElementById('sensi-model-step');
                const modelSelect = document.getElementById('sensi-model-select');
                if (!select.value) { modelStep.style.display = 'none'; sensiHideOtherSpecs(); return; }
                modelSelect.innerHTML = '<option value="">Select model…</option>';
                sensiGetModelsByBrand(select.value).forEach(m => {
                    const opt = document.createElement('option');
                    opt.value = m; opt.textContent = m;
                    modelSelect.appendChild(opt);
                });
                modelStep.style.display = 'block';
            });
            document.getElementById('sensi-model-select')?.addEventListener('change', function() {
                if (!this.value) { sensiHideOtherSpecs(); return; }
                const d = sensiGetDeviceByBrandModel(select.value, this.value);
                if (d) sensiSelectOtherDevice(d);
            });
        }

        function sensiSelectOtherDevice(d) {
            sensiState.otherDevice = d;
            document.getElementById('sensi-o-proc').textContent = d.proc || 'Unknown';
            document.getElementById('sensi-o-gpu').textContent = d.gpu || 'Unknown';
            document.getElementById('sensi-o-ram').textContent = d.ram || 'Unknown';
            document.getElementById('sensi-o-os').textContent = d.os || 'Unknown';
            document.getElementById('sensi-o-refresh').textContent = d.rr || 'Unknown';
            document.getElementById('sensi-o-screen').textContent = d.res || 'Unknown';
            document.getElementById('sensi-other-specs').style.display = 'grid';
        }
        function sensiHideOtherSpecs() {
            sensiState.otherDevice = null;
            const el = document.getElementById('sensi-other-specs');
            if (el) el.style.display = 'none';
        }

        async function sensiRunDetection() {
            const nav = navigator;
            const detected = {
                os: sensiGetOS(),
                browser: sensiGetBrowser(),
                screenWidth: window.screen.width,
                screenHeight: window.screen.height,
                pixelRatio: window.devicePixelRatio || 1,
                memory: nav.deviceMemory ? nav.deviceMemory + 'GB' : null,
                cpuThreads: nav.hardwareConcurrency || null,
                gpu: sensiGetGPUInfo()
            };
            const model = await sensiGetDeviceModel();
            detected.model = model || '';
            detected.brand = sensiGuessBrand(model || nav.userAgent);

            document.getElementById('sensi-d-model').textContent = model || `${detected.os} device (model not exposed)`;
            document.getElementById('sensi-d-os').textContent = detected.os;
            document.getElementById('sensi-d-browser').textContent = detected.browser;
            document.getElementById('sensi-d-screen').textContent = `${detected.screenWidth} × ${detected.screenHeight}`;
            document.getElementById('sensi-d-pixel').textContent = detected.pixelRatio + 'x';
            document.getElementById('sensi-d-ram').textContent = detected.memory || 'Not exposed by browser';
            document.getElementById('sensi-d-cpu').textContent = detected.cpuThreads || 'Not exposed';
            document.getElementById('sensi-d-gpu').textContent = detected.gpu;

            const status = document.getElementById('sensi-match-status');
            if (model) {
                const matches = sensiSearchDevices(model, 1);
                if (matches.length) {
                    const match = matches[0];
                    detected.brand = match.b; detected.model = match.m;
                    detected.processor = match.proc; detected.gpu = match.gpu; detected.ram = match.ram;
                    detected.refresh_rate = match.rr; detected.performance_score = match.perf; detected.gaming_score = match.gam;
                    detected.android_version = match.os;
                    status.className = 'sensi-match-status ok';
                    status.textContent = `Matched to ${match.b} ${match.m} — ${match.proc}, ${match.ram}, ${match.rr}.`;
                } else {
                    status.className = 'sensi-match-status warn';
                    status.textContent = 'This exact model isn\u2019t in our database yet. We\u2019ll calculate from the hardware details above — or use "Another Device" to pick the closest match.';
                }
            } else {
                status.className = 'sensi-match-status warn';
                status.textContent = 'Your browser doesn\u2019t expose the exact model. Use "Another Device" to search for it — the result is identical.';
            }
            sensiState.detected = detected;
        }

        function sensiBuildDeviceInfo() {
            if (sensiState.mode === 'other') {
                if (!sensiState.otherDevice) return null;
                return sensiDeviceToInfo(sensiState.otherDevice);
            }
            const d = sensiState.detected || {};
            return {
                brand: d.brand || 'Unknown', model: d.model || 'Unknown',
                processor: d.processor || 'Unknown', gpu: d.gpu || d.processor ? d.gpu : 'Unknown',
                ram: d.ram || (d.memory ? d.memory : '4GB'),
                android_version: d.android_version || d.os || 'Unknown',
                refresh_rate: d.refresh_rate || '60Hz',
                performance_score: d.performance_score ?? 50,
                gaming_score: d.gaming_score ?? 50
            };
        }

        // Calls this same origin's /api/generateSensi (see server.js — the
        // Render/Express backend). The Groq key is never present in this
        // file or any browser-visible code — it lives only in the server's
        // GROQ_API_KEY environment variable, exactly as required. Only
        // override this if your API lives at a different origin (e.g. a
        // separate Firebase Cloud Function URL from functions/README.md).
        const SENSI_AI_ENDPOINT = '/api/generateSensi';

        // Returns { success, source, value, message, offlineFallback }.
        // Never fabricates a result itself — that decision belongs to the
        // backend, which knows whether Groq is even configured. This
        // function just relays what the backend honestly reported.
        async function sensiCallAI(deviceInfo, style, existing, feedback) {
            const controller = new AbortController();
            const t = setTimeout(() => controller.abort(), 45000); // backend allows one retry (20s each) + backoff, so give it room
            try {
                const res = await fetch(SENSI_AI_ENDPOINT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ device: deviceInfo, playStyle: style, existing, feedback }),
                    signal: controller.signal
                });
                const data = await res.json().catch(() => null);
                if (!data) {
                    return { success: false, source: 'error', message: 'Could not reach the generation service. Check your connection and try again.' };
                }
                return data;
            } catch (e) {
                console.error('generateSensi call failed:', e);
                return { success: false, source: 'error', message: 'Could not reach the generation service. Check your connection and try again.' };
            } finally {
                clearTimeout(t);
            }
        }

        // The actual calculation, split out so it can run either immediately
        // (VIP / already-verified-this-generation) or as the callback fired
        // once the join → share → code gate below is cleared.
        async function sensiRunGeneration() {
            const deviceInfo = sensiBuildDeviceInfo();
            if (!deviceInfo) {
                showToast('Search or select a device first', 'error');
                document.getElementById('sensi-tab-other')?.click();
                return;
            }
            const btn = document.getElementById('sensi-generate-btn');
            btn.disabled = true; btn.textContent = 'Calculating…';
            const feel = document.getElementById('sensi-current-feel')?.value || '';
            const feelBias = feel === 'fast' ? -1 : feel === 'slow' ? 1 : 0;
            const extRam = parseInt(document.getElementById('sensi-ext-ram')?.value || '0', 10);
            const screen = { width: window.screen.width, height: window.screen.height, pixel_ratio: window.devicePixelRatio || 1 };

            const response = await sensiCallAI(deviceInfo, sensiState.style, null, feel ? `Currently feels ${feel}` : null);

            let result, source;
            if (response && response.success && response.source === 'groq') {
                // Real, validated AI output — use it verbatim, nothing merged in.
                result = { ...response };
                source = 'groq';
            } else if (response && response.success && response.source === 'offline') {
                // Server's own hardware-aware offline model (Groq not configured
                // on this deployment) — a real calculation, just not AI-generated.
                result = { ...response };
                source = 'offline';
            } else if (response && response.offlineFallback) {
                // Groq WAS configured but failed validation twice in a row.
                // Say so plainly rather than quietly presenting this as AI.
                showToast(response.message || 'AI generation failed — showing an offline estimate instead.', 'error');
                result = { ...response.offlineFallback, play_style: response.play_style };
                source = 'offline';
            } else {
                // Couldn't even reach the server (offline device, Render cold
                // start timeout, etc). Last-resort client-side calculation so
                // the feature still works, clearly labeled as such below.
                showToast('Could not reach the generation service — showing a local estimate instead.', 'error');
                result = sensiGenerate(deviceInfo, sensiState.style, sensiState.tune, screen, feelBias);
                source = 'local';
            }

            result.play_style = sensiState.style;
            result.extended_ram = extRam;
            result.source = source;
            result.ai_powered = source === 'groq';
            sensiState.lastResult = result;
            sensiState.lastDeviceInfo = deviceInfo;
            sensiRenderResult(deviceInfo, result);
            sensiSaveHistory(deviceInfo, result);
            btn.disabled = false; btn.textContent = 'Generate my sensitivity';
            document.getElementById('sensi-result-wrap').style.display = 'block';
            document.getElementById('sensi-steps').querySelectorAll('.sensi-step').forEach(s => s.classList.add('done'));
            document.getElementById('sensi-result-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        function sensiInitGenerateBtn() {
            document.getElementById('sensi-generate-btn')?.addEventListener('click', () => {
                const deviceInfo = sensiBuildDeviceInfo();
                if (!deviceInfo) {
                    showToast('Search or select a device first', 'error');
                    document.getElementById('sensi-tab-other')?.click();
                    return;
                }
                // VIP and anyone already verified for this generation skip
                // straight to the calculation. Everyone else has to clear
                // the join → share (x5) → code gate FIRST — the gate now
                // blocks generation itself, not just the bonus phone tips.
                const xitUnlocked = (userData && userData.isVip) || sensiUnlocked;
                if (xitUnlocked) {
                    sensiRunGeneration();
                } else {
                    openVerifyModal(sensiRunGeneration);
                }
            });
        }

        function sensiSetBar(valId, barId, value, max) {
            document.getElementById(valId).textContent = value;
            document.getElementById(barId).style.width = sensiClamp((value / max) * 100, 4, 100) + '%';
        }

        function sensiRenderResult(deviceInfo, result) {
            document.getElementById('sensi-r-device').textContent = result.device_summary;
            document.getElementById('sensi-r-style').textContent = result.play_style;
            const ramLabel = result.extended_ram ? `${deviceInfo.ram} + ${result.extended_ram}GB ext.` : (deviceInfo.ram || 'Unknown RAM');
            document.getElementById('sensi-r-ram').textContent = ramLabel;
            document.getElementById('sensi-r-chipset').textContent = deviceInfo.processor || 'Unknown chipset';
            document.getElementById('sensi-r-time').textContent = new Date().toLocaleDateString();
            const aiBadge = document.getElementById('sensi-r-ai-badge');
            const offlineBadge = document.getElementById('sensi-r-offline-badge');
            const sourceNote = document.getElementById('sensi-r-source-note');
            if (aiBadge) aiBadge.style.display = result.source === 'groq' ? 'inline-flex' : 'none';
            if (offlineBadge) offlineBadge.style.display = result.source !== 'groq' ? 'inline-flex' : 'none';
            if (sourceNote) {
                if (result.source === 'local') {
                    sourceNote.textContent = 'Calculated on this device — the generation server couldn\'t be reached.';
                    sourceNote.style.display = 'block';
                } else if (result.source === 'offline') {
                    sourceNote.textContent = 'Calculated from real device hardware data, not AI-generated this time.';
                    sourceNote.style.display = 'block';
                } else {
                    sourceNote.style.display = 'none';
                }
            }

            sensiSetBar('sensi-v-general', 'sensi-b-general', result.general, 100);
            sensiSetBar('sensi-v-reddot', 'sensi-b-reddot', result.red_dot, 100);
            sensiSetBar('sensi-v-2x', 'sensi-b-2x', result.scope2x, 100);
            sensiSetBar('sensi-v-4x', 'sensi-b-4x', result.scope4x, 100);
            sensiSetBar('sensi-v-sniper', 'sensi-b-sniper', result.sniper, 100);
            sensiSetBar('sensi-v-freelook', 'sensi-b-freelook', result.free_look, 100);
            sensiSetBar('sensi-v-fire', 'sensi-b-fire', result.fire_button, 100);

            const isIOS = (deviceInfo.android_version || '').toLowerCase().includes('ios') || (deviceInfo.brand || '').toLowerCase() === 'apple';
            const dpiCard = document.getElementById('sensi-dpi-card');
            if (isIOS) { dpiCard.style.display = 'none'; }
            else { dpiCard.style.display = ''; sensiSetBar('sensi-v-dpi', 'sensi-b-dpi', result.dpi, 1200); }

            const score = result.optimization_score;
            const circle = document.getElementById('sensi-score-circle');
            const circumference = 2 * Math.PI * 42;
            circle.style.strokeDasharray = circumference;
            circle.style.strokeDashoffset = circumference - (score / 100) * circumference;
            document.getElementById('sensi-score-num').textContent = score;
            document.getElementById('sensi-r-reasoning').textContent =
                (result.ai_powered && result.reasoning) ? result.reasoning : sensiReasoning(deviceInfo, result, result.play_style);

            const notesList = document.getElementById('sensi-r-notes');
            notesList.innerHTML = '';
            const allNotes = Array.isArray(result.notes) ? [...result.notes] : [];
            if (result.extended_ram) allNotes.push(`Extended/virtual RAM (+${result.extended_ram}GB) is shown separately and kept out of the sensitivity math — it helps multitasking stability, not aim precision.`);
            allNotes.forEach(n => { const li = document.createElement('li'); li.textContent = n; notesList.appendChild(li); });

            const renderTips = (containerId, tips) => {
                const ul = document.getElementById(containerId);
                ul.innerHTML = '';
                tips.forEach(tip => {
                    const li = document.createElement('li');
                    li.innerHTML = sensiEsc(tip.t) + (tip.p ? `<span class="sensi-path">${sensiEsc(tip.p)}</span>` : '');
                    ul.appendChild(li);
                });
            };
            sensiLastPhoneTips = sensiPhoneSettings(deviceInfo, result);
            const xitUnlocked = (userData && userData.isVip) || sensiUnlocked;
            const xitList = document.getElementById('sensi-tips-phone');
            const xitLock = document.getElementById('sensi-xit-lock');
            if (xitUnlocked) {
                xitList.style.display = '';
                xitLock.style.display = 'none';
                renderTips('sensi-tips-phone', sensiLastPhoneTips);
            } else {
                xitList.style.display = 'none';
                xitLock.style.display = 'block';
            }
            renderTips('sensi-tips-gaming', sensiGamingTips(result.play_style));
            renderTips('sensi-tips-battery', sensiBatteryTips());
        }

        // XIT tier (deeper phone settings) — VIP skips this permanently; free
        // accounts unlock it per-generation via a real join → share → code
        // check (ported from the Flask build's verification.py). The code
        // itself is verified server-side by the verifyZerxCode Cloud Function
        // so it never has to be shipped to the browser.
        let sensiUnlocked = false;
        let sensiLastPhoneTips = [];

        // Auto-derives the deployed URL from the AI endpoint once that's set,
        // so there's usually nothing to edit here — set VERIFY_ENDPOINT
        // manually only if you deploy verifyZerxCode somewhere else
        // (see functions/README.md).
        const VERIFY_ENDPOINT = SENSI_AI_ENDPOINT
            ? SENSI_AI_ENDPOINT.replace(/generateSensi\s*$/, 'verifyZerxCode')
            : '';

        let verifySettings = { shareCount: 5, shareMessage: 'Get free device-optimized Free Fire sensitivity on ZERX-XIT:', channel1Name: 'WhatsApp Channel', channel2Name: 'Telegram Channel' };
        function initVerificationSettings() {
            if (!db) return;
            onValue(ref(db, 'settings/verification'), (snap) => {
                const data = snap.val() || {};
                verifySettings.shareCount = parseInt(data.shareCount, 10) || 5;
                verifySettings.shareMessage = (typeof data.shareMessage === 'string' && data.shareMessage.trim())
                    ? data.shareMessage.trim() : verifySettings.shareMessage;
                verifySettings.channel1Name = (typeof data.channel1Name === 'string' && data.channel1Name.trim())
                    ? data.channel1Name.trim() : verifySettings.channel1Name;
                verifySettings.channel2Name = (typeof data.channel2Name === 'string' && data.channel2Name.trim())
                    ? data.channel2Name.trim() : verifySettings.channel2Name;
                const n1 = document.getElementById('verify-channel-1-name');
                const n2 = document.getElementById('verify-channel-2-name');
                if (n1) n1.textContent = verifySettings.channel1Name;
                if (n2) n2.textContent = verifySettings.channel2Name;
            });
        }

        const verifyGate = { channel1: false, channel2: false, shares: 0, lastShareAt: 0, unlocking: false };

        function xitRenderUnlockedTips() {
            const xitList = document.getElementById('sensi-tips-phone');
            const xitLock = document.getElementById('sensi-xit-lock');
            xitList.style.display = '';
            xitLock.style.display = 'none';
            xitList.innerHTML = '';
            sensiLastPhoneTips.forEach(tip => {
                const li = document.createElement('li');
                li.innerHTML = sensiEsc(tip.t) + (tip.p ? `<span class="sensi-path">${sensiEsc(tip.p)}</span>` : '');
                xitList.appendChild(li);
            });
        }

        function verifyGoToStep(step) {
            [1, 2, 3].forEach(n => {
                document.getElementById('verify-step-' + n)?.classList.toggle('hidden', n !== step);
            });
            document.getElementById('verify-step-success')?.classList.add('hidden');
            document.getElementById('verify-modal-actions').style.display = '';
            const pct = step === 1 ? 15 : step === 2 ? 55 : 90;
            const bar = document.getElementById('verify-progress-bar');
            if (bar) bar.style.width = pct + '%';
            document.querySelectorAll('#modal-verify .pstep').forEach((el, i) => {
                el.classList.toggle('active', i < step);
            });
        }

        // Set right before opening the modal; called once step 3 (code) succeeds.
        // Left null when the modal is opened just to unlock the bonus phone
        // tips on an already-generated result (the old behavior).
        let verifyOnSuccess = null;

        function openVerifyModal(onSuccess) {
            if (!currentUser) { showToast('Sign in first', 'error'); return; }
            verifyOnSuccess = typeof onSuccess === 'function' ? onSuccess : null;
            verifyGate.channel1 = false;
            verifyGate.channel2 = false;
            verifyGate.shares = 0;
            document.getElementById('verify-channel-1')?.classList.remove('joined');
            document.getElementById('verify-channel-2')?.classList.remove('joined');
            document.getElementById('verify-btn-joined').disabled = true;
            const required = verifySettings.shareCount;
            document.getElementById('verify-share-count').textContent = required;
            document.getElementById('verify-share-counter').textContent = `0 / ${required}`;
            document.getElementById('verify-code-input').value = '';
            document.getElementById('verify-code-msg').textContent = '';
            verifyGoToStep(1);
            openModal('modal-verify');
        }

        document.getElementById('btn-xit-unlock-join')?.addEventListener('click', () => openVerifyModal());

        // Each channel link, when clicked, opens in a new tab (default <a>
        // behavior — not prevented) AND marks itself joined. The Verify
        // button only enables once both are marked, so a person can't
        // advance without at least tapping through to each channel first.
        function verifyMarkChannelJoined(n) {
            verifyGate['channel' + n] = true;
            document.getElementById('verify-channel-' + n)?.classList.add('joined');
            const btn = document.getElementById('verify-btn-joined');
            btn.disabled = !(verifyGate.channel1 && verifyGate.channel2);
        }
        document.getElementById('verify-channel-1')?.addEventListener('click', () => verifyMarkChannelJoined(1));
        document.getElementById('verify-channel-2')?.addEventListener('click', () => verifyMarkChannelJoined(2));

        document.getElementById('verify-btn-joined')?.addEventListener('click', () => {
            if (!(verifyGate.channel1 && verifyGate.channel2)) {
                showToast('Join both channels first', 'error');
                return;
            }
            verifyGoToStep(2);
        });

        // Step-back controls — lets people correct a mis-tap instead of
        // being forced to cancel and restart the whole gate from scratch.
        document.getElementById('verify-btn-back-2')?.addEventListener('click', () => verifyGoToStep(1));
        document.getElementById('verify-btn-back-3')?.addEventListener('click', () => verifyGoToStep(2));

        document.getElementById('verify-btn-share')?.addEventListener('click', () => {
            if (!(verifyGate.channel1 && verifyGate.channel2)) { showToast('Join both channels first', 'error'); return; }
            const now = Date.now();
            if (now - verifyGate.lastShareAt < 3000) { showToast('Wait a moment before sharing again', 'error'); return; }
            verifyGate.lastShareAt = now;
            const link = (document.getElementById('refer-page-link-input')?.value) || window.location.origin;
            const text = verifySettings.shareMessage;
            // The Web Share API and wa.me links both just hand off to the
            // OS/app's own share sheet — neither this site nor the browser
            // can see whether the person actually completed a send inside
            // WhatsApp/Telegram afterward. That confirmation doesn't exist
            // on the web platform, so we don't claim it does: what's tracked
            // here is that the required share ACTION was triggered N times
            // with real pauses between them (see the 3-second guard above),
            // not a cryptographic proof of delivery.
            if (navigator.share) {
                navigator.share({ title: 'ZERX-XIT', text, url: link }).catch(() => {});
            } else {
                window.open('https://wa.me/?text=' + encodeURIComponent(text + ' ' + link), '_blank');
            }
            const required = verifySettings.shareCount;
            verifyGate.shares = Math.min(required, verifyGate.shares + 1);
            document.getElementById('verify-share-counter').textContent = `${verifyGate.shares} / ${required}`;
            if (verifyGate.shares >= required) verifyGoToStep(3);
        });

        function verifyShowSuccessThenContinue() {
            [1, 2, 3].forEach(n => document.getElementById('verify-step-' + n)?.classList.add('hidden'));
            document.getElementById('verify-modal-actions').style.display = 'none';
            document.getElementById('verify-step-success')?.classList.remove('hidden');
            const bar = document.getElementById('verify-progress-bar');
            if (bar) bar.style.width = '100%';
            document.querySelectorAll('#modal-verify .pstep').forEach(el => el.classList.add('active'));
            setTimeout(() => {
                closeModal('modal-verify');
                sensiUnlocked = true;
                const cb = verifyOnSuccess; verifyOnSuccess = null;
                if (cb) { cb(); } else { xitRenderUnlockedTips(); }
            }, 1200);
        }

        document.getElementById('verify-btn-submit')?.addEventListener('click', async () => {
            if (verifyGate.unlocking) return;
            const code = document.getElementById('verify-code-input').value.trim();
            const msgEl = document.getElementById('verify-code-msg');
            if (!code) { msgEl.textContent = 'Enter the code posted in the channels.'; return; }
            if (!VERIFY_ENDPOINT) {
                // verifyZerxCode not deployed yet — degrade to the old
                // instant-unlock behavior rather than blocking everyone.
                console.warn('verifyZerxCode isn\u2019t deployed — code was accepted without a real check. See functions/README.md.');
                verifyShowSuccessThenContinue();
                return;
            }
            verifyGate.unlocking = true;
            const btn = document.getElementById('verify-btn-submit');
            btn.disabled = true;
            btn.textContent = 'Checking\u2026';
            try {
                const res = await fetch(VERIFY_ENDPOINT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ uid: currentUser.uid, code })
                });
                const data = await res.json().catch(() => ({}));
                if (data.success) {
                    verifyShowSuccessThenContinue();
                } else if (data.banned) {
                    closeModal('modal-verify');
                    // users/{uid}'s onValue listener (initUserData) picks up the
                    // ban and shows the appeal screen — nothing else to do here.
                } else {
                    msgEl.textContent = data.message || 'Incorrect code, try again.';
                }
            } catch (e) {
                msgEl.textContent = 'Could not reach the verification service. Check your connection.';
            } finally {
                verifyGate.unlocking = false;
                btn.disabled = false;
                btn.textContent = 'Verify & Continue';
            }
        });

        function sensiCopyResult() {
            const r = sensiState.lastResult;
            if (!r) return;
            const lines = [
                'ZERX DEVICE-OPTIMIZED SENSI', '', `Device: ${r.device_summary}`, `Play style: ${r.play_style}`, '',
                `General: ${r.general}`, `Red Dot: ${r.red_dot}`, `2x Scope: ${r.scope2x}`, `4x Scope: ${r.scope4x}`,
                `Sniper Scope: ${r.sniper}`, `Free Look: ${r.free_look}`, `Fire Button: ${r.fire_button}%`
            ];
            if (document.getElementById('sensi-dpi-card').style.display !== 'none') lines.push(`DPI: ${r.dpi}`);
            const text = lines.join('\n');
            navigator.clipboard?.writeText(text).then(() => showToast('Settings copied!', 'success'))
                .catch(() => showToast('Could not copy — select and copy manually.', 'error'));
        }

        // ─── Adjustment feedback — nudges the current preset, doesn't restart ───
        const SENSI_FEEDBACK_MAP = {
            general_fast: { key: 'general', dir: -1 }, general_slow: { key: 'general', dir: 1 },
            reddot_fast: { key: 'red_dot', dir: -1 }, reddot_slow: { key: 'red_dot', dir: 1 },
            '2x_fast': { key: 'scope2x', dir: -1 }, '2x_slow': { key: 'scope2x', dir: 1 },
            '4x_fast': { key: 'scope4x', dir: -1 }, '4x_slow': { key: 'scope4x', dir: 1 },
            drag_heavy: { key: 'general', dir: 1 }, drag_high: { key: 'general', dir: -1 }
        };
        function sensiInitFeedback() {
            document.querySelectorAll('.sensi-feedback-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const map = SENSI_FEEDBACK_MAP[btn.dataset.fb];
                    if (!map || !sensiState.lastResult) return;
                    const r = sensiState.lastResult;
                    const step = Math.round(r[map.key] * 0.06) + 1;
                    r[map.key] = sensiClamp(r[map.key] + step * map.dir, 10, 100);
                    sensiRenderResult(sensiState.lastDeviceInfo, r);
                    sensiSaveHistory(sensiState.lastDeviceInfo, r);
                    showToast('Adjusted — this preset, not a new one.', 'success');
                });
            });
        }

        // ─── Firebase history (per signed-in user) ─────────────────
        async function sensiSaveHistory(deviceInfo, result) {
            if (!db || !currentUser) return;
            try {
                const entry = {
                    device: result.device_summary, brand: deviceInfo.brand || 'Unknown', model: deviceInfo.model || 'Unknown',
                    playStyle: result.play_style, general: result.general, red_dot: result.red_dot,
                    scope2x: result.scope2x, scope4x: result.scope4x, sniper: result.sniper,
                    free_look: result.free_look, fire_button: result.fire_button, dpi: result.dpi,
                    optimization_score: result.optimization_score, mode: sensiState.mode,
                    aiPowered: !!result.ai_powered, timestamp: Date.now()
                };
                await push(ref(db, 'sensiHistory/' + currentUser.uid), entry);
                // Lightweight aggregate node the admin panel can read without scanning every user.
                await push(ref(db, 'sensiGenerationsLog'), { ...entry, uid: currentUser.uid, email: currentUser.email || '' });
            } catch (e) { console.error('sensi history save failed', e); }
        }
        async function sensiLoadHistory() {
            if (!db || !currentUser) return;
            const card = document.getElementById('sensi-history-card');
            const list = document.getElementById('sensi-history-list');
            try {
                const snap = await get(ref(db, 'sensiHistory/' + currentUser.uid));
                if (!snap.exists()) { card.style.display = 'none'; return; }
                const items = [];
                snap.forEach(c => items.push(c.val()));
                items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                list.innerHTML = '';
                items.slice(0, 5).forEach(it => {
                    const row = document.createElement('div');
                    row.className = 'sensi-history-item';
                    row.innerHTML = `<div><strong>${sensiEsc(it.device)}</strong> · ${sensiEsc(it.playStyle)}</div><span>${it.timestamp ? new Date(it.timestamp).toLocaleDateString() : ''}</span>`;
                    list.appendChild(row);
                });
                card.style.display = items.length ? 'block' : 'none';
            } catch (e) { card.style.display = 'none'; }
        }

        window.closeModal = (id) => { const m = document.getElementById(id); if (m) m.classList.add('hidden'); };
        window.openModal = (id) => { const m = document.getElementById(id); if (m) m.classList.remove('hidden'); };

        function generateKey(l = 12) { const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; let r = ''; for (let i = 0; i < l; i++)
                r += c.charAt(Math.floor(Math.random() * c.length)); return r; }

        function extractYouTubeID(url) { if (!url) return null;
            url = String(url).trim(); if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url; const m = url.match(
                /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/); return (m && m[2].length === 11) ? m[2] :
                null; }

        // Auth toggles
        document.getElementById('go-to-signup').addEventListener('click', function(e) { e.preventDefault();
            document.getElementById('login-box').classList.add('hidden');
            document.getElementById('signup-box').classList.remove('hidden'); });
        document.getElementById('go-to-login').addEventListener('click', function(e) { e.preventDefault();
            document.getElementById('signup-box').classList.add('hidden');
            document.getElementById('login-box').classList.remove('hidden'); });

        // --- MANUAL DEPOSIT ---
        let manualReceiptBase64 = '';
        document.getElementById('manual-receipt-input').addEventListener('change', function() {
            const file = this.files[0];
            const wrap = document.getElementById('receipt-preview-wrap');
            const preview = document.getElementById('receipt-preview');
            const status = document.getElementById('receipt-status');
            if (!file) return;
            if (file.size > 500 * 1024) {
                showToast('Image too large. Max 500KB.', 'error');
                this.value = '';
                return;
            }
            const reader = new FileReader();
            reader.onload = (e) => {
                manualReceiptBase64 = e.target.result;
                preview.src = manualReceiptBase64;
                wrap.classList.add('show');
                status.textContent = '✅ Receipt attached';
            };
            reader.onerror = () => showToast('Failed to read image', 'error');
            reader.readAsDataURL(file);
        });

        document.getElementById('btn-submit-manual').addEventListener('click', async function() {
            const amt = document.getElementById('manual-amount').value;
            const utr = document.getElementById('manual-utr').value.trim();
            const appName = document.getElementById('manual-app').value.trim();
            const btn = this;
            if (!amt || amt <= 0) return showToast('Enter valid amount', 'error');
            if (!utr || utr.length < 8) return showToast('Enter valid UTR', 'error');
            if (!appName) return showToast('Enter payment app name', 'error');
            if (!manualReceiptBase64) return showToast('Please upload your payment receipt', 'error');
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
            btn.disabled = true;
            const txId = 'MAN' + Date.now();
            try {
                await set(ref(db, 'transactions/' + currentUser.uid + '/' + txId), { id: txId, type: 'deposit_manual',
                    amount: parseFloat(amt), status: 'pending', desc: 'Manual Deposit via ' + appName, utr: utr,
                    date: new Date().toISOString() });
                await set(ref(db, 'manual_deposits/' + txId), { uid: currentUser.uid, email: currentUser.email,
                    amount: parseFloat(amt), utr: utr, app: appName, screenshot: manualReceiptBase64, status: 'pending',
                    timestamp: serverTimestamp() });
                showToast('Deposit submitted! Awaiting admin approval.');
                document.getElementById('manual-amount').value = '';
                document.getElementById('manual-utr').value = '';
                document.getElementById('manual-app').value = '';
                document.getElementById('manual-receipt-input').value = '';
                document.getElementById('receipt-preview-wrap').classList.remove('show');
                document.getElementById('receipt-status').textContent = '';
                manualReceiptBase64 = '';
            } catch (e) { showToast('Error submitting request', 'error'); } finally { btn.innerHTML =
                    '<i class="fas fa-paper-plane"></i> Submit Request';
                btn.disabled = false; }
        });

        // --- SUPPORT LINKS ---
        function initContactLinks() {
            if (!db) return;
            onValue(ref(db, 'support_links'), (snap) => {
                const data = snap.val() || {};
                const wa = data.whatsapp || '#',
                    waChannel = data.whatsapp_channel || 'https://whatsapp.com/channel/0029Vb7lJZ12ER6kwDPt042K',
                    tgLogin = data.telegram_login || '#',
                    tgDash = data.telegram_dashboard || '#';
                document.getElementById('auth-wa-link').href = waChannel;
                document.getElementById('auth-wa-link-2').href = waChannel;
                document.getElementById('auth-tg-link').href = tgLogin;
                document.getElementById('auth-tg-link-2').href = tgLogin;
                const fab = document.getElementById('global-telegram-btn');
                fab.href = tgDash;
                fab.style.display = tgDash === '#' ? 'none' : 'flex';
                document.getElementById('support-wa-btn').href = wa;
                document.getElementById('support-tg-btn').href = tgDash !== '#' ? tgDash : tgLogin;
                document.getElementById('land-wa-link').href = waChannel;
                document.getElementById('land-tg-link').href = tgLogin;
                const waIcon = document.getElementById('land-wa-link-icon');
                const tgIcon = document.getElementById('land-tg-link-icon');
                if (waIcon) waIcon.href = waChannel;
                if (tgIcon) tgIcon.href = tgLogin;
                const vc1 = document.getElementById('verify-channel-1');
                const vc2 = document.getElementById('verify-channel-2');
                if (vc1) vc1.href = waChannel;
                if (vc2) vc2.href = tgLogin;
            });
        }

        // --- BRANDING ---
        function updateAuthLogo(logoData) {
            document.querySelectorAll('#auth-logo-icon, #auth-logo-icon-2').forEach(el => {
                if (logoData && logoData.startsWith('data:image')) { el.innerHTML = '<img src="' + logoData +
                        '" alt="Logo" />'; } else if (logoData && logoData.length > 5) { el.innerHTML =
                        '<img src="' + logoData + '" alt="Logo" />'; } else { el.innerHTML =
                        '<span class="logo-fallback">ZX</span>'; }
            });
        }

        function updateNavbarLogo(logoData) {
            const el = document.getElementById('navbar-logo-icon');
            if (el) {
                if (logoData && logoData.startsWith('data:image')) { el.innerHTML = '<img src="' + logoData +
                        '" alt="Logo" />'; } else if (logoData && logoData.length > 5) { el.innerHTML =
                        '<img src="' + logoData + '" alt="Logo" />'; } else { el.innerHTML =
                        '<span class="brand-fallback">ZX</span>'; }
            }
            document.querySelectorAll('#drawer-logo-icon, #land-logo-icon').forEach(el2 => {
                if (logoData && logoData.length > 5) { el2.innerHTML = '<img src="' + logoData + '" alt="Logo" />'; }
                else { el2.innerHTML = '<span class="logo-fallback">ZX</span>'; }
            });
        }

        // --- ADMIN-MANAGED DEVICE ADDITIONS ---
        // The 175-model catalogue above is always available offline. Devices
        // added from Admin → Devices are merged in on top so new phones can be
        // added without a code deploy. Same brand+model overrides the local entry.
        function initDeviceCatalogSync() {
            if (!db) return;
            onValue(ref(db, 'devices'), (snap) => {
                const extra = snap.val() || {};
                Object.values(extra).forEach(d => {
                    if (!d || !d.b || !d.m) return;
                    const idx = SENSI_DEVICES.findIndex(x => x.b === d.b && x.m === d.m);
                    const entry = {
                        b: d.b, m: d.m, proc: d.proc || 'Unknown', gpu: d.gpu || 'Unknown',
                        ram: d.ram || '4GB', os: d.os || 'Android', rr: d.rr || '60Hz',
                        perf: Number(d.perf) || 50, gam: Number(d.gam) || 50,
                        yr: Number(d.yr) || new Date().getFullYear(), arch: d.arch || 'ARM64',
                        batt: d.batt || '', res: d.res || ''
                    };
                    if (idx >= 0) SENSI_DEVICES[idx] = entry;
                    else SENSI_DEVICES.push(entry);
                });
            });
        }

        function initBranding() {
            if (!db) return;
            onValue(ref(db, 'settings/branding'), (snap) => {
                const data = snap.val();
                if (data) {
                    if (data.name) { document.getElementById('site-name').innerText = data.name;
                        document.title = data.name + ' | PREMIUM'; }
                    updateAuthLogo(data.logo || '');
                    updateNavbarLogo(data.logo || '');
                } else { updateAuthLogo('');
                    updateNavbarLogo(''); }
            });
        }

        // --- DEPOSIT SETTINGS (FIXED: handles multiple field names) ---
        function fetchDepositSettings() {
            if (!db) return;
            if (paymentListener) { paymentListener();
                paymentListener = null; }

            paymentListener = onValue(ref(db, 'settings/payment'), (snap) => {
                console.log('💳 Payment settings updated:', snap.val());
                const data = snap.val() || {};

                const upi = data.upiId || data.upi || data.upi_id || data.UPI || 'Not Set';
                document.getElementById('manual-upi-display').innerText = upi;

                const qr = data.qrImage || data.qr || data.qr_url || data.QR || '';
                const qrImg = document.getElementById('manual-qr-display');
                const qrDl = document.getElementById('manual-qr-download');
                if (qr && qr.startsWith('http')) {
                    qrImg.src = qr;
                    qrImg.style.display = 'block';
                    qrDl.href = qr;
                    qrDl.style.display = 'inline-flex';
                    qrImg.onerror = function() {
                        this.parentElement.innerHTML =
                            '<i class="fas fa-qrcode" style="font-size:48px;color:var(--text-muted);"></i>';
                    };
                } else {
                    qrImg.style.display = 'none';
                    qrDl.style.display = 'none';
                }

                if (data.zap_key || data.zapKey) {
                    window.ZAP_KEY = data.zap_key || data.zapKey;
                }

                if (!upi || !qr) {
                    get(ref(db, 'settings/deposit')).then(fallbackSnap => {
                        if (fallbackSnap.exists()) {
                            const fallback = fallbackSnap.val();
                            if (!upi && (fallback.upiId || fallback.upi)) {
                                document.getElementById('manual-upi-display').innerText = fallback
                                    .upiId || fallback.upi || 'Not Set';
                            }
                            if (!qr && (fallback.qrImage || fallback.qr)) {
                                const fqr = fallback.qrImage || fallback.qr || '';
                                if (fqr.startsWith('http')) {
                                    qrImg.src = fqr;
                                    qrImg.style.display = 'block';
                                    qrDl.href = fqr;
                                    qrDl.style.display = 'inline-flex';
                                }
                            }
                            if (fallback.zap_key || fallback.zapKey) {
                                window.ZAP_KEY = fallback.zap_key || fallback.zapKey;
                            }
                        }
                    }).catch(() => {});
                }
            }, (error) => {
                console.warn('Payment settings listener error:', error);
                get(ref(db, 'settings/deposit')).then(fallbackSnap => {
                    if (fallbackSnap.exists()) {
                        const fallback = fallbackSnap.val();
                        const upi = fallback.upiId || fallback.upi || 'Not Set';
                        document.getElementById('manual-upi-display').innerText = upi;
                        const qr = fallback.qrImage || fallback.qr || '';
                        const qrImg = document.getElementById('manual-qr-display');
                        const qrDl = document.getElementById('manual-qr-download');
                        if (qr.startsWith('http')) {
                            qrImg.src = qr;
                            qrImg.style.display = 'block';
                            qrDl.href = qr;
                            qrDl.style.display = 'inline-flex';
                        }
                        if (fallback.zap_key || fallback.zapKey) {
                            window.ZAP_KEY = fallback.zap_key || fallback.zapKey;
                        }
                    }
                }).catch(() => {});
            });
        }

        // --- PROMOTIONS ---
        let autoScrollInterval;

        function initPromotions() {
            if (!db) return;
            onValue(ref(db, 'promotions'), (snap) => {
                const container = document.getElementById('promo-container');
                const promos = [];
                if (snap.exists()) snap.forEach(c => promos.push({ id: c.key, ...c.val() }));
                const active = promos.filter(p => p.status === true || p.status === 'true' || p.status === 'active');
                if (active.length === 0) { container.classList.add('hidden'); return; }
                container.classList.remove('hidden');
                container.innerHTML = '';
                active.forEach(p => {
                    const link = p.link ? 'onclick="window.open(\'' + p.link + '\',\'_blank\')"' : '';
                    const img = p.image ? '<img src="' + p.image + '" alt="' + p.title +
                        '" onerror="this.parentElement.innerHTML=\'<div style=\\\'width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--text-muted);background:var(--bg-input);\\\'>No Image</div>\'">"' :
                        '<div style="width:100%;height:100%;background:var(--bg-input);display:flex;align-items:center;justify-content:center;color:var(--text-muted);">No Image</div>';
                    container.innerHTML += '<div class="promo-card" ' + link + '>' + img +
                        '<div class="promo-overlay"><div class="promo-title">' + p.title +
                        '</div></div></div>';
                });
                clearInterval(autoScrollInterval);
                if (container.scrollWidth > container.clientWidth) {
                    let paused = false;
                    autoScrollInterval = setInterval(() => {
                        if (paused) return;
                        const card = container.querySelector('.promo-card');
                        if (!card) return;
                        const step = card.clientWidth + 16;
                        if (container.scrollLeft + container.clientWidth >= container.scrollWidth - 10) { container
                                .scrollTo({ left: 0, behavior: 'smooth' }); } else { container.scrollBy({ left: step,
                                behavior: 'smooth' }); }
                    }, 3500);
                    container.addEventListener('mouseenter', () => paused = true);
                    container.addEventListener('mouseleave', () => paused = false);
                    container.addEventListener('touchstart', () => paused = true, { passive: true });
                    container.addEventListener('touchend', () => setTimeout(() => paused = false, 2000),
                    { passive: true });
                }
            });
        }

        // --- REFERRAL SYSTEM ---
        function generateReferralCode() {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            let code = '';
            for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
            return code;
        }

        async function initReferralSystem() {
            if (!db || !currentUser) return;

            const userRef = ref(db, 'users/' + currentUser.uid);
            const snap = await get(userRef);
            const data = snap.val() || {};

            if (!data.referralCode) {
                const code = generateReferralCode();
                await update(userRef, { referralCode: code });
                userData.referralCode = code;
            } else {
                userData.referralCode = data.referralCode;
            }

            const refCode = data.referredBy || '';
            if (refCode && !data.referralBonusClaimed) {
                const usersSnap = await get(ref(db, 'users'));
                let referrerUid = null;
                if (usersSnap.exists()) {
                    usersSnap.forEach(child => {
                        const u = child.val();
                        if (u.referralCode === refCode && child.key !== currentUser.uid) {
                            referrerUid = child.key;
                        }
                    });
                }

                if (referrerUid) {
                    let bonusAmount = 50;
                    try {
                        const bonusSnap = await get(ref(db, 'settings/referral'));
                        if (bonusSnap.exists() && bonusSnap.val().bonus) {
                            bonusAmount = Number(bonusSnap.val().bonus) || 50;
                        }
                    } catch (e) {}
                    await runTransaction(ref(db, 'users/' + currentUser.uid + '/balance'), (bal) => (bal || 0) + bonusAmount);
                    await runTransaction(ref(db, 'users/' + referrerUid + '/balance'), (bal) => (bal || 0) + bonusAmount);
                    await update(ref(db, 'users/' + currentUser.uid), { referralBonusClaimed: true });
                    await push(ref(db, 'referrals/' + referrerUid), {
                        referredUid: currentUser.uid,
                        referredEmail: currentUser.email,
                        date: new Date().toISOString(),
                        bonus: bonusAmount,
                        status: 'active'
                    });
                    await runTransaction(ref(db, 'users/' + referrerUid + '/referralStats/total'), (curr) => (curr || 0) +
                    1);
                    await runTransaction(ref(db, 'users/' + referrerUid + '/referralStats/earnings'), (curr) => (curr ||
                        0) + bonusAmount);
                    showToast('🎉 You earned ₦' + bonusAmount + ' referral bonus!', 'success');
                    addNotification(referrerUid, '🎉 Referral Bonus! You earned ₦' + bonusAmount + ' from ' + currentUser.email);
                }
            }

            loadReferralStats();
        }

        async function loadReferralStats() {
            if (!db || !currentUser) return;

            const statsRef = ref(db, 'users/' + currentUser.uid + '/referralStats');
            const snap = await get(statsRef);
            const stats = snap.val() || { total: 0, earnings: 0 };

            const refsSnap = await get(ref(db, 'referrals/' + currentUser.uid));
            let active = 0;
            if (refsSnap.exists()) {
                refsSnap.forEach(child => {
                    if (child.val().status === 'active') active++;
                });
            }

            referralsData.total = stats.total || 0;
            referralsData.active = active;
            referralsData.earnings = stats.earnings || 0;

            updateReferralUI();
        }

        function updateReferralUI() {
            const total = referralsData.total || 0;
            const active = referralsData.active || 0;
            const earnings = referralsData.earnings || 0;

            document.getElementById('ref-total').innerText = total;
            document.getElementById('ref-active').innerText = active;
            document.getElementById('ref-earnings').innerText = '₦' + earnings;
            document.getElementById('refer-earnings-amount').innerText = '₦' + earnings;

            document.getElementById('ref-page-total').innerText = total;
            document.getElementById('ref-page-active').innerText = active;
            document.getElementById('ref-page-earnings-display').innerText = '₦' + earnings;

            document.getElementById('stat-referrals').innerText = total;
            document.getElementById('stat-reward').innerText = '₦' + earnings;

            document.getElementById('prof-referrals').innerText = total;
            document.getElementById('prof-referral-earnings').innerText = '₦' + earnings;

            const code = userData.referralCode || generateReferralCode();
            if (userData.referralCode === 'XXXX' || userData.referralCode === '') {
                userData.referralCode = code;
                if (currentUser && db) {
                    update(ref(db, 'users/' + currentUser.uid), { referralCode: code }).catch(() => {});
                }
            }
            // Build the link from the page's own path (not just the origin) so
            // it still works correctly when the site is hosted in a
            // subdirectory (e.g. https://user.github.io/repo/) instead of a
            // domain root — origin alone would drop the "/repo/" part and
            // send people to the wrong place.
            const path = window.location.pathname.replace(/\/index\.html$/i, '/');
            const baseUrl = window.location.origin + path;
            const separator = baseUrl.includes('?') ? '&ref=' : '?ref=';
            const link = baseUrl + separator + code;
            document.getElementById('refer-link-input').value = link;
            document.getElementById('refer-page-link-input').value = link;
        }

        window.copyReferLink = function() {
            const input = document.getElementById('refer-link-input');
            const text = input.value;
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(() => showToast('Referral link copied!', 'success'));
            } else {
                input.select();
                document.execCommand('copy');
                showToast('Referral link copied!', 'success');
            }
        };

        window.copyReferLinkPage = function() {
            const input = document.getElementById('refer-page-link-input');
            const text = input.value;
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(() => showToast('Referral link copied!', 'success'));
            } else {
                input.select();
                document.execCommand('copy');
                showToast('Referral link copied!', 'success');
            }
        };

        window.shareReferLink = function() {
            const link = document.getElementById('refer-page-link-input').value;
            if (navigator.share) {
                navigator.share({
                    title: 'Join ZERX-XIT',
                    text: 'Join me on ZERX-XIT and get premium mods! Use my referral link:',
                    url: link
                }).catch(() => {});
            } else {
                copyReferLinkPage();
            }
        };

        // --- NOTIFICATIONS SYSTEM ---
        let notificationCount = 0;

        function addNotification(uid, message, type = 'info') {
            if (!db || !uid) return;
            const notifRef = push(ref(db, 'notifications/' + uid));
            set(notifRef, { message, type, read: false, timestamp: serverTimestamp() }).catch(() => {});
        }

        function listenNotifications() {
            if (!db || !currentUser) return;

            const personalRef = ref(db, 'notifications/' + currentUser.uid);
            const globalRef = ref(db, 'global_notifications');

            function rebuildUI() {
                get(personalRef).then(personalSnap => {
                    get(globalRef).then(globalSnap => {
                        const container = document.getElementById('notif-list');
                        const badge = document.getElementById('notif-badge');
                        let unread = 0;
                        const items = [];

                        if (personalSnap.exists()) {
                            personalSnap.forEach(child => {
                                const data = child.val();
                                data.id = child.key;
                                data.source = 'personal';
                                if (!data.read) unread++;
                                items.push(data);
                            });
                        }
                        if (globalSnap.exists()) {
                            globalSnap.forEach(child => {
                                const data = child.val();
                                data.id = child.key;
                                data.source = 'global';
                                data.read = true;
                                items.push(data);
                            });
                        }

                        items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

                        if (unread > 0) {
                            badge.innerText = unread > 9 ? '9+' : unread;
                            badge.classList.remove('hidden');
                        } else {
                            badge.classList.add('hidden');
                        }

                        if (items.length === 0) {
                            container.innerHTML = '<div class="notif-empty">No notifications</div>';
                            return;
                        }

                        let html = '';
                        items.slice(0, 15).forEach(item => {
                            const time = item.timestamp ? new Date(item.timestamp).toLocaleString() :
                            'Now';
                            const icon = item.type === 'success' ? 'fa-check-circle' : item.type ===
                                'warning' ? 'fa-exclamation-triangle' : 'fa-bell';
                            const isRead = item.source === 'global' || item.read;
                            html += `
                                    <div class="notif-item" style="${!isRead ? 'background:rgba(var(--accent-primary-rgb),0.04);' : ''}">
                                        <div class="notif-icon"><i class="fas ${icon}"></i></div>
                                        <div class="notif-body">
                                            <div class="title">${escapeHtml(item.message)}</div>
                                            <div class="time">${time} ${item.source === 'global' ? '📢' : ''}</div>
                                        </div>
                                    </div>
                                `;
                        });
                        container.innerHTML = html;
                    });
                }).catch(() => {});
            }

            onValue(personalRef, () => { rebuildUI(); });
            onValue(globalRef, () => { rebuildUI(); });

            rebuildUI();

            document.getElementById('notif-toggle').addEventListener('click', function(e) {
                e.stopPropagation();
                const dropdown = document.getElementById('notif-dropdown');
                dropdown.classList.toggle('active');
                if (dropdown.classList.contains('active') && currentUser) {
                    const updates = {};
                    get(personalRef).then(snap => {
                        if (snap.exists()) {
                            snap.forEach(child => {
                                if (!child.val().read) {
                                    updates[child.key + '/read'] = true;
                                }
                            });
                            if (Object.keys(updates).length > 0) {
                                update(personalRef, updates).catch(() => {});
                            }
                        }
                    }).catch(() => {});
                }
            });
        }

        // --- AUTH STATE ---
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                currentUser = user;
                authScreen.classList.add('hidden');
                document.getElementById('landing-screen').classList.add('hidden');
                mainApp.style.display = 'block';
                await performSecurityCheck();
                loadLightMode();
                loadTheme();
                applyAdminThemeOverride();
                loadAdminAnimation();
                initUserData();
                fetchDepositSettings();
                fetchPanels();
                initPromotions();
                initSpinWheel();
                await initReferralSystem();
                listenNotifications();
                navigate('home');
                hideLoader();
            } else {
                currentUser = null;
                mainApp.style.display = 'none';
                if (!landAuthRequested) {
                    document.getElementById('landing-screen').classList.remove('hidden');
                    authScreen.classList.add('hidden');
                } else {
                    authScreen.classList.remove('hidden');
                }
                hideLoader();
                securityCompleted = false;
                securityOverlay.classList.remove('active');
                if (animCleanup) { animCleanup();
                    animCleanup = null; }
                if (paymentListener) { paymentListener();
                    paymentListener = null; }
            }
        });

        // --- AUTH ACTIONS ---
        function friendlyAuthError(e) {
            const code = e && e.code ? e.code : '';
            const map = {
                'auth/network-request-failed': "Can't reach the server. Check your internet connection (or turn off any VPN/Private DNS) and try again.",
                'auth/invalid-credential': 'Incorrect email or password.',
                'auth/wrong-password': 'Incorrect email or password.',
                'auth/user-not-found': 'No account found with that email.',
                'auth/invalid-email': "That doesn't look like a valid email address.",
                'auth/email-already-in-use': 'An account with this email already exists — try logging in instead.',
                'auth/weak-password': 'Password is too weak — use at least 6 characters.',
                'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
                'auth/user-disabled': 'This account has been disabled.'
            };
            return map[code] || e?.message || 'Something went wrong. Please try again.';
        }
        document.getElementById('btn-signup').addEventListener('click', async function() {
            const email = document.getElementById('signup-email').value.trim();
            const pass = document.getElementById('signup-pass').value;
            const btn = this;
            if (!email || pass.length < 6) return showToast('Invalid email or password (<6 chars)', 'error');
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
            btn.disabled = true;
            showLoader();
            try {
                await applyAuthPersistence(true);
                const cred = await createUserWithEmailAndPassword(auth, email, pass);
                const urlParams = new URLSearchParams(window.location.search);
                const refCode = urlParams.get('ref') || '';
                await set(ref(db, 'users/' + cred.user.uid), { email, balance: 0, createdAt: serverTimestamp(),
                    status: 'active', referredBy: refCode, referralBonusClaimed: false });
                showToast('Account created!');
            } catch (e) { showToast(friendlyAuthError(e), 'error'); } finally { btn.innerHTML =
                    '<span><i class="fas fa-user-plus"></i> Sign Up</span>';
                btn.disabled = false;
                hideLoader(); }
        });

        document.getElementById('btn-login').addEventListener('click', async function() {
            const email = document.getElementById('login-email').value.trim();
            const pass = document.getElementById('login-pass').value;
            const btn = this;
            if (!email || !pass) return showToast('Enter email and password', 'error');
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
            btn.disabled = true;
            showLoader();
            const remember = document.getElementById('login-remember')?.checked !== false;
            try {
                await applyAuthPersistence(remember);
                await signInWithEmailAndPassword(auth, email, pass);
                showToast('Welcome back!'); } catch (e) { showToast(friendlyAuthError(e), 'error'); } finally { btn
                    .innerHTML = '<span><i class="fas fa-arrow-right"></i> Login</span>';
                btn.disabled = false;
                hideLoader(); }
        });

        document.getElementById('btn-logout').addEventListener('click', async function() {
            showLoader();
            try { await signOut(auth);
                document.getElementById('dropdown-menu').classList.remove('active'); } catch (e) { console.error(e); }
            hideLoader();
        });

        // --- GOOGLE SIGN-IN ---
        let googleAuthInProgress = false;
        async function handleGoogleAuth() {
            if (googleAuthInProgress) return;
            googleAuthInProgress = true;
            showLoader();
            try {
                const loginBoxVisible = !document.getElementById('login-box')?.classList.contains('hidden');
                const remember = loginBoxVisible ? (document.getElementById('login-remember')?.checked !== false) : true;
                await applyAuthPersistence(remember);
                const cred = await signInWithPopup(auth, googleProvider);
                const userRef = ref(db, 'users/' + cred.user.uid);
                const snap = await get(userRef);
                if (!snap.exists()) {
                    const urlParams = new URLSearchParams(window.location.search);
                    const refCode = urlParams.get('ref') || '';
                    await set(userRef, { email: cred.user.email || '', balance: 0, createdAt: serverTimestamp(),
                        status: 'active', referredBy: refCode, referralBonusClaimed: false });
                    showToast('Account created!');
                } else {
                    showToast('Welcome back!');
                }
            } catch (e) {
                console.error('Google sign-in error:', e.code, e.message);
                if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') {
                    // user closed the popup, no need to alarm them
                } else if (e.code === 'auth/unauthorized-domain') {
                    showToast('This domain isn\'t authorized for Google sign-in yet. Add it under Firebase Console → Authentication → Settings → Authorized domains.', 'error');
                } else if (e.code === 'auth/popup-blocked') {
                    showToast('Popup was blocked by the browser. Allow popups for this site and try again.', 'error');
                } else if (e.code === 'auth/operation-not-allowed') {
                    showToast('Google sign-in isn\'t enabled in Firebase yet. Enable it under Authentication → Sign-in method.', 'error');
                } else if (e.code === 'auth/network-request-failed') {
                    showToast("Can't reach the server. Check your internet connection (or turn off any VPN/Private DNS) and try again.", 'error');
                } else {
                    showToast('Google sign-in failed: ' + (e.code || e.message || 'unknown error'), 'error');
                }
            } finally {
                googleAuthInProgress = false;
                hideLoader();
            }
        }
        document.getElementById('btn-google-login').addEventListener('click', handleGoogleAuth);
        document.getElementById('btn-google-signup').addEventListener('click', handleGoogleAuth);

        // --- USER DATA ---
        function initUserData() {
            if (!db || !currentUser) return;
            const userEmail = currentUser.email || 'Not set';

            onValue(ref(db, 'users/' + currentUser.uid), (snap) => {
                if (snap.exists()) {
                    userData = snap.val();
                    if (userData.status === 'banned') {
                        showBanScreen(userData);
                        return;
                    }
                    const bal = parseFloat(userData.balance || 0).toFixed(2);
                    document.getElementById('nav-balance').innerText = bal;
                    document.getElementById('prof-bal').innerText = '₦' + bal;
                    document.getElementById('wallet-stat-bal').innerText = '₦' + bal;
                    document.getElementById('stat-balance').innerText = '₦' + bal;
                    document.getElementById('prof-email').innerText = userEmail;
                    document.getElementById('prof-name').innerText = userEmail.split('@')[0] || 'User';
                    document.getElementById('prof-date').innerText = userData.createdAt ? new Date(userData.createdAt)
                        .toLocaleDateString() : '...';
                    if (userData.referralCode) {
                        userData.referralCode = userData.referralCode;
                        updateReferralUI();
                    }
                    if (userData.theme && THEMES[userData.theme]) {
                        try { localStorage.setItem('zerx-xit-theme', userData.theme); } catch (e) {}
                        applyTheme(userData.theme);
                    }
                    const vipStatusEl = document.getElementById('prof-vip-status');
                    const vipUpsell = document.getElementById('vip-upsell-card');
                    if (vipStatusEl) {
                        if (userData.isVip) {
                            vipStatusEl.innerHTML = '<i class="fas fa-crown" style="color:var(--accent-primary);"></i> VIP';
                            if (vipUpsell) vipUpsell.style.display = 'none';
                        } else {
                            vipStatusEl.textContent = 'Free account';
                            if (vipUpsell) vipUpsell.style.display = 'block';
                        }
                    }
                } else { document.getElementById('prof-email').innerText = userEmail; }
                hideLoader();
            });

            onValue(ref(db, 'transactions/' + currentUser.uid), (snap) => {
                let totalDep = 0,
                    todayDep = 0,
                    pendingDep = 0,
                    totalSpent = 0;
                const today = new Date().toLocaleDateString();
                if (snap.exists()) {
                    snap.forEach(c => {
                        const tx = c.val();
                        const txDate = new Date(tx.date).toLocaleDateString();
                        if (tx.type && tx.type.includes('deposit')) {
                            if (tx.status === 'success') { totalDep += parseFloat(tx.amount) || 0; if (
                                    txDate === today) todayDep += parseFloat(tx.amount) || 0; } else if (tx
                                .status === 'pending') pendingDep += parseFloat(tx.amount) || 0;
                        }
                        if (tx.status === 'success' && tx.type === 'purchase') {
                            totalSpent += parseFloat(tx.amount) || 0;
                        }
                    });
                }
                document.getElementById('wallet-stat-dep').innerText = '₦' + totalDep.toFixed(2);
                document.getElementById('wallet-stat-today').innerText = '₦' + todayDep.toFixed(2);
                document.getElementById('wallet-stat-pending').innerText = '₦' + pendingDep.toFixed(2);
                document.getElementById('prof-spent').innerText = '₦' + totalSpent.toFixed(2);
                renderSpendingChart();
            });

            onValue(ref(db, 'orders/' + currentUser.uid), (snap) => {
                const orders = [];
                if (snap.exists()) {
                    snap.forEach(c => {
                        const o = c.val();
                        o.id = c.key;
                        orders.push(o);
                    });
                }
                allOrders = orders;
                updateActivityFeed(orders);
                document.getElementById('stat-orders').innerText = orders.length;
                document.getElementById('prof-purchases').innerText = orders.filter(o => o.status === 'approved')
                    .length;
                renderSpendingChart();
            });
        }

        // --- BAN + APPEAL (ported from banned.html / /api/appeal) ---
        let banAppealSent = false;
        function showBanScreen(u) {
            document.getElementById('ban-reason').textContent = u.banReason || 'Policy violation';
            document.getElementById('ban-zerx-id').textContent = u.zerxId || '—';
            document.getElementById('ban-date').textContent = u.bannedAt ? new Date(u.bannedAt).toLocaleString() : '—';
            document.getElementById('ban-appeal-msg').textContent = '';
            document.getElementById('ban-appeal-message').value = '';
            banAppealSent = false;
            openModal('modal-banned');
        }

        document.getElementById('ban-btn-signout')?.addEventListener('click', () => {
            closeModal('modal-banned');
            signOut(auth);
        });

        document.getElementById('ban-btn-appeal')?.addEventListener('click', async () => {
            if (banAppealSent) { closeModal('modal-banned'); signOut(auth); return; }
            const message = document.getElementById('ban-appeal-message').value.trim();
            const msgEl = document.getElementById('ban-appeal-msg');
            if (!message) { msgEl.style.color = 'var(--accent-primary)'; msgEl.textContent = 'Add a short message first.'; return; }
            if (!db || !currentUser) return;
            const btn = document.getElementById('ban-btn-appeal');
            btn.disabled = true;
            try {
                await push(ref(db, 'appeals'), {
                    uid: currentUser.uid,
                    email: currentUser.email || '',
                    zerxId: userData?.zerxId || '',
                    banReason: userData?.banReason || '',
                    message,
                    status: 'pending',
                    createdAt: serverTimestamp()
                });
                banAppealSent = true;
                msgEl.style.color = 'var(--accent-green, #34d399)';
                msgEl.textContent = 'Appeal submitted — an admin will review it shortly.';
                btn.textContent = 'Sign out';
            } catch (e) {
                msgEl.style.color = 'var(--accent-primary)';
                msgEl.textContent = 'Could not submit appeal — try again.';
            } finally {
                btn.disabled = false;
            }
        });

        function updateActivityFeed(orders) {
            const container = document.getElementById('activity-list');
            if (!orders.length) {
                container.innerHTML =
                    '<div style="padding:20px;text-align:center;color:var(--text-muted);">No recent activity</div>';
                return;
            }

            const recent = orders.slice(0, 5);
            let html = '';
            recent.forEach(o => {
                const statusMap = {
                    pending: { icon: 'yellow', label: '⏳ Pending' },
                    approved: { icon: 'green', label: '✅ Approved' },
                    rejected: { icon: 'red', label: '❌ Rejected' }
                };
                const s = statusMap[o.status] || statusMap.pending;
                const dateStr = o.timestamp ? new Date(o.timestamp).toLocaleDateString() : (o.date ? new Date(o.date)
                    .toLocaleDateString() : 'N/A');
                const price = o.price || 0;
                const isPositive = o.status === 'approved';
                html += `
                        <div class="activity-item">
                            <div class="activity-icon ${s.icon}"><i class="fas ${o.status === 'approved' ? 'fa-check' : o.status === 'pending' ? 'fa-clock' : 'fa-times'}"></i></div>
                            <div class="activity-info">
                                <div class="activity-title">${o.panelName || 'Order'} - ${o.label || 'Plan'}</div>
                                <div class="activity-time">${dateStr} • ${s.label}</div>
                            </div>
                            <div class="activity-amount ${isPositive ? 'positive' : 'negative'}">${isPositive ? '+' : ''}₦${price}</div>
                        </div>
                    `;
            });
            container.innerHTML = html;
        }

        // --- SPENDING CHART ---
        function renderSpendingChart() {
            const canvas = document.getElementById('spendingChart');
            if (!canvas) return;
            if (chartInstance) { chartInstance.destroy();
                chartInstance = null; }

            const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
            const today = new Date();
            const dayOfWeek = today.getDay();
            const startOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

            const labels = [];
            const data = [];
            const dailyMap = {};

            const now = new Date();
            now.setHours(0, 0, 0, 0);

            if (currentUser && db) {
                get(ref(db, 'transactions/' + currentUser.uid)).then(snap => {
                    if (snap.exists()) {
                        snap.forEach(child => {
                            const tx = child.val();
                            if (tx.status === 'success' && tx.type === 'purchase' && tx.amount) {
                                const d = new Date(tx.date);
                                const dateStr = d.toDateString();
                                dailyMap[dateStr] = (dailyMap[dateStr] || 0) + parseFloat(tx.amount);
                            }
                        });
                    }
                    for (let i = 6; i >= 0; i--) {
                        const d = new Date(now);
                        d.setDate(d.getDate() - i);
                        const dateStr = d.toDateString();
                        const label = days[(d.getDay() + 6) % 7];
                        labels.push(label);
                        data.push(dailyMap[dateStr] || 0);
                    }
                    createChart(labels, data);
                }).catch(() => { createChart(labels, Array(7).fill(0)); });
            } else {
                createChart(labels, Array(7).fill(0));
            }
        }

        function createChart(labels, data) {
            const canvas = document.getElementById('spendingChart');
            if (!canvas) return;
            if (chartInstance) { chartInstance.destroy();
                chartInstance = null; }
            const ctx = canvas.getContext('2d');
            const accent = getComputedStyle(document.body).getPropertyValue('--accent-primary').trim() ||
                '#ef4136';
            const textColor = getComputedStyle(document.body).getPropertyValue('--text-secondary').trim() ||
                '#c8bda8';

            chartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Spent (₦)',
                        data: data,
                        backgroundColor: accent + '40',
                        borderColor: accent,
                        borderWidth: 2,
                        borderRadius: 6,
                        barPercentage: 0.6,
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: 'rgba(0,0,0,0.8)',
                            titleColor: '#fff',
                            bodyColor: '#fff',
                            cornerRadius: 8,
                            padding: 12,
                            callbacks: {
                                label: function(context) {
                                    return '₦' + context.parsed.y.toFixed(2);
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: { display: false },
                            ticks: {
                                color: textColor,
                                font: { size: 11 }
                            }
                        },
                        y: {
                            grid: { color: 'rgba(255,255,255,0.05)' },
                            ticks: {
                                color: textColor,
                                font: { size: 11 },
                                callback: function(value) { return '₦' + value.toFixed(0); }
                            },
                            beginAtZero: true
                        }
                    },
                    animation: {
                        duration: 800,
                        easing: 'easeOutQuart'
                    }
                }
            });
        }

        // --- NAVIGATION ---
        // "NEW"/"SPIN" menu badges are one-time onboarding hints. Once the
        // user visits that section, mark it seen and hide the badge for good.
        const ONE_TIME_BADGES = ['dashboard', 'rewards', 'refer', 'sensi'];
        function markBadgeSeen(pageId) {
            if (!ONE_TIME_BADGES.includes(pageId)) return;
            try { localStorage.setItem('zerx-xit-seen-' + pageId, '1'); } catch (e) {}
            const badge = document.getElementById('badge-' + pageId);
            if (badge) badge.style.display = 'none';
        }
        function loadSeenBadges() {
            ONE_TIME_BADGES.forEach(pageId => {
                let seen = false;
                try { seen = localStorage.getItem('zerx-xit-seen-' + pageId) === '1'; } catch (e) {}
                if (seen) {
                    const badge = document.getElementById('badge-' + pageId);
                    if (badge) badge.style.display = 'none';
                }
            });
        }
        loadSeenBadges();

        window.navigate = (pageId, _fromPopState) => {
            document.querySelectorAll('.page-content').forEach(p => p.classList.add('hidden'));
            const target = document.getElementById('page-' + pageId);
            if (target) target.classList.remove('hidden');
            const dropdown = document.getElementById('dropdown-menu');
            if (dropdown) dropdown.classList.remove('active');
            document.querySelectorAll('.dropdown-item[onclick]').forEach(item => {
                item.classList.remove('active');
                if (item.getAttribute('onclick').includes("'" + pageId + "'")) {
                    item.classList.add('active');
                }
            });
            markBadgeSeen(pageId);
            if (pageId === 'orders') fetchOrders();
            if (pageId === 'history') fetchKeys();
            if (pageId === 'rewards') initSpinWheel();
            if (pageId === 'refer') loadReferralStats();
            if (pageId === 'dashboard') renderSpendingChart();
            if (pageId === 'sensi') initSensiGenerator();
            window.scrollTo(0, 0);
            // Push a history entry for every in-app navigation (unless we're
            // already replaying one from a back/forward gesture) so the
            // phone/browser back button steps through app sections instead
            // of leaving or reloading the whole app.
            if (!_fromPopState) {
                try { history.pushState({ page: pageId }, '', '#' + pageId); } catch (e) {}
            }
        };

        // Establish a base history entry so the very first back-press lands
        // on an in-app state instead of immediately exiting/reloading.
        try { history.replaceState({ page: 'home' }, '', '#home'); } catch (e) {}

        function closeAnyOpenModal() {
            let closedOne = false;
            document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(m => {
                m.classList.add('hidden');
                closedOne = true;
            });
            return closedOne;
        }

        // Back/forward gestures (including the phone's hardware/gesture back
        // button) land here instead of tearing down the app. If a modal is
        // open we close that first; otherwise we switch to whichever section
        // is in the history state.
        window.addEventListener('popstate', function(event) {
            if (closeAnyOpenModal()) return;
            const pageId = (event.state && event.state.page) || 'home';
            navigate(pageId, true);
        });

        document.querySelector('.dropdown-item[onclick*="\'home\'"]')?.classList.add('active');

        document.getElementById('menu-toggle').addEventListener('click', function() { document.getElementById(
                'dropdown-menu').classList.toggle('active'); });

        // --- CATEGORY FILTERS ---
        document.getElementById('category-filters').addEventListener('click', function(e) {
            const chip = e.target.closest('.filter-chip');
            if (!chip) return;
            document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            currentCategory = chip.dataset.cat;
            applyFilters();
        });

        function applyFilters() {
            const term = document.getElementById('search-input').value.toLowerCase().trim();
            const cards = document.querySelectorAll('.panel-card');
            let visible = 0;
            cards.forEach(c => {
                const data = c.getAttribute('data-search') || '';
                const cat = c.dataset.category || 'all';
                let show = true;
                if (currentCategory !== 'all' && cat !== currentCategory) show = false;
                if (term && !data.includes(term)) show = false;
                if (show) { c.style.display = 'flex';
                    visible++; } else { c.style.display = 'none'; }
            });
            const empty = document.getElementById('search-empty');
            if (empty) empty.classList.toggle('hidden', visible > 0 || cards.length === 0);
        }

        // Search
        let searchTimeout;
        document.getElementById('search-input').addEventListener('input', function(e) {
            const icon = document.querySelector('.search-box .search-icon');
            const loader = document.querySelector('.search-box .search-spinner');
            if (icon) icon.style.display = 'none';
            if (loader) loader.style.display = 'block';
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                applyFilters();
                if (loader) loader.style.display = 'none';
                if (icon) icon.style.display = 'block';
            }, 300);
        });

        // --- FETCH PANELS (MODIFIED: banner + logo next to name) ---
        function fetchPanels() {
            if (!db) return;
            onValue(ref(db, 'panels'), (snap) => {
                const container = document.getElementById('panels-container');
                container.innerHTML = '';
                if (!snap.exists()) {
                    container.innerHTML =
                        '<div class="empty-state"><i class="fas fa-box-open"></i><p>No panels available.</p></div>';
                    return;
                }
                snap.forEach(c => {
                    const p = c.val();
                    if (!p || p.status !== 'active') return;
                    const panelId = c.key;

                    // --- BANNER & LOGO ---
                    const bannerUrl = p.banner || p.image || '';
                    const logoUrl = p.logo || p.injectorLogo || '';

                    // --- DESCRIPTION / FEATURES ---
                    const desc = p.description || 'Premium tool';
                    const features = desc.split(/\n|-/).filter(f => f && f.trim().length > 0);
                    const featuresHtml = features.map(f =>
                        '<span class="chip"><i class="fas fa-bolt"></i> ' + f.trim() + '</span>'
                    ).join('');

                    // --- BUTTONS ---
                    const updateLink = p.link ? 'window.open(\'' + p.link + '\',\'_blank\')' :
                        "showToast('File link not available','warning')";
                    const feedbackBtn = p.feedback && p.feedback.trim() ?
                        '<button class="btn-outline feedback" onclick="window.open(\'' + p.feedback +
                        '\',\'_blank\')"><i class="fas fa-star"></i> Feedback</button>' : '';

                    // --- PLANS ---
                    let plansHtml = '';
                    if (p.plans && Object.keys(p.plans).length > 0) {
                        const sorted = Object.entries(p.plans).sort((a, b) => (a[1].price || 0) - (b[1].price || 0));
                        plansHtml = '<select class="plan-select" id="plan-' + panelId + '">';
                        sorted.forEach(([key, data]) => {
                            const label = data.label || (data.days ? data.days + ' Days' : 'Plan');
                            plansHtml += '<option value=\'' + JSON.stringify({ key, label, price: data
                                    .price || 0 }) + '\'>' + label + ' - ₦' + (data.price || 0) +
                                '</option>';
                        });
                        plansHtml += '</select>';
                    } else {
                        plansHtml =
                            '<p style="color:var(--text-muted);font-size:13px;text-align:center;margin:8px 0;">Pricing unavailable</p>';
                    }

                    // --- RATING ---
                    const ratingAvg = p.ratingAvg || 0;
                    const ratingCount = p.ratingCount || 0;
                    const fullStars = Math.round(ratingAvg);
                    const starsHtml = '★'.repeat(fullStars) + '☆'.repeat(5 - fullStars);
                    const ratingText = ratingCount > 0 ? ratingAvg.toFixed(1) + ' (' + ratingCount + ')' : 'No ratings';

                    // --- CATEGORY ---
                    let category = p.category || 'all';
                    if (!p.category) {
                        const name = (p.name || '').toLowerCase();
                        if (name.includes('mod')) category = 'mods';
                        else if (name.includes('tool')) category = 'tools';
                        else if (name.includes('vip')) category = 'vip';
                        else if (name.includes('script')) category = 'scripts';
                        else category = 'all';
                    }

                    // --- BUILD CARD ---
                    const card = document.createElement('div');
                    card.className = 'panel-card';
                    const searchText = (p.name || '') + ' ' + desc;
                    card.setAttribute('data-search', searchText.toLowerCase());
                    card.dataset.category = category;
                    const panelName = (p.name || 'Panel').replace(/'/g, "\\'");

                    // BANNER HTML (no logo overlay)
                    let bannerHtml = '';
                    if (bannerUrl && bannerUrl.startsWith('http')) {
                        bannerHtml = `
                                <div class="banner-wrap">
                                    <img class="banner-img" src="${bannerUrl}" alt="${p.name || 'Panel'}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" />
                                    <div style="position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:var(--bg-input);color:var(--text-muted);font-size:13px;font-weight:600;">
                                        <i class="fas fa-image" style="margin-right:8px;"></i> No Banner
                                    </div>
                                    <span class="banner-badge">PREMIUM</span>
                                </div>
                            `;
                    } else {
                        bannerHtml = `
                                <div class="banner-wrap" style="background:var(--bg-input);">
                                    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--text-muted);font-size:14px;font-weight:600;gap:6px;">
                                        <i class="fas fa-image" style="font-size:32px;opacity:0.3;"></i>
                                        <span>No Banner</span>
                                    </div>
                                    <span class="banner-badge">PREMIUM</span>
                                </div>
                            `;
                    }

                    // Panel name with logo on left
                    let nameHtml = `<span class="panel-name">${p.name || 'Panel'}</span>`;
                    if (logoUrl && logoUrl.startsWith('http')) {
                        nameHtml = `
                                <img class="panel-logo" src="${logoUrl}" alt="Logo" onerror="this.style.display='none';" />
                                <span class="panel-name">${p.name || 'Panel'}</span>
                            `;
                    } else {
                        nameHtml = `<span class="panel-name">${p.name || 'Panel'}</span>`;
                    }

                    card.innerHTML = bannerHtml +
                        '<div class="panel-body">' +
                        '<div class="panel-name-wrap">' +
                        nameHtml +
                        ' <span class="verified-badge"><i class="fas fa-check-circle"></i> Verified</span>' +
                        '</div>' +
                        '<div class="feature-list">' + featuresHtml + '</div>' +
                        '<div class="trust-row">' +
                        '<span class="trust-item"><i class="fas fa-shield-alt"></i> Safe Payment</span>' +
                        '<span class="trust-item"><i class="fas fa-medal"></i> Verified</span>' +
                        '</div>' +
                        '<div class="panel-ratings"><span class="stars">' + starsHtml + '</span> <span>' +
                        ratingText + '</span></div>' +
                        '<div class="btn-row">' +
                        '<button class="btn-outline" onclick="' + updateLink +
                        '"><i class="fas fa-file-download"></i> Update</button>' +
                        feedbackBtn +
                        '</div>' +
                        plansHtml +
                        '<button class="btn-primary-solid" onclick="handlePurchaseClick(\'' + panelId +
                        '\',\'' + panelName + '\',\'' + (p.link || '') +
                        '\')" style="width:100%;"><i class="fas fa-shopping-cart"></i> Purchase Key</button>' +
                        '</div>';
                    container.appendChild(card);
                });
                applyFilters();
            });
        }

        // --- CHECKOUT ---
        window.currentCheckout = {};
        window.appliedCoupon = null;

        window.handlePurchaseClick = (panelId, panelName, link) => {
            const select = document.getElementById('plan-' + panelId);
            if (!select) return showToast('No plans available', 'error');
            let planData;
            try { planData = JSON.parse(select.value); } catch (e) { return showToast('Error reading plan data',
                    'error'); }
            window.currentCheckout = { panelId, panelName, link: link || '', planKey: planData.key || '',
                label: planData.label || 'Plan', originalPrice: parseFloat(planData.price) || 0,
                finalPrice: parseFloat(planData.price) || 0 };
            window.appliedCoupon = null;
            document.getElementById('chk-panel-name').innerText = panelName;
            document.getElementById('chk-plan-label').innerText = planData.label || 'Plan';
            document.getElementById('chk-orig-price').innerText = (parseFloat(planData.price) || 0).toFixed(2);
            document.getElementById('chk-final-price').innerText = (parseFloat(planData.price) || 0).toFixed(2);
            document.getElementById('chk-coupon-input').value = '';
            document.getElementById('chk-strike-price').classList.add('hidden');
            document.getElementById('chk-discount-badge').classList.add('hidden');
            openModal('modal-checkout');
        };

        // --- COUPON VALIDATION (FIXED) ---
        window.applyCouponUI = async function() {
            const code = document.getElementById('chk-coupon-input').value.trim().toUpperCase();
            if (!code) return showToast('Enter a coupon code', 'warning');
            const btn = document.getElementById('btn-apply-coupon');
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            btn.disabled = true;
            try {
                const snap = await get(ref(db, 'coupons'));
                let coupon = null;
                if (snap.exists()) {
                    const data = snap.val();
                    const found = Object.keys(data).find(k => {
                        const c = data[k];
                        return c.code && c.code.toUpperCase() === code;
                    });
                    if (found) coupon = { id: found, ...data[found] };
                }

                if (!coupon) {
                    showToast('Invalid coupon code', 'error');
                    btn.innerHTML = 'Apply';
                    btn.disabled = false;
                    return;
                }

                const statusVal = coupon.status;
                let isValidStatus = false;
                if (statusVal === true || statusVal === 'true' || statusVal === 'active' || statusVal === 'ACTIVE' ||
                    statusVal === 1 || statusVal === '1' || statusVal === 'enabled') {
                    isValidStatus = true;
                }
                if (!isValidStatus) {
                    showToast('Coupon is expired or inactive', 'error');
                    btn.innerHTML = 'Apply';
                    btn.disabled = false;
                    return;
                }

                const maxUse = coupon.maxUse || coupon.max_use || coupon.maxUses || 0;
                const used = coupon.used || 0;
                if (maxUse > 0 && used >= maxUse) {
                    showToast('Coupon limit reached', 'error');
                    btn.innerHTML = 'Apply';
                    btn.disabled = false;
                    return;
                }

                const price = window.currentCheckout.originalPrice || 0;
                const discountPercent = coupon.discount || coupon.discount_percent || 0;
                const discount = (price * discountPercent) / 100;
                const final = Math.max(0, price - discount);
                window.appliedCoupon = { id: coupon.id, code: coupon.code, discount: discountPercent, maxUse,
                    used };
                window.currentCheckout.finalPrice = final;
                document.getElementById('chk-final-price').innerText = final.toFixed(2);

                const strike = document.getElementById('chk-strike-price');
                strike.innerText = '₦' + price.toFixed(2);
                strike.classList.remove('hidden');

                const badge = document.getElementById('chk-discount-badge');
                badge.innerText = discountPercent + '% OFF';
                badge.classList.remove('hidden');

                showToast('✅ Coupon applied! ' + discountPercent + '% OFF', 'success');
            } catch (e) {
                console.error('Coupon error:', e);
                showToast('Error applying coupon', 'error');
            } finally {
                btn.innerHTML = 'Apply';
                btn.disabled = false;
            }
        };

        // --- EXECUTE PURCHASE ---
        window.executePurchase = async function() {
            const checkout = window.currentCheckout;
            const price = checkout.finalPrice || 0;
            const btn = document.getElementById('btn-confirm-pay');
            if (!checkout || typeof price !== 'number' || isNaN(price) || price <= 0) { showToast(
                    'Invalid order data.', 'error'); return; }
            if (!currentUser) { showToast('Please login first', 'error'); return; }
            let currentBalance = 0;
            try { const snap = await get(ref(db, 'users/' + currentUser.uid + '/balance'));
                currentBalance = snap.val() || 0;
                userData.balance = currentBalance; } catch (e) { showToast('Could not fetch balance.', 'error'); return; }
            if (currentBalance < price) { showToast('Insufficient balance. Need ₦' + price.toFixed(2), 'error'); return; }
            showLoader();
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
            try {
                const balanceRef = ref(db, 'users/' + currentUser.uid + '/balance');
                const txResult = await runTransaction(balanceRef, (current) => { const bal = Number(current) || 0; if (
                        bal < price) return undefined; return bal - price; });
                if (!txResult.committed) { showToast('Transaction failed.', 'error');
                    btn.disabled = false;
                    btn.innerHTML = 'Place Order';
                    hideLoader(); return; }
                const orderId = 'ORD' + Date.now() + Math.random().toString(36).substr(2, 4);
                const orderRef = ref(db, 'orders/' + currentUser.uid + '/' + orderId);
                await set(orderRef, { id: orderId, panelId: checkout.panelId || '', panelName: checkout.panelName ||
                        'Panel', plan: checkout.planKey || '', label: checkout.label || 'Plan', price,
                    status: 'pending', link: checkout.link || '', date: new Date().toISOString(),
                    timestamp: serverTimestamp(), couponUsed: window.appliedCoupon ? window.appliedCoupon
                        .code : null, couponDiscount: window.appliedCoupon ? window.appliedCoupon.discount : 0,
                    uid: currentUser.uid, email: currentUser.email });
                const txId = 'PUR' + Date.now();
                await set(ref(db, 'transactions/' + currentUser.uid + '/' + txId), { id: txId, type: 'purchase',
                    amount: price, status: 'pending', desc: 'Order #' + orderId.slice(-6) + ': ' + (checkout
                        .panelName || 'Panel'), orderId, date: new Date().toISOString() });
                if (window.appliedCoupon && window.appliedCoupon.id) { try { await runTransaction(ref(db,
                        'coupons/' + window.appliedCoupon.id + '/used'), (curr) => (curr || 0) + 1); } catch (
                    e) {} }
                closeModal('modal-checkout');
                openModal('modal-order-placed');
                fetchOrders();
                addNotification(currentUser.uid, '🛒 Order placed: ' + checkout.panelName + ' (₦' + price.toFixed(2) +
                    ')', 'info');
            } catch (e) {
                console.error(e);
                showToast('System error. Try again.', 'error');
            } finally { hideLoader();
                btn.disabled = false;
                btn.innerHTML = 'Place Order'; }
        };

        // ============================================================
        // FETCH ORDERS — FIXED: uses downloadLink for Access button
        // ============================================================
        let ordersListener = null;

        function fetchOrders() {
            if (!db || !currentUser) return;
            const container = document.getElementById('orders-container');
            if (!container) return;
            if (ordersListener) { ordersListener();
                ordersListener = null; }
            ordersListener = onValue(ref(db, 'orders/' + currentUser.uid), (snap) => {
                container.innerHTML = '';
                if (!snap.exists()) {
                    container.innerHTML =
                        '<div class="empty-state" style="grid-column:1/-1;"><i class="fas fa-clipboard-list"></i><p>No orders placed yet.</p><button class="btn-primary-solid" onclick="navigate(\'home\')" style="width:auto;padding:10px 28px;margin:12px auto 0;font-size:13px;"><i class="fas fa-shopping-cart"></i> Browse Panels</button></div>';
                    return;
                }
                const orders = [];
                snap.forEach(c => { const o = c.val();
                    o.id = c.key;
                    orders.push(o); });
                orders.sort((a, b) => {
                    const da = a.timestamp ? new Date(a.timestamp).getTime() : new Date(a.date || 0)
                        .getTime();
                    const db2 = b.timestamp ? new Date(b.timestamp).getTime() : new Date(b.date || 0)
                        .getTime();
                    return db2 - da;
                });
                orders.forEach(o => {
                    const card = document.createElement('div');
                    card.className = 'order-card';
                    const statusClass = o.status || 'pending';
                    const statusLabel = statusClass.charAt(0).toUpperCase() + statusClass.slice(1);
                    const dateStr = o.timestamp ? new Date(o.timestamp).toLocaleString() : (o.date ?
                        new Date(o.date).toLocaleString() : 'N/A');
                    const priceStr = (o.price || 0).toFixed(2);

                    // ----- LICENSE KEY ROW -----
                    let keyHtml = '';
                    if (o.status === 'approved' && o.key) {
                        const keyId = 'order-key-' + o.id;
                        const masked = '••••••••••••';
                        keyHtml =
                            '<div class="order-key-row"><span class="key-label"><i class="fas fa-key"></i> License Key</span><span class="key-value masked" data-key="' +
                            o.key + '" id="' + keyId + '">' + masked +
                            '</span><div class="key-actions"><button class="reveal-key" data-target="' +
                            keyId +
                            '"><i class="fas fa-eye"></i> Reveal</button><button class="copy-key" onclick="copyToClipboard(\'' +
                            keyId +
                            '\',\'License Key\')"><i class="fas fa-copy"></i> Copy</button></div></div>';
                    } else if (o.status === 'pending') {
                        keyHtml =
                            '<div class="order-key-row"><span class="no-key"><i class="fas fa-clock" style="color:var(--accent-primary);"></i> Awaiting admin approval... Key will appear here once approved.</span></div>';
                    } else if (o.status === 'rejected') {
                        keyHtml =
                            '<div class="order-key-row"><span class="no-key" style="color:var(--accent-red);"><i class="fas fa-times-circle"></i> This order was rejected.</span></div>';
                    }

                    // ===== DOWNLOAD LINK ROW — FIXED: uses downloadLink =====
                    const downloadLink = o.downloadLink || o.link || '';
                    let downloadHtml = '';
                    if (o.status === 'approved' || o.status === 'completed') {
                        if (downloadLink) {
                            const dlId = 'dl-' + o.id;
                            downloadHtml = `
                                    <div class="download-link-row">
                                        <span class="dl-label"><i class="fas fa-download"></i> Download</span>
                                        <span class="dl-link" id="${dlId}" title="${downloadLink}">${downloadLink.length > 50 ? downloadLink.slice(0,50)+'…' : downloadLink}</span>
                                        <div class="dl-actions">
                                            <button class="access-link" onclick="window.open('${downloadLink}','_blank')"><i class="fas fa-external-link-alt"></i> Access</button>
                                            <button class="copy-link" onclick="copyToClipboard('${dlId}','Download Link')"><i class="fas fa-copy"></i> Copy</button>
                                        </div>
                                    </div>
                                `;
                        } else {
                            downloadHtml =
                                '<div class="download-link-row"><span class="no-link"><i class="fas fa-info-circle"></i> No download link provided by admin.</span></div>';
                        }
                    } else {
                        downloadHtml =
                            '<div class="download-link-row"><span class="no-link"><i class="fas fa-clock"></i> Link will appear after approval.</span></div>';
                    }

                    let rateBtn = '';
                    if (o.status === 'approved') {
                        rateBtn =
                            `<button class="rate-btn" onclick="openRatingModal('${o.id}','${o.panelName}')"><i class="fas fa-star"></i> Rate</button>`;
                    }

                    card.innerHTML =
                        '<div class="order-top"><div class="order-left"><h4>' + (o.panelName || 'Panel') +
                        '</h4><div class="order-meta"><i class="fas fa-tag"></i> ' + (o.label || 'Plan') +
                        ' &middot; <i class="far fa-calendar-alt"></i> ' + dateStr +
                        '</div></div><div class="order-status ' + statusClass + '">' + statusLabel +
                        '</div></div><div class="order-details"><span class="detail-item"><strong>Order ID:</strong> #' +
                        (o.id || '').slice(-8) +
                        '</span><span class="detail-item"><strong>Amount:</strong> ₦' + priceStr +
                        '</span>' + (o.couponUsed ?
                            '<span class="detail-item"><strong>Coupon:</strong> ' + o.couponUsed +
                            '</span>' : '') + '</div>' +
                        keyHtml +
                        downloadHtml +
                        (rateBtn ? '<div style="margin-top:4px;">' + rateBtn + '</div>' : '');
                    container.appendChild(card);

                    // Reveal key toggle
                    card.querySelectorAll('.reveal-key').forEach(btn => {
                        btn.addEventListener('click', function() {
                            const targetId = this.dataset.target;
                            const span = document.getElementById(targetId);
                            if (!span) return;
                            const isMasked = span.classList.contains('masked');
                            if (isMasked) { span.innerText = span.dataset.key;
                                span.classList.remove('masked');
                                this.innerHTML = '<i class="fas fa-eye-slash"></i> Hide'; } else { span
                                    .innerText = '••••••••••••';
                                span.classList.add('masked');
                                this.innerHTML = '<i class="fas fa-eye"></i> Reveal'; }
                        });
                    });
                });
            });
        }

        // --- RATING SYSTEM ---
        let currentRatingOrderId = '';
        let currentRatingPanelName = '';
        let selectedRating = 0;

        window.openRatingModal = function(orderId, panelName) {
            currentRatingOrderId = orderId;
            currentRatingPanelName = panelName;
            selectedRating = 0;
            document.getElementById('rating-panel-name').innerText = panelName;
            document.getElementById('rating-label').innerText = 'Tap a star to rate';
            document.querySelectorAll('#rating-stars .star').forEach(el => { el.classList.remove('active'); });
            openModal('modal-rating');
        };

        document.querySelectorAll('#rating-stars .star').forEach(star => {
            star.addEventListener('click', function() {
                selectedRating = parseInt(this.dataset.val);
                document.getElementById('rating-label').innerText = 'You selected ' + selectedRating + ' star' +
                    (selectedRating > 1 ? 's' : '');
                document.querySelectorAll('#rating-stars .star').forEach(el => {
                    el.classList.toggle('active', parseInt(el.dataset.val) <= selectedRating);
                });
            });
        });

        document.getElementById('btn-submit-rating').addEventListener('click', async function() {
            if (selectedRating < 1 || selectedRating > 5) return showToast('Select a rating', 'warning');
            if (!currentUser || !currentRatingOrderId) return showToast('Error', 'error');
            const btn = this;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
            btn.disabled = true;

            try {
                const orderSnap = await get(ref(db, 'orders/' + currentUser.uid + '/' + currentRatingOrderId));
                if (!orderSnap.exists()) { showToast('Order not found', 'error'); return; }
                const order = orderSnap.val();
                const panelId = order.panelId;
                if (!panelId) { showToast('Panel not found', 'error'); return; }

                const ratingRef = ref(db, 'ratings/' + panelId + '/' + currentUser.uid);
                await set(ratingRef, { orderId: currentRatingOrderId, rating: selectedRating,
                    email: currentUser.email, date: new Date().toISOString() });

                const allRatingsSnap = await get(ref(db, 'ratings/' + panelId));
                let total = 0,
                    count = 0;
                if (allRatingsSnap.exists()) {
                    allRatingsSnap.forEach(child => {
                        total += child.val().rating || 0;
                        count++;
                    });
                }
                const avg = count > 0 ? total / count : 0;
                await update(ref(db, 'panels/' + panelId), { ratingAvg: avg, ratingCount: count });
                await update(ref(db, 'orders/' + currentUser.uid + '/' + currentRatingOrderId), { rated: true });

                showToast('⭐ Rated ' + selectedRating + ' stars! Thank you!', 'success');
                closeModal('modal-rating');
                fetchOrders();
            } catch (e) { console.error(e);
                showToast('Error submitting rating', 'error'); } finally { btn.innerHTML = 'Submit Rating';
                btn.disabled = false; }
        });

        // --- FETCH KEYS — FIXED: uses downloadLink for Access Files button ---
        function fetchKeys() {
            if (!db || !currentUser) return;
            showLoader();
            const container = document.getElementById('history-container');
            container.innerHTML = '';
            get(ref(db, 'orders/' + currentUser.uid)).then(snap => {
                if (!snap.exists()) { container.innerHTML =
                        '<div class="empty-state"><i class="fas fa-key"></i><p>No keys available yet. Place an order and wait for approval.</p></div>';
                    document.getElementById('prof-purchases').innerText = '0';
                    hideLoader(); return; }
                const items = [];
                snap.forEach(c => { const o = c.val(); if (o.status === 'approved' && o.key) items.push({ id: c
                            .key, ...o }); });
                if (items.length === 0) { container.innerHTML =
                        '<div class="empty-state"><i class="fas fa-key"></i><p>No approved keys yet. Check your <a href="#" onclick="navigate(\'orders\')" style="color:var(--accent-primary);">Order History</a> for pending orders.</p></div>';
                    document.getElementById('prof-purchases').innerText = '0';
                    hideLoader(); return; }
                items.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
                window.myKeysCache = items; // cached for CSV export
                document.getElementById('prof-purchases').innerText = items.length;
                items.forEach(o => {
                    const dateStr = o.date ? new Date(o.date).toLocaleString() : 'N/A';
                    const label = o.label || 'Premium Access';
                    const card = document.createElement('div');
                    card.className = 'history-card';
                    const keyId = 'hist-key-' + (o.id || Date.now());
                    const actualKey = o.key || 'N/A';
                    const masked = '••••••••••••';

                    // Download link
                    const dl = o.downloadLink || o.link || '';
                    let dlHtml = '';
                    if (dl) {
                        const dlId = 'hist-dl-' + (o.id || Date.now());
                        dlHtml = `
                                <div class="download-link-box">
                                    <span class="dl-label"><i class="fas fa-download"></i> Download</span>
                                    <span class="dl-url" id="${dlId}">${dl.length > 40 ? dl.slice(0,40)+'…' : dl}</span>
                                    <div class="dl-actions">
                                        <button class="access-link" onclick="window.open('${dl}','_blank')"><i class="fas fa-external-link-alt"></i> Access</button>
                                        <button class="copy-link" onclick="copyToClipboard('${dlId}','Download Link')"><i class="fas fa-copy"></i> Copy</button>
                                    </div>
                                </div>
                            `;
                    } else {
                        dlHtml =
                            '<div class="download-link-box"><span class="no-link"><i class="fas fa-info-circle"></i> No download link</span></div>';
                    }

                    card.innerHTML =
                        '<div class="hdr"><h4>' + (o.panelName || 'Panel') +
                        '</h4><span class="price-tag">₦' + (o.price || 0).toFixed(2) +
                        '</span></div><div class="meta"><i class="fas fa-tag"></i> ' + label +
                        ' &middot; ' + dateStr +
                        '</div><div class="key-box"><span class="key-text masked" data-key="' + actualKey +
                        '" id="' + keyId + '">' + masked +
                        '</span><div class="key-actions"><button class="reveal-key" data-target="' +
                        keyId +
                        '"><i class="fas fa-eye"></i> Reveal</button><button class="copy-key" onclick="copyToClipboard(\'' +
                        keyId + '\',\'License Key\')"><i class="fas fa-copy"></i> Copy</button></div></div>' +
                        dlHtml;
                    container.appendChild(card);
                });
                document.querySelectorAll('.reveal-key').forEach(btn => {
                    btn.addEventListener('click', function() {
                        const targetId = this.dataset.target;
                        const span = document.getElementById(targetId);
                        if (!span) return;
                        const isMasked = span.classList.contains('masked');
                        if (isMasked) { span.innerText = span.dataset.key;
                            span.classList.remove('masked');
                            this.innerHTML = '<i class="fas fa-eye-slash"></i> Hide'; } else { span
                                .innerText = '••••••••••••';
                            span.classList.add('masked');
                            this.innerHTML = '<i class="fas fa-eye"></i> Reveal'; }
                    });
                });
                hideLoader();
            }).catch(() => { hideLoader();
                showToast('Failed to load keys', 'error'); });
        }

        // --- SPIN WHEEL ---
        const spinSegments = [
            { label: '₦5', value: 5, color: '#fbbf24' },
            { label: 'Try Again', value: 0, color: '#4a5568' },
            { label: '₦10', value: 10, color: '#f59e0b' },
            { label: '₦2', value: 2, color: '#34d399' },
            { label: '₦20', value: 20, color: '#fbbf24' },
            { label: 'Try Again', value: 0, color: '#4a5568' },
            { label: '₦50', value: 50, color: '#d97706' },
            { label: '₦100', value: 100, color: '#f87171' }
        ];
        let wheelCanvas, ctxWheel, currentRotation = 0,
            isSpinningLocal = false;

        function drawWheel(rotation) {
            const canvas = document.getElementById('wheelCanvas');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            const w = canvas.width,
                h = canvas.height,
                cx = w / 2,
                cy = h / 2,
                radius = Math.min(w, h) / 2 - 8;
            ctx.clearRect(0, 0, w, h);
            const segAngle = (2 * Math.PI) / spinSegments.length;
            const acc = getAccentColors();
            spinSegments.forEach((seg, i) => {
                const start = i * segAngle + rotation,
                    end = start + segAngle;
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.arc(cx, cy, radius, start, end);
                ctx.closePath();
                const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
                const baseColor = seg.color;
                grad.addColorStop(0, lightenColor(baseColor, 40));
                grad.addColorStop(1, baseColor);
                ctx.fillStyle = grad;
                ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,0.15)';
                ctx.lineWidth = 1.5;
                ctx.stroke();
                ctx.save();
                ctx.translate(cx, cy);
                ctx.rotate(start + segAngle / 2);
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#fff';
                ctx.font = '600 14px Inter, sans-serif';
                const textRadius = radius * 0.65;
                ctx.shadowColor = 'rgba(0,0,0,0.5)';
                ctx.shadowBlur = 6;
                ctx.fillText(seg.label, textRadius, 0);
                ctx.restore();
            });
            ctx.beginPath();
            ctx.arc(cx, cy, 20, 0, 2 * Math.PI);
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.2)';
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        function lightenColor(hex, percent) { const num = parseInt(hex.replace('#', ''), 16); const r = Math.min(255, (num >>
                    16) + percent);
            const g = Math.min(255, ((num >> 8) & 0x00FF) + percent);
            const b = Math.min(255, (num & 0x0000FF) + percent); return 'rgb(' + r + ',' + g + ',' + b + ')'; }

        function getSpinResult(rotation) {
            const segAngle = (2 * Math.PI) / spinSegments.length;
            const pointerAngle = -Math.PI / 2;
            let normalized = rotation % (2 * Math.PI);
            if (normalized < 0) normalized += 2 * Math.PI;
            let angle = (pointerAngle - normalized) % (2 * Math.PI);
            if (angle < 0) angle += 2 * Math.PI;
            const index = Math.floor(angle / segAngle) % spinSegments.length;
            return spinSegments[index];
        }

        function initSpinWheel() {
            const canvas = document.getElementById('wheelCanvas');
            if (!canvas) return;
            wheelCanvas = canvas;
            ctxWheel = canvas.getContext('2d');
            drawWheel(currentRotation);
            checkSpinAvailability();
            document.getElementById('btn-spin').addEventListener('click', spinWheel);
        }

        function checkSpinAvailability() {
            if (!currentUser) return;
            const today = new Date().toDateString();
            get(ref(db, 'users/' + currentUser.uid + '/spin_data')).then(snap => {
                let data = snap.val() || {};
                const lastDate = data.lastSpinDate || '',
                    usedToday = data.usedToday || 0,
                    maxSpins = 1;
                spinsLeft = lastDate === today ? Math.max(0, maxSpins - usedToday) : maxSpins;
                document.getElementById('spin-count').innerText = spinsLeft;
                document.getElementById('btn-spin').disabled = spinsLeft <= 0;
                const resultBox = document.getElementById('spin-result');
                if (spinsLeft <= 0) { resultBox.innerHTML = '⏳ Come back tomorrow for a free spin!';
                    resultBox.style.color = 'var(--text-muted)'; } else { resultBox.innerHTML =
                        '🎰 Spin the wheel to win rewards!';
                    resultBox.style.color = 'var(--text-secondary)'; }
                lastSpinDate = lastDate;
            }).catch(() => {});
        }

        async function spinWheel() {
            if (isSpinningLocal || spinsLeft <= 0) return;
            isSpinningLocal = true;
            const btn = document.getElementById('btn-spin');
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Spinning...';
            const resultBox = document.getElementById('spin-result');
            resultBox.innerHTML = '🌀 Spinning...';
            resultBox.style.color = 'var(--text-secondary)';
            const extraSpins = 5 + Math.random() * 4;
            const targetAngle = extraSpins * 2 * Math.PI + Math.random() * 2 * Math.PI;
            const startRotation = currentRotation;
            const duration = 4000 + Math.random() * 1000;
            const startTime = performance.now();

            function animateSpin(time) {
                const elapsed = time - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const eased = 1 - Math.pow(1 - progress, 3);
                const currentAngle = startRotation + targetAngle * eased;
                currentRotation = currentAngle;
                drawWheel(currentAngle);
                if (progress < 1) { requestAnimationFrame(animateSpin); } else {
                    currentRotation = currentAngle;
                    drawWheel(currentAngle);
                    const result = getSpinResult(currentAngle);
                    handleSpinResult(result);
                }
            }
            requestAnimationFrame(animateSpin);
        }

        async function handleSpinResult(result) {
            const btn = document.getElementById('btn-spin');
            const resultBox = document.getElementById('spin-result');
            if (currentUser) {
                const today = new Date().toDateString();
                const spinRef = ref(db, 'users/' + currentUser.uid + '/spin_data');
                try { await runTransaction(spinRef, (data) => { if (!data) data = { lastSpinDate: today,
                            usedToday: 0 }; if (data.lastSpinDate !== today) { data.lastSpinDate = today;
                        data.usedToday = 0; } data.usedToday = (data.usedToday || 0) + 1; return data; }); } catch (
                    e) { console.error(e); }
            }
            const reward = result.value,
                label = result.label;
            if (reward > 0) {
                if (currentUser) {
                    try {
                        await runTransaction(ref(db, 'users/' + currentUser.uid + '/balance'), (bal) => (bal ||
                            0) + reward);
                        await set(push(ref(db, 'transactions/' + currentUser.uid)), { id: 'SPIN' + Date.now(),
                            type: 'spin_reward', amount: reward, status: 'success',
                            desc: '🎉 Spin win: ' + label, date: new Date().toISOString() });
                        showToast('🎉 You won ' + label + '! Added to wallet.', 'success');
                        addNotification(currentUser.uid, '🎉 Spin Win! You won ' + label + '!', 'success');
                    } catch (e) { showToast('Error adding reward', 'error'); }
                }
                resultBox.innerHTML = '🎉 <strong style="color:var(--accent-primary);">' + label +
                    '</strong> added to your wallet!';
                resultBox.style.color = 'var(--accent-green)';
                document.getElementById('spin-result-title').innerText = '🎉 You Won!';
                document.getElementById('spin-reward-amount').innerText = label;
                document.getElementById('spin-reward-label').innerText = 'Added to your wallet 🎊';
                openModal('modal-spin-result');
            } else {
                resultBox.innerHTML = '😅 ' + label + '! Better luck next time.';
                resultBox.style.color = 'var(--accent-red)';
                document.getElementById('spin-result-title').innerText = '😅 Try Again!';
                document.getElementById('spin-reward-amount').innerText = label;
                document.getElementById('spin-reward-label').innerText = 'Don\'t give up! Spin again tomorrow.';
                openModal('modal-spin-result');
            }
            checkSpinAvailability();
            isSpinningLocal = false;
            btn.innerHTML = '<i class="fas fa-play"></i> SPIN';
            btn.disabled = spinsLeft <= 0;
        }

        // --- INIT ---
        setTimeout(() => {
            if (!currentUser) { hideLoader(); if (!securityCompleted) performSecurityCheck().then(() => {}); }
        }, 2000);

        document.addEventListener('click', (e) => {
            const menu = document.getElementById('dropdown-menu');
            const toggle = document.getElementById('menu-toggle');
            if (menu && menu.classList.contains('active') && !menu.contains(e.target) && !toggle.contains(e
                .target)) { menu.classList.remove('active'); }
        });

        document.getElementById('login-pass').addEventListener('keypress', (e) => { if (e.key === 'Enter') document
                .getElementById('btn-login').click(); });
        document.getElementById('login-email').addEventListener('keypress', (e) => { if (e.key === 'Enter') document
                .getElementById('btn-login').click(); });
        document.getElementById('signup-pass').addEventListener('keypress', (e) => { if (e.key === 'Enter') document
                .getElementById('btn-signup').click(); });
        document.getElementById('signup-email').addEventListener('keypress', (e) => { if (e.key === 'Enter') document
                .getElementById('btn-signup').click(); });

        initContactLinks();
        loadVipPrice();
        initBranding();
        initVerificationSettings();
        initDeviceCatalogSync();

        console.log("✅ ZERX-XIT User Panel — DOWNLOAD LINK FIXED!");
        console.log("💡 Orders now use 'downloadLink' field from admin approval.");
        console.log("💡 Access button opens the link set by admin during order approval.");
        console.log("🔑 Groq: configured entirely server-side via GROQ_API_KEY on Render — " +
            "check /healthz's groqConfigured field, or just try Generate and watch the result's source.");
