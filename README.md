# Werkuren App

A comprehensive attendance and work hours management application built with React, Vite, TailwindCSS, and Node.js/SQLite backend.

## Features
- Real-time work hour registration
- Weekly and monthly calendar views
- Advanced reports and data export
- QR code scanning / badge entry integration

## Productie (PHP + MySQL)
- `public/api.php` is de backend. De databank wordt automatisch aangemaakt en bijgewerkt.
- Zet de databankgegevens en het JWT-geheim op de server in `config.php` naast `api.php` (staat niet in git, blijft bewaard bij een deploy).
- Deploy: `npm run build` → commit → push → in cPanel "Update from remote" + "Deploy HEAD".

## Functies voor bedrijven
- Bedrijven en entiteiten; een werknemer kan voor meerdere entiteiten werken.
- Per entiteit: tijdseenheid, roterend rooster (1-4 weken), registratietypes, overuren splitsen,
  projectregistratie (uit/optioneel/verplicht, vast project per gebruiker, eventueel vergrendeld),
  goedkeuring per dag/werkweek/week, webhooks en een export-API.
- Export: `api.php/export?key=API_SLEUTEL&from=2026-10-01&to=2026-10-31[&status=approved]`
