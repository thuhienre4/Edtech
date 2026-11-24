// Xuất website ra thư mục website/docs để đưa lên Netlify (kéo thả thư mục docs vào app.netlify.com/drop).
// 1) Điền website/thong-tin.json   2) Chạy: node website/xuat-web.js
const fs = require('fs'), path = require('path');
const DIR = __dirname, SRC = path.join(DIR, 'src'), OUT = path.join(DIR, 'docs');

const info = JSON.parse(fs.readFileSync(path.join(DIR, 'thong-tin.json'), 'utf8'));
delete info._huong_dan;
const json = JSON.stringify(info).replace(/</g, '\\u003c');

const icon = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#4b2fa6"/><g fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="10" rx="1.5"/><path d="M9 19h6M12 15v4M8.5 10l2.5 2 4-4"/></g></svg>');
const ten = info.thuongHieu || 'Học liệu số';
// Mã xác minh Google Search Console: nhận cả dạng thẻ <meta ...> lẫn chỉ phần content
const vcode = String(info.googleVerify || '').replace(/^.*content="([^"]+)".*$/s, '$1').replace(/^google-site-verification=/, '').trim();
const verify = vcode ? '\n<meta name="google-site-verification" content="' + vcode.replace(/[^A-Za-z0-9_-]/g, '') + '">' : '';

// Địa chỉ chính của web (diaChiWeb): dùng cho thẻ canonical, sitemap.xml và robots.txt để Google tìm thấy trang
const base = String(info.diaChiWeb || '').trim().replace(/\/?$/, '/');
const pageUrl = f => base + (f === 'index.html' ? '' : f);
const pages = fs.readdirSync(SRC).filter(f => f.endsWith('.html'));
// Đếm lượt xem và chỉ chỗ gửi đơn: trên chính server thì gọi /api, trên bản sao (GitHub Pages) thì gọi về diaChiWeb
const apiOrigin = base !== '/' ? new URL(base).origin : '';
const tracker = `<script>
(function () {
  var home = ${JSON.stringify(apiOrigin)};
  window.API_WEB = location.origin === home ? '' : home;
  if (!/^https?:$/.test(location.protocol) || !home) return;
  var v = '';
  try { v = localStorage.getItem('web-v') || ''; if (!v) { v = Math.random().toString(36).slice(2, 14); localStorage.setItem('web-v', v); } } catch (e) {}
  var p = location.pathname.replace(/^\\/Edtech(?=\\/)/, '').replace(/\\/index\\.html$/, '/') || '/';
  var body = JSON.stringify({ trang: p, v: v, ref: document.referrer });
  var url = window.API_WEB + '/api/xem';
  try { if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([body], { type: 'text/plain' }))) return; } catch (e) {}
  try { fetch(url, { method: 'POST', body: body, keepalive: true }).catch(function () {}); } catch (e) {}
})();
</script>`;

// Bản đưa lên mạng không để lộ khung "điền ...": có data-empty thì thay bằng chữ đó, nằm trong [data-wrap] thì ẩn cả khối, còn lại thì ẩn
const finish = `<script>
document.querySelectorAll('.fill-in').forEach(function (el) {
  if (el.hidden) return;
  if (el.dataset.empty) {
    el.textContent = el.dataset.empty; el.classList.remove('fill-in');
    var unit = el.parentNode && el.parentNode.querySelector('small'); if (unit) unit.hidden = true;
    return;
  }
  (el.closest('[data-wrap]') || el).hidden = true;
});
</script>`;

