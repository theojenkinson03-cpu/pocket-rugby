// Career record and achievements. A small tracker follows each match's events
// for the things the final state can't show (a comeback, a 50 m drop goal);
// at full time the record is updated and achievements are checked.

import { POSITIONS } from './dice.js';
import { RARITY_IDS } from './cards.js';

export function newCareer() {
  return {
    version: 1,
    played: 0,
    won: 0,
    lost: 0,
    streak: 0,
    bestStreak: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    tries: 0,
    metres: 0,
    byLevel: { rookie: { played: 0, won: 0 }, pro: { played: 0, won: 0 }, expert: { played: 0, won: 0 } },
    twoPlayer: 0,
    online: { played: 0, won: 0 },
    cups: 0,
    leagues: 0,
    europe: 0,
    biggestWin: null,
    cardsWon: [],
    // The rarest version of each card you've won with.
    cardRarity: {},
    achievements: {},
  };
}

export function newTracker(me) {
  return { me, maxDeficit: 0, videosBeforeTry: 0, videoTry: false, tapTry: false, longDrop: false, longPenalty: false, postHits: 0, rucksWon: 0, intercepts: 0, lastScorer: null, lastScoreKind: null };
}

// Follows one action's events. `before` is the match before the action.
export function track(tracker, before, events, after) {
  const me = tracker.me;
  if (me === null || me === undefined) return tracker;
  for (const e of events) {
    switch (e.type) {
      case 'videoRef':
        if (e.team === me) tracker.videosBeforeTry++;
        break;
      case 'try':
        if (e.team === me) {
          if (tracker.videosBeforeTry >= 2) tracker.videoTry = true;
          if (before.quickTap > 0 && before.attacker === me) tracker.tapTry = true;
        }
        tracker.videosBeforeTry = 0;
        break;
      case 'noTry':
        tracker.videosBeforeTry = 0;
        break;
      case 'kick':
        if (e.team !== me) break;
        if (e.good && e.range === 5 && e.kick === 'drop') tracker.longDrop = true;
        if (e.good && e.range === 5 && e.kick === 'penalty') tracker.longPenalty = true;
        if (!e.good && e.distance === e.range - 1) tracker.postHits++;
        break;
      case 'ruck':
        if (e.won && e.team === me) tracker.rucksWon++;
        break;
      case 'intercept':
        if (e.team === me) tracker.intercepts++;
        break;
      case 'score':
        tracker.lastScorer = e.team;
        tracker.lastScoreKind = e.kind;
        break;
    }
  }
  const deficit = after.teams[1 - me].score - after.teams[me].score;
  tracker.maxDeficit = Math.max(tracker.maxDeficit, deficit);
  return tracker;
}

const maxPlayer = (match, me, key) => Math.max(...POSITIONS.map(p => match.teams[me].players?.[p]?.[key] || 0));

