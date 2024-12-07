import "./style.css";
import { Engine } from "@babylonjs/core/Engines/engine";
import { BaseRuntime } from "./baseRuntime";
import { SceneBuilder } from "./sceneBuilder";

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

	const runtime = await BaseRuntime.Create({
		canvas,
		engine,
		sceneBuilder: new SceneBuilder(),
	});

	runtime.run();

	window.addEventListener("resize", () => {
		engine.resize();
	});
}

window.addEventListener("DOMContentLoaded", () => {
	initializeEngine().catch(console.error);
});
