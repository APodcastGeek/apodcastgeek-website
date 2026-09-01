# /audit Setup — Final Configuration Steps

The page is fully styled. Three things still need to happen before launch:

1. **Loom video recorded + embedded** (Dave, ~10 min)
2. **FormFlow form built + embedded** (Dave, ~30 min using the question script below)
3. **Sample audit teaser image uploaded** (Dave, ~2 min)

Once those three are in place, the page is launch-ready.

---

## 1. LOOM SCRIPT (60-90 seconds, Dave to camera)

Record this on Loom. Keep it conversational. Wear the same setup you use for client calls so it matches the rest of your video presence.

> Hey, Dave here from APodcastGeek.
>
> If you're filling this out, you've already invested time and money into your podcast — but you're probably not seeing the kind of business results you expected. That's the gap most B2B founders are stuck in. The content's fine. The strategy underneath isn't.
>
> This 4-minute audit is how we figure out exactly where your show is leaking — listeners, attention, and most importantly, leads.
>
> We've used this same framework on shows for Harvard Business School, Patreon, RE/MAX, and a dozen other B2B brands. It surfaces the three biggest leaks costing you pipeline, and shows you exactly what to fix first.
>
> After you submit, you'll book a 30-minute call directly with me. No junior account managers. No sales pitch — if we're not the right fit, I'll tell you straight.
>
> Hit "Start the Audit" whenever you're ready.

**To embed:** Loom → Share → Embed → copy the iframe code. In `audit/index.html`, find the comment `<!-- DAVE: Replace this entire div with your Loom embed code -->` and replace the `<div class="loom-placeholder">` block with the iframe.

---

## 2. FORMFLOW BUILD — Question Script

Build a 5-step form in FormFlow with these exact questions. Each step is one screen.

### STEP 1 — About You & Your Show

| Field | Type | Required | Notes |
|---|---|---|---|
| Full name | Text | ✅ | |
| Email | Email | ✅ | |
| Company name | Text | ✅ | |
| Your role | Dropdown | ✅ | Founder / CEO, Marketing Lead, Sales Lead, Other |
| Phone number | Phone | ❌ | Optional but useful |
| Podcast name | Text | ✅ | |
| **YouTube channel URL** | URL | ✅ | Most important data point — your audit hinges on this |
| RSS feed URL | URL | ✅ | |
| How many episodes published? | Dropdown | ✅ | 0-9, 10-25, 26-50, 51-100, 100+ |

### STEP 2 — Strategy & Positioning

| Field | Type | Required |
|---|---|---|
| Who is your podcast for? | Long text | ✅ |
| What ONE result is your podcast designed to drive for your business? | Multiple choice | ✅ |
| | → Brand awareness · Lead generation · Thought leadership · Customer education · Other | |
| How clear is your positioning right now? | Scale 1-5 | ✅ |
| Do you have a documented North Star or show framework? | Yes / No / Not sure | ✅ |

### STEP 3 — Production Quality

| Field | Type | Required |
|---|---|---|
| Average episode length | Dropdown | ✅ |
| | → <20min · 20-40min · 40-60min · 60-90min · 90min+ | |
| Do you produce video as well as audio? | Multiple choice | ✅ |
| | → Yes always · Audio only · Sometimes | |
| Do you have a defined episode structure (hook, intro, body, outro)? | Yes / No / Not sure | ✅ |
| How would a brand-new listener describe your production quality? | Scale 1-5 | ✅ |

### STEP 4 — Audience & Distribution

| Field | Type | Required |
|---|---|---|
| Total downloads per episode in last 30 days | Dropdown | ✅ |
| | → <100 · 100-500 · 500-1k · 1k-5k · 5k+ · Don't know | |
| YouTube views per episode in last 30 days | Dropdown | ✅ |
| | → <100 · 100-1k · 1k-10k · 10k+ · Don't know | |
| How many short-form clips do you post per episode? | Dropdown | ✅ |
| | → 0 · 1-2 · 3-5 · 6+ | |
| Where do you currently distribute? | Checkboxes | ✅ |
| | → Spotify · Apple Podcasts · YouTube · LinkedIn · X / Twitter · Instagram · Newsletter · Other | |

### STEP 5 — Monetisation & ROI + Consent

