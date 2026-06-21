import type { DebugEvent, NoteEvent, RunEndEvent, SceneEntity } from "../protocol/types";
import { entityFromAddEvent } from "../protocol/types";

export interface SceneDiagnostic {
  readonly level: "warning" | "error";
  readonly message: string;
  readonly seq: number;
}

export interface SceneState {
  readonly entities: Readonly<Record<string, SceneEntity>>;
  readonly entityVisibility: Readonly<Record<string, boolean>>;
  readonly groupVisibility: Readonly<Record<string, boolean>>;
  readonly highlightedIds: readonly string[];
  readonly focusRequest: string | null;
  readonly notes: readonly NoteEvent[];
  readonly runEnd: RunEndEvent | null;
  readonly diagnostics: readonly SceneDiagnostic[];
  readonly lastSeqByRun: Readonly<Record<string, number>>;
}

export function createEmptySceneState(): SceneState {
  return {
    entities: {},
    entityVisibility: {},
    groupVisibility: {},
    highlightedIds: [],
    focusRequest: null,
    notes: [],
    runEnd: null,
    diagnostics: [],
    lastSeqByRun: {},
  };
}

export function isEntityProtected(entity: SceneEntity): boolean {
  return entity.style?.protected === true || entity.group === "baseline" || entity.group.startsWith("baseline/");
}

export function belongsToGroup(entityGroup: string, targetGroup: string): boolean {
  return entityGroup === targetGroup || entityGroup.startsWith(`${targetGroup}/`);
}

function removeEntities(
  entities: Readonly<Record<string, SceneEntity>>,
  shouldRemove: (entity: SceneEntity) => boolean,
): Readonly<Record<string, SceneEntity>> {
  return Object.fromEntries(Object.entries(entities).filter(([, entity]) => !shouldRemove(entity)));
}

function withDiagnostic(state: SceneState, event: DebugEvent, message: string): SceneState {
  return {
    ...state,
    diagnostics: [...state.diagnostics, { level: "error", message, seq: event.seq }],
  };
}

function markSequence(state: SceneState, event: DebugEvent): SceneState {
  const previous = state.lastSeqByRun[event.run_id];
  if (previous !== undefined && event.seq <= previous) {
    return withDiagnostic(state, event, `忽略重复或乱序事件：${event.run_id}#${event.seq}`);
  }

  const nextState: SceneState = {
    ...state,
    lastSeqByRun: { ...state.lastSeqByRun, [event.run_id]: event.seq },
  };

  if (previous !== undefined && event.seq > previous + 1) {
    return {
      ...nextState,
      diagnostics: [
        ...nextState.diagnostics,
        { level: "warning", message: `事件序号存在缺口：${previous} → ${event.seq}`, seq: event.seq },
      ],
    };
  }
  return nextState;
}

export function reduceScene(currentState: SceneState, event: DebugEvent): SceneState {
  const previousSeq = currentState.lastSeqByRun[event.run_id];
  if (previousSeq !== undefined && event.seq <= previousSeq) {
    return withDiagnostic(currentState, event, `忽略重复或乱序事件：${event.run_id}#${event.seq}`);
  }

  const state = markSequence(currentState, event);

  switch (event.op) {
    case "add": {
      if (state.entities[event.id]) {
        return withDiagnostic(state, event, `add 使用了已存在的对象 ID：${event.id}`);
      }
      return {
        ...state,
        entities: { ...state.entities, [event.id]: entityFromAddEvent(event) },
      };
    }
    case "update": {
      const existing = state.entities[event.id];
      if (!existing) {
        return withDiagnostic(state, event, `update 找不到对象：${event.id}`);
      }
      return {
        ...state,
        entities: {
          ...state.entities,
          [event.id]: { ...existing, ...event.patch, id: existing.id },
        },
      };
    }
    case "remove": {
      if (!state.entities[event.id]) {
        return withDiagnostic(state, event, `remove 找不到对象：${event.id}`);
      }
      const { [event.id]: _removed, ...remaining } = state.entities;
      void _removed;
      return { ...state, entities: remaining };
    }
    case "clear_group":
      return {
        ...state,
        entities: removeEntities(
          state.entities,
          (entity) =>
            belongsToGroup(entity.group, event.group) && (event.include_protected === true || !isEntityProtected(entity)),
        ),
      };
    case "clear_scene":
      return {
        ...state,
        entities: removeEntities(
          state.entities,
          (entity) => event.include_protected === true || !isEntityProtected(entity),
        ),
        highlightedIds: [],
        focusRequest: null,
      };
    case "set_visibility":
      return event.target.type === "entity"
        ? {
            ...state,
            entityVisibility: { ...state.entityVisibility, [event.target.id]: event.visible },
          }
        : {
            ...state,
            groupVisibility: { ...state.groupVisibility, [event.target.id]: event.visible },
          };
    case "highlight":
      return { ...state, highlightedIds: [...event.ids] };
    case "focus":
      return { ...state, focusRequest: event.id };
    case "note":
      return { ...state, notes: [...state.notes, event] };
    case "run_end":
      return { ...state, runEnd: event };
  }
}

export function isGroupVisible(group: string, visibility: Readonly<Record<string, boolean>>): boolean {
  const parts = group.split("/");
  for (let index = 1; index <= parts.length; index += 1) {
    const path = parts.slice(0, index).join("/");
    if (visibility[path] === false) return false;
  }
  return true;
}
