import { Engine } from "@babylonjs/core/Engines/engine";
import { createBaseRuntime } from "./baseRuntime";
import { buildScene } from "./sceneBuilder";

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

	createBaseRuntime({
		canvas,
		engine,
		sceneBuilder: { build: buildScene },
	}).then((runtime) => runtime.run());
};
