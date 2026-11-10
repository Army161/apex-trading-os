# Making money from Apex beyond trading

Source: [archive/chat/39](../archive/chat/39-open-source-business-models.md) (how open source SaaS companies earn money). This is a note for Jeremy to decide on. Nothing here is set up yet.

**Recommendation: keep the repo private for now.** It holds strategy logic, risk rules and order code, and the trading edge (if any) is worth more than the marketing a public repo brings. Revisit once Apex has a few months of honest paper results.

## The three options

| Option | How it earns | Upside | Downside |
|---|---|---|---|
| **Hosted SaaS** (private code) | Monthly subscription for the dashboard, Apex AI, Risk Mitigator, Telegram bot and research council. Users bring their own exchange and AI keys. | Simplest. Code and strategies stay private. Same model most open source SaaS uses anyway: people pay to not self-host. | No GitHub marketing boost. You carry the support, uptime and security load for other people's accounts. |
| **Open core** | Public repo under AGPL-3.0, with a separate `ee/` folder under a paid licence (the model in chat/39). Free self-hosting; paid hosted plan and paid enterprise features. | GitHub and Product Hunt reach, outside contributors, free developer credits for open source projects (code review tools, AI plans). AGPL stops closed forks. | Strategy and risk code become public, and AI makes it cheap to scan public code for holes (the reason two companies in chat/39 closed their source). Contributions need review. |
| **Keep it private** (personal tool) | Only Jeremy's own trading. | Nothing exposed; no support burden. | No revenue beyond trading. |

## If you go SaaS or open core later

- Keep strategies, live parameters and anything that places orders out of any public folder. Publish the dashboard shell, research tools and education features first.
- Never hold customer exchange keys on Apex servers. Keys stay in the customer's own environment, the same rule Apex follows for Jeremy.
- Trading software sold to others may need legal review (financial advice and money transmission rules vary by country). Apex would sell research and risk tools, not signals or promised returns.
- Be honest in marketing: show backtests and paper results exactly as they are, with no guaranteed profit claims.
