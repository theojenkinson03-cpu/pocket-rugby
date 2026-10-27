# Rules audit

Every rule on the printed Pocket Sports Rugby sheet, how this game applies it, and the test that proves it. Code references are to `js/engine.js` unless another file is named. The sheet is quoted only as far as needed to identify each rule.

**Result of the audit:** two places did not follow the sheet and were fixed (marked **Fixed**). Six places where the sheet is silent use a stated interpretation (marked **Interpretation**). Everything else matched already.

## Match

| Rule on the sheet | In the game | Code | Tested by |
| --- | --- | --- | --- |
| Two halves; half time when either team reaches 15 | Half time is called after the scoring move that takes either side to 15 (after the conversion, if it was a try) | `afterScore` | `exhaustive`: score thresholds; `invariants`: half time is called at 15 |
| Full time when 30 points are reached | The match ends the moment a side reaches 30. **Interpretation:** a try that reaches 30 ends the match before the conversion | `reachedFullTime` | `exhaustive`: every try roll on the brink of full time |
| Flip a coin to decide who receives the kick and attacks first | The toss winner receives | `act` (toss) | `exhaustive`: the toss, both calls and results |
| Second half kick-off | **Interpretation:** the side that did not receive first receives in the second half | `act` (half time) | `exhaustive`: half time |
| Points: try 5, conversion 2, drop goal 3, penalty goal 3 | As printed | `onTry`, `onKick` | `invariants`: score always equals 5×tries + 2×conversions + 3×goals |

## Attacking

| Rule on the sheet | In the game | Code | Tested by |
| --- | --- | --- | --- |
| The Scrum Half always rolls first after each tackle, or when possession is turned over | Every new possession and every phase starts with the Scrum Half | `startPossession`, `nextPhase` | `invariants`: every possession change starts with the Scrum Half |
| The Scrum Half may pass as named on the die | Scrum Half pass faces name the receiver, who rolls next | `onAttack` | `exhaustive`: every positional face |
| ‹PASS›: passing between the other players is your choice | Any of Forward, Centre, Wing or Back except the passer; never back to the Scrum Half | `passOptions` | `exhaustive`: every pass choice from every passer |
| Each die has one action with extra intensity: Line Break 6, Thru the Gap 7, Into the Corner 8, High Ball 6 | As printed | `js/dice.js` | `dice`: big moves match the sheet |
| Drop goal is for the Centre and Back | Only those two dice have the Drop Goal ‹Pass› face | `js/dice.js` | `dice`: only the Centre and Back can drop goal |
| Drop goal: roll the brown die for range first, then kick or pass | Range is rolled, then the player chooses | `onRange`, `onChoose` | `exhaustive`: every drop goal, kicked or passed |

## Tackling

| Rule on the sheet | In the game | Code | Tested by |
| --- | --- | --- | --- |
| The defence must equal or beat the intensity with two rolls of the brown die | Tackle if the total is at least the intensity | `resolveTackle` | `exhaustive`: all 36 dice pairs at every intensity, against an independent reading of the sheet |
| Total below the intensity: a break, roll the black die for the try | Line break, then the try roll | `onTackle` | `exhaustive`: every tackle played through the engine |
| Big Hit on the first roll against a Hit Up of 3 or 4: ruck contest, the defence needs RUCK WIN on the black die | **Fixed.** Only a plain Hit Up qualifies. Before, a big move pushed down to 4 by injuries also allowed a ruck steal | `ruckEligible` | `exhaustive`: every positional face; mutation tests "Ruck steal against big moves too" and "…Hit Up of 5" |
| Otherwise the attack continues as normal | Failed steal: the attackers keep the ball and the Scrum Half plays | `onRuck` | `exhaustive`: every ruck contest face |
| Big Hit on the second roll completes the tackle | Always a tackle, whatever the total | `resolveTackle` | `exhaustive`; mutation "Second-die Big Hit does not complete the tackle" |
| Two Big Hits injure the ball carrier: −1 to that position's runs for the match | Injuries stack per position. Intensity never drops below 1 | `onTackle`, `runIntensity` | `exhaustive`; `invariants`: injuries only ever come from two Big Hits |

## Tries and kicks

