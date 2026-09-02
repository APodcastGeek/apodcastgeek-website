// ═══════════════════════════════════════════════════════════════════
// PATCH — n8n "Aggregate Analytics" Code node
// Workflow: APG Brand Builder — Monthly Client Analytics (JrySKVsBmCgWWGND)
//
// WHY: the youtube-geography CSV carries ISO 3166-1 alpha-2 country codes
// (AT, CH, AE, PT, IL, PL, ...). The node maps codes to names with a
// twenty-entry table, so any country outside that table reaches the client
// as a bare code. August 2026: "AT" and "CH" on The Socially Awkward Podcast,
// "AE", "PT", "IL", "PL" on High Stakes. This replaces the table with the
// full ISO list plus an Intl.DisplayNames fallback for anything new.
//
// HOW TO APPLY:
//   1. Open the Aggregate Analytics code node.
//   2. Find the line that begins:   const countryNames = { US:'United States', CA:'Canada', ...
//      (it sits inside the "Parse youtube-geography CSV" block).
//   3. Replace that single line with everything between BEGIN and END below.
//   4. The line after it, `name: countryNames[...] || ...`, must become:
//        name: countryName(r[geoKey]),
//      (see the second block below).
//   5. Save, then re-run one client with `?client=` to confirm the names render.
// ═══════════════════════════════════════════════════════════════════

// ───────────────────────── BEGIN: replaces `const countryNames = {...};` ─────────────────────────
  const countryNames = {
    AF:'Afghanistan', AX:'Åland Islands', AL:'Albania', DZ:'Algeria', AS:'American Samoa', AD:'Andorra', AO:'Angola',
    AI:'Anguilla', AQ:'Antarctica', AG:'Antigua and Barbuda', AR:'Argentina', AM:'Armenia', AW:'Aruba', AU:'Australia',
    AT:'Austria', AZ:'Azerbaijan', BS:'Bahamas', BH:'Bahrain', BD:'Bangladesh', BB:'Barbados', BY:'Belarus', BE:'Belgium',
    BZ:'Belize', BJ:'Benin', BM:'Bermuda', BT:'Bhutan', BO:'Bolivia', BQ:'Caribbean Netherlands', BA:'Bosnia and Herzegovina',
    BW:'Botswana', BV:'Bouvet Island', BR:'Brazil', IO:'British Indian Ocean Territory', BN:'Brunei', BG:'Bulgaria',
    BF:'Burkina Faso', BI:'Burundi', KH:'Cambodia', CM:'Cameroon', CA:'Canada', CV:'Cape Verde', KY:'Cayman Islands',
    CF:'Central African Republic', TD:'Chad', CL:'Chile', CN:'China', CX:'Christmas Island', CC:'Cocos (Keeling) Islands',
    CO:'Colombia', KM:'Comoros', CG:'Congo - Brazzaville', CD:'Congo - Kinshasa', CK:'Cook Islands', CR:'Costa Rica',
    CI:'Côte d’Ivoire', HR:'Croatia', CU:'Cuba', CW:'Curaçao', CY:'Cyprus', CZ:'Czechia', DK:'Denmark', DJ:'Djibouti',
    DM:'Dominica', DO:'Dominican Republic', EC:'Ecuador', EG:'Egypt', SV:'El Salvador', GQ:'Equatorial Guinea', ER:'Eritrea',
    EE:'Estonia', SZ:'Eswatini', ET:'Ethiopia', FK:'Falkland Islands', FO:'Faroe Islands', FJ:'Fiji', FI:'Finland',
    FR:'France', GF:'French Guiana', PF:'French Polynesia', TF:'French Southern Territories', GA:'Gabon', GM:'Gambia',
    GE:'Georgia', DE:'Germany', GH:'Ghana', GI:'Gibraltar', GR:'Greece', GL:'Greenland', GD:'Grenada', GP:'Guadeloupe',
    GU:'Guam', GT:'Guatemala', GG:'Guernsey', GN:'Guinea', GW:'Guinea-Bissau', GY:'Guyana', HT:'Haiti',
    HM:'Heard and McDonald Islands', VA:'Vatican City', HN:'Honduras', HK:'Hong Kong', HU:'Hungary', IS:'Iceland',
    IN:'India', ID:'Indonesia', IR:'Iran', IQ:'Iraq', IE:'Ireland', IM:'Isle of Man', IL:'Israel', IT:'Italy',
    JM:'Jamaica', JP:'Japan', JE:'Jersey', JO:'Jordan', KZ:'Kazakhstan', KE:'Kenya', KI:'Kiribati', KP:'North Korea',
    KR:'South Korea', KW:'Kuwait', KG:'Kyrgyzstan', LA:'Laos', LV:'Latvia', LB:'Lebanon', LS:'Lesotho', LR:'Liberia',
    LY:'Libya', LI:'Liechtenstein', LT:'Lithuania', LU:'Luxembourg', MO:'Macao', MG:'Madagascar', MW:'Malawi',
    MY:'Malaysia', MV:'Maldives', ML:'Mali', MT:'Malta', MH:'Marshall Islands', MQ:'Martinique', MR:'Mauritania',
    MU:'Mauritius', YT:'Mayotte', MX:'Mexico', FM:'Micronesia', MD:'Moldova', MC:'Monaco', MN:'Mongolia', ME:'Montenegro',
    MS:'Montserrat', MA:'Morocco', MZ:'Mozambique', MM:'Myanmar', NA:'Namibia', NR:'Nauru', NP:'Nepal', NL:'Netherlands',
    NC:'New Caledonia', NZ:'New Zealand', NI:'Nicaragua', NE:'Niger', NG:'Nigeria', NU:'Niue', NF:'Norfolk Island',
    MK:'North Macedonia', MP:'Northern Mariana Islands', NO:'Norway', OM:'Oman', PK:'Pakistan', PW:'Palau',
    PS:'Palestine', PA:'Panama', PG:'Papua New Guinea', PY:'Paraguay', PE:'Peru', PH:'Philippines', PN:'Pitcairn Islands',
    PL:'Poland', PT:'Portugal', PR:'Puerto Rico', QA:'Qatar', RE:'Réunion', RO:'Romania', RU:'Russia', RW:'Rwanda',
    BL:'St. Barthélemy', SH:'St. Helena', KN:'St. Kitts and Nevis', LC:'St. Lucia', MF:'St. Martin',
    PM:'St. Pierre and Miquelon', VC:'St. Vincent and Grenadines', WS:'Samoa', SM:'San Marino', ST:'São Tomé and Príncipe',
    SA:'Saudi Arabia', SN:'Senegal', RS:'Serbia', SC:'Seychelles', SL:'Sierra Leone', SG:'Singapore', SX:'Sint Maarten',
    SK:'Slovakia', SI:'Slovenia', SB:'Solomon Islands', SO:'Somalia', ZA:'South Africa', GS:'South Georgia',
    SS:'South Sudan', ES:'Spain', LK:'Sri Lanka', SD:'Sudan', SR:'Suriname', SJ:'Svalbard and Jan Mayen', SE:'Sweden',
    CH:'Switzerland', SY:'Syria', TW:'Taiwan', TJ:'Tajikistan', TZ:'Tanzania', TH:'Thailand', TL:'Timor-Leste', TG:'Togo',
    TK:'Tokelau', TO:'Tonga', TT:'Trinidad and Tobago', TN:'Tunisia', TR:'Türkiye', TM:'Turkmenistan',
    TC:'Turks and Caicos Islands', TV:'Tuvalu', UG:'Uganda', UA:'Ukraine', AE:'United Arab Emirates', GB:'United Kingdom',
    US:'United States', UM:'U.S. Outlying Islands', UY:'Uruguay', UZ:'Uzbekistan', VU:'Vanuatu', VE:'Venezuela',
    VN:'Vietnam', VG:'British Virgin Islands', VI:'U.S. Virgin Islands', WF:'Wallis and Futuna', EH:'Western Sahara',
    YE:'Yemen', ZM:'Zambia', ZW:'Zimbabwe', XK:'Kosovo'
  };
  // A code the table does not know still gets a real name from ICU where the
  // runtime has it, and the bare code only as the very last resort. A value
  // that is already a name (older hand-pasted CSVs) passes through untouched.
  const countryName = (raw) => {
    const s = String(raw == null ? '' : raw).trim();
    if (!/^[A-Za-z]{2}$/.test(s)) return s;
    const code = s.toUpperCase();
    if (countryNames[code]) return countryNames[code];
    try { const n = new Intl.DisplayNames(['en'], { type: 'region' }).of(code); if (n && n !== code && !/unknown/i.test(n)) return n; } catch (e) {}
    return code;
  };