// Each check gets (match, me, tracker, context, career) after the career has
// been updated with this match. context: {mode, level, tournament, finished}.
export const ACHIEVEMENTS = [
  { id: 'first-win', name: 'First Win', text: 'Win a match.', check: (m, me) => m.winner === me },
  { id: 'hat-trick', name: 'Hat-trick', text: 'One player scores three tries in a match.', check: (m, me) => maxPlayer(m, me, 'tries') >= 3 },
  { id: 'try-fest', name: 'Try Fest', text: 'Score six tries in a match.', check: (m, me) => m.teams[me].stats.tries >= 6 },
  { id: 'shut-out', name: 'Shut Out', text: 'Win without conceding a point.', check: (m, me) => m.winner === me && m.teams[1 - me].score === 0 },
  { id: 'comeback', name: 'Comeback', text: 'Win after trailing by 10 or more.', check: (m, me, t) => m.winner === me && t.maxDeficit >= 10 },
  { id: 'ice-cold', name: 'Ice Cold', text: 'Win the match with a penalty or drop goal.', check: (m, me, t) => m.winner === me && t.lastScorer === me && ['penalty', 'drop'].includes(t.lastScoreKind) },
  { id: 'from-halfway', name: 'From Halfway', text: 'Land a 50 m drop goal.', check: (m, me, t) => t.longDrop },
  { id: 'monster-boot', name: 'Monster Boot', text: 'Land a 50 m penalty goal.', check: (m, me, t) => t.longPenalty },
  { id: 'mr-reliable', name: 'Mr Reliable', text: 'Kick four conversions in a match without missing.', check: (m, me) => m.teams[me].stats.conversions >= 4 && m.teams[me].stats.conversions === m.teams[me].stats.conversionAttempts },
  { id: 'so-close', name: 'So Close', text: 'Hit the post.', check: (m, me, t) => t.postHits > 0 },
  { id: 'boot-camp', name: 'Boot Camp', text: 'Score 12 kicking points in a match.', check: (m, me) => m.teams[me].stats.conversions * 2 + (m.teams[me].stats.penaltyGoals + m.teams[me].stats.dropGoals) * 3 >= 12 },
  { id: 'hundred-metres', name: 'Hundred Metres', text: 'One player makes 100 m in a match.', check: (m, me) => maxPlayer(m, me, 'metres') >= 100 },
  { id: 'gain-line', name: 'Gain Line Kings', text: 'Make 250 m as a team in a match.', check: (m, me) => (m.teams[me].stats.metres || 0) >= 250 },
  { id: 'brick-wall', name: 'Brick Wall', text: 'Make 25 tackles in a match.', check: (m, me) => m.teams[me].stats.tackles >= 25 },
  { id: 'big-hitter', name: 'Big Hitter', text: 'Land four big hits in a match.', check: (m, me) => m.teams[me].stats.bigHits >= 4 },
  { id: 'ball-thief', name: 'Ball Thief', text: 'Win two turnovers at the ruck in a match.', check: (m, me, t) => t.rucksWon >= 2 },
  { id: 'read-it', name: 'Read It', text: 'Make two interceptions in a match.', check: (m, me, t) => t.intercepts >= 2 },
  { id: 'video-drama', name: 'Video Drama', text: 'Score a try after two video-ref reviews.', check: (m, me, t) => t.videoTry },
  { id: 'tap-and-go', name: 'Tap and Go', text: 'Score a try during a quick-tap advantage.', check: (m, me, t) => t.tapTry },
  { id: 'fourteen', name: 'Fourteen Men', text: 'Win with a player in the sin bin at full time.', check: (m, me) => m.winner === me && m.teams[me].sinBin },
  { id: 'against-odds', name: 'Against the Odds', text: 'Win after a red card.', check: (m, me) => m.winner === me && m.teams[me].yellows >= 2 },
  { id: 'giant-killer', name: 'Giant Killer', text: 'Beat the Expert CPU.', check: (m, me, t, c) => m.winner === me && c.level === 'expert' },
  { id: 'marathon', name: 'Marathon', text: 'Win a Marathon match.', check: (m, me) => m.winner === me && m.length === 'long' },
  { id: 'on-a-roll', name: 'On a Roll', text: 'Win five matches in a row against the CPU.', check: (m, me, t, c, career) => career.streak >= 5 },
  { id: 'card-sharp', name: 'Card Sharp', text: 'Win with six different team cards.', check: (m, me, t, c, career) => career.cardsWon.length >= 6 },
  { id: 'mythic', name: 'Mythic', text: 'Win a match with a Mythic team card.', check: (m, me) => m.winner === me && (m.teams[me].cards || []).some(card => card.rarity === 'mythic') },
  { id: 'cup-winners', name: 'Nations Cup Winners', text: 'Win the Nations Cup.', check: (m, me, t, c) => c.tournament?.kind === 'cup' && c.tournament.champion },
  { id: 'champions', name: 'League Champions', text: 'Win a league: Super Rugby, the Prem, the URC or the Top 14.', check: (m, me, t, c) => c.tournament?.kind === 'league' && c.tournament.champion },
  { id: 'european-champions', name: 'Champions of Europe', text: 'Win the Champions Cup.', check: (m, me, t, c) => c.tournament?.kind === 'champions' && c.tournament.champion },
  { id: 'the-double', name: 'The Double', text: 'Win your league and the Champions Cup in the same season.', check: (m, me, t, c) => !!c.tournament?.double },
  { id: 'dynasty', name: 'Dynasty', text: 'Win three league titles with one club.', check: (m, me, t, c) => (c.tournament?.leagueTitles || 0) >= 3 },
  { id: 'late-show', name: 'Late Show', text: 'Win a daily challenge.', check: (m, me, t, c) => !!c.daily && m.winner === me },
  { id: 'friends-champions', name: 'Bragging Rights', text: 'Win a friends league.', check: (m, me, t, c) => !!c.friendsFinal && m.winner === me },
  { id: 'invincibles', name: 'Invincibles', text: 'Win a tournament without losing a match.', check: (m, me, t, c) => !!c.tournament?.champion && c.tournament.lost === 0 },
  { id: 'online-win', name: 'Long-Distance Win', text: 'Win an online match.', check: (m, me, t, c) => c.mode === 'online' && m.winner === me },
  { id: 'graduate', name: 'Graduate', text: 'Finish the guided first match.', check: (m, me, t, c) => c.mode === 'learn' },
];

