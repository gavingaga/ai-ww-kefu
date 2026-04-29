export { JsBridge, type BridgeOptions } from "./bridge.js";
export type {
  LiveContext,
  NativeBridge,
  Orientation,
  PlayDiagnostics,
  Quality,
  Scene,
} from "./types.js";

import { JsBridge } from "./bridge.js";

/** 进程级单例 — 大部分宿主只需要一个 SDK 实例。 */
let _instance: JsBridge | null = null;

export function getKefuBridge(opts?: ConstructorParameters<typeof JsBridge>[0]): JsBridge {
  if (_instance) return _instance;
  _instance = new JsBridge(opts);
  return _instance;
}
