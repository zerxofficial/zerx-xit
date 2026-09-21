/**
 * ZERX-XIT — Render web service
 * ==============================
 * This is the Render-hosted equivalent of functions/index.js (which is the
 * Firebase Cloud Functions version — kept in this package too, as a fallback
 * if you ever move back to Firebase). It does two jobs:
 *
 *   1. Serves the static site (hosting/user.html, admin.html, diagnostic.html)
 *   2. Exposes /api/generateSensi and /api/verifyZerxCode — the two routes
 *      that need a real server, because they touch secrets (the Gemini key,
 *      and the admin's verification code) that must never reach the browser.
 *
 * Nothing else about the app changes: Firebase Auth + the Realtime Database
 * are still used directly from the browser exactly as before (that's what
 * the public `apiKey` in firebaseConfig is for — it's not a secret, it just
 * identifies the project). Only these two endpoints move from Cloud
 * Functions to this Express server.
 *
 * Required environment variables (set these in the Render dashboard under
 * your service → Environment — see DEPLOY-RENDER.md):
 *
 *   GEMINI_API_KEY              Your Gemini API key. Without it, the sensi
 *                                generator silently uses the offline
 *                                deterministic calculator (same as before).
 *   GEMINI_MODEL                 Optional, defaults to gemini-1.5-flash.
 *   FIREBASE_SERVICE_ACCOUNT     The full JSON content of a Firebase service
 *                                account key (Firebase Console → Project
 *                                Settings → Service accounts → Generate new
 *                                private key). Paste the whole file content.
 *                                Without it, the verification-code check is
 *                                skipped and codes are accepted automatically
 *                                (same "not wired up yet" fallback the
 *                                original build used) — join+share are still
 *                                required, only the code itself isn't
 *                                checked server-side until this is set.
 *   FIREBASE_DATABASE_URL         Defaults to this project's database if unset.
 */

const path = require('path');
const express = require('express');

const app = express();
app.use(express.json({ limit: '200kb' }));

// ---------------------------------------------------------------------------
// Firebase Admin (used only by /api/verifyZerxCode, to read/write the
// Realtime Database with rules bypassed — same as the Cloud Function did).
// ---------------------------------------------------------------------------
let adminDb = null;
try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (raw && raw.trim()) {
        const admin = require('firebase-admin');
        const serviceAccount = JSON.parse(raw);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://zerx-store-bd8f0-default-rtdb.firebaseio.com'
        });
        adminDb = admin.database();
        console.log('[startup] Firebase Admin ready — verifyZerxCode will check codes for real.');
    } else {
        console.warn('[startup] FIREBASE_SERVICE_ACCOUNT not set — verifyZerxCode will accept any code ' +
            '(join+share are still required client-side). See DEPLOY-RENDER.md to enable real checking.');
    }
} catch (e) {
    console.error('[startup] Failed to initialize Firebase Admin — verifyZerxCode will accept any code. ' +
        'Check that FIREBASE_SERVICE_ACCOUNT contains valid JSON. Error:', e.message);
}

// ---------------------------------------------------------------------------
// Shared sensitivity-generation logic (identical to functions/index.js)
// ---------------------------------------------------------------------------
const RANGES = {
    general: [10, 100], red_dot: [10, 100], scope2x: [10, 100], scope4x: [10, 100],
    sniper: [10, 100], free_look: [10, 100], fire_button: [25, 75], dpi: [200, 1200]
};

function clamp(v, lo, hi) {
    v = Number(v);
    if (!Number.isFinite(v)) return null;
    return Math.max(lo, Math.min(hi, Math.round(v)));
}

