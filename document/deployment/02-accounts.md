# Part 2 — Create your accounts

[← Previous](01-prepare-mac-and-github.md) · [Guide index](README.md) · [Next →](03-dns-cloudflare.md)

> **Where you work:** 🌐 browser. Steps 3–5.  
> **You finish with:** a locked-down AWS account with an admin user, a budget alarm, and the other free accounts.  
> **Before you start:** Steps 1–2.

**Why all of them now:** some take time to activate (AWS can take a few
minutes, DNS can take hours). Making them first means you do not wait later.

## Step 3 · 🌐 AWS account — and keep it safe

**Cost:** $0 to open. AWS holds about $1 on your card to check it and gives it
back. You pay only for what you create in Parts 5–6 (table [0.12](00-understand.md)).

**Why:** AWS runs your API server. The first login ("root user") can do
*anything*, including deleting the whole account, so you protect it and then
make a normal everyday user.

**3a. Sign up**

1. Go to <https://aws.amazon.com> → **Create an AWS account**.
2. Use an email you check often. Give a strong password (save it).
3. Add a payment card. AWS charges a small amount (about $1) to check it, and
   gives it back.
4. If AWS asks you to pick a **Free plan** or **Paid plan**, choose **Paid
   plan**. The free plan expires after 6 months and limits some services; a
   live website should not stop because of that. You still get the
   welcome credits.
5. Support plan: **Basic (free)**.

**3b. Turn on MFA for the root user**

MFA means "a code from your phone is also needed to log in". If someone steals
your password, they still cannot get in.

1. Click your account name (top right) → **Security credentials**.
2. **Assign MFA device** → **Authenticator app** → scan the QR code with Google
   Authenticator, Authy or your password manager → type two codes.

**3c. Make an everyday admin user**

You should not use the root user every day. Make a normal user with admin
rights instead.

1. In the top search bar type **IAM** → open it.
2. Left side → **Users** → **Create user**.
3. User name: `salman-admin`. Tick **Provide user access to the AWS Management
   Console** → **I want to create an IAM user** → choose a password. Untick
   "must create a new password". **Next**.
4. **Attach policies directly** → search and tick **`AdministratorAccess`** →
   **Next** → **Create user**.
5. Copy the **Console sign-in URL** shown on the screen. Save it with the
   password in your values sheet.
6. Open the new user → **Security credentials** → **Assign MFA device** (same
   as 3b).

**3d. Make keys for the AWS CLI on your Mac**

The `aws` command on your Mac needs a key to act as `salman-admin`.

1. Still on the `salman-admin` user → **Security credentials** → **Create
   access key** → choose **Command Line Interface (CLI)** → tick the
   confirmation → **Create**.
2. You see **Access key** and **Secret access key**. **The secret is shown only
   once.** Keep the page open.
3. On your Mac:

   ```bash
   aws configure
   # AWS Access Key ID:     <paste access key>
   # AWS Secret Access Key: <paste secret key>
   # Default region name:   ap-south-1
   # Default output format: json
   ```

   **Type `ap-south-1` at the region prompt — do not just press Enter.** If a
   default such as `[us-east-1]` is shown in brackets, Enter keeps it. Every
   `aws` command without `--region` then works in N. Virginia, and in [Step 13](05-aws-storage-secrets-images.md)
   the Mumbai parameters look as if they do not exist.

   This saves the key in `~/.aws/credentials` on your Mac — outside the repo.

4. **Log out** of root. From now on, log in with the **console sign-in URL** as
   `salman-admin`.

✅ **Check:**

```bash
aws sts get-caller-identity
# shows "Arn": "arn:aws:iam::<12 digits>:user/salman-admin"

aws configure get region
# ap-south-1
```

If the region line prints anything else, fix it with
`aws configure set region ap-south-1`. Also check that
`echo $AWS_REGION $AWS_DEFAULT_REGION` prints nothing: either variable overrides
the setting. If one is set, remove it from `~/.zshrc` and open a new terminal.

Write the 12-digit number in your values sheet as **AWS account ID**.

**Who is who in AWS — you will meet three identities:**

```
 root user            the account owner. Locked away with MFA. Used almost never.
 salman-admin (user)  YOU, every day: console clicks + the aws CLI on your Mac.
 kidlearn-instance    THE SERVER (Step 17). A role, not a user: no password,
 (role)               no key — AWS hands the server short-lived credentials itself.
```

## Step 4 · 🌐 Budget alarm — before you create anything that costs money

**Cost:** $0. A budget that only sends emails is free.

**Why:** if you make a mistake (for example a bigger server than planned), AWS
keeps charging silently. The `t4g` server also runs in "unlimited CPU" mode by
default, which bills extra rather than slowing down under heavy load. This alarm
emails you before the bill grows.

1. Search **Billing and Cost Management** → left side **Budgets** → **Create
   budget**.
2. **Customize (advanced)** → **Cost budget** → Next.
3. Name `kidlearn`. Period **Monthly**. Renewal **Recurring**. Amount **20** USD.
4. **Add an alert threshold:** `80` % of **Actual** cost → your email.
5. **Add alert threshold** again: `100` % of **Forecasted** cost → your email.
6. Create.

✅ **Check:** budget `kidlearn` is in the list. If AWS sends a confirmation
email, click the link in it.

## Step 5 · 🌐 Other free accounts

**Cost:** $0. Every account below is on a free plan; table [0.12](00-understand.md) says what would
move each one onto a paid plan.

Make these now (sign in with Google or GitHub where offered — fewer passwords):

| Service | Link | Why |
|---|---|---|
| Cloudflare | <https://dash.cloudflare.com/sign-up> | DNS for your domain |
| Vercel | <https://vercel.com/signup> → **Continue with GitHub** | Runs the website. Choose the **Hobby** (free) plan |
| Supabase | <https://supabase.com/dashboard> → sign in with GitHub | The database |
| Cloudinary | <https://cloudinary.com/users/register_free> | Stores images and audio |
| healthchecks.io | <https://healthchecks.io> | Emails you if the nightly backup stops working |

You already have **Google Cloud** from local development (sign-in with Google).

---

[← Previous](01-prepare-mac-and-github.md) · [Guide index](README.md) · [Next →](03-dns-cloudflare.md)