| Rule on the sheet | In the game | Code | Tested by |
| --- | --- | --- | --- |
| TRY scores 5, with a conversion to follow | As printed | `onTry` | `exhaustive`: every try roll face |
| NO TRY is a changeover; the opponent restarts with their Scrum Half | As printed. **Interpretation:** RUCK WIN on a try roll counts as held up, so no try | `onTry` | `exhaustive` |
| VIDEO REF: roll the black die again | Rolled again until there is a decision | `onTry` | `exhaustive`: video ref five times in a row |
| Conversion: brown die for range, black die's kick must equal or beat it; 2 points | As printed. Conversions are always attempted | `onRange`, `onKick` | `exhaustive`: all 36 range and kick pairs |
| Play restarts with the scoring team receiving the kick-off | Applies after every score: tries, conversions made or missed, penalty goals and drop goals | `afterScore` | `exhaustive`: score thresholds; mutation "Conceding side receives after a score" |
| Missed drop goal or penalty kick | **Interpretation:** the sheet doesn't say; a miss hands the ball to the other side | `onKick` | `exhaustive`: every drop goal and penalty kick |
| Range and kick distances | Each number on the dice is shown as 10 metres | `js/dice.js` | `commentary`: metres |

## Errors, set pieces and penalties

| Rule on the sheet | In the game | Code | Tested by |
| --- | --- | --- | --- |
| Any attacking error gives a scrum or lineout | Knock On gives a scrum, Into Touch gives a lineout | `onAttack`, `setPiece` | `exhaustive`: every positional face |
| Intercepted transfers possession | **Interpretation:** it turns the ball over straight away, with no scrum | `onAttack` | `exhaustive` |
| The defending side feeds the scrum or throws in; green light wins, red loses | As printed | `onSetPiece` | `exhaustive`: every white face at every scrum and lineout, either feeder |
| Collapsed scrum: reset and roll again | Same side feeds again | `onSetPiece` | `exhaustive`: a collapsed scrum is rolled until there is a result |
| Lineout not straight: the opposition retakes | The throw passes to the other side | `onSetPiece` | `exhaustive`: a crooked lineout passes the throw back and forth |
| PENALTY WON / PENALTY AGAINST | Won goes to the side that rolled, Against to the other side | `onSetPiece` | `exhaustive`; mutation "Penalty Won goes to the wrong side" |
| Penalty kick: 3 points if the black die equals or beats the brown die's range | **Interpretation:** the range is rolled before the choice, so you know the distance before deciding (as with drop goals) | `onPenaltyCheck` | `exhaustive`: every penalty kick and quick tap |
| Card check: roll the black die; the yellow dot sends the offender to the sin bin | Checked automatically on every penalty, in the same roll as the range | `onPenaltyCheck` | `exhaustive`: every card and range face from every card history |
| Sin bin: −1 on all defensive dice rolls for the rest of the half | **Fixed.** −1 on each brown die the carded side rolls in a tackle. Before, it took 1 off the tackle total. **Interpretation:** it doesn't change kick ranges | `defenceModifier`, `resolveTackle` | `exhaustive`; mutation "Card penalty on one die only" |
| Second yellow: −2 for the rest of the match | −2 on each tackle die, kept through half time | `defenceModifier` | `exhaustive`: half time; `invariants`: a red card sticks for the rest of the match |
| Quick tap: +1 to intensity for the next 3 runs | As printed | `runIntensity` | `exhaustive`: every tackle with 0, 1 and 3 runs of advantage left |
| The advantage ends after 3 completed tackles or an attacking error | Each completed tackle uses one run (ruck contests included). An error or any change of possession ends it | `countTackle`, `setPiece`, `startPossession` | `exhaustive`; mutations "Quick tap never runs out" and "Errors do not end quick tap" |
| Another penalty during quick tap resets it to 3 runs | Any new quick tap starts at 3 | `onChoose` | `exhaustive` |

## House rules: team cards

Team cards aren't on the printed sheet. They're an optional extra, on by default, and every effect is a small change at one named point in the engine, so the printed rules underneath are untouched. Each card's text in the game is the whole of its effect.