// Song ngữ: từ điển en.json (chữ tiếng Việt → tiếng Anh), nút VI / EN trên thanh đầu trang
const EN = JSON.parse(fs.readFileSync(path.join(DIR, 'en.json'), 'utf8'));
const i18n = `<script>
(function () {
  var EN = ${JSON.stringify(EN).replace(/</g, '\\u003c')};
  var TAIL = [
    [/^Thầy cô nhắn thẳng Zalo (.+) giúp nhé\\.$/, 'Please message us on Zalo at $1.'],
    [/^Thầy cô gửi email tới (.+) giúp nhé\\.$/, 'Please email us at $1.'],
    [/^Thầy cô nhắn fanpage (.+) giúp nhé\\.$/, 'Please message our fanpage: $1.']
  ];
  var RULES = [
    [/^từ (.+)$/, function (m, a) { return 'from ' + a; }],
    [/^\\/ năm · ≈ (.+)đ\\/tháng$/, function (m, a) { return '/ year · ≈ ' + a + ' VND/month'; }],
    [/^Tiết kiệm (.+)đ so với mua riêng từng phần mềm\\.$/, function (m, a) { return 'Save ' + a + ' VND compared with buying each one separately.'; }],
    [/^(Chưa gửi được (?:đơn|đăng ký)\\.) (.+)$/, function (m, a, b) { return (EN[a] || a) + ' ' + (EN[b] || tail(b)); }],
    [/^(.+) · (Học liệu số cho giáo viên|Phần mềm hỗ trợ dạy học|Phần mềm dạy học)$/, function (m, a, b) { return (EN[a] || a) + ' · ' + EN[b]; }]
  ];
  function tail(s) { for (var i = 0; i < TAIL.length; i++) if (TAIL[i][0].test(s)) return s.replace(TAIL[i][0], TAIL[i][1]); return s; }
  function tr(s) {
    var k = s.replace(/\\s+/g, ' ').trim(); if (!k) return null;
    var out = EN[k];
    if (out == null) for (var i = 0; i < RULES.length && out == null; i++) { var m = k.match(RULES[i][0]); if (m) out = RULES[i][1].apply(null, m); }
    if (out == null) return null;
    return s.match(/^\\s*/)[0] + out + s.match(/\\s*$/)[0];
  }
  var KEY = 'web-lang', lang = 'vi';
  try { lang = localStorage.getItem(KEY) || ''; } catch (e) {}
  var q = /[?&]lang=(en|vi)/.exec(location.search); if (q) lang = q[1];
  if (!lang) lang = /^vi/i.test(navigator.language || 'vi') ? 'vi' : 'en';
  var texts = new Map(), attrs = new Map(), ATTR = ['placeholder', 'aria-label', 'title'], busy = false, title0 = document.title;
  function doText(n) {
    var rec = texts.get(n), cur = n.nodeValue;
    if (rec && (cur === rec.t || cur === rec.o)) { if (cur === rec.t && lang === 'en') return; }
    if (!rec || (cur !== rec.t && cur !== rec.o)) { rec = { o: cur, t: tr(cur) }; if (rec.t == null) { texts.delete(n); return; } texts.set(n, rec); }
    var want = lang === 'en' ? rec.t : rec.o; if (n.nodeValue !== want) n.nodeValue = want;
  }
  function doEl(el) {
    for (var i = 0; i < ATTR.length; i++) {
      var a = ATTR[i]; if (!el.hasAttribute || !el.hasAttribute(a)) continue;
      var m = attrs.get(el) || {}, cur = el.getAttribute(a), r = m[a];
      if (!r || (cur !== r.t && cur !== r.o)) { var t = tr(cur); if (t == null) continue; r = m[a] = { o: cur, t: t }; attrs.set(el, m); }
      var want = lang === 'en' ? r.t : r.o; if (cur !== want) el.setAttribute(a, want);
    }
  }
  function walk(root) {
    if (root.nodeType === 3) return doText(root);
    if (root.nodeType !== 1 || /^(SCRIPT|STYLE|SVG)$/i.test(root.nodeName)) return;
    doEl(root);
    var w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, { acceptNode: function (n) { return n.parentNode && /^(SCRIPT|STYLE)$/i.test(n.parentNode.nodeName) ? 2 : 1; } });
    var n; while ((n = w.nextNode())) { if (n.nodeType === 3) doText(n); else doEl(n); }
  }
  function apply() {
    busy = true;
    document.documentElement.lang = lang;
    walk(document.body);
    var t = tr(title0); document.title = lang === 'en' && t ? t : title0;
    var b = document.getElementById('lang-btn'); if (b) { b.textContent = lang === 'en' ? 'VI' : 'EN'; b.setAttribute('aria-label', lang === 'en' ? 'Chuyển sang tiếng Việt' : 'Switch to English'); }
    busy = false;
  }
  function button() {
    var nav = document.querySelector('header nav') || document.querySelector('header .wrap');
    var b = document.createElement('button');
    b.type = 'button'; b.id = 'lang-btn'; b.className = 'lang-btn';
    b.addEventListener('click', function () { lang = lang === 'en' ? 'vi' : 'en'; try { localStorage.setItem(KEY, lang); } catch (e) {} apply(); });
    var st = document.createElement('style');
    st.textContent = '.lang-btn{font:700 .82rem/1 inherit;letter-spacing:.04em;padding:8px 11px;border-radius:999px;border:1.5px solid currentColor;background:transparent;color:inherit;cursor:pointer;opacity:.85}.lang-btn:hover{opacity:1}';
    document.head.appendChild(st);
    if (nav) nav.insertBefore(b, nav.firstChild); else { b.style.cssText = 'position:fixed;top:calc(10px + env(safe-area-inset-top,0px));right:calc(10px + env(safe-area-inset-right,0px));z-index:40;background:#fff;color:#222'; document.body.appendChild(b); }
  }
  button(); apply();
  new MutationObserver(function (list) {
    if (busy) return; busy = true;
    list.forEach(function (m) {
      if (m.type === 'characterData') doText(m.target);
      else if (m.type === 'attributes') doEl(m.target);
      else m.addedNodes.forEach(walk);
    });
    busy = false;
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTR });
})();
</script>`;

