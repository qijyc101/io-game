import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ACTIVE_MAP,
  DEFAULT_MAP_HEIGHT,
  DEFAULT_MAP_WIDTH,
} from "@io-game/shared";
import type { MapShape, StoredMapFile } from "@io-game/shared";
import { createMap, deleteMap, fetchMap, fetchMapsIndex, saveMap } from "../mapEditor/api";
import {
  applySnap,
  createShapeId,
  DEFAULT_EDITOR_VIEW,
  dragShapes,
  getRangeSelectionIds,
  getShapesInRect,
  getViewport,
  hitTestShape,
  mergeSelectionIds,
  normalizeRect,
  renderEditorCanvas,
  toWorld,
  toggleSelectionId,
  zoomAtPoint,
  type DragState,
  type Draft,
  type EditorViewState,
  type PanState,
  type Tool,
} from "../mapEditor/editorUtils";

const DEFAULT_LINE_THICKNESS = 25;
const MAP_SIZE_MIN = 400;
const MAP_SIZE_MAX = 8000;

function clampMapSize(value: number): number {
  return Math.min(MAP_SIZE_MAX, Math.max(MAP_SIZE_MIN, Math.round(value)));
}

type SaveStatus = "loading" | "ready" | "saving" | "saved" | "error";

interface MapEditorScreenProps {
  onBack: () => void;
}

function toCanvasCoords(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left) * (canvas.width / rect.width),
    y: (clientY - rect.top) * (canvas.height / rect.height),
  };
}

