import { WISDOM } from "./wisdom.js";
import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, collection, onSnapshot, doc, writeBatch } from "firebase/firestore";

const NAME = "إسلام";
const WEB_URL = "https://esgraphiic-wq.github.io/nota/";
const CFG = {
  apiKey: "AIzaSyCKuWX_cu78l_e3h85Av6Jn0CukDF98kHE", authDomain: "nota-islam.firebaseapp.com", projectId: "nota-islam",
  storageBucket: "nota-islam.firebasestorage.app", messagingSenderId: "782390960025", appId: "1:782390960025:web:198c2a8c843aff3f62fd08"
};
const DEMO = /[?&]demo/.test(location.search);
const API = window.nota || { notify: (n) => console.log("notify", n), hide() {}, quit() {}, openExternal: (u) => window.open(u), getSettings: async () => ({ autostart: true, notifications: true, summaryHour: 9, pinned: false }), setSetting: async () => true, onVisible() {} };

/* ---------------- state ---------------- */
const S = { user: null, ready: false, lists: [], tasks: [], fromCache: false, expanded: new Set(), fading: new Set(), panel: false, settings: { autostart: true, notifications: true, summaryHour: 9, pinned: false }, loginErr: "", wisdomShift: 0 };
const $app = document.getElementById("app");

/* ---------------- helpers ---------------- */
const h = (tag, attrs, ...kids) => {
  const e = document.createElement(tag);
  for (const k in attrs || {}) {
    const v = attrs[k];
    if (k === "class") e.className = v; else if (k === "text") e.textContent = v;
    else if (k === "html") e.innerHTML = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  kids.flat().forEach((c) => { if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c)); });
  return e;
};
const ICON = {
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  chev: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>'
};
const dayStart = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
const endToday = () => dayStart(Date.now()) + 864e5 - 1;
const tm = (ms) => new Date(ms).toLocaleTimeString("ar-EG-u-nu-latn", { hour: "numeric", minute: "2-digit" });
const dm = (ms) => { const d = new Date(ms); return d.toLocaleDateString("ar-EG-u-nu-latn", { weekday: "long" }) + " " + d.getDate() + "/" + (d.getMonth() + 1); };
const listOf = (id) => S.lists.find((l) => l.id === id);
const isMoney = (id) => { const l = listOf(id); return !!(l && l.kind === "money"); };
function greeting() {
  const hr = new Date().getHours();
  const g = hr < 12 ? "صباح الخير" : hr < 17 ? "نهارك سعيد" : hr < 22 ? "مساء الخير" : "ليلة سعيدة";
  return g + " يا " + NAME;
}
function dayOfYear() { const n = new Date(), s = new Date(n.getFullYear(), 0, 0); return Math.floor((n - s) / 864e5); }
function wisdom(shift) { return WISDOM[(dayOfYear() + (shift || 0)) % WISDOM.length]; }

/* ---------------- data model: what is "required today" ---------------- */
const kidsOf = (id) => S.tasks.filter((t) => t.parentId === id);
function groups() {
  const end = endToday();
  const wanted = (t) => t.due && t.due <= end;
  const out = [];
  S.tasks.filter((t) => !t.parentId && !isMoney(t.listId)).forEach((t) => {
    const kids = kidsOf(t.id).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const need = !t.done && (wanted(t) || kids.some((k) => !k.done && wanted(k)));
    if (!need && !S.fading.has(t.id)) return;
    const dues = [t.due, ...kids.filter((k) => !k.done).map((k) => k.due)].filter((x) => x && x <= end);
    out.push({ t, kids, key: dues.length ? Math.min(...dues) : Infinity });
  });
  return out.sort((a, b) => a.key - b.key);
}
function toggleDone(t) {
  const now = Date.now(), ups = [{ id: t.id, p: { done: true, doneAt: now } }];
  kidsOf(t.id).filter((k) => !k.done).forEach((k) => ups.push({ id: k.id, p: { done: true, doneAt: now } }));
  if (t.parentId) {
    const p = S.tasks.find((x) => x.id === t.parentId);
    if (p && !p.done && !S.tasks.some((x) => x.parentId === p.id && x.id !== t.id && !x.done)) ups.push({ id: p.id, p: { done: true, doneAt: now } });
  }
  backend.batch(ups);
  return ups;
}

