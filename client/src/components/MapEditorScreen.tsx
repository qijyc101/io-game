import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ACTIVE_MAP,
  DEFAULT_MAP_HEIGHT,
  DEFAULT_MAP_WIDTH,
  dedupeMapTextures,
  getTextureZIndex,
  PLAYER_Z_INDEX,
} from "@io-game/shared";
import type { MapShape, MapTextureDef, StoredMapFile } from "@io-game/shared";
import {
  createMap,
  deleteMap,
  deleteMapTexture,
  fetchMap,
  fetchMapsIndex,
  saveMap,
  uploadMapTexture,
} from "../mapEditor/api";
import {
  applySnap,
  clampPlayerReference,
  createDefaultPlayerReference,
  createShapeId,
  DEFAULT_EDITOR_VIEW,
  dragShapes,
  dragTextures,
  getRangeSelectionIds,
  getShapesInRect,
  getTextureRangeSelectionIds,
  getTexturesInRect,
  getViewport,
  hitTestPlayerReference,
  hitTestShape,
  hitTestTexture,
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
  type PlayerReference,
  type TextureDragState,
  type Tool,
} from "../mapEditor/editorUtils";
import { loadEditorTextureImage } from "../mapEditor/textureCache";

const DEFAULT_LINE_THICKNESS = 25;
const MAP_SIZE_MIN = 400;
const MAP_SIZE_MAX = 8000;
const TEXTURE_MAX_DIMENSION = 800;

function clampMapSize(value: number): number {
  return Math.min(MAP_SIZE_MAX, Math.max(MAP_SIZE_MIN, Math.round(value)));
}

