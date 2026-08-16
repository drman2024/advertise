const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const ADS_FILE = path.join(DATA_DIR, "ads.json");
const PUBLIC_DIR = path.join(__dirname, "public");

const DEFAULT_ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin@12345";

const MAX_BODY_BYTES = 25 * 1024 * 1024; // 25MB cap (covers up to 20 images)
const SESSION_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

// ---------- tiny JSON "database" ----------
function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "[]");
  if (!fs.existsSync(ADS_FILE)) fs.writeFileSync(ADS_FILE, "[]");
}
function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return []; }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
function ensureDefaultAdmin() {
  const users = readJSON(USERS_FILE);
  if (!users.some(u => u.role === "admin")) {
    const { salt, hash } = hashPassword(DEFAULT_ADMIN_PASSWORD);
    users.push({
      id: genId(), name: "المشرف", email: DEFAULT_ADMIN_EMAIL.toLowerCase(),
      salt, hash, role: "admin", disabled: false, createdAt: Date.now()
    });
    writeJSON(USERS_FILE, users);
    console.log("Created default admin:", DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD);
  }
}

// ---------- helpers ----------
function genId() { return crypto.randomBytes(9).toString("hex"); }
function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}
function verifyPassword(password, salt, hash) {
  const check = crypto.scryptSync(password, salt, 64).toString("hex");
  try { return crypto.timingSafeEqual(Buffer.from(check), Buffer.from(hash)); } catch (e) { return false; }
}
function isValidEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "")); }

// in-memory sessions: token -> {userId, expires}
const sessions = new Map();
function createSession(userId) {
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, { userId, expires: Date.now() + SESSION_MAX_AGE });
  return token;
}
function getSession(token) {
  const s = sessions.get(token);
  if (!s) return null;
  if (s.expires < Date.now()) { sessions.delete(token); return null; }
  return s;
}
function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(";").forEach(part => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}
function currentUser(req) {
  const cookies = parseCookies(req);
  const token = cookies.sid;
  if (!token) return null;
  const s = getSession(token);
  if (!s) return null;
  const users = readJSON(USERS_FILE);
  const user = users.find(u => u.id === s.userId);
  if (!user || user.disabled) return null;
  return user;
}
function publicUser(u) { return { id: u.id, name: u.name, email: u.email, role: u.role, createdAt: u.createdAt }; }

function sendJSON(res, status, obj, extraHeaders) {
  const body = JSON.stringify(obj);
  res.writeHead(status, Object.assign({ "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body) }, extraHeaders || {}));
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = [], size = 0;
    req.on("data", d => {
      size += d.length;
      if (size > MAX_BODY_BYTES) { reject(new Error("PAYLOAD_TOO_LARGE")); req.destroy(); return; }
      chunks.push(d);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch (e) { reject(new Error("BAD_JSON")); }
    });
    req.on("error", reject);
  });
}

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".ico": "image/x-icon", ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json"
};
function serveStatic(req, res, filePath, headOnly) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end("Not found"); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=86400", "Content-Length": data.length });
    res.end(headOnly ? undefined : data);
  });
}

