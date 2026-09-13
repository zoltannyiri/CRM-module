export function pipelineAccess(hasModule, hasPermission) {
  const view = hasModule("PIPELINE") && hasModule("LEADS") && hasPermission("PIPELINE_VIEW") && hasPermission("LEADS_VIEW");
  return { view, create: view && hasPermission("PIPELINE_CREATE"), edit: view && hasPermission("PIPELINE_EDIT"), delete: view && hasPermission("PIPELINE_DELETE") };
}

export function boardColumns(board) {
  return [
    { id: null, name: "Nincs szakaszhoz rendelve", leads: board.unassignedLeads },
    ...[...board.stages].sort((a, b) => a.position - b.position || a.id - b.id),
  ];
}
