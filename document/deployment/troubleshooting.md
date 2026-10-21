# Troubleshooting

[← Previous](12-automatic-deploys.md) · [Guide index](README.md)

## When something goes wrong

Most likely first.

| What you see | What to check |
|---|---|
| Something you made in AWS has "disappeared" | The **region** menu (top right) — must be **Mumbai** |
| Cloudflare never becomes Active | Namecheap: did you click the green ✓? Is DNSSEC off? |
| `dig` shows `104.…` or `172.67.…` | The Cloudflare cloud is **orange** — make it grey |
| `curl` to the API **times out** | DNS ([Step 19](06-server.md)) points at the wrong IP, or ports 80/443 missing in the security group |
| Caddy never gets a certificate | Grey cloud? `dig` shows your Elastic IP? Port **80** open? |
| Caddy logs errors about `api.dev.kidlearn.net` | Expected until [Step 31](11-dev-environment.md) — that name has no DNS record yet |
| Session Manager will not connect | Server still starting (wait), or role `kidlearn-instance` not attached. **Never** open port 22 |
| `deploy.sh`: "no parameters found" | Parameter name typo, wrong region, or wrong account number in the role JSON |
| An `aws` command without `--region` finds nothing, but with `--region ap-south-1` it works | The CLI's default region is wrong: `aws configure get region` must print `ap-south-1`. Fix with `aws configure set region ap-south-1` ([Step 3](02-accounts.md)) |
| [Step 13](05-aws-storage-secrets-images.md) check prints nothing or fewer than 16 names | Parameters were created in another region. Copy them to Mumbai with the commands under [Step 13](05-aws-storage-secrets-images.md)'s check |
| [Step 14](05-aws-storage-secrets-images.md): a bare `bash-3.2$` prompt and nothing else | `bash` was pasted together with the block. Paste the step 2 block again at that prompt |
| [Step 14](05-aws-storage-secrets-images.md): "No projects matched the filters" | You are outside the repo. `cd ~/Documents/Me/kidlearn` and run it again |
| [Step 14](05-aws-storage-secrets-images.md): "Invalid environment configuration … `<NAME>`: Invalid url" | That parameter's value is wrong, often its own name pasted into **Value**. Print it with `aws ssm get-parameter --name /kidlearn/prod/<NAME> --with-decryption --query Parameter.Value --output text \| cat -vet` (only for non-secret ones like `BETTER_AUTH_URL` and `WEB_ORIGIN`), fix it in Parameter Store, then paste the block again |
| `deploy.sh`: "exited — it did not get as far as a healthcheck" | A secret is missing or malformed — the printed log names the variable `env.ts` rejected |
| `deploy.sh`: "up but /ready failed" | Check `DATABASE_URL` in Parameter Store; is the Supabase project **paused**? |
| `docker pull` "denied" / "no basic auth credentials" | Role policy: account ID or repository name wrong in [Step 17](06-server.md) |
| `pull access denied … not found` | The tag does not exist in ECR — typo, or [Step 16](05-aws-storage-secrets-images.md) not pushed |
| Backup fails every night | `DIRECT_URL` must be the **Session pooler** string (port 5432 on `pooler.supabase.com`), not "Direct connection" |
| Vercel build: `@kidlearn/types` has no `dist` | Build command must be `cd ../.. && pnpm turbo run build --filter=web` |
| Website loads but sign-in fails | Google client origins/redirect ([Step 22](06-server.md)); is the consent screen **published**? |
| Sign-in fails on a `…vercel.app` preview | Expected — previews are not `WEB_ORIGIN` ([Step 25](07-website-vercel.md) note) |
| You changed a Vercel variable and nothing changed | `NEXT_PUBLIC_*` are built in — **Redeploy** |
| You changed a Parameter Store value and nothing changed | Run `deploy.sh prod <current SHA>` again — secrets are read at deploy time |
| Logged out on every reload | `WEB_ORIGIN` / `BETTER_AUTH_URL` in Parameter Store, then redeploy the API |
| GitHub will not let you merge | `gates` is red or still running — open **Checks** ([Part 1.5](01-prepare-mac-and-github.md)) |
| Server disk full | `df -h /`, `docker system df`; the weekly prune keeps 4 images. **Never** `docker volume prune` |
| **Dev ([Part 11](11-dev-environment.md))** | |
| `deploy.sh dev`: "POSTGRES_PASSWORD is not set in SSM" | [Step 30](11-dev-environment.md)'s `/kidlearn/dev/POSTGRES_PASSWORD` is missing or misspelt |
| `deploy.sh dev`: "up but /ready failed" on the first deploy | You left out `--migrate` — the dev database has no tables yet |
| Dev API: "password authentication failed" | `POSTGRES_PASSWORD` and the password inside the dev `DATABASE_URL` differ — or the password has a `/`, `+` or `=` (use `openssl rand -hex`). Fix both in SSM, then wipe and redeploy ([Step 33a](11-dev-environment.md)) — Postgres only reads the password when its volume is first created |
| `dev.kidlearn.net` behaves like production, or shows "CORS" errors | The dev Vercel project was built with production's `NEXT_PUBLIC_API_URL`. Fix it, **redeploy**, re-run [Step 36b](11-dev-environment.md) |
| `dev.kidlearn.net` has no password prompt | `DEV_SITE_BASIC_AUTH` not set for this deployment's environment (Production *and* Preview) — set it and redeploy |
| Dev sign-in asks for the dev password part-way through | Someone added a password to `api.dev` — the API host must stay open ([Step 36a](11-dev-environment.md)) |
| Dev sign-in: "access blocked" / "app not verified" | The local client's consent screen is in **Testing** — add your Google account as a test user ([Step 35](11-dev-environment.md)) |
| Restore stops at `CREATE TYPE … already exists` | The database was not empty — run [Step 33b](11-dev-environment.md) from the `DROP DATABASE` line again |
| Every dev deploy fails after a rehearsal (`P3009`, failed migration) | Expected after [Step 43c](12-automatic-deploys.md) — wipe and restore dev ([Step 33](11-dev-environment.md)) |
| **Automatic deploys ([Part 12](12-automatic-deploys.md))** | |
| `deploy` job: "Could not assume role" / "Not authorized to perform sts:AssumeRoleWithWebIdentity" | Trust policy `sub` does not name the environment the job runs in (`development` / `production`), or the job lacks `permissions: id-token: write` |
| `deploy` job: "Credentials could not be loaded" | `id-token: write` is missing — no OIDC token was ever made |
| `deploy` job: `AccessDeniedException` on `ssm:SendCommand` | `EC2_INSTANCE_ID` variable or `<INSTANCE_ID>` in the role policy is wrong |
| `deploy` job is red but shows no reason | The SSM output was not printed before failing — read it in **Systems Manager → Run Command → Command history** |
| A merge into `dev` or `main` did not deploy | `gates` failed (`deploy` needs it), or the `main` path is not switched on yet ([Step 46](12-automatic-deploys.md)) |
| PRs into `dev` stuck on "promotion-guard — Expected" | The check is not being skipped-as-success; see [Step 45b](12-automatic-deploys.md) |
| A deploy behaves like an older `deploy.sh` | The server's copy is stale — repeat [Step 20c](06-server.md); nothing updates it automatically |

