# Part 6 — The server

[← Previous](05-aws-storage-secrets-images.md) · [Guide index](README.md) · [Next →](07-website-vercel.md)

> **Where you work:** 🌐 AWS console, 🖥️ server terminal. Steps 17–23.  
> **You finish with:** the EC2 server running behind Caddy with a real certificate, and the production API answering on `https://api.kidlearn.net`.  
> **Before you start:** Steps 12–16.

## Step 17 · 🌐 Permissions for the server — IAM role

**Cost:** $0 — IAM is free.

**Why:** the server must read secrets, download images and upload backups. A
**role** gives it these rights **without** storing any AWS key on it. If the
server were hacked, there is no key to steal.

**17a. Create the role**

IAM is global: the region menu says **Global** here, and that is correct.

1. Search **IAM** → **Roles** → **Create role**.
2. Trusted entity: **AWS service**. Use case: **EC2** → Next.
3. Search and tick **`AmazonSSMManagedInstanceCore`** → Next.
   (*This is what lets you open a terminal in the browser.*)
4. Role name `kidlearn-instance` → **Create role**.

(AWS also silently creates an **instance profile** with the same name. That is
the wrapper EC2 needs to attach a role to a server — you will pick it in Step
18 under "IAM instance profile".)

**17b. Add the project permissions**

5. Open `kidlearn-instance` → **Add permissions → Create inline policy** →
   **JSON** tab.
6. Delete what is in the box. Paste the JSON below. Replace **every**
   `<ACCOUNT_ID>` (your 12 digits) and **every** `<BUCKET_NAME>` (from [Step 12](05-aws-storage-secrets-images.md)).
