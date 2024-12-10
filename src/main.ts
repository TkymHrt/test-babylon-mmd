import "./style.css";
import { Engine } from "@babylonjs/core/Engines/engine";
import { createBaseRuntime } from "./baseRuntime";
import { buildScene } from "./sceneBuilder";

async function initializeEngine() {
	const canvas = document.createElement("canvas");
	canvas.id = "renderCanvas";
	document.body.appendChild(canvas);

	const engine = new Engine(canvas, true, {
		preserveDrawingBuffer: false,
		stencil: false,
		antialias: true,
		alpha: false,
		powerPreference: "high-performance",
	});

	const runtime = await createBaseRuntime({
		canvas,
		engine,
		sceneBuilder: { build: buildScene },
	});

	runtime.run();

	window.addEventListener("resize", () => {
		engine.resize();
	});
}

window.addEventListener("DOMContentLoaded", () => {
	initializeEngine().catch(console.error);
});