// ---------- request handler ----------
const server = http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url, `http://${req.headers.host}`); } catch (e) { res.writeHead(400); return res.end("Bad request"); }
  const p = url.pathname;
  const method = req.method;

  try {
    // ===== API =====
    if (p.startsWith("/api/")) {
      let body = {};
      if (method === "POST" || method === "PUT") {
        try { body = await readBody(req); }
        catch (e) {
          if (e.message === "PAYLOAD_TOO_LARGE") return sendJSON(res, 413, { error: "الملفات كبيرة جدًا. قللي عدد/حجم الصور وحاولي مجددًا." });
          return sendJSON(res, 400, { error: "بيانات غير صالحة" });
        }
      }

      // ---- auth ----
      if (p === "/api/signup" && method === "POST") {
        const { name, email, password } = body;
        if (!name || !isValidEmail(email) || !password || String(password).length < 6)
          return sendJSON(res, 400, { error: "تأكدي من الاسم والبريد الإلكتروني وكلمة مرور لا تقل عن 6 أحرف." });
        const users = readJSON(USERS_FILE);
        if (users.some(u => u.email === String(email).toLowerCase()))
          return sendJSON(res, 409, { error: "هذا البريد الإلكتروني مسجل مسبقًا." });
        const { salt, hash } = hashPassword(password);
        const user = { id: genId(), name: String(name).trim(), email: String(email).toLowerCase(), salt, hash, role: "visitor", disabled: false, createdAt: Date.now() };
        users.push(user); writeJSON(USERS_FILE, users);
        const token = createSession(user.id);
        return sendJSON(res, 200, { user: publicUser(user) }, { "Set-Cookie": `sid=${token}; HttpOnly; Path=/; Max-Age=${SESSION_MAX_AGE / 1000}; SameSite=Lax` });
      }

      if (p === "/api/login" && method === "POST") {
        const { email, password } = body;
        const users = readJSON(USERS_FILE);
        const user = users.find(u => u.email === String(email || "").toLowerCase());
        if (!user || !verifyPassword(password || "", user.salt, user.hash))
          return sendJSON(res, 401, { error: "البريد الإلكتروني أو كلمة المرور غير صحيحة." });
        if (user.disabled) return sendJSON(res, 403, { error: "تم إيقاف هذا الحساب. تواصلي مع الإدارة." });
        const token = createSession(user.id);
        return sendJSON(res, 200, { user: publicUser(user) }, { "Set-Cookie": `sid=${token}; HttpOnly; Path=/; Max-Age=${SESSION_MAX_AGE / 1000}; SameSite=Lax` });
      }

      if (p === "/api/logout" && method === "POST") {
        const cookies = parseCookies(req);
        if (cookies.sid) sessions.delete(cookies.sid);
        return sendJSON(res, 200, { ok: true }, { "Set-Cookie": "sid=; HttpOnly; Path=/; Max-Age=0" });
      }

      if (p === "/api/me" && method === "GET") {
        const user = currentUser(req);
        if (!user) return sendJSON(res, 401, { error: "غير مسجل الدخول" });
        return sendJSON(res, 200, { user: publicUser(user) });
      }

      if (p === "/api/change-password" && method === "POST") {
        const user = currentUser(req);
        if (!user) return sendJSON(res, 401, { error: "غير مسجل الدخول" });
        const { oldPassword, newPassword } = body;
        if (!verifyPassword(oldPassword || "", user.salt, user.hash)) return sendJSON(res, 401, { error: "كلمة المرور الحالية غير صحيحة." });
        if (!newPassword || String(newPassword).length < 6) return sendJSON(res, 400, { error: "كلمة المرور الجديدة قصيرة جدًا (6 أحرف على الأقل)." });
        const users = readJSON(USERS_FILE);
        const u = users.find(u => u.id === user.id);
        const { salt, hash } = hashPassword(newPassword);
        u.salt = salt; u.hash = hash;
        writeJSON(USERS_FILE, users);
        return sendJSON(res, 200, { ok: true });
      }

      // everything below requires login
      const user = currentUser(req);
      if (!user) return sendJSON(res, 401, { error: "يجب تسجيل الدخول" });

      // ---- ads ----
      if (p === "/api/ads" && method === "GET") {
        const ads = readJSON(ADS_FILE);
        if (user.role === "admin" && url.searchParams.get("all") === "1") {
          const users = readJSON(USERS_FILE);
          const withOwner = ads.map(a => {
            const owner = users.find(u => u.id === a.userId);
            return Object.assign({}, a, { ownerName: owner ? owner.name : "—", ownerEmail: owner ? owner.email : "—" });
          }).sort((a, b) => b.createdAt - a.createdAt);
          return sendJSON(res, 200, { ads: withOwner });
        }
        const mine = ads.filter(a => a.userId === user.id).sort((a, b) => b.createdAt - a.createdAt);
        return sendJSON(res, 200, { ads: mine });
      }

      if (p === "/api/ads" && method === "POST") {
        const images = Array.isArray(body.images) ? body.images.slice(0, 20) : [];
        const ad = {
          id: genId(), userId: user.id,
          category: body.category || "realestate", template: body.template || 0,
          theme: body.theme || "navygold", imgLayout: body.imgLayout || "hero", detailStyle: body.detailStyle || "cards",
          fields: body.fields || {}, contact: body.contact || {}, images,
          status: "pending", createdAt: Date.now(), updatedAt: Date.now()
        };
        const ads = readJSON(ADS_FILE);
        ads.push(ad); writeJSON(ADS_FILE, ads);
        return sendJSON(res, 200, { ad });
      }

      const adMatch = p.match(/^\/api\/ads\/([a-f0-9]+)(\/status)?$/);
      if (adMatch && (method === "PUT" || method === "DELETE" || method === "POST")) {
        const adId = adMatch[1], isStatusRoute = !!adMatch[2];
        const ads = readJSON(ADS_FILE);
        const idx = ads.findIndex(a => a.id === adId);
        if (idx === -1) return sendJSON(res, 404, { error: "الإعلان غير موجود" });
        const ad = ads[idx];
        const isOwner = ad.userId === user.id;
        const isAdmin = user.role === "admin";
        if (!isOwner && !isAdmin) return sendJSON(res, 403, { error: "لا تملكين صلاحية على هذا الإعلان" });

        if (method === "DELETE") {
          ads.splice(idx, 1); writeJSON(ADS_FILE, ads);
          return sendJSON(res, 200, { ok: true });
        }
        if (isStatusRoute) {
          if (!isAdmin) return sendJSON(res, 403, { error: "فقط المشرف يمكنه تغيير حالة الإعلان" });
          const status = body.status;
          if (!["pending", "approved", "rejected"].includes(status)) return sendJSON(res, 400, { error: "حالة غير صالحة" });
          ad.status = status; ad.updatedAt = Date.now();
          writeJSON(ADS_FILE, ads);
          return sendJSON(res, 200, { ad });
        }
        // PUT full update
        const images = Array.isArray(body.images) ? body.images.slice(0, 20) : ad.images;
        Object.assign(ad, {
          category: body.category || ad.category, template: body.template != null ? body.template : ad.template,
          theme: body.theme || ad.theme, imgLayout: body.imgLayout || ad.imgLayout, detailStyle: body.detailStyle || ad.detailStyle,
          fields: body.fields || ad.fields, contact: body.contact || ad.contact, images,
          updatedAt: Date.now()
        });
        if (isOwner && !isAdmin) ad.status = "pending"; // edits by the owner go back for review
        writeJSON(ADS_FILE, ads);
        return sendJSON(res, 200, { ad });
      }

      // ---- admin: users ----
      if (p === "/api/users" && method === "GET") {
        if (user.role !== "admin") return sendJSON(res, 403, { error: "للمشرف فقط" });
        const users = readJSON(USERS_FILE);
        const ads = readJSON(ADS_FILE);
        const list = users.filter(u => u.role === "visitor").map(u => Object.assign(publicUser(u), {
          disabled: !!u.disabled, adsCount: ads.filter(a => a.userId === u.id).length
        }));
        return sendJSON(res, 200, { users: list });
      }
      const toggleMatch = p.match(/^\/api\/users\/([a-f0-9]+)\/toggle$/);
      if (toggleMatch && method === "POST") {
        if (user.role !== "admin") return sendJSON(res, 403, { error: "للمشرف فقط" });
        const users = readJSON(USERS_FILE);
        const u = users.find(u => u.id === toggleMatch[1]);
        if (!u) return sendJSON(res, 404, { error: "المستخدم غير موجود" });
        u.disabled = !u.disabled; writeJSON(USERS_FILE, users);
        return sendJSON(res, 200, { disabled: u.disabled });
      }
      const delUserMatch = p.match(/^\/api\/users\/([a-f0-9]+)$/);
      if (delUserMatch && method === "DELETE") {
        if (user.role !== "admin") return sendJSON(res, 403, { error: "للمشرف فقط" });
        let users = readJSON(USERS_FILE);
        users = users.filter(u => u.id !== delUserMatch[1]);
        writeJSON(USERS_FILE, users);
        let ads = readJSON(ADS_FILE);
        ads = ads.filter(a => a.userId !== delUserMatch[1]);
        writeJSON(ADS_FILE, ads);
        return sendJSON(res, 200, { ok: true });
      }

      return sendJSON(res, 404, { error: "غير موجود" });
    }

    // ===== static pages/assets =====
    if (method !== "GET" && method !== "HEAD") { res.writeHead(405); return res.end("Method not allowed"); }

    let filePath;
    if (p === "/" || p === "") filePath = path.join(PUBLIC_DIR, "index.html");
    else if (p === "/app") filePath = path.join(PUBLIC_DIR, "app.html");
    else if (p === "/admin") filePath = path.join(PUBLIC_DIR, "admin.html");
    else filePath = path.join(PUBLIC_DIR, p);

    const resolved = path.normalize(filePath);
    if (!resolved.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end("Forbidden"); }
    if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) { res.writeHead(404); return res.end("Not found"); }
    return serveStatic(req, res, resolved, method === "HEAD");

  } catch (err) {
    console.error(err);
    return sendJSON(res, 500, { error: "خطأ في الخادم" });
  }
});

ensureDataFiles();
ensureDefaultAdmin();
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
