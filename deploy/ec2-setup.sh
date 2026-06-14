#!/usr/bin/env bash
# Sonix — one-shot EC2 setup (Ubuntu 22.04 / 24.04).
# Usage:
#   ssh into your instance, then:
#     git clone https://github.com/Vicky2114/Sonix---Music-Chill.git sonix
#     cd sonix
#     cp .env.example .env.local   # then edit .env.local with your values
#     bash deploy/ec2-setup.sh
set -euo pipefail

echo "==> Updating apt + installing base packages (python, ffmpeg, git)..."
sudo apt-get update -y
sudo apt-get install -y python3 python3-pip ffmpeg git curl ca-certificates

echo "==> Installing Node.js 20 (NodeSource)..."
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -v && npm -v

echo "==> Installing yt-dlp (pip)..."
python3 -m pip install -U --break-system-packages yt-dlp || python3 -m pip install -U yt-dlp
python3 -m yt_dlp --version

# MongoDB (local). Skip with: SKIP_MONGO=1 bash deploy/ec2-setup.sh
# Non-fatal: if it fails, the script continues (use Atlas via MONGODB_URI).
# Later you can switch to Atlas by just editing MONGODB_URI in .env.local.
if [ "${SKIP_MONGO:-0}" != "1" ] && ! command -v mongod >/dev/null 2>&1; then
  echo "==> Installing MongoDB Community 8.0 (local DB)..."
  CODENAME="$(lsb_release -cs)"
  if curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc \
        | sudo gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg --dearmor; then
    echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu ${CODENAME}/mongodb-org/8.0 multiverse" \
      | sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list >/dev/null
    if sudo apt-get update -y && sudo apt-get install -y mongodb-org; then
      sudo systemctl enable --now mongod
      echo "    Local MongoDB running on mongodb://localhost:27017"
    else
      echo "    !! MongoDB install failed — removing repo & continuing. Use Atlas (set MONGODB_URI)."
      sudo rm -f /etc/apt/sources.list.d/mongodb-org-8.0.list
    fi
  fi
fi

echo "==> Installing app dependencies + building..."
npm install
npm run build

echo "==> Installing pm2 (process manager) and starting the app..."
sudo npm install -g pm2
pm2 delete sonix >/dev/null 2>&1 || true
pm2 start npm --name sonix -- run start
pm2 save
# make pm2 restart on reboot (prints a command you must run once)
pm2 startup systemd -u "$USER" --hp "$HOME" || true

echo "==> Installing cloudflared (for free public HTTPS without opening ports)..."
if ! command -v cloudflared >/dev/null 2>&1; then
  sudo mkdir -p /usr/share/keyrings
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
  echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" | sudo tee /etc/apt/sources.list.d/cloudflared.list
  sudo apt-get update -y
  sudo apt-get install -y cloudflared
fi

cat <<'NOTE'

============================================================
 ✅ Sonix is running locally on the instance at :3000
============================================================

NEXT STEPS:

1) MongoDB — local MongoDB is already installed & running on this box.
   In .env.local use:  MONGODB_URI=mongodb://localhost:27017
   To switch to Atlas LATER: just change MONGODB_URI (e.g. mongodb+srv://...)
   and run `pm2 restart sonix`. (Data won't auto-copy between local & Atlas.)

2) Vertex AI — upload a service-account JSON key and set in .env.local:
     GOOGLE_APPLICATION_CREDENTIALS=/home/ubuntu/sonix/sa-key.json
   (Enable the "Vertex AI API" on the GCP project.)

3) Downloads on EC2 — YouTube blocks datacenter IPs. In .env.local set:
     YTDLP_COOKIES=/home/ubuntu/sonix/cookies.txt     (export from a logged-in browser)
     YTDLP_PROXY=http://user:pass@residential-proxy:port   (optional, most reliable)

4) Public HTTPS URL (quick test, ephemeral):
     cloudflared tunnel --url http://localhost:3000
   For a STABLE url: `cloudflared tunnel login`, create a named tunnel bound to a
   domain, and run it as a service. See deploy/DEPLOY.md.

Useful:
   pm2 logs sonix      # view app logs
   pm2 restart sonix   # after editing .env.local
============================================================
NOTE
