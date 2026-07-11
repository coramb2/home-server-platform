# Sprint 0 — Foundation & Repo Hygiene (Debian 12)

**Goal:** a hardened, Tailscale-only server that serves HTTPS with a trusted cert, and a public
repo that cannot leak secrets or the home-network map.

**Exit criterion:** both iPhones load `https://<your-ts.net>/` with a **valid cert and no
warning**, and the repo is public with secrets/data ignored and gitleaks armed.

> Placeholders: `<ADMIN>` = your sudo user, `<LAN_SUBNET>` = e.g. `192.168.1.0/24`,
> `<TS_NAME>` = your Tailscale MagicDNS name (e.g. `houseos.tailXXXX.ts.net`).
> **Swap notes:** Ubuntu LTS — identical. Proxmox — run everything below *inside* the VM/LXC
> that will host Docker (give an LXC `nesting=1` for Docker).

---

## 0.1 Base OS hardening

```bash
# From the server console (or existing SSH):
sudo apt update && sudo apt full-upgrade -y

# Non-root admin user with sudo (skip if it already exists):
sudo adduser <ADMIN> && sudo usermod -aG sudo <ADMIN>
```

**Static addressing:** set a DHCP reservation on your router for the server's MAC (simplest),
or configure a static IP. Confirm it survives a reboot.

**SSH key-only.** From your *laptop*, push your key, then lock SSH down:

```bash
# On your laptop:
ssh-copy-id <ADMIN>@<server-ip>          # confirm key login works BEFORE the next step
```

```bash
# On the server — edit /etc/ssh/sshd_config.d/99-hardening.conf:
sudo tee /etc/ssh/sshd_config.d/99-hardening.conf >/dev/null <<'EOF'
PasswordAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
EOF
sudo systemctl restart ssh
```

> ⚠️ Keep your current session open and test a **new** SSH login before closing it, so a typo
> can't lock you out.

**Automatic security updates:**

```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades   # choose "Yes"
```

## 0.2 Firewall — default-deny inbound

```bash
sudo apt install -y ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing

# SSH from the LAN only (local admin):
sudo ufw allow from <LAN_SUBNET> to any port 22 proto tcp

# Let Tailscale in, and allow everything arriving over the tailnet interface:
sudo ufw allow 41641/udp                 # Tailscale direct connections
sudo ufw allow in on tailscale0          # trust the mesh interface

sudo ufw enable
sudo ufw status verbose
```

There is **no** rule opening 443 to the LAN or WAN — the platform is reachable only over
`tailscale0`. That is the whole security model.

## 0.3 Docker + Compose v2

```bash
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker <ADMIN>          # log out/in for this to take effect
docker compose version
```

## 0.4 Tailscale — on the server AND both iPhones

```bash
# Server:
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

- Install the **Tailscale** app on both iPhones and sign in to the same tailnet.
- In the Tailscale admin console: enable **MagicDNS** and **HTTPS Certificates**.
- Note the server's MagicDNS name → this is `<TS_NAME>`. Put it in `.env` as `PLATFORM_HOST`
  (never commit it).

> This `<TS_NAME>` + Tailscale cert is what makes the iPhone PWA install and Web Push work
> without a cert warning. Do not substitute an internal-CA `*.home.lan` name.

## 0.5 Backup target

Mount the second disk / NAS and confirm it's writable (real restore config comes in Sprint 4):

```bash
mkdir -p ~/backups && touch ~/backups/.write-test && rm ~/backups/.write-test && echo "writable"
# (or mount your NAS export and test the same way)
```

## 0.6 Repo: import the analyzer + arm the leak scanner

From the repo root (`home-server-platform/`):

```bash
# Bring the analyzer in as a subtree so it becomes modules/network, history preserved:
git remote add analyzer https://github.com/coramb2/network-traffic-analyzer.git
git fetch analyzer
git subtree add --prefix=modules/network analyzer main --squash

# Arm gitleaks + the other pre-commit hooks:
pipx install pre-commit || pip install --user pre-commit
pre-commit install
pre-commit run --all-files        # first full scan of the tree
```

> If the gitleaks hook needs a Go toolchain on this host, install the binary directly instead
> (`sudo apt install -y golang-go` then re-run, or grab a gitleaks release binary) and run
> `gitleaks git --log-opts="--all"` for a full-history scan.

## 0.7 Caddy — HTTPS over the Tailscale cert

Fetch a cert for your MagicDNS name and serve a placeholder. Minimal, non-Docker first pass to
prove the cert path works end-to-end:

```bash
sudo tailscale cert <TS_NAME>     # writes <TS_NAME>.crt and <TS_NAME>.key
```

Copy `caddy/Caddyfile.example` to `caddy/Caddyfile`, set your `<TS_NAME>`, and point `tls` at
those files:

```
<TS_NAME> {
    tls /path/to/<TS_NAME>.crt /path/to/<TS_NAME>.key
    respond "home-server-platform: hello from the tailnet" 200
}
```

```bash
caddy run --config caddy/Caddyfile      # or `caddy start`
```

> Tailscale certs are 90-day Let's Encrypt certs — schedule a monthly `tailscale cert` refresh
> (or use the `caddy-tailscale` plugin to automate issuance). We'll fold this into the real
> Compose stack in Sprint 1.

**Verify the exit criterion:** on **both iPhones**, open `https://<TS_NAME>/`. You should see
the placeholder text with a padlock and **no certificate warning**. If you get a warning, the
cert or MagicDNS step isn't right — fix it here before Sprint 1, because PWA install and push
depend on it.

---

## Sprint 0 checklist

- [ ] OS updated; non-root sudo user; static IP/reservation
- [ ] SSH key-only (password + root login disabled), verified with a fresh session
- [ ] `unattended-upgrades` enabled
- [ ] `ufw` default-deny; SSH (LAN) + `tailscale0` allowed; **no** 443 to LAN/WAN
- [ ] Docker + Compose v2 working without `sudo`
- [ ] Tailscale up on server + both iPhones; MagicDNS + HTTPS certs enabled
- [ ] Backup target mounted and writable
- [ ] Analyzer imported to `modules/network`; pre-commit + gitleaks armed and clean
- [ ] Caddy serving `https://<TS_NAME>/` — valid cert, no warning, on both iPhones
