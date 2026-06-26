import { create } from "zustand";
import type { DebugEvent } from "../protocol/types";
import {
  belongsToGroup,
  createEmptySceneState,
  isEntityProtected,
  isGroupLocked,
  reduceScene,
  type SceneState,
} from "./reducer";

interface SceneActions {
  readonly applyEvent: (event: DebugEvent) => void;
  readonly applyEvents: (events: readonly DebugEvent[]) => void;
  readonly selectEntity: (id: string | null) => void;
  readonly setEntityVisibility: (id: string, visible: boolean) => void;
  readonly setGroupVisibility: (group: string, visible: boolean) => void;
  readonly setGroupLocked: (group: string, locked: boolean) => void;
  readonly soloGroup: (group: string) => void;
  readonly showAllGroups: () => void;
  readonly hideAllGroups: () => void;
  readonly clearGroup: (group: string) => void;
  readonly clearLocalDebugScene: () => void;
  readonly noteDiagnostic: (message: string, seq?: number) => void;
  readonly reset: () => void;
}

export interface SceneStore extends SceneState, SceneActions {
  readonly selectedId: string | null;
  readonly lockedGroups: Readonly<Record<string, boolean>>;
}

const initialStoreState = { ...createEmptySceneState(), selectedId: null, lockedGroups: {} };

export const useSceneStore = create<SceneStore>((set) => ({
  ...initialStoreState,
  applyEvent: (event) => set((state) => ({ ...state, ...reduceScene(state, event) })),
  applyEvents: (events) =>
    set((state) => ({
      ...state,
      ...events.reduce<SceneState>((next, event) => reduceScene(next, event), state),
    })),
  selectEntity: (selectedId) => set({ selectedId }),
  setEntityVisibility: (id, visible) =>
    set((state) => ({ entityVisibility: { ...state.entityVisibility, [id]: visible } })),
  setGroupVisibility: (group, visible) =>
    set((state) => ({ groupVisibility: { ...state.groupVisibility, [group]: visible } })),
  setGroupLocked: (group, locked) =>
    set((state) => ({ lockedGroups: { ...state.lockedGroups, [group]: locked } })),
  soloGroup: (group) =>
    set((state) => {
      const groups = new Set(Object.values(state.entities).map((entity) => entity.group));
      return {
        groupVisibility: Object.fromEntries(
          [...groups].map((candidate) => [
            candidate,
            belongsToGroup(candidate, group) || belongsToGroup(group, candidate),
          ]),
        ),
      };
    }),
  // Exit Solo / un-hide everything: clearing groupVisibility makes every
  // group visible again (isGroupVisible defaults to true with no entry).
  showAllGroups: () => set({ groupVisibility: {} }),
  // Hide every group (counterpart to 显示全部); show specific ones afterward.
  hideAllGroups: () =>
    set((state) => ({
      groupVisibility: Object.fromEntries(
        [...new Set(Object.values(state.entities).map((entity) => entity.group))].map((group) => [group, false]),
      ),
    })),
  clearGroup: (group) =>
    set((state) => ({
      entities: Object.fromEntries(
        Object.entries(state.entities).filter(
          ([, entity]) => !belongsToGroup(entity.group, group) || isEntityProtected(entity),
        ),
      ),
      selectedId:
        state.selectedId && belongsToGroup(state.entities[state.selectedId]?.group ?? "", group)
          ? null
          : state.selectedId,
    })),
  clearLocalDebugScene: () =>
    set((state) => ({
      // Keep locked groups (user-set or baseline default); clear the rest.
      entities: Object.fromEntries(
        Object.entries(state.entities).filter(([, entity]) => isGroupLocked(entity.group, state.lockedGroups)),
      ),
      highlightedIds: [],
      selectedId: null,
    })),
  noteDiagnostic: (message, seq = 0) =>
    set((state) => ({ diagnostics: [...state.diagnostics, { level: "warning", message, seq }] })),
  reset: () => set(initialStoreState),
}));