/* ---------------- backend (Firebase or demo) ---------------- */
function demoBackend() {
  const now = Date.now(), d0 = dayStart(now), at = (h, m) => d0 + h * 36e5 + (m || 0) * 6e4;
  let lists = [{ id: "l1", name: "المحل", color: "#2447c9", order: 1 }, { id: "l2", name: "شغل أبو فهد", color: "#d8334f", order: 2 }, { id: "l3", name: "ورقة حساب", color: "#1f9d6b", order: 3, kind: "money" }];
  let tasks = [
    { id: "a", listId: "l1", text: "طباعة 500 كارت لمدرسة الصفوة", done: false, createdAt: 1, due: at(11, 30) },
    { id: "a1", listId: "l1", parentId: "a", text: "تصميم", done: true, createdAt: 2 },
    { id: "a2", listId: "l1", parentId: "a", text: "طباعة", done: false, createdAt: 3 },
    { id: "a3", listId: "l1", parentId: "a", text: "تقفيل وتغليف", done: false, createdAt: 4 },
    { id: "b", listId: "l2", text: "مراجعة تقرير الإعلانات وإرساله", done: false, createdAt: 5, due: at(16, 0) },
    { id: "c", listId: "l1", text: "مشوار مدرسة ناصر لرفع المقاسات (ماتنساش المتر)", done: false, createdAt: 6, due: at(9, 0) - 864e5 },
    { id: "d", listId: "l1", text: "مهمة من غير ميعاد", done: false, createdAt: 7 },
    { id: "m1", listId: "l3", text: "ورق 350", done: false, createdAt: 8, due: at(10, 0), amount: 350 }
  ];
  let cb = null, authCb = null;
  const push = () => cb && cb({ lists: lists.map((x) => ({ ...x })), tasks: tasks.map((x) => ({ ...x })), fromCache: false });
  return {
    onAuth(f) { authCb = f; setTimeout(() => f({ uid: "demo", email: "demo@example.com" }), 50); },
    async signIn() {}, async signOut() { authCb && authCb(null); },
    subscribe(_uid, f) { cb = f; setTimeout(push, 80); return () => { cb = null; }; },
    batch(ups) { ups.forEach((u) => { const t = tasks.find((x) => x.id === u.id); if (t) Object.assign(t, u.p); }); setTimeout(push, 40); }
  };
}
function fbBackend() {
  const app = initializeApp(CFG), auth = getAuth(app);
  const db = initializeFirestore(app, { localCache: persistentLocalCache() });
  let uid = null;
  return {
    onAuth(f) { onAuthStateChanged(auth, (u) => { uid = u ? u.uid : null; f(u ? { uid: u.uid, email: u.email } : null); }); },
    signIn: (e, p) => signInWithEmailAndPassword(auth, e, p), signOut: () => signOut(auth),
    subscribe(u, f) {
      const got = {}, data = { lists: [], tasks: [], fromCache: false };
      const un = ["lists", "tasks"].map((k) => onSnapshot(collection(db, "users", u, k), { includeMetadataChanges: true }, (snap) => {
        data[k] = snap.docs.map((d) => ({ ...d.data(), id: d.id })); got[k] = true; data.fromCache = snap.metadata.fromCache;
        if (got.lists && got.tasks) f({ lists: data.lists, tasks: data.tasks, fromCache: data.fromCache });
      }, () => { data.fromCache = true; }));
      return () => un.forEach((x) => x());
    },
    batch(ups) {
      const b = writeBatch(db);
      ups.forEach((u) => b.update(doc(db, "users", uid, "tasks", u.id), u.p));
      b.commit().catch(() => {});
    }
  };
}
const backend = DEMO ? demoBackend() : fbBackend();
let unsub = null;