| Field | Type | Required |
|---|---|---|
| How are you monetising? | Checkboxes | ✅ |
| | → Direct lead gen via guests · Programmatic ads · Sponsorships · Native ads · Customer education · None yet | |
| Pipeline / revenue from podcast in last 12 months? | Dropdown | ✅ |
| | → €0 · <€10k · €10k-€50k · €50k-€200k · €200k+ · Don't track it | |
| Are you tracking guest-to-customer conversion? | Yes / No / Not sure | ✅ |
| Biggest frustration with your podcast right now? | Long text | ✅ |
| **GDPR consent** — *I consent to APodcastGeek contacting me about my audit and storing my information per the Privacy Policy.* | Checkbox | ✅ |

### Spam protection (FormFlow setting)

Add a **honeypot field** if FormFlow supports it (most do, sometimes called "anti-spam field" or "hidden trap"). This is invisible to humans, fills automatically for bots, and lets you reject those submissions. **Do NOT use reCAPTCHA** — it kills conversion rates by ~10-15%.

---

## 3. POST-SUBMIT FLOW

In FormFlow's settings for this form, configure:

### A) Webhook (sends data to your existing tools)

- **Webhook URL:** point to your n8n instance
  Example: `https://n8n.apodcastgeek.com/webhook/audit-submission`
- **Payload:** Flattened (FormFlow setting)
- **What n8n should do** (build this workflow separately):
  1. Send a Slack message to your `#leads` or `#sales` channel with the full submission
  2. Send an auto-confirmation email from `info@apodcastgeek.com` to the lead (template below)
  3. Optionally create a Trello card or Notion row

### B) Auto-confirmation email template

Subject: **Got your podcast audit request — Dave will be in touch within 48 hours**

> Hey {{first_name}},
>
> Dave here. Got your audit request for **{{podcast_name}}**.
>
> I'll personally review your responses and pull together the audit over the next 48 hours. You'll get a Calendly link to book a 30-minute call where I'll walk you through it live.
>
> A few things to expect:
> - Three biggest leak points specific to your show
> - The likely revenue impact of each leak
> - The exact priority order — what to fix first
>
> No sales pitch. If APG isn't the right fit, I'll tell you straight.
>
> Talk soon,
> Dave O'Gara
> Founder, APodcastGeek

### C) Browser redirect to Calendly (after submit)

In FormFlow's "Redirect after submission" setting, paste this URL **(includes prefill of name + email)**:

```
https://calendly.com/apodcastgeek_dave/apg-brand-builder-discovery-call?name={{full_name}}&email={{email}}&a1={{podcast_name}}
```

FormFlow's templating syntax may use `{{field_name}}` or `[field_name]` — check their docs. The end result should be: lead submits → redirected to Calendly with their name and email pre-filled in the booking form. They book the call without retyping anything.

### D) Embed the form on the page

Once the form is built, FormFlow gives you an iframe embed code. In `audit/index.html`:

1. Find the comment `<!-- DAVE: Replace this entire formflow-placeholder div with your FormFlow embed iframe -->`
2. Replace the `<div class="formflow-placeholder">...</div>` block with FormFlow's iframe code
3. Set the iframe `width="100%"` and `height` to at least `680px`

---

## 4. SAMPLE AUDIT IMAGE

1. Pick one of your existing audits (anonymise the brand name and any sensitive data)
2. Export the audit's first or summary page as a PNG/JPG, ideally **1200×900 pixels**
3. Save the file as `sample-audit.jpg` in this same `/audit/` folder
4. The page will auto-detect it. If the file is missing, the placeholder shows instead.

---

## 5. LAUNCH CHECKLIST

Before deploying, verify:

- [ ] Loom video recorded and embedded (replaces placeholder)
- [ ] FormFlow form built with all 5 steps + GDPR checkbox
- [ ] FormFlow webhook pointing to n8n
- [ ] FormFlow "redirect after submission" set to Calendly with prefill params
- [ ] Sample audit image uploaded to `/audit/sample-audit.jpg`
- [ ] Auto-confirmation email template loaded into n8n workflow
- [ ] Test submission end-to-end: form → webhook fires → Slack notification arrives → confirmation email arrives → Calendly opens with prefilled name+email
- [ ] Honeypot / anti-spam enabled in FormFlow
- [ ] Mobile UX tested (form should be fully usable on iPhone)
- [ ] Add `/audit/` to sitemap.xml with priority 0.9
- [ ] Add a "Free Audit" link to the main site nav (consider replacing "Client Login" or adding alongside)

---

## 6. GA4 / Search Console — track conversion

After launch, add these custom events in GA4:
- `audit_form_started` — fires when user clicks "Start the Audit" button
- `audit_form_submitted` — fires on successful FormFlow webhook return
- `audit_call_booked` — fires when Calendly redirect lands (track via Calendly's referrer)

Submit `/audit/` URL in Google Search Console → Request Indexing once live.
