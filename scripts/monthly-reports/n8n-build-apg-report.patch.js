// ═══════════════════════════════════════════════════════════════════
// PATCH — n8n "Build APG Report" Code node
// Workflow: APG Brand Builder — Monthly Client Analytics (JrySKVsBmCgWWGND)
//
// Three find/replace edits. Anchors are quoted from the node as it stood on
// 1 September 2026 (the text that reached the published August reports).
// The live node has drifted from every saved copy in claude-workspace, so
// search for the anchor text rather than trusting line numbers.
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


// ───────────────────────── EDIT 2: honest top-episode fallback ─────────────────────────
// WHY: The Surveying Shift published nothing in August 2026, so the audio
// episode table was (correctly) not built and the card fell through to
// "Per-episode audio breakdown / Episode-level detail will populate in future
// monthly runs". That reads as a system gap. The two situations, "no release
// this month" and "table missing", need different sentences.
//
// FIND the fallback branch of the Top Episode card:
//   : '    <div class="ep-card">\n'
//   + '      <div class="ep-label">Top Episode — ' + safe(thisMonthLabel) + '</div>\n'
//   + '      <div class="ep-title">Per-episode audio breakdown</div>\n'
//   + '      <div class="ep-meta">Episode-level detail will populate in future monthly runs</div>\n'
//   + '    </div>\n')
// REPLACE WITH:
  : (Number(bzEpisodesThisMonth) === 0
    ? '    <div class="ep-card">\n'
    + '      <div class="ep-label">Top Episode — ' + safe(thisMonthLabel) + '</div>\n'
    + '      <div class="ep-title">No new episodes were published in ' + safe(thisMonthLabel) + '</div>\n'
    + '      <div class="ep-meta"><strong>' + fmt(bzDownloadsThisMonth) + ' downloads</strong> &middot; All ' + safe(thisMonthLabel.split(' ')[0]) + ' listening came from the back catalogue. A top episode is shown in months with a new release.</div>\n'
    + '    </div>\n'
    : '    <div class="ep-card">\n'
    + '      <div class="ep-label">Top Episode — ' + safe(thisMonthLabel) + '</div>\n'
    + '      <div class="ep-title">Top episode not available for this report</div>\n'
    + '      <div class="ep-meta">' + fmt(bzEpisodesThisMonth) + ' episode(s) were published but the per-episode download table was not supplied for this month.</div>\n'
    + '    </div>\n'))
// ────────────────────────────────────────────────────────────────────────────────────────


// ───────────────────────── EDIT 3: refuse impossible all-time figures ─────────────────────────
// WHY: the "All-Time Overview" Views and Watch Time (and the "YouTube Views"
// line inside the all-time Downloads / Plays card) come from the youtube-alltime
// CSV. In August 2026 that figure FELL month on month for three clients
// (Socially Awkward 376 -> 339, Surveying Shift 1,417 -> 1,173, Bobby Owsinski
// 354,494 -> 195,656) because the new export engine counts only videos of 15
// minutes or more as episodes. A lifetime total that is lower than this month's
// total views, or lower than the figure the client was told last month, is a
// data fault and must be named in the notify payload rather than shipped.
//
// FIND the DATA COMPLETENESS CHECK block, which begins:
//   var missingData = [];
//   if (!bot || !bot.youtubeAlltime) missingData.push('youtube-alltime CSV');
// APPEND these lines at the END of that block (after the last missingData.push(...)):
if (Number(ytAllTimeViews) > 0 && Number(ytViewsThisMonth) > Number(ytAllTimeViews)) {
  missingData.push('YouTube all-time views (' + fmt(ytAllTimeViews) + ') are below this month\'s total views (' + fmt(ytViewsThisMonth) + '). The lifetime export is wrong or too narrow.');
}
if (mi.prevMonthYtAllTimeViews != null && Number(mi.prevMonthYtAllTimeViews) > Number(ytAllTimeViews)) {
  missingData.push('YouTube all-time views fell from ' + fmt(mi.prevMonthYtAllTimeViews) + ' (last report) to ' + fmt(ytAllTimeViews) + '. A lifetime figure cannot fall; check the youtube-alltime export before sending.');
}
if (!bot || !bot.youtubeGeography || bot.youtubeGeography.length === 0) {
  if (missingData.indexOf('youtube-geography CSV') === -1) missingData.push('youtube-geography CSV');
}
// NOTE: prevMonthYtAllTimeViews is a new field. The engine patch in this folder
// (clip-repost-engine.patch) writes ytLifetimeEpisodeViews into the figures blob
// from September onwards; carry it forward as prevMonthYtAllTimeViews in the
// same place the other prevMonth* fields are carried, and this check becomes live.
// Until then the second `if` simply never fires.
// ────────────────────────────────────────────────────────────────────────────────────────
