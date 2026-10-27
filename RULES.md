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

## How the checking works

- **`test/helpers.mjs`** holds a second, independent reading of the rules. It's written straight from the sheet and uses nothing from the engine except the dice data. The engine must agree with it in every case.
- **`test/exhaustive.test.mjs`** plays every combination rather than a sample: every face of every die, all 36 tackle dice pairs at every intensity and card state, every kick, every set piece, and every score threshold.
- **`test/invariants.test.mjs`** plays 1,500 full matches (`npm run test:fuzz` plays 20,000) with random, Rookie and Pro decisions. After every action it checks more than 30 invariants: scores add up, conversions follow tries, possession only changes for a reason, the state survives save and reload, the commentary never says "undefined", and more.
- **`test/odds.test.mjs`** checks that the dice are fair (chi-square) and that the odds shown to players match tens of thousands of real rolls.
- **`scripts/mutate.mjs`** (`npm run test:mutation`) plants 35 rules bugs, one at a time, and confirms the tests catch each one.
- **`test/e2e/run.mjs`** (`npm run test:e2e`) plays complete matches in a real browser. Every time the game waits for a tap, it checks that the scoreboard, possession marker, cards, injuries, prompt and buttons match the saved match exactly.
