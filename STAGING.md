# Staging workflow

Production is the `main` branch → your live Netlify site.
`staging` is a long-lived branch for previewing work before it goes live.

## Flow

1. Feature work is committed on a feature branch.
2. It's merged into **`staging`** and pushed.
3. Netlify's **branch deploy** rebuilds the staging URL (`staging--<your-site>.netlify.app`).
4. Review there (phone or desktop).
5. When approved, `staging` is promoted to **`main`**, which deploys production.

Nothing reaches `main` (production) until you've seen it on the staging URL and said go.

## One-time Netlify setup (dashboard)

1. **Site configuration → Build & deploy → Branch deploys** → set to **"Let me add individual branches"** and add `staging` (or "All branches"). This creates `staging--<your-site>.netlify.app`.
2. **Site configuration → Environment variables**: make sure `GEMINI_API_KEY` is available to branch deploys (Netlify lets you scope a variable to specific deploy contexts — include "Branch deploys" or set it for "All").
3. If `COACH_ALLOWED_ORIGINS` is set for production, **add the staging origin** (`https://staging--<your-site>.netlify.app`) to the comma-separated list, or the AI coach will reject requests from staging. The rest of the calculator works regardless.

## Promoting staging to production

```bash
git checkout main
git pull origin main
git merge --no-ff staging -m "Release: <what changed>"
git push origin main
```
