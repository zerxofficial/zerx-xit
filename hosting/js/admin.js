        import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
        import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
        import { getDatabase, ref, get, set, update, remove, push, runTransaction, query, limitToLast, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

        console.log("🚀 ZERX-XIT Admin Panel");

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
        const ALLOWED_ADMINS = ["zerxofficial444@gmail.com"];
        // SECURITY NOTE: this allowlist only hides the admin UI on the client.
        // It does NOT stop a signed-in non-admin from reading/writing admin-only
        // paths directly through the Firebase REST/SDK API. Mirror this same
        // check in your Firebase Realtime Database security rules (e.g. via a
        // custom claim or an `admins/{uid}` node checked in `.read`/`.write`
        // rules) so enforcement doesn't rely on this file alone.

        // Escapes user-supplied text before it is inserted with innerHTML, to
        // prevent stored XSS from values a user controls (email, review text,
        // etc.) that get rendered back out in this admin panel.
        function escapeHtml(str) {
            return String(str ?? '').replace(/[&<>"']/g, ch => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
            }[ch]));
        }

        function friendlyAuthError(e) {
            const code = e && e.code ? e.code : '';
            const map = {
                'auth/network-request-failed': "Can't reach the server. Check your internet connection (or turn off any VPN/Private DNS) and try again.",
                'auth/invalid-credential': 'Incorrect email or password.',
                'auth/wrong-password': 'Incorrect email or password.',
                'auth/user-not-found': 'No account found with that email.',
                'auth/invalid-email': "That doesn't look like a valid email address.",
                'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
                'auth/user-disabled': 'This account has been disabled.'
            };
            return map[code] || e?.message || 'Something went wrong. Please try again.';
        }

        // Always an object, never undefined, so branding save/upload/remove
        // can safely read and write currentBranding.logo even before the
        // 'settings/branding' node exists in the database yet.
        window.currentBranding = {};

        let app, auth, db;
        try {
            app = initializeApp(firebaseConfig);
            auth = getAuth(app);
            db = getDatabase(app);
            console.log("✅ Firebase initialized successfully.");
        } catch (e) {
            console.error("❌ Firebase init error:", e);
            document.getElementById('loader').innerHTML =
                `<div style="color:red;text-align:center;padding:20px;">Firebase initialization failed. Check console.</div>`;
            throw e;
        }

        // --- UTILITIES ---
        window.showLoader = () => {
            const loader = document.getElementById('loader');
            loader.style.display = 'flex';
            loader.style.opacity = '1';
        };
        window.hideLoader = () => {
            const loader = document.getElementById('loader');
            loader.style.opacity = '0';
            setTimeout(() => loader.style.display = 'none', 300);
        };

        window.showToast = (msg, type = 'success') => {
            const container = document.getElementById('toast-container');
            const t = document.createElement('div');
            t.className = 'toast ' + type;
            const icon = type === 'error' ? 'fa-exclamation-circle' : type === 'warning' ? 'fa-exclamation-triangle' :
                'fa-check-circle';
            t.innerHTML = '<i class="fas ' + icon + '"></i> ' + msg;
            container.appendChild(t);
            setTimeout(() => { t.style.opacity = '0';
                t.style.transform = 'translateY(10px)';
                setTimeout(() => t.remove(), 300); }, 2800);
        };

        window.closeModal = (id) => {
            const modal = document.getElementById(id);
            if (modal) modal.closest('.modal-overlay').classList.add('hidden');
        };
        window.openModal = (id) => {
            const modal = document.getElementById(id);
            if (modal) modal.classList.remove('hidden');
        };
        window.openImageModal = (url) => {
            document.getElementById('preview-image').src = url;
            document.getElementById('preview-link').href = url;
            openModal('modal-image');
        };

        function showDashboardError(msg) {
            const errorDiv = document.getElementById('dashboard-error');
            const msgSpan = document.getElementById('error-message');
            if (msgSpan) msgSpan.textContent = msg || 'Unknown error occurred.';
            if (errorDiv) errorDiv.classList.add('show');
            console.error("Dashboard Error:", msg);
        }
        function hideDashboardError() {
            const errorDiv = document.getElementById('dashboard-error');
            if (errorDiv) errorDiv.classList.remove('show');
        }
        window.retryDashboard = function() {
            hideDashboardError();
            loadDashboard();
        };

        // --- AUTH ---
        onAuthStateChanged(auth, async (user) => {
            console.log("Auth state changed:", user ? user.email : "null");
            try {
                if (user && ALLOWED_ADMINS.includes(user.email)) {
                    console.log("✅ Admin logged in:", user.email);
                    document.getElementById('auth-screen').classList.add('hidden');
                    document.getElementById('main-layout').style.display = 'flex';
                    hideLoader();

                    await Promise.all([
                        loadDashboard(),
                        loadUsers(),
                        loadDeposits(),
                        loadOrders(),
                        loadPanels(),
                        loadPromotions(),
                        loadCoupons(),
                        loadReferrals(),
                        loadPaymentSettings(),
                        loadSupportLinks(),
                        loadBranding(),
                        loadAnimationSelection(),
                        loadThemeControl(),
                        loadCategories(),
                        loadRecentNotifications(),
                        loadRatings(),
                        loadAnalytics()
                    ]);

                    navigate('dashboard');
                } else {
                    if (user) {
                        console.warn("⚠️ User not allowed:", user.email);
                        await signOut(auth);
                    }
                    document.getElementById('main-layout').style.display = 'none';
                    document.getElementById('auth-screen').classList.remove('hidden');
                    hideLoader();
                    if (window.animCleanup) { window.animCleanup();
                        window.animCleanup = null; }
                }
            } catch (e) {
                console.error("❌ Critical error in onAuthStateChanged:", e);
                showDashboardError("Failed to load admin panel. Check console (F12).");
                showToast("Error loading admin panel. Check console.", "error");
                hideLoader();
            }
        });

        document.getElementById('btn-login').onclick = async () => {
            const email = document.getElementById('admin-email').value.trim();
            const pass = document.getElementById('admin-pass').value;
            if (!email || !pass) return showToast('Enter credentials', 'error');
            if (!ALLOWED_ADMINS.includes(email)) return showToast('Unauthorized', 'error');
            showLoader();
            try {
                await signInWithEmailAndPassword(auth, email, pass);
            } catch (e) {
                console.error("Login error:", e);
                showToast(friendlyAuthError(e), 'error');
                hideLoader();
            }
        };
        document.getElementById('btn-logout').onclick = async () => {
            showLoader();
            try { await signOut(auth); } catch (e) { console.error(e); }
            hideLoader();
        };

        // --- ANIMATION ENGINE ---
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
            const colors = [
                [251, 191, 36],
                [245, 158, 11],
                [217, 119, 6],
                [252, 211, 77],
                [251, 191, 36]
            ];

            function lerp(a, b, t) { return a + (b - a) * t; }

            function getColor(t) {
                const idx = Math.floor(t * (colors.length - 1));
                const frac = (t * (colors.length - 1)) - idx;
                const c1 = colors[Math.min(idx, colors.length - 1)];
                const c2 = colors[Math.min(idx + 1, colors.length - 1)];
                return { r: lerp(c1[0], c2[0], frac), g: lerp(c1[1], c2[1], frac), b: lerp(c1[2], c2[2], frac) };
            }

            function animate() {
                time += 0.004;
                ctx.clearRect(0, 0, width, height);
                const numLayers = 5,
                    baseY = height * 0.5;
                for (let layer = 0; layer < numLayers; layer++) {
                    const layerOffset = layer / numLayers;
                    const amplitude = 40 + layer * 15;
                    const frequency = 0.008 + layer * 0.003;
                    const speed = 0.003 + layer * 0.0015;
                    const yOffset = layer * 30 - 40;
                    const color = getColor((layerOffset + time * 0.01) % 1);
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
                    grad.addColorStop(0.3, 'rgba(' + color.r + ',' + color.g + ',' + color.b + ',' + (alpha * 0.5) +
                    ')');
                    grad.addColorStop(1, 'rgba(' + color.r + ',' + color.g + ',' + color.b + ',0)');
                    ctx.beginPath();
                    ctx.moveTo(0, height);
                    for (let x = 0; x <= width; x += 2) {
                        const n1 = Math.sin(x * frequency + time * speed) * amplitude;
                        const n2 = Math.sin(x * frequency * 0.7 + time * speed * 1.3 + 1.2) * amplitude * 0.6;
                        const n3 = Math.sin(x * frequency * 0.3 + time * speed * 0.7 + 0.8) * amplitude * 0.3;
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

        const animDefs = {
            aurora: { init: initAurora },
            static: { init: initStatic }
        };

        function switchAnimation(animName) {
            if (window.animCleanup) { window.animCleanup();
                window.animCleanup = null; }
            const def = animDefs[animName] || animDefs.aurora;
            if (def && def.init) {
                setTimeout(() => {
                    const cleanup = def.init();
                    if (cleanup) window.animCleanup = cleanup;
                }, 50);
            }
        }

        // --- NAVIGATION ---
        window.navigate = function(target) {
            console.log("Navigating to:", target);
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            const navItem = document.querySelector(`.nav-item[data-target="${target}"]`);
            if (navItem) navItem.classList.add('active');

            document.querySelectorAll('.page-section').forEach(s => s.classList.add('hidden'));
            const section = document.getElementById('sec-' + target);
            if (section) section.classList.remove('hidden');

            const titles = {
                dashboard: 'Dashboard',
                'add-panel': 'Add Panel',
                'manage-panels': 'Manage Panels',
                deposits: 'Deposits',
                orders: 'Orders',
                users: 'Users',
                verification: 'Verification',
                appeals: 'Appeals',
                devices: 'Devices',
                promotions: 'Promotions',
                coupons: 'Coupons',
                referrals: 'Referrals',
                'theme-control': 'Theme Control',
                'category-control': 'Categories',
                'notification-control': 'Notifications',
                'rating-control': 'Ratings',
                analytics: 'Analytics',
                sensi: 'Sensi Generator',
                payment: 'Payment Settings',
                support: 'Support Links',
                branding: 'Branding',
                animations: 'Animations'
            };
            document.getElementById('page-title').innerHTML = titles[target] || target;

            if (window.innerWidth <= 768) {
                document.getElementById('sidebar').classList.remove('open');
            }

            window.loadSection(target);
        };

        window.loadSection = function(target) {
            console.log("Loading section data:", target);
            switch (target) {
                case 'dashboard':
                    loadDashboard();
                    break;
                case 'users':
                    loadUsers();
                    break;
                case 'deposits':
                    loadDeposits();
                    break;
                case 'orders':
                    loadOrders();
                    break;
                case 'verification':
                    loadVerificationSettings();
                    break;
                case 'appeals':
                    loadAppeals();
                    break;
                case 'devices':
                    loadDevices();
                    break;
                case 'manage-panels':
                    loadPanels();
                    break;
                case 'promotions':
                    loadPromotions();
                    break;
                case 'coupons':
                    loadCoupons();
                    break;
                case 'referrals':
                    loadReferrals();
                    break;
                case 'theme-control':
                    loadThemeControl();
                    break;
                case 'category-control':
                    loadCategories();
                    break;
                case 'notification-control':
                    loadRecentNotifications();
                    break;
                case 'rating-control':
                    loadRatings();
                    break;
                case 'analytics':
                    loadAnalytics();
                    break;
                case 'sensi':
                    loadSensiStats();
                    break;
                case 'payment':
                    loadPaymentSettings();
                    break;
                case 'support':
                    loadSupportLinks();
                    break;
                case 'branding':
                    loadBranding();
                    break;
                case 'animations':
                    loadAnimationSelection();
                    break;
                default:
                    console.warn("No loader for:", target);
            }
        };

        document.querySelectorAll('.nav-item[data-target]').forEach(item => {
            item.addEventListener('click', function(e) {
                const target = this.dataset.target;
                if (target === 'logout') return;
                e.stopPropagation();
                navigate(target);
            });
        });

        // --- SIDEBAR TOGGLE ---
        const sidebar = document.getElementById('sidebar');
        const toggleBtn = document.getElementById('sidebar-toggle');
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebar.classList.toggle('open');
        });
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 768) {
                const isClickInside = sidebar.contains(e.target) || toggleBtn.contains(e.target);
                if (!isClickInside && sidebar.classList.contains('open')) {
                    sidebar.classList.remove('open');
                }
            }
        });

        // ============================================
        // 1. THEME CONTROL
        // ============================================
        async function loadThemeControl() {
            try {
                const snap = await get(ref(db, 'settings/theme'));
                const data = snap.val() || {};
                document.getElementById('theme-mode-select').value = data.mode || 'user-choice';
                document.getElementById('theme-override-select').value = data.override || 'no';
            } catch (e) { console.error("Theme load error:", e); }
        }

        document.getElementById('btn-save-theme-control').addEventListener('click', async () => {
            const mode = document.getElementById('theme-mode-select').value;
            const override = document.getElementById('theme-override-select').value;
            showLoader();
            try {
                await set(ref(db, 'settings/theme'), { mode, override });
                showToast('Theme settings saved!');
                loadThemeControl();
            } catch (e) { showToast('Error saving', 'error'); }
            hideLoader();
        });

        // ============================================
        // 2. CATEGORY CONTROL
        // ============================================
        let categoriesCache = [];

        async function loadCategories() {
            try {
                const snap = await get(ref(db, 'settings/categories'));
                const data = snap.val() || {};
                categoriesCache = data.list || [];
                renderCategories();
            } catch (e) { console.error("Categories load error:", e); }
        }

        function renderCategories() {
            const container = document.getElementById('categories-list');
            if (!categoriesCache.length) {
                container.innerHTML = '<div style="padding:12px;color:var(--text-muted);text-align:center;">No categories added</div>';
                return;
            }
            let html = '';
            categoriesCache.forEach((cat, idx) => {
                html += `
                        <div style="display:flex;align-items:center;gap:10px;background:var(--bg-input);padding:8px 14px;border-radius:var(--radius-sm);border:1px solid var(--border-color);">
                            <span style="flex:1;font-weight:500;">${cat}</span>
                            <button class="btn btn-danger btn-sm" onclick="deleteCategory(${idx})"><i class="fas fa-trash"></i></button>
                        </div>
                    `;
            });
            container.innerHTML = html;
        }

        window.deleteCategory = async (idx) => {
            if (!confirm('Delete category?')) return;
            categoriesCache.splice(idx, 1);
            showLoader();
            try {
                await set(ref(db, 'settings/categories'), { list: categoriesCache });
                showToast('Category deleted');
                renderCategories();
            } catch (e) { showToast('Error', 'error'); }
            hideLoader();
        };

        document.getElementById('btn-add-category').addEventListener('click', async () => {
            const name = document.getElementById('new-category-name').value.trim();
            if (!name) return showToast('Enter category name', 'error');
            categoriesCache.push(name);
            showLoader();
            try {
                await set(ref(db, 'settings/categories'), { list: categoriesCache });
                document.getElementById('new-category-name').value = '';
                showToast('Category added');
                renderCategories();
            } catch (e) { showToast('Error', 'error'); }
            hideLoader();
        });

        // ============================================
        // 3. NOTIFICATION CONTROL
        // ============================================
        document.getElementById('notif-audience').addEventListener('change', function() {
            const group = document.getElementById('notif-email-group');
            if (this.value === 'specific') group.classList.remove('hidden');
            else group.classList.add('hidden');
        });

        document.getElementById('btn-send-notification').addEventListener('click', async () => {
            const msg = document.getElementById('notif-message').value.trim();
            if (!msg) return showToast('Enter a message', 'error');
            const audience = document.getElementById('notif-audience').value;
            const email = document.getElementById('notif-email').value.trim();
            showLoader();

            try {
                if (audience === 'all') {
                    await set(push(ref(db, 'global_notifications')), {
                        message: msg,
                        type: 'admin',
                        timestamp: serverTimestamp()
                    });
                    showToast('Notification sent to all users!');
                } else {
                    const usersSnap = await get(ref(db, 'users'));
                    let uid = null;
                    if (usersSnap.exists()) {
                        usersSnap.forEach(child => {
                            if (child.val().email === email) uid = child.key;
                        });
                    }
                    if (!uid) { showToast('User not found', 'error');
                        hideLoader(); return; }
                    await set(push(ref(db, 'notifications/' + uid)), {
                        message: msg,
                        type: 'admin',
                        read: false,
                        timestamp: serverTimestamp()
                    });
                    showToast('Notification sent to ' + email);
                }
                document.getElementById('notif-message').value = '';
                document.getElementById('notif-email').value = '';
                loadRecentNotifications();
            } catch (e) { showToast('Error sending', 'error'); }
            hideLoader();
        });

        async function loadRecentNotifications() {
            try {
                const snap = await get(query(ref(db, 'global_notifications'), limitToLast(20)));
                const list = [];
                if (snap.exists()) {
                    snap.forEach(c => { const v = c.val();
                        v.id = c.key;
                        list.push(v); });
                }
                list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                const container = document.getElementById('recent-notif-list');
                if (!list.length) {
                    container.innerHTML =
                        '<div style="padding:16px;text-align:center;color:var(--text-muted);">No notifications sent yet.</div>';
                    return;
                }
                let html = '';
                list.slice(0, 10).forEach(n => {
                    const time = n.timestamp ? new Date(n.timestamp).toLocaleString() : 'Now';
                    html += `
                            <div style="background:var(--bg-input);padding:12px 16px;border-radius:var(--radius-sm);border:1px solid var(--border-color);">
                                <div style="font-size:13px;">${escapeHtml(n.message)}</div>
                                <div style="font-size:10px;color:var(--text-muted);margin-top:4px;">${time}</div>
                            </div>
                        `;
                });
                container.innerHTML = html;
            } catch (e) { console.error("Notifications load error:", e); }
        }

        // ============================================
        // 4. RATING CONTROL
        // ============================================
        async function loadRatings() {
            try {
                const snap = await get(ref(db, 'ratings'));
                const allRatings = [];
                if (snap.exists()) {
                    snap.forEach(panel => {
                        panel.forEach(user => {
                            const r = user.val();
                            r.panelId = panel.key;
                            r.uid = user.key;
                            allRatings.push(r);
                        });
                    });
                }
                allRatings.sort((a, b) => (b.date || 0) - (a.date || 0));
                const tbody = document.getElementById('ratings-tbody');
                if (!allRatings.length) {
                    tbody.innerHTML =
                        '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">No ratings yet</td></tr>';
                    return;
                }
                let html = '';
                allRatings.forEach(r => {
                    const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
                    html += `
                            <tr>
                                <td><span class="font-mono text-xs">${r.panelId.slice(0,8)}...</span></td>
                                <td>${escapeHtml(r.email || r.uid || 'Anonymous')}</td>
                                <td style="color:var(--accent-yellow);font-size:18px;">${stars}</td>
                                <td>${r.date ? new Date(r.date).toLocaleDateString() : '-'}</td>
                                <td><button class="btn btn-danger btn-sm" onclick="deleteRating('${r.panelId}','${r.uid}')"><i class="fas fa-trash"></i></button></td>
                            </tr>
                        `;
                });
                tbody.innerHTML = html;

                document.getElementById('search-ratings').addEventListener('input', function() {
                    const term = this.value.toLowerCase();
                    document.querySelectorAll('#ratings-tbody tr').forEach(row => {
                        row.style.display = row.innerText.toLowerCase().includes(term) ? '' : 'none';
                    });
                });
            } catch (e) { console.error("Ratings load error:", e); }
        }

        window.deleteRating = async (panelId, uid) => {
            if (!confirm('Delete this rating?')) return;
            showLoader();
            try {
                await remove(ref(db, 'ratings/' + panelId + '/' + uid));
                showToast('Rating deleted');
                loadRatings();
            } catch (e) { showToast('Error', 'error'); }
            hideLoader();
        };

        // ============================================
        // 5. ANALYTICS
        // ============================================
        let analyticsChartInstances = {};
        let sensiChartInstance = null;
        window.allSensiCache = [];

        async function loadAnalytics() {
            try {
                const orderSnap = await get(ref(db, 'orders'));
                let totalOrders = 0,
                    totalRevenue = 0,
                    orderList = [];
                if (orderSnap.exists()) {
                    orderSnap.forEach(uid => {
                        uid.forEach(o => {
                            const val = o.val();
                            totalOrders++;
                            const amt = parseFloat(val.price || val.amount || 0);
                            totalRevenue += amt;
                            orderList.push({ ...val, uid: uid.key, timestamp: val.timestamp || val
                                    .date });
                        });
                    });
                }
                const avgOrder = totalOrders > 0 ? totalRevenue / totalOrders : 0;
                document.getElementById('ana-total-orders').innerText = totalOrders;
                document.getElementById('ana-total-revenue').innerText = '₦' + totalRevenue.toFixed(2);
                document.getElementById('ana-avg-order').innerText = '₦' + avgOrder.toFixed(2);

                const usersSnap = await get(ref(db, 'users'));
                let activeUsers = 0;
                if (usersSnap.exists()) {
                    usersSnap.forEach(child => {
                        if (child.val().status !== 'banned') activeUsers++;
                    });
                }
                document.getElementById('ana-active-users').innerText = activeUsers;

                const days = [...Array(7)].map((_, i) => {
                    const d = new Date();
                    d.setDate(d.getDate() - i);
                    return d.toLocaleDateString();
                }).reverse();
                const spendingMap = {};
                days.forEach(d => spendingMap[d] = 0);
                orderList.forEach(o => {
                    if (o.timestamp) {
                        const d = new Date(o.timestamp).toLocaleDateString();
                        if (spendingMap[d] !== undefined) spendingMap[d] += parseFloat(o.price || o.amount ||
                            0);
                    }
                });
                const spendingData = Object.values(spendingMap);

                const ctx1 = document.getElementById('spendingChart').getContext('2d');
                if (analyticsChartInstances.spending) { analyticsChartInstances.spending.destroy(); }
                analyticsChartInstances.spending = new Chart(ctx1, {
                    type: 'bar',
                    data: {
                        labels: days,
                        datasets: [{
                            label: 'Spending (₦)',
                            data: spendingData,
                            backgroundColor: 'rgba(239,65,54,0.35)',
                            borderColor: '#ef4136',
                            borderWidth: 2,
                            borderRadius: 6
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                            x: { grid: { display: false } },
                            y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { callback: v => '₦' + v } }
                        }
                    }
                });

                const panelRevenue = {};
                orderList.forEach(o => {
                    const p = o.panelName || 'Unknown';
                    panelRevenue[p] = (panelRevenue[p] || 0) + parseFloat(o.price || o.amount || 0);
                });
                const panelLabels = Object.keys(panelRevenue);
                const panelData = Object.values(panelRevenue);
                const colors = ['#ef4136', '#b7291f', '#ff6f61', '#f59e0b', '#f87171', '#34d399', '#60a5fa', '#a78bfa'];

                const ctx2 = document.getElementById('panelRevenueChart').getContext('2d');
                if (analyticsChartInstances.panel) { analyticsChartInstances.panel.destroy(); }
                if (panelLabels.length) {
                    analyticsChartInstances.panel = new Chart(ctx2, {
                        type: 'doughnut',
                        data: {
                            labels: panelLabels,
                            datasets: [{
                                data: panelData,
                                backgroundColor: colors.slice(0, panelLabels.length),
                                borderColor: 'var(--bg-deep)',
                                borderWidth: 2
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: { legend: { position: 'right', labels: { color: 'var(--text-secondary)',
                                        font: { size: 11 } } } }
                        }
                    });
                } else {
                    ctx2.getContext('2d').clearRect(0, 0, ctx2.width, ctx2.height);
                }

            } catch (e) {
                console.error("Analytics load error:", e);
                showToast('Error loading analytics', 'error');
            }
        }

        // ============================================
        // SENSI GENERATOR — analytics (reads sensiGenerationsLog,
        // written by the client-side generator in the user panel)
        // ============================================
        async function loadSensiStats() {
            try {
                // VIP settings + count
                try {
                    const vipPriceSnap = await get(ref(db, 'settings/vipPrice'));
                    document.getElementById('set-vip-price').value = vipPriceSnap.exists() ? vipPriceSnap.val() : 2000;
                    const usersSnap = await get(ref(db, 'users'));
                    let vipCount = 0;
                    if (usersSnap.exists()) usersSnap.forEach(c => { if (c.val().isVip) vipCount++; });
                    document.getElementById('vip-user-count').innerText = vipCount;
                } catch (e) { console.error('VIP settings load error:', e); }

                const snap = await get(ref(db, 'sensiGenerationsLog'));
                const list = [];
                if (snap.exists()) {
                    snap.forEach(child => list.push({ id: child.key, ...child.val() }));
                }
                list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                window.allSensiCache = list;

                document.getElementById('sensi-total-gens').innerText = list.length;
                const uniqueDevices = new Set(list.map(g => g.device)).size;
                document.getElementById('sensi-unique-devices').innerText = uniqueDevices;

                const styleCounts = {};
                let scoreSum = 0, scoreCount = 0;
                list.forEach(g => {
                    if (g.playStyle) styleCounts[g.playStyle] = (styleCounts[g.playStyle] || 0) + 1;
                    if (typeof g.optimization_score === 'number') { scoreSum += g.optimization_score; scoreCount++; }
                });
                const topStyle = Object.keys(styleCounts).sort((a, b) => styleCounts[b] - styleCounts[a])[0] || '—';
                document.getElementById('sensi-top-style').innerText = topStyle;
                document.getElementById('sensi-avg-score').innerText = scoreCount ? Math.round(scoreSum / scoreCount) : 0;

                // Style breakdown chart
                const styleLabels = Object.keys(styleCounts);
                const styleData = Object.values(styleCounts);
                const colors = ['#ef4136', '#b7291f', '#ff6f61', '#f59e0b', '#f87171', '#34d399', '#60a5fa', '#a78bfa'];
                const ctx = document.getElementById('sensiStyleChart').getContext('2d');
                if (sensiChartInstance) sensiChartInstance.destroy();
                if (styleLabels.length) {
                    sensiChartInstance = new Chart(ctx, {
                        type: 'doughnut',
                        data: {
                            labels: styleLabels,
                            datasets: [{ data: styleData, backgroundColor: colors.slice(0, styleLabels.length), borderColor: 'var(--bg-deep)', borderWidth: 2 }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: { legend: { position: 'right', labels: { color: 'var(--text-secondary)', font: { size: 11 } } } }
                        }
                    });
                } else {
                    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
                }

                sensiRenderTable(list);

                // Top devices table
                const deviceCounts = {};
                list.forEach(g => { if (g.device) deviceCounts[g.device] = (deviceCounts[g.device] || 0) + 1; });
                const topDevices = Object.entries(deviceCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
                const devTbody = document.getElementById('sensi-devices-tbody');
                devTbody.innerHTML = topDevices.length ?
                    topDevices.map(([device, count]) => `<tr><td>${escapeHtml(device)}</td><td>${count}</td></tr>`).join('') :
                    '<tr><td colspan="2" style="text-align:center;color:var(--text-muted);">No generations yet</td></tr>';

            } catch (e) {
                console.error("Sensi stats load error:", e);
                showToast('Error loading sensi stats', 'error');
            }
        }

        function sensiRenderTable(list) {
            const tbody = document.getElementById('sensi-tbody');
            if (!list.length) {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">No generations yet</td></tr>';
                return;
            }
            tbody.innerHTML = list.slice(0, 100).map(g => `
                <tr>
                    <td>${escapeHtml(g.email || g.uid || 'Anonymous')}</td>
                    <td>${escapeHtml(g.device || 'Unknown')}</td>
                    <td>${escapeHtml(g.playStyle || '—')}</td>
                    <td>${g.general ?? '—'}</td>
                    <td>${g.dpi ?? '—'}</td>
                    <td>${g.optimization_score ?? '—'}</td>
                    <td>${g.timestamp ? new Date(g.timestamp).toLocaleDateString() : '—'}</td>
                </tr>
            `).join('');
        }

        document.getElementById('search-sensi')?.addEventListener('input', function() {
            const q = this.value.toLowerCase();
            const filtered = (window.allSensiCache || []).filter(g =>
                (g.email || '').toLowerCase().includes(q) || (g.device || '').toLowerCase().includes(q));
            sensiRenderTable(filtered);
        });

        document.getElementById('btn-export-sensi')?.addEventListener('click', () => {
            const list = window.allSensiCache || [];
            if (!list.length) return showToast('No generations to export', 'error');
            const rows = [['Email', 'Device', 'Brand', 'Model', 'Play Style', 'General', 'Red Dot', '2x', '4x', 'Sniper', 'Free Look', 'Fire Button', 'DPI', 'Score', 'Date']];
            list.forEach(g => rows.push([
                g.email || g.uid || '', g.device || '', g.brand || '', g.model || '', g.playStyle || '',
                g.general ?? '', g.red_dot ?? '', g.scope2x ?? '', g.scope4x ?? '', g.sniper ?? '',
                g.free_look ?? '', g.fire_button ?? '', g.dpi ?? '', g.optimization_score ?? '',
                g.timestamp ? new Date(g.timestamp).toISOString() : ''
            ]));
            downloadCsv(`zerx-xit-sensi-generations-${Date.now()}.csv`, rows);
            showToast(`Exported ${list.length} generations to CSV`);
        });

        // ============================================
        // DASHBOARD
        // ============================================
        let revenueChartInstance = null;

        async function loadDashboard() {
            try {
                hideDashboardError();
                const usersSnap = await get(ref(db, 'users'));
                const usersCount = usersSnap.exists() ? Object.keys(usersSnap.val()).length : 0;
                document.getElementById('stat-users').innerText = usersCount;

                const depSnap = await get(query(ref(db, 'manual_deposits'), limitToLast(500)));
                let pendingDep = 0,
                    revenue = 0,
                    depList = [];
                if (depSnap.exists()) {
                    depSnap.forEach(c => {
                        const v = c.val();
                        v.id = c.key;
                        depList.push(v);
                        if (v.status === 'pending') pendingDep++;
                        if (v.status === 'approved') revenue += parseFloat(v.amount || 0);
                    });
                }
                document.getElementById('stat-pending-deposits').innerText = pendingDep;

                const orderSnap = await get(ref(db, 'orders'));
                let pendingOrd = 0,
                    orderList = [];
                if (orderSnap.exists()) {
                    orderSnap.forEach(uid => {
                        uid.forEach(o => {
                            const v = o.val();
                            v.id = o.key;
                            v.uid = uid.key;
                            orderList.push(v);
                            if (v.status === 'pending') pendingOrd++;
                            if (v.status === 'approved' || v.status === 'completed') revenue += parseFloat(v
                                .price || v.amount || 0);
                        });
                    });
                }
                document.getElementById('stat-pending-orders').innerText = pendingOrd;
                document.getElementById('stat-revenue').innerText = '₦' + revenue.toFixed(2);

                const badge = document.getElementById('notif-badge');
                const total = pendingDep + pendingOrd;
                if (total > 0) { badge.innerText = total;
                    badge.style.display = 'flex'; } else { badge.style.display = 'none'; }

                const all = [...depList.map(d => ({ ...d, type: 'deposit' })), ...orderList.map(o => ({ ...o, type: 'order',
                    amount: o.price || o.amount || 0 }))];
                all.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                renderRecentActivity(all.slice(0, 5));
                renderRevenueChart(all);
            } catch (e) {
                console.error("Dashboard load error:", e);
                showDashboardError("Failed to load dashboard data: " + (e.message || "unknown error"));
            }
        }

        function renderRecentActivity(list) {
            const container = document.getElementById('recent-activity');
            if (!list.length) {
                container.innerHTML =
                    '<div style="padding:20px;text-align:center;color:var(--text-muted);">No recent activity</div>';
                return;
            }
            let html = '';
            list.forEach(p => {
                const color = p.status === 'approved' || p.status === 'completed' ? 'var(--accent-green)' : p
                    .status === 'rejected' ?
                    'var(--accent-red)' : 'var(--accent-yellow)';
                const icon = p.type === 'deposit' ? '<i class="fas fa-hand-holding-usd"></i>' :
                    '<i class="fas fa-shopping-cart"></i>';
                const iconClass = p.type === 'deposit' ? 'yellow' : 'purple';
                const email = p.email || p.uid || 'Unknown';
                const amt = p.amount || 0;
                const statusLabel = p.status || 'pending';
                html += `
                        <div class="activity-item">
                            <div class="activity-icon ${iconClass}">${icon}</div>
                            <div class="activity-info">
                                <div class="activity-title">${email} - ${p.type}</div>
                                <div class="activity-time">${p.timestamp ? new Date(p.timestamp).toLocaleString() : 'N/A'} • <span class="badge badge-${statusLabel}">${statusLabel}</span></div>
                            </div>
                            <div class="activity-amount" style="color:${color};">${statusLabel === 'approved' || statusLabel === 'completed' ? '+' : ''}₦${amt}</div>
                        </div>
                    `;
            });
            container.innerHTML = html;
        }

        async function renderRevenueChart(allData) {
            if (!window.Chart) {
                await new Promise(resolve => {
                    const s = document.createElement('script');
                    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
                    s.onload = resolve;
                    document.head.appendChild(s);
                });
            }
            const ctx = document.getElementById('revenueChart').getContext('2d');
            const days = [...Array(7)].map((_, i) => {
                const d = new Date();
                d.setDate(d.getDate() - i);
                return d.toLocaleDateString();
            }).reverse();
            const dataMap = {};
            days.forEach(d => dataMap[d] = 0);
            allData.forEach(p => {
                if ((p.status === 'approved' || p.status === 'completed' || p.status === 'success') && p
                    .timestamp) {
                    const d = new Date(p.timestamp).toLocaleDateString();
                    if (dataMap[d] !== undefined) dataMap[d] += parseFloat(p.amount || 0);
                }
            });
            const data = Object.values(dataMap);
            if (revenueChartInstance) {
                revenueChartInstance.data.datasets[0].data = data;
                revenueChartInstance.update();
                return;
            }
            Chart.defaults.color = '#c8bda8';
            revenueChartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: days,
                    datasets: [{
                        label: 'Revenue',
                        data: data,
                        borderColor: '#ef4136',
                        backgroundColor: 'rgba(239,65,54,0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.3,
                        pointBackgroundColor: '#ef4136',
                        pointBorderColor: '#000000',
                        pointBorderWidth: 2,
                        pointRadius: 3
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: 'rgba(25,25,25,0.9)',
                            titleColor: '#f5f0e8',
                            bodyColor: '#ef4136',
                            displayColors: false,
                            borderColor: 'rgba(239,65,54,0.12)',
                            borderWidth: 1
                        }
                    },
                    scales: {
                        x: { grid: { color: 'rgba(255,255,255,0.03)' } },
                        y: {
                            grid: { color: 'rgba(255,255,255,0.03)' },
                            ticks: { callback: v => '₦' + v }
                        }
                    }
                }
            });
        }

        // ============================================
        // USERS
        // ============================================
        async function loadUsers() {
            try {
                const snap = await get(ref(db, 'users'));
                const users = snap.val() || {};
                window.allUsersCache = users; // cached for CSV export
                const tbody = document.getElementById('users-tbody');
                let html = '';
                for (let uid in users) {
                    const u = users[uid];
                    const status = u.status === 'banned' ?
                        '<span class="badge badge-banned">Banned</span>' :
                        '<span class="badge badge-active">Active</span>';
                    const vipBadge = u.isVip ? ' <span class="badge" style="background:linear-gradient(135deg,var(--accent-primary-light),var(--accent-primary));color:#fff;"><i class="fas fa-crown"></i> VIP</span>' : '';
                    const banBtn = u.status === 'banned' ?
                        `<button class="btn btn-outline btn-sm" onclick="toggleBan('${uid}','active')">Unban</button>` :
                        `<button class="btn btn-danger btn-sm" onclick="toggleBan('${uid}','banned')">Ban</button>`;
                    const vipBtn = u.isVip ?
                        `<button class="btn btn-outline btn-sm" onclick="toggleVip('${uid}',false)" title="Revoke VIP"><i class="fas fa-crown"></i></button>` :
                        `<button class="btn btn-outline btn-sm" onclick="toggleVip('${uid}',true)" title="Grant VIP"><i class="far fa-crown"></i></button>`;
                    const deleteBtn =
                        `<button class="btn btn-danger btn-sm" onclick="deleteUser('${uid}')" title="Delete User Permanently"><i class="fas fa-trash"></i></button>`;
                    html += `
                            <tr>
                                <td>${u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '-'}</td>
                                <td><strong>${escapeHtml(u.email)}</strong><br><span class="text-xs text-muted font-mono">${uid.slice(0,12)}...</span></td>
                                <td style="font-weight:700;color:var(--accent-green);">₦${parseFloat(u.balance || 0).toFixed(2)}</td>
                                <td>${status}${vipBadge}</td>
                                <td>
                                    <button class="btn btn-primary btn-sm" onclick="openBalanceModal('${uid}',${u.balance||0})"><i class="fas fa-wallet"></i></button>
                                    ${vipBtn}
                                    ${banBtn}
                                    ${deleteBtn}
                                </td>
                            </tr>
                        `;
                }
                tbody.innerHTML = html ||
                    '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">No users</td></tr>';
                document.getElementById('search-users').addEventListener('input', function() {
                    const term = this.value.toLowerCase();
                    document.querySelectorAll('#users-tbody tr').forEach(row => {
                        row.style.display = row.innerText.toLowerCase().includes(term) ? '' : 'none';
                    });
                });
            } catch (e) {
                console.error("Users load error:", e);
                document.getElementById('users-tbody').innerHTML =
                    '<tr><td colspan="5" style="text-align:center;color:var(--text-red);">Error loading users</td></tr>';
            }
        }

        window.deleteUser = async (uid) => {
            if (!confirm(`⚠️ Are you sure you want to delete user ${uid} and all their data? This action cannot be undone!`)) {
                return;
            }
            showLoader();
            try {
                await remove(ref(db, 'users/' + uid));
                await remove(ref(db, 'orders/' + uid));
                await remove(ref(db, 'transactions/' + uid));
                await remove(ref(db, 'notifications/' + uid));
                await remove(ref(db, 'users/' + uid + '/spin_data'));

                const depSnap = await get(ref(db, 'manual_deposits'));
                if (depSnap.exists()) {
                    const updates = {};
                    depSnap.forEach(child => {
                        if (child.val().uid === uid) {
                            updates[child.key] = null;
                        }
                    });
                    if (Object.keys(updates).length > 0) {
                        await update(ref(db, 'manual_deposits'), updates);
                    }
                }

                const ratingsSnap = await get(ref(db, 'ratings'));
                if (ratingsSnap.exists()) {
                    const updates = {};
                    ratingsSnap.forEach(panel => {
                        const panelKey = panel.key;
                        const panelRatings = panel.val();
                        if (panelRatings && panelRatings[uid]) {
                            updates[panelKey + '/' + uid] = null;
                        }
                    });
                    if (Object.keys(updates).length > 0) {
                        await update(ref(db, 'ratings'), updates);
                    }
                }

                const refsSnap = await get(ref(db, 'referrals'));
                if (refsSnap.exists()) {
                    const updates = {};
                    refsSnap.forEach(referrer => {
                        const referrerKey = referrer.key;
                        const refList = referrer.val();
                        if (refList) {
                            Object.keys(refList).forEach(refId => {
                                const refData = refList[refId];
                                if (refData.referredUid === uid || refData.referrerUid === uid) {
                                    updates[referrerKey + '/' + refId] = null;
                                }
                            });
                        }
                    });
                    if (Object.keys(updates).length > 0) {
                        await update(ref(db, 'referrals'), updates);
                    }
                }

                showToast('User and all associated data deleted successfully.');
                loadUsers();
                loadDashboard();
            } catch (e) {
                console.error("Delete user error:", e);
                showToast('Error deleting user: ' + e.message, 'error');
            }
            hideLoader();
        };

        window.toggleBan = async (uid, status) => {
            let updates = { status };
            if (status === 'banned') {
                const reason = prompt('Reason for ban (shown to the user):', 'Invalid Verification Code');
                if (reason === null) return; // cancelled
                const zerxId = 'ZX-' + Math.random().toString(16).slice(2, 10).toUpperCase();
                updates = { status, banReason: reason || 'Policy violation', zerxId, bannedAt: Date.now() };
            } else {
                updates = { status, banReason: null, zerxId: null, bannedAt: null };
            }
            showLoader();
            try {
                await update(ref(db, 'users/' + uid), updates);
                showToast(status === 'banned' ? 'User banned' : 'User unbanned');
                loadUsers();
            } catch (e) { showToast('Error', 'error'); }
            hideLoader();
        };

        window.toggleVip = async (uid, makeVip) => {
            showLoader();
            try {
                await update(ref(db, 'users/' + uid), makeVip ?
                    { isVip: true, vipActivatedAt: Date.now(), vipGrantedByAdmin: true } :
                    { isVip: false });
                showToast(makeVip ? 'VIP granted' : 'VIP revoked');
                loadUsers();
            } catch (e) { showToast('Error', 'error'); }
            hideLoader();
        };

        // ============================================
        // VERIFICATION SETTINGS
        // ============================================
        async function loadVerificationSettings() {
            try {
                const snap = await get(ref(db, 'settings/verification'));
                const data = snap.val() || {};
                document.getElementById('verify-share-count-input').value = data.shareCount || 5;
                document.getElementById('verify-code-setting').value = data.code || 'ZERX FOR 2027';
            } catch (e) { console.error('Verification settings load error:', e); }
        }
        document.getElementById('btn-save-verification')?.addEventListener('click', async () => {
            const shareCount = parseInt(document.getElementById('verify-share-count-input').value, 10) || 5;
            const code = document.getElementById('verify-code-setting').value.trim().toUpperCase() || 'ZERX FOR 2027';
            showLoader();
            try {
                await set(ref(db, 'settings/verification'), { shareCount, code });
                showToast('Verification settings saved');
            } catch (e) { showToast('Error saving settings', 'error'); }
            hideLoader();
        });

        // ============================================
        // APPEALS
        // ============================================
        async function loadAppeals() {
            try {
                const snap = await get(ref(db, 'appeals'));
                const appeals = snap.val() || {};
                const tbody = document.getElementById('appeals-tbody');
                let html = '';
                const entries = Object.entries(appeals).sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));
                for (const [key, a] of entries) {
                    const statusBadge = a.status === 'approved' ?
                        '<span class="badge badge-active">Approved</span>' :
                        a.status === 'rejected' ? '<span class="badge badge-banned">Rejected</span>' :
                        '<span class="badge" style="background:rgba(245,185,66,0.15);color:var(--accent-gold);">Pending</span>';
                    const actions = (!a.status || a.status === 'pending') ?
                        `<button class="btn btn-primary btn-sm" onclick="resolveAppeal('${key}','${a.uid}','approved')"><i class="fas fa-check"></i></button>
                         <button class="btn btn-danger btn-sm" onclick="resolveAppeal('${key}','${a.uid}','rejected')"><i class="fas fa-times"></i></button>` :
                        '<span class="text-muted text-xs">Resolved</span>';
                    html += `<tr>
                        <td>${a.createdAt ? new Date(a.createdAt).toLocaleDateString() : '-'}</td>
                        <td>${escapeHtml(a.email || a.uid || '')}</td>
                        <td style="font-family:monospace;">${escapeHtml(a.zerxId || '-')}</td>
                        <td>${escapeHtml(a.banReason || '-')}</td>
                        <td style="max-width:220px;white-space:normal;">${escapeHtml(a.message || '-')}</td>
                        <td>${statusBadge}</td>
                        <td>${actions}</td>
                    </tr>`;
                }
                tbody.innerHTML = html || '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">No appeals</td></tr>';
            } catch (e) {
                console.error('Appeals load error:', e);
                document.getElementById('appeals-tbody').innerHTML =
                    '<tr><td colspan="7" style="text-align:center;color:var(--text-red);">Error loading appeals</td></tr>';
            }
        }

        window.resolveAppeal = async (appealKey, uid, decision) => {
            showLoader();
            try {
                await update(ref(db, 'appeals/' + appealKey), { status: decision, resolvedAt: Date.now() });
                if (decision === 'approved' && uid) {
                    await update(ref(db, 'users/' + uid), { status: 'active', banReason: null, zerxId: null, bannedAt: null });
                }
                showToast(decision === 'approved' ? 'Appeal approved — user unbanned' : 'Appeal rejected');
                loadAppeals();
            } catch (e) { showToast('Error resolving appeal', 'error'); }
            hideLoader();
        };

        // ============================================
        // DEVICES (Sensi generator catalogue additions)
        // ============================================
        window.allDevicesCache = {};
        async function loadDevices() {
            try {
                const snap = await get(ref(db, 'devices'));
                const devices = snap.val() || {};
                window.allDevicesCache = devices;
                const tbody = document.getElementById('devices-tbody');
                let html = '';
                for (const key in devices) {
                    const d = devices[key];
                    html += `<tr>
                        <td>${escapeHtml(d.b || '')}</td>
                        <td>${escapeHtml(d.m || '')}</td>
                        <td>${escapeHtml(d.proc || '-')}</td>
                        <td>${d.perf ?? '-'}</td>
                        <td>
                            <button class="btn btn-outline btn-sm" onclick="editDevice('${key}')"><i class="fas fa-edit"></i></button>
                            <button class="btn btn-danger btn-sm" onclick="deleteDevice('${key}')"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>`;
                }
                tbody.innerHTML = html || '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">No admin-added devices yet — the built-in 175-device catalogue is still used.</td></tr>';
                document.getElementById('search-devices')?.addEventListener('input', function() {
                    const term = this.value.toLowerCase();
                    document.querySelectorAll('#devices-tbody tr').forEach(row => {
                        row.style.display = row.innerText.toLowerCase().includes(term) ? '' : 'none';
                    });
                });
            } catch (e) {
                console.error('Devices load error:', e);
                document.getElementById('devices-tbody').innerHTML =
                    '<tr><td colspan="5" style="text-align:center;color:var(--text-red);">Error loading devices</td></tr>';
            }
        }

        window.editDevice = (key) => {
            const d = window.allDevicesCache[key];
            if (!d) return;
            document.getElementById('device-edit-key').value = key;
            document.getElementById('device-brand').value = d.b || '';
            document.getElementById('device-model').value = d.m || '';
            document.getElementById('device-proc').value = d.proc || '';
            document.getElementById('device-gpu').value = d.gpu || '';
            document.getElementById('device-ram').value = d.ram || '';
            document.getElementById('device-os').value = d.os || '';
            document.getElementById('device-rr').value = d.rr || '';
            document.getElementById('device-perf').value = d.perf ?? '';
            document.getElementById('device-gam').value = d.gam ?? '';
            window.scrollTo({ top: 0, behavior: 'smooth' });
        };

        window.deleteDevice = async (key) => {
            if (!confirm('Delete this device entry?')) return;
            showLoader();
            try {
                await remove(ref(db, 'devices/' + key));
                showToast('Device deleted');
                loadDevices();
            } catch (e) { showToast('Error deleting device', 'error'); }
            hideLoader();
        };

        document.getElementById('btn-clear-device')?.addEventListener('click', () => {
            document.getElementById('device-edit-key').value = '';
            ['device-brand', 'device-model', 'device-proc', 'device-gpu', 'device-ram', 'device-os', 'device-rr', 'device-perf', 'device-gam']
                .forEach(id => document.getElementById(id).value = '');
        });

        document.getElementById('btn-save-device')?.addEventListener('click', async () => {
            const b = document.getElementById('device-brand').value.trim();
            const m = document.getElementById('device-model').value.trim();
            if (!b || !m) { showToast('Brand and model are required', 'error'); return; }
            const data = {
                b, m,
                proc: document.getElementById('device-proc').value.trim(),
                gpu: document.getElementById('device-gpu').value.trim(),
                ram: document.getElementById('device-ram').value.trim(),
                os: document.getElementById('device-os').value.trim(),
                rr: document.getElementById('device-rr').value.trim(),
                perf: parseInt(document.getElementById('device-perf').value, 10) || 50,
                gam: parseInt(document.getElementById('device-gam').value, 10) || 50
            };
            const editKey = document.getElementById('device-edit-key').value;
            showLoader();
            try {
                if (editKey) {
                    await update(ref(db, 'devices/' + editKey), data);
                } else {
                    await push(ref(db, 'devices'), data);
                }
                showToast('Device saved — live on the user side immediately');
                document.getElementById('btn-clear-device').click();
                loadDevices();
            } catch (e) { showToast('Error saving device', 'error'); }
            hideLoader();
        });

        window.openBalanceModal = (uid, current) => {
            document.getElementById('edit-bal-uid').value = uid;
            document.getElementById('edit-bal-current').value = current.toFixed(2);
            document.getElementById('edit-bal-amount').value = '';
            openModal('modal-balance');
        };

        document.getElementById('btn-save-balance').onclick = async () => {
            const uid = document.getElementById('edit-bal-uid').value;
            const current = parseFloat(document.getElementById('edit-bal-current').value);
            const amount = parseFloat(document.getElementById('edit-bal-amount').value);
            const type = document.getElementById('edit-bal-type').value;
            if (isNaN(amount) || amount < 0) return showToast('Invalid amount', 'error');
            let newBal = current;
            if (type === 'add') newBal += amount;
            else if (type === 'deduct') newBal = Math.max(0, newBal - amount);
            else if (type === 'set') newBal = amount;
            showLoader();
            try {
                await update(ref(db, 'users/' + uid), { balance: newBal });
                showToast('Balance updated');
                closeModal('modal-balance');
                loadUsers();
            } catch (e) { showToast('Failed', 'error'); }
            hideLoader();
        };

        // ============================================
        // DEPOSITS
        // ============================================
        async function loadDeposits() {
            try {
                const snap = await get(query(ref(db, 'manual_deposits'), limitToLast(500)));
                const list = [];
                if (snap.exists()) {
                    snap.forEach(c => { const v = c.val();
                        v.id = c.key;
                        list.push(v); });
                }
                list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                const tbody = document.getElementById('deposits-tbody');
                let html = '';
                list.forEach(d => {
                    const email = d.email || d.uid || 'Unknown';
                    let actions = d.status === 'pending' ?
                        `<button class="btn btn-success btn-sm" onclick="handleDeposit('${d.id}','${d.uid}',${d.amount},'approved')"><i class="fas fa-check"></i></button>
                                 <button class="btn btn-danger btn-sm" onclick="handleDeposit('${d.id}','${d.uid}',0,'rejected')"><i class="fas fa-times"></i></button>` :
                        '<span class="text-muted text-xs">Processed</span>';
                    const img = d.screenshot ?
                        `<button class="btn btn-outline btn-sm" onclick="openImageModal('${d.screenshot}')"><i class="fas fa-image"></i></button>` :
                        '';
                    html += `
                                <tr>
                                    <td>${d.timestamp ? new Date(d.timestamp).toLocaleString() : '-'}</td>
                                    <td><strong>${email}</strong></td>
                                    <td style="font-weight:700;color:var(--accent-green);">₦${d.amount}</td>
                                    <td><span class="font-mono text-xs">${d.utr || '-'}</span></td>
                                    <td><span class="badge badge-${d.status}">${d.status}</span></td>
                                    <td>${img} ${actions}</td>
                                </tr>
                            `;
                });
                tbody.innerHTML = html ||
                    '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);">No deposits</td></tr>';
                document.getElementById('search-deposits').addEventListener('input', function() {
                    const term = this.value.toLowerCase();
                    document.querySelectorAll('#deposits-tbody tr').forEach(row => {
                        row.style.display = row.innerText.toLowerCase().includes(term) ? '' : 'none';
                    });
                });
            } catch (e) {
                console.error("Deposits load error:", e);
                document.getElementById('deposits-tbody').innerHTML =
                    '<tr><td colspan="6" style="text-align:center;color:var(--text-red);">Error loading deposits</td></tr>';
            }
        }

        window.handleDeposit = async (txId, uid, amount, action) => {
            if (!confirm(`Confirm ${action.toUpperCase()}?`)) return;
            showLoader();
            try {
                const depositRef = ref(db, 'manual_deposits/' + txId);
                const depositSnap = await get(depositRef);
                if (!depositSnap.exists()) {
                    showToast('Deposit record not found', 'error');
                    hideLoader();
                    return;
                }
                const depositData = depositSnap.val();
                if (depositData.status !== 'pending') {
                    showToast('Deposit already processed', 'warning');
                    hideLoader();
                    return;
                }

                if (action === 'approved') {
                    await update(depositRef, { status: 'approved' });
                    const userRef = ref(db, 'users/' + uid);
                    const userSnap = await get(userRef);
                    if (!userSnap.exists()) {
                        showToast('User not found', 'error');
                        await update(depositRef, { status: 'pending' });
                        hideLoader();
                        return;
                    }
                    const userData = userSnap.val();
                    const currentBalance = parseFloat(userData.balance || 0);
                    const newBalance = currentBalance + parseFloat(amount);
                    await update(userRef, { balance: newBalance });
                    showToast('Deposit approved and balance updated!');
                } else {
                    await update(depositRef, { status: 'rejected' });
                    showToast('Deposit rejected');
                }
                loadDeposits();
                loadDashboard();
            } catch (e) {
                console.error("Deposit action error:", e);
                showToast('Action failed: ' + e.message, 'error');
            }
            hideLoader();
        };

        // ============================================
        // ORDERS (UPDATED with Download Link)
        // ============================================
        let panelsCacheForOrders = {};

        async function loadOrders() {
            try {
                const snap = await get(ref(db, 'orders'));
                const list = [];
                if (snap.exists()) {
                    snap.forEach(uid => {
                        uid.forEach(o => {
                            const order = o.val();
                            order.id = o.key;
                            order.uid = uid.key;
                            list.push(order);
                        });
                    });
                }
                list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                window.allOrdersCache = list; // cached for CSV export

                // Load panels for link auto-fill
                const panelsSnap = await get(ref(db, 'panels'));
                panelsCacheForOrders = panelsSnap.val() || {};

                const tbody = document.getElementById('orders-tbody');
                let html = '';
                list.forEach(order => {
                    const email = order.email || order.uid || 'Unknown';
                    const panelName = order.panelName || 'Panel';
                    const status = order.status || 'pending';

                    // Determine action buttons
                    let actionHtml = '';
                    if (status === 'pending') {
                        actionHtml =
                            `<button class="btn btn-success btn-sm" onclick="openApproveOrder('${order.id}','${order.uid}','${panelName}','${order.label||''}',${order.price||0},'${order.panelId||''}')"><i class="fas fa-check"></i> Approve</button>`;
                    } else if (status === 'approved' || status === 'completed') {
                        actionHtml = `<span class="badge badge-approved">Delivered</span>`;
                    } else if (status === 'rejected') {
                        actionHtml = `<span class="badge badge-rejected">Rejected</span>`;
                    } else {
                        actionHtml = `<span class="badge badge-pending">${status}</span>`;
                    }

                    // Download link column
                    let downloadHtml = '';
                    if (status === 'approved' || status === 'completed') {
                        const link = order.downloadLink || order.panelLink || '';
                        if (link) {
                            downloadHtml = `
                                        <div class="download-link-box" style="max-width:180px;">
                                            <span class="link-text" title="${link}">${link.length > 30 ? link.slice(0,30)+'…' : link}</span>
                                            <button class="copy-btn" onclick="copyToClipboard('${link}')"><i class="fas fa-copy"></i></button>
                                        </div>
                                        <button class="access-file-btn" onclick="window.open('${link}','_blank')"><i class="fas fa-download"></i> Access File</button>
                                    `;
                        } else {
                            downloadHtml =
                                `<span class="text-muted text-xs">No link</span>`;
                        }
                    } else {
                        downloadHtml = `<span class="text-muted text-xs">—</span>`;
                    }

                    html += `
                                <tr>
                                    <td>${order.timestamp ? new Date(order.timestamp).toLocaleString() : (order.date ? new Date(order.date).toLocaleString() : '-')}</td>
                                    <td><strong>${escapeHtml(email)}</strong></td>
                                    <td><strong>${escapeHtml(panelName)}</strong><br><span class="text-xs text-muted">${escapeHtml(order.label || order.plan || '')}</span></td>
                                    <td style="font-weight:700;color:var(--accent-green);">₦${order.price || order.amount || 0}</td>
                                    <td><span class="badge badge-${status}">${status}</span></td>
                                    <td>${downloadHtml}</td>
                                    <td>${actionHtml}</td>
                                </tr>
                            `;
                });
                tbody.innerHTML = html ||
                    '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">No orders</td></tr>';

                document.getElementById('search-orders').addEventListener('input', function() {
                    const term = this.value.toLowerCase();
                    document.querySelectorAll('#orders-tbody tr').forEach(row => {
                        row.style.display = row.innerText.toLowerCase().includes(term) ? '' : 'none';
                    });
                });
            } catch (e) {
                console.error("Orders load error:", e);
                document.getElementById('orders-tbody').innerHTML =
                    '<tr><td colspan="7" style="text-align:center;color:var(--text-red);">Error loading orders</td></tr>';
            }
        }

        // Copy to clipboard helper
        window.copyToClipboard = (text) => {
            navigator.clipboard.writeText(text).then(() => {
                showToast('Link copied to clipboard!');
            }).catch(() => {
                // Fallback
                const input = document.createElement('input');
                input.value = text;
                document.body.appendChild(input);
                input.select();
                document.execCommand('copy');
                document.body.removeChild(input);
                showToast('Link copied!');
            });
        };

        // ============================================
        // APPROVE ORDER (UPDATED with Download Link)
        // ============================================
        window.openApproveOrder = (orderId, uid, panelName, planLabel, amount, panelId) => {
            document.getElementById('approve-order-id').value = orderId;
            document.getElementById('approve-order-uid').value = uid;
            document.getElementById('approve-panel-name').value = panelName;

            // Pre-fill download link from panel data if available
            let defaultLink = '';
            if (panelId && panelsCacheForOrders[panelId]) {
                defaultLink = panelsCacheForOrders[panelId].link || '';
            } else {
                // Fallback: search by name
                for (let key in panelsCacheForOrders) {
                    if (panelsCacheForOrders[key].name === panelName) {
                        defaultLink = panelsCacheForOrders[key].link || '';
                        break;
                    }
                }
            }
            document.getElementById('approve-download-link').value = defaultLink;

            document.getElementById('approve-order-key').value = '';
            document.getElementById('approve-order-summary').innerHTML = `
                        <strong>User:</strong> ${uid}<br>
                        <strong>Panel:</strong> ${panelName}<br>
                        <strong>Plan:</strong> ${planLabel || 'N/A'}<br>
                        <strong>Amount:</strong> ₦${amount}
                        ${defaultLink ? `<br><strong>Panel Link:</strong> <span class="text-xs text-yellow">${defaultLink}</span>` : ''}
                    `;
            openModal('modal-approve-order');
        };

        // "Use Panel Link" button
        document.getElementById('btn-fill-panel-link').addEventListener('click', () => {
            const panelName = document.getElementById('approve-panel-name').value;
            let link = '';
            for (let key in panelsCacheForOrders) {
                if (panelsCacheForOrders[key].name === panelName) {
                    link = panelsCacheForOrders[key].link || '';
                    break;
                }
            }
            if (link) {
                document.getElementById('approve-download-link').value = link;
                showToast('Panel link filled!');
            } else {
                showToast('No panel link found. Enter manually.', 'warning');
            }
        });

        document.getElementById('btn-confirm-approve').onclick = async () => {
            const orderId = document.getElementById('approve-order-id').value;
            const uid = document.getElementById('approve-order-uid').value;
            const key = document.getElementById('approve-order-key').value.trim();
            const downloadLink = document.getElementById('approve-download-link').value.trim();

            if (!key) return showToast('Enter a valid license key', 'error');

            showLoader();
            try {
                const updateData = {
                    status: 'approved',
                    key: key,
                    deliveredAt: serverTimestamp()
                };
                if (downloadLink) {
                    updateData.downloadLink = downloadLink;
                }

                await update(ref(db, 'orders/' + uid + '/' + orderId), updateData);
                showToast('Order approved & delivered!');
                closeModal('modal-approve-order');
                loadOrders();
                loadDashboard();
            } catch (e) {
                console.error("Approve error:", e);
                showToast('Error: ' + e.message, 'error');
            }
            hideLoader();
        };

        // ============================================
        // PANELS
        // ============================================
        window.panelsDataCache = {};

        async function loadPanels() {
            try {
                const snap = await get(ref(db, 'panels'));
                const panelsData = snap.val() || {};
                window.panelsDataCache = panelsData;
                const container = document.getElementById('admin-panels-container');
                let html = '';
                for (let key in panelsData) {
                    const p = panelsData[key];
                    const isActive = p.status === 'active';
                    let planHtml = '';
                    if (p.plans) {
                        const sorted = Object.entries(p.plans).sort((a, b) => (a[1]?.price || 0) - (b[1]?.price || 0));
                        planHtml = '<select class="form-input" style="font-size:12px;padding:6px 12px;margin-top:4px;">';
                        sorted.forEach(([k, v]) => planHtml += `<option>${v.label || 'Plan'} - ₦${v.price}</option>`);
                        planHtml += '</select>';
                    } else {
                        planHtml = '<span class="text-muted text-xs">No plans</span>';
                    }
                    const hasBanner = p.banner && p.banner.length > 5;
                    const hasLogo = p.logo && p.logo.length > 5;
                    const imagesHtml = `
                            <div class="panel-images-preview">
                                ${hasBanner ? `<img src="${p.banner}" alt="Banner" title="Banner" />` : '<span class="no-image">No banner</span>'}
                                ${hasLogo ? `<img src="${p.logo}" alt="Logo" title="Injector Logo" />` : '<span class="no-image">No logo</span>'}
                            </div>
                        `;
                    html += `
                                <div class="panel-card-admin">
                                    <div class="video-wrap">
                                        ${p.ytLink ? `<iframe src="${p.ytLink.replace('watch?v=', 'embed/')}" allowfullscreen></iframe>` : 
                                          (hasBanner ? `<img src="${p.banner}" alt="Banner" />` : 
                                          `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:13px;">No media</div>`)}
                                    </div>
                                    <div class="panel-info">
                                        <div class="panel-name">
                                            ${p.name || 'Unnamed'}
                                            <span class="status-badge ${isActive ? 'active' : 'inactive'}">${isActive ? 'Active' : 'Inactive'}</span>
                                        </div>
                                        <div class="panel-meta">
                                            <span class="meta-tag"><i class="fas fa-tag"></i> ${p.category || 'General'}</span>
                                            <span class="meta-tag"><i class="fas fa-users"></i> ${p.orders || 0} orders</span>
                                            ${p.link ? `<span class="meta-tag"><i class="fas fa-link"></i> Link set</span>` : ''}
                                        </div>
                                        ${imagesHtml}
                                        ${planHtml}
                                        <div class="panel-actions">
                                            <button class="btn btn-primary btn-sm" onclick="editPanel('${key}')"><i class="fas fa-edit"></i> Edit</button>
                                            <button class="btn btn-${isActive ? 'danger' : 'success'} btn-sm" onclick="togglePanelStatus('${key}')"><i class="fas fa-${isActive ? 'pause' : 'play'}"></i> ${isActive ? 'Deactivate' : 'Activate'}</button>
                                            <button class="btn btn-danger btn-sm" onclick="deletePanel('${key}')"><i class="fas fa-trash"></i></button>
                                        </div>
                                    </div>
                                </div>
                            `;
                }
                container.innerHTML = html ||
                    '<div style="padding:40px;text-align:center;color:var(--text-muted);">No panels available</div>';
            } catch (e) {
                console.error("Panels load error:", e);
                document.getElementById('admin-panels-container').innerHTML =
                    '<div style="padding:40px;text-align:center;color:var(--text-red);">Error loading panels</div>';
            }
        }

        window.togglePanelStatus = async (id) => {
            const panel = window.panelsDataCache[id];
            if (!panel) { showToast('Panel not found', 'error'); return; }
            const newStatus = panel.status === 'active' ? 'inactive' : 'active';
            showLoader();
            try {
                await update(ref(db, 'panels/' + id), { status: newStatus });
                showToast(`Panel ${newStatus}`);
                await loadPanels();
            } catch (e) {
                console.error("Toggle status error:", e);
                showToast('Error toggling status', 'error');
            }
            hideLoader();
        };

        window.editPanel = (id) => {
            const p = window.panelsDataCache[id];
            if (!p) return showToast('Panel not found', 'error');
            document.getElementById('edit-p-id').value = id;
            document.getElementById('edit-p-name').value = p.name || '';
            document.getElementById('edit-p-banner').value = p.banner || '';
            document.getElementById('edit-p-logo').value = p.logo || '';
            document.getElementById('edit-p-category').value = p.category || 'all';
            document.getElementById('edit-p-yt').value = p.ytLink || '';
            document.getElementById('edit-p-link').value = p.link || '';
            document.getElementById('edit-p-feedback').value = p.feedbackLink || '';
            document.getElementById('edit-p-desc').value = p.desc || '';
            const container = document.getElementById('edit-plans-container');
            container.innerHTML = '';
            if (p.plans) {
                Object.entries(p.plans).forEach(([k, v]) => {
                    const div = document.createElement('div');
                    div.className = 'plan-row';
                    div.innerHTML = `
                                    <input class="p-label form-input" placeholder="Plan Name" value="${v.label || ''}" data-key="${k}" />
                                    <input class="p-price form-input" placeholder="Price" type="number" value="${v.price || 0}" data-key="${k}" />
                                    <button class="btn btn-danger btn-sm" onclick="this.parentElement.remove();"><i class="fas fa-trash"></i></button>
                                `;
                    container.appendChild(div);
                });
            }
            openModal('modal-edit-panel');
        };

        window.addEditPlanRow = () => {
            const container = document.getElementById('edit-plans-container');
            const div = document.createElement('div');
            div.className = 'plan-row';
            div.innerHTML = `
                            <input class="p-label form-input" placeholder="Plan Name" value="Plan" />
                            <input class="p-price form-input" placeholder="Price" type="number" value="100" />
                            <button class="btn btn-danger btn-sm" onclick="this.parentElement.remove();"><i class="fas fa-trash"></i></button>
                        `;
            container.appendChild(div);
        };

        document.getElementById('btn-save-edit-panel').onclick = async () => {
            const id = document.getElementById('edit-p-id').value;
            const name = document.getElementById('edit-p-name').value.trim();
            if (!name) return showToast('Name is required', 'error');
            const plans = {};
            document.querySelectorAll('#edit-plans-container .plan-row').forEach((row, index) => {
                const label = row.querySelector('.p-label')?.value || 'Plan ' + (index + 1);
                const price = parseFloat(row.querySelector('.p-price')?.value) || 0;
                plans['plan_' + Date.now() + '_' + index] = { label, price };
            });
            const data = {
                name,
                banner: document.getElementById('edit-p-banner').value.trim(),
                logo: document.getElementById('edit-p-logo').value.trim(),
                category: document.getElementById('edit-p-category').value.trim(),
                ytLink: document.getElementById('edit-p-yt').value.trim(),
                link: document.getElementById('edit-p-link').value.trim(),
                feedbackLink: document.getElementById('edit-p-feedback').value.trim(),
                desc: document.getElementById('edit-p-desc').value.trim(),
                plans
            };
            showLoader();
            try {
                await update(ref(db, 'panels/' + id), data);
                showToast('Panel updated');
                closeModal('modal-edit-panel');
                loadPanels();
            } catch (e) { showToast('Error', 'error'); }
            hideLoader();
        };

        window.deletePanel = async (id) => {
            if (!confirm('Delete this panel permanently?')) return;
            showLoader();
            try {
                await remove(ref(db, 'panels/' + id));
                showToast('Panel deleted');
                loadPanels();
            } catch (e) { showToast('Error', 'error'); }
            hideLoader();
        };

        // ============================================
        // ADD PANEL
        // ============================================
        document.getElementById('btn-add-plan-row').addEventListener('click', () => {
            const container = document.getElementById('plans-container');
            const div = document.createElement('div');
            div.className = 'plan-row';
            div.innerHTML = `
                            <input class="p-label form-input" placeholder="Plan Name" value="Plan" />
                            <input class="p-price form-input" placeholder="Price" type="number" value="100" />
                            <button class="btn btn-danger btn-sm" onclick="this.parentElement.remove();updateLivePreview();"><i class="fas fa-trash"></i></button>
                        `;
            container.appendChild(div);
            updateLivePreview();
        });

        window.updateLivePreview = () => {
            const container = document.getElementById('live-preview-container');
            const name = document.getElementById('add-p-name').value || 'Panel Name';
            const desc = document.getElementById('add-p-desc').value || 'Description...';
            const banner = document.getElementById('add-p-banner').value.trim();
            const logo = document.getElementById('add-p-logo').value.trim();
            const plans = [];
            document.querySelectorAll('#plans-container .plan-row').forEach(row => {
                const label = row.querySelector('.p-label')?.value || 'Plan';
                const price = row.querySelector('.p-price')?.value || '0';
                plans.push(`${label}: ₦${price}`);
            });
            let imagesHtml = '';
            if (banner) imagesHtml += `<img src="${banner}" style="max-height:100px;border-radius:8px;margin:4px;" />`;
            if (logo) imagesHtml += `<img src="${logo}" style="max-height:60px;border-radius:8px;margin:4px;" />`;
            container.innerHTML = `
                            <div style="background:var(--bg-input);padding:16px;border-radius:var(--radius-sm);border:1px solid var(--border-color);">
                                <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;">${imagesHtml || '<span class="text-muted text-xs">No images</span>'}</div>
                                <h4 style="font-weight:700;font-size:1.1rem;">${name}</h4>
                                <p style="color:var(--text-secondary);font-size:13px;white-space:pre-wrap;">${desc}</p>
                                <div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:8px;">
                                    ${plans.length ? plans.map(p => `<span class="badge badge-pending">${p}</span>`).join('') : '<span class="text-muted text-xs">No plans</span>'}
                                </div>
                            </div>
                        `;
        };

        document.getElementById('add-p-name').addEventListener('input', updateLivePreview);
        document.getElementById('add-p-desc').addEventListener('input', updateLivePreview);
        document.getElementById('add-p-banner').addEventListener('input', updateLivePreview);
        document.getElementById('add-p-logo').addEventListener('input', updateLivePreview);

        document.getElementById('btn-submit-panel').onclick = async () => {
            const name = document.getElementById('add-p-name').value.trim();
            if (!name) return showToast('Panel name is required', 'error');
            const plans = {};
            document.querySelectorAll('#plans-container .plan-row').forEach((row, index) => {
                const label = row.querySelector('.p-label')?.value || 'Plan ' + (index + 1);
                const price = parseFloat(row.querySelector('.p-price')?.value) || 0;
                plans['plan_' + Date.now() + '_' + index] = { label, price };
            });
            if (Object.keys(plans).length === 0) return showToast('Add at least one plan', 'error');
            const data = {
                name,
                banner: document.getElementById('add-p-banner').value.trim(),
                logo: document.getElementById('add-p-logo').value.trim(),
                category: document.getElementById('add-p-category').value.trim(),
                ytLink: document.getElementById('add-p-yt').value.trim(),
                link: document.getElementById('add-p-link').value.trim(),
                feedbackLink: document.getElementById('add-p-feedback').value.trim(),
                desc: document.getElementById('add-p-desc').value.trim(),
                plans,
                status: 'active',
                createdAt: serverTimestamp(),
                orders: 0
            };
            showLoader();
            try {
                const newRef = push(ref(db, 'panels'));
                await set(newRef, data);
                showToast('Panel published!');
                document.getElementById('add-p-name').value = '';
                document.getElementById('add-p-banner').value = '';
                document.getElementById('add-p-logo').value = '';
                document.getElementById('add-p-category').value = 'all';
                document.getElementById('add-p-yt').value = '';
                document.getElementById('add-p-link').value = '';
                document.getElementById('add-p-feedback').value = '';
                document.getElementById('add-p-desc').value = '';
                document.getElementById('plans-container').innerHTML = `
                                <div class="plan-row">
                                    <input class="p-label form-input" placeholder="Plan Name" value="30 Days" />
                                    <input class="p-price form-input" placeholder="Price" type="number" value="200" />
                                    <button class="btn btn-danger btn-sm" onclick="this.parentElement.remove();updateLivePreview();"><i class="fas fa-trash"></i></button>
                                </div>
                            `;
                updateLivePreview();
                navigate('manage-panels');
            } catch (e) { showToast('Failed to publish', 'error'); }
            hideLoader();
        };
        setTimeout(updateLivePreview, 100);

        // ============================================
        // PROMOTIONS
        // ============================================
        window.promotionsDataCache = {};

        async function loadPromotions() {
            try {
                const snap = await get(ref(db, 'promotions'));
                const promotions = snap.val() || {};
                window.promotionsDataCache = promotions;
                const container = document.getElementById('promotions-list');
                let html = '';
                for (let key in promotions) {
                    const p = promotions[key];
                    html += `
                                <div style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--bg-input);border-radius:var(--radius-sm);border:1px solid var(--border-color);">
                                    ${p.image ? `<img src="${p.image}" style="width:60px;height:60px;border-radius:8px;object-fit:cover;border:1px solid var(--border-color);" />` : '<div style="width:60px;height:60px;background:var(--bg-card);border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--text-muted);"><i class="fas fa-image"></i></div>'}
                                    <div style="flex:1;">
                                        <div style="font-weight:600;">${p.title}</div>
                                        <div style="font-size:11px;color:var(--text-muted);">${p.link || 'No link'}</div>
                                    </div>
                                    <div>
                                        <button class="btn btn-primary btn-sm" onclick="editPromo('${key}')"><i class="fas fa-edit"></i></button>
                                        <button class="btn btn-danger btn-sm" onclick="deletePromo('${key}')"><i class="fas fa-trash"></i></button>
                                    </div>
                                </div>
                            `;
                }
                container.innerHTML = html ||
                    '<div style="padding:20px;text-align:center;color:var(--text-muted);">No promotions</div>';
            } catch (e) {
                console.error("Promotions load error:", e);
                document.getElementById('promotions-list').innerHTML =
                    '<div style="padding:20px;text-align:center;color:var(--text-red);">Error loading promotions</div>';
            }
        }

        window.editPromo = (id) => {
            const p = window.promotionsDataCache[id];
            if (!p) return;
            document.getElementById('edit-promo-id').value = id;
            document.getElementById('edit-promo-title').value = p.title || '';
            document.getElementById('edit-promo-img').value = p.image || '';
            document.getElementById('edit-promo-link').value = p.link || '';
            openModal('modal-edit-promo');
        };

        window.deletePromo = async (id) => {
            if (!confirm('Delete this promotion?')) return;
            showLoader();
            try {
                await remove(ref(db, 'promotions/' + id));
                showToast('Deleted');
                loadPromotions();
            } catch (e) { showToast('Error', 'error'); }
            hideLoader();
        };

        document.getElementById('btn-add-promo').onclick = async () => {
            const title = document.getElementById('promo-title').value.trim();
            if (!title) return showToast('Title required', 'error');
            const data = {
                title,
                image: document.getElementById('promo-img').value.trim(),
                link: document.getElementById('promo-link').value.trim(),
                createdAt: serverTimestamp()
            };
            showLoader();
            try {
                const refPush = push(ref(db, 'promotions'));
                await set(refPush, data);
                showToast('Promotion added');
                document.getElementById('promo-title').value = '';
                document.getElementById('promo-img').value = '';
                document.getElementById('promo-link').value = '';
                loadPromotions();
            } catch (e) { showToast('Error', 'error'); }
            hideLoader();
        };

        document.getElementById('btn-save-edit-promo').onclick = async () => {
            const id = document.getElementById('edit-promo-id').value;
            const data = {
                title: document.getElementById('edit-promo-title').value.trim(),
                image: document.getElementById('edit-promo-img').value.trim(),
                link: document.getElementById('edit-promo-link').value.trim()
            };
            showLoader();
            try {
                await update(ref(db, 'promotions/' + id), data);
                showToast('Updated');
                closeModal('modal-edit-promo');
                loadPromotions();
            } catch (e) { showToast('Error', 'error'); }
            hideLoader();
        };

        // ============================================
        // COUPONS
        // ============================================
        async function loadCoupons() {
            try {
                const snap = await get(ref(db, 'coupons'));
                const coupons = snap.val() || {};
                const tbody = document.getElementById('coupons-tbody');
                let html = '';
                for (let key in coupons) {
                    const c = coupons[key];
                    const used = c.used || 0;
                    const max = c.maxUses || '∞';
                    const status = c.active !== false ? 'active' : 'inactive';
                    html += `
                                <tr>
                                    <td><span class="coupon-code-display">${c.code}</span></td>
                                    <td>${c.discount}%</td>
                                    <td>${used} / ${max}</td>
                                    <td><span class="badge badge-${status}">${status}</span></td>
                                    <td>
                                        <button class="btn btn-outline btn-sm" onclick="toggleCoupon('${key}', ${c.active !== false ? 'false' : 'true'})"><i class="fas fa-${c.active !== false ? 'pause' : 'play'}"></i></button>
                                        <button class="btn btn-danger btn-sm" onclick="deleteCoupon('${key}')"><i class="fas fa-trash"></i></button>
                                    </td>
                                </tr>
                            `;
                }
                tbody.innerHTML = html ||
                    '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">No coupons</td></tr>';
            } catch (e) {
                console.error("Coupons load error:", e);
                document.getElementById('coupons-tbody').innerHTML =
                    '<tr><td colspan="5" style="text-align:center;color:var(--text-red);">Error loading coupons</td></tr>';
            }
        }

        window.toggleCoupon = async (id, active) => {
            showLoader();
            try {
                await update(ref(db, 'coupons/' + id), { active });
                loadCoupons();
            } catch (e) { showToast('Error', 'error'); }
            hideLoader();
        };

        window.deleteCoupon = async (id) => {
            if (!confirm('Delete coupon?')) return;
            showLoader();
            try {
                await remove(ref(db, 'coupons/' + id));
                loadCoupons();
            } catch (e) { showToast('Error', 'error'); }
            hideLoader();
        };

        document.getElementById('btn-add-coupon').onclick = async () => {
            const code = document.getElementById('coupon-code').value.trim().toUpperCase();
            const discount = parseInt(document.getElementById('coupon-discount').value);
            const maxUses = parseInt(document.getElementById('coupon-max').value) || 0;
            if (!code || !discount || discount < 1 || discount > 100) return showToast('Valid code & discount (1-100)',
                'error');
            const data = { code, discount, maxUses: maxUses > 0 ? maxUses : Infinity, used: 0, active: true,
                createdAt: serverTimestamp() };
            showLoader();
            try {
                await set(ref(db, 'coupons/' + code), data);
                showToast('Coupon created');
                document.getElementById('coupon-code').value = '';
                document.getElementById('coupon-discount').value = '';
                document.getElementById('coupon-max').value = '';
                loadCoupons();
            } catch (e) { showToast('Error', 'error'); }
            hideLoader();
        };

        // ============================================
        // REFERRALS
        // ============================================
        async function loadReferrals() {
            try {
                const bonusSnap = await get(ref(db, 'settings/referral'));
                let bonus = 50;
                if (bonusSnap.exists() && bonusSnap.val().bonus) {
                    bonus = bonusSnap.val().bonus;
                }
                document.getElementById('ref-bonus-input').value = bonus;
                document.getElementById('ref-bonus').innerText = bonus;

                const usersSnap = await get(ref(db, 'users'));
                const users = usersSnap.val() || {};
                let totalRefs = 0,
                    activeRefs = 0,
                    totalEarnings = 0;
                const userMap = {};
                for (let uid in users) {
                    const u = users[uid];
                    userMap[uid] = u;
                    if (u.referralStats) {
                        totalRefs += u.referralStats.total || 0;
                        totalEarnings += u.referralStats.earnings || 0;
                        if (u.status !== 'banned' && u.referralStats.total > 0) {
                            activeRefs += 1;
                        }
                    }
                }
                document.getElementById('ref-total').innerText = totalRefs;
                document.getElementById('ref-active').innerText = activeRefs;
                document.getElementById('ref-earnings').innerText = '₦' + totalEarnings.toFixed(2);

                const refsSnap = await get(ref(db, 'referrals'));
                const events = [];
                if (refsSnap.exists()) {
                    refsSnap.forEach(uid => {
                        uid.forEach(ev => {
                            const e = ev.val();
                            e.id = ev.key;
                            e.referrerUid = uid.key;
                            events.push(e);
                        });
                    });
                }
                events.sort((a, b) => (b.date || 0) - (a.date || 0));
                const tbody = document.getElementById('ref-events-tbody');
                let html = '';
                events.forEach(e => {
                    const referrer = userMap[e.referrerUid]?.email || e.referrerUid || 'Unknown';
                    const referred = e.referredEmail || e.referredUid || 'Unknown';
                    const status = e.status === 'active' ? '<span class="badge badge-active">Active</span>' :
                        '<span class="badge badge-inactive">Inactive</span>';
                    html += `
                                <tr>
                                    <td>${e.date ? new Date(e.date).toLocaleString() : '-'}</td>
                                    <td>${referrer}</td>
                                    <td>${referred}</td>
                                    <td style="font-weight:700;color:var(--accent-green);">₦${e.bonus || 0}</td>
                                    <td>${status}</td>
                                </tr>
                            `;
                });
                tbody.innerHTML = html ||
                    '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">No referral events</td></tr>';

                document.getElementById('search-ref-events').addEventListener('input', function() {
                    const term = this.value.toLowerCase();
                    document.querySelectorAll('#ref-events-tbody tr').forEach(row => {
                        row.style.display = row.innerText.toLowerCase().includes(term) ? '' : 'none';
                    });
                });
            } catch (e) {
                console.error("Referrals load error:", e);
                showToast('Error loading referrals', 'error');
            }
        }

        document.getElementById('btn-save-ref-bonus').onclick = async () => {
            const bonus = parseInt(document.getElementById('ref-bonus-input').value);
            if (isNaN(bonus) || bonus < 1) return showToast('Enter a valid bonus amount', 'error');
            showLoader();
            try {
                await set(ref(db, 'settings/referral'), { bonus });
                showToast('Referral bonus updated!');
                loadReferrals();
            } catch (e) { showToast('Error saving', 'error'); }
            hideLoader();
        };

        // ============================================
        // CSV EXPORT (Users / Orders)
        // ============================================
        function downloadCsv(filename, rows) {
            // Escapes each cell for CSV (wraps in quotes, doubles inner quotes)
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

        document.getElementById('btn-export-users').addEventListener('click', () => {
            const users = window.allUsersCache || {};
            const uids = Object.keys(users);
            if (!uids.length) return showToast('No users to export', 'error');
            const rows = [['UID', 'Email', 'Joined', 'Balance', 'Status', 'VIP']];
            uids.forEach(uid => {
                const u = users[uid];
                rows.push([
                    uid,
                    u.email || '',
                    u.createdAt ? new Date(u.createdAt).toISOString() : '',
                    parseFloat(u.balance || 0).toFixed(2),
                    u.status || 'active',
                    u.isVip ? 'yes' : 'no'
                ]);
            });
            downloadCsv(`zerx-xit-users-${Date.now()}.csv`, rows);
            showToast(`Exported ${uids.length} users to CSV`);
        });

        document.getElementById('btn-export-orders').addEventListener('click', () => {
            const list = window.allOrdersCache || [];
            if (!list.length) return showToast('No orders to export', 'error');
            const rows = [['Order ID', 'UID', 'Email', 'Panel', 'Plan', 'Amount', 'Status', 'Date']];
            list.forEach(o => {
                rows.push([
                    o.id || '',
                    o.uid || '',
                    o.email || '',
                    o.panelName || '',
                    o.label || o.plan || '',
                    o.price || o.amount || 0,
                    o.status || 'pending',
                    o.timestamp ? new Date(o.timestamp).toISOString() : (o.date ? new Date(o.date).toISOString() : '')
                ]);
            });
            downloadCsv(`zerx-xit-orders-${Date.now()}.csv`, rows);
            showToast(`Exported ${list.length} orders to CSV`);
        });

        // ============================================
        // PAYMENT SETTINGS
        // ============================================
        async function loadPaymentSettings() {
            try {
                const snap = await get(ref(db, 'settings/payment'));
                if (snap.exists()) {
                    const data = snap.val();
                    document.getElementById('set-upi').value = data.upi || '';
                    document.getElementById('set-qr').value = data.qr || '';
                    const preview = document.getElementById('qr-preview');
                    if (data.qr && data.qr.length > 5) {
                        preview.innerHTML =
                            `<img src="${data.qr}" style="max-width:160px;max-height:160px;border-radius:12px;border:1px solid var(--border-color);object-fit:contain;background:var(--bg-input);" />`;
                    } else {
                        preview.innerHTML = '<span class="text-muted text-xs">No QR set</span>';
                    }
                }
            } catch (e) { console.error("Payment settings load error:", e); }
        }

        document.getElementById('btn-save-payment').onclick = async () => {
            const upi = document.getElementById('set-upi').value.trim();
            const qr = document.getElementById('set-qr').value.trim();
            showLoader();
            try {
                await set(ref(db, 'settings/payment'), { upi, qr });
                showToast('Payment settings saved');
                loadPaymentSettings();
            } catch (e) { showToast('Error', 'error'); }
            hideLoader();
        };

        document.getElementById('btn-save-vip-price').onclick = async () => {
            const price = parseFloat(document.getElementById('set-vip-price').value);
            if (!price || price <= 0) return showToast('Enter a valid price', 'error');
            showLoader();
            try {
                await set(ref(db, 'settings/vipPrice'), price);
                showToast('VIP price saved');
            } catch (e) { showToast('Error saving VIP price', 'error'); }
            hideLoader();
        };

        // ============================================
        // SUPPORT LINKS
        // ============================================
        async function loadSupportLinks() {
            try {
                const snap = await get(ref(db, 'support_links'));
                if (snap.exists()) {
                    const data = snap.val();
                    document.getElementById('set-wa').value = data.whatsapp || '';
                    document.getElementById('set-wa-channel').value = data.whatsapp_channel || '';
                    document.getElementById('set-tg-login').value = data.telegram_login || '';
                    document.getElementById('set-tg-dash').value = data.telegram_dashboard || '';
                }
            } catch (e) { console.error("Support links load error:", e); }
        }

        document.getElementById('btn-save-support').onclick = async () => {
            const data = {
                whatsapp: document.getElementById('set-wa').value.trim(),
                whatsapp_channel: document.getElementById('set-wa-channel').value.trim(),
                telegram_login: document.getElementById('set-tg-login').value.trim(),
                telegram_dashboard: document.getElementById('set-tg-dash').value.trim()
            };
            showLoader();
            try {
                await set(ref(db, 'support_links'), data);
                showToast('Support links updated');
            } catch (e) { showToast('Error', 'error'); }
            hideLoader();
        };

        // ============================================
        // BRANDING
        // ============================================
        async function loadBranding() {
            try {
                const snap = await get(ref(db, 'settings/branding'));
                if (snap.exists()) {
                    const data = snap.val();
                    window.currentBranding = data;
                    document.getElementById('brand-name').value = data.name || '';
                    const preview = document.getElementById('logo-preview');
                    const status = document.getElementById('logo-status');
                    if (data.logo && data.logo.startsWith('data:image')) {
                        preview.src = data.logo;
                        preview.style.display = 'block';
                        status.textContent = '✅ Logo loaded (base64)';
                    } else if (data.logo && data.logo.length > 5) {
                        preview.src = data.logo;
                        preview.style.display = 'block';
                        status.textContent = '✅ Logo loaded (URL)';
                    } else {
                        preview.style.display = 'none';
                        status.textContent = 'No logo uploaded';
                    }
                } else {
                    window.currentBranding = {};
                    document.getElementById('logo-preview').style.display = 'none';
                    document.getElementById('logo-status').textContent = 'No branding found';
                }
            } catch (e) { console.error("Branding load error:", e); }
        }

        document.getElementById('btn-upload-logo').addEventListener('click', () => {
            const fileInput = document.getElementById('logo-file-input');
            const file = fileInput.files[0];
            if (!file) { showToast('Please select an image', 'error'); return; }
            if (file.size > 500 * 1024) { showToast('Image too large. Max 500KB.', 'error'); return; }
            const reader = new FileReader();
            reader.onload = (e) => {
                const base64 = e.target.result;
                const preview = document.getElementById('logo-preview');
                preview.src = base64;
                preview.style.display = 'block';
                document.getElementById('logo-status').textContent = '✅ Preview loaded. Click "Update Branding" to save.';
                window.currentBranding = window.currentBranding || {};
                window.currentBranding.logo = base64;
                showToast('Logo loaded. Click "Update Branding" to save.', 'success');
            };
            reader.onerror = () => showToast('Failed to read file', 'error');
            reader.readAsDataURL(file);
        });

        document.getElementById('btn-remove-logo').addEventListener('click', async () => {
            if (!confirm('Remove logo?')) return;
            window.currentBranding = window.currentBranding || {};
            window.currentBranding.logo = '';
            document.getElementById('logo-preview').style.display = 'none';
            document.getElementById('logo-status').textContent = 'Logo removed';
            await saveBranding();
        });

        async function saveBranding() {
            showLoader();
            try {
                const name = document.getElementById('brand-name').value.trim();
                await set(ref(db, 'settings/branding'), { name: name || 'ZERX-XIT', logo: window.currentBranding.logo ||
                        '' });
                showToast('Branding updated!');
                await loadBranding();
            } catch (e) { showToast('Error saving', 'error'); }
            hideLoader();
        }
        document.getElementById('btn-save-branding').onclick = saveBranding;

        // ============================================
        // ANIMATIONS
        // ============================================
        async function getAnimationSelection() {
            try {
                const snap = await get(ref(db, 'settings/animations'));
                return snap.val()?.selected || 'aurora';
            } catch (e) { return 'aurora'; }
        }
        async function loadAnimationSelection() {
            try {
                const selected = await getAnimationSelection();
                document.getElementById('anim-select').value = selected;
                switchAnimation(selected);
            } catch (e) {}
        }
        document.getElementById('btn-save-animation').addEventListener('click', async () => {
            const selected = document.getElementById('anim-select').value;
            showLoader();
            try {
                await set(ref(db, 'settings/animations'), { selected });
                showToast('Animation updated for all users!');
                switchAnimation(selected);
            } catch (e) { showToast('Failed to save', 'error'); }
            hideLoader();
        });

        console.log("✅ ZERX-XIT Admin Panel fully loaded with Download Link & Access File features!");
