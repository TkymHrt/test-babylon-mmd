import type { AbstractEngine } from "@babylonjs/core";
import {
	Color3,
	Color4,
	CreateGround,
	DefaultRenderingPipeline,
	DirectionalLight,
	Scene,
	SceneLoader,
	ShadowGenerator,
	TransformNode,
	Vector3,
	WebXRDefaultExperience,
	WebXRFeatureName,
	WebXRState,
	loadAssetContainerAsync,
} from "@babylonjs/core";
import { ShadowOnlyMaterial } from "@babylonjs/materials";
import type { MmdAnimation, MmdMesh, MmdWasmInstance } from "babylon-mmd";
import {
	BpmxLoader,
	BvmdLoader,
	MmdCamera,
	MmdPlayerControl,
	MmdStandardMaterialBuilder,
	MmdWasmAnimation,
	MmdWasmInstanceTypeSPR,
	MmdWasmPhysics,
	MmdWasmRuntime,
	SdefInjector,
	StreamAudioPlayer,
	getMmdWasmInstance,
	registerDxBmpTextureLoader,
} from "babylon-mmd";
import type { ISceneBuilder } from "./baseRuntime";

// ロードするファイルのパスを定数として定義
const MOTION_FILE_PATH = "/gimme_gimme_motion.bvmd";
const CAMERA_MOTION_FILE_PATH = "/GimmeGimmeC.bvmd";
const MODEL_FILE_PATH = "/sour_miku_black.bpmx";
const AUDIO_FILE_PATH = "/gimme_gimme.wav";

// エンジンの初期設定
const initializeEngine = (engine: AbstractEngine): void => {
	// SDEFを適用するためにエンジンをオーバーライド
	SdefInjector.OverrideEngineCreateEffect(engine);
	// カスタムテクスチャローダーを登録
	registerDxBmpTextureLoader();
};

// シーンの基本設定を行う
const setupScene = (scene: Scene): void => {
	scene.clearColor = new Color4(0.95, 0.95, 0.95, 1.0);
	scene.ambientColor = new Color3(0.5, 0.5, 0.5);
};

// MMDのルートノードを作成する
const createMmdRoot = (scene: Scene): TransformNode => {
	const mmdRoot = new TransformNode("mmdRoot", scene);
	mmdRoot.position.z = 20;
	return mmdRoot;
};

// MMDのカメラを作成する
const createMmdCamera = (
	scene: Scene,
	canvas: HTMLCanvasElement,
	mmdRoot: TransformNode,
): MmdCamera => {
	const mmdCamera = new MmdCamera("mmdCamera", new Vector3(0, 10, 0), scene);
	mmdCamera.maxZ = 300;
	mmdCamera.minZ = 1;
	mmdCamera.parent = mmdRoot;
	mmdCamera.attachControl(canvas, false);
	mmdCamera.inertia = 0.8;
	return mmdCamera;
};

// ディレクショナルライトを作成する
const createDirectionalLight = (scene: Scene): DirectionalLight => {
	const directionalLight = new DirectionalLight(
		"DirectionalLight",
		new Vector3(0.5, -1, 1),
		scene,
	);
	directionalLight.intensity = 1.0;
	directionalLight.autoCalcShadowZBounds = false;
	directionalLight.autoUpdateExtends = false;
	return directionalLight;
};

// シャドウジェネレーターを作成する
const createShadowGenerator = (
	directionalLight: DirectionalLight,
): ShadowGenerator => {
	const shadowGenerator = new ShadowGenerator(4096, directionalLight, true);
	shadowGenerator.usePoissonSampling = true;
	shadowGenerator.useBlurExponentialShadowMap = true;
	shadowGenerator.usePercentageCloserFiltering = true;
	shadowGenerator.transparencyShadow = true;
	shadowGenerator.forceBackFacesOnly = true;
	shadowGenerator.frustumEdgeFalloff = 0.1;
	return shadowGenerator;
};

