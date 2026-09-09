import { useMemo } from "react";

const entityLabels = {
  PARTNER: "Partner",
  CONTACT: "Kapcsolattartó",
  PROJECT: "Projekt",
  TASK: "Feladat",
};

const entityClasses = {
  PARTNER: "border-[#d0ded5] bg-[#edf4f0] text-[#3e684a]",
  CONTACT: "border-[#d8e2e6] bg-[#f0f4f7] text-[#446574]",
  PROJECT: "border-[#d4e4da] bg-[#eef7f1] text-[#3c6b45]",
  TASK: "border-[#e0dce8] bg-[#f4f1f9] text-[#5e4b77]",
};

const actionLabels = {
  CREATED: "Létrehozva",
  UPDATED: "Módosítva",
  DELETED: "Törölve",
  STATUS_CHANGED: "Státusz módosítva",
  ASSIGNED: "Felelős módosítva",
  PRIORITY_CHANGED: "Prioritás módosítva",
};

const actionClasses = {
  CREATED: "border-[#cfe3d1] bg-[#eff7ef] text-[#4d7853]",
  UPDATED: "border-[#d2dddb] bg-[#f1f6f5] text-[#465f5b]",
  DELETED: "border-[#ead6d1] bg-[#faf1ef] text-[#8a5b51]",
  STATUS_CHANGED: "border-[#e8ddc5] bg-[#faf6ec] text-[#816d40]",
  ASSIGNED: "border-[#dad6e8] bg-[#f5f3fa] text-[#5f518a]",
  PRIORITY_CHANGED: "border-[#eadcc5] bg-[#faf4ec] text-[#8a6a3b]",
};

const valueLabels = {
  // Task & Project statuses
  TODO: "Teendő",
  IN_PROGRESS: "Folyamatban",
  BLOCKED: "Blokkolt",
  DONE: "Kész",
  CANCELLED: "Megszakítva",
  PLANNED: "Tervezett",
  ACTIVE: "Aktív",
  ON_HOLD: "Szüneteltetve",
  COMPLETED: "Befejezve",
  // Priorities
  LOW: "Alacsony",
  MEDIUM: "Közepes",
  HIGH: "Magas",
  URGENT: "Sürgős",
  // Partner types
  COMPANY: "Cég",
  PERSON: "Magánszemély",
};

const fieldLabels = {
  name: "Név",
  title: "Cím",
  description: "Leírás",
  note: "Megjegyzés",
  email: "Email",
  phone: "Telefon",
  address: "Cím",
  website: "Weboldal",
  taxNumber: "Adószám",
  type: "Típus",
  status: "Státusz",
  priority: "Prioritás",
  startDate: "Kezdés",
  deadline: "Határidő",
  dueDate: "Határidő",
  partnerId: "Partner",
  projectId: "Projekt",
  assigneeMemberId: "Felelős",
  firstName: "Keresztnév",
  lastName: "Vezetéknév",
  position: "Beosztás",
};

function formatTime(dateString) {
  if (!dateString) return "";
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" });
}

