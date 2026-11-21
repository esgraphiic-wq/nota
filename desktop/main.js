const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, screen, shell, nativeImage } = require("electron");
const path = require("path"), fs = require("fs"), http = require("http");

const WEB_URL = "https://esgraphiic-wq.github.io/nota/";
const DEFAULTS = { autostart: true, notifications: true, summaryHour: 9, pinned: false, bounds: null };
let win = null, tray = null, settings = { ...DEFAULTS }, quitting = false, port = 0;

if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.setAppUserModelId("com.islamgraphic.nota.desktop");
  const file = () => path.join(app.getPath("userData"), "settings.json");
  const loadSettings = () => { try { settings = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file(), "utf8")) }; } catch (e) {} };
  const saveSettings = () => { try { fs.writeFileSync(file(), JSON.stringify(settings)); } catch (e) {} };
  const applyAutostart = () => { if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: !!settings.autostart, args: ["--autostart"] }); };

  // Tiny local server on a fixed port: keeps one stable origin (so the Firebase login survives restarts).
  function serve() {
    const root = path.join(__dirname, "dist");
    const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".png": "image/png" };
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

  function placeWindow() {
    const wa = screen.getPrimaryDisplay().workArea, w = 392, h = Math.min(660, wa.height - 32);
    const b = settings.bounds;
    if (b && screen.getAllDisplays().some((d) => b.x >= d.bounds.x && b.x < d.bounds.x + d.bounds.width - 60 && b.y >= d.bounds.y && b.y < d.bounds.y + d.bounds.height - 60)) return b;
    return { x: wa.x + wa.width - w - 16, y: wa.y + 16, width: w, height: h };
  }

  function createWindow() {
    const b = placeWindow();
    win = new BrowserWindow({
      ...b, minWidth: 340, minHeight: 420, show: false, frame: false, transparent: true, hasShadow: false,
      skipTaskbar: true, alwaysOnTop: !!settings.pinned, backgroundColor: "#00000000", title: "النوتة",
      webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false }
    });
    win.loadURL(`http://127.0.0.1:${port}/index.html`);
    win.once("ready-to-show", () => win.show());
    win.on("close", (e) => { if (!quitting) { e.preventDefault(); win.hide(); } });
    let t = null;
    const keep = () => { clearTimeout(t); t = setTimeout(() => { if (win && !win.isDestroyed()) { settings.bounds = win.getBounds(); saveSettings(); } }, 600); };
    win.on("move", keep); win.on("resize", keep);
    win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
  }

  function showWidget() {
    if (!win) return;
    win.show(); win.focus(); win.webContents.send("visible");
  }
  function toggleWidget() { if (win && win.isVisible()) win.hide(); else showWidget(); }

  function buildTray() {
    const img = nativeImage.createFromPath(path.join(__dirname, "build", "icon.png")).resize({ width: 32, height: 32 });
    tray = new Tray(img);
    tray.setToolTip("النوتة");
    const menu = () => Menu.buildFromTemplate([
      { label: "إظهار الويدجت", click: showWidget },
      { label: "فتح النوتة على الويب", click: () => shell.openExternal(WEB_URL) },
      { type: "separator" },
      { label: "التشغيل مع الويندوز", type: "checkbox", checked: !!settings.autostart, click: (i) => { settings.autostart = i.checked; saveSettings(); applyAutostart(); } },
      { label: "إشعارات المواعيد", type: "checkbox", checked: !!settings.notifications, click: (i) => { settings.notifications = i.checked; saveSettings(); } },
      { type: "separator" },
      { label: "خروج", click: () => { quitting = true; app.quit(); } }
    ]);
    tray.on("click", toggleWidget);
    tray.on("right-click", () => tray.popUpContextMenu(menu()));
  }

  app.on("second-instance", showWidget);
  app.whenReady().then(async () => {
    loadSettings();
    applyAutostart();
    try { port = await serve(); } catch (e) { app.quit(); return; }
    createWindow();
    buildTray();
  });
  app.on("before-quit", () => { quitting = true; });
  app.on("window-all-closed", (e) => e && e.preventDefault && e.preventDefault());

  ipcMain.on("notify", (_e, n) => {
    if (!settings.notifications || !Notification.isSupported()) return;
    const x = new Notification({ title: String(n.title || "النوتة"), body: String(n.body || ""), silent: false });
    x.on("click", showWidget);
    x.show();
  });
  ipcMain.on("hide", () => win && win.hide());
  ipcMain.on("quit", () => { quitting = true; app.quit(); });
  ipcMain.on("open-external", (_e, u) => { if (/^https:\/\//.test(u)) shell.openExternal(u); });
  ipcMain.handle("get-settings", () => ({ autostart: settings.autostart, notifications: settings.notifications, summaryHour: settings.summaryHour, pinned: settings.pinned }));
  ipcMain.handle("set-setting", (_e, k, v) => {
    if (!["autostart", "notifications", "summaryHour", "pinned"].includes(k)) return;
    settings[k] = v; saveSettings();
    if (k === "autostart") applyAutostart();
    if (k === "pinned" && win) win.setAlwaysOnTop(!!v);
    return true;
  });
}
