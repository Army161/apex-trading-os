# Automated PR review for the Apex repo (archive/chat/73)

This is a candidate only. Nothing has been installed. It waits until Jeremy creates the Apex GitHub repository and says yes.

The video shows an open-source AI PR reviewer that runs as a GitHub Action, called PR-Agent in the video. It describes, reviews and suggests fixes on each pull request, and works with any model. The video says it was a commercial product that was given to the community. **Check its actual license file and the Docker image before using it.** The Granola and CodeRabbit segments are ads.

## Parts worth using
- **Diff compression**: large PRs are trimmed before they reach the model. Deleted files, images, binaries and lockfiles go first. This keeps token costs down.
- **Dynamic context**: the reviewer reads the code around each change, not just the diff lines.
- **Self-reflection scoring**: the reviewer scores its own suggestions and drops the weak ones.
- **Committable suggestions**: each suggestion can be applied from the PR page. A person still clicks it.
- **Review guide first**: an effort score and a short gist come before the suggestions.
- **Path-scoped skills** with token caps, for example a strategy-engine review guide that applies only under `web/lib/engine/`.

## Rules for Apex
- Keys go in **GitHub secrets** that Jeremy sets himself. They never go in the workflow file, the repo, the chat or the logs. Use the built-in GitHub token with the narrowest permissions it needs: read contents, write PR comments.
- The review bot can **comment and suggest. It never merges and never approves.**
- Any PR touching trading, orders or money is red blast radius and never auto-merges, whatever the bot says. That covers `bots/`, `web/lib/engine/`, `web/lib/policy.ts`, any broker or exchange code, and keys. See `docs/how-to-direct-apex-agents.md`.
- Run it only on PRs from the repo itself, not on forks, so outside code can't read the secrets.
- Pin the action and the image to an exact version, never `latest`.
- The bot's review adds to `cd web && npx tsc --noEmit -p . && npm test`. It doesn't replace them.
- The model choice follows Jeremy's pending pick (Claude now; Ollama, NVIDIA NIM or DeepSeek are options).
