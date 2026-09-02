// ═══════════════════════════════════════════════════════════════════
// PATCH — n8n "Build APG Report" Code node
// Workflow: APG Brand Builder — Monthly Client Analytics (JrySKVsBmCgWWGND)
//
// Two find/replace edits. Anchors are quoted from the node as it stood on
// 1 September 2026 (the text that reached the published August reports).
// The live node has drifted from every saved copy in claude-workspace, so
// search for the anchor text rather than trusting line numbers.
//
// A third edit that used to live here (refusing an all-time YouTube figure
// that fell) is no longer needed at this layer. That refusal now happens
// upstream, in the clip-repost-engine itself: report-figures.js refuses to
// write ytLifetimeEpisodeViews/WatchHours if either comes back below what
// was published last month, so a client-month like that never reaches this
// node's input at all. See claude-workspace, commit a30cb29 and
// ops-decision-system/youtube-episode-by-playlist-20260902.md.
// ═══════════════════════════════════════════════════════════════════


// ───────────────────────── EDIT 1: empty geography must say so ─────────────────────────
// WHY: when no youtube-geography row exists for the month (Bobby Owsinski,
// August 2026: the lifetime Geography export did not come back), the section
// rendered a heading over two empty columns. A missing table must read as
// missing, not as a layout bug.
//
// FIND, inside ytAudienceHtml, the IIFE that begins
//     var ytGeo = bot && bot.youtubeGeography;
//     var geoData = ytGeo && ytGeo.length > 0 ? ytGeo : [];
//     var html = '<div style="margin-top:32px;">';
//     html += '<div style="font-size:14px;font-weight:700;color:var(--white);margin-bottom:16px;">Top Geographies - All-Time</div>';
//     html += '<div class="split-grid"><div>';
// INSERT these lines directly after the `Top Geographies - All-Time</div>';` line,
// BEFORE `html += '<div class="split-grid"><div>';`
    if (geoData.length === 0) {
      html += '<p style="font-size:14px;color:var(--muted);line-height:1.7;">Country data for this channel was not available when this report was generated. It will be added when the report is refreshed.</p></div>';
      return html;
    }
// ────────────────────────────────────────────────────────────────────────────────────────


// ───────────────────────── EDIT 2: all-time top episode as the fallback ─────────────────────────
// WHY: The Surveying Shift published nothing in August 2026, so the audio
// episode table was (correctly) not built and the card fell through to
// "Per-episode audio breakdown / Episode-level detail will populate in future
// monthly runs". Dave's call: a quiet month should show the most-downloaded
// episode of all time instead of an empty card. buzzsprout.js's figuresFor()
// now writes that as topEpisodeAllTimeTitle / topEpisodeAllTimePlays into the
// figures blob (claude-workspace, clip-repost-engine, commit e87034c), which
// this node reads as mi.topEpisodeAllTimeTitle / mi.topEpisodeAllTimePlays,
// the same way it already reads every other manual-inputs field.
//
// FIND the fallback branch of the Top Episode card:
//   : '    <div class="ep-card">\n'
//   + '      <div class="ep-label">Top Episode — ' + safe(thisMonthLabel) + '</div>\n'
//   + '      <div class="ep-title">Per-episode audio breakdown</div>\n'
//   + '      <div class="ep-meta">Episode-level detail will populate in future monthly runs</div>\n'
//   + '    </div>\n')
// REPLACE WITH:
  : (mi.topEpisodeAllTimeTitle
    ? '    <div class="ep-card">\n'
    + '      <div class="ep-label">Top Performing Episode (All-Time)</div>\n'
    + '      <div class="ep-title">' + safe(mi.topEpisodeAllTimeTitle) + '</div>\n'
    + '      <div class="ep-meta"><strong>' + fmt(mi.topEpisodeAllTimePlays) + ' downloads</strong> &middot; No new episode was published in ' + safe(thisMonthLabel) + ', so this is the most-downloaded episode of all time.</div>\n'
    + '    </div>\n'
    : '    <div class="ep-card">\n'
    + '      <div class="ep-label">Top Episode — ' + safe(thisMonthLabel) + '</div>\n'
    + '      <div class="ep-title">No new episodes were published in ' + safe(thisMonthLabel) + '</div>\n'
    + '      <div class="ep-meta">' + fmt(bzDownloadsThisMonth) + ' downloads this month came from the back catalogue.</div>\n'
    + '    </div>\n'))
// NOTE: the second, inner fallback (no all-time figure either) covers a client
// whose manual-inputs predates this field, or whose Buzzsprout episode list
// came back empty. It should stop firing once every active client has had one
// report built under the new clip-repost-engine code.
// ────────────────────────────────────────────────────────────────────────────────────────

