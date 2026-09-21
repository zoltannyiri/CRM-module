import { useEffect, useRef, useState } from "react";
import apiClient from "../api/apiClient.js";
import Topbar from "../components/Topbar.jsx";
import PipelineBoardComponent from "../components/pipeline/PipelineBoardComponent.jsx";
import PipelineFormComponent from "../components/pipeline/PipelineFormComponent.jsx";
import { pipelineAccess } from "../components/pipeline/pipelineDisplay.js";
import { memberName } from "../components/lead/leadDisplay.js";
import { useAuth } from "../hooks/useAuth.js";
import { useToast } from "../hooks/useToast.js";

const controlClass =
  "h-9 cursor-pointer rounded-md border border-[#d6dddc] bg-white px-3 text-xs font-medium text-[#344247] outline-none hover:bg-[#f8f9f9] disabled:cursor-wait disabled:opacity-60";

export default function PipelinePage() {
  const { hasModule, hasPermission } = useAuth();
  const access = pipelineAccess(hasModule, hasPermission);
  const { showSuccess, showError } = useToast();
  const [definitions, setDefinitions] = useState({
    pipelines: [],
    loaded: false,
    error: "",
  });
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState("");
  const [assignedMemberId, setAssignedMemberId] = useState("");
  const [members, setMembers] = useState([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [result, setResult] = useState({
    board: null,
    resolvedKey: null,
    error: "",
  });
  const [form, setForm] = useState(null);
  const [moving, setMoving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const pending = useRef({ move: false, delete: false });
  const current =
    definitions.pipelines.find((pipeline) => pipeline.id === selectedId) ||
    definitions.pipelines.find((pipeline) => pipeline.isDefault) ||
    definitions.pipelines[0];
  const pipelineId = current?.id;
  const requestKey = JSON.stringify([
    pipelineId,
    query,
    assignedMemberId,
    reloadKey,
  ]);
  const loading = result.resolvedKey !== requestKey;

  useEffect(() => {
    if (!access.view) return undefined;
    let active = true;
    apiClient
      .get("/pipelines")
      .then(({ data }) => {
        if (active)
          setDefinitions({ pipelines: data, loaded: true, error: "" });
      })
      .catch((error) => {
        if (active)
          setDefinitions({
            pipelines: [],
            loaded: true,
            error:
              error.response?.data?.message ||
              "A Pipeline adatai nem tölthetők be.",
          });
      });
    return () => {
      active = false;
    };
  }, [access.view, reloadKey]);
  useEffect(() => {
    if (!access.view) return undefined;
    let active = true;
    apiClient
      .get("/members")
      .then(({ data }) => {
        if (active) setMembers(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [access.view]);
  useEffect(() => {
    if (!access.view || !pipelineId) return undefined;
    let active = true;
    apiClient
      .get(`/pipelines/${pipelineId}/board`, {
        params: {
          ...(query.trim() && { search: query.trim() }),
          ...(assignedMemberId && { assignedMemberId }),
        },
      })
      .then(({ data }) => {
        if (active)
          setResult({ board: data, resolvedKey: requestKey, error: "" });
      })
      .catch(async (error) => {
        if (!active) return;
        if (error.response?.status === 404) {
          // Refresh definitions once: another user may have deleted the selection.
          try {
            const { data } = await apiClient.get("/pipelines", {
              skipGlobalErrorToast: true,
            });
            if (!active) return;
            setDefinitions({ pipelines: data, loaded: true, error: "" });
          } catch {
            /* Keep the original board error if recovery is unavailable. */
          }
        }
        if (active)
          setResult({
            board: null,
            resolvedKey: requestKey,
            error:
              error.response?.data?.message ||
              "A Pipeline board nem tölthető be.",
          });
      });
    return () => {
      active = false;
    };
  }, [access.view, assignedMemberId, pipelineId, query, reloadKey, requestKey]);

  const move = async (leadId, stageId) => {
    if (!access.edit || moving || pending.current.move) return;
    pending.current.move = true;
    setMoving(true);
    try {
      await apiClient.patch(
        `/pipelines/${pipelineId}/leads/${leadId}/stage`,
        { stageId },
        { skipGlobalErrorToast: true },
      );
      setReloadKey((value) => value + 1);
    } catch (error) {
      showError(
        error.response?.data?.message || "A szakasz módosítása sikertelen.",
      );
    } finally {
      pending.current.move = false;
      setMoving(false);
    }
  };
  const removePipeline = async () => {
    if (
      !access.delete ||
      deleting ||
      pending.current.delete ||
      !window.confirm(
        `Biztosan törölni szeretnéd ezt a Pipeline-t: ${current.name}?`,
      )
    )
      return;
    pending.current.delete = true;
    setDeleting(true);
    try {
      await apiClient.delete(`/pipelines/${pipelineId}`, {
        skipGlobalErrorToast: true,
      });
      showSuccess("Pipeline sikeresen törölve.");
      setSelectedId(null);
      setReloadKey((value) => value + 1);
    } catch (error) {
      showError(
        error.response?.data?.message || "A Pipeline törlése sikertelen.",
      );
    } finally {
      pending.current.delete = false;
      setDeleting(false);
    }
  };
  if (!access.view) return null;
  return (
    <div className="min-h-dvh bg-[#f3f5f6] text-[#253238]">
      <Topbar searchValue={query} onSearchChange={setQuery} />
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e3e8e6] bg-white px-5 py-3 lg:px-7">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-sm font-semibold">Pipeline</h1>
          {definitions.pipelines.length > 1 ? (
            <select
              value={pipelineId || ""}
              onChange={(event) => setSelectedId(Number(event.target.value))}
              className={controlClass}
              aria-label="Pipeline kiválasztása"
            >
              {definitions.pipelines.map((pipeline) => (
                <option key={pipeline.id} value={pipeline.id}>
                  {pipeline.name}
                  {pipeline.isDefault ? " (alapértelmezett)" : ""}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-xs text-[#71807c]">{current?.name}</span>
          )}
          <select
            value={assignedMemberId}
            onChange={(event) => setAssignedMemberId(event.target.value)}
            className={controlClass}
            aria-label="Felelős szűrő"
          >
            <option value="">Minden felelős</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {memberName(member)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          {pipelineId && access.edit && (
            <button
              type="button"
              onClick={() => setForm({ mode: "edit", pipeline: current })}
              className={controlClass}
            >
              Beállítások
            </button>
          )}
          {pipelineId && access.delete && (
            <button
              type="button"
              disabled={deleting}
              onClick={removePipeline}
              className={`${controlClass} text-[#9d3c32]`}
            >
              Törlés
            </button>
          )}
          {access.create && (
            <button
              type="button"
              onClick={() => setForm({ mode: "create" })}
              className="h-9 cursor-pointer rounded-md border border-[#172a2e] bg-[#21343a] px-4 text-xs font-semibold text-white"
            >
              Új Pipeline
            </button>
          )}
        </div>
      </div>
      <div className="px-5 py-5 lg:px-7">
        {definitions.error ? (
          <p role="alert" className="text-sm text-[#9a4335]">
            {definitions.error}
          </p>
        ) : !definitions.loaded || (pipelineId && loading) ? (
          <div
            role="status"
            aria-label="Pipeline betöltése"
            className="grid min-h-64 place-items-center rounded-lg border border-[#dbe1df] bg-white"
          >
            <i
              className="pi pi-spinner pi-spin text-2xl text-[#6fa675]"
              aria-hidden="true"
            />
          </div>
        ) : !pipelineId ? (
          <p className="text-sm text-[#71807c]">
            Nincs megjeleníthető Pipeline.
          </p>
        ) : result.error ? (
          <p role="alert" className="text-sm text-[#9a4335]">
            {result.error}
          </p>
        ) : (
          result.board && (
            <PipelineBoardComponent
              board={result.board}
              canEdit={access.edit}
              canViewFollowUps={
                hasModule("FOLLOW_UPS") && hasPermission("FOLLOW_UPS_VIEW")
              }
              moving={moving}
              onMove={move}
            />
          )
        )}
      </div>
      {form && (
        <PipelineFormComponent
          {...form}
          onClose={() => setForm(null)}
          onSaved={(pipeline) => {
            setSelectedId(pipeline.id);
            setReloadKey((value) => value + 1);
          }}
        />
      )}
    </div>
  );
}
