// Bloom desktop shell. Loads the built app from disk; all data comes from
// Supabase over HTTPS, read-only. The window has no Node access.
const { app, BrowserWindow, Menu, shell, nativeTheme } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const DEV_URL = process.env.BLOOM_DEV_URL // e.g. http://localhost:5180 while developing
const STATE_FILE = () => path.join(app.getPath('userData'), 'window-state.json')

app.setAppUserModelId('com.blossom.bloom')
nativeTheme.themeSource = 'light'

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) { if (win.isMinimized()) win.restore(); win.focus() }
  })
  app.whenReady().then(createWindow)
}

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE(), 'utf8')) } catch { return { width: 1440, height: 920, maximized: true } }
}

function saveState(win) {
  try {
    const maximized = win.isMaximized()
    const bounds = maximized ? readState() : win.getBounds()
    fs.writeFileSync(STATE_FILE(), JSON.stringify({ ...bounds, maximized }))
  } catch { /* not important */ }
}

const isExternal = (url) => /^(https?:|mailto:|tel:)/i.test(url) && !(DEV_URL && url.startsWith(DEV_URL))

function createWindow() {
  const state = readState()
  const win = new BrowserWindow({
    x: state.x, y: state.y, width: state.width || 1440, height: state.height || 920,
    minWidth: 1100, minHeight: 700,
    show: false,
    title: 'Bloom',
    backgroundColor: '#fbf7f3',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#fbf7f3', symbolColor: '#462c7d', height: 56 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  })

  if (state.maximized) win.maximize()
  win.once('ready-to-show', () => win.show())
  win.on('close', () => saveState(win))

  // Links (phone numbers, websites) open outside Bloom; Bloom never navigates away.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternal(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    const ok = DEV_URL ? url.startsWith(DEV_URL) : url.startsWith('file://')
    if (!ok) {
      event.preventDefault()
      if (isExternal(url)) shell.openExternal(url)
    }
  })

  if (DEV_URL) win.loadURL(DEV_URL)
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'View',
      submenu: [
        { role: 'reload', label: 'Reload' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { role: 'togglefullscreen' },
        ...(DEV_URL ? [{ role: 'toggleDevTools' }] : []),
      ],
    },
  ]))
  win.setMenuBarVisibility(false)
}

app.on('window-all-closed', () => app.quit())
