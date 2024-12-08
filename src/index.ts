import { Engine } from "@babylonjs/core/Engines/engine";

import { BaseRuntime } from "./baseRuntime";
import { SceneBuilder } from "./sceneBuilder";

window.onload = (): void => {
	const canvas = document.createElement("canvas");
	document.body.appendChild(canvas);

	const engine = new Engine(
		canvas,
		false,
		{
			preserveDrawingBuffer: false,
			stencil: false,
			antialias: false,
			alpha: true,
			premultipliedAlpha: false,
			powerPreference: "high-performance",
			doNotHandleTouchAction: false,
			doNotHandleContextLost: true,
			audioEngine: false,
		},
		true,
	);

	BaseRuntime.Create({
		canvas,
		engine,
		sceneBuilder: new SceneBuilder(),
	}).then((runtime) => runtime.run());
};