const PROC_TIERS = {
    'snapdragon 8 elite': 100, 'snapdragon 8 gen 3': 100, 'a17 pro': 100, 'tensor g3': 95,
    'snapdragon 8 gen 2': 95, 'a16 bionic': 95, 'snapdragon 8+ gen 1': 92, 'snapdragon 888': 85,
    'snapdragon 8 gen 1': 89, 'dimensity 8200': 84, 'snapdragon 7 gen 3': 82, 'a15 bionic': 88,
    'dimensity 7200': 80, 'tensor g2': 80, 'snapdragon 778g': 72, 'snapdragon 695': 64,
    'snapdragon 685': 60, 'helio g99': 62, 'exynos 1380': 68, 'exynos 850': 44,
    'dimensity 700': 52, 'helio g85': 55, 'helio g88': 56, 'helio g80': 50,
    'unisoc t616': 48, 'helio g36': 40, 'unisoc t606': 38, 'unisoc t603': 35,
    'helio p35': 34, 'snapdragon 4 gen 1': 50
};
const STYLE_MODS = {
    'One Tap': { general: 0.85, red_dot: 0.75, scope2x: 0.70, scope4x: 0.65, sniper: 0.55, free_look: 0.80, dpi_mod: 1.10 },
    'Balanced': { general: 1.00, red_dot: 1.00, scope2x: 1.00, scope4x: 1.00, sniper: 1.00, free_look: 1.00, dpi_mod: 1.00 },
    'Rusher': { general: 1.20, red_dot: 1.15, scope2x: 1.10, scope4x: 1.05, sniper: 0.90, free_look: 1.20, dpi_mod: 0.95 },
    'Freestyle': { general: 1.10, red_dot: 1.05, scope2x: 1.00, scope4x: 0.95, sniper: 0.85, free_look: 1.15, dpi_mod: 1.05 },
    'Sniper': { general: 0.75, red_dot: 0.65, scope2x: 0.60, scope4x: 0.55, sniper: 0.45, free_look: 0.70, dpi_mod: 1.20 },
    'Instaplayer': { general: 1.30, red_dot: 1.25, scope2x: 1.20, scope4x: 1.10, sniper: 1.00, free_look: 1.30, dpi_mod: 0.90 }
};
function procScore(name) {
    if (!name) return 50;
    const p = String(name).toLowerCase();
    if (PROC_TIERS[p] !== undefined) return PROC_TIERS[p];
    for (const key in PROC_TIERS) { if (p.includes(key) || key.includes(p)) return PROC_TIERS[key]; }
    return 50;
}
function deterministicFallback(device, style) {
    const perf = Number(device.performance_score) || 50;
    const gaming = Number(device.gaming_score) || 50;
    const ram = parseInt(String(device.ram || '4GB'), 10) || 4;
    const ramMod = ram >= 12 ? 1.05 : ram >= 8 ? 1.02 : ram >= 6 ? 1.0 : ram >= 4 ? 0.97 : 0.9;
    const refresh = parseInt(String(device.refresh_rate || '60'), 10) || 60;
    const refreshMod = refresh >= 144 ? 1.08 : refresh >= 120 ? 1.05 : refresh >= 90 ? 1.02 : 1.0;
    let hw = ((procScore(device.processor) + perf + gaming) / 300) * 0.4 + 0.8;
    hw = Math.max(0.75, Math.min(1.25, hw));
    const combined = hw * ramMod * refreshMod;
    const mod = STYLE_MODS[style] || STYLE_MODS['Balanced'];
    const bases = { general: 85, red_dot: 90, scope2x: 75, scope4x: 65, sniper: 50, free_look: 70, dpi: 400 };
    const out = {};
    for (const k in bases) {
        const v = k === 'dpi' ? bases[k] * combined * mod.dpi_mod : bases[k] * combined * (mod[k] ?? 1);
        out[k] = clamp(v, ...(RANGES[k] || [10, 100]));
    }
    out.fire_button = clamp(35 + out.general * 0.25, 25, 75);
    return out;
}

function buildPrompt(device, style, existing, feedback, correction) {
    const lines = [
        'You are tuning Free Fire touch-sensitivity for one specific Android/iOS device.',
        `Device: ${device.brand || 'Unknown'} ${device.model || 'Unknown'}`,
        `Chipset: ${device.processor || 'unknown'}, RAM: ${device.ram || 'unknown'}, Refresh: ${device.refresh_rate || 'unknown'}`,
        `OS: ${device.android_version || device.os || 'unknown'}`,
        `Play style: ${style}`
    ];
    if (existing) lines.push(`Current preset to refine (not replace blindly): ${JSON.stringify(existing)}`);
    if (feedback) lines.push(`User feedback on current preset: "${feedback}" — adjust accordingly, don't regenerate unrelated values.`);
    if (correction) lines.push(`CORRECTION NEEDED: your previous response was rejected because: ${correction}. Produce a genuinely different, hardware-reasoned response this time — do not repeat the same mistake.`);
    lines.push(
        'Return ONLY compact JSON, no prose, no markdown fences, matching exactly:',
        '{"general":n,"red_dot":n,"scope2x":n,"scope4x":n,"sniper":n,"free_look":n,"fire_button":n,"dpi":n,"reasoning":"one short sentence explaining the hardware reasoning"}',
        'All sensitivity fields are integers 10-100, fire_button is 25-75, dpi is 200-1200 (omit dpi entirely for iOS devices).',
        'Base every value on real hardware tradeoffs: weaker chipsets, less RAM, and lower refresh rates need LOWER values for stable tracking; stronger hardware can support HIGHER values.',
        'The six sensitivity fields must NOT all be equal to each other, and must NOT all default to 100 — that indicates you ignored the device and is treated as an invalid response.',
        'reasoning must be a genuine sentence (at least 8 words) referencing this device\'s actual hardware, not a generic placeholder.'
    );
    return lines.join('\n');
}