7. Next → policy name `kidlearn-runtime` → **Create policy**.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow",
      "Action": ["ecr:GetAuthorizationToken"],
      "Resource": "*" },
    { "Effect": "Allow",
      "Action": ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:BatchCheckLayerAvailability"],
      "Resource": [
        "arn:aws:ecr:ap-south-1:<ACCOUNT_ID>:repository/kidlearn-api",
        "arn:aws:ecr:ap-south-1:<ACCOUNT_ID>:repository/kidlearn-migrate"
      ] },
    { "Effect": "Allow",
      "Action": ["ssm:GetParametersByPath", "ssm:GetParameter", "ssm:GetParameters"],
      "Resource": [
        "arn:aws:ssm:ap-south-1:<ACCOUNT_ID>:parameter/kidlearn/prod/*",
        "arn:aws:ssm:ap-south-1:<ACCOUNT_ID>:parameter/kidlearn/dev/*"
      ] },
    { "Effect": "Allow",
      "Action": ["kms:Decrypt"],
      "Resource": "*",
      "Condition": { "StringEquals": { "kms:ViaService": "ssm.ap-south-1.amazonaws.com" } } },
    { "Effect": "Allow",
      "Action": ["s3:PutObject"],
      "Resource": "arn:aws:s3:::<BUCKET_NAME>/*" },
    { "Effect": "Allow",
      "Action": ["s3:DeleteObject"],
      "Resource": "arn:aws:s3:::<BUCKET_NAME>/prod/.partial/*" },
    { "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::<BUCKET_NAME>",
        "arn:aws:s3:::<BUCKET_NAME>/*"
      ] }
  ]
}
```

In plain words, statement by statement:

| Statement | Lets the server… | Used by |
|---|---|---|
| `ecr:GetAuthorizationToken` | log in to ECR | `deploy.sh` |
| `ecr:BatchGetImage`… | **download** our two images (not upload, not others) | `deploy.sh` |
| `ssm:GetParameter*` | **read** `/kidlearn/prod/*` and `/kidlearn/dev/*` | `deploy.sh`, `backup.sh`, `weekly-reports.sh` |
| `kms:Decrypt` (via SSM only) | unlock SecureString values | same |
| `s3:PutObject` | **write** backup files | `backup.sh` |
| `s3:DeleteObject` on `.partial/` only | clean up a half-finished backup — never a finished one | `backup.sh` |
| `s3:GetObject`, `ListBucket` | read backups back (for a restore) | you, during a restore |

…and **nothing else**.

✅ **Check:** the role shows two policies: `AmazonSSMManagedInstanceCore` and
`kidlearn-runtime`. Search the JSON once more for `<` — there must be none left.

## Step 18 · 🌐 Launch the server — EC2

**Cost:** about **$13.53/month**, nearly the whole bill: the `t4g.small` server
$8.18, the Elastic IP (public IPv4 address, 18c) $3.65, and the 20 GiB disk
~$1.70. Billing starts the moment the instance is launched.

**18a. Copy the setup script first**

Open `deploy/bootstrap.sh` in your editor and **copy the whole file**.
*Why:* AWS runs this script once when the server first starts. It installs
Docker, cron (for scheduled jobs) and extra memory (swap). You do not have to do
these by hand.

**18b. Launch**

Region menu (top right): **Asia Pacific (Mumbai) ap-south-1**. A server in
another region still starts, but it cannot read the Mumbai secrets: the role in
Step 17 only allows `ssm.ap-south-1`.

Search **EC2** → **Instances** → **Launch instances**. Fill in:

| Field | Choose |
|---|---|
| Name | `kidlearn` |
| Application and OS Images | **Amazon Linux 2023** |
| Architecture (just below it) | **64-bit (Arm)** ← easy to miss |
| Instance type | **`t4g.small`** |
| Key pair | **Proceed without a key pair** |

*Why Arm?* `t4g` is an Arm computer — the cheapest good option — and your
images were built for Arm.
*Why `small` (2 GB memory)?* The API, Caddy and later the dev stack need about
1.1 GB together. `micro` (1 GB) would leave no room for a nightly backup.
*Why no key pair?* A key pair is for SSH. We do not use SSH, so there is
nothing to steal.

**Network settings** → click **Edit**:

1. **Create security group**. Name: `kidlearn-edge`.
2. If there is an **SSH / port 22** rule, **remove it** (trash icon).
3. **Add security group rule** three times. Source for all: **Anywhere
   (0.0.0.0/0)**.

| Type | Protocol | Port | Why |
|---|---|---|---|
| Custom TCP | TCP | `80` | Let's Encrypt checks you own the domain here; also redirects to HTTPS |
| HTTPS | TCP | `443` | All real traffic |
| Custom UDP | UDP | `443` | HTTP/3 (faster on phones) |

**Configure storage:** `20` GiB, **gp3**.

**Advanced details** (click to open — it is closed by default):

- **IAM instance profile:** `kidlearn-instance`
- **Credit specification:** **Standard** ← the default for `t4g` is Unlimited
- **User data:** paste the whole `bootstrap.sh` from 18a

*Why Standard?* In Unlimited mode a server that stays busy after its CPU
credits run out keeps running at full speed, and AWS bills the extra. Anyone
can cause that by aiming a script at the API. In Standard mode the CPU drops
back to its 20% baseline instead: the API slows down, but it can never cost
more than the price above. [Part 0.13](00-understand.md) explains credits.

Click **Launch instance**.

> **Behind the scenes — what `bootstrap.sh` does on first boot (about 2–3 min)**
>
> ```
>  1. dnf install docker            → systemctl enable --now docker
>  2. download Docker Compose v2 plugin (Arm build)  → "docker compose" works
>  3. dnf install cronie            → Amazon Linux 2023 ships with NO cron;
>                                     without this, backups would never run
>  4. create /swapfile (2 GB), swappiness 10
>                                   → a memory spike slows down instead of
>                                     the kernel killing the API
>  5. mkdir /opt/kidlearn/{prod,dev,edge}  (mode 0700: root only)
>     mkdir /opt/kidlearn/deploy           (empty — you fill it in Step 20)
>  6. write /etc/cron.weekly/kidlearn-docker-prune
>                                   → every week, delete all but the 4 newest
>                                     images per repository, so the 20 GB disk
>                                     never fills (a full disk = API down)
>  7. log "done — instance is ready for deploy/deploy.sh"
> ```
>
> It pulls **no** application image and needs **no** secret. Its output is in
> `/var/log/cloud-init-output.log` on the server. It runs **once**: if it ever
> needs re-running, the recovery is a fresh server from this file, not running
> it again.

**18c. Give it a fixed address — Elastic IP**

*Why:* a normal server's public address changes when it restarts. Your DNS would
then point at nothing. An Elastic IP never changes.

1. EC2 left side → **Elastic IPs** → **Allocate Elastic IP address** →
   **Allocate**.
2. Tick the new IP → **Actions → Associate Elastic IP address**.
3. Resource type **Instance** → choose `kidlearn` → **Associate**.

> Do not make extra Elastic IPs "just in case". AWS charges for each one, used or
> not.

✅ **Check:** EC2 → Instances shows `kidlearn` as **Running**. Tick it →
**Details** tab → **Credit specification** says **standard**. If it says
**unlimited**, fix it without a restart: **Actions → Instance settings →
Change credit specification** → untick **Unlimited** → **Save**. Write the
**Instance ID** (`i-0…`) and the **Elastic IP** in your sheet.

## Step 19 · 🌐 DNS record for the API — Cloudflare

**Cost:** $0.

**Why:** now people's browsers can find your server by name.

Wait until Cloudflare says **Active** ([Step 7](03-dns-cloudflare.md)). Then Cloudflare →
`kidlearn.net` → **DNS → Records → Add record**:

| Type | Name | IPv4 address | Proxy status |
|---|---|---|---|
| A | `api` | your Elastic IP | **DNS only (grey cloud)** |

Click the orange cloud until it turns **grey** before you save.

✅ **Check** from your Mac (wait a minute or two first):

```bash
dig +short api.kidlearn.net
```

It must print **exactly your Elastic IP**. If it prints something starting with
`104.` or `172.67.`, the cloud is orange — edit the record, make it grey.

## Step 20 · 🖥️ Open the server terminal and copy the deploy files

**Cost:** $0 — Session Manager is free.

**20a. Open a terminal in the browser**

Wait 3 minutes after launch (the setup script needs time). Then:
**EC2 → Instances → tick `kidlearn` → Connect (top) → Session Manager tab →
Connect.**

A black terminal opens in your browser. You are now on the server.

```
 Your browser ──HTTPS──► AWS Systems Manager ◄──outbound── SSM agent on the server
                         (checks your IAM user)             (the server dials OUT,
                                                             so no inbound port 22)
```

> **Cannot connect?** Wait 2 more minutes and retry. Still no? Check the role:
> **Actions → Security → Modify IAM role** must show `kidlearn-instance`.
> Never "fix" this by opening port 22.

(Later, if you prefer your Mac's own terminal: `aws ssm start-session --target
<instance-id>` does the same. `runbook.md` §2 also shows real `ssh`/`scp` *through*
Session Manager, still with port 22 closed.)

**20b. Check the setup script worked**

```bash
sudo su -
docker --version && docker compose version
systemctl is-active crond      # active
ls /opt/kidlearn               # deploy  dev  edge  prod
free -m                        # a "Swap" line of about 2000
```

*`sudo su -`* makes you the admin user (root). You need it for everything on the
server — **run it every time you open a new terminal**.

If something is wrong, read the setup log: `cat /var/log/cloud-init-output.log`.

**20c. Copy the `deploy/` folder onto the server**

*Why:* the setup script made an empty `/opt/kidlearn/deploy` folder. The scripts
that start the API live in the repository, so we copy them over. The repo is
public, so the server can download it straight from GitHub (`main` branch — this
is why [Step 2](01-prepare-mac-and-github.md) mattered).

```bash
dnf install -y git
git clone https://github.com/salmanbd100/kidlearn.git /tmp/kidlearn
cp -r /tmp/kidlearn/deploy/. /opt/kidlearn/deploy/
rm -rf /tmp/kidlearn
chmod +x /opt/kidlearn/deploy/*.sh
ls /opt/kidlearn/deploy
```

✅ **Check:** the last command shows `app  backup.sh  bootstrap.sh  deploy.sh
edge  weekly-reports.sh`.

> Whenever anything in `deploy/` changes in the future, repeat 20c. The server
> never updates these files on its own — not even after [Part 12](12-automatic-deploys.md). If a deploy behaves
> like an older version of the scripts, this is why.

## Step 21 · 🖥️ HTTPS for the API — Caddy, in two careful stages

**Cost:** $0 — Let's Encrypt certificates are free.

**Why two stages?** Caddy asks Let's Encrypt for a certificate the moment it
starts. Let's Encrypt allows only a few tries per week. If DNS is wrong, you can
burn all your tries and have **no HTTPS for a week**. So first we test with
Let's Encrypt's **staging** (practice) service, which has no such limit. Only
when that works do we switch to the real one.

```
 Caddy starts ──► "I want a certificate for api.kidlearn.net" ──► Let's Encrypt
                                                                     │
 Let's Encrypt ──► looks up api.kidlearn.net in DNS → your Elastic IP │
               ──► http://api.kidlearn.net/.well-known/acme-challenge/… (port 80)
                                                                     │
 Caddy answers the challenge ──► certificate issued, saved in caddy_data volume
 Every ~60 days Caddy renews it by itself. You never touch it again.

 Stage 1  ACME_CA unset          → STAGING   (untrusted cert, unlimited tries)
 Stage 2  ACME_CA=…acme-v02…     → PRODUCTION (trusted cert, 5 per week)
```

**21a. Set your email**

The Caddyfile in `deploy/` is overwritten every time you repeat 20c, so your
settings live in a separate file on the server that the copy never touches:

```bash
install -d -m 0700 /opt/kidlearn/edge
printf 'ACME_EMAIL=%s\n' 'you@example.com' > /opt/kidlearn/edge/caddy.env
chmod 600 /opt/kidlearn/edge/caddy.env
```

Put **your real email** in place of `you@example.com`. Do **not** add an
`ACME_CA` line yet — without one, Caddy uses the staging service.

**21b. Start Caddy on staging**

```bash
cd /opt/kidlearn/deploy/edge
docker compose -p kidlearn-edge -f compose.yml up -d
docker compose -p kidlearn-edge logs --tail 40 caddy
```

> **Behind the scenes — `deploy/edge/compose.yml`**
>
> - starts one container, `kidlearn-caddy`, from a Caddy image pinned to an exact
>   version *and* digest (so it can never change under you);
> - binds host ports `80`, `443` and `443/udp` — the **only** ports any container
>   on this server opens;
> - creates the Docker network `kidlearn-edge` that the API will join;
> - keeps certificates in the named volume `caddy_data`;
> - reads `ACME_EMAIL` / `ACME_CA` from `/opt/kidlearn/edge/caddy.env`;
> - `restart: unless-stopped`, so it comes back after a reboot.
>
> The Caddyfile also lists `api.dev.kidlearn.net` (for [Part 11](11-dev-environment.md)). That name has no
> DNS record yet, so the logs show certificate errors **for that name only**.
> That is expected and harmless for `api.kidlearn.net`; it stops in [Step 31](11-dev-environment.md).

> **One IP, two hostnames.** Dev does **not** need a second Elastic IP (which
> would add $3.65/month). Both `api.kidlearn.net` and `api.dev.kidlearn.net`
> point at the same address. Caddy reads which name the browser asked for (the
> TLS "SNI" and the `Host` header) and sends the request to `prod-api` or
> `dev-api` accordingly:
>
> ```
>  api.kidlearn.net     ─┐                      ┌─► prod-api:4000
>                        ├─► 13.x.x.x :443 ─ Caddy ┤
>  api.dev.kidlearn.net ─┘   (one Elastic IP)   └─► dev-api:4000
> ```

**Learn what you just started** — 🖥️ still on the server:

```bash
docker ps                                  # kidlearn-caddy, "Up"
ss -tlnp | grep -E ':80 |:443 '            # docker-proxy on 80 and 443 — Caddy's ports
docker network ls | grep kidlearn-edge     # the shared network the API will join
docker volume ls | grep caddy_data         # where certificates are kept
```

**21c. Test** — 💻 from your Mac:

```bash
curl -sI https://api.kidlearn.net/health
```

👉 **A certificate error here is GOOD.** Practice certificates are not trusted by
design. The error proves Caddy got one.

```bash
curl -skI https://api.kidlearn.net/health | head -1
```

👉 `HTTP/2 502` is also **GOOD**. It means "HTTPS works, but the API is not
running yet" — which is true; you start it in Step 23. (502 = "Bad Gateway":
Caddy is up but has nobody to pass the request to.)

❌ If you get a **timeout** instead: DNS (Step 19) or the security group (Step
18b) is wrong. **Do not continue until 21c behaves as described.**

**21d. Switch to real certificates** — 🖥️ on the server:

```bash
echo 'ACME_CA=https://acme-v02.api.letsencrypt.org/directory' >> /opt/kidlearn/edge/caddy.env
cat /opt/kidlearn/edge/caddy.env     # ACME_EMAIL and ACME_CA, one line each
cd /opt/kidlearn/deploy/edge
docker compose -p kidlearn-edge -f compose.yml up -d --force-recreate
```

Do **not** edit `Caddyfile` itself for this — the next 20c would undo it and
put production back on practice certificates without telling you.

💻 From your Mac — no `-k` this time:

```bash
curl -sI https://api.kidlearn.net/health | head -1
# HTTP/2 502   and NO certificate error
```

> ⚠️ **Never delete the Docker volume called `caddy_data`**, and never run
> `docker volume prune` on this server. It holds your certificates; losing it
> can lock you out of HTTPS for a week.

## Step 22 · 🌐 Google sign-in for production

**Cost:** $0 — Google sign-in is free.

**Why:** parents sign in with Google. Google only sends people back to addresses
you list, so production needs its own client with `kidlearn.net` in it. It is a
**new** client — keep your local one separate, so the production secret never
sits in a less protected environment. ([Part 0.3](00-understand.md) shows how this ties to the
other two hostname settings.)

1. Google Cloud Console → your project → search **Google Auth Platform** (or
   *APIs & Services → OAuth consent screen*).
2. **Audience:** user type **External**. If it says **Testing**, click
   **Publish app** → confirm. *Why:* in "Testing", only people you add by hand
   can sign in.
3. **Clients → Create client** → Application type **Web application**.
   - Name: `kidlearn production`
   - **Authorized JavaScript origins:** `https://kidlearn.net`
   - **Authorized redirect URIs:** `https://api.kidlearn.net/api/auth/callback/google`
4. **Create**. Copy the **Client ID** and **Client secret**.
5. AWS → **Systems Manager → Parameter Store**. Open
   `/kidlearn/prod/GOOGLE_CLIENT_ID` → **Edit** → paste the real value → **Save
   changes**. Do the same for `/kidlearn/prod/GOOGLE_CLIENT_SECRET`.

The API reads secrets only when `deploy.sh` runs, so this change takes effect in
the next step. (Later, every time you change a parameter, run `deploy.sh` again
with the **same** tag to pick it up.)

## Step 23 · 🖥️ Start the API

**Cost:** $0 beyond the server from Step 18.

**Why:** everything the API needs now exists: database, secrets, images, HTTPS.
`deploy.sh` reads the secrets, downloads the image, starts it, and checks it is
healthy *and* can reach the database.

On the server terminal (`sudo su -` first if it is a new window):

```bash
/opt/kidlearn/deploy/deploy.sh prod <IMAGE TAG from Step 16>
```

> **Behind the scenes — what `deploy.sh prod a1b2c3d [--migrate]` does**
>
> ```
>  0. check arguments: env must be exactly "prod" or "dev", tag must be given
>  │
>  1. SECRETS   aws ssm get-parameters-by-path /kidlearn/prod/ (decrypted)
>  │            → /opt/kidlearn/prod/app.env   (root only, 0600)
>  │            refuses if there are 0 parameters or a value spans lines
>  │            ("$" is doubled so Docker Compose does not eat it)
>  │
>  1b. COMPOSE VARIABLES → /opt/kidlearn/prod/compose.env
>  │            ENV_NAME=prod  ECR_REGISTRY=…  IMAGE_TAG=a1b2c3d
>  │            LOG_LEVEL=info  ENABLE_API_DOCS=false
>  │            (remembers the last GOOD tag for the rollback hint)
>  │
>  2. PULL      docker login to ECR → docker compose pull api
>  │
>  2b. MIGRATE  only with --migrate:
>  │            run kidlearn-migrate:a1b2c3d → prisma migrate deploy
>  │            ✖ fails → STOP. Nothing restarted; the old API keeps serving.
>  │
>  3. UP        docker compose -p kidlearn-prod up -d   (replaces prod-api)
>  │            a few seconds of 502 while the new container starts
>  │
>  4. HEALTH GATE (up to ~150 s)
>  │   container healthcheck: GET /health      ← is the process alive?
>  │      then          GET /ready             ← can it query the database?
>  │
>  ├── ✔ both pass → write last-good-tag
>  │                 "healthy and database reachable — deploy complete at a1b2c3d"
>  │
>  └── ✖ fails    → print the last 50 log lines
>                   print "ROLL BACK WITH: deploy.sh prod <last good tag>"
>                   exit 1   (the new image is LEFT running, so you can read why)
> ```
>
> Migrations only run when you add `--migrate` — a database change should be a
> decision you make, never a side effect of restarting a container.

✅ **Check:** the last line is:

```
[deploy:prod] healthy and database reachable — deploy complete at <sha>
```

Now test the database-update path once, while nothing depends on it. You will
use this exact command for every future release with database changes:

```bash
/opt/kidlearn/deploy/deploy.sh prod <IMAGE TAG from Step 16> --migrate
```

✅ Expect `No pending migrations to apply.` (you already applied them in [Step 8](04-database-and-services.md)),
then the same "deploy complete" line as above.

💻 From your Mac:

```bash
curl -s https://api.kidlearn.net/health
# {"data":{"status":"ok", ...}}

curl -s -o /dev/null -w '%{http_code}\n' https://api.kidlearn.net/docs
# 404   ← correct: API docs are switched off in production on purpose
```

🎉 **Your API is live.**

> **If deploy fails:** it prints the reason. The usual ones are a typo in a
> Parameter Store name ([Step 13](05-aws-storage-secrets-images.md)), a wrong account number in the role (Step 17),
> or a paused Supabase project. See [Troubleshooting](troubleshooting.md).

---

[← Previous](05-aws-storage-secrets-images.md) · [Guide index](README.md) · [Next →](07-website-vercel.md)
