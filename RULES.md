# Rules audit

Every rule on the printed Pocket Sports Rugby sheet, how this game applies it, and the test that proves it. Code references are to `js/engine.js` unless another file is named. The sheet is quoted only as far as needed to identify each rule.

**Names.** The sheet calls the five players the Scrum Half, Forward, Centre, Wing and Back. The game calls them by the positions they stand for: **Scrum Half, Forwards, Centres, Outside Backs and Fly Half**. Only the names differ: the code keeps the sheet's letters (`S`, `F`, `C`, `W`, `B`), and each die's faces are as on the sheet. Below, the sheet column uses the sheet's names and the game columns use the game's.

**Result of the audit:** two places did not follow the sheet and were fixed (marked **Fixed**). Six places where the sheet is silent use a stated interpretation (marked **Interpretation**). Everything else matched already.

## Match

| Rule on the sheet | In the game | Code | Tested by |
| --- | --- | --- | --- |
| Two halves; half time when either team reaches 15 | In a race, half time is called after the scoring move that takes either side to 15 (after the conversion, if it was a try) | `afterScore` | `exhaustive`: score thresholds; `invariants`: half time is called at 15 |
| Full time when 30 points are reached | In a race the match ends the moment a side reaches 30. **Interpretation:** a try that reaches 30 ends the match before the conversion | `reachedFullTime` | `exhaustive`: every try roll on the brink of full time |
| (This game's addition) The match clock | **Added.** On the clock a match is 60, 100 or 160 rolls, half each way; every roll counts, choices don't. When a half's rolls run out, play goes on until the ball is dead: a new possession (a turnover, a won or lost set piece, a missed kick, a score's restart) or an error's set piece ends the half; a tapped penalty plays on; a try's conversion is still taken. Full time at any score; level is a draw, except in a knockout, where sudden death follows (the side that had the first kick-off has the ball, and any score wins at once, a try without its conversion) | `timeUp`, `endHalf`, `startPossession`, `setPiece`, `reachedFullTime`, `actInPlace` | `clock`: last plays, dead balls, draws, sudden death, the second half's clock; `invariants`: last play exactly when the clock is out, the higher score wins, a knockout is never drawn |
| Flip a coin to decide who receives the kick and attacks first | The toss winner receives | `act` (toss) | `exhaustive`: the toss, both calls and results |
| Second half kick-off | **Interpretation:** the side that did not receive first receives in the second half | `act` (half time) | `exhaustive`: half time |
| Points: try 5, conversion 2, drop goal 3, penalty goal 3 | As printed | `onTry`, `onKick` | `invariants`: score always equals 5×tries + 2×conversions + 3×goals |

## Attacking

| Rule on the sheet | In the game | Code | Tested by |
| --- | --- | --- | --- |
| The Scrum Half always rolls first after each tackle, or when possession is turned over | Every new possession and every phase starts with the Scrum Half | `startPossession`, `nextPhase` | `invariants`: every possession change starts with the Scrum Half |
| The Scrum Half may pass as named on the die | Scrum Half pass faces name the receiver, who rolls next | `onAttack` | `exhaustive`: every positional face |
| ‹PASS›: passing between the other players is your choice | Any of the Forwards, Centres, Outside Backs or Fly Half except the passer; never back to the Scrum Half | `passOptions` | `exhaustive`: every pass choice from every passer |
| Each die has one action with extra intensity: Line Break 6, Thru the Gap 7, Into the Corner 8, High Ball 6 | As printed | `js/dice.js` | `dice`: big moves match the sheet |
| Drop goal is for the Centre and Back | Only the Centres and Fly Half dice have the Drop Goal ‹Pass› face. **Changed:** the Fly Half takes every drop goal; a Centre's Drop Goal face gives the chance to the Fly Half (the dice and their odds are unchanged) | `js/dice.js`, `onAttack` | `dice`; `exhaustive`: every drop goal kicked by the Fly Half; `clock`: the Centre gives it back |
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
| Play restarts with the scoring team receiving the kick-off | **Changed:** the side that conceded has the ball after every score (tries, conversions made or missed, penalty goals and drop goals). Over 2,000 simulated matches the printed rule let one side run away with it (median margin 15 in a race to 30, 73% of matches won by 10 or more); this made the median margin 11 and lead changes 40% more common, and made kicking at goal a real choice | `afterScore` | `exhaustive`: score thresholds; `clock`: after any score; mutation "Scorers keep the ball after a score" |
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