async function callGemini(apiKey, model, prompt) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.5, maxOutputTokens: 300 }
            }),
            signal: controller.signal
        });
        if (!res.ok) throw new Error('Gemini HTTP ' + res.status);
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const cleaned = text.replace(/```json|```/g, '').trim();
        return JSON.parse(cleaned);
    } finally {
        clearTimeout(timeout);
    }
}

// Strict anti-bad-output validation. Returns { ok: true, value } or
// { ok: false, reason } — the reason is fed back into the correction
// prompt on retry, and surfaced (generically) in the error response if
// both attempts fail, so this is never a silent pass-through.
function validateGeminiOutput(raw, device) {
    if (!raw || typeof raw !== 'object') return { ok: false, reason: 'response was not valid JSON' };

    const isIOS = String(device.android_version || device.os || '').toLowerCase().includes('ios') ||
        String(device.brand || '').toLowerCase() === 'apple';

    const coreKeys = ['general', 'red_dot', 'scope2x', 'scope4x', 'sniper', 'free_look'];
    const core = {};
    for (const k of coreKeys) {
        const v = Number(raw[k]);
        if (!Number.isFinite(v)) return { ok: false, reason: `missing or non-numeric "${k}"` };
        const [lo, hi] = RANGES[k];
        if (v < lo - 5 || v > hi + 5) return { ok: false, reason: `"${k}" (${v}) is outside the allowed ${lo}-${hi} range` };
        core[k] = clamp(v, lo, hi);
    }

    // All six values identical → the model ignored the device entirely.
    const distinctValues = new Set(Object.values(core));
    if (distinctValues.size === 1) return { ok: false, reason: 'all six sensitivity values were identical' };

    // Most values pinned to the max → classic "just output 100" failure mode.
    const hundredCount = Object.values(core).filter(v => v >= 99).length;
    if (hundredCount >= 5) return { ok: false, reason: 'nearly all values defaulted to the maximum (100)' };

    const fireRaw = Number(raw.fire_button);
    const fire_button = Number.isFinite(fireRaw)
        ? clamp(fireRaw, ...RANGES.fire_button)
        : clamp(35 + core.general * 0.25, ...RANGES.fire_button);

    let dpi;
    if (!isIOS) {
        const dpiRaw = Number(raw.dpi);
        if (!Number.isFinite(dpiRaw)) return { ok: false, reason: 'missing "dpi" for a non-iOS device' };
        if (dpiRaw < RANGES.dpi[0] - 50 || dpiRaw > RANGES.dpi[1] + 50) {
            return { ok: false, reason: `"dpi" (${dpiRaw}) is an implausible value` };
        }
        dpi = clamp(dpiRaw, ...RANGES.dpi);
    }

    const reasoning = typeof raw.reasoning === 'string' ? raw.reasoning.trim() : '';
    if (reasoning.split(/\s+/).filter(Boolean).length < 5) {
        return { ok: false, reason: 'reasoning was missing or too generic/short' };
    }

    const out = { ...core, fire_button, reasoning: reasoning.slice(0, 240) };
    if (!isIOS) out.dpi = dpi;
    return { ok: true, value: out };
}

// Tries Gemini up to twice (second attempt includes a correction prompt
// naming exactly what was wrong with the first). Never fabricates a
// result on failure — the caller decides what to show when this returns
// null, and it always knows *why* via the returned reason.
async function generateWithGemini(apiKey, model, device, style, existing, feedback) {
    let lastReason = null;
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const prompt = buildPrompt(device, style, existing, feedback, lastReason);
            const raw = await callGemini(apiKey, model, prompt);
            const validated = validateGeminiOutput(raw, device);
            if (validated.ok) return { value: validated.value, reason: null };
            lastReason = validated.reason;
            console.warn(`Gemini attempt ${attempt + 1} rejected: ${validated.reason}`);
        } catch (e) {
            lastReason = 'the AI service did not respond correctly (' + e.message + ')';
            console.error(`Gemini attempt ${attempt + 1} failed:`, e.message);
        }
    }
    return { value: null, reason: lastReason };
}

