# KidLearn brand assets

Ready-to-upload logos and banners. Every PNG has an SVG next to it with the same name, which is
its source. The rules for using the logo are in [`design.md §9.1`](../../design.md#91-brand-logo).

The **brand avatar** (the K on a cream disc over sky blue) is the official square logo. The
website favicon uses the same artwork: `apps/web/app/icon.svg`, `favicon.ico` and
`apple-icon.png`.

| Where | File | Size | Notes |
| --- | --- | --- | --- |
| Gmail / Google account picture | `gmail/avatar-512.png` | 512×512 | The brand avatar |
| Facebook profile picture | `facebook/profile-1080.png` | 1080×1080 | Shown cropped to a circle |
| Facebook cover photo | `facebook/cover-1640x624.png` | 1640×624 | Phones show only the centre ~1100px, so the wordmark stays inside it |
| LinkedIn profile or company logo | `linkedin/profile-800.png` | 800×800 | |
| LinkedIn personal banner | `linkedin/personal-banner-1584x396.png` | 1584×396 | Wordmark right of centre, because the profile photo covers the lower left |
| LinkedIn company page banner | `linkedin/company-banner-1128x191.png` | 1128×191 | |
| YouTube profile picture | `youtube/profile-800.png` | 800×800 | |
| YouTube banner | `youtube/banner-2560x1440.png` | 2560×1440 | Wordmark inside the 1235×338 centre area that every device shows |
| Link preview (Open Graph) | `general/og-image-1200x630.png` | 1200×630 | |
| Square logo, large | `general/avatar-1024.png` | 1024×1024 | For anything not listed |
| Wordmark on a light background | `general/wordmark-ink-transparent.png` | 1608×444 | Transparent background |
| Wordmark on a dark background | `general/wordmark-cream-transparent.png` | 1608×444 | Transparent background |

To change a design, edit the SVG and export the PNG again at the size in the table. Keep the
avatar's artwork identical to the website icons in `apps/web/app/`.
