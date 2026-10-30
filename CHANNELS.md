# Channels

The game is published as two claude.ai artifacts:

| Channel | Artifact | Built from |
| --- | --- | --- |
| **Real** | https://claude.ai/artifact/X7GPTEeuMFYFDnVSyiuKFL | commit `61ee825` (fair kick-offs after scores, a calm match screen with a fixed end for each side, the guide read 1 to 6, solid dice) |
| **Dev** | https://claude.ai/artifact/58EujGM35rJk24GvmtS1PF | the latest commit on `claude/digital-pocket-rugby` |

Real is what people play. Dev is where the next build takes shape: it shows a **Dev** badge and the commit it was built from on the title screen, and keeps its saves and career apart from Real (each artifact has its own storage).

```sh
node scripts/build-single.mjs --fragment          # Real: dist/pocket-rugby.fragment.html
node scripts/build-single.mjs --fragment --dev    # Dev:  dist/pocket-rugby-dev.fragment.html
```

To promote Dev to Real, build without `--dev` from the commit being promoted, publish it to the Real artifact, and update the table above.

## Capabilities

Both artifacts declare the `room` capability for online matches. From the build with the daily challenge and friends leagues on, the page also needs:

```js
{
  room: {},
  db: { rules: [
    { path: 'daily', read: 'view', write: 'owner' },  // the daily leaderboard: everyone reads it...
    { path: 'daily/{self}', write: 'interact' },      // ...and each player writes only their own entry
  ] },                                                // friends/<code>/...: the default (Contributors write)
  user: { scopes: ['profile'] },                      // ids for the leaderboard and leagues, names to show
  downloads: true,                                    // saving the daily score card
}
```

Friends who play the daily challenge or a friends league need the page shared with them as Contributors.
