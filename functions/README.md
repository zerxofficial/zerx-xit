# Turning on real AI sensitivity generation — step by step

You've never used the Firebase CLI before, so this walks through every
single command. Do these on your computer (not your phone), in a terminal
— on Windows that's "Command Prompt" or "PowerShell", on Mac it's
"Terminal".

You should have unzipped `zerx-xit-package.zip` somewhere first — these
steps assume you're inside that unzipped folder (the one containing
`admin.html`, `user.html`, `firebase.json`, and the `functions/` folder).

---

## Step 0 — Check you have Node.js

Type this and press enter:

```bash
node -v
```

If you see a version number (like `v20.11.0`), you're fine — skip to Step 1.

If you see "command not found" / "not recognized", install Node.js first:
go to **https://nodejs.org**, download the "LTS" version, install it like
any normal program, then close and reopen your terminal and try `node -v`
again.

## Step 1 — Install the Firebase CLI

This is a one-time install on your computer:

```bash
npm install -g firebase-tools
```

Takes a minute. When it finishes, check it worked:

```bash
firebase --version
```

## Step 2 — Log in to Firebase

```bash
firebase login
```

This opens your browser and asks you to sign in with the **same Google
account** that owns your `zerx-store-bd8f0` Firebase project. Approve it,
then come back to the terminal — it should say you're logged in.

## Step 3 — Move into the package folder

```bash
cd path/to/zerx-xit-package
```

Replace `path/to/zerx-xit-package` with wherever you unzipped it. (Tip: on
most systems you can type `cd ` with a trailing space, then drag the
folder into the terminal window, and it fills in the path for you.)

Check you're in the right place:

```bash
firebase projects:list
```

You should see `zerx-store-bd8f0` in the list. The `.firebaserc` file
already included in this folder points at that project automatically, so
you won't be asked to pick one.

## Step 4 — Install the function's dependencies

```bash
cd functions
npm install
cd ..
```

## Step 5 — Confirm you're on the Blaze plan

Cloud Functions require Firebase's "Blaze" (pay-as-you-go) plan — the free
"Spark" plan can't run them. If you're not sure, open
**https://console.firebase.google.com/project/zerx-store-bd8f0/usage/details**
and check. If it still says Spark, there's an "Upgrade" button right there.
This function is cheap to run (short prompts, capped output, 15-second max
runtime per call), so realistic cost is a few cents even with regular use.

## Step 6 — Store your Gemini key as a secret

This is the important one — your key gets encrypted and stored by Firebase,
never written into any file:

```bash
firebase functions:secrets:set GEMINI_API_KEY
```

It will prompt:

```
? Enter a value for GEMINI_API_KEY
```

Paste your real Gemini API key and press enter. It will confirm it saved.

## Step 7 — Deploy

```bash
firebase deploy --only functions:generateSensi
```

This uploads and builds the function — can take 1–3 minutes the first
time. When it finishes, look for a line like:

```
✔  functions[generateSensi(us-central1)] Successful create operation.
Function URL (generateSensi): https://us-central1-zerx-store-bd8f0.cloudfunctions.net/generateSensi
```

**Copy that URL.** That's your deployed AI endpoint.

## Step 8 — Wire it into the site

Open `user.html` in a text editor, search for:

```
const SENSI_AI_ENDPOINT = '';
```

Paste your URL between the quotes:

```
const SENSI_AI_ENDPOINT = 'https://us-central1-zerx-store-bd8f0.cloudfunctions.net/generateSensi';
```

Save the file, re-upload it to wherever you host the site. That's it — the
Sensi Generator will now call real Gemini-generated sensitivity on every
click of "Generate my sensitivity", and silently fall back to the instant
offline calculation if the AI ever times out or fails.

**Don't want to edit it yourself?** Paste me the URL from Step 7 and I'll
make that one-line edit and send you the updated file.

---

## Checking it actually worked

Open the site, go to Sensi Generator, generate a preset. If it worked,
you'll see a small red **"AI-enhanced"** badge next to the result. If you
don't see that badge, it silently fell back to offline mode — check:

- Did `firebase deploy` actually succeed with no errors?
- Is the project on the Blaze plan (Step 5)?
- Did you paste the exact URL, including `https://`, into `SENSI_AI_ENDPOINT`?
- Open your browser's DevTools (F12) → Console tab while generating, and
  look for any red error messages — they'll usually say exactly what's wrong.

## Checking logs / cost

```bash
firebase functions:log --only generateSensi
```

Shows recent invocations and any server-side errors (these are never shown
to users — they only ever see a clean fallback result).

## If you ever want to change the Gemini model

Default is `gemini-1.5-flash`. To use a different one:

```bash
firebase functions:config:set gemini.model="gemini-1.5-pro"
firebase deploy --only functions:generateSensi
```

---

# Turning on the real verification gate (verifyZerxCode)

This is the "join → share → code" step that unlocks the deeper XIT tips in
the Sensi Generator for free users (VIP always skips it). It's a second,
separate function in this same `functions/index.js` file, so most of the
setup above (Node.js, Firebase CLI, login, Blaze plan) is shared — you only
need Steps 1–5 above once.

**Why this needs a function at all:** the join/share steps are just links
and a counter, so `user.html` handles those directly. But the *code* itself
is the admin's secret — if it were checked in the browser's own JavaScript,
anyone could read it out of the page source. This function checks it
server-side instead, using the Firebase Admin SDK, which can read
`settings/verification/code` in the database even though regular visitors
can't.

## Step 1 — Set the code and share count from the admin panel

Open `admin.html` → **Verification** in the sidebar. Set:
- **Required shares** — how many times a free user must share before they
  can enter a code (defaults to 5).
- **Verification code** — the exact text you'll post in your WhatsApp/Telegram
  channels (e.g. `ZERX FOR 2027`). Whatever you type here is what
  `verifyZerxCode` checks against.

No redeploy needed for this part — it's just a database write, same as
every other setting in the admin panel.

## Step 2 — Deploy the function (one time)

From the unzipped package folder:

```bash
cd functions
npm install
cd ..
firebase deploy --only functions:verifyZerxCode
```

When it finishes, copy the printed URL, e.g.:

```
Function URL (verifyZerxCode): https://us-central1-zerx-store-bd8f0.cloudfunctions.net/verifyZerxCode
```

## Step 3 — Wire it into the site

`user.html` derives this URL automatically from `SENSI_AI_ENDPOINT` (it
swaps `generateSensi` for `verifyZerxCode` in the same URL), so **if
you've already completed the AI setup above, there's nothing else to do.**

If you only want the verification gate and not AI generation, open
`user.html`, search for `const VERIFY_ENDPOINT`, and change:

```
const VERIFY_ENDPOINT = SENSI_AI_ENDPOINT
    ? SENSI_AI_ENDPOINT.replace(/generateSensi\s*$/, 'verifyZerxCode')
    : '';
```

to:

```
const VERIFY_ENDPOINT = 'https://us-central1-zerx-store-bd8f0.cloudfunctions.net/verifyZerxCode';
```

**Until you deploy this**, the "join & share to unlock" button still works —
it degrades to an instant unlock (the old behavior) instead of blocking
anyone, and logs a warning in the browser console so you know it's not
wired up yet.

## What happens on 3 wrong codes

Exactly like the original build: the account is marked `banned` in the
database with a reason and a generated `ZX-XXXXXXXX` ID. The user sees a
restricted-account screen with an appeal form (**Admin → Appeals** to
review). No manual step needed on your end beyond reviewing appeals.
