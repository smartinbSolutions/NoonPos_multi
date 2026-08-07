import { BrowserWindow, ipcMain } from "electron";
import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";

let scalePort = null;
let scaleParser = null;
let scaleStatus = {
  connected: false,
  message: "disconnected",
  path: "",
  baudRate: 9600,
};
let lastWeight = 0;

const sendToRenderer = (channel, payload) => {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(channel, payload);
  });
};

const extractWeight = (text) => {
  const cleaned = String(text || "").replace(",", ".");
  const matches = cleaned.match(/[+-]?\d+(?:\.\d+)?/g);

  if (!matches?.length) return null;

  const parsed = Number(matches[matches.length - 1]);
  return Number.isFinite(parsed) ? Math.abs(parsed) : null;
};

const pickDefaultPort = (ports) =>
  ports.find((port) => {
    const label = [
      port.path,
      port.manufacturer,
      port.friendlyName,
      port.pnpId,
      port.vendorId,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return (
      label.includes("usb") ||
      label.includes("ftdi") ||
      label.includes("prolific") ||
      label.includes("ch340")
    );
  }) || ports[0];

const closeScalePort = () =>
  new Promise((resolve) => {
    if (!scalePort?.isOpen) {
      scaleParser = null;
      scalePort = null;
      scaleStatus = {
        ...scaleStatus,
        connected: false,
        message: "disconnected",
      };
      resolve();
      return;
    }

    scalePort.close(() => {
      scaleParser = null;
      scalePort = null;
      scaleStatus = {
        ...scaleStatus,
        connected: false,
        message: "disconnected",
      };
      resolve();
    });
  });

export default function registerSerialIPC() {
  ipcMain.handle("scale:list-ports", async () => SerialPort.list());

  ipcMain.handle("scale:get-status", async () => ({
    ...scaleStatus,
    weight: lastWeight,
  }));

  ipcMain.handle("scale:connect", async (_event, options = {}) => {
    if (scalePort?.isOpen) {
      return {
        ok: true,
        alreadyConnected: true,
        path: scaleStatus.path,
        baudRate: scaleStatus.baudRate,
      };
    }

    const ports = await SerialPort.list();
    const selectedPath = options.path || pickDefaultPort(ports)?.path;

    if (!selectedPath) {
      return { ok: false, message: "No serial ports found." };
    }

    const baudRate = Number(options.baudRate) || 9600;

    scalePort = new SerialPort({
      path: selectedPath,
      baudRate,
      autoOpen: false,
    });

    scaleParser = scalePort.pipe(new ReadlineParser({ delimiter: "\r\n" }));

    scaleParser.on("data", (line) => {
      const weight = extractWeight(line);

      if (weight === null) return;

      lastWeight = weight;

      sendToRenderer("scale:data", {
        weight,
        raw: line,
        path: selectedPath,
      });
    });

    scalePort.on("error", (error) => {
      scaleStatus = {
        connected: false,
        message: error.message,
        path: selectedPath,
        baudRate,
      };

      sendToRenderer("scale:status", scaleStatus);
    });

    scalePort.on("close", () => {
      scaleStatus = {
        connected: false,
        message: "disconnected",
        path: selectedPath,
        baudRate,
      };

      sendToRenderer("scale:status", scaleStatus);
    });

    await new Promise((resolve, reject) => {
      scalePort.open((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    scaleStatus = {
      connected: true,
      message: `Connected to ${selectedPath}`,
      path: selectedPath,
      baudRate,
    };

    sendToRenderer("scale:status", scaleStatus);

    return {
      ok: true,
      path: selectedPath,
      baudRate,
      ports,
    };
  });

  ipcMain.handle("scale:disconnect", async () => {
    await closeScalePort();
    lastWeight = 0;
    return { ok: true };
  });
}