function scaleTexturePlacement(texture: MapTextureDef, mapSize: { width: number; height: number }): MapTextureDef {
  const scale = Math.min(1, TEXTURE_MAX_DIMENSION / Math.max(texture.width, texture.height));
  const width = texture.width * scale;
  const height = texture.height * scale;
  return {
    ...texture,
    x: mapSize.width / 2 - width / 2,
    y: mapSize.height / 2 - height / 2,
    width,
    height,
  };
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
  const textureDragRef = useRef<TextureDragState | null>(null);
  const panRef = useRef<PanState | null>(null);
  const playerDragRef = useRef<{ startX: number; startY: number; origin: PlayerReference } | null>(
    null,
  );
  const textureInputRef = useRef<HTMLInputElement>(null);
  const snapRef = useRef(false);
  const lastSelectedIdRef = useRef<string | null>(null);
  const lastSelectedTextureIdRef = useRef<string | null>(null);

  const [mapNames, setMapNames] = useState<string[]>([]);
  const [activeMapName, setActiveMapName] = useState(ACTIVE_MAP);
  const [currentMapName, setCurrentMapName] = useState(ACTIVE_MAP);
  const [mapWidth, setMapWidth] = useState(DEFAULT_MAP_WIDTH);
  const [mapHeight, setMapHeight] = useState(DEFAULT_MAP_HEIGHT);
  const [mapWidthInput, setMapWidthInput] = useState(String(DEFAULT_MAP_WIDTH));
  const [mapHeightInput, setMapHeightInput] = useState(String(DEFAULT_MAP_HEIGHT));
  const [shapes, setShapes] = useState<MapShape[]>([]);
  const [textures, setTextures] = useState<MapTextureDef[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedTextureIds, setSelectedTextureIds] = useState<string[]>([]);
  const [textureScalePercent, setTextureScalePercent] = useState(100);
  const textureScaleBaseRef = useRef<Map<string, { width: number; height: number }>>(new Map());
  const [textureRevision, setTextureRevision] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploadingTextures, setIsUploadingTextures] = useState(false);
  const [tool, setTool] = useState<Tool>("select");
  const [lineThickness, setLineThickness] = useState(DEFAULT_LINE_THICKNESS);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selectionBox, setSelectionBox] = useState<Draft | null>(null);
  const [view, setView] = useState<EditorViewState>(DEFAULT_EDITOR_VIEW);
  const [showPlayerReference, setShowPlayerReference] = useState(true);
  const [playerReference, setPlayerReference] = useState<PlayerReference>(() =>
    createDefaultPlayerReference({ width: DEFAULT_MAP_WIDTH, height: DEFAULT_MAP_HEIGHT }),
  );
  const [playerReferenceSelected, setPlayerReferenceSelected] = useState(false);
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
  const selectedTextureIdSet = useMemo(() => new Set(selectedTextureIds), [selectedTextureIds]);
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
    setTextures(dedupeMapTextures(map.textures ?? []));
    setSelectedIds([]);
    setSelectedTextureIds([]);
    lastSelectedIdRef.current = null;
    lastSelectedTextureIdRef.current = null;
    setDraft(null);
    setSelectionBox(null);
    dragRef.current = null;
    textureDragRef.current = null;
    panRef.current = null;
    playerDragRef.current = null;
    setPlayerReference(createDefaultPlayerReference({ width: map.width, height: map.height }));
    setPlayerReferenceSelected(false);
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
      textures,
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
  }, [currentMapName, mapWidth, mapHeight, shapes, textures]);

  useEffect(() => {
    let cancelled = false;

    void Promise.all(
      textures.map((texture) => loadEditorTextureImage(currentMapName, texture.file)),
    )
      .then(() => {
        if (!cancelled) {
          setTextureRevision((current) => current + 1);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTextureRevision((current) => current + 1);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentMapName, textures]);

  const commitMapWidth = () => {
    const parsed = Number(mapWidthInput);
    if (!Number.isFinite(parsed)) {
      setMapWidthInput(String(mapWidth));
      return;
    }
    const next = clampMapSize(parsed);
    setMapWidth(next);
    setMapWidthInput(String(next));
    setPlayerReference((current) =>
      clampPlayerReference(current, { width: next, height: mapHeight }),
    );
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
    setPlayerReference((current) =>
      clampPlayerReference(current, { width: mapWidth, height: next }),
    );
  };

  const handleShapeListSelect = (
    shapeId: string,
    event: { ctrlKey: boolean; shiftKey: boolean; metaKey: boolean },
  ) => {
    setSelectedTextureIds([]);
    lastSelectedTextureIdRef.current = null;
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

  const handleTextureListSelect = (
    textureId: string,
    event: { ctrlKey: boolean; shiftKey: boolean; metaKey: boolean },
  ) => {
    setSelectedIds([]);
    lastSelectedIdRef.current = null;
    setPlayerReferenceSelected(false);
    const additive = event.ctrlKey || event.metaKey;
    if (event.shiftKey) {
      setSelectedTextureIds(
        getTextureRangeSelectionIds(textures, lastSelectedTextureIdRef.current, textureId),
      );
    } else if (additive) {
      setSelectedTextureIds(toggleSelectionId(selectedTextureIds, textureId));
    } else {
      setSelectedTextureIds([textureId]);
    }
    lastSelectedTextureIdRef.current = textureId;
  };

  useEffect(() => {
    const base = new Map<string, { width: number; height: number }>();
    for (const id of selectedTextureIds) {
      const texture = textures.find((item) => item.id === id);
      if (texture) {
        base.set(id, { width: texture.width, height: texture.height });
      }
    }
    textureScaleBaseRef.current = base;
    setTextureScalePercent(100);
  }, [selectedTextureIds.join("|")]);

  const selectedShapes = shapes.filter((shape) => selectedIdSet.has(shape.id));
  const selectedTextures = textures.filter((texture) => selectedTextureIdSet.has(texture.id));

  const handleTextureUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploadError(null);
    setIsUploadingTextures(true);

    try {
      const uploaded: MapTextureDef[] = [];
      for (const file of files) {
        const texture = scaleTexturePlacement(
          await uploadMapTexture(currentMapName, file),
          mapSize,
        );
        uploaded.push(texture);
      }
      setTextures((current) => [...current, ...uploaded]);
      setSelectedTextureIds(uploaded.map((texture) => texture.id));
      setSelectedIds([]);
      lastSelectedTextureIdRef.current = uploaded.at(-1)?.id ?? null;
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Failed to upload textures.");
    } finally {
      setIsUploadingTextures(false);
      event.target.value = "";
    }
  };

  const updateSelectedTextures = (patch: Partial<MapTextureDef>) => {
    if (selectedTextureIds.length === 0) return;
    const selected = new Set(selectedTextureIds);
    setTextures((current) =>
      current.map((texture) => (selected.has(texture.id) ? { ...texture, ...patch } : texture)),
    );
  };

  const updateSelectedTexture = (patch: Partial<MapTextureDef>) => {
    updateSelectedTextures(patch);
  };

  const applyTextureScalePercent = (percent: number) => {
    const factor = percent / 100;
    const base = textureScaleBaseRef.current;
    setTextures((current) =>
      current.map((texture) => {
        const origin = base.get(texture.id);
        if (!origin) return texture;
        return {
          ...texture,
          width: Math.max(8, origin.width * factor),
          height: Math.max(8, origin.height * factor),
        };
      }),
    );
  };

  const updateSelectedShape = (updater: (shape: MapShape) => MapShape) => {
    if (selectedIds.length !== 1) return;
    const selectedId = selectedIds[0]!;
    setShapes((current) =>
      current.map((shape) => (shape.id === selectedId ? updater(shape) : shape)),
    );
  };

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderEditorCanvas(
      canvas,
      currentMapName,
      mapSize,
      shapes,
      textures,
      selectedIdSet,
      selectedTextureIdSet,
      tool,
      draft,
      view,
      lineThickness,
      selectionBox,
      showPlayerReference ? playerReference : null,
      playerReferenceSelected,
    );
  }, [
    currentMapName,
    draft,
    lineThickness,
    mapHeight,
    mapWidth,
    playerReference,
    playerReferenceSelected,
    selectedIdSet,
    selectedTextureIdSet,
    selectionBox,
    shapes,
    textures,
    textureRevision,
    showPlayerReference,
    tool,
    view,
  ]);

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
        textureDragRef.current = null;
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
      if (selectedIds.length === 0 && selectedTextureIds.length === 0) return;
      event.preventDefault();

      if (selectedIds.length > 0) {
        const remove = new Set(selectedIds);
        setShapes((current) => current.filter((shape) => !remove.has(shape.id)));
        setSelectedIds([]);
        lastSelectedIdRef.current = null;
      }

      if (selectedTextureIds.length > 0) {
        const removeTextureIds = new Set(selectedTextureIds);
        const removedTextures = textures.filter((texture) => removeTextureIds.has(texture.id));
        setTextures((current) => current.filter((texture) => !removeTextureIds.has(texture.id)));
        setSelectedTextureIds([]);
        lastSelectedTextureIdRef.current = null;
        for (const texture of removedTextures) {
          void deleteMapTexture(currentMapName, texture.file).catch(() => undefined);
        }
      }
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
  }, [currentMapName, selectedIds, selectedTextureIds, shapes, textures]);

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
        setPlayerReferenceSelected(false);
        playerDragRef.current = null;
        textureDragRef.current = null;
        setSelectedTextureIds([]);
        lastSelectedTextureIdRef.current = null;
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
      } else if (
        showPlayerReference &&
        hitTestPlayerReference(playerReference, point.x, point.y)
      ) {
        setSelectedIds([]);
        lastSelectedIdRef.current = null;
        setSelectedTextureIds([]);
        lastSelectedTextureIdRef.current = null;
        setPlayerReferenceSelected(true);
        playerDragRef.current = {
          startX: point.x,
          startY: point.y,
          origin: playerReference,
        };
      } else {
        const textureHit = [...textures]
          .sort((a, b) => getTextureZIndex(b) - getTextureZIndex(a))
          .find((texture) => hitTestTexture(texture, point.x, point.y));
        if (textureHit) {
          panRef.current = null;
          setPlayerReferenceSelected(false);
          playerDragRef.current = null;
          setSelectedIds([]);
          lastSelectedIdRef.current = null;
          if (event.shiftKey) {
            const next = mergeSelectionIds(selectedTextureIds, [textureHit.id]);
            setSelectedTextureIds(next);
            lastSelectedTextureIdRef.current = textureHit.id;
            textureDragRef.current = {
              textureIds: next,
              startX: point.x,
              startY: point.y,
              origins: textures.filter((texture) => next.includes(texture.id)),
            };
            return;
          }
          if (event.ctrlKey || event.metaKey) {
            const next = toggleSelectionId(selectedTextureIds, textureHit.id);
            setSelectedTextureIds(next);
            lastSelectedTextureIdRef.current = textureHit.id;
            if (next.includes(textureHit.id)) {
              textureDragRef.current = {
                textureIds: next,
                startX: point.x,
                startY: point.y,
                origins: textures.filter((texture) => next.includes(texture.id)),
              };
            }
            return;
          }
          const dragIds =
            selectedTextureIds.includes(textureHit.id) && selectedTextureIds.length > 1
              ? selectedTextureIds
              : [textureHit.id];
          if (dragIds.length === 1) {
            setSelectedTextureIds([textureHit.id]);
          }
          lastSelectedTextureIdRef.current = textureHit.id;
          textureDragRef.current = {
            textureIds: dragIds,
            startX: point.x,
            startY: point.y,
            origins: textures.filter((texture) => dragIds.includes(texture.id)),
          };
        } else {
          setSelectedIds([]);
          lastSelectedIdRef.current = null;
          setSelectedTextureIds([]);
          lastSelectedTextureIdRef.current = null;
          setPlayerReferenceSelected(false);
        }
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

    const textureDrag = textureDragRef.current;
    if (textureDrag) {
      const moved = dragTextures(
        textureDrag.origins,
        textureDrag.startX,
        textureDrag.startY,
        point.x,
        point.y,
        shapes,
        mapSize,
        snapRef.current,
      );
      setTextures((current) => {
        const movedById = new Map(moved.map((texture) => [texture.id, texture]));
        return current.map((texture) => movedById.get(texture.id) ?? texture);
      });
      return;
    }

    const playerDrag = playerDragRef.current;
    if (playerDrag) {
      const dx = point.x - playerDrag.startX;
      const dy = point.y - playerDrag.startY;
      const snapped = applySnap(
        playerDrag.origin.x + dx,
        playerDrag.origin.y + dy,
        shapes,
        null,
        mapSize,
        snapRef.current,
      );
      setPlayerReference(
        clampPlayerReference(
          { ...playerDrag.origin, x: snapped.x, y: snapped.y },
          mapSize,
        ),
      );
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

    if (textureDragRef.current) {
      textureDragRef.current = null;
      return;
    }

    if (playerDragRef.current) {
      playerDragRef.current = null;
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
      const textureIds = getTexturesInRect(textures, rect);
      if (event.shiftKey) {
        setSelectedIds(mergeSelectionIds(selectedIds, ids));
        setSelectedTextureIds(mergeSelectionIds(selectedTextureIds, textureIds));
      } else {
        setSelectedIds(ids);
        setSelectedTextureIds(textureIds);
      }
      lastSelectedIdRef.current = ids.at(-1) ?? lastSelectedIdRef.current;
      lastSelectedTextureIdRef.current =
        textureIds.at(-1) ?? lastSelectedTextureIdRef.current;
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

        <input
          ref={textureInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          className="hidden"
          onChange={(event) => void handleTextureUpload(event)}
        />
        <button
          type="button"
          disabled={isUploadingTextures}
          onClick={() => textureInputRef.current?.click()}
          className="rounded-lg bg-violet-700 px-3 py-2 text-sm hover:bg-violet-600 disabled:cursor-wait disabled:opacity-60"
        >
          {isUploadingTextures ? "Uploading..." : "Upload textures"}
        </button>

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

        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showPlayerReference}
            onChange={(event) => setShowPlayerReference(event.target.checked)}
            className="rounded border-slate-600"
          />
          Player ref
        </label>

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

        {/* <span className="text-xs text-slate-400">{saveStatusLabel}</span> */}
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
            {mapWidth}×{mapHeight}. Shift — snap / add texture. Ctrl — toggle select. Alt + drag — area. RMB — pan.
            Textures: z &lt; {PLAYER_Z_INDEX} under player, z ≥ {PLAYER_Z_INDEX} overhang.
          </div>
          {uploadError && (
            <div className="pointer-events-none absolute left-4 top-16 rounded-lg bg-red-950/90 px-3 py-2 text-xs text-red-300">
              {uploadError}
            </div>
          )}
        </div>

        <aside className="flex w-56 flex-col border-l border-slate-700 bg-slate-800">
          <div className="border-b border-slate-700 px-4 py-3">
            <h2 className="font-semibold">
              Textures ({textures.length})
              {selectedTextureIds.length > 0 && (
                <span className="ml-1 text-sm font-normal text-violet-300">
                  · {selectedTextureIds.length} selected
                </span>
              )}
            </h2>
            {selectedTextures.length > 0 && (
              <div className="mt-3 space-y-2 text-xs text-violet-200">
                <label className="flex items-center justify-between gap-2">
                  Scale %
                  <input
                    type="number"
                    min={10}
                    max={500}
                    step={5}
                    value={textureScalePercent}
                    onChange={(event) => {
                      const next = Number(event.target.value) || 100;
                      setTextureScalePercent(next);
                      applyTextureScalePercent(next);
                    }}
                    className="w-20 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-slate-100"
                  />
                </label>
                {selectedTextures.length === 1 && (
                  <>
                    <label className="flex items-center justify-between gap-2">
                      W
                      <input
                        type="number"
                        min={8}
                        value={Math.round(selectedTextures[0]!.width)}
                        onChange={(event) =>
                          updateSelectedTexture({ width: Number(event.target.value) || 8 })
                        }
                        className="w-20 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-slate-100"
                      />
                    </label>
                    <label className="flex items-center justify-between gap-2">
                      H
                      <input
                        type="number"
                        min={8}
                        value={Math.round(selectedTextures[0]!.height)}
                        onChange={(event) =>
                          updateSelectedTexture({ height: Number(event.target.value) || 8 })
                        }
                        className="w-20 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-slate-100"
                      />
                    </label>
                  </>
                )}
                <label className="flex items-center justify-between gap-2">
                  Z
                  <input
                    type="number"
                    value={
                      selectedTextures.length === 1
                        ? getTextureZIndex(selectedTextures[0]!)
                        : ""
                    }
                    placeholder={selectedTextures.length > 1 ? "mixed" : undefined}
                    onChange={(event) =>
                      updateSelectedTextures({ zIndex: Number(event.target.value) || 0 })
                    }
                    className="w-20 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-slate-100"
                  />
                </label>
                <p className="text-slate-400">
                  &lt; {PLAYER_Z_INDEX} — пол/стены, ≥ {PLAYER_Z_INDEX} — навесы
                </p>
                <label className="flex items-center justify-between gap-2">
                  Opacity
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={
                      selectedTextures.length === 1 ? (selectedTextures[0]!.opacity ?? 1) : ""
                    }
                    placeholder={selectedTextures.length > 1 ? "mixed" : undefined}
                    onChange={(event) =>
                      updateSelectedTextures({
                        opacity: Math.min(1, Math.max(0, Number(event.target.value) || 0)),
                      })
                    }
                    className="w-20 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-slate-100"
                  />
                </label>
              </div>
            )}
          </div>

          <div className="max-h-48 overflow-auto px-4 py-3">
            {textures.length === 0 ? (
              <p className="text-sm text-slate-400">No textures yet.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {textures.map((texture) => (
                  <li key={texture.file}>
                    <button
                      type="button"
                      onClick={(event) => handleTextureListSelect(texture.id, event)}
                      className={`w-full rounded px-2 py-1 text-left ${
                        selectedTextureIdSet.has(texture.id)
                          ? "bg-violet-900/60 text-violet-200"
                          : "hover:bg-slate-700"
                      }`}
                    >
                      {texture.id} · z={getTextureZIndex(texture)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-b border-t border-slate-700 px-4 py-3">
            <h2 className="font-semibold">
              Shapes ({shapes.length})
              {selectedIds.length > 0 && (
                <span className="ml-1 text-sm font-normal text-cyan-300">
                  · {selectedIds.length} selected
                </span>
              )}
            </h2>
            {selectedShapes.length === 1 && (
              <div className="mt-3 space-y-2 text-xs text-cyan-200">
                {selectedShapes[0]!.kind === "rect" && (
                  <>
                    <label className="flex items-center justify-between gap-2">
                      W
                      <input
                        type="number"
                        min={8}
                        value={Math.round(selectedShapes[0]!.width)}
                        onChange={(event) =>
                          updateSelectedShape((shape) =>
                            shape.kind === "rect"
                              ? { ...shape, width: Number(event.target.value) || 8 }
                              : shape,
                          )
                        }
                        className="w-20 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-slate-100"
                      />
                    </label>
                    <label className="flex items-center justify-between gap-2">
                      H
                      <input
                        type="number"
                        min={8}
                        value={Math.round(selectedShapes[0]!.height)}
                        onChange={(event) =>
                          updateSelectedShape((shape) =>
                            shape.kind === "rect"
                              ? { ...shape, height: Number(event.target.value) || 8 }
                              : shape,
                          )
                        }
                        className="w-20 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-slate-100"
                      />
                    </label>
                  </>
                )}
                {selectedShapes[0]!.kind === "circle" && (
                  <label className="flex items-center justify-between gap-2">
                    Radius
                    <input
                      type="number"
                      min={4}
                      value={Math.round(selectedShapes[0]!.radius)}
                      onChange={(event) =>
                        updateSelectedShape((shape) =>
                          shape.kind === "circle"
                            ? { ...shape, radius: Number(event.target.value) || 4 }
                            : shape,
                        )
                      }
                      className="w-20 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-slate-100"
                    />
                  </label>
                )}
                {selectedShapes[0]!.kind === "line" && (
                  <label className="flex items-center justify-between gap-2">
                    Thickness
                    <input
                      type="number"
                      min={4}
                      max={200}
                      value={Math.round(selectedShapes[0]!.thickness)}
                      onChange={(event) =>
                        updateSelectedShape((shape) =>
                          shape.kind === "line"
                            ? { ...shape, thickness: Number(event.target.value) || 4 }
                            : shape,
                        )
                      }
                      className="w-20 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-slate-100"
                    />
                  </label>
                )}
              </div>
            )}
            {selectedShapes.length > 1 && (
              <p className="mt-2 text-xs text-cyan-300">
                {selectedShapes.map((shape) => shape.id).join(", ")}
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
