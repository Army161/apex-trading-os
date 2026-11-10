# Quant learning path

From archive/chat/89, a career video on breaking into quant firms. It is a reading list, not a strategy. Nothing here was built or tested, and the video's pay figures are the speaker's claims.

What the video says to learn, in order of how often it came up:

1. **Probability and statistics.** Expected value, conditional probability, distributions, hypothesis tests, regression. This is the base for everything in `web/lib/engine/quant.ts` and the deflated Sharpe gate in `web/lib/leaderboard.ts`.
2. **Machine learning.** Linear models first (the AR(1) fit in chat/87), then regularisation, cross-validation and overfitting. Time-ordered splits only, never shuffled.
3. **Linear algebra.** Matrices, eigenvalues, least squares, covariance (used by the correlation matrix in `peak.ts`).
4. **Multivariable calculus.** Gradients and optimisation (the SGD fit and the GARCH likelihood in `garch.ts`).
5. **Data structures and algorithms, with dynamic programming.** For coding interviews.

Interview prep book named in the video: *A Practical Guide to Quantitative Finance Interviews* by Xinfeng Zhou, known as the "Green Book". Title only; we did not download it.

The video also pitches a paid accelerator. We did not sign up for it.