export const ACHIEVEMENT_BY_ID = Object.fromEntries(ACHIEVEMENTS.map(a => [a.id, a]));

// Updates the career with a finished match and returns the achievements it
// unlocked. Two-player matches on one phone only count towards matches played.
export function recordMatch(career, match, tracker, context) {
  const c = career;
  if (context.mode === '2p') {
    c.twoPlayer++;
    return [];
  }
  const me = tracker.me;
  const won = match.winner === me;
  const mine = match.teams[me];
  const theirs = match.teams[1 - me];
  c.played++;
  if (won) c.won++;
  else if (match.winner === null) c.drawn = (c.drawn || 0) + 1;
  else c.lost++;
  c.pointsFor += mine.score;
  c.pointsAgainst += theirs.score;
  c.tries += mine.stats.tries;
  c.metres = (c.metres || 0) + (mine.stats.metres || 0);
  if (context.mode === 'online') {
    c.online.played++;
    if (won) c.online.won++;
  } else {
    const level = c.byLevel[context.level] || (c.byLevel[context.level] = { played: 0, won: 0 });
    level.played++;
    if (won) level.won++;
    c.streak = won ? c.streak + 1 : 0;
    c.bestStreak = Math.max(c.bestStreak, c.streak);
  }
  if (won) {
    const margin = mine.score - theirs.score;
    if (!c.biggestWin || margin > c.biggestWin.margin) c.biggestWin = { margin, score: `${mine.score}–${theirs.score}`, against: theirs.name };
    for (const card of mine.cards || []) {
      if (!c.cardsWon.includes(card.id)) c.cardsWon.push(card.id);
      c.cardRarity ??= {};
      if (RARITY_IDS.indexOf(card.rarity) > RARITY_IDS.indexOf(c.cardRarity[card.id] ?? '')) c.cardRarity[card.id] = card.rarity;
    }
  }
  if (context.tournament?.champion) {
    if (context.tournament.kind === 'cup') c.cups++;
    else if (context.tournament.kind === 'champions') c.europe = (c.europe || 0) + 1;
    else c.leagues++;
  }
  const unlocked = [];
  for (const a of ACHIEVEMENTS) {
    if (c.achievements[a.id]) continue;
    if (a.check(match, me, tracker, context, c)) {
      c.achievements[a.id] = new Date().toISOString().slice(0, 10);
      unlocked.push(a.id);
    }
  }
  return unlocked;
}
