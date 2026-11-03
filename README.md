# Keziah's Math Game

A bubble-merging multiplication game. Enter a problem like `14 × 12`: you get 12 bubbles that each hold 14. Drag one bubble onto another to add them together (14 + 14 = 28). Keep merging until one bubble is left. That bubble is the answer (168).

## Features

- **Accounts:** players sign in with a name and password (or create an account).
- **Free play:** pick any multiplication (up to 40 bubbles).
- **Challenge:** levels 1×1, 2×2, 3×3 … up to 30×30. Beating a level unlocks the next one, and your best time for each level is saved.
- **Admin page:** sign in as `admin` / `admin` to see every player's challenge level, best times, games played and recent games.

## Run it

Needs [Node.js](https://nodejs.org) 18 or newer. There is nothing to install.

```bash
npm start
```

Then open <http://localhost:3000>. Set the `PORT` environment variable to use a different port.

Accounts and scores are saved in `data/db.json` (created automatically, and not committed to git). Passwords are stored hashed.

> The admin password is `admin`, as requested. Anyone who knows it can see all scores, so change `ADMIN_PASSWORD` in `server.js` (and delete `data/db.json` so the admin account is recreated) before putting the game on the public internet.
