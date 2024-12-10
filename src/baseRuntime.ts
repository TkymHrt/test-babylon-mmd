import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import type { Scene } from "@babylonjs/core/scene";

export interface ISceneBuilder {
	build(
		canvas: HTMLCanvasElement,
		engine: AbstractEngine,
	): Scene | Promise<Scene>;
}

export interface BaseRuntimeInitParams {
	canvas: HTMLCanvasElement;
	engine: AbstractEngine;
	sceneBuilder: ISceneBuilder;
}

interface BaseRuntime {
	run(): void;
	dispose(): void;
}

export async function createBaseRuntime(
	params: BaseRuntimeInitParams,
): Promise<BaseRuntime> {
	const { canvas, engine, sceneBuilder } = params;
	const scene = await sceneBuilder.build(canvas, engine);

	const onResize = (): void => {
		engine.resize();
	};

	const onTick = (): void => {
		if (scene) {
			scene.render();
		}
	};

	const run = (): void => {
		window.addEventListener("resize", onResize);
		engine.runRenderLoop(onTick);
	};

	const dispose = (): void => {
		window.removeEventListener("resize", onResize);
		engine.dispose();
	};

	return {
		run,
		dispose,
	};
}
