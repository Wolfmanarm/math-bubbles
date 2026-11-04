# Keziah's Math Game

A bubble-merging multiplication game. Enter a problem like `14 × 12`: you get 12 bubbles that each hold 14. Drag one bubble onto another to add them together (14 + 14 = 28). Keep merging until one bubble is left. That bubble is the answer (168).

## Features

- **Accounts:** players sign in with a name and password (or create an account).
- **Daily challenges:** the home page puts today's challenge at the top, with every earlier challenge listed below it. A challenge is marked **✓ Finished** once every level is beaten. Current challenges:
  - **Squares:** 1×1, 2×2 … up to 30×30.
  - **Multiplying by 10, 100 … 1,000,000:** teaches that multiplying by these numbers just adds zeros to the end.
- **Free play:** pick any multiplication (up to 40 bubbles). More than 10 bubbles are grouped into boxes of ten.
- **Admin page:** sign in as `admin` / `admin` to see every player's challenges, progress, best times and recent games.

## Run it

Needs [Node.js](https://nodejs.org) 18 or newer. There is nothing to install.

```bash
npm start
```

Then open <http://localhost:3000>. Set the `PORT` environment variable to use a different port.

## Add a new challenge

Drop a new `.json` file into [`challenges/`](challenges/). No restart is needed. Give it the date it should become "Today's challenge"; files dated in the future stay hidden until their day. See [`challenges/README.md`](challenges/README.md) for the template. Then check your file:

```bash
npm run check
```

## Player data

Accounts and scores are saved in `data/db.json`, which is created automatically and not committed to git. Passwords are stored hashed. When an update changes how data is stored, the server converts the file automatically on start-up and keeps a copy of the old one next to it (for example `data/db.backup-v1.json`).

> The admin password is `admin`, as requested. Anyone who knows it can see all scores, so change `ADMIN_PASSWORD` in `server.js` before putting the game on the public internet. The admin account is only created when it doesn't exist yet, so the new password also needs the existing `admin` entry removed from `data/db.json`. Players' accounts and scores are kept.
