const { ipcMain } = require("electron");
import {
  openCustomerDisplay,
  closeCustomerDisplay,
  pushCartToCustomerDisplay,
  isCustomerDisplayOpen,
} from "../../main/customerDisplay";

export default function registerCustomerDisplayIPC() {
  ipcMain.handle("customer-display:open", () => {
    openCustomerDisplay();
    return { success: true };
  });

  ipcMain.handle("customer-display:close", () => {
    closeCustomerDisplay();
    return { success: true };
  });

  ipcMain.handle("customer-display:is-open", () => {
    return isCustomerDisplayOpen();
  });

  // the POS window pushes cart state through this - no response needed,
  // so `on` rather than `handle`
  ipcMain.on("customer-display:push-cart", (event, cartPayload) => {
    pushCartToCustomerDisplay(cartPayload);
  });
}