export function MapEditorScreen({ onBack }: MapEditorScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const panRef = useRef<PanState | null>(null);
  const snapRef = useRef(false);
  const lastSelectedIdRef = useRef<string | null>(null);

  const [mapNames, setMapNames] = useState<string[]>([]);
  const [activeMapName, setActiveMapName] = useState(ACTIVE_MAP);
  const [currentMapName, setCurrentMapName] = useState(ACTIVE_MAP);
  const [mapWidth, setMapWidth] = useState(DEFAULT_MAP_WIDTH);
  const [mapHeight, setMapHeight] = useState(DEFAULT_MAP_HEIGHT);
  const [mapWidthInput, setMapWidthInput] = useState(String(DEFAULT_MAP_WIDTH));
  const [mapHeightInput, setMapHeightInput] = useState(String(DEFAULT_MAP_HEIGHT));
  const [shapes, setShapes] = useState<MapShape[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tool, setTool] = useState<Tool>("select");
  const [lineThickness, setLineThickness] = useState(DEFAULT_LINE_THICKNESS);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selectionBox, setSelectionBox] = useState<Draft | null>(null);
  const [view, setView] = useState<EditorViewState>(DEFAULT_EDITOR_VIEW);
  const [showNewMapModal, setShowNewMapModal] = useState(false);
  const [showDeleteMapModal, setShowDeleteMapModal] = useState(false);
  const [deleteMapError, setDeleteMapError] = useState<string | null>(null);
  const [newMapName, setNewMapName] = useState("");
  const [newMapError, setNewMapError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("loading");
  const [saveError, setSaveError] = useState<string | null>(null);
  const skipSaveRef = useRef(true);

  const mapSize = { width: mapWidth, height: mapHeight };
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const canDeleteCurrentMap =
    mapNames.length > 1 && currentMapName !== activeMapName;

  const loadMapByName = useCallback(async (name: string) => {
    setSaveStatus("loading");
    setSaveError(null);
    const map = await fetchMap(name);
    skipSaveRef.current = true;
    setCurrentMapName(map.name);
    setMapWidth(map.width);
    setMapHeight(map.height);
    setMapWidthInput(String(map.width));
    setMapHeightInput(String(map.height));
    setShapes(map.shapes);
    setSelectedIds([]);
    lastSelectedIdRef.current = null;
    setDraft(null);
    setSelectionBox(null);
    dragRef.current = null;
    panRef.current = null;
    setView(DEFAULT_EDITOR_VIEW);
    setSaveStatus("ready");
    return map;
  }, []);

  useEffect(() => {
    let cancelled = false;

    void fetchMapsIndex()
      .then((index) => {
        if (cancelled) return;
        setMapNames(index.maps);
        setActiveMapName(index.active);
        return loadMapByName(index.active);
      })
      .catch((error) => {
        if (cancelled) return;
        setSaveError(error instanceof Error ? error.message : "Failed to load maps.");
        setSaveStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [loadMapByName]);

  useEffect(() => {
    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      return;
    }

    setSaveStatus("saving");
    setSaveError(null);

    const map: StoredMapFile = {
      name: currentMapName,
      width: mapWidth,
      height: mapHeight,
      shapes,
      updatedAt: new Date().toISOString(),
    };

    const timeoutId = window.setTimeout(() => {
      void saveMap(map)
        .then(() => setSaveStatus("saved"))
        .catch((error) => {
          setSaveError(error instanceof Error ? error.message : "Failed to save map.");
          setSaveStatus("error");
        });
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [currentMapName, mapWidth, mapHeight, shapes]);

  const commitMapWidth = () => {
    const parsed = Number(mapWidthInput);
    if (!Number.isFinite(parsed)) {
      setMapWidthInput(String(mapWidth));
      return;
    }
    const next = clampMapSize(parsed);
    setMapWidth(next);
    setMapWidthInput(String(next));
  };

  const commitMapHeight = () => {
    const parsed = Number(mapHeightInput);
    if (!Number.isFinite(parsed)) {
      setMapHeightInput(String(mapHeight));
      return;
    }
    const next = clampMapSize(parsed);
    setMapHeight(next);
    setMapHeightInput(String(next));
  };

  const handleShapeListSelect = (
    shapeId: string,
    event: { ctrlKey: boolean; shiftKey: boolean; metaKey: boolean },
  ) => {
    const additive = event.ctrlKey || event.metaKey;
    if (event.shiftKey) {
      setSelectedIds(getRangeSelectionIds(shapes, lastSelectedIdRef.current, shapeId));
    } else if (additive) {
      setSelectedIds(toggleSelectionId(selectedIds, shapeId));
    } else {
      setSelectedIds([shapeId]);
    }
    lastSelectedIdRef.current = shapeId;
  };

  const selectedShapes = shapes.filter((shape) => selectedIdSet.has(shape.id));

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderEditorCanvas(
      canvas,
      mapSize,
      shapes,
      selectedIdSet,
      tool,
      draft,
      view,
      lineThickness,
      selectionBox,
    );
  }, [draft, lineThickness, mapHeight, mapWidth, selectedIdSet, selectionBox, shapes, tool, view]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resize = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      redraw();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [redraw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const point = toCanvasCoords(canvas, event.clientX, event.clientY);
      const factor = event.deltaY > 0 ? 0.9 : 1.1;
      setView((current) => zoomAtPoint(canvas, mapSize, current, point.x, point.y, factor));
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [mapHeight, mapWidth]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
        snapRef.current = true;
      }
      if (event.code === "Escape") {
        setDraft(null);
        setSelectionBox(null);
        dragRef.current = null;
        panRef.current = null;
        setShowNewMapModal(false);
        setShowDeleteMapModal(false);
        return;
      }
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.code === "KeyA") {
        event.preventDefault();
        const allIds = shapes.map((shape) => shape.id);
        setSelectedIds(allIds);
        lastSelectedIdRef.current = allIds.at(-1) ?? null;
        return;
      }
      if (event.code !== "Delete" && event.code !== "Backspace") return;
      if (selectedIds.length === 0) return;
      event.preventDefault();
      const remove = new Set(selectedIds);
      setShapes((current) => current.filter((shape) => !remove.has(shape.id)));
      setSelectedIds([]);
      lastSelectedIdRef.current = null;
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
        snapRef.current = false;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [selectedIds, shapes]);

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.setPointerCapture(event.pointerId);
    snapRef.current = event.shiftKey;

    if (event.button === 2) {
      event.preventDefault();
      const screen = toCanvasCoords(canvas, event.clientX, event.clientY);
      panRef.current = {
        startScreenX: screen.x,
        startScreenY: screen.y,
        originView: view,
      };
      dragRef.current = null;
      setDraft(null);
      setSelectionBox(null);
      return;
    }

    const viewport = getViewport(canvas, mapSize, view);

    if (event.altKey && tool === "select") {
      const point = toWorld(canvas, event.clientX, event.clientY, viewport, mapSize, false);
      setSelectionBox({
        startX: point.x,
        startY: point.y,
        endX: point.x,
        endY: point.y,
      });
      dragRef.current = null;
      setDraft(null);
      return;
    }

    const point = toWorld(canvas, event.clientX, event.clientY, viewport, mapSize);
    const snapped = applySnap(point.x, point.y, shapes, null, mapSize, snapRef.current);

    if (tool === "select") {
      const hit = [...shapes].reverse().find((shape) => hitTestShape(shape, point.x, point.y));
      if (hit) {
        panRef.current = null;
        if (event.ctrlKey || event.metaKey) {
          const next = toggleSelectionId(selectedIds, hit.id);
          setSelectedIds(next);
          lastSelectedIdRef.current = hit.id;
          if (next.includes(hit.id)) {
            dragRef.current = {
              shapeIds: next,
              startX: point.x,
              startY: point.y,
              origins: shapes.filter((shape) => next.includes(shape.id)),
            };
          }
          return;
        }
        if (event.shiftKey) {
          const next = getRangeSelectionIds(shapes, lastSelectedIdRef.current, hit.id);
          setSelectedIds(next);
          lastSelectedIdRef.current = hit.id;
          dragRef.current = {
            shapeIds: next,
            startX: point.x,
            startY: point.y,
            origins: shapes.filter((shape) => next.includes(shape.id)),
          };
          return;
        }
        const dragIds =
          selectedIds.includes(hit.id) && selectedIds.length > 1 ? selectedIds : [hit.id];
        if (dragIds.length === 1) {
          setSelectedIds([hit.id]);
        }
        lastSelectedIdRef.current = hit.id;
        dragRef.current = {
          shapeIds: dragIds,
          startX: point.x,
          startY: point.y,
          origins: shapes.filter((shape) => dragIds.includes(shape.id)),
        };
      } else {
        setSelectedIds([]);
        lastSelectedIdRef.current = null;
      }
      return;
    }

    setDraft({
      startX: snapped.x,
      startY: snapped.y,
      endX: snapped.x,
      endY: snapped.y,
    });
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    snapRef.current = event.shiftKey;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const viewport = getViewport(canvas, mapSize, view);
    const point = toWorld(canvas, event.clientX, event.clientY, viewport, mapSize);

    const pan = panRef.current;
    if (pan) {
      const screen = toCanvasCoords(canvas, event.clientX, event.clientY);
      setView({
        ...pan.originView,
        panX: pan.originView.panX + screen.x - pan.startScreenX,
        panY: pan.originView.panY + screen.y - pan.startScreenY,
      });
      return;
    }

    if (selectionBox) {
      const boxPoint = toWorld(canvas, event.clientX, event.clientY, viewport, mapSize, false);
      setSelectionBox((current) =>
        current ? { ...current, endX: boxPoint.x, endY: boxPoint.y } : current,
      );
      return;
    }

    const drag = dragRef.current;
    if (drag) {
      const moved = dragShapes(
        drag.origins,
        drag.startX,
        drag.startY,
        point.x,
        point.y,
        shapes,
        mapSize,
        snapRef.current,
      );
      setShapes((current) => {
        const movedById = new Map(moved.map((shape) => [shape.id, shape]));
        return current.map((shape) => movedById.get(shape.id) ?? shape);
      });
      return;
    }

    if (!draft) return;

    const snapped = applySnap(point.x, point.y, shapes, null, mapSize, snapRef.current);
    setDraft((current) =>
      current ? { ...current, endX: snapped.x, endY: snapped.y } : current,
    );
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.releasePointerCapture(event.pointerId);
    const viewport = getViewport(canvas, mapSize, view);

    if (dragRef.current) {
      dragRef.current = null;
      return;
    }

    if (panRef.current) {
      panRef.current = null;
      return;
    }

    if (selectionBox) {
      const boxPoint = toWorld(canvas, event.clientX, event.clientY, viewport, mapSize, false);
      const rect = normalizeRect(
        selectionBox.startX,
        selectionBox.startY,
        boxPoint.x,
        boxPoint.y,
      );
      const ids = getShapesInRect(shapes, rect);
      if (event.shiftKey) {
        setSelectedIds(mergeSelectionIds(selectedIds, ids));
      } else {
        setSelectedIds(ids);
      }
      lastSelectedIdRef.current = ids.at(-1) ?? lastSelectedIdRef.current;
      setSelectionBox(null);
      return;
    }

    if (!draft) return;

    const point = toWorld(canvas, event.clientX, event.clientY, viewport, mapSize);
    const snapped = applySnap(point.x, point.y, shapes, null, mapSize, snapRef.current);
    const currentDraft = draft;

    setShapes((current) => {
      if (tool === "rect") {
        const rect = normalizeRect(
          currentDraft.startX,
          currentDraft.startY,
          snapped.x,
          snapped.y,
        );
        if (rect.width < 8 || rect.height < 8) return current;
        const shape: MapShape = {
          kind: "rect",
          id: createShapeId("r", current),
          ...rect,
        };
        setSelectedIds([shape.id]);
        lastSelectedIdRef.current = shape.id;
        return [...current, shape];
      }

      if (tool === "circle") {
        const radius = Math.hypot(
          snapped.x - currentDraft.startX,
          snapped.y - currentDraft.startY,
        );
        if (radius < 8) return current;
        const shape: MapShape = {
          kind: "circle",
          id: createShapeId("c", current),
          x: currentDraft.startX,
          y: currentDraft.startY,
          radius,
        };
        setSelectedIds([shape.id]);
        lastSelectedIdRef.current = shape.id;
        return [...current, shape];
      }

      if (tool === "line") {
        const length = Math.hypot(
          snapped.x - currentDraft.startX,
          snapped.y - currentDraft.startY,
        );
        if (length < 8) return current;
        const shape: MapShape = {
          kind: "line",
          id: createShapeId("l", current),
          x1: currentDraft.startX,
          y1: currentDraft.startY,
          x2: snapped.x,
          y2: snapped.y,
          thickness: lineThickness,
        };
        setSelectedIds([shape.id]);
        lastSelectedIdRef.current = shape.id;
        return [...current, shape];
      }

      return current;
    });

    setDraft(null);
  };

  const handleSelectMap = async (name: string) => {
    if (name === currentMapName) return;
    try {
      await loadMapByName(name);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to load map.");
      setSaveStatus("error");
    }
  };

  const handleCreateMap = async () => {
    setNewMapError(null);
    try {
      const created = await createMap(newMapName, DEFAULT_MAP_WIDTH, DEFAULT_MAP_HEIGHT);
      setMapNames((current) => [...new Set([...current, created.name])].sort());
      setShowNewMapModal(false);
      setNewMapName("");
      await loadMapByName(created.name);
    } catch (error) {
      setNewMapError(error instanceof Error ? error.message : "Failed to create map.");
    }
  };

  const handleDeleteMap = async () => {
    setDeleteMapError(null);
    try {
      const result = await deleteMap(currentMapName);
      setMapNames(result.maps);
      setActiveMapName(result.active);
      setShowDeleteMapModal(false);
      await loadMapByName(result.active);
    } catch (error) {
      setDeleteMapError(error instanceof Error ? error.message : "Failed to delete map.");
    }
  };

  const saveStatusLabel =
    saveStatus === "loading"
      ? "Loading..."
      : saveStatus === "saving"
        ? "Saving..."
        : saveStatus === "saved"
          ? `Saved server/maps/${currentMapName}.json`
          : saveStatus === "error"
            ? "Save failed"
            : "Ready";

  return (
    <div className="flex h-screen w-screen flex-col bg-slate-900 text-slate-100">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-700 bg-slate-800 px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-slate-600 px-3 py-2 text-sm hover:bg-slate-700"
        >
          Back
        </button>
        <h1 className="text-lg font-semibold">{currentMapName}</h1>

        <label className="flex items-center gap-2 text-sm">
          W
          <input
            type="number"
            min={MAP_SIZE_MIN}
            max={MAP_SIZE_MAX}
            value={mapWidthInput}
            onChange={(event) => setMapWidthInput(event.target.value)}
            onBlur={commitMapWidth}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
            className="w-20 rounded border border-slate-600 bg-slate-900 px-2 py-1"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          H
          <input
            type="number"
            min={MAP_SIZE_MIN}
            max={MAP_SIZE_MAX}
            value={mapHeightInput}
            onChange={(event) => setMapHeightInput(event.target.value)}
            onBlur={commitMapHeight}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
            className="w-20 rounded border border-slate-600 bg-slate-900 px-2 py-1"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          {(["select", "rect", "circle", "line"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTool(item)}
              className={`rounded-lg px-3 py-2 text-sm capitalize ${
                tool === item ? "bg-cyan-600 text-white" : "bg-slate-700 hover:bg-slate-600"
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        {tool === "line" && (
          <label className="flex items-center gap-2 text-sm">
            Thickness
            <input
              type="number"
              min={4}
              max={200}
              value={lineThickness}
              onChange={(event) =>
                setLineThickness(Number(event.target.value) || DEFAULT_LINE_THICKNESS)
              }
              className="w-16 rounded border border-slate-600 bg-slate-900 px-2 py-1"
            />
          </label>
        )}

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              const canvas = canvasRef.current;
              if (!canvas) return;
              setView((current) =>
                zoomAtPoint(canvas, mapSize, current, canvas.width / 2, canvas.height / 2, 1 / 1.2),
              );
            }}
            className="rounded-lg border border-slate-600 px-2 py-2 text-sm hover:bg-slate-700"
          >
            −
          </button>
          <span className="w-12 text-center text-xs text-slate-300">{Math.round(view.zoom * 100)}%</span>
          <button
            type="button"
            onClick={() => {
              const canvas = canvasRef.current;
              if (!canvas) return;
              setView((current) =>
                zoomAtPoint(canvas, mapSize, current, canvas.width / 2, canvas.height / 2, 1.2),
              );
            }}
            className="rounded-lg border border-slate-600 px-2 py-2 text-sm hover:bg-slate-700"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setView(DEFAULT_EDITOR_VIEW)}
            className="rounded-lg border border-slate-600 px-2 py-2 text-xs hover:bg-slate-700"
          >
            Reset view
          </button>
        </div>

        <span className="text-xs text-slate-400">{saveStatusLabel}</span>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-52 flex-col border-r border-slate-700 bg-slate-800">
          <div className="border-b border-slate-700 px-3 py-3">
            <div className="mb-2 flex items-center justify-between gap-1">
              <h2 className="text-sm font-semibold">Maps</h2>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setNewMapName("");
                    setNewMapError(null);
                    setShowNewMapModal(true);
                  }}
                  className="rounded bg-cyan-700 px-2 py-1 text-xs hover:bg-cyan-600"
                >
                  New
                </button>
                <button
                  type="button"
                  disabled={!canDeleteCurrentMap}
                  onClick={() => {
                    setDeleteMapError(null);
                    setShowDeleteMapModal(true);
                  }}
                  className="rounded bg-red-900/80 px-2 py-1 text-xs hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
                  title={
                    canDeleteCurrentMap
                      ? "Delete current map"
                      : "Cannot delete active or last map"
                  }
                >
                  Delete
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-400">Active: {activeMapName}</p>
          </div>

          <ul className="min-h-0 flex-1 overflow-auto p-2">
            {mapNames.map((name) => (
              <li key={name}>
                <button
                  type="button"
                  onClick={() => void handleSelectMap(name)}
                  className={`mb-1 w-full rounded-lg px-3 py-2 text-left text-sm ${
                    name === currentMapName
                      ? "bg-cyan-900/70 text-cyan-100 ring-1 ring-cyan-500"
                      : "hover:bg-slate-700"
                  }`}
                >
                  {name}
                  {name === activeMapName && (
                    <span className="mt-0.5 block text-xs text-cyan-400/80">in game</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div ref={containerRef} className="relative min-w-0 flex-1 bg-slate-950">
          <canvas
            ref={canvasRef}
            className={`absolute inset-0 h-full w-full touch-none ${
              tool === "select" ? "cursor-default" : "cursor-crosshair"
            } ${selectionBox ? "cursor-crosshair" : ""}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onContextMenu={(event) => event.preventDefault()}
          />
          <div className="pointer-events-none absolute left-4 top-4 rounded-lg bg-slate-900/80 px-3 py-2 text-xs text-slate-300">
            {mapWidth}×{mapHeight}. Shift — snap. Ctrl — toggle select. Alt + drag — area. RMB — pan.
          </div>
        </div>

        <aside className="flex w-56 flex-col border-l border-slate-700 bg-slate-800">
          <div className="border-b border-slate-700 px-4 py-3">
            <h2 className="font-semibold">
              Shapes ({shapes.length})
              {selectedIds.length > 0 && (
                <span className="ml-1 text-sm font-normal text-cyan-300">
                  · {selectedIds.length} selected
                </span>
              )}
            </h2>
            {selectedShapes.length > 0 && (
              <p className="mt-2 text-xs text-cyan-300">
                {selectedShapes.length === 1
                  ? `${selectedShapes[0]!.id} (${selectedShapes[0]!.kind})`
                  : selectedShapes.map((shape) => shape.id).join(", ")}
              </p>
            )}
            {saveError && <p className="mt-2 text-xs text-red-400">{saveError}</p>}
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
            {shapes.length === 0 ? (
              <p className="text-sm text-slate-400">No shapes yet.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {shapes.map((shape) => (
                  <li key={shape.id}>
                    <button
                      type="button"
                      onClick={(event) => handleShapeListSelect(shape.id, event)}
                      className={`w-full rounded px-2 py-1 text-left ${
                        selectedIdSet.has(shape.id)
                          ? "bg-cyan-900/60 text-cyan-200"
                          : "hover:bg-slate-700"
                      }`}
                    >
                      {shape.id} · {shape.kind}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      {showNewMapModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowNewMapModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-slate-600 bg-slate-800 p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="mb-4 text-lg font-semibold">New map</h2>
            <label className="mb-4 block text-sm text-slate-300">
              Name
              <input
                type="text"
                value={newMapName}
                onChange={(event) => setNewMapName(event.target.value)}
                placeholder="arena-2"
                autoFocus
                className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-white focus:border-cyan-500 focus:outline-none"
              />
            </label>
            {newMapError && <p className="mb-3 text-sm text-red-400">{newMapError}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewMapModal(false)}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleCreateMap()}
                className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold hover:bg-cyan-500"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteMapModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowDeleteMapModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-slate-600 bg-slate-800 p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="mb-2 text-lg font-semibold">Delete map</h2>
            <p className="mb-4 text-sm text-slate-300">
              Delete <span className="font-semibold text-white">{currentMapName}</span>? This
              removes <code className="text-xs">server/maps/{currentMapName}.json</code>.
            </p>
            {deleteMapError && <p className="mb-3 text-sm text-red-400">{deleteMapError}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteMapModal(false)}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteMap()}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold hover:bg-red-500"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
