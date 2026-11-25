// Tells the page it runs in the desktop window (to leave room for the
// window buttons). Exposes nothing else.
const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('bloomDesktop', { platform: process.platform })