## Run metres (a stat, not a rule)

The printed game has no field position, so metres change nothing about who wins; they measure how far each carry got, from the same dice. Code: `carryMetres` and `TRY_RUN_IN`; tested by `players` ("run metres") and `invariants` (every tackle's metres from its dice, metres only from carries and tries, every player's metres adding up to the team's).

| Roll | Metres |
| --- | --- |
| Tackled | Twice the intensity less the tackle total, never below 0 |
| Big Hit on the second die, or a ruck contest | 0 |
| Line break | 10, and 5 more for each point the tackle total fell short |
| Try | 10 more for the run-in |

## House rules: weather and the bench

Two more optional extras, each a small change at named points in the engine. Weather is off unless chosen; the bench is on unless switched off. Both are part of the match (`newMatch({ weather, bench })`), so a save, a replay and an online match all carry them.

| Rule | Effect | Code | Tested by |
| --- | --- | --- | --- |
| Conditions | Rain on 35% of matches, wind on 50%, towards either end; drawn when the match is set up (online, by the host) | `rollWeather` | `conditions`: 20,000 draws |
| Rain | The Forwards' and Centres' free ‹Pass› face is a knock-on (scrum to the other side). The Scrum Half's passes, every run and every other face are as printed. A card that turns a knock-on into a pass still does (Big Pack, Epic up), and Drop-Goal Artist doesn't turn a wet ball into a drop goal | `attackFace` (`WET_HANDS`), `onAttack` | `conditions`: every face of every die, wet and dry; `invariants`: every free pass for the Forwards and Centres in the rain is wet, and no other; mutations "Rain makes no difference", "Everyone knocks on in the rain", "Rain left out of the pass odds" |
| Wind | +1 (10 m) on every kick for the side with the wind at their backs, −1 for the other side; the ends change at half time. It adds to any team card's kick bonus, so even "never misses" cards can fall short into the wind (their text says "in still air") | `windWith`, `windBonus`, `kickParts`, `onKick`, `onRange`, `onPenaltyCheck` | `conditions`; `invariants`: every kick's distance is the black die plus the card plus the wind; mutations "Wind blows the same way all match", "Wind helps both sides", "Wind left off the kick" |
| The bench | One replacement a half each. After an injury (two Big Hits), if the injured side has one, it chooses: bring it on for any injured player, which clears that player's whole penalty, or play on and keep it. At half time each side gets a fresh replacement, and a side with an injured player may use it then (the side kicking off chooses first). An unused replacement doesn't carry over | `offerBench`, `halfTimeBench`, `onChoose` (bench), the half-time step | `conditions`; `invariants`: injuries only go with a replacement, a replacement is always offered after an injury with one on the bench, never more than one a half; mutations "A replacement leaves the injury", "The bench never runs out", "No fresh replacement at half time", "No bench decision after an injury", "Bench offered with nobody on it", "No changes at half time", "Receivers choose first at half time" |
| The CPU and the bench | Rookie brings the replacement on for whoever was just hurt. Pro and Expert weigh each injury by how often that position carries (Forwards most, the Scrum Half least) and replace the costliest one straight away. `scripts`-style tuning (`benchChoice`'s `hold`) measured keeping the replacement for a worse injury against replacing at once over 40,000 matches each: holding at a cost of 0.18 won 49.9%, 0.25 won 49.8%, and holding until late in the half 49.6%, so it never did better | `benchChoice`, `CARRY_SHARE`, `BENCH_HOLD` | `conditions`; mutations "CPU never uses the bench", "Rookie keeps the injured player on" |

## House rules: the roll guide, auto-roll and the online timer

None of these changes what the dice do. They help players see what a roll is for, keep a match moving, and stop an online match stalling.

| Rule | Effect | Code | Tested by |
| --- | --- | --- | --- |
| The roll guide | Before every roll, each face of the die that decides it is shown with what it does, marked good (✓) or bad (✕) for the side rolling, plus a tally ("4 good, 2 bad") and, for the tackle, the chance of stopping the run. Each face is worked out by playing it through the engine with exactly that roll, so the guide can't disagree with the rules: injuries, the sin bin, rain, wind and team cards all show up in it. On the last play it says which faces end the match. It can be switched off in settings | `rollGuide`, `attackGuide` and the other face functions in `guide.js` | `guide`: every face of every roll the game can ask for, in thousands of real positions, against what the roll then does; tones and notes turn round for the other side; injuries, rain and the sin bin; the last play; mutation "Guide tones not turned round for the other side" |
| Dice badges | A die whose player is hurt shows the injury icon and its penalty (−1, −2) in its top-right corner; an advantage shows as +1, +2. The tackle dice show the sin bin or a red card, and any card that helps the tackle; the kick die shows the wind and any kicking card, in metres | `playerBadge`, `dieBadges` | `guide`: "badges"; mutations "Injury badge left off", "Sin bin badge left off the tackle dice", "Wind left off the kick badge"; e2e: the badge on the roll button matches the saved match at every tap |
| Auto-roll | Rolls on by itself until somebody has a choice to make (a pass, a kick at goal, a penalty, the bench, half time). Off by default, on by default online; a button on the match screen and a setting | `isAutomatic`, `autoButton` in `app.js` | e2e: "auto-roll" plays a whole match with eight taps, "online-two-phones" checks it's on |
| The online decision timer | Online, every decision has 10 seconds, shown as a shrinking bar to both phones. A choice in play (a pass, a drop goal, a penalty option, the bench) that runs out gives the other side a penalty where the ball is. A roll, half time, the toss call and a draft pick that run out are made for the player instead (the draft takes the pick the CPU would) | `DECISION_SECONDS`, `TIMED_DECISIONS`, `isLegal` and `actInPlace` (`timeout`); `startDecisionClock`, `timeUpDecision` | `clock`: a timeout is only legal on a timed choice and gives the other side a penalty; `online`: a timeout is sent and replayed like any other move; `invariants`; e2e: the guest's toss is called for them after 10 seconds and both phones see the clock; mutations "A timeout gives the penalty to the slow side", "Timeouts allowed at the draft", "Online timeouts not sent" |

## House rules: competitions

| Rule | Effect | Code | Tested by |
| --- | --- | --- | --- |
| Table points | 4 for a win and 2 for a draw. One bonus point for winning by 10 or more, or for losing by 5 or fewer, not the 4-try bonus, so a bonus is always within reach of the score. On the clock (standard length), 32% of wins carried the bonus and 39% of losses earned one | `POINTS`, `bonusFor`, `standings` | `tournament`: "table points"; mutations "Big-win bonus from 9", "Losing bonus only within 6", "Bonus point for a draw", "A draw worth a win" |
| Draws | A league or pool match on the clock can be drawn (6% at standard length). A knockout can't: level at full time goes to sudden death. A race to a target always has a winner | `matchRules`, `isKnockout`, `endHalf` | `clock`, `tournament`, `invariants`; mutations "No sudden death in knockouts", "Sudden death goes on after a score", "A draw goes to the home side", "Knockouts on the clock can end level" |
| The World Cup | All 24 nations of the 2027 World Cup in its six real pools. The top two from each pool and the four best thirds go to a round of 16 laid out as drawn (the best thirds go to the slots their pools allow), then quarter-finals, semi-finals and a final at Stadium Australia. Grounds are neutral unless Australia, the hosts, are playing | `WORLD_CUP`, `createCup`, `worldCupRound16`, `advance` | `tournament`: the pools, every one of the 15 ways four best thirds can come out, the bracket to the final, the grounds; mutations "Best thirds ignore their pools", "Third-placed sides by the wrong order", "Quarter-finals pair the wrong winners", "World Cup grounds neutral for Australia too" |
| Class | Nations are rated 1 to 5 (clubs from their level). In a match the CPU plays out between two other sides, the stronger one gets team cards for the gap: one Epic for a gap of one, up to two Mythics and two Epics for a gap of four. Over 300 quick matches each, the stronger side won 61% (on the clock) to 68% (a race) with a gap of one, and 85% to 95% with a gap of four, so the favourites usually go through without the results being certain. A match the player plays is drafted as normal | `ratingOf`, `classCards`, `simulateFixture` | `tournament`: "class"; mutation "Class favours the weaker side" |
| Real players | Every nation and club has five real players, one for each die, from recent squads. They label the dice and the stats; they don't change the rules | `SQUADS`, `realRoster` in `squads.js` | `tournament`: "real squads"; mutation "Made-up players for real sides" |

## House rules: team cards

Team cards aren't on the printed sheet. They're an optional extra, on by default, and every effect is a small change at one named point in the engine, so the printed rules underneath are untouched. Each card's text in the game is the whole of its effect.

| Card | Effect | Code | Tested by |
| --- | --- | --- | --- |
| The draft | Five different cards are dealt after the toss, each at a rarity rolled on its own (Common 55%, Rare 28%, Epic 13%, Mythic 4%). The toss **loser** picks 1st and 4th, the winner (who also has the first ball) 2nd and 3rd; the fifth card is discarded. No catch-up: a card is played at the rarity it was dealt. A side's two cards work together: numbers add up, lists join. Over 16,000 matches in each format the toss loser, who picks first, won 51.6% with cards on; with cards off the toss winner won 50.9% (race) and 49.4% (clock) | `dealCards`, `draftStep`, `drafterOf`, `onChoose` (draft), `cardEffects` | `cards`: 3,000 deals, every pick in order, the discard, merged effects; `invariants`: two different cards each from the deal, at their dealt rarities; mutations "Toss winner picks first", "Second pick may take the same card", "A deal can repeat a card", "Every card dealt Common", "Mythic as common as Epic", "A drafted card loses its rarity", "The winner picks first and fourth", "No card is discarded", "Two cards' kick bonuses don't add up" |
| Big Pack | Forwards' Hit Ups +1; Line Break 8 | `intensityParts` (`runBonus`) | `cards`; mutations "Card run bonus ignored", "Big Pack: no bonus on the big move" |
| Up and Under | Fly Half's High Ball 8, Fly Half Hit Ups +1, the Fly Half's Into Touch becomes a pass | `intensityParts`, `onAttack` (`faceSwap`) | `cards` |
| Midfield Maestro | The Centres' Intercepted face becomes a free pass | `onAttack` (`faceSwap`) | `cards`; mutation "Card face swaps ignored" |
| Sure Hands | The Outside Backs' Knock On and Into Touch become passes | `onAttack` (`faceSwap`) | `cards`; mutation "Sure Hands for every player" |
| Golden Boot | +2 (20 m) on conversion and penalty kicks; once a match, after a penalty goal they win the restart back instead of handing the ball over | `onKick`, `kickBonus`, `afterScore` (`keepsBall`) | `cards`: every range and kick face, the restart after every kind of goal; `invariants`: the restart goes to the side that conceded unless a kicking card wins it back after its own kind of goal; mutations "Kick bonus left off the kick", "Golden Boot helps drop goals too", "Kicking cards keep the ball after any score", "Keeping the ball never runs out" |
| Drop-Goal Artist | +2 on drop goals, and the Outside Backs' open Pass face is a drop-goal chance; once a match, after a drop goal they win the restart back | `onKick`, `onAttack` (`passToDrop`), `afterScore` | `cards`; mutation "Drop-Goal Artist: every open pass a drop chance" |
| Rush Defence | +1 on the first brown die against Hit Ups (not big moves) | `tackleBonusFor`, `resolveTackle` (`bonus`) | `cards`: all 36 dice pairs at every rarity; mutations "Rush Defence on both dice", "Rush Defence against big moves" |
| Jackal | A Big Hit on either die contests the ruck against Hit Ups up to 5; VIDEO REF also wins the ruck | `ruckFor`, `ruckEligible`, `resolveTackle`, `onRuck` | `cards`; mutations "Second-die ruck for everyone", "Jackal: video ref does not win the ruck" |
| Fortress | The other side's big moves are 2 lower against you (never below 1) | `intensityParts` (`specialDefence`) | `cards`; mutations "Fortress protects the attackers", "Fortress against Hit Ups too" |
| Clinical Finisher | Once a match, a NO TRY or held-up roll is rolled again | `onTry`, `useCharge` | `cards`; mutations "Limited cards never run out", "Once-a-match cards refreshed at half time" |
| Set-Piece Kings | Reset scrums and crooked lineouts go to them; +1 on their first two runs after a set piece they win | `onSetPiece` | `cards`: every feeder and piece; mutations "Set-Piece Kings ignored at resets", "Set-piece advantage for three runs" |
| Squeaky Clean | Once a half, PENALTY AGAINST on their own feed becomes PENALTY WON. From Rare up the referee never shows them a card | `onSetPiece`, `useCharge`, `onPenaltyCheck` (`noCards`) | `cards`; `invariants`: a side with it is never shown a card; mutations "Squeaky Clean on the other side's feed", "Squeaky Clean shown cards anyway" |

### Rarities

The table above is each card at **Common**, as it always was. Every rarity above keeps everything below it and adds to it (`cards`: "each rarity keeps everything the one below has, and adds to it" checks this for every card, effect by effect). The game shows each rarity's full text.

| Card | Rare adds | Epic adds | Mythic adds |
| --- | --- | --- | --- |
| Big Pack | Forwards' Hit Ups +2 | They never knock on | Hit Ups +3, Line Break 10, Scrum Half's Hit Up +2 |
| Midfield Maestro | Centres' Hit Ups +1, Thru the Gap 8 | Hit Ups +2, Thru the Gap 9 | Hit Ups +3, Thru the Gap 10, and everyone else's Hit Ups +1 |
| Sure Hands | Outside Backs' Hit Ups +1, Into the Corner 9 | Hit Ups +2, Into the Corner 10 | The Fly Half's Into Touch becomes a pass too |
| Up and Under | Conversions and penalties +10 m | High Ball 9, Fly Half Hit Ups +2, drop goals +10 m | High Ball 10, Fly Half Hit Ups +3, every kick +20 m |
| Golden Boot | Place kicks +30 m, drop goals +10 m; the restart back once a half | Place kicks +40 m (never miss in still air), drop goals +30 m | Every kick +40 m; the Fly Half's and Centres' ‹Pass› faces are drop-goal chances; the restart back after drop goals too |
| Drop-Goal Artist | Drop goals +30 m; the restart back once a half | Drop goals +40 m (never miss in still air); the Fly Half's ‹Pass› face is a drop-goal chance too | Every ‹Pass› face is a drop-goal chance |
| Rush Defence | +1 on both brown dice against Hit Ups | A Big Hit on either die contests the ruck | +1 on the first brown die against big moves too |
| Jackal | NO TRY also wins the ruck | Big moves can be contested too | Every ruck roll wins |
| Fortress | Big moves −3 | Big moves −4 | Hit Ups of 5 −1 too |
| Clinical Finisher | Once a half instead of once a match | One reroll on every try attempt | Up to two rerolls on every try attempt |
| Set-Piece Kings | They never lose their own scrum or lineout | They steal the other side's lineouts; the advantage lasts three runs | They steal the other side's scrums too |
| Squeaky Clean | Every time, not once a half; and the referee never shows them a card | Once a half, PENALTY WON on the other side's feed goes to them | Every time, on both feeds: they never give away a set-piece penalty |

New effects behind the higher rarities: `keepBall` with its uses (`afterScore`, `keepsBall`), `noCards` (`onPenaltyCheck`), `tackleBonus` on both dice (`tackleBonusFor`), `ruckOnSpecial` (`ruckFor`), `hitUpDefence` from a Hit Up of 5 (`intensityParts`), `ownFeedWins` and `stealFeed` (`onSetPiece`), Squeaky Clean's `theirFeedPenalty`, and uses `per: 'try'` and `per: 'always'` (`useCharge`). `cards` plays each with exact dice; `invariants` plays whole matches with every card at every rarity, checking the tackle against the rules reading with the new effects in it; the mutation tests plant a bug in each.

**Balance.** `scripts/balance-cards.mjs` plays 4,000 CPU matches for each card at each rarity against a side with no card, in either format (`node scripts/balance-cards.mjs 4000 standard rolls` for the clock). In a race Common cards lift the win rate by 7.8 to 12.5 points, Rare 12.0 to 16.5, Epic 15.7 to 19.7 and Mythic 21.3 to 27.9 (±1.5 at 95%); on the clock, where cards count for less, the averages are 7.3, 9.3, 12.1 and 18.1. Each card is stronger at every rarity in both formats, each rarity is stronger on average, and in a race any card two rarities up beats any card below; `cards` checks the recorded values (`value` for a race, `clock` for the clock). The win meter adds each side's cards to the model as an edge worth their measured lift in the match's format at the kick-off, fading as the match runs out, and does the same for sin bins (fading with the half), red cards and injuries, each measured over 3,000 matches (`winMeter`); the Expert CPU's look-ahead already plays all of these, so it judges by the model alone. At a penalty or drop-goal choice the model weighs the kick (with the ball back, if a kicking card has a use left) against playing on. The odds the game shows before a pass (break and error chances) include both sides' cards at their rarities; `cards` checks them against a count of every face and every pair of tackle dice for all 96 card, rarity and side combinations.

## How the checking works

- **`test/helpers.mjs`** holds a second, independent reading of the rules. It's written straight from the sheet and uses nothing from the engine except the dice data. The engine must agree with it in every case.
- **`test/exhaustive.test.mjs`** plays every combination rather than a sample: every face of every die, all 36 tackle dice pairs at every intensity and card state, every kick, every set piece, and every score threshold.
- **`test/invariants.test.mjs`** plays 1,500 full matches (`npm run test:fuzz` plays 20,000) with random, Rookie and Pro decisions in every CPU style, two thirds of them with team cards, four in five with the bench and half in random weather. After every action it checks more than 40 invariants: scores add up, conversions follow tries, possession only changes for a reason, each run's intensity is the die plus quick tap and cards minus injuries, every tackle agrees with the rules reading (cards included), every player's numbers add up to the team's, the state survives save and reload, the commentary never says "undefined", and more. It also confirms every card effect actually happened somewhere.
- **`test/odds.test.mjs`** checks that the dice are fair (chi-square) and that the odds shown to players match tens of thousands of real rolls.
- **`test/clock.test.mjs`** covers the match clock: the last play, every way the ball goes dead, sudden death, timeouts, the Fly Half's drop goals, and the win model on the clock against simulated matches. **`test/guide.test.mjs`** plays every face of every one-die roll in 60 whole matches (over 30,000 faces) and checks the guide against what each face then does.
- **`scripts/mutate.mjs`** (`npm run test:mutation`) plants 195 bugs, one at a time (in the rules, the clock and sudden death, the cards and their rarities, the five-card draft, the weather and the bench, player stats, the CPU, the guide and the dice badges, the online timer, tournaments and each league's play-offs, bonus points and draws, the World Cup, class and real squads, neutral grounds and kits, the Champions Cup, season stats, the club career, the daily challenge, the friends league, achievements, the coach and online play), and confirms the tests catch each one.
- **`test/e2e/run.mjs`** (`npm run test:e2e`) plays 17 complete matches and competitions in a real browser: against Pro and Expert, two players, keyboard only, reduced motion, the guided match, auto-roll, a World Cup, a league season through its play-offs, the Champions Cup into a club career, a scripted Mythic deal, a two-phone online match with the decision clock, the daily challenge with a stand-in for the shared leaderboard, a friends league on two phones, and the single-file build. Every time the game waits for a tap, it checks that the scoreboard, clock, possession marker, team cards and their rarities, draft order, win meter, injuries, dice guide, dice badges, prompt and buttons match the saved match exactly.
