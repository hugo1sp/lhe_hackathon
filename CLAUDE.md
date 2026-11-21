# CLAUDE.md

Riktlinjer för att minska vanliga LLM-misstag vid kodning. Bygger på Andrej Karpathys observationer (via forrestchang/andrej-karpathy-skills). De prioriterar försiktighet framför fart; för triviala uppgifter, använd eget omdöme.

## 1. Tänk innan du kodar

- Säg ut dina antaganden. Fråga om något är oklart.
- Finns flera tolkningar: presentera dem istället för att tyst välja en.
- Finns ett enklare sätt: föreslå det.

## 2. Enkelhet först

- Skriv bara det som efterfrågats. Inga spekulativa features.
- Inga onödiga abstraktioner eller konfigurerbarhet som ingen bett om.
- Ser något överkomplicerat ut: förenkla.

## 3. Kirurgiska ändringar

- Rör bara det uppgiften kräver. Följ befintlig stil.
- Refaktorera inte fungerande kod i förbigående.
- Upptäcker du orelaterad död kod: nämn den, ta inte bort den.
- Ta bara bort oanvänd kod som dina egna ändringar skapat.

## 4. Målstyrd körning

- Gör om uppgifter till verifierbara mål (t.ex. skriv ett test som återskapar buggen, sen fixa den).
- Vid flerstegsarbete: ange en kort plan med en kontroll per steg.

## Projektregler (hackathon)

Flera personer jobbar samtidigt direkt på `main` (inga branches, ingen PR-granskning). Claude sköter all git-hantering.

### Git-arbetsflöde

- **Kör alltid `git pull --rebase origin main` innan du ändrar något**, och igen innan varje push.
- Gör små commits och pusha ofta, så ändringar inte hinner divergera.
- **Pusha automatiskt (utan att fråga) varje gång en ändring är klar och fungerar.** Kontrollera först att koden körs och att tester (om det finns) går igenom. Pusha aldrig trasig eller halvfärdig kod.
- Om pull ger konflikter: läs båda sidornas ändringar, behåll allas arbete, lös konflikten, kör `git rebase --continue`. Fråga bara om det är oklart vilken version som ska gälla.
- Om push avvisas: kör `git pull --rebase origin main` och pusha igen.
- Använd aldrig `git push --force` eller `git reset --hard` på `main`.
- Skapa inga branches om användaren inte ber om det.
- Committa aldrig `.env` eller andra hemligheter.

### Språk

Kommunicera på svenska.