/* ---------------- rendering ---------------- */
function render() {
  const keepScroll = $app.querySelector(".list") ? $app.querySelector(".list").scrollTop : 0;
  $app.textContent = "";
  const card = h("div", { class: "card" });
  $app.append(card);
  if (!S.user) { card.append(topBar(false), loginView()); return; }
  const gs = groups();
  const left = gs.filter((g) => !g.t.done).length;
  card.append(topBar(true));
  const w = h("div", { class: "quote nodrag", title: "دوس لحكمة تانية", onclick: () => { S.wisdomShift++; render(); } },
    h("div", { class: "q", text: "“" + wisdom(S.wisdomShift) + "”" }), h("small", { text: "حكمة اليوم" }));
  card.append(w);
  card.append(h("div", { class: "sec" }, h("h2", { text: "مطلوب النهارده" }), h("span", { class: "badge" + (left ? "" : " zero"), text: String(left) })));
  const list = h("div", { class: "list nodrag" });
  if (!S.ready) list.append(h("div", { class: "empty", text: "بحمّل مهامك…" }));
  else if (!gs.length) list.append(h("div", { class: "empty" }, h("div", { class: "big", text: "خلّصت كل حاجة النهارده" }), h("div", { text: "استمتع بوقتك، أو افتح النوتة وضيف مهام جديدة." })));
  else gs.forEach((g) => list.append(taskEl(g)));
  card.append(list);
  card.append(h("div", { class: "foot nodrag" },
    h("div", { class: "sync" }, h("span", { class: "led" + (S.fromCache || !navigator.onLine ? " off" : "") }), h("span", { text: S.fromCache || !navigator.onLine ? "من غير نت (محفوظ على الجهاز)" : "متزامن" })),
    h("button", { class: "link", text: "فتح النوتة", onclick: () => API.openExternal(WEB_URL) })));
  if (S.panel) card.append(panelView());
  list.scrollTop = keepScroll;
}
function topBar(authed) {
  return h("div", { class: "top drag" },
    h("div", { class: "hello" }, h("h1", { text: authed ? greeting() : "النوتة" }),
      h("p", { text: new Date().toLocaleDateString("ar-EG-u-nu-latn", { weekday: "long", day: "numeric", month: "long" }) })),
    authed ? h("button", { class: "ibtn nodrag", title: "الإعدادات", html: ICON.gear, onclick: () => { S.panel = !S.panel; render(); } }) : null,
    h("button", { class: "ibtn nodrag", title: "إخفاء الويدجت (يفضل شغال جنب الساعة)", html: ICON.x, onclick: () => API.hide() }));
}
function chkBtn(t, onDone) {
  return h("button", { class: "chk" + (t.done ? " on" : ""), "aria-label": "خلصت", html: ICON.check, onclick: (e) => { e.stopPropagation(); onDone(e.currentTarget); } });
}
function taskEl(g) {
  const { t, kids } = g, l = listOf(t.listId), end = endToday(), now = Date.now();
  const el = h("div", { class: "task" + (S.expanded.has(t.id) ? " open" : "") + (t.done ? " done" : ""), "data-id": t.id });
  const meta = h("div", { class: "meta" });
  if (t.due && t.due <= end) {
    const late = t.due < dayStart(now), pass = t.due < now;
    meta.append(h("span", { class: "chip " + (pass ? "late" : "time"), text: late ? "متأخر · " + dm(t.due) + " " + tm(t.due) : pass ? "فات · " + tm(t.due) : tm(t.due) }));
  }
  if (l) meta.append(h("span", { class: "chip" }, h("i", { class: "dot", style: "background:" + (l.color || "#2447c9") }), l.name));
  const row = h("div", { class: "row" },
    chkBtn(t, (btn) => finish(el, t)),
    h("div", { class: "txt" }, h("div", { class: "t", text: t.text }), meta),
    kids.length ? h("button", { class: "exp", title: "النقط الفرعية", onclick: () => { const o = el.classList.toggle("open"); o ? S.expanded.add(t.id) : S.expanded.delete(t.id); } },
      h("span", { text: kids.filter((k) => k.done).length + "/" + kids.length }), h("span", { html: ICON.chev, style: "display:flex" })) : null);
  el.append(row);
  if (kids.length) {
    const inner = h("div", { class: "inner" });
    kids.forEach((k) => {
      const kel = h("div", { class: "sub" + (k.done ? " done" : "") });
      kel.append(chkBtn(k, () => { kel.classList.add("done"); kel.querySelector(".chk").classList.add("on"); toggleDone(k); }),
        h("div", { class: "t", text: k.text }));
      if (k.due) kel.append(h("span", { class: "chip " + (k.due < now && !k.done ? "late" : "time"), text: tm(k.due) }));
      inner.append(kel);
    });
    el.append(h("div", { class: "subs" }, h("div", {}, inner)));
    row.addEventListener("click", (e) => { if (!e.target.closest(".chk,.exp")) { const o = el.classList.toggle("open"); o ? S.expanded.add(t.id) : S.expanded.delete(t.id); } });
  }
  return el;
}
function finish(el, t) {
  el.classList.add("done");
  S.fading.add(t.id);
  toggleDone(t);
  setTimeout(() => el.classList.add("gone"), 650);
  setTimeout(() => { S.fading.delete(t.id); S.expanded.delete(t.id); el.remove(); updateBadge(); }, 1200);
}
function updateBadge() {
  const left = groups().filter((g) => !g.t.done).length, b = document.querySelector(".badge");
  if (b) { b.textContent = String(left); b.classList.toggle("zero", !left); }
  if (!left && S.ready && !document.querySelector(".task")) render();
}
function loginView() {
  const email = h("input", { type: "email", placeholder: "الإيميل", value: localStorage.getItem("nota.email") || "", autocomplete: "email" });
  const pass = h("input", { type: "password", placeholder: "الباسورد", autocomplete: "current-password" });
  const err = h("div", { class: "err", text: S.loginErr });
  const go = async () => {
    err.textContent = ""; if (!email.value || !pass.value) { err.textContent = "اكتب الإيميل والباسورد."; return; }
    try { localStorage.setItem("nota.email", email.value.trim()); await backend.signIn(email.value.trim(), pass.value); }
    catch (e) { const c = (e && e.code) || ""; err.textContent = /invalid|wrong|not-found/.test(c) ? "الإيميل أو الباسورد غلط." : /network/.test(c) ? "مفيش نت." : "ماشتغلش: " + c; }
  };
  pass.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  return h("div", { class: "login nodrag" }, h("h2", { text: "سجّل دخول" }),
    h("p", { text: "بنفس إيميل وباسورد النوتة اللي على الموبايل، عشان مهامك تظهر هنا." }), email, pass, err,
    h("button", { class: "btn main", text: "دخول", onclick: go }));
}
function panelView() {
  const sw = (key) => h("button", { class: "sw" + (S.settings[key] ? " on" : ""), onclick: async () => { S.settings[key] = !S.settings[key]; await API.setSetting(key, S.settings[key]); render(); } });
  const hours = [0, 6, 7, 8, 9, 10, 12, 18, 21], lab = (x) => x === 0 ? "من غير ملخص" : x < 12 ? x + " الصبح" : x === 12 ? "12 الضهر" : (x - 12) + (x < 21 ? " المغرب" : " بالليل");
  const sel = h("select", { onchange: async (e) => { S.settings.summaryHour = +e.target.value; await API.setSetting("summaryHour", +e.target.value); scheduleAll(); } },
    hours.map((x) => h("option", { value: x, text: lab(x), selected: x === S.settings.summaryHour })));
  return h("div", { class: "panel nodrag" }, h("h3", { text: "الإعدادات" }),
    h("div", { class: "opt" }, h("span", { text: "يفتح مع تشغيل الويندوز" }), sw("autostart")),
    h("div", { class: "opt" }, h("span", { text: "إشعارات المواعيد" }), sw("notifications")),
    h("div", { class: "opt" }, h("span", { text: "ثبّت الويدجت فوق النوافذ" }), sw("pinned")),
    h("div", { class: "opt" }, h("span", { text: "ملخص اليوم (إشعار)" }), sel),
    h("button", { class: "btn", text: "إخفاء الويدجت (الإشعارات تفضل شغالة)", onclick: () => { S.panel = false; render(); API.hide(); } }),
    h("button", { class: "btn", text: "تسجيل خروج", onclick: async () => { S.panel = false; await backend.signOut(); } }),
    h("button", { class: "btn danger", text: "إغلاق البرنامج بالكامل", onclick: () => API.quit() }),
    h("button", { class: "btn main", text: "تمام", onclick: () => { S.panel = false; render(); } }));
}

