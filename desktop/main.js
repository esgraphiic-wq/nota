const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, screen, shell, nativeImage } = require("electron");
const path = require("path"), fs = require("fs"), http = require("http");

const DEFAULTS = { autostart: true, notifications: true, summaryHour: 9, pinned: true, widget: "show", bubble: null };
const B = 72, PAD = 4, PANEL_W = 392, GAP = 6;
let win = null, appWin = null, tray = null, settings = { ...DEFAULTS }, quitting = false, port = 0;
let taskCount = -1, expanded = false, side = "left", bubbleOff = { x: PAD, y: PAD }, dragStart = null;

if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.setAppUserModelId("com.islamgraphic.nota.desktop");
  const file = () => path.join(app.getPath("userData"), "settings.json");
  const loadSettings = () => { try { settings = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file(), "utf8")) }; } catch (e) {} };
  const saveSettings = () => { try { fs.writeFileSync(file(), JSON.stringify(settings)); } catch (e) {} };
  const applyAutostart = () => { if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: !!settings.autostart, args: ["--autostart"] }); };

  // Local server on a fixed port: one stable origin, so the Firebase login is shared by the bubble and the notes window.
  function serve() {
    const root = path.join(__dirname, "dist");
    const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".png": "image/png", ".json": "application/json" };
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent((req.url || "/").split("?")[0]);
      if (p === "/") p = "/index.html";
      const f = path.normalize(path.join(root, p));
      if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
      fs.readFile(f, (err, buf) => {
        if (err) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" });
        res.end(buf);
      });
    });
    return new Promise((resolve, reject) => {
      let p = 47831;
      const tryListen = () => {
        srv.once("error", (e) => { if (e.code === "EADDRINUSE" && p < 47845) { p++; tryListen(); } else reject(e); });
        srv.listen(p, "127.0.0.1", () => resolve(p));
      };
      tryListen();
    });
  }

  /* ---------- bubble geometry ---------- */
  const workArea = (pt) => screen.getDisplayNearestPoint(pt).workArea;
  const clamp = (v, a, b) => Math.max(a, Math.min(v, b));
  function bubblePos() {
    const p = settings.bubble;
    if (p && screen.getAllDisplays().some((d) => p.x >= d.bounds.x - 10 && p.x < d.bounds.x + d.bounds.width - 20 && p.y >= d.bounds.y - 10 && p.y < d.bounds.y + d.bounds.height - 20)) return p;
    const wa = screen.getPrimaryDisplay().workArea;
    return { x: wa.x + wa.width - B - 24, y: wa.y + Math.round(wa.height * 0.3) };
  }
  function layout(isExpanded) {
    const bp = bubblePos(), wa = workArea({ x: bp.x, y: bp.y });
    expanded = isExpanded;
    if (!expanded) {
      bubbleOff = { x: PAD, y: PAD };
      return { x: bp.x - PAD, y: bp.y - PAD, width: B + 2 * PAD, height: B + 2 * PAD };
    }
    const ph = Math.min(640, wa.height - 16), width = PANEL_W + GAP + B + 2 * PAD;
    side = bp.x + B / 2 > wa.x + wa.width / 2 ? "left" : "right";
    // keep the bubble where it is; slide the window vertically only if the panel would not fit
    const y = clamp(bp.y - PAD, wa.y + 8, wa.y + wa.height - ph - 8);
    const x = side === "left" ? bp.x + B + PAD - width : bp.x - PAD;
    bubbleOff = { x: bp.x - x, y: bp.y - y };
    return { x, y, width, height: ph };
  }
  function applyShape(bb) {
    if (!win || typeof win.setShape !== "function") return;
    try {
      const w = bb ? bb.width : win.getSize()[0], h = bb ? bb.height : win.getSize()[1];
      if (!expanded) return win.setShape([{ x: 0, y: 0, width: w, height: h }]);
      const bx = bubbleOff.x - PAD, by = bubbleOff.y - PAD, pw = w - (B + 2 * PAD) - GAP;
      win.setShape([{ x: bx, y: by, width: B + 2 * PAD, height: B + 2 * PAD }, { x: side === "left" ? 0 : w - pw, y: 0, width: pw, height: h }]);
    } catch (e) {}
  }
  function sendLayout() { if (win && !win.isDestroyed()) win.webContents.send("layout", { expanded, side, bubbleTop: bubbleOff.y, bubbleLeft: bubbleOff.x }); }
  let applying = false;
  function setExpanded(v) {
    if (!win) return;
    const b = layout(v);
    win.setResizable(true);
    win.setBounds(b);
    win.setResizable(false);
    applyShape(b);
    sendLayout();
    setTimeout(() => {
      if (!win || win.isDestroyed()) return;
      const a = win.getBounds();
      if (Math.abs(a.width - b.width) > 2 || Math.abs(a.height - b.height) > 2) { win.setResizable(true); win.setBounds(b); win.setResizable(false); }
      applyShape(b); sendLayout();
    }, 120);
  }

  function createWindow() {
    const b = layout(false);
    win = new BrowserWindow({
      ...b, show: false, frame: false, transparent: true, hasShadow: false, resizable: false, maximizable: false, minimizable: false, fullscreenable: false,
      skipTaskbar: true, alwaysOnTop: !!settings.pinned, focusable: true, backgroundColor: "#00000000", title: "النوتة",
      webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false }
    });
    if (settings.pinned) win.setAlwaysOnTop(true, "floating");
    win.loadURL(`http://127.0.0.1:${port}/index.html`);
    win.webContents.on("did-finish-load", () => { applyShape(); sendLayout(); });
    win.once("ready-to-show", () => applyWidget());
    win.on("close", (e) => { if (!quitting) { e.preventDefault(); win.hide(); } });
    win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: "deny" }; });
  }

  function setWidget(m) { settings.widget = m; saveSettings(); applyWidget(); }
  function applyWidget() {
    if (!win || win.isDestroyed()) return;
    const want = settings.widget === "show" || (settings.widget === "tasks" && taskCount !== 0);
    if (want && !win.isVisible()) win.showInactive();
    if (!want) { if (expanded) setExpanded(false); if (win.isVisible()) win.hide(); }
  }
  function showBubble(openPanel) {
    if (!win) return;
    if (!win.isVisible()) win.show();
    if (openPanel && !expanded) setExpanded(true);
  }

  /* ---------- the notes app, as a real window (not a browser tab) ---------- */
  function openNotes() {
    if (appWin && !appWin.isDestroyed()) { if (appWin.isMinimized()) appWin.restore(); appWin.show(); appWin.focus(); return; }
    appWin = new BrowserWindow({
      width: Math.min(1500, screen.getPrimaryDisplay().workArea.width - 40), height: screen.getPrimaryDisplay().workArea.height - 40, minWidth: 380, minHeight: 520, title: "النوتة", backgroundColor: "#f6f8fc",
      icon: path.join(__dirname, "build", "icon.png"), autoHideMenuBar: true,
      webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true }
    });
    appWin.setMenuBarVisibility(false);
    appWin.loadURL(`http://127.0.0.1:${port}/app.html`);
    appWin.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: "deny" }; });
    appWin.on("closed", () => { appWin = null; });
  }

  function trayMenu() {
    return Menu.buildFromTemplate([
      { label: "الودجت (الفقاعة)", submenu: [
        { label: "يظهر دايماً", type: "radio", checked: settings.widget === "show", click: () => setWidget("show") },
        { label: "يظهر لما يبقى فيه مهام النهارده", type: "radio", checked: settings.widget === "tasks", click: () => setWidget("tasks") },
        { label: "مخفي", type: "radio", checked: settings.widget === "hide", click: () => setWidget("hide") }
      ] },
      { label: "عرض مهام اليوم", click: () => showBubble(true) },
      { label: "فتح النوتة", click: openNotes },
      { type: "separator" },
      { label: "التشغيل مع الويندوز", type: "checkbox", checked: !!settings.autostart, click: (i) => { settings.autostart = i.checked; saveSettings(); applyAutostart(); } },
      { label: "إشعارات المواعيد", type: "checkbox", checked: !!settings.notifications, click: (i) => { settings.notifications = i.checked; saveSettings(); } },
      { type: "separator" },
      { label: "خروج (يقفل الإشعارات كمان)", click: () => { quitting = true; app.quit(); } }
    ]);
  }
  function buildTray() {
    const img = nativeImage.createFromPath(path.join(__dirname, "build", "icon.png")).resize({ width: 32, height: 32 });
    tray = new Tray(img);
    tray.setToolTip("النوتة");
    tray.on("click", () => openNotes());
    tray.on("right-click", () => tray.popUpContextMenu(trayMenu()));
  }

  app.on("second-instance", () => openNotes());
  app.whenReady().then(async () => {
    loadSettings();
    applyAutostart();
    try { port = await serve(); } catch (e) { app.quit(); return; }
    createWindow();
    buildTray();
    if (!process.argv.includes("--autostart")) openNotes();
  });
  app.on("before-quit", () => { quitting = true; });
  app.on("window-all-closed", () => {});

  /* ---------- IPC ---------- */
  ipcMain.on("notify", (_e, n) => {
    if (!settings.notifications || !Notification.isSupported()) return;
    const x = new Notification({ title: String(n.title || "النوتة"), body: String(n.body || ""), silent: false });
    x.on("click", () => { if (settings.widget === "hide") openNotes(); else showBubble(true); });
    x.show();
  });
  let lastToggle = 0;
  ipcMain.on("toggle", () => { const n = Date.now(); if (n - lastToggle < 250) return; lastToggle = n; setExpanded(!expanded); });
  ipcMain.on("set-expanded", (_e, v) => setExpanded(!!v));
  ipcMain.on("drag-start", () => { if (win) dragStart = { b: win.getBounds() }; });
  ipcMain.on("drag-move", (_e, dx, dy) => {
    if (!win || !dragStart) return;
    let x = Math.round(dragStart.b.x + dx), y = Math.round(dragStart.b.y + dy);
    // keep the bubble itself on a screen
    const bx = x + bubbleOff.x, by = y + bubbleOff.y, wa = workArea({ x: bx, y: by });
    x += clamp(bx, wa.x, wa.x + wa.width - B) - bx;
    y += clamp(by, wa.y, wa.y + wa.height - B) - by;
    win.setPosition(x, y);
    settings.bubble = { x: x + bubbleOff.x, y: y + bubbleOff.y };
    clearTimeout(win._t); win._t = setTimeout(saveSettings, 400);
  });
  ipcMain.on("bubble-menu", () => { if (win) trayMenu().popup({ window: win }); });
  ipcMain.on("hide-bubble", () => setWidget("hide"));
  ipcMain.on("task-count", (_e, n) => { taskCount = +n || 0; if (settings.widget === "tasks") applyWidget(); });
  ipcMain.on("quit", () => { quitting = true; app.quit(); });
  ipcMain.on("open-app", openNotes);
  ipcMain.handle("get-settings", () => ({ autostart: settings.autostart, notifications: settings.notifications, summaryHour: settings.summaryHour, pinned: settings.pinned, widget: settings.widget }));
  ipcMain.handle("set-setting", (_e, k, v) => {
    if (!["autostart", "notifications", "summaryHour", "pinned", "widget"].includes(k)) return;
    settings[k] = v; saveSettings();
    if (k === "autostart") applyAutostart();
    if (k === "widget") applyWidget();
    if (k === "pinned" && win) win.setAlwaysOnTop(!!v, "floating");
    return true;
  });
}