// 地面を作成する
const createGround = (
	scene: Scene,
	directionalLight: DirectionalLight,
	mmdRoot: TransformNode,
): TransformNode => {
	const ground = CreateGround(
		"ground1",
		{ width: 100, height: 100, subdivisions: 2, updatable: false },
		scene,
	);
	const shadowOnlyMaterial = new ShadowOnlyMaterial("shadowOnly", scene);
	ground.material = shadowOnlyMaterial;
	shadowOnlyMaterial.activeLight = directionalLight;
	shadowOnlyMaterial.alpha = 0.4;
	ground.receiveShadows = true;
	ground.parent = mmdRoot;
	return ground;
};

// オーディオプレイヤーを設定する
const setupAudioPlayer = (scene: Scene): StreamAudioPlayer => {
	const audioPlayer = new StreamAudioPlayer(scene);
	audioPlayer.preservesPitch = false;
	audioPlayer.source = AUDIO_FILE_PATH;
	return audioPlayer;
};

// ローディングUIの設定
const setupLoadingUI = (engine: AbstractEngine): void => {
	engine.displayLoadingUI();
};

// ローディングUIを非表示にする
const hideLoadingUI = (scene: Scene, engine: AbstractEngine): void => {
	scene.onAfterRenderObservable.addOnce(() => engine.hideLoadingUI());
};

// アセットを並行してロード
const loadAssets = async (
	scene: Scene,
	_mmdRoot: TransformNode,
): Promise<[MmdWasmInstance, MmdAnimation, MmdAnimation, MmdMesh]> => {
	const materialBuilder = new MmdStandardMaterialBuilder();
	const bvmdLoader = new BvmdLoader(scene);
	bvmdLoader.loggingEnabled = true;
	SceneLoader.RegisterPlugin(new BpmxLoader());

	const loadingTexts: string[] = [];
	const updateLoadingText = (
		engine: AbstractEngine,
		index: number,
		text: string,
	): void => {
		loadingTexts[index] = text;
		engine.loadingUIText = `<br/><br/><br/><br/>${loadingTexts.join(
			"<br/><br/>",
		)}`;
	};

	return Promise.all([
		getMmdWasmInstance(new MmdWasmInstanceTypeSPR()),
		bvmdLoader.loadAsync("motion", MOTION_FILE_PATH, (event) =>
			updateLoadingText(
				scene.getEngine(),
				0,
				`モーションを読み込み中... ${event.loaded}/${
					event.total
				} (${Math.floor((event.loaded * 100) / event.total)}%)`,
			),
		),
		bvmdLoader.loadAsync("cameraMotion", CAMERA_MOTION_FILE_PATH, (event) =>
			updateLoadingText(
				scene.getEngine(),
				1,
				`カメラモーションを読み込み中... ${event.loaded}/${
					event.total
				} (${Math.floor((event.loaded * 100) / event.total)}%)`,
			),
		),
		loadAssetContainerAsync(MODEL_FILE_PATH, scene, {
			onProgress: (event) =>
				updateLoadingText(
					scene.getEngine(),
					2,
					`モデルを読み込み中... ${event.loaded}/${event.total} (${Math.floor(
						(event.loaded * 100) / event.total,
					)}%)`,
				),
			pluginOptions: {
				mmdmodel: {
					loggingEnabled: true,
					materialBuilder: materialBuilder,
				},
			},
		}).then((result) => {
			result.addAllToScene();
			return result.rootNodes[0] as MmdMesh;
		}),
	]);
};

// MMDランタイムを設定する
const setupMmdRuntime = (
	scene: Scene,
	wasmInstance: MmdWasmInstance,
	mmdAnimation: MmdAnimation,
	cameraAnimation: MmdAnimation,
	modelMesh: MmdMesh,
	mmdRoot: TransformNode,
	mmdCamera: MmdCamera,
	audioPlayer: StreamAudioPlayer,
	directionalLight: DirectionalLight,
): void => {
	const mmdRuntime = new MmdWasmRuntime(
		wasmInstance,
		scene,
		new MmdWasmPhysics(scene),
	);
	mmdRuntime.loggingEnabled = true;
	mmdRuntime.register(scene);

	mmdRuntime.setAudioPlayer(audioPlayer);
	mmdRuntime.playAnimation();

	const mmdPlayerControl = new MmdPlayerControl(scene, mmdRuntime, audioPlayer);
	mmdPlayerControl.showPlayerControl();

	mmdRuntime.setCamera(mmdCamera);

	const mmdWasmAnimation = new MmdWasmAnimation(
		mmdAnimation,
		wasmInstance,
		scene,
	);
	const cameraWasmAnimation = new MmdWasmAnimation(
		cameraAnimation,
		wasmInstance,
		scene,
	);

	mmdCamera.addAnimation(cameraWasmAnimation);
	mmdCamera.setAnimation("cameraMotion");

	modelMesh.parent = mmdRoot;

	for (const mesh of modelMesh.metadata.meshes) mesh.receiveShadows = true;
	const shadowGenerator = createShadowGenerator(directionalLight);
	shadowGenerator.addShadowCaster(modelMesh);

	const mmdModel = mmdRuntime.createMmdModel(modelMesh);
	mmdModel.addAnimation(mmdWasmAnimation);
	mmdModel.setAnimation("motion");

	mmdRuntime.physics?.createGroundModel?.([0]);

	optimizeScene(scene);
};

