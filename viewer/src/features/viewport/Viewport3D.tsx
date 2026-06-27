import { useEffect, useMemo, useRef } from "react";
import { isGroupVisible } from "../../core/scene-store/reducer";
import { useSceneStore } from "../../core/scene-store/store";
import { SceneController } from "../../rendering/SceneController";

interface Viewport3DProps {
  readonly xray: boolean;
}

export function Viewport3D({ xray }: Viewport3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<SceneController | null>(null);
  const entities = useSceneStore((state) => state.entities);
  const entityVisibility = useSceneStore((state) => state.entityVisibility);
  const groupVisibility = useSceneStore((state) => state.groupVisibility);
  const focusRequest = useSceneStore((state) => state.focusRequest);
  const selectEntity = useSceneStore((state) => state.selectEntity);

  const visibleEntities = useMemo(
    () =>
      Object.values(entities).filter(
        (entity) => entityVisibility[entity.id] !== false && isGroupVisible(entity.group, groupVisibility),
      ),
    [entities, entityVisibility, groupVisibility],
  );

  useEffect(() => {
    if (!containerRef.current) return;
    const controller = new SceneController(containerRef.current);
    controller.setSelectionHandler(selectEntity);
    controller.setDiagnosticHandler((message) => useSceneStore.getState().noteDiagnostic(message));
    controllerRef.current = controller;
    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, [selectEntity]);

  useEffect(() => controllerRef.current?.sync(visibleEntities), [visibleEntities]);
  useEffect(() => controllerRef.current?.setXray(xray), [xray]);
  useEffect(() => {
    if (focusRequest) controllerRef.current?.focus(focusRequest);
  }, [focusRequest]);

  return (
    <section className="viewport-shell" aria-label="三维调试视图">
      <div className="viewport-caption">
        <span>世界坐标</span>
        <span>毫米 · Z 向上</span>
      </div>
      <div ref={containerRef} className="viewport-host" />
      <div className="viewport-hint">左键旋转 · 右键平移 · 滚轮缩放 · 点击选择</div>
    </section>
  );
}
