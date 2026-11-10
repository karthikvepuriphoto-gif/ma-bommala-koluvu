# మా బొమ్మల కొలువు

Ma Bommala Koluvu is a calm, large-text web app for cataloguing the dolls (bommalu) on the festival steps. It is meant for Karthik's parents to use on an iPhone or iPad, year after year.

Each doll can have a photo, a voice note, typed notes, the step it sits on, the set it belongs to, who gave it, what it is made of, whether it needs repair, and which box it goes back into after the festival. There is also a photo of the full steps for each year, a staircase you can browse, and a film that plays the dolls in order with their voice notes.

Live site: https://karthikvepuriphoto-gif.github.io/ma-bommala-koluvu/

## Add it to an iPhone or iPad

1. Open **Safari** (the home-screen app works best after you add it from Safari).
2. Go to https://karthikvepuriphoto-gif.github.io/ma-bommala-koluvu/
3. Tap the **Share** button.
4. Tap **Add to Home Screen**.
5. Name it **Koluvu** and tap **Add**.
6. Open **Koluvu** from the home screen and sign in with Google.

If the Google window does not open from the home-screen icon, sign in once in Safari. After that, the dolls are in that person's Google Drive and show up on any phone or tablet where they sign in with the same account.

The on-screen **Back** button is always there. You do not need to swipe.

## What is stored, and where

Photos, voice notes, films, and the catalogue file (`catalog.json`) are stored in the signed-in person's **own Google Drive**, in a folder named **Ma Bommala Koluvu**. Inside it: **Photos**, **Voice notes**, and **Films**.

Nothing is sent to a server we run. This website is only the app. Google Drive is the copy that shows up on every device. The app also keeps a copy on the phone so it opens quickly, and it waits and retries when the wifi is poor.

A film can optionally be sent to that person's own YouTube account. The choices are **Unlisted** (only people with the link) and **Private** (only that account). The app does not offer a listing that anyone can search for. Google sometimes saves the film as private until the app is approved. The app says so, and still shows the link.

Sharing with family shares that Drive folder with one email address, read-only, and asks you to confirm first.

## Demo mode

Until someone is signed in, you can try every screen on this device only:

https://karthikvepuriphoto-gif.github.io/ma-bommala-koluvu/?demo=1

Demo photos stay in the browser. They are not uploaded. The home page also has **Try a demo on this device**.

## Google Cloud setup

The OAuth Web client ID lives on one line in [`src/config.ts`](src/config.ts). It is a public client ID, not a secret. Replace that line if the client ID ever changes, then redeploy.

- Google Cloud project: **ma-bommala-koluvu**
- Consent screen: **Testing**
- While the app is in Testing, every person who signs in must be added as a test user, including Amma and Nanna: https://console.cloud.google.com/auth/audience?project=ma-bommala-koluvu
- Authorized JavaScript origins:
  - `https://karthikvepuriphoto-gif.github.io`
  - `http://localhost:5173`
- Enabled APIs: Google Drive API, YouTube Data API v3
- Scopes at sign-in: `openid`, `email`, `profile`, and `https://www.googleapis.com/auth/drive.file`
- Scope requested only when someone chooses to upload a film: `https://www.googleapis.com/auth/youtube.upload`
- There is no client secret. Sign-in uses Google Identity Services in the browser.

`drive.file` only lets the app see files it created (the Ma Bommala Koluvu folder and what is inside it).

YouTube uploads from an app Google has not audited may come back private even if Unlisted was chosen. The screen explains that in plain words.

## Language

The **Language** buttons switch the whole app between English and Telugu. The other language is still written in small type under the main buttons. Strings to double-check are listed in [TRANSLATIONS.md](TRANSLATIONS.md).

## Develop

```bash
npm install
npm run dev
```

Open http://localhost:5173/ma-bommala-koluvu/ or the demo at http://localhost:5173/ma-bommala-koluvu/?demo=1

```bash
npm test
npm run test:e2e
npm run build
```

The site is a Vite + React + TypeScript PWA. GitHub Actions runs the tests and publishes the `main` branch to GitHub Pages. The Pages base path is `/ma-bommala-koluvu/`.

Icons are generated with `python3 scripts/make_icons.py`.