fs.mkdirSync(OUT, { recursive: true });
for (const f of pages) {
  let s = fs.readFileSync(path.join(SRC, f), 'utf8');
  const marker = /\/\*THONG-TIN\*\/[\s\S]*?\/\*HET\*\//;
  if (!marker.test(s)) throw new Error(f + ': thiếu chỗ đánh dấu /*THONG-TIN*/{}/*HET*/');
  s = s.replace(marker, () => json);
  if (info.thuongHieu && f === 'index.html') s = s.replace(/<title>[^<]*<\/title>/, `<title>${ten} · Học liệu số cho giáo viên</title>`);

  const cut = s.indexOf('</style>') + '</style>'.length;
  const head = s.slice(0, cut).replace('<meta name="claude:viewport-fit-sides" content="cover">\n', '');
  const title = (s.match(/<title>([^<]*)<\/title>/) || [])[1] || ten;
  const desc = (s.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
  const out = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${head}
<meta property="og:type" content="website">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<link rel="icon" href="${icon}">${verify}${base !== '/' ? `\n<link rel="canonical" href="${pageUrl(f)}">\n<meta property="og:url" content="${pageUrl(f)}">` : ''}
<style>body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
${tracker}
</head>
<body>
${s.slice(cut).trim()}
${finish}
${i18n}
</body>
</html>
`;
  fs.writeFileSync(path.join(OUT, f), out);
  console.log('  ' + f.padEnd(22) + Math.round(out.length / 1024) + ' KB');
}

if (base !== '/') {
  const today = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(OUT, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    pages.map(f => `  <url><loc>${pageUrl(f)}</loc><lastmod>${today}</lastmod></url>`).join('\n') + '\n</urlset>\n');
  fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${base}sitemap.xml\n`);
  console.log('  sitemap.xml, robots.txt  (' + base + ')');
}

const thieu = ['thuongHieu', 'tenNguoiBan', 'email', 'giaGiaoVien', 'engineGiaGiaoVien'].filter(k => !info[k]);
const thieuGia = Object.entries(info.giaSanPham || {}).filter(([, v]) => !v).map(([k]) => k);
console.log('Đã xuất website vào ' + OUT);
if (thieu.length || thieuGia.length) console.log('Còn trống (web sẽ hiện khung đỏ "điền ..."): ' + thieu.concat(thieuGia.map(k => 'giá ' + k)).join(', '));