**Reading logs on the server:**

```bash
sudo su -
docker compose -p kidlearn-prod logs --tail 100 api     # the API
docker compose -p kidlearn-edge logs --tail 100 caddy   # HTTPS
cat /var/log/kidlearn-backup.log                        # backups
cat /var/log/kidlearn-weekly-reports.log                # weekly reports
docker ps                                               # what is running, and since when
ss -tlnp                                                # listening ports: only Caddy on 80/443
free -m && df -h /                                      # memory and disk
```

**Website logs:** Vercel → project → **Logs**. **CI logs:** GitHub → the PR →
**Checks**.

## Things that cost money or lock you out

- Skipping the budget alarm ([Step 4](02-accounts.md)).
- Unused Elastic IPs — AWS bills them even when not attached.
- Orange-cloud DNS records.
- Switching Caddy to real certificates before staging worked, or deleting the
  `caddy_data` volume.
- `prisma migrate dev` against the production database.
- Opening port 22.
- Putting any secret in Git.
- Bypassing the `gates` check as repository admin "just this once".
- A second Elastic IP for dev — it needs none ([Step 21](06-server.md) note).
- Reusing a production secret in dev ([Step 30](11-dev-environment.md)), or putting the production
  Google client into dev ([Step 35](11-dev-environment.md)).
- Pointing the dev Vercel project at `api.kidlearn.net` — dev testing would
  write to the production database ([Step 36b](11-dev-environment.md)).
- A dev container filling the shared disk — it takes production down too.
- An AWS access key stored as a GitHub secret. [Part 12](12-automatic-deploys.md) exists so there is none.
- Adding `ssm:StartSession` or `ssm:GetParameter*` to a deploy role ([Step 38](12-automatic-deploys.md)).

---

[← Previous](12-automatic-deploys.md) · [Guide index](README.md)
