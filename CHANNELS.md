# Channels

The game is published as two claude.ai artifacts:

| Channel | Artifact | Built from |
| --- | --- | --- |
| **Real** | https://claude.ai/artifact/X7GPTEeuMFYFDnVSyiuKFL | commit `b64bce4` (card rarities, real leagues) |
| **Dev** | https://claude.ai/artifact/58EujGM35rJk24GvmtS1PF | the latest commit on `claude/digital-pocket-rugby` |

Real is what people play. Dev is where the next build takes shape: it shows a **Dev** badge and the commit it was built from on the title screen, and keeps its saves and career apart from Real (each artifact has its own storage).

```sh
node scripts/build-single.mjs --fragment          # Real: dist/pocket-rugby.fragment.html
node scripts/build-single.mjs --fragment --dev    # Dev:  dist/pocket-rugby-dev.fragment.html
```

To promote Dev to Real, build without `--dev` from the commit being promoted, publish it to the Real artifact, and update the table above.
