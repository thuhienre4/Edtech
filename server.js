// Server cho website: phục vụ thư mục docs, đếm lượt xem, nhận đơn hàng và trang quản trị /quan-tri.
// Không cần thư viện ngoài. Chạy: node server.js
// Biến môi trường:
//   PORT            cổng (Railway tự đặt)
//   ADMIN_PASSWORD  mật khẩu trang quản trị (bắt buộc để mở /quan-tri)
//   DATA_DIR        thư mục lưu dữ liệu (trên Railway: ổ đĩa gắn ở /data)
//   CORS_ORIGINS    các trang khác được gửi lượt xem / đơn về đây, cách nhau dấu phẩy
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');

const PORT = +process.env.PORT || 8080;
const ROOT = path.join(__dirname, 'docs');
const ADMIN_PAGE = path.join(__dirname, 'quan-tri.html');
const DATA = process.env.DATA_DIR || path.join(__dirname, 'du-lieu');
const PASS = process.env.ADMIN_PASSWORD || '';
const SECRET = process.env.SESSION_SECRET || crypto.createHash('sha256').update('quan-tri:' + PASS).digest('hex');
const ALLOW = (process.env.CORS_ORIGINS || 'https://thuhienre4.github.io').split(',').map(s => s.trim()).filter(Boolean);
const TZ = 7 * 3600e3; // giờ Việt Nam

fs.mkdirSync(DATA, { recursive: true });
const VIEWS_FILE = path.join(DATA, 'luot-xem.ndjson'), ORDERS_FILE = path.join(DATA, 'don-hang.json');

/* ---------- dữ liệu ---------- */
let views = [];
try {
  for (const line of fs.readFileSync(VIEWS_FILE, 'utf8').split('\n')) if (line) { try { views.push(JSON.parse(line)); } catch (e) {} }
} catch (e) {}
let orders = [];
try { orders = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8')); } catch (e) {}
function saveOrders() { const t = ORDERS_FILE + '.tmp'; fs.writeFileSync(t, JSON.stringify(orders, null, 1)); fs.renameSync(t, ORDERS_FILE); }
function addView(v) { views.push(v); fs.appendFile(VIEWS_FILE, JSON.stringify(v) + '\n', () => {}); }

const dayOf = t => new Date(t + TZ).toISOString().slice(0, 10);
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);

/* ---------- giới hạn tần suất ---------- */
const hits = new Map();
function limited(key, max, windowMs) {
  const now = Date.now(), h = hits.get(key) || [];
  const recent = h.filter(t => now - t < windowMs);
  recent.push(now); hits.set(key, recent);
  return recent.length > max;
}
setInterval(() => { const now = Date.now(); for (const [k, h] of hits) if (!h.some(t => now - t < 3600e3)) hits.delete(k); }, 600e3).unref();
const ipOf = req => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';

/* ---------- phiên đăng nhập ---------- */
const sign = s => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');
function newSession() { const exp = Date.now() + 7 * 864e5; const v = exp + '.' + crypto.randomBytes(9).toString('base64url'); return v + '.' + sign(v); }
function authed(req) {
  const m = /(?:^|;\s*)qt=([^;]+)/.exec(req.headers.cookie || ''); if (!m || !PASS) return false;
  const parts = m[1].split('.'); if (parts.length !== 3) return false;
  const v = parts[0] + '.' + parts[1], good = sign(v);
  if (good.length !== parts[2].length || !crypto.timingSafeEqual(Buffer.from(good), Buffer.from(parts[2]))) return false;
  return +parts[0] > Date.now();
}
const fails = new Map();
function passOk(p) {
  const a = crypto.createHash('sha256').update(String(p)).digest(), b = crypto.createHash('sha256').update(PASS).digest();
  return PASS && crypto.timingSafeEqual(a, b);
}

