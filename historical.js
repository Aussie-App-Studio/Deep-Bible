// Bible.com Enhancer — "Historical" theme artwork.
// Procedurally generated SVG scenes (faded, painterly, aged) and parchment textures.
// Everything is self-contained: no image assets, no network requests.
(function () {
  "use strict";

  function rng(seed) {
    let s = seed >>> 0;
    return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  }
  function pick(r, arr) { return arr[Math.floor(r() * arr.length)]; }
  function hex01(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255].map(v => v.toFixed(3));
  }

  const W = 1600, H = 900;
  function wrap(defs, body) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">` +
      `<defs>${defs}` +
      `<filter id="b2" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="2"/></filter>` +
      `<filter id="b6" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="6"/></filter>` +
      `<filter id="b18" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="18"/></filter>` +
      `<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="4"/>` +
      `<feColorMatrix values="0 0 0 0 .32  0 0 0 0 .22  0 0 0 0 .1  0 0 0 .6 0"/></filter>` +
      `<radialGradient id="vig" cx="50%" cy="50%" r="75%"><stop offset="55%" stop-color="#2a1a0a" stop-opacity="0"/><stop offset="100%" stop-color="#2a1a0a" stop-opacity=".55"/></radialGradient>` +
      `</defs>${body}` +
      `<rect width="${W}" height="${H}" fill="#b98f50" opacity=".10"/>` + // aged-varnish cast
      `<rect width="${W}" height="${H}" filter="url(#grain)" opacity=".30"/>` +
      `<rect width="${W}" height="${H}" fill="url(#vig)"/></svg>`;
  }

  /* ------------------------------------------------------------------ */
  /* Scene 1: Olive grove at golden hour                                */
  /* ------------------------------------------------------------------ */
  function oliveTree(r, x, y, s, tint) {
    const greens = tint ? ["#8d9a74", "#a3ad88", "#7d8b66"] : ["#7f8f60", "#9aa97a", "#6a7a4e", "#b3bd94"];
    let t = `<g transform="translate(${x} ${y}) scale(${s})">`;
    // ground shadow
    t += `<ellipse cx="0" cy="4" rx="150" ry="14" fill="#3a2e14" opacity=".28"/>`;
    // gnarled, split trunk
    t += `<path d="M-14 4 C-34 -34 -8 -66 -30 -118 C-18 -98 2 -92 8 -62 C18 -92 42 -104 34 -146 C50 -102 32 -62 22 -32 C26 -16 18 -6 14 4Z" fill="#46382a"/>`;
    t += `<path d="M-4 -40 C-30 -70 -52 -78 -66 -108 C-48 -90 -26 -84 -8 -58Z" fill="#3b2f23"/>`;
    // silvery canopy clusters
    for (let i = 0; i < 18; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 130;
      const cx = Math.cos(a) * d * 1.25, cy = -175 + Math.sin(a) * d * .5;
      t += `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${(38 + r() * 46).toFixed(1)}" ry="${(15 + r() * 20).toFixed(1)}" fill="${pick(r, greens)}" opacity="${(.72 + r() * .2).toFixed(2)}" transform="rotate(${(r() * 30 - 15).toFixed(0)} ${cx.toFixed(0)} ${cy.toFixed(0)})"/>`;
    }
    // light-catching leaves
    for (let i = 0; i < 10; i++) {
      const cx = (r() - .5) * 220, cy = -200 + r() * 60;
      t += `<ellipse cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" rx="${(14 + r() * 20).toFixed(0)}" ry="5" fill="#d9dcb4" opacity=".35"/>`;
    }
    return t + `</g>`;
  }

  function sceneOlive() {
    const r = rng(11);
    const defs =
      `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfd3c0"/><stop offset=".45" stop-color="#ecdfb9"/><stop offset=".62" stop-color="#f3dca8"/></linearGradient>` +
      `<radialGradient id="sun" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff4cf" stop-opacity=".95"/><stop offset=".4" stop-color="#f8dd9a" stop-opacity=".45"/><stop offset="1" stop-color="#f8dd9a" stop-opacity="0"/></radialGradient>` +
      `<linearGradient id="gnd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a99a62"/><stop offset="1" stop-color="#6e6137"/></linearGradient>` +
      `<linearGradient id="haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3e3b8" stop-opacity="0"/><stop offset="1" stop-color="#f3e3b8" stop-opacity=".6"/></linearGradient>`;
    let b = `<rect width="${W}" height="${H}" fill="url(#sky)"/>`;
    b += `<circle cx="1130" cy="360" r="330" fill="url(#sun)"/>`;
    // thin clouds
    for (let i = 0; i < 6; i++) b += `<ellipse cx="${(r() * W).toFixed(0)}" cy="${(80 + r() * 200).toFixed(0)}" rx="${(160 + r() * 200).toFixed(0)}" ry="${(8 + r() * 12).toFixed(0)}" fill="#fff6dc" opacity=".35" filter="url(#b6)"/>`;
    // layered Judean hills
    b += `<path d="M0 520 C180 440 360 500 560 462 S960 410 1180 470 S1500 450 1600 430 V900 H0Z" fill="#b9b48c" opacity=".75" filter="url(#b6)"/>`;
    b += `<path d="M0 575 C220 520 420 585 660 540 S1040 500 1260 548 S1520 540 1600 520 V900 H0Z" fill="#a4a276" opacity=".85" filter="url(#b2)"/>`;
    b += `<rect y="470" width="${W}" height="140" fill="url(#haze)"/>`;
    // distant terraced orchard rows
    for (let i = 0; i < 16; i++) b += oliveTree(r, 80 + i * 105 + r() * 40, 600 + r() * 18, .26 + r() * .06, true);
    b += `<path d="M0 640 C300 612 600 650 900 630 S1400 618 1600 640 V900 H0Z" fill="url(#gnd)"/>`;
    b += `<rect y="600" width="${W}" height="110" fill="url(#haze)" opacity=".55"/>`;
    // mid trees
    [120, 380, 1260, 1500].forEach((x, i) => { b += oliveTree(r, x + r() * 40, 700 + i % 2 * 24, .62 + r() * .12, false); });
    // dry grass + stones
    for (let i = 0; i < 160; i++) {
      const x = r() * W, y = 700 + r() * 200;
      b += `<path d="M${x.toFixed(0)} ${y.toFixed(0)} q2 -${(8 + r() * 14).toFixed(0)} ${(r() * 8 - 4).toFixed(0)} -${(14 + r() * 14).toFixed(0)}" stroke="#8d7f44" stroke-width="1.4" fill="none" opacity=".5"/>`;
    }
    for (let i = 0; i < 22; i++) b += `<ellipse cx="${(r() * W).toFixed(0)}" cy="${(760 + r() * 130).toFixed(0)}" rx="${(8 + r() * 22).toFixed(0)}" ry="${(4 + r() * 8).toFixed(0)}" fill="#b8ab88" opacity=".6"/>`;
    // big foreground trees framing the page
    b += oliveTree(r, 150, 910, 1.55, false);
    b += oliveTree(r, 1470, 920, 1.7, false);
    return wrap(defs, b);
  }

  /* ------------------------------------------------------------------ */
  /* Scene 2: Ancient library                                           */
  /* ------------------------------------------------------------------ */
  function sceneLibrary() {
    const r = rng(23);
    const defs =
      `<linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1b11"/><stop offset="1" stop-color="#46301d"/></linearGradient>` +
      `<linearGradient id="ray" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe9b0" stop-opacity=".55"/><stop offset="1" stop-color="#ffe9b0" stop-opacity="0"/></linearGradient>` +
      `<radialGradient id="lamp" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffd890" stop-opacity=".9"/><stop offset=".35" stop-color="#f0a94a" stop-opacity=".35"/><stop offset="1" stop-color="#f0a94a" stop-opacity="0"/></radialGradient>` +
      `<linearGradient id="pil" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1b110a"/><stop offset=".5" stop-color="#4a3322"/><stop offset="1" stop-color="#1b110a"/></linearGradient>`;
    let b = `<rect width="${W}" height="${H}" fill="url(#wall)"/>`;
    const palette = ["#5a3a24", "#7a4a2c", "#3e2a1e", "#6b2f26", "#2f3b2d", "#8a6a3a", "#4b3a52", "#a88a55", "#35291f", "#74533a"];
    const rowH = 150;
    for (let row = 0; row < 6; row++) {
      const base = 70 + (row + 1) * rowH - 10;
      let x = 0;
      while (x < W) {
        const w = 11 + r() * 17, h = 78 + r() * 58;
        const lean = r() < .04;
        const col = pick(r, palette);
        b += `<g${lean ? ` transform="rotate(${(8 + r() * 8).toFixed(0)} ${x.toFixed(0)} ${base})"` : ""}>` +
          `<rect x="${x.toFixed(1)}" y="${(base - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${col}"/>` +
          `<rect x="${x.toFixed(1)}" y="${(base - h).toFixed(1)}" width="2" height="${h.toFixed(1)}" fill="#fff" opacity=".07"/>` +
          `<rect x="${(x + 1).toFixed(1)}" y="${(base - h + 10).toFixed(1)}" width="${(w - 2).toFixed(1)}" height="3" fill="#d6b26a" opacity="${(.3 + r() * .4).toFixed(2)}"/>` +
          `<rect x="${(x + 1).toFixed(1)}" y="${(base - 22).toFixed(1)}" width="${(w - 2).toFixed(1)}" height="2" fill="#d6b26a" opacity=".35"/></g>`;
        x += w + (r() < .08 ? 8 + r() * 30 : 1);
      }
      // scrolls tucked in a few shelves
      if (row % 2) for (let i = 0; i < 5; i++) b += `<ellipse cx="${(r() * W).toFixed(0)}" cy="${base - 12}" rx="30" ry="9" fill="#cfb687" opacity=".85"/>`;
      b += `<rect x="0" y="${base}" width="${W}" height="16" fill="#1c120a"/><rect x="0" y="${base}" width="${W}" height="2" fill="#7a5a3a" opacity=".6"/>`;
    }
    // arched pilasters
    [[300, 56], [1300, 56]].forEach(([x, w]) => {
      b += `<rect x="${x - w / 2}" y="0" width="${w}" height="${H}" fill="url(#pil)" opacity=".92"/>`;
    });
    // light shaft from a high window
    b += `<polygon points="1180,-20 1500,-20 760,${H} 380,${H}" fill="url(#ray)" opacity=".5" filter="url(#b18)"/>`;
    b += `<polygon points="1320,-20 1420,-20 1000,${H} 860,${H}" fill="url(#ray)" opacity=".4" filter="url(#b6)"/>`;
    // hanging lanterns
    [[170, 190], [1430, 230]].forEach(([x, y]) => {
      b += `<circle cx="${x}" cy="${y}" r="190" fill="url(#lamp)"/>` +
        `<line x1="${x}" y1="0" x2="${x}" y2="${y - 24}" stroke="#15100a" stroke-width="3"/>` +
        `<path d="M${x - 14} ${y - 24} h28 l-6 40 h-16z" fill="#c8913e" opacity=".9"/><circle cx="${x}" cy="${y - 2}" r="9" fill="#fff0c4"/>`;
    });
    // drifting dust motes
    for (let i = 0; i < 90; i++) b += `<circle cx="${(r() * W).toFixed(0)}" cy="${(r() * H).toFixed(0)}" r="${(1 + r() * 2).toFixed(1)}" fill="#ffe7b0" opacity="${(.15 + r() * .35).toFixed(2)}"/>`;
    return wrap(defs, b);
  }

  /* ------------------------------------------------------------------ */
  /* Scene 3: Classical ruins at dusk                                   */
  /* ------------------------------------------------------------------ */
  function column(r, x, base, h, w, broken) {
    const top = base - h;
    let c = `<g>`;
    c += `<rect x="${x - w * .75}" y="${base - 18}" width="${w * 1.5}" height="18" fill="#bcae92"/>`; // plinth
    c += `<rect x="${x - w / 2}" y="${top}" width="${w}" height="${h - 18}" fill="url(#stone)"/>`;
    for (let i = 1; i < 6; i++) c += `<line x1="${x - w / 2 + i * w / 6}" y1="${top}" x2="${x - w / 2 + i * w / 6}" y2="${base - 18}" stroke="#8c7f66" stroke-width="1.4" opacity=".55"/>`;
    if (broken) {
      let d = `M${x - w / 2} ${top}`;
      for (let i = 1; i <= 6; i++) d += ` L${(x - w / 2 + i * w / 6).toFixed(0)} ${(top - 6 + r() * 20).toFixed(0)}`;
      c += `<path d="${d} L${x + w / 2} ${top + 12} L${x - w / 2} ${top + 12}Z" fill="#cfc2a6"/>`;
    } else {
      c += `<rect x="${x - w * .72}" y="${top - 16}" width="${w * 1.44}" height="16" fill="#d3c6aa"/><rect x="${x - w * .85}" y="${top - 28}" width="${w * 1.7}" height="12" fill="#c6b99c"/>`;
    }
    return c + `</g>`;
  }

  function sceneRuins() {
    const r = rng(37);
    const defs =
      `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fb0c4"/><stop offset=".5" stop-color="#e3d2bb"/><stop offset=".72" stop-color="#f0c79c"/></linearGradient>` +
      `<linearGradient id="stone" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e0d4b8"/><stop offset=".6" stop-color="#cbbd9f"/><stop offset="1" stop-color="#9d8f74"/></linearGradient>` +
      `<radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff0c8" stop-opacity=".9"/><stop offset="1" stop-color="#fff0c8" stop-opacity="0"/></radialGradient>` +
      `<linearGradient id="gnd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a39466"/><stop offset="1" stop-color="#5f5433"/></linearGradient>` +
      `<linearGradient id="haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0d4aa" stop-opacity="0"/><stop offset="1" stop-color="#f0d4aa" stop-opacity=".7"/></linearGradient>`;
    let b = `<rect width="${W}" height="${H}" fill="url(#sky)"/>`;
    b += `<circle cx="1000" cy="520" r="360" fill="url(#glow)"/>`;
    for (let i = 0; i < 7; i++) b += `<ellipse cx="${(r() * W).toFixed(0)}" cy="${(70 + r() * 230).toFixed(0)}" rx="${(180 + r() * 220).toFixed(0)}" ry="${(10 + r() * 14).toFixed(0)}" fill="#f7e2c4" opacity=".4" filter="url(#b6)"/>`;
    b += `<path d="M0 560 C240 500 480 560 760 520 S1200 480 1600 540 V900 H0Z" fill="#9aa08a" opacity=".6" filter="url(#b6)"/>`;
    // cypress trees
    [[70, 560], [210, 575], [1330, 560], [1450, 580], [1540, 565]].forEach(([x, y], i) => {
      const hh = 190 + r() * 70;
      b += `<path d="M${x} ${y} C${x - 24} ${y - hh * .45} ${x - 6} ${y - hh * .85} ${x} ${y - hh} C${x + 6} ${y - hh * .85} ${x + 24} ${y - hh * .45} ${x} ${y}Z" fill="#4d5a3d" opacity="${i % 2 ? .8 : .95}"/>`;
    });
    b += `<rect y="470" width="${W}" height="160" fill="url(#haze)"/>`;
    b += `<path d="M0 650 C320 620 700 660 1000 640 S1450 630 1600 650 V900 H0Z" fill="url(#gnd)"/>`;
    // left colonnade (varied heights, some broken)
    [[110, 340, 56, 0], [290, 250, 54, 1], [470, 120, 50, 1]].forEach(([x, h, w, br]) => { b += column(r, x, 720, h, w, br); });
    b += `<rect x="60" y="${720 - 340 - 66}" width="260" height="38" fill="#c3b698"/><rect x="60" y="${720 - 340 - 78}" width="260" height="12" fill="#d3c6aa"/>`;
    // right: ruined arch
    b += `<path d="M1180 760 V470 C1180 330 1420 330 1420 470 V760" stroke="#cbbd9f" stroke-width="46" fill="none"/>`;
    b += `<path d="M1180 760 V470 C1180 330 1420 330 1420 470 V760" stroke="#9d8f74" stroke-width="12" fill="none" opacity=".4" transform="translate(16 0)"/>`;
    b += column(r, 1520, 740, 300, 54, 0);
    b += column(r, 1090, 735, 90, 52, 1);
    // fallen drums + rubble
    [[620, 770], [700, 790], [900, 780]].forEach(([x, y]) => {
      b += `<ellipse cx="${x}" cy="${y}" rx="60" ry="20" fill="#bfb194"/><rect x="${x - 60}" y="${y - 2}" width="120" height="30" fill="#b3a589"/><ellipse cx="${x}" cy="${y + 28}" rx="60" ry="18" fill="#a09275"/>`;
    });
    for (let i = 0; i < 60; i++) b += `<ellipse cx="${(r() * W).toFixed(0)}" cy="${(750 + r() * 150).toFixed(0)}" rx="${(6 + r() * 20).toFixed(0)}" ry="${(3 + r() * 8).toFixed(0)}" fill="#b6a88a" opacity=".7"/>`;
    for (let i = 0; i < 140; i++) {
      const x = r() * W, y = 720 + r() * 180;
      b += `<path d="M${x.toFixed(0)} ${y.toFixed(0)} q2 -${(8 + r() * 12).toFixed(0)} ${(r() * 8 - 4).toFixed(0)} -${(12 + r() * 14).toFixed(0)}" stroke="#7d7440" stroke-width="1.4" fill="none" opacity=".55"/>`;
    }
    // drifting warm light shafts
    b += `<polygon points="900,0 1060,0 700,${H} 520,${H}" fill="#fff0c8" opacity=".10" filter="url(#b18)"/>`;
    return wrap(defs, b);
  }

  /* ------------------------------------------------------------------ */
  /* Scene 4: Starlit hills (evening reading)                           */
  /* ------------------------------------------------------------------ */
  function sceneNight() {
    const r = rng(51);
    const defs =
      `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1226"/><stop offset=".55" stop-color="#1c2748"/><stop offset=".8" stop-color="#46466a"/><stop offset="1" stop-color="#7d6a73"/></linearGradient>` +
      `<radialGradient id="moon" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff8dc" stop-opacity=".9"/><stop offset=".25" stop-color="#cfd8ee" stop-opacity=".25"/><stop offset="1" stop-color="#cfd8ee" stop-opacity="0"/></radialGradient>` +
      `<linearGradient id="gnd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#232a3a"/><stop offset="1" stop-color="#0f121b"/></linearGradient>` +
      `<radialGradient id="win" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffd37a" stop-opacity=".9"/><stop offset="1" stop-color="#ffd37a" stop-opacity="0"/></radialGradient>`;
    let b = `<rect width="${W}" height="${H}" fill="url(#sky)"/>`;
    for (let i = 0; i < 260; i++) {
      const y = r() * 520;
      b += `<circle cx="${(r() * W).toFixed(0)}" cy="${y.toFixed(0)}" r="${(.5 + r() * 1.5).toFixed(1)}" fill="#fff6dc" opacity="${(.25 + r() * .65 * (1 - y / 620)).toFixed(2)}"/>`;
    }
    b += `<ellipse cx="900" cy="300" rx="420" ry="40" fill="#5a6aa0" opacity=".12" transform="rotate(-18 900 300)" filter="url(#b18)"/>`; // faint milky band
    b += `<circle cx="1240" cy="210" r="210" fill="url(#moon)"/><circle cx="1240" cy="210" r="46" fill="#f6efd2"/><circle cx="1226" cy="198" r="9" fill="#d6cfb0" opacity=".5"/><circle cx="1256" cy="226" r="6" fill="#d6cfb0" opacity=".5"/>`;
    b += `<path d="M0 600 C260 550 520 600 800 570 S1280 540 1600 580 V900 H0Z" fill="#2a3150" opacity=".85" filter="url(#b2)"/>`;
    // walled city skyline silhouette
    b += `<g fill="#1a2036">`;
    for (let i = 0; i < 38; i++) {
      const x = 60 + i * 40 + r() * 10, h = 36 + r() * 78, w = 26 + r() * 22;
      b += `<rect x="${x.toFixed(0)}" y="${(640 - h).toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}"/>`;
      if (r() < .25) b += `<path d="M${x.toFixed(0)} ${(640 - h).toFixed(0)} q${(w / 2).toFixed(0)} -${(w * .7).toFixed(0)} ${w.toFixed(0)} 0z"/>`;
    }
    [[180, 150], [1360, 190]].forEach(([x, h]) => { b += `<rect x="${x}" y="${640 - h}" width="40" height="${h}"/><rect x="${x - 6}" y="${640 - h - 14}" width="52" height="16"/>`; });
    b += `</g>`;
    for (let i = 0; i < 26; i++) b += `<circle cx="${(90 + r() * 1420).toFixed(0)}" cy="${(560 + r() * 70).toFixed(0)}" r="${(7 + r() * 10).toFixed(0)}" fill="url(#win)"/>`;
    b += `<path d="M0 660 C320 630 640 670 960 650 S1400 640 1600 665 V900 H0Z" fill="url(#gnd)"/>`;
    // silhouetted olive trees
    [[130, 800, 1.5], [330, 760, .8], [1290, 770, .85], [1480, 830, 1.65]].forEach(([x, y, s]) => {
      b += `<g transform="translate(${x} ${y}) scale(${s})" fill="#0e1220"><path d="M-14 4 C-34 -34 -8 -66 -30 -118 C-18 -98 2 -92 8 -62 C18 -92 42 -104 34 -146 C50 -102 32 -62 22 -32 C26 -16 18 -6 14 4Z"/>`;
      for (let i = 0; i < 16; i++) { const a = r() * 6.28, d = Math.sqrt(r()) * 130; b += `<ellipse cx="${(Math.cos(a) * d * 1.25).toFixed(0)}" cy="${(-175 + Math.sin(a) * d * .5).toFixed(0)}" rx="${(38 + r() * 46).toFixed(0)}" ry="${(15 + r() * 20).toFixed(0)}"/>`; }
      b += `</g>`;
    });
    // moonlit sheen on the path
    b += `<path d="M700 900 C760 780 820 720 860 660 L900 660 C900 740 940 820 1040 900Z" fill="#aab6d6" opacity=".10" filter="url(#b6)"/>`;
    return wrap(defs, b);
  }

  /* ------------------------------------------------------------------ */
  /* Parchment textures                                                 */
  /* ------------------------------------------------------------------ */
  const PARCH = {
    scroll: { base: "#e6cf9f", stain: "#a8782f", fiber: 0, edge: "rgba(120,78,28,.50)", rule: "rgba(120,78,28,.35)" },
    vellum: { base: "#f2e6c9", stain: "#b99a62", fiber: 0, edge: "rgba(150,112,60,.38)", rule: "rgba(150,112,60,.30)" },
    papyrus: { base: "#dcbc7c", stain: "#8a5f25", fiber: 1, edge: "rgba(110,70,24,.52)", rule: "rgba(110,70,24,.35)" },
    aged: { base: "#cfae72", stain: "#6b4119", fiber: 0, edge: "rgba(70,38,10,.65)", rule: "rgba(70,38,10,.40)" }
  };

  function parchmentSvg(kind) {
    const c = PARCH[kind] || PARCH.scroll;
    const [sr, sg, sb] = hex01(c.stain);
    const fibers = c.fiber
      ? `<filter id="f1" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".004 .55" numOctaves="2" seed="9" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .35  0 0 0 0 .22  0 0 0 0 .08  0 0 0 2.2 -.8"/></filter>` +
      `<filter id="f2" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".5 .006" numOctaves="2" seed="13" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .35  0 0 0 0 .22  0 0 0 0 .08  0 0 0 1.8 -.7"/></filter>`
      : "";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><defs>` +
      `<filter id="n" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".75" numOctaves="3" seed="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .3  0 0 0 0 .2  0 0 0 0 .08  0 0 0 .38 0"/></filter>` +
      `<filter id="s" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".008" numOctaves="4" seed="5" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 ${sr}  0 0 0 0 ${sg}  0 0 0 0 ${sb}  0 0 0 1.7 -.5"/></filter>` +
      `<filter id="m" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="3" seed="21" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 ${sr}  0 0 0 0 ${sg}  0 0 0 0 ${sb}  0 0 0 1.2 -.55"/></filter>` +
      fibers + `</defs>` +
      `<rect width="512" height="512" fill="${c.base}"/>` +
      `<rect width="512" height="512" filter="url(#s)" opacity=".55"/>` +
      `<rect width="512" height="512" filter="url(#m)" opacity=".30"/>` +
      (c.fiber ? `<rect width="512" height="512" filter="url(#f1)" opacity=".45"/><rect width="512" height="512" filter="url(#f2)" opacity=".30"/>` : "") +
      `<rect width="512" height="512" filter="url(#n)"/></svg>`;
    return { svg, base: c.base, edge: c.edge, rule: c.rule };
  }

  const SCENES = { olive: sceneOlive, library: sceneLibrary, ruins: sceneRuins, night: sceneNight };

  // Heavy SVG filters (turbulence / blur) are expensive to repaint, so each artwork is
  // rasterised ONCE into a bitmap and the bitmap is what the page actually paints.
  function svgDataUrl(svg) { return "data:image/svg+xml;utf8," + encodeURIComponent(svg); }
  const pinnedImages = [];
  function pinDataUrl(rawUrl) {
    return new Promise((res) => {
      try {
        const im = new Image();
        im.onload = () => { pinnedImages.push(im); res(); };
        im.onerror = () => res();
        im.src = rawUrl;
      } catch (e) { res(); }
    });
  }

  // Resolves { url, thumb, canvas, thumbCanvas }. Keeping the rasterised <canvas> elements lets
  // content.js paint the backdrop and settings chips directly via drawImage() without going
  // through Bible.com's strict img-src Content-Security-Policy (which blocks data: URLs resolved
  // through CSS custom properties).
  function rasterize(svg, w, h, type, quality, thumbW) {
    return new Promise((resolve) => {
      const fallback = "url('" + svgDataUrl(svg).replace(/'/g, "%27") + "')";
      try {
        const img = new Image();
        img.onload = async () => {
          try {
            const c = document.createElement("canvas");
            c.width = w; c.height = h;
            c.getContext("2d").drawImage(img, 0, 0, w, h);
            const rawUrl = c.toDataURL(type, quality);
            await pinDataUrl(rawUrl);
            const url = "url('" + rawUrl + "')";
            let thumb = url;
            let t = c;
            if (thumbW) {
              t = document.createElement("canvas");
              t.width = thumbW; t.height = Math.round(thumbW * h / w);
              t.getContext("2d").drawImage(c, 0, 0, t.width, t.height);
              const rawThumb = t.toDataURL("image/jpeg", 0.82);
              await pinDataUrl(rawThumb);
              thumb = "url('" + rawThumb + "')";
            }
            resolve({ url, thumb, canvas: c, thumbCanvas: t });
          } catch (e) { resolve({ url: fallback, thumb: fallback, canvas: null, thumbCanvas: null }); }
        };
        img.onerror = () => resolve({ url: fallback, thumb: fallback, canvas: null, thumbCanvas: null });
        img.src = svgDataUrl(svg);
      } catch (e) { resolve({ url: fallback, thumb: fallback, canvas: null, thumbCanvas: null }); }
    });
  }

  const ready = {};   // "scene:olive" -> { url, ... }
  const pending = {}; // key -> Promise

  function load(kind, name) {
    const key = kind + ":" + name;
    if (ready[key]) return Promise.resolve(ready[key]);
    if (pending[key]) return pending[key];
    pending[key] = (async () => {
      let out;
      if (kind === "scene") {
        const gen = SCENES[name] || sceneOlive;
        out = await rasterize(gen(), 1920, 1080, "image/jpeg", 0.86, 320);
      } else {
        const t = parchmentSvg(name);
        const r = await rasterize(t.svg, 512, 512, "image/jpeg", 0.9, 256);
        out = { url: r.url, thumb: r.thumb, canvas: r.canvas, thumbCanvas: r.thumbCanvas, base: t.base, edge: t.edge, rule: t.rule };
      }
      ready[key] = out;
      return out;
    })();
    return pending[key];
  }

  window.BBE_HIST = {
    scenes: Object.keys(SCENES),
    parchments: Object.keys(PARCH),
    load,
    get(kind, name) { return ready[kind + ":" + name] || null; }
  };
})();