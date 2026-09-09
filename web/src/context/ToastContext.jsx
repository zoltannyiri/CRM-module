import { useCallback, useEffect, useMemo, useRef } from "react";
import { Toast } from "primereact/toast";

import { subscribeToNotifications } from "../services/notificationService.js";
import { ToastContext } from "./ToastContextDefinition.js";

const severityConfig = {
  success: { icon: "pi-check", accent: "text-[#4f7954]", background: "bg-[#eff7ef]", life: 3500 },
  error: { icon: "pi-times", accent: "text-[#9a4335]", background: "bg-[#fdf1ee]", life: 7500 },
  info: { icon: "pi-info", accent: "text-[#4e6f7b]", background: "bg-[#eef4f6]", life: 4500 },
  warning: { icon: "pi-exclamation-triangle", accent: "text-[#806b3e]", background: "bg-[#faf6ec]", life: 5000 },
};

export function ToastProvider({ children }) {
  const toastRef = useRef(null);

  const show = useCallback(({ severity = "info", title, message }) => {
    const config = severityConfig[severity] || severityConfig.info;
    toastRef.current?.show({
      severity,
      summary: title,
      detail: message,
      life: config.life,
      content: () => (
        <div className="flex w-full items-start gap-3 rounded-lg border border-[#dbe1df] bg-white p-4 text-[#253238] shadow-[0_10px_32px_rgba(24,39,43,.14)]">
          <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-full ${config.background} ${config.accent}`}>
            <i className={`pi ${config.icon} text-xs`} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold">{title}</p>
            <p className="mt-1 text-xs leading-relaxed text-[#657276]">{message}</p>
          </div>
        </div>
      ),
    });
  }, []);

  useEffect(() => subscribeToNotifications(show), [show]);

  const value = useMemo(() => ({
    showSuccess: (message, title = "Sikeres művelet") => show({ severity: "success", title, message }),
    showError: (message, title = "Hiba") => show({ severity: "error", title, message }),
    showInfo: (message, title = "Információ") => show({ severity: "info", title, message }),
    showWarning: (message, title = "Figyelmeztetés") => show({ severity: "warning", title, message }),
  }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toast ref={toastRef} position="bottom-right" unstyled pt={{ root: { className: "fixed right-5 bottom-5 z-[1000] flex w-[min(400px,calc(100vw-32px))] flex-col gap-2" }, message: { className: "w-full" } }} />
    </ToastContext.Provider>
  );
}