// ───────────────────────── END ─────────────────────────

// ───────────────────────── SECOND CHANGE: inside the same block ─────────────────────────
// FIND (a few lines below the table):
//     name: countryNames[r[geoKey]] || r[geoKey],
// (older copies of the node read:  name: countryNames[r.Geography] || r.Geography, )
// REPLACE WITH:
//     name: countryName(r[geoKey]),
// ────────────────────────────────────────────────────────────────────────────────────────

// ───────────────────────── THIRD CHANGE: Buzzsprout city labels ─────────────────────────
// WHY: the top-up bot now writes the Buzzsprout locations CSV with the city cell
// already reading "Ashburn, Virginia" and an empty State column. The node then
// appends ", " + State, so every August 2026 report printed "Ashburn, Virginia, "
// with a dangling comma. Build the label from the parts that are present.
//
// FIND (inside "Parse buzzsprout-geography CSV", the `const cities = ...` map):
//     name: getField(r, 'City', 'city') + ', ' + (getField(r, 'State', 'state', 'State/Province', 'Province') || getField(r, 'Country', 'country', 'Location') || ''),
// REPLACE WITH:
//     name: [getField(r, 'City', 'city'), getField(r, 'State', 'state', 'State/Province', 'Province') || getField(r, 'Country', 'country', 'Location')]
//       .map(v => String(v || '').trim().replace(/[,\s]+$/, '')).filter(Boolean).join(', '),
// ────────────────────────────────────────────────────────────────────────────────────────
