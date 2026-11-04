# Adding a challenge

Every file in this folder is one challenge. To add one, put a new `.json` file here. That's all: the running server notices it automatically, so you don't need to restart anything.

Name files `YYYY-MM-DD-short-name.json` (for example `2026-11-05-times-tables.json`) so they stay in date order.

## When players see it

- **On its date it becomes "Today's challenge"**: the big card at the top of the home page, marked **New!** in the list.
- **Before its date it is hidden**, so you can write challenges ahead of time and they will appear on their day. (The date is the player's own local date.)
- **After its date it stays** in the "All challenges" list, so players can catch up on days they missed.
- **On a day with no challenge**, the newest one is shown at the top instead.

When a player beats every level of a challenge, it is marked **✓ Finished** for them, and the admin page shows the date they finished.

## Template

```json
{
  "id": "times-tables-7",
  "date": "2026-11-05",
  "title": "The 7 times table",
  "emoji": "7️⃣",
  "description": "One sentence shown on the home page.",
  "intro": [
    "Optional: a short lesson shown before the first level.",
    "Each string is one paragraph."
  ],
  "levels": [
    {"a": 7, "b": 2},
    {"a": 7, "b": 3, "tip": "Optional: shown on the win screen after this level."},
    {"type": "train", "a": 7, "b": 100}
  ]
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `id` | yes | Lowercase letters, numbers and dashes. Must be unique. **Never change it once players have started**: progress is saved under this id. |
| `date` | yes | `YYYY-MM-DD`. The day it becomes today's challenge. |
| `title` | yes | Shown on the home page and the challenge page. |
| `emoji` | no | Defaults to ⭐. |
| `description` | no | One line under the title. |
| `intro` | no | A list of paragraphs, shown as a "How it works" lesson. |
| `levels` | yes | Played in order. Each one unlocks the next. |

## Level types

- **Bubbles** (default): `{"a": 14, "b": 12}` gives 12 bubbles worth 14 each, which the player merges together. `a` can be 1–9999 and `b` can be 1–40. More than 10 bubbles are split into boxes of ten.
- **Train**: `{"type": "train", "a": 48, "b": 1000}`. The number 48 is a train (an engine pulling a 4 car and an 8 car). The player couples the right number of `0` cars onto the back of it from a depot, then presses Go. `b` must be 10, 100, 1000, 10000, 100000 or 1000000.
  - Add `"helper": true` to also show the multiplier as a train: 1,000 is a `1` car pulling three `0` cars. The player moves those 0 cars onto their own train, and the level finishes when only the `1` is left. Use this for the first levels, so players discover the rule before they have to count zeros themselves.

## Check your file

```bash
npm run check
```

This lists every challenge with its date, and whether it is published, today's challenge or scheduled. It also points out any file with a mistake. A file with a mistake is skipped (not shown to players) until it is fixed.

## Editing a challenge that players have started

- Fixing typos or changing `title`, `emoji`, `description`, `intro` or `tip` is always safe.
- Adding levels to the end is safe. Players who already finished keep their ✓, and the new levels unlock for them.
- Reordering or removing levels shifts players' saved progress onto different levels, so it's better to make a new challenge instead.
