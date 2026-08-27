const { app, BrowserWindow, shell, dialog, ipcMain, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const http = require('http');
const net = require('net');

// --- Encrypted settings store (safeStorage + a JSON file in userData) ---
const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');

function readStore() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function writeStore(obj) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(obj, null, 2));
}

function encrypt(value) {
  if (safeStorage.isEncryptionAvailable()) {
    return { v: 1, data: safeStorage.encryptString(value).toString('base64') };
  }
  // Fallback: no OS keyring available (e.g. some Linux setups). Still keep it
  // out of localStorage but warn it is not encrypted at rest.
  return { v: 0, data: Buffer.from(value, 'utf8').toString('base64') };
}

function decrypt(entry) {
  if (!entry) return null;
  if (entry.v === 1 && safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(Buffer.from(entry.data, 'base64'));
  }
  return Buffer.from(entry.data, 'base64').toString('utf8');
}

ipcMain.handle('secure:get', (_e, key) => {
  const store = readStore();
  return decrypt(store[key]) ?? null;
});
ipcMain.handle('secure:set', (_e, key, value) => {
  const store = readStore();
  store[key] = encrypt(value);
  writeStore(store);
});
ipcMain.handle('secure:delete', (_e, key) => {
  const store = readStore();
  delete store[key];
  writeStore(store);
});

const isDev = !app.isPackaged;
// Dev runs the Next CLI against the working tree. Packaged runs the standalone
// server bundled under resources/frontend (see `extraResources` in package.json).
const FRONTEND_DIR = isDev
  ? path.resolve(__dirname, '../frontend')
  : path.join(process.resourcesPath, 'frontend');

let serverProcess = null;

// Ask the OS for a free port instead of hardcoding one. A fixed port meant any
// other process already on it — a stale `next start`, a second copy of the app,
// an unrelated dev server — got adopted as our frontend, and the window then
// rendered someone else's page (or our own HTML with dead asset URLs, which is
// what made the app show up completely unstyled).
function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function startNextServer() {
  return new Promise(async (resolve, reject) => {
    let port;
    try {
      port = await findFreePort();
    } catch (err) {
      reject(err);
      return;
    }

    let cmd;
    let args;
    let env;
    let cwd;

    if (isDev) {
      // `next dev` so the window always shows the current web design even
      // before a production build exists.
      cmd = path.join(FRONTEND_DIR, 'node_modules', '.bin', 'next');
      args = ['dev', '-p', String(port)];
      env = process.env;
      cwd = FRONTEND_DIR;
    } else {
      // The standalone bundle ships its own minimal server.js. Run it with
      // Electron's own Node (ELECTRON_RUN_AS_NODE) so the app does not depend
      // on the user having Node installed. server.js reads PORT/HOSTNAME from
      // the environment — it takes no CLI flags.
      cmd = process.execPath;
      args = [path.join(FRONTEND_DIR, 'server.js')];
      env = {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        NODE_ENV: 'production',
        PORT: String(port),
        HOSTNAME: '127.0.0.1',
      };
      cwd = FRONTEND_DIR;
    }

    serverProcess = spawn(cmd, args, { cwd, env, stdio: 'inherit' });

    let settled = false;
    serverProcess.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });

    // If Next dies during startup, fail now rather than polling a dead port for
    // a full minute and then blaming the timeout.
    serverProcess.on('exit', (code) => {
      if (settled) return;
      settled = true;
      reject(new Error(`The Palius frontend server exited (code ${code}) before it was ready.`));
    });

    waitForServer(port, () => {
      if (settled) return;
      settled = true;
      resolve(port);
    }, reject);
  });
}

function waitForServer(port, done, fail) {
  const start = Date.now();
  const tryConnect = () => {
    const req = http.get(`http://127.0.0.1:${port}`, (res) => {
      res.destroy();
      done();
    });
    req.on('error', () => {
      if (Date.now() - start > 60000) {
        fail(new Error('The Palius frontend server did not start in time.'));
        return;
      }
      setTimeout(tryConnect, 500);
    });
  };
  tryConnect();
}

function createWindow(url) {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#08080b',
    title: 'Palius',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.loadURL(url);
  win.once('ready-to-show', () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(async () => {
  let url;
  if (process.env.ELECTRON_START_URL) {
    // Explicit override: the caller is pointing us at a server they manage.
    url = process.env.ELECTRON_START_URL;
  } else {
    try {
      const port = await startNextServer();
      url = `http://127.0.0.1:${port}`;
    } catch (err) {
      dialog.showErrorBox('Failed to start', String(err && err.message ? err.message : err));
      app.quit();
      return;
    }
  }
  createWindow(url);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(url);
  });
});

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (serverProcess) serverProcess.kill();
});