// シーンの最適化
const optimizeScene = (scene: Scene): void => {
	scene.onAfterRenderObservable.addOnce(() => {
		scene.freezeMaterials();

		const meshes = scene.meshes;
		for (let i = 0, len = meshes.length; i < len; ++i) {
			const mesh = meshes[i];
			mesh.freezeWorldMatrix();
			mesh.doNotSyncBoundingInfo = true;
			mesh.isPickable = false;
			mesh.alwaysSelectAsActiveMesh = true;
		}

		scene.skipPointerMovePicking = true;
		scene.skipPointerDownPicking = true;
		scene.skipPointerUpPicking = true;
		scene.skipFrustumClipping = true;
		scene.blockMaterialDirtyMechanism = true;
	});
};

// レンダリングパイプラインを設定する
const setupRenderingPipeline = (scene: Scene, mmdCamera: MmdCamera): void => {
	const defaultPipeline = new DefaultRenderingPipeline("default", true, scene, [
		mmdCamera,
	]);
	defaultPipeline.samples = 4;
	defaultPipeline.fxaaEnabled = true;
};

// XRエクスペリエンスを設定する
const setupXRExperience = async (
	scene: Scene,
	ground: TransformNode,
	mmdCamera: MmdCamera,
): Promise<WebXRDefaultExperience> => {
	const xr = await WebXRDefaultExperience.CreateAsync(scene, {
		uiOptions: {
			sessionMode: "immersive-vr",
			referenceSpaceType: "local-floor",
		},
		disableDefaultUI: true,
		disableTeleportation: true,
	});

	// カメラのルートノードを作成し、カメラの親に設定
	const cameraRoot = new TransformNode("cameraRoot", scene);
	xr.baseExperience.camera.parent = cameraRoot;

	const featuresManager = xr.baseExperience.featuresManager;
	featuresManager.enableFeature(WebXRFeatureName.POINTER_SELECTION, "stable", {
		xrInput: xr.input,
		enablePointerSelectionOnAllControllers: true,
	});

	featuresManager.enableFeature(WebXRFeatureName.TELEPORTATION, "stable", {
		xrInput: xr.input,
		floorMeshes: [ground],
		defaultTargetMeshOptions: {
			teleportationRadius: 2,
			torusArrowMaterial: null,
		},
		useMainComponentOnly: true,
		snapPositions: [new Vector3(2.4 * 3.5 * 1, 0, -10 * 1)],
	});

	xr.input.onControllerAddedObservable.add((controller) => {
		controller.onMotionControllerInitObservable.add((motionController) => {
			const thumbstick = motionController.getComponent(
				"xr-standard-thumbstick",
			);
			if (thumbstick) {
				if (motionController.handedness === "right") {
					// 移動操作
					thumbstick.onAxisValueChangedObservable.add((axes) => {
						if (xr.baseExperience.state === WebXRState.IN_XR) {
							const forward = xr.baseExperience.camera.getDirection(
								Vector3.Backward(),
							);
							forward.y = 0;
							forward.normalize();

							const right = xr.baseExperience.camera.getDirection(
								Vector3.Right(),
							);
							right.y = 0;
							right.normalize();

							const movement = forward
								.scale(axes.y * 0.1)
								.add(right.scale(axes.x * 0.1));

							cameraRoot.position.addInPlace(movement);
						}
					});
				} else if (motionController.handedness === "left") {
					// 視点の回転操作
					thumbstick.onAxisValueChangedObservable.add((axes) => {
						if (xr.baseExperience.state === WebXRState.IN_XR) {
							const rotationSpeed = 0.05;
							cameraRoot.rotation.y -= axes.x * rotationSpeed;
							cameraRoot.rotation.x -= axes.y * rotationSpeed;
							// 角度を制限
							cameraRoot.rotation.x = Math.max(
								-Math.PI / 2,
								Math.min(Math.PI / 2, cameraRoot.rotation.x),
							);
						}
					});
				}
			}
		});
	});

	xr.input.onControllerAddedObservable.add((controller) => {
		controller.onMotionControllerInitObservable.add((motionController) => {
			const componentIds = motionController.getComponentIds();
			for (const id of componentIds) {
				const component = motionController.getComponent(id);
				if (component && component.type !== "thumbstick") {
					component.onButtonStateChangedObservable.add(() => {
						if (component.pressed) {
							xr.baseExperience.exitXRAsync();
						}
					});
				}
			}
		});
	});

	xr.baseExperience.onStateChangedObservable.add((state) => {
		if (state === WebXRState.NOT_IN_XR) {
			const defaultPipeline = scene.postProcessRenderPipelineManager
				.supportedPipelines[0] as DefaultRenderingPipeline;
			defaultPipeline.fxaaEnabled = true;
			defaultPipeline.chromaticAberrationEnabled = true;

			const enterVrButton = document.getElementById("enterVrButton");
			if (enterVrButton) {
				enterVrButton.style.display = "block";
			}

			scene.activeCamera = mmdCamera;
		}
	});

	return xr;
};