/* ---------- tiện ích HTTP ---------- */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.xml': 'text/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp' };
function send(res, code, body, type, extra) {
  res.writeHead(code, Object.assign({ 'Content-Type': type || 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' }, extra || {}));
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function readBody(req, max) {
  return new Promise((ok, bad) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > max) { bad(new Error('too big')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => ok(Buffer.concat(chunks).toString('utf8')));
    req.on('error', bad);
  });
}
function parseBody(raw, type) {
  if (/json|text\/plain/.test(type || '') || /^\s*\{/.test(raw)) { try { return JSON.parse(raw) || {}; } catch (e) { return {}; } }
  return Object.fromEntries(new URLSearchParams(raw));
}
function cors(req, res) {
  const o = req.headers.origin;
  if (o && ALLOW.includes(o)) { res.setHeader('Access-Control-Allow-Origin', o); res.setHeader('Vary', 'Origin'); }
}
function device(ua) {
  ua = ua || '';
  if (/bot|crawl|spider|slurp|facebookexternalhit|preview/i.test(ua)) return 'bot';
  if (/ipad|tablet/i.test(ua)) return 'tablet';
  return /mobi|android|iphone/i.test(ua) ? 'mobile' : 'desktop';
}

/* ---------- số liệu cho trang quản trị ---------- */
function stats(days) {
  const now = Date.now(), from = now - days * 864e5, today = dayOf(now);
  const human = views.filter(v => v.d !== 'bot');
  const inRange = human.filter(v => v.t >= from);
  const byDay = {};
  for (let i = days - 1; i >= 0; i--) byDay[dayOf(now - i * 864e5)] = { xem: 0, nguoi: new Set(), don: 0 };
  for (const v of inRange) { const b = byDay[dayOf(v.t)]; if (b) { b.xem++; b.nguoi.add(v.v); } }
  for (const o of orders) { const b = byDay[dayOf(o.t)]; if (b) b.don++; }
  const count = (arr, key) => { const m = {}; for (const x of arr) { const k = key(x); if (k) m[k] = (m[k] || 0) + 1; } return Object.entries(m).sort((a, b) => b[1] - a[1]); };
  const todayViews = human.filter(v => dayOf(v.t) === today);
  const sold = orders.filter(o => o.trangThai === 'da-ban');
  return {
    tongQuan: {
      xemHomNay: todayViews.length,
      nguoiHomNay: new Set(todayViews.map(v => v.v)).size,
      xemKy: inRange.length,
      nguoiKy: new Set(inRange.map(v => v.v)).size,
      donKy: orders.filter(o => o.t >= from).length,
      donMoi: orders.filter(o => o.trangThai === 'moi').length,
      daBan: sold.length,
      doanhThu: sold.reduce((s, o) => s + (+o.soTien || 0), 0),
      tongXem: human.length
    },
    theoNgay: Object.entries(byDay).map(([ngay, b]) => ({ ngay, xem: b.xem, nguoi: b.nguoi.size, don: b.don })),
    trang: count(inRange, v => v.p).slice(0, 10),
    nguon: count(inRange, v => v.r || '(vào thẳng)').slice(0, 10),
    thietBi: count(inRange, v => v.d),
    don: orders.slice().sort((a, b) => b.t - a.t)
  };
}
function csv(rows) {
  const cols = ['Mã', 'Thời gian', 'Trạng thái', 'Số tiền', 'Họ tên', 'Zalo', 'Trường', 'Sản phẩm', 'Nhu cầu', 'Gói', 'Môn / khối', 'Cấp', 'Ghi chú của khách', 'Ghi chú nội bộ', 'Trang'];
  const label = { moi: 'Mới', 'da-lien-he': 'Đã liên hệ', 'da-ban': 'Đã bán', huy: 'Huỷ' };
  const q = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
  const lines = rows.map(o => [o.id, new Date(o.t + TZ).toISOString().replace('T', ' ').slice(0, 16), label[o.trangThai] || o.trangThai, o.soTien || '', o.hoTen, o.zalo, o.truong, o.sanPham, o.nhuCau, o.goi, o.mon, o.cap, o.ghiChu, o.noiBo, o.trang].map(q).join(','));
  return '﻿' + cols.map(q).join(',') + '\n' + lines.join('\n') + '\n';
}

/* ---------- định tuyến ---------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'), p = url.pathname, ip = ipOf(req);
  try {
    if (req.method === 'OPTIONS' && p.startsWith('/api/')) { cors(req, res); res.writeHead(204, { 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' }); return res.end(); }

    // Lượt xem: gửi từ mọi trang
    if (p === '/api/xem' && req.method === 'POST') {
      cors(req, res);
      if (limited('xem:' + ip, 120, 60e3)) return send(res, 429, { ok: false });
      const b = parseBody(await readBody(req, 4096), req.headers['content-type']);
      let ref = clean(b.ref, 300);
      try { ref = ref ? new URL(ref).hostname.replace(/^www\./, '') : ''; } catch (e) { ref = ''; }
      const host = (req.headers.host || '').split(':')[0];
      if (ref === host || ref === 'thuhienre4.github.io') ref = '';
      addView({ t: Date.now(), p: clean(b.trang, 80) || '/', v: clean(b.v, 32) || crypto.randomBytes(6).toString('hex'), r: ref, d: device(req.headers['user-agent']) });
      return send(res, 200, { ok: true });
    }

    // Đơn hàng / đăng ký: gửi từ form trên web
    if (p === '/api/don' && req.method === 'POST') {
      cors(req, res);
      if (limited('don:' + ip, 5, 600e3)) return send(res, 429, { ok: false, loi: 'Gửi quá nhiều lần, thử lại sau ít phút.' });
      const b = parseBody(await readBody(req, 10240), req.headers['content-type']);
      if (b['bot-field']) return send(res, 200, { ok: true }); // máy tự điền: bỏ qua
      const o = {
        id: crypto.randomBytes(4).toString('hex'), t: Date.now(), trangThai: 'moi', soTien: '', noiBo: '',
        hoTen: clean(b['ho-ten'], 80), zalo: clean(b.zalo, 30), truong: clean(b.truong, 120),
        sanPham: clean(b['san-pham'] || (b['form-name'] === 'dang-ky-enginelab' ? 'EngineLab Công nghệ' : b['form-name'] === 'dang-ky' ? 'Lớp học chung Offline' : ''), 80),
        nhuCau: clean(b['nhu-cau'], 60), goi: clean(b.goi, 40), mon: clean(b.mon || b.khoi, 60), cap: clean(b.cap, 40),
        ghiChu: clean(b['ghi-chu'], 1000), trang: clean(b.trang || b['form-name'], 60)
      };
      if (!o.hoTen || o.zalo.replace(/\D/g, '').length < 9) return send(res, 400, { ok: false, loi: 'Thiếu họ tên hoặc số liên hệ.' });
      orders.push(o); saveOrders();
      return send(res, 200, { ok: true });
    }

    // Trang quản trị
    if (p === '/quan-tri' || p === '/quan-tri/') {
      return send(res, 200, fs.readFileSync(ADMIN_PAGE), TYPES['.html'], { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'X-Frame-Options': 'DENY' });
    }
    if (p === '/api/dang-nhap' && req.method === 'POST') {
      if (!PASS) return send(res, 503, { ok: false, loi: 'Chưa đặt mật khẩu quản trị (biến ADMIN_PASSWORD trên Railway).' });
      const f = fails.get(ip) || { n: 0, until: 0 };
      if (f.until > Date.now()) return send(res, 429, { ok: false, loi: 'Sai mật khẩu nhiều lần. Thử lại sau 15 phút.' });
      const b = parseBody(await readBody(req, 1024), req.headers['content-type']);
      if (!passOk(b.matKhau || '')) {
        f.n++; if (f.n >= 5) { f.until = Date.now() + 15 * 60e3; f.n = 0; } fails.set(ip, f);
        return send(res, 401, { ok: false, loi: 'Sai mật khẩu.' });
      }
      fails.delete(ip);
      return send(res, 200, { ok: true }, null, { 'Set-Cookie': `qt=${newSession()}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${7 * 86400}` });
    }
    if (p === '/api/dang-xuat' && req.method === 'POST') return send(res, 200, { ok: true }, null, { 'Set-Cookie': 'qt=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0' });
    if (p.startsWith('/api/quan-tri/')) {
      if (!authed(req)) return send(res, 401, { ok: false, loi: 'Cần đăng nhập.' });
      res.setHeader('Cache-Control', 'no-store');
      if (p === '/api/quan-tri/so-lieu' && req.method === 'GET') {
        const days = Math.min(Math.max(+url.searchParams.get('ngay') || 30, 1), 365);
        return send(res, 200, stats(days));
      }
      if (p === '/api/quan-tri/don.csv' && req.method === 'GET') {
        return send(res, 200, csv(orders.slice().sort((a, b) => b.t - a.t)), 'text/csv; charset=utf-8', { 'Content-Disposition': 'attachment; filename="don-hang.csv"' });
      }
      const m = /^\/api\/quan-tri\/don\/([a-f0-9]{8})$/.exec(p);
      if (m && req.method === 'PATCH') {
        if (!/json/.test(req.headers['content-type'] || '')) return send(res, 415, { ok: false });
        const o = orders.find(x => x.id === m[1]); if (!o) return send(res, 404, { ok: false });
        const b = parseBody(await readBody(req, 4096), 'json');
        if (['moi', 'da-lien-he', 'da-ban', 'huy'].includes(b.trangThai)) o.trangThai = b.trangThai;
        if ('soTien' in b) o.soTien = String(b.soTien).replace(/\D/g, '').slice(0, 12);
        if ('noiBo' in b) o.noiBo = clean(b.noiBo, 1000);
        saveOrders();
        return send(res, 200, { ok: true, don: o });
      }
      if (m && req.method === 'DELETE') {
        const i = orders.findIndex(x => x.id === m[1]); if (i < 0) return send(res, 404, { ok: false });
        orders.splice(i, 1); saveOrders();
        return send(res, 200, { ok: true });
      }
      return send(res, 404, { ok: false });
    }

    // Trang tĩnh trong docs/
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { ok: false });
    let file = decodeURIComponent(p);
    if (file.endsWith('/')) file += 'index.html';
    const full = path.normalize(path.join(ROOT, file));
    if (!full.startsWith(ROOT)) return send(res, 403, 'Không được phép', TYPES['.txt']);
    fs.readFile(full, (err, buf) => {
      if (err) return send(res, 404, '<!doctype html><meta charset="utf-8"><title>Không tìm thấy trang</title><p style="font-family:sans-serif;padding:40px">Không tìm thấy trang. <a href="/">Về trang chủ</a></p>', TYPES['.html']);
      const ext = path.extname(full).toLowerCase();
      send(res, 200, req.method === 'HEAD' ? '' : buf, TYPES[ext] || 'application/octet-stream', { 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600' });
    });
  } catch (e) {
    if (!res.headersSent) send(res, 400, { ok: false });
  }
});

server.listen(PORT, () => console.log(`Website chạy ở cổng ${PORT} · dữ liệu: ${DATA} · quản trị: ${PASS ? 'bật' : 'TẮT (chưa đặt ADMIN_PASSWORD)'}`));
module.exports = { server, stats };
