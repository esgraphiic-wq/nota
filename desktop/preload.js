const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("nota", {
  isDesktop: true,
  notify: (n) => ipcRenderer.send("notify", n),
  toggle: () => ipcRenderer.send("toggle"),
  setExpanded: (v) => ipcRenderer.send("set-expanded", !!v),
  dragStart: () => ipcRenderer.send("drag-start"),
  dragMove: (dx, dy) => ipcRenderer.send("drag-move", dx, dy),
  bubbleMenu: () => ipcRenderer.send("bubble-menu"),
  taskCount: (n) => ipcRenderer.send("task-count", n),
  hideBubble: () => ipcRenderer.send("hide-bubble"),
  quit: () => ipcRenderer.send("quit"),
  openApp: () => ipcRenderer.send("open-app"),
  getSettings: () => ipcRenderer.invoke("get-settings"),
  setSetting: (k, v) => ipcRenderer.invoke("set-setting", k, v),
  onLayout: (cb) => ipcRenderer.on("layout", (_e, l) => cb(l))
});
