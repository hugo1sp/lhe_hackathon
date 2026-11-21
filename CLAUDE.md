# Projektregler

Flera personer jobbar samtidigt direkt på `main` (inga branches, ingen PR-granskning). Claude sköter all git-hantering.

## Git-arbetsflöde

- **Kör alltid `git pull --rebase origin main` innan du ändrar något**, och igen innan varje push.
- Gör små commits och pusha ofta, så ändringar inte hinner divergera.
- **Pusha automatiskt (utan att fråga) varje gång en ändring är klar och fungerar.** Kontrollera först att koden körs och att tester (om det finns) går igenom. Pusha aldrig trasig eller halvfärdig kod.
- Om pull ger konflikter: läs båda sidornas ändringar, behåll allas arbete, lös konflikten, kör `git rebase --continue`. Fråga bara användaren om det är oklart vilken version som ska gälla.
- Om push avvisas: kör `git pull --rebase origin main` och pusha igen.
- Använd aldrig `git push --force` eller `git reset --hard` på `main`.
- Skapa inga branches om användaren inte ber om det.
- Committa aldrig `.env` eller andra hemligheter.

## Språk

Kommunicera på svenska.
