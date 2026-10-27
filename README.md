# Pocket Rugby

A digital version of the Pocket Sports Rugby dice game, built for phones. Play the CPU, pass one phone between two players, or play a friend on two phones. Take a nation through the Nations Cup or a club through the League.

Each team is five dice: Scrum Half, Forward, Centre, Wing and Back. The defence, referee and scoring dice settle tackles, scrums, lineouts, penalties, tries and kicks. First to 30 wins, and half time is called at 15.

## Ways to play

- **1 player against the CPU.** Three levels: Rookie plays on instinct, Pro plays the odds, Expert plays out hundreds of continuations before each decision. Four styles: Balanced, Boot it (kicks at every chance), Run it (taps penalties and spreads it wide) and Forwards (keeps it tight).
- **2 players** on one phone, taking turns.
- **Online, on two phones.** One player hosts and gets a six-letter code; the other joins with it. See [Online play](#online-play) for what it needs.
- **Nations Cup**: eight nations in two pools of four, then semi-finals and a final. **League**: eight clubs play each other once, then a top-four play-off. Tables use 4 points for a win and bonus points for 4 tries or losing by 7 or fewer. Other fixtures are played out by the engine, CPU against CPU, with each side's own level and style.
- **Learn to play**: a guided first match against a Rookie, with a coach who explains each part of the game the first time it comes up. New players see it first on the title screen.

## Team cards

Three of twelve cards are dealt after the coin toss. The side that **lost** the toss picks first, from all three; the toss winner, who receives the kick-off, picks from the two left. Each card bends one rule for the whole match: Sure Hands (the Wing never loses it), Jackal (wins rucks on the video ref), Golden Boot (+20 m on place kicks), Fortress (the other side's big moves are 2 lower) and so on. The draft screen shows all three cards; the scoreboard shows each side's card, and tapping it shows what it does. When a card changes a roll, a short scene says so.

Every card was balanced over 5,000 simulated matches against a side with no card: each lifts the win rate by 6.8 to 9.7 points, inside the simulation's noise of each other. Over 10,000 full drafts the side picking first won 49.9%, so losing the toss and picking first evens out receiving the kick-off. Cards can be turned off on the team sheet. [RULES.md](RULES.md) lists every card's exact effect.

## Players, stats and your record

- **Named players.** Every side has five named players (edit them, or shuffle new ones, on the team sheet). Commentary uses their names: "TRY! Webb (Wing) dots it down!"
- **Player of the Match** after every match, with a spotlight scene, and a table of every player's tries, carries, line breaks, tackles, turnovers, kicking points and errors.
- **Win meter.** A live bar under the scoreboard shows each side's chance of winning, from a model of how possessions end (it agrees with simulated matches to within a few points). The full-time report charts it through the match as a momentum graph, with every score marked.
- **Career.** Your record against each CPU level and online, streaks, points, tries, biggest win, trophies, and the team cards you've won with.
- **28 achievements**, from Hat-trick and Comeback to Ice Cold (win it with a kick), From Halfway (a 50 m drop goal), Giant Killer (beat the Expert) and Invincibles (win a tournament unbeaten). Each one gets a scene when you unlock it.

## Presentation

- **3D dice** that tumble onto the result, with the face that matters highlighted. Rolls that decide a try, kick, card or ruck spin longer, to a heartbeat.
- **Cinematic moments**: kick-off and second-half title cards, the team-card face-off, line breaks in slow motion, tries, video-ref reviews, big hits, injuries, cards, turnovers, penalties, quick taps, half time, full time, Player of the Match, achievements and the trophy lift. Every kick at goal plays on a kick cam with a distance gauge. Tap to skip any scene; set them to Full, Short or Off. They switch off when your phone asks for reduced motion.
- **Live pitch** with a camera that follows the runner, and a stadium scoreboard whose digits flip.
- **Clear decisions.** Each pass, drop-goal and penalty choice shows its odds (break chance, error chance, kick chance, with team cards included) and a tip.
- Commentary, a full match log, half-time and full-time reports.
- Quick (10/20), Standard (15/30) and Marathon (25/50) match lengths.
- Saves after every roll, including tournaments and online matches.
- Sound, vibration, fast dice, keyboard controls (Space to roll, 1–4 to choose, Esc for the menu), and works offline once loaded.

## Online play

Online matches run through the page's live room on claude.ai, so both players open the game there:

- Both players must be **signed in** and have **access to the page**. The owner shares it from the **Share** menu. Someone who opens a public link can't join a match.
- The host picks the match length and whether to draft team cards. The guest calls the toss.
- If both choose the same kit colour, the guest changes strip.
- Closing the page doesn't end the match: **Resume** rejoins the room and carries on from the last move.

How it works: each phone keeps the whole match and shares only its own moves, each one an action plus the random numbers its dice used. The other phone replays every move through the same rules engine, so a move that breaks the rules, comes out of turn or has the wrong dice is refused. The phones also compare a fingerprint of the match after every move, to catch any disagreement. Nothing is stored on a server: moves travel in each player's room presence, which the room re-sends to anyone who reconnects. Outside claude.ai the Online button explains this instead.

## The CPU, honestly

Expert plays every option forward to the end of the possession many times over, on the same dice for each option, and asks the win model which leaves it best placed. It rarely makes a poor call, but in a dice game the dice decide most matches. Measured with team cards on: Pro beat Rookie in 54.9% of 4,000 matches (±1.5%), Expert beat Rookie in 56.6% of 800 (±3.5%), and Expert beat Pro in 50.3% of 1,600 (±2.5%). So the levels are honest but close: good decisions are worth a few points in a hundred, not a walkover. The styles change how the CPU plays more than how often it wins.

```sh
node scripts/eval-ai.mjs 400 expert:balanced pro:balanced   # head-to-head CPU strength
node scripts/balance-cards.mjs                                # every card against no card
```

## Play it

Any static web server works. From the repository root:

```sh
npm start            # python3 -m http.server 8080
# open http://localhost:8080
```

To host it on GitHub Pages: **Settings → Pages → Deploy from a branch**, choose this branch and `/ (root)`. On a phone, open the page and use **Share → Add to Home Screen**. (Online play needs the claude.ai version.)

For a single file you can send to someone or open straight from disk:

```sh
npm run build        # writes dist/pocket-rugby.html
```

## Tests

The rules engine is checked from several directions. [RULES.md](RULES.md) maps every rule on the sheet, and every team card, to its code and its tests.

```sh
npm test               # 150+ tests: rules, cards, players, tournaments, career, coach, online, win model, CPU, fuzzing, odds, static checks
npm run test:fuzz      # 20,000 fuzzed matches
npm run test:mutation  # plants 85 bugs; every one must be caught
npm run test:e2e       # plays full matches in Chromium (needs Playwright), including a two-phone online match
npm run check          # all of the above
```

GitHub Actions runs everything on every push (`.github/workflows/ci.yml`).

## How a turn works

1. The **Scrum Half** rolls first after every kick-off, tackle or turnover. Most faces pass to a named player, who rolls next.
2. A run has an **intensity**. The defence rolls the brown die twice. If the total reaches the intensity, the tackle is made. If it falls short, it's a line break and the attacker rolls the black die for the try.
3. **Errors** (knock on, into touch) give the other side a scrum or lineout on the white referee die. **Intercepted** turns the ball over straight away.
4. **Penalties** check for a yellow card (sin bin: −1 on each tackle die for the half) and roll the range. Then you choose a kick at goal or a quick tap (+1 intensity for 3 runs).
5. **Kicks**: the brown die sets the range and the black die's number is the kick distance. Each point is 10 metres.

The in-game **How to play** sheet has the full rules, every face of every die and every team card.

## About the dice

The printed rules don't list every face, so the faces here are reconstructed from the rules sheet and photos of the physical set. Each player keeps the big move named in the rules (Line Break 6, Thru the Gap 7, Into the Corner 8, High Ball 6). The balance was checked by simulating thousands of CPU-vs-CPU matches:

```sh
npm run simulate     # node scripts/simulate.mjs [games] [quick|standard|long]
```

A standard match averages about 5 tries and 2 drop goals, and the kick-off receiver wins about half the time (the other side receives the second half). All face definitions live in `js/dice.js`.

## Project layout

| Path | What it does |
| --- | --- |
| `js/dice.js` | The eight dice and their faces |
| `js/engine.js` | Rules engine: a pure state machine (`newMatch`, `act`), team-card hooks and odds helpers |
| `js/cards.js` | The twelve team cards, as data the engine reads |
| `js/ai.js` | CPU levels and styles, including Expert's look-ahead |
| `js/winprob.js` | Win model for the meter, the momentum chart and Expert |
| `js/players.js` | Player names, ratings and Player of the Match |
| `js/tournament.js` | Nations Cup and League: fixtures, tables, knockouts |
| `js/career.js` | Career record and achievements |
| `js/coach.js` | The coach's tips |
| `js/online.js` | Online protocol: moves, checks and the room session |
| `js/commentary.js` | Turns engine events into commentary, headlines and big moments |
| `js/app.js` | Screens, match loop, animation, saving |
| `js/cinema.js` | Cinematic scenes and the kick cam |
| `js/report.js` | Match report: Player of the Match, player stats, momentum chart |
| `js/*-view.js`, `js/pitch.js` | Tournament, career, online and card screens; 3D dice; the SVG pitch |
| `js/audio.js` | Synthesised sound effects (no audio files) |
| `test/` | Unit, exhaustive, fuzz, odds, static and browser tests (with a stand-in for the online room) |
| `scripts/` | Balance and CPU simulations, mutation testing and the single-file build |

No build step and no runtime dependencies. It's plain HTML, CSS and ES modules. Playwright is only needed for the browser tests.

---

An unofficial, fan-made adaptation. Not affiliated with or endorsed by Pocket Sports.