// VRモードに入るボタンを設定する
const setupEnterVrButton = (scene: Scene, xr: WebXRDefaultExperience): void => {
	const enterVrButton = document.createElement("button");
	enterVrButton.id = "enterVrButton";
	enterVrButton.textContent = "VRモード";
	document.body.appendChild(enterVrButton);

	enterVrButton.addEventListener("click", async () => {
		await xr.baseExperience.enterXRAsync(
			"immersive-vr",
			"local-floor",
			xr.renderTarget,
		);

		const defaultPipeline = scene.postProcessRenderPipelineManager
			.supportedPipelines[0] as DefaultRenderingPipeline;
		defaultPipeline.fxaaEnabled = false;
		defaultPipeline.chromaticAberrationEnabled = false;

		defaultPipeline.addCamera(xr.baseExperience.camera);

		scene.activeCamera = xr.baseExperience.camera;
		xr.baseExperience.camera.position.y = 10.0;

		enterVrButton.style.display = "none";
	});
};

export const buildScene: ISceneBuilder["build"] = async (
	canvas: HTMLCanvasElement,
	engine: AbstractEngine,
): Promise<Scene> => {
	try {
		// エンジンとシーンの初期設定
		initializeEngine(engine);
		const scene = new Scene(engine);
		setupScene(scene);

		// 必要な要素を作成
		const mmdRoot = createMmdRoot(scene);
		const mmdCamera = createMmdCamera(scene, canvas, mmdRoot);
		const directionalLight = createDirectionalLight(scene);
		const ground = createGround(scene, directionalLight, mmdRoot);
		const audioPlayer = setupAudioPlayer(scene);

		// ローディングUIの設定
		setupLoadingUI(engine);

		// アセットを並行してロード
		const [wasmInstance, mmdAnimation, cameraAnimation, modelMesh] =
			await loadAssets(scene, mmdRoot);

		// ローディングUIを非表示
		hideLoadingUI(scene, engine);

		// MMDランタイムの設定
		setupMmdRuntime(
			scene,
			wasmInstance,
			mmdAnimation,
			cameraAnimation,
			modelMesh,
			mmdRoot,
			mmdCamera,
			audioPlayer,
			directionalLight,
		);

		// レンダリングパイプラインの設定
		setupRenderingPipeline(scene, mmdCamera);

		// XRエクスペリエンスの設定
		const xr = await setupXRExperience(scene, ground, mmdCamera);

		// VRモードのボタンを設定
		setupEnterVrButton(scene, xr);

		return scene;
	} catch (error) {
		console.error("シーンの構築中にエラーが発生しました:", error);
		throw error;
	}
};
