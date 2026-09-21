# ROBLOX CCU Tracker

Dwie strony: **All Games** (`index.html`) i **Compare** (`compare.html`). Dane o graczach pochodzą z oficjalnego API Robloxa.

Repo obsługuje dwa sposoby hostowania. Strony są te same, różni się tylko źródło danych (`config.js`).

| | GitHub Pages | Netlify |
| --- | --- | --- |
| Skąd dane | GitHub Actions co ~5 min zapisuje pliki `data/*.json` | Netlify Functions + Netlify Database |
| Odświeżenie | co 5 min, ale GitHub potrafi opóźnić cron o kilka minut | co 5 min |
| Potrzebne pliki | `scripts/`, `.github/` | `netlify/`, `db/`, `lib/`, `drizzle.config.ts`, `package*.json` |

## GitHub Pages — jak uruchomić

1. Wrzuć zawartość repo na GitHuba (gałąź `main`). Najlepiej **publiczne** repo: Actions jest wtedy darmowe bez limitu minut.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. Zakładka **Actions → "Update data and deploy" → Run workflow** (albo po prostu zrób push). Po ~1 minucie strona jest pod `https://<login>.github.io/<repo>/`.
4. Opcjonalnie webhook Discorda: **Settings → Secrets and variables → Actions → New repository secret**, nazwa `DISCORD_WEBHOOK_URL`. Digest leci co godzinę, pierwszy przy najbliższym przebiegu.
5. Jeśli hostujesz wyłącznie na GitHubie, możesz usunąć pliki potrzebne tylko Netlify: `netlify/`, `db/`, `lib/`, `drizzle.config.ts`, `package.json`, `package-lock.json`.

Jak to działa: każdy przebieg workflow pobiera historię z poprzedniego wdrożenia (`data/raw.json` ze strony), dopisuje nowy odczyt z Robloxa, przycina do 90 dni, generuje `live.json` oraz `history-1d/7d/all.json` i publikuje całość na Pages. Nic nie jest commitowane do repo, więc historia gita się nie rozrasta.

Do wiedzy:

- Historia zaczyna się od zera. Dane z bazy Netlify nie są przenoszone.
- Dane są tak świeże, jak ostatni przebieg crona (zwykle 5–10 min). W nagłówku widać, ile minut temu były zmierzone.
- W publicznym repo GitHub wyłącza zaplanowane workflow po 60 dniach bez aktywności w repo (wystarczy je włączyć ponownie w zakładce Actions).
- Jeśli przebieg nie może odczytać poprzedniej historii, kończy się błędem i niczego nie publikuje, żeby nie wyczyścić danych.

## Netlify

Zostaje jak dotąd. `config.js` wskazuje na `/api/live` i `/api/history`, cron ma `*/5`. Webhook Discorda: zmienna `DISCORD_WEBHOOK_URL` (test: `ADMIN_KEY` i `/api/discord-test?key=...`).

## Dodawanie gry

1. `scripts/games.json` (GitHub) oraz `SEEDS` w `lib/games.ts` (Netlify),
2. `CATALOG` na górze `site.js`,
3. `<slug>-thumbnail.png` i `<slug>-icon.png` w `assets/`.
