export const SYSTEM_ERROR_MESSAGE = "A művelet technikai hiba miatt nem hajtható végre. Kérjük, próbálja meg később. Ha a hiba továbbra is fennáll, vegye fel a kapcsolatot az üzemeltetővel: zoltan.nyiri02@gmail.com";
export const NETWORK_ERROR_MESSAGE = "Nem sikerült kapcsolatot létesíteni a szerverrel. Kérjük, ellenőrizze a hálózati kapcsolatot, majd próbálja újra. Ha a hiba továbbra is fennáll, vegye fel a kapcsolatot az üzemeltetővel: zoltan.nyiri02@gmail.com";

const listeners = new Set();

export function subscribeToNotifications(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function showNotification(notification) {
  listeners.forEach((listener) => listener(notification));
}

export function getApiErrorNotification(error) {
  const status = error.response?.status;
  const code = error.response?.data?.code;
  if (!error.response) return { severity: "error", title: "Kapcsolati hiba", message: NETWORK_ERROR_MESSAGE };
  if (status === 401) return { severity: "error", title: "Munkamenet lejárt", message: "A munkamenet lejárt. Kérjük, jelentkezzen be újra." };
  if (status === 403 && code === "PERMISSION_DENIED") return { severity: "error", title: "Nincs jogosultság", message: "Nincs jogosultsága a művelet végrehajtásához." };
  if (status === 403 && code === "MODULE_DISABLED") return { severity: "warning", title: "A modul nem érhető el", message: "Ez a modul nincs engedélyezve a szervezet számára." };
  if (status >= 500) return { severity: "error", title: "Rendszerhiba", message: SYSTEM_ERROR_MESSAGE };
  return null;
}

export function notifyApiError(error) {
  if (error._globalToastShown) return;
  const notification = getApiErrorNotification(error);
  if (!notification) return;
  error._globalToastShown = true;
  showNotification(notification);
}