| Card | Effect | Code | Tested by |
| --- | --- | --- | --- |
| The draft | Three different cards are dealt after the toss. The toss **loser** picks first from all three; the toss winner, who also receives the kick-off, picks from the other two. Measured over 10,000 simulated drafts, the side picking first wins 49.9% | `dealCards`, `onChoose` (draft) | `cards`: 3,000 deals; mutations "Toss winner picks first", "Second pick may take the same card", "A deal can repeat a card" |
| Big Pack | Forward Hit Ups +1; Line Break 8 | `intensityParts` (`runBonus`) | `cards`; mutations "Card run bonus ignored", "Big Pack: no bonus on the big move" |
| Up and Under | Back's High Ball 8, Back Hit Ups +1, the Back's Into Touch becomes a pass | `intensityParts`, `onAttack` (`faceSwap`) | `cards` |
| Midfield Maestro | The Centre's Intercepted face becomes a free pass | `onAttack` (`faceSwap`) | `cards`; mutation "Card face swaps ignored" |
| Sure Hands | The Wing's Knock On and Into Touch become passes | `onAttack` (`faceSwap`) | `cards`; mutation "Sure Hands for every player" |
| Golden Boot | +2 (20 m) on conversion and penalty kicks | `onKick`, `kickBonus` | `cards`: every range and kick face; mutations "Kick bonus left off the kick", "Golden Boot helps drop goals too" |
| Drop-Goal Artist | +2 on drop goals, and the Wing's open Pass face is a drop-goal chance | `onKick`, `onAttack` (`passToDrop`) | `cards`; mutation "Drop-Goal Artist: every open pass a drop chance" |
| Rush Defence | +1 on the first brown die against Hit Ups (not big moves) | `resolveTackle` (`firstBonus`) | `cards`: all 36 dice pairs; mutations "Rush Defence on both dice", "Rush Defence against big moves" |
| Jackal | A Big Hit on either die contests the ruck against Hit Ups up to 5; VIDEO REF also wins the ruck | `ruckEligible`, `resolveTackle`, `onRuck` | `cards`; mutations "Second-die ruck for everyone", "Jackal: video ref does not win the ruck" |
| Fortress | The other side's big moves are 2 lower against you (never below 1) | `intensityParts` (`specialDefence`) | `cards`; mutations "Fortress protects the attackers", "Fortress against Hit Ups too" |
| Clinical Finisher | Once a match, a NO TRY or held-up roll is rolled again | `onTry`, `useCharge` | `cards`; mutations "Limited cards never run out", "Once-a-match cards refreshed at half time" |
| Set-Piece Kings | Reset scrums and crooked lineouts go to them; +1 on their first run after a set piece they win | `onSetPiece` | `cards`: every feeder and piece; mutations "Set-Piece Kings ignored at resets", "Set-piece advantage for three runs" |
| Squeaky Clean | Once a match, PENALTY AGAINST on their own feed becomes PENALTY WON | `onSetPiece`, `useCharge` | `cards`; mutation "Squeaky Clean on the other side's feed" |

**Balance.** `scripts/balance-cards.mjs` plays 5,000 CPU matches for each card against a side with no card. Every card lifts the win rate by between 6.8 and 9.7 points, inside the simulation's ±1.4% noise of each other, so no pick is a trap. The odds the game shows before a pass (break and error chances) include both sides' cards; `cards` checks them against a count of every face and every pair of tackle dice for all 24 card-and-side combinations.

## How the checking works

- **`test/helpers.mjs`** holds a second, independent reading of the rules. It's written straight from the sheet and uses nothing from the engine except the dice data. The engine must agree with it in every case.
- **`test/exhaustive.test.mjs`** plays every combination rather than a sample: every face of every die, all 36 tackle dice pairs at every intensity and card state, every kick, every set piece, and every score threshold.
- **`test/invariants.test.mjs`** plays 1,500 full matches (`npm run test:fuzz` plays 20,000) with random, Rookie and Pro decisions in every CPU style, two thirds of them with team cards. After every action it checks more than 40 invariants: scores add up, conversions follow tries, possession only changes for a reason, each run's intensity is the die plus quick tap and cards minus injuries, every tackle agrees with the rules reading (cards included), every player's numbers add up to the team's, the state survives save and reload, the commentary never says "undefined", and more. It also confirms every card effect actually happened somewhere.
- **`test/odds.test.mjs`** checks that the dice are fair (chi-square) and that the odds shown to players match tens of thousands of real rolls.
- **`scripts/mutate.mjs`** (`npm run test:mutation`) plants 85 bugs, one at a time (in the rules, the cards, the draft, player stats, the CPU, tournaments, achievements, the coach and online play), and confirms the tests catch each one.
- **`test/e2e/run.mjs`** (`npm run test:e2e`) plays complete matches in a real browser: against Pro and Expert, two players, keyboard only, the guided match, a Nations Cup round and a two-phone online match. Every time the game waits for a tap, it checks that the scoreboard, possession marker, team cards, win meter, injuries, prompt, buttons and draft match the saved match exactly.
