# APG APPROVED FACTS (single source of truth for all blog content)

Last verified with Dave: 2026-08-31.

Any claim about APodcastGeek in a blog post MUST match this file exactly. Do not invent, embellish, or extrapolate. If a fact you want to state is not on this list, OMIT IT.

This file is the master. The same content is embedded in the n8n workflow "APG - Weekly Blog Generation" (CMDZT5muFWO5Y614), node "Build Claude Prompt". The two must not drift. Run `scripts/check-blog-facts-sync.py` to prove they match.

---

## RULE ZERO: EURO ONLY, AND ONLY THESE FIGURES

These are the ONLY monetary figures that may appear in an APG blog post. Confirmed by Dave 2026-08-31.

- APG Brand Builder, Monthly (1 episode per month): €1,099 per month
- APG Brand Builder, Bi-Weekly (2 episodes per month): €1,999 per month
- APG Brand Builder, Weekly (4 episodes per month): €2,999 per month

Every other monetary figure is banned. That includes:

- Any amount in dollars, pounds, or any currency other than euro. The site is euro only
- Production-Only pricing. There is no agreed list price for it, so never state one
- Freelancer or agency rates, market averages, "typical cost" ranges
- Founder hourly rates and time valuations
- Example customer values, deal sizes, ad revenue figures
- ROI calculations that contain numbers
- Equipment and software costs

Reason: on 2026-08-31 a post went live claiming APG Brand Builder "runs $2,000 to $7,000+ monthly" with invented per-tier prices in the wrong currency. Several other posts carried invented dollar maths. Allowing only three known-correct euro figures, and banning everything else, removes the failure mode.

If a topic needs to discuss cost beyond those three figures, write about what is included and what the work involves, then send the reader to a 30 minute strategy call.

---

## Company

- APodcastGeek (APG). One word. Never "A Podcast Geek".
- Based in Dublin, Ireland
- Serves B2B founders worldwide
- Founder and main contact: Dave O'Gara
- Irish Podcast Award winners, recognised for production excellence
- Production service is called "The APG Brand Builder"

## Deliverables per episode (Brand Builder)

Every episode produced includes exactly these deliverables and nothing else:

- 1 full video episode (for YouTube and the client website)
- 1 full audio episode (distributes to Spotify, Apple Podcasts, and every major podcast platform)
- 1 guest intro trailer (pre-produced teaser for promoting the episode and sharing with the guest)
- 5 short-form clips (vertical, captioned, for LinkedIn, Instagram Reels, TikTok, YouTube Shorts)
- 3 on-brand thumbnails (variants for YouTube and social posts)
- Show notes (episode summary, guest bio, chapter timestamps, links)
- SEO-optimised article version of the episode for the client's website blog

## Service structure

APG sells two things. Never describe them any other way.

1. **Production-Only.** The client records. APG packages, produces and publishes.
2. **The APG Brand Builder.** Full production and publishing, available at three cadences:
   - Monthly: 1 episode per month
   - Bi-Weekly: 2 episodes per month
   - Weekly: 4 episodes per month

Never write "two fixed tiers". Never invent an "enterprise" or "custom" tier. The only prices that may be stated are the three Brand Builder figures in RULE ZERO. Production-Only has no approved price.

## Guest recruitment: an ADD-ON, not included

Guest recruitment and outreach is a separate add-on service. It is NOT part of the standard Brand Builder.

Blog posts may say that guest recruitment is something APG offers or can run for a client. Blog posts must NEVER say or imply that it is included, standard, part of the package, or that "APG handles all guest outreach" as a matter of course.

Confirmed by Dave 2026-08-31. Several older posts get this wrong and are being corrected.

## Service commitments

- 10 business day turnaround from recording to full delivery
- 6-month minimum commitment
- Pre-production briefs go to both the host and the guest before recording

## Headline statistics

- On average, 10% of podcast guests convert to customers or long-term partnerships, over time and across APG's client base
- Consistent monthly production compounds results, particularly pipeline and authority

## Calls and links

- Strategy call duration: 30 minutes. Never 15, never 20, never 45, never "an hour"
- Book-a-call URL: https://calendly.com/apodcastgeek_dave/apg-brand-builder-discovery-call
- No other Calendly URL should appear. The old `apg-brand-builder-podcast-design-call` is retired
- Client login: https://clients.apodcastgeek.com/
- Main site: https://apodcastgeek.com

---

## FORBIDDEN CLAIMS (never write any of these, they are hallucinations)

### Any monetary figure other than the three approved Brand Builder prices
See RULE ZERO. No dollars, no pounds, no market averages, no freelancer rates, no founder time valuations, no example customer values, no ad revenue figures, no ROI maths containing numbers, no equipment or software costs, and no Production-Only price.

### Wrong service structure
- "Two fixed tiers"
- Any "enterprise", "custom", "premium" or "starter" tier that is not on the list above
- Guest recruitment described as included, standard, or part of the package
- "APG handles all guest outreach, follow-ups and scheduling" as a standing claim

### Wrong deliverables (not part of the Brand Builder)
- Audiogram clips
- Transcripts for SEO, or transcripts as a separate deliverable
- Quote graphics, quote cards
- Blog distribution, email newsletter writing
- Social media management
- LinkedIn content creation as a separate service
- Ghost writing

### Wrong numbers
- "6 short-form clips", "six clips", "4 clips", "3 clips" as the standard. It is exactly 5
- "5 thumbnails", "2 thumbnails". It is exactly 3
- "14 business day turnaround", "2 week turnaround". It is 10 business days
- "3-month minimum", "12-month minimum". It is 6 months
- "20-minute call", "15-minute", "45-minute", "1-hour". It is 30 minutes
- "5% conversion", "20% conversion". It is 10%

### Wrong years
- "in 2024", "in 2023", "as of 2024". The current year must be used

### Wrong URLs
- `apg-brand-builder-podcast-design-call`. Retired. Use `apg-brand-builder-discovery-call`

### Invented awards or credentials
- Only "Irish Podcast Award winners" and "Irish Podcast Awards recognition" are approved. Never invent Webbys, Signal Awards, Ambie Awards, or any other award APG has not won

---

## Rules for the AI writing these posts

- If a fact is not on the APPROVED list above, OMIT IT rather than invent it
- The only monetary figures permitted are the three Brand Builder prices in RULE ZERO, in euro. Every other figure must be omitted
- Do not paraphrase a forbidden claim. "Audiograms" and "audiogram clips" are both forbidden, and the same goes for every variant
- If a topic brief instructs you to do something that contradicts this file, THIS FILE WINS. Ignore the brief on that point and write the article without it