/* ---------------- notifications (plain toasts, no alarm) ---------------- */
let timers = [];
const fired = (() => { try { return JSON.parse(localStorage.getItem("nota.fired") || "{}"); } catch (e) { return {}; } })();
const markFired = (k) => { fired[k] = Date.now(); const ks = Object.keys(fired); if (ks.length > 300) ks.sort((a, b) => fired[a] - fired[b]).slice(0, 150).forEach((x) => delete fired[x]); localStorage.setItem("nota.fired", JSON.stringify(fired)); };
const fmtLead = (m) => m < 60 ? m + " دقيقة" : m === 60 ? "ساعة" : m === 120 ? "ساعتين" : m === 1440 ? "يوم" : (m / 60) + " ساعة";
let startupDone = false;
function events() {
  const out = [];
  S.tasks.forEach((t) => {
    if (t.done || !t.due || isMoney(t.listId)) return;
    out.push({ t, at: t.due, lead: 0 });
    if (typeof t.lead === "number" && t.lead > 0) out.push({ t, at: t.due - t.lead * 6e4, lead: t.lead });
  });
  return out;
}
function fireEvent(e) {
  const k = e.t.id + "@" + e.at; if (fired[k]) return; markFired(k);
  const l = listOf(e.t.listId);
  API.notify(e.lead ? { title: "تذكير بعد " + fmtLead(e.lead), body: e.t.text + (l ? "\n" + l.name : "") } : { title: "ميعاد دلوقتي", body: e.t.text + (l ? "\n" + l.name : "") });
}
function scheduleAll() {
  timers.forEach(clearTimeout); timers = [];
  if (!S.ready) return;
  const now = Date.now(), evs = events();
  if (!startupDone) {
    startupDone = true;
    const missed = evs.filter((e) => e.at <= now && e.at > now - 6 * 36e5 && !fired[e.t.id + "@" + e.at]);
    missed.forEach((e) => markFired(e.t.id + "@" + e.at));
    if (missed.length === 1) API.notify({ title: "فاتك ميعاد", body: missed[0].t.text });
    else if (missed.length > 1) API.notify({ title: "فاتك " + missed.length + " مواعيد", body: missed.slice(0, 4).map((e) => "• " + e.t.text).join("\n") });
  }
  evs.filter((e) => e.at > now && e.at < now + 30 * 36e5).forEach((e) => timers.push(setTimeout(() => fireEvent(e), e.at - now)));
  // morning summary
  const H = S.settings.summaryHour;
  if (H > 0) {
    const today = new Date().toDateString(), at = dayStart(now) + H * 36e5;
    const sent = localStorage.getItem("nota.sumday") === today;
    if (!sent && now >= at && now < at + 4 * 36e5) sendSummary();
    else if (!sent && now < at) timers.push(setTimeout(sendSummary, at - now));
  }
}
function sendSummary() {
  const today = new Date().toDateString(); if (localStorage.getItem("nota.sumday") === today) return;
  localStorage.setItem("nota.sumday", today);
  const gs = groups().filter((g) => !g.t.done);
  const first = gs.slice(0, 4).map((g) => "• " + (g.t.due && g.t.due <= endToday() ? tm(g.t.due) + "  " : "") + g.t.text);
  const body = (gs.length ? "عندك " + gs.length + " أعمال النهارده:\n" + first.join("\n") + (gs.length > 4 ? "\nو " + (gs.length - 4) + " كمان" : "") : "مفيش مواعيد النهارده. يوم هادي.") + "\n\n" + wisdom(0);
  API.notify({ title: greeting(), body });
}

/* ---------------- boot ---------------- */
API.getSettings().then((s) => { Object.assign(S.settings, s); render(); scheduleAll(); });
API.onVisible(() => { render(); });
backend.onAuth((u) => {
  S.user = u; S.ready = false; S.tasks = []; S.lists = []; startupDone = false;
  if (unsub) { unsub(); unsub = null; }
  render();
  if (u) unsub = backend.subscribe(u.uid, (d) => { S.lists = d.lists; S.tasks = d.tasks; S.fromCache = d.fromCache; S.ready = true; if (!S.fading.size) render(); else updateBadge(); scheduleAll(); });
});
setInterval(() => { if (S.user && S.ready && !S.fading.size && !S.panel) render(); }, 60000);
setInterval(scheduleAll, 30 * 60000);
window.addEventListener("online", render); window.addEventListener("offline", render);
render();
