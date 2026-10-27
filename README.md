# Pocket Rugby

A digital version of the Pocket Sports Rugby dice game, built for phones. Play against the CPU or pass one phone between two players.

Each team is five dice: Scrum Half, Forward, Centre, Wing and Back. The defence, referee and scoring dice settle tackles, scrums, lineouts, penalties, tries and kicks. First to 30 wins, and half time is called at 15.

## Features

- **1 player against the CPU** (Rookie or Pro), or **2 players** on one device.
- **3D dice** that tumble onto the result, with the face that matters highlighted: a kick's distance, the card dot, or the scrum or lineout light.
- **Live pitch.** It shows who has the ball, passes, contact, line breaks and the kicker standing at the rolled range.
- **Clear decisions.** Each pass, drop-goal and penalty choice shows its odds (break chance, error chance, kick chance) and a tip. You can turn the odds off.
- **Commentary and a match log.** Banners mark tries, big hits, cards and turnovers, and every match ends with a full-time report.
- Quick (10/20), Standard (15/30) and Marathon (25/50) match lengths.
- The match saves after every roll, so you can close the page and resume later.
- Sound effects, vibration, fast-dice mode, reduced-motion support and keyboard controls (Space to roll, 1–4 to choose, Esc for the menu).
- Installable, and works offline once loaded (add to home screen).

## Play it

Any static web server works. From the repository root:

```sh
npm start            # python3 -m http.server 8080
# open http://localhost:8080
```

To host it on GitHub Pages: **Settings → Pages → Deploy from a branch**, choose this branch and `/ (root)`. On a phone, open the page and use **Share → Add to Home Screen** to get a full-screen app icon.

For a single file you can send to someone or open straight from disk:

```sh
npm run build        # writes dist/pocket-rugby.html
```

## How a turn works

1. The **Scrum Half** rolls first after every kick-off, tackle or turnover. Most faces pass to a named player, who rolls next.
2. A run has an **intensity**. The defence rolls the brown die twice. If the total reaches the intensity, the tackle is made. If it falls short, it's a line break and the attacker rolls the black die for the try.
3. **Errors** (knock on, into touch) give the other side a scrum or lineout on the white referee die. **Intercepted** turns the ball over straight away.
4. **Penalties** check for a yellow card, then give the choice of a kick at goal or a quick tap (+1 intensity for 3 runs).
5. **Kicks**: the brown die sets the range and the black die's number is the kick distance. Each point is 10 metres.

The in-game **How to play** sheet has the full rules and every face of every die.

## About the dice

The printed rules don't list every face, so the faces here are reconstructed from the rules sheet and photos of the physical set. Each player keeps the big move named in the rules (Line Break 6, Thru the Gap 7, Into the Corner 8, High Ball 6). The balance was checked by simulating thousands of CPU-vs-CPU matches:

```sh
npm run simulate     # node scripts/simulate.mjs [games] [quick|standard|long]
```

A standard match averages about 5 tries and 2 drop goals, and the kick-off receiver wins about half the time. All face definitions live in `js/dice.js` if you want to tweak them.

## Project layout

| Path | What it does |
| --- | --- |
| `js/dice.js` | The eight dice and their faces |
| `js/engine.js` | Rules engine: a pure state machine (`newMatch`, `act`) plus odds helpers |
| `js/ai.js` | CPU decisions |
| `js/commentary.js` | Turns engine events into commentary, headlines and big moments |
| `js/app.js` | Screens, match loop, animation, saving |
| `js/dice-view.js`, `js/pitch.js` | 3D dice and the SVG pitch |
| `js/audio.js` | Synthesised sound effects (no audio files) |
| `test/` | Engine tests: `npm test` |
| `scripts/` | Balance simulation and single-file build |

No build step and no dependencies. It's plain HTML, CSS and ES modules.

---

An unofficial, fan-made adaptation. Not affiliated with or endorsed by Pocket Sports.
