# Part 3 — Move your domain's DNS to Cloudflare

[← Previous](02-accounts.md) · [Guide index](README.md) · [Next →](04-database-and-services.md)

> **Where you work:** 🌐 browser. Steps 6–7.  
> **You finish with:** `kidlearn.net` answered by Cloudflare's nameservers.  
> **Before you start:** Steps 3–5.

**Why:** right now Namecheap answers "where is kidlearn.net?". We move that job
to Cloudflare because it is fast, free, and the whole project's setup assumes
it. **Do this early** — the switch can take from 10 minutes to a few hours, and
you can do other steps while you wait.

```
 BEFORE                                  AFTER
 Namecheap = registrar (you pay it)      Namecheap = registrar (you still pay it)
 Namecheap = DNS (the phone book)        Cloudflare = DNS (the phone book)
                                         Namecheap only says "ask Cloudflare"
```

You keep the domain at Namecheap. Only the phone book moves.

## Step 6 · 🌐 Add the domain to Cloudflare

**Cost:** $0 — Cloudflare's Free plan.

1. Cloudflare dashboard → **Add a domain** (or "Add a site").
2. Type `kidlearn.net`. Choose **Quick scan for DNS records** → Continue.
3. Choose the **Free** plan.
4. Cloudflare shows the records it found. **Delete all of them** (Namecheap
   adds "parking page" records you do not want). You will add the right ones
   later.
5. Continue. Cloudflare now shows **two nameservers**, for example:

   ```
   ada.ns.cloudflare.com
   bob.ns.cloudflare.com
   ```

   Keep this page open.

## Step 7 · 🌐 Point Namecheap at Cloudflare

**Cost:** $0 to change nameservers. The domain itself renews yearly at
Namecheap (roughly $10–15 for a `.net`).

1. Log in to <https://www.namecheap.com> → **Domain List** → next to
   `kidlearn.net` click **Manage**.
2. Find the **NAMESERVERS** section. Change the dropdown from *Namecheap BasicDNS*
   to **Custom DNS**.
3. Paste the two Cloudflare nameservers, one per line.
4. Click the **green tick ✓** to save. (Easy to miss — nothing is saved
   without it.)
5. On the same page, check **Advanced DNS → DNSSEC** is **off**. If it is on,
   turn it off — otherwise the switch fails.
6. Back on Cloudflare, click **Check nameservers now**.

✅ **Check:** Cloudflare emails you "**kidlearn.net is now active**", and the
domain shows **Active** on the Cloudflare dashboard. You can also ask from 💻
your Mac (`dig` asks the internet's phone book a question; `NS` means "who runs
your phone book?"):

```bash
dig NS kidlearn.net +short
# ada.ns.cloudflare.com.
# bob.ns.cloudflare.com.      ← the two names from Step 6, not *.registrar-servers.com
```

Until then, carry on with Parts 4–5; you need DNS only in [Step 19](06-server.md),
where you add the first record.

**Why grey cloud, not orange?** (Golden rule 3 — it matters from
[Step 19](06-server.md) on, when you add records.) Orange means "Cloudflare's proxy": traffic goes
*through* Cloudflare, which then shows its own address instead of yours. That
breaks two things here — Caddy cannot prove to Let's Encrypt that it owns
`api.kidlearn.net`, and Vercel cannot issue its certificate. Grey means
"phone book only", which is all we want.

---

[← Previous](02-accounts.md) · [Guide index](README.md) · [Next →](04-database-and-services.md)