app.post('/api/generateSensi', async (req, res) => {
    const body = req.body || {};
    const device = body.device || {};
    const style = STYLE_MODS[body.playStyle] ? body.playStyle : 'Balanced';
    const existing = body.existing || null;
    const feedback = typeof body.feedback === 'string' ? body.feedback.slice(0, 200) : null;

    if (!device.brand && !device.model) {
        res.status(400).json({ error: 'device.brand or device.model required' });
        return;
    }

    const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    const apiKey = process.env.GEMINI_API_KEY;

    // No key configured at all — this is an intentional, honestly-labeled
    // mode, not a failure. The offline calculator is a real hardware-aware
    // model (see deterministicFallback above), not random numbers.
    if (!apiKey) {
        const det = deterministicFallback(device, style);
        res.status(200).json({
            success: true, source: 'offline', play_style: style,
            ...det, reasoning: 'Calculated from device hardware profile using the offline model (Gemini not configured).'
        });
        return;
    }

    // A key IS configured, so the user is expecting real AI generation.
    // Try Gemini (with one corrective retry on invalid output). If it still
    // can't produce a valid result, say so honestly — do NOT quietly swap
    // in the offline calculator and call it AI.
    const { value, reason } = await generateWithGemini(apiKey, model, device, style, existing, feedback);

    if (value) {
        res.status(200).json({ success: true, source: 'gemini', play_style: style, ...value });
        return;
    }

    console.error('generateSensi: Gemini failed after retry —', reason);
    const det = deterministicFallback(device, style);
    res.status(200).json({
        success: false,
        source: 'error',
        message: 'AI generation failed and was not used. You can generate an offline hardware-based estimate instead, or try AI generation again.',
        offlineFallback: { ...det, reasoning: 'Calculated from device hardware profile using the offline model.' },
        play_style: style
    });
});

// ---------------------------------------------------------------------------
// Verification code check (identical logic to functions/index.js)
// ---------------------------------------------------------------------------
const MAX_CODE_ATTEMPTS = 3;

app.post('/api/verifyZerxCode', async (req, res) => {
    const { uid, code } = req.body || {};
    if (!uid || typeof code !== 'string' || !code.trim()) {
        res.status(400).json({ error: 'uid and code are required' });
        return;
    }

    if (!adminDb) {
        // Service account not configured yet — don't block real users over a
        // setup step that hasn't happened. Join + share are still required
        // client-side; only the code text itself isn't checked yet.
        res.status(200).json({ success: true, message: 'Verification complete.' });
        return;
    }

    const userRef = adminDb.ref('users/' + uid);

    try {
        const userSnap = await userRef.get();
        const user = userSnap.val() || {};

        if (user.status === 'banned') {
            res.status(403).json({
                success: false, banned: true, zerxId: user.zerxId || '',
                message: 'This device is banned. Submit an appeal to regain access.'
            });
            return;
        }

        const settingsSnap = await adminDb.ref('settings/verification/code').get();
        const correctCode = String(settingsSnap.val() || 'ZERX FOR 2027').trim().toUpperCase();
        const submitted = code.trim().toUpperCase();

        if (submitted === correctCode) {
            await userRef.child('verifyAttempts').set(0);
            res.status(200).json({ success: true, message: 'Verification complete.' });
            return;
        }

        const txResult = await userRef.child('verifyAttempts').transaction((curr) => (curr || 0) + 1);
        const attempts = txResult.snapshot.val() || 1;
        const remaining = MAX_CODE_ATTEMPTS - attempts;

        if (remaining > 0) {
            res.status(400).json({
                success: false,
                message: `Incorrect code. ${remaining} attempt(s) left before this device is blocked.`,
                attemptsLeft: remaining
            });
            return;
        }

        const zerxId = 'ZX-' + Math.random().toString(16).slice(2, 10).toUpperCase();
        await userRef.update({
            status: 'banned',
            banReason: 'Invalid Verification Code',
            zerxId,
            bannedAt: Date.now()
        });
        await userRef.child('verifyAttempts').set(0);
        res.status(403).json({
            success: false, banned: true, zerxId,
            message: 'Too many incorrect codes. Device blocked.'
        });
    } catch (e) {
        console.error('verifyZerxCode failed:', e.message);
        res.status(500).json({ success: false, message: 'Verification service error. Try again shortly.' });
    }
});

// Simple health check — useful for confirming the Render deploy is alive.
app.get('/healthz', (req, res) => res.status(200).json({
    ok: true,
    geminiConfigured: !!process.env.GEMINI_API_KEY,
    verificationDbConfigured: !!adminDb
}));

// ---------------------------------------------------------------------------
// Static site — mirrors the rewrites in firebase.json
// ---------------------------------------------------------------------------
const HOSTING_DIR = path.join(__dirname, 'hosting');
app.use(express.static(HOSTING_DIR));
app.get('/', (req, res) => res.sendFile(path.join(HOSTING_DIR, 'user.html')));
app.get('/diagnostic', (req, res) => res.sendFile(path.join(HOSTING_DIR, 'diagnostic.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`ZERX-XIT server listening on port ${PORT}`);
});
