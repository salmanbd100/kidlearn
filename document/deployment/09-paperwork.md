# Part 9 — Finish the paperwork

[← Previous](08-backups-and-smoke-test.md) · [Guide index](README.md) · [Next →](10-release-life-cycle.md)

> **Where you work:** Notes only.  
> **You finish with:** the runbook placeholders filled and the tracker updated.  
> **Before you start:** Step 28.

- Fill the `<placeholders>` in `document/runbook.md` (registrar = Namecheap,
  Elastic IP, instance ID, bucket name, "ACME endpoint: production").
- Note in `document/implementation/00-progress-tracker.md` that production is
  live (the 38 · provisioning row stays 🟨 — file 38 is not done until the dev
  environment in [Part 11](11-dev-environment.md) is up too). Tracker edits go through a pull request
  into `dev`, like any other change.
- After one full day, open **AWS Billing → Budgets**. The forecast should be
  around **$14/month**.
- Delete the AWS access key from [Step 3d](02-accounts.md)? **No** — you still need it to push
  images until [Part 12](12-automatic-deploys.md). But never share it, and make a new one if you think it
  leaked.

---

[← Previous](08-backups-and-smoke-test.md) · [Guide index](README.md) · [Next →](10-release-life-cycle.md)