function getDateGroupKey(dateString) {
  if (!dateString) return "Korábbi";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "Korábbi";

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const diffDays = Math.round((today - targetDate) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Ma";
  if (diffDays === 1) return "Tegnap";

  return new Intl.DateTimeFormat("hu-HU", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function renderMetadata(activity) {
  const { action, metadata } = activity;
  if (!metadata || typeof metadata !== "object") return null;

  if (action === "STATUS_CHANGED") {
    const oldVal = valueLabels[metadata.oldValue] || metadata.oldValue || "—";
    const newVal = valueLabels[metadata.newValue] || metadata.newValue || "—";
    return (
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-[#4b585c]">
        <span className="font-medium text-[#71807c]">Státuszváltás:</span>
        <span className="rounded bg-[#f0f3f2] px-2 py-0.5 font-medium text-[#3b474b]">{oldVal}</span>
        <i className="pi pi-arrow-right text-[10px] text-[#97a3a1]" aria-hidden="true" />
        <span className="rounded bg-[#eff6ee] px-2 py-0.5 font-semibold text-[#3b7045]">{newVal}</span>
      </div>
    );
  }

  if (action === "PRIORITY_CHANGED") {
    const oldVal = valueLabels[metadata.oldValue] || metadata.oldValue || "—";
    const newVal = valueLabels[metadata.newValue] || metadata.newValue || "—";
    return (
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-[#4b585c]">
        <span className="font-medium text-[#71807c]">Prioritás:</span>
        <span className="rounded bg-[#f0f3f2] px-2 py-0.5 font-medium text-[#3b474b]">{oldVal}</span>
        <i className="pi pi-arrow-right text-[10px] text-[#97a3a1]" aria-hidden="true" />
        <span className="rounded bg-[#faf2e6] px-2 py-0.5 font-semibold text-[#7c5b2a]">{newVal}</span>
      </div>
    );
  }

  if (action === "ASSIGNED") {
    const oldName = metadata.oldAssigneeName || "Nincs felelős";
    const newName = metadata.newAssigneeName || "Nincs felelős";
    return (
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-[#4b585c]">
        <span className="font-medium text-[#71807c]">Felelős:</span>
        <span className="rounded bg-[#f0f3f2] px-2 py-0.5 font-medium text-[#3b474b]">{oldName}</span>
        <i className="pi pi-arrow-right text-[10px] text-[#97a3a1]" aria-hidden="true" />
        <span className="rounded bg-[#f2eff8] px-2 py-0.5 font-semibold text-[#574577]">{newName}</span>
      </div>
    );
  }

  if (action === "UPDATED" && Array.isArray(metadata.changedFields) && metadata.changedFields.length > 0) {
    const fieldNames = metadata.changedFields
      .map((field) => fieldLabels[field] || field)
      .join(", ");
    return (
      <div className="mt-2 text-xs text-[#606d71]">
        <span className="font-medium text-[#71807c]">Módosított mezők:</span> {fieldNames}
      </div>
    );
  }

  return null;
}

export default function ActivityFeed({
  activities = [],
  loading = false,
  error = "",
  emptyMessage = "Nincs megjeleníthető tevékenység.",
}) {
  const groupedActivities = useMemo(() => {
    const groups = [];
    const groupMap = new Map();

    for (const activity of activities) {
      const key = getDateGroupKey(activity.createdAt);
      if (!groupMap.has(key)) {
        const groupObj = { key, items: [] };
        groupMap.set(key, groupObj);
        groups.push(groupObj);
      }
      groupMap.get(key).items.push(activity);
    }

    return groups;
  }, [activities]);

  if (loading) {
    return (
      <div className="rounded-xl border border-[#dbe1df] bg-white">
        <div className="grid h-40 place-items-center" role="status" aria-label="Tevékenységek betöltése">
          <i className="pi pi-spinner pi-spin text-2xl text-[#6fa675]" aria-hidden="true" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-[#dbe1df] bg-white">
        <span className="block h-40 pt-16 text-center text-xs text-[#8f3f34]">
          {error}
        </span>
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="rounded-xl border border-[#dbe1df] bg-white">
        <span className="block h-40 pt-16 text-center text-xs text-[#778286]">
          {emptyMessage}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {groupedActivities.map((group) => (
        <div key={group.key} className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold tracking-wide text-[#707e81] uppercase">{group.key}</span>
            <span className="h-px flex-1 bg-[#e2e7e5]" />
          </div>

          <div className="overflow-hidden rounded-xl border border-[#dbe1df] bg-white shadow-[0_1px_2px_rgba(24,39,43,0.02)]">
            <ul className="divide-y divide-[#edf1f0]">
              {group.items.map((activity) => {
                const user = activity.actorMember?.user;
                const actorName = user ? `${user.firstName} ${user.lastName}`.trim() : "Rendszer";
                const initials = user
                  ? `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`.toUpperCase()
                  : "SYS";
                const time = formatTime(activity.createdAt);

                return (
                  <li key={activity.id} className="p-4 transition-colors hover:bg-[#fafcfc] sm:p-5">
                    <div className="flex items-start gap-3.5 sm:gap-4">
                      {/* Avatar / initials */}
                      <span
                        className="grid size-9 shrink-0 place-items-center rounded-full border border-[#d9e7dc] bg-[#eef6f0] text-xs font-bold text-[#3e684a]"
                        title={actorName}
                      >
                        {initials}
                      </span>

                      {/* Content */}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold text-[#253238]">{actorName}</span>
                            <span
                              className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                                entityClasses[activity.entityType] || "border-[#dbe1df] bg-[#f5f7f6] text-[#556266]"
                              }`}
                            >
                              {entityLabels[activity.entityType] || activity.entityType}
                            </span>
                            <span
                              className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                                actionClasses[activity.action] || "border-[#dbe1df] bg-[#f5f7f6] text-[#556266]"
                              }`}
                            >
                              {actionLabels[activity.action] || activity.action}
                            </span>
                          </div>

                          <time
                            dateTime={activity.createdAt}
                            className="text-[11px] text-[#869294] whitespace-nowrap"
                          >
                            {time}
                          </time>
                        </div>

                        {/* Title and entity reference description */}
                        <div className="mt-1">
                          <p className="text-xs font-medium text-[#2d3b40]">{activity.title}</p>
                          {activity.description && (
                            <p className="mt-0.5 text-xs text-[#637276]">{activity.description}</p>
                          )}
                        </div>

                        {/* Structured details */}
                        {renderMetadata(activity)}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ))}
    </div>
  );
}
