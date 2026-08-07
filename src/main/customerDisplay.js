import { BrowserWindow, screen } from "electron";
import path from "node:path";
import fs from "node:fs";
import { app } from "electron";

const BOUNDS_FILE = path.join(
  app.getPath("userData"),
  "customer-display-bounds.json"
);

let customerWindow = null;

const loadSavedBounds = () => {
  try {
    return JSON.parse(fs.readFileSync(BOUNDS_FILE, "utf-8"));
  } catch {
    return null;
  }
};

const saveBounds = () => {
  if (!customerWindow || customerWindow.isDestroyed()) return;
  try {
    fs.writeFileSync(BOUNDS_FILE, JSON.stringify(customerWindow.getBounds()));
  } catch (err) {
    console.error("Failed to save customer display bounds:", err);
  }
};

export function openCustomerDisplay() {
  if (customerWindow && !customerWindow.isDestroyed()) {
    customerWindow.focus();
    return customerWindow;
  }

  const saved = loadSavedBounds();
  // first-ever open: default to a second display if one exists, otherwise
  // just offset from the primary window so it isn't stacked exactly on top
  const displays = screen.getAllDisplays();
  const secondDisplay = displays.find(
    (d) => d.id !== screen.getPrimaryDisplay().id
  );
  const fallback = secondDisplay
    ? {
        x: secondDisplay.bounds.x + 40,
        y: secondDisplay.bounds.y + 40,
        width: 900,
        height: 600,
      }
    : { width: 900, height: 600 };

  customerWindow = new BrowserWindow({
    ...(saved || fallback),
    title: "Customer Display",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const isDev =
    !app.isPackaged &&
    typeof CUSTOMER_WINDOW_VITE_DEV_SERVER_URL !== "undefined";

  if (isDev) {
    customerWindow.loadURL(
      `${CUSTOMER_WINDOW_VITE_DEV_SERVER_URL}/customer_window.html`
    );
  } else {
    const rendererName =
      typeof CUSTOMER_WINDOW_VITE_NAME !== "undefined"
        ? CUSTOMER_WINDOW_VITE_NAME
        : "customer_window";
    customerWindow.loadFile(
      path.join(__dirname, `../renderer/${rendererName}/customer_window.html`)
    );
  }

  customerWindow.on("close", saveBounds);
  customerWindow.on("resize", saveBounds);
  customerWindow.on("move", saveBounds);
  customerWindow.on("closed", () => {
    customerWindow = null;
  });

  return customerWindow;
}

export function closeCustomerDisplay() {
  if (customerWindow && !customerWindow.isDestroyed()) {
    customerWindow.close();
  }
}

export function pushCartToCustomerDisplay(cartPayload) {
  if (customerWindow && !customerWindow.isDestroyed()) {
    customerWindow.webContents.send(
      "customer-display:cart-update",
      cartPayload
    );
  }
}

export function isCustomerDisplayOpen() {
  return !!(customerWindow && !customerWindow.isDestroyed());
}
