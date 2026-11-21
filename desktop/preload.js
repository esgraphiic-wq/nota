const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("nota", {
  notify: (n) => ipcRenderer.send("notify", n),
  hide: () => ipcRenderer.send("hide"),
  quit: () => ipcRenderer.send("quit"),
  openExternal: (u) => ipcRenderer.send("open-external", u),
  getSettings: () => ipcRenderer.invoke("get-settings"),
  setSetting: (k, v) => ipcRenderer.invoke("set-setting", k, v),
  onVisible: (cb) => ipcRenderer.on("visible", () => cb())
});
