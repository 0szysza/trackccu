# ROBLOX CCU Tracker

Strony: **Games** (`games.html`, pod adresem `/games`), **Compare** (`compare.html`, pod adresem `/compare`) i strona pojedynczej gry pod `/games/<placeId>` (np. `/games/2512643572`). `index.html` to lekkie przekierowanie na `/games`, żeby sam root strony też działał. Dane o graczach pochodzą z oficjalnego API Robloxa.

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

## Dodawanie gry (GitHub Pages)

Wystarczy dopisać grę do `scripts/games.json` — nic więcej nie trzeba ręcznie zmieniać:

```json
{ "slug": "nowagra", "placeId": "123456789", "name": "Nazwa gry", "short": "NG" }
```

Wymagane pola to `slug`, `placeId`, `name`, `short`. `universeId` i `color` są opcjonalne (`universeId` dociąga się i zapamiętuje sam, `color` to tylko kolor embeda na Discordzie, domyślnie niebieski jak BGS). Ikonka (`assets/<slug>-icon.png`) i miniaturka (`assets/<slug>-thumbnail.png`) też są opcjonalne — bez nich strona pokazuje ikonkę wprost z Robloxa, a w ostateczności generyczną ikonkę strony.

Po zapisaniu `games.json`:

- **Nic nie trzeba uruchamiać ręcznie** — workflow (`.github/workflows/update.yml`) przy każdym przebiegu (co ~5 min) sam odświeża listę gier w `site.js` i generuje stronę `games/<placeId>/` dla nowej gry (krok "Sync games", `scripts/sync-games.mjs`).
- Do podglądu lokalnego (otwierając pliki w przeglądarce) trzeba jednak odpalić `node scripts/sync-games.mjs` samemu — to jedyny moment, kiedy to jest potrzebne.

Skąd biorą się strony `games/<placeId>/`: to zawsze ta sama, w pełni generyczna strona (`scripts/game-template.html`) skopiowana do folderu każdej gry — cały jej wygląd (nazwa, statystyki, właściciel, data utworzenia/aktualizacji) jest wyliczany w locie z adresu URL i z danych `live.json`, więc nie ma czego ręcznie edytować per gra.

## Dodawanie gry (Netlify)

Tu bez zmian: `SEEDS` w `lib/games.ts` i `<slug>-thumbnail.png` / `<slug>-icon.png` w `assets/` (Netlify ma osobny, niezależny kod i nie korzysta z `scripts/games.json`).
