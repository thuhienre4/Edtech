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
