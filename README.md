# AiSensy Onboarding Dashboard

Real-time reporting dashboard for the Partnership Onboarding pipeline.
Webhook receiver + SQLite DB + Chart.js dashboard — deployed free on Render.com.

## Local setup

```bash
npm install
PIPEDRIVE_API_TOKEN=your_token_here npm start
# Open http://localhost:3000
```

## Deploy to Render.com (free)

1. Push this folder to a GitHub repo
2. Go to https://render.com → New → Web Service
3. Connect your GitHub repo
4. Render auto-detects render.yaml — just add the env variable:
   - Key: `PIPEDRIVE_API_TOKEN`
   - Value: your PipeDrive API token
5. Click Deploy

Your live URL will be: `https://aisensy-onboarding-dashboard.onrender.com`

## Configure PipeDrive Automation

In PipeDrive → Automations → your "Onboarding Report x Sheets" automation:
- Change the webhook URL to: `https://YOUR-RENDER-URL.onrender.com/webhook`
- Keep the same JSON body as before

## First run

1. Open your dashboard URL
2. Click **"Backfill historical"** button — imports all past deals
3. Dashboard auto-refreshes every 60 seconds

## Keep free tier alive (prevents cold starts)

Set up a free UptimeRobot monitor:
- URL: `https://YOUR-RENDER-URL.onrender.com/health`
- Interval: every 5 minutes

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Dashboard UI |
| `POST /webhook` | PipeDrive webhook receiver |
| `POST /backfill` | Import all historical deals |
| `GET /api/stats` | Summary stat cards |
| `GET /api/summary` | Monthly counts by exec |
| `GET /api/leaderboard` | Exec rankings |
| `GET /api/by-type` | Deals by partnership type |
| `GET /api/recent` | Last 50 deals |
| `GET /health` | Health check |
