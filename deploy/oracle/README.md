# Oracle VM Backend Deployment

This directory contains the backend-only deployment files for Oracle Cloud.

## Topology

- Oracle VM runs FastAPI only
- Vercel runs Next.js frontend
- Cloudflare points public domains to Vercel
- Oracle is used as the API origin

Recommended DNS layout:

- `openashare.com` -> Vercel
- `www.openashare.com` -> Vercel
- `api.openashare.com` -> Oracle VM public IP

## Files

- `.env.backend.example`: runtime variables for the backend
- `openashare-backend.service`: systemd unit for FastAPI
- `openashare-nginx.conf`: Nginx reverse proxy for the backend

`openashare-frontend.service` is kept only as a reference artifact and is not part of the recommended deployment path.

## Backend environment

Copy the example into `/opt/openashare/backend/.env` and fill in real values:

```env
LLM_API_KEY=your_api_key_here
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-chat

DEMO_ACCESS_CODE=your_demo_code
DEMO_ACCESS_SECRET=your_demo_secret

DATA_COUNT=180
MONITOR_DB_PATH=/opt/openashare/backend/data/monitor.db

NEWS_TRACKING_ENABLED=true
FUND_FLOW_TRACKING_ENABLED=true
WEB_SEARCH_ENABLED=true

MONITOR_ENABLED=false
MONITOR_INTERVAL_SECONDS=300
ALERT_MIN_PRIORITY=3

API_HOST=127.0.0.1
API_PORT=8000
API_WORKERS=1

CORS_ALLOWED_ORIGINS=https://openashare.com,https://www.openashare.com,https://your-project.vercel.app
```

## Installation

1. Install dependencies:

```bash
sudo apt update
sudo apt install -y git python3 python3-venv python3-pip build-essential nginx
```

2. Clone the repository:

```bash
sudo mkdir -p /opt/openashare
sudo chown -R ubuntu:ubuntu /opt/openashare
cd /opt/openashare
git clone <your-repo-url> backend
cd backend
```

3. Install backend dependencies:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements_api.txt
```

4. Configure `.env`:

```bash
cp deploy/oracle/.env.backend.example .env
nano .env
```

5. Start the backend:

```bash
chmod +x scripts/run_api_prod.sh
./scripts/run_api_prod.sh
```

6. Install the systemd unit:

```bash
sudo cp deploy/oracle/openashare-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable openashare-backend
sudo systemctl restart openashare-backend
sudo systemctl status openashare-backend
```

7. Install Nginx:

```bash
sudo cp deploy/oracle/openashare-nginx.conf /etc/nginx/conf.d/openashare.conf
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx
```

## Verification

Use the health endpoint to verify the source server:

```bash
curl http://127.0.0.1:8000/healthz
curl http://<oracle-public-ip>/healthz
```

Expected response:

```json
{"status":"ok"}
```
