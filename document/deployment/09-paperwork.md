# Part 9 — Finish the paperwork

[← Previous](08-backups-and-smoke-test.md) · [Guide index](README.md) · [Next →](10-release-life-cycle.md)

> **Where you work:** Notes only.  
> **You finish with:** the runbook placeholders filled and the tracker updated.  
> **Before you start:** Step 28.

- Fill the `<placeholders>` in [`runbook.md`](../runbook.md) with the values
  from your sheet: registrar = `Namecheap`, the Elastic IP (e.g. `13.200.1.2`),
  the instance ID (e.g. `i-0abc123def4567890`), the bucket name, and
  "ACME endpoint: production".
- In [`00-progress-tracker.md`](../implementation/00-progress-tracker.md), note
  that production is live and set the **38 · provisioning** row to 🟨, not ✅ —
  file 38 is not done until the dev environment in
  [Part 11](11-dev-environment.md) is up too. Tracker and runbook edits go
  through a pull request into `dev`, like any other change.
- After one full day, open **AWS Billing → Budgets**. ✅ The forecast for
  budget `kidlearn` should be around **$14/month** ([0.12](00-understand.md#012-what-it-costs)).
- Delete the AWS access key from [Step 3d](02-accounts.md)? **No** — you still need it to push
  images until [Part 12](12-automatic-deploys.md). But never share it, and make a new one if you think it
  leaked.

---

[← Previous](08-backups-and-smoke-test.md) · [Guide index](README.md) · [Next →](10-release-life-cycle.md)
