# Deploying Sonix on EC2

This guide deploys the full app (UI + yt-dlp/ffmpeg downloads + Mongo + Vertex AI)
on an AWS EC2 instance, exposed over HTTPS via a free Cloudflare Tunnel.

> ⚠️ **Outbound note:** EC2 has a datacenter IP, which YouTube bot-blocks. To make
> downloads reliable you must supply `YTDLP_COOKIES` and/or `YTDLP_PROXY`
> (see step 5). Cloudflare Tunnel only handles *inbound* HTTPS, not this.

## 1. Launch the instance
- **AMI:** Ubuntu Server 22.04 or 24.04 LTS
- **Type:** `t3.small` (2 GB RAM) minimum — building Next.js needs RAM
- **Disk:** 20 GB
- **Security group:** allow **SSH (22)** only. With Cloudflare Tunnel you do
  **not** need to open 80/443.

## 2. Connect & clone
```bash
ssh -i your-key.pem ubuntu@<EC2_PUBLIC_IP>
git clone https://github.com/Vicky2114/Sonix---Music-Chill.git sonix
cd sonix
cp .env.example .env.local
nano .env.local        # fill in the values (see below)
```

### `.env.local` for EC2
```
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...

MONGODB_URI=mongodb+srv://...        # Atlas, or mongodb://localhost:27017
MONGODB_DB=sonix

GCP_PROJECT=your_project
GCP_LOCATION=us-central1
VERTEX_MODEL=gemini-2.5-flash-lite
GOOGLE_APPLICATION_CREDENTIALS=/home/ubuntu/sonix/sa-key.json

PYTHON_PATH=python3
FFMPEG_LOCATION=                     # blank — ffmpeg is on PATH on Linux
YTDLP_COOKIES=/home/ubuntu/sonix/cookies.txt
YTDLP_PROXY=
```

## 3. Run the setup script
```bash
bash deploy/ec2-setup.sh
```
Installs Node 20, Python, ffmpeg, yt-dlp, builds the app, starts it with pm2,
and installs cloudflared.

## 4. MongoDB
- **Atlas (recommended):** create a free cluster, allow the EC2 IP, put the SRV
  string in `MONGODB_URI`.
- **Local:** `sudo apt-get install -y mongodb` and use `mongodb://localhost:27017`.

## 5. Vertex AI service account
Local dev uses your gcloud ADC, but the server needs a key:
1. GCP Console → IAM → Service Accounts → create one with **Vertex AI User**.
2. Create a JSON key, upload to the box (`scp sa-key.json ubuntu@IP:~/sonix/`).
3. Set `GOOGLE_APPLICATION_CREDENTIALS` to its path in `.env.local`.
4. Enable the **Vertex AI API** on the project.

## 6. YouTube cookies (for downloads)
Export cookies from a browser logged into YouTube (use a "Get cookies.txt"
extension), upload as `cookies.txt`, set `YTDLP_COOKIES`. For heavy use add a
residential proxy in `YTDLP_PROXY`.

```bash
pm2 restart sonix      # apply env changes
```

## 7. Public HTTPS
Quick (ephemeral URL, great for testing):
```bash
cloudflared tunnel --url http://localhost:3000
```
Stable (your own domain on a free Cloudflare account):
```bash
cloudflared tunnel login
cloudflared tunnel create sonix
cloudflared tunnel route dns sonix sonix.yourdomain.com
# config ~/.cloudflared/config.yml -> service: http://localhost:3000
sudo cloudflared service install
```

## Ops cheatsheet
```bash
pm2 logs sonix       # logs
pm2 restart sonix    # restart after env/code changes
git pull && npm install && npm run build && pm2 restart sonix   # deploy update
```
