import type { AbstractEngine } from "@babylonjs/core";
import {
	ArcRotateCamera,
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

export class SceneBuilder implements ISceneBuilder {
	public async build(
		canvas: HTMLCanvasElement,
		engine: AbstractEngine,
	): Promise<Scene> {
		try {
			// SDEFを適用するためにエンジンをオーバーライド
			SdefInjector.OverrideEngineCreateEffect(engine);

			// カスタムテクスチャローダーを登録
			registerDxBmpTextureLoader();

			// MMD標準マテリアルビルダーを作成
			const materialBuilder = new MmdStandardMaterialBuilder();

			// シーンを作成し、基本設定を行う
			const scene = new Scene(engine);
			this.setupScene(scene);

			// MMDルートノード、カメラ、ライト、地面、オーディオプレーヤーを作成
			const mmdRoot = this.createMmdRoot(scene);
			const mmdCamera = this.createMmdCamera(scene, mmdRoot);
			const camera = this.createArcRotateCamera(scene, canvas, mmdRoot);
			const directionalLight = this.createDirectionalLight(scene);
			const ground = this.createGround(scene, directionalLight, mmdRoot);
			const audioPlayer = this.setupAudioPlayer(scene);

			// ローディング画面を表示
			engine.displayLoadingUI();
			const loadingTexts: string[] = [];
			const updateLoadingText = (updateIndex: number, text: string): void => {
				loadingTexts[updateIndex] = text;
				engine.loadingUIText = `<br/><br/><br/><br/>${loadingTexts.join("<br/><br/>")}`;
			};

			// BvmdLoaderを使用して.bvmdファイルを読み込み
			const bvmdLoader = new BvmdLoader(scene);
			bvmdLoader.loggingEnabled = true;

			// BpmxLoaderをシーンローダーに登録
			SceneLoader.RegisterPlugin(new BpmxLoader());

			// アセットを並行してロード
			const [wasmInstance, mmdAnimation, cameraAnimation, modelMesh] =
				await Promise.all([
					getMmdWasmInstance(new MmdWasmInstanceTypeSPR()),
					bvmdLoader.loadAsync("motion", "/gimme_gimme_motion.bvmd", (event) =>
						updateLoadingText(
							0,
							`モーションを読み込み中... ${event.loaded}/${event.total} (${Math.floor((event.loaded * 100) / event.total)}%)`,
						),
					),
					bvmdLoader.loadAsync("cameraMotion", "/GimmeGimmeC.bvmd", (event) =>
						updateLoadingText(
							1,
							`カメラモーションを読み込み中... ${event.loaded}/${event.total} (${Math.floor((event.loaded * 100) / event.total)}%)`,
						),
					),
					loadAssetContainerAsync("/sour_miku_black.bpmx", scene, {
						onProgress: (event) =>
							updateLoadingText(
								2,
								`モデルを読み込み中... ${event.loaded}/${event.total} (${Math.floor((event.loaded * 100) / event.total)}%)`,
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

			// ローディング画面を非表示
			scene.onAfterRenderObservable.addOnce(() => engine.hideLoadingUI());

			this.setupMmdRuntime(
				scene,
				wasmInstance,
				mmdAnimation,
				cameraAnimation,
				modelMesh,
				mmdRoot,
				mmdCamera,
				audioPlayer,
			);

			this.setupDefaultRenderingPipeline(scene, mmdCamera, camera);

			const xr = await this.setupXRExperience(scene, ground, mmdCamera, camera);

			this.setupEnterVrButton(xr, scene, camera, mmdCamera);

			return scene;
		} catch (error) {
			console.error("シーンの構築中にエラーが発生しました:", error);
			throw error;
		}
	}

	// シーンの基本設定を行う
	private setupScene(scene: Scene): void {
		scene.clearColor = new Color4(0.95, 0.95, 0.95, 1.0);
		scene.ambientColor = new Color3(0.5, 0.5, 0.5);
	}

	// MMDのルートノードを作成する
	private createMmdRoot(scene: Scene): TransformNode {
		const mmdRoot = new TransformNode("mmdRoot", scene);
		mmdRoot.position.z = 20;
		return mmdRoot;
	}

	// MMDのカメラを作成する
	private createMmdCamera(scene: Scene, mmdRoot: TransformNode): MmdCamera {
		const mmdCamera = new MmdCamera("mmdCamera", new Vector3(0, 10, 0), scene);
		mmdCamera.maxZ = 300;
		mmdCamera.minZ = 1;
		mmdCamera.parent = mmdRoot;
		return mmdCamera;
	}

	// ArcRotateカメラを作成する
	private createArcRotateCamera(
		scene: Scene,
		canvas: HTMLCanvasElement,
		mmdRoot: TransformNode,
	): ArcRotateCamera {
		const camera = new ArcRotateCamera(
			"arcRotateCamera",
			0,
			0,
			45,
			new Vector3(0, 10, 1),
			scene,
		);
		camera.maxZ = 1000;
		camera.minZ = 0.1;
		camera.setPosition(new Vector3(0, 10, -45));
		camera.attachControl(canvas, false);
		camera.inertia = 0.8;
		camera.speed = 4;
		camera.parent = mmdRoot;
		return camera;
	}

	// ディレクショナルライトを作成する
	private createDirectionalLight(scene: Scene): DirectionalLight {
		const directionalLight = new DirectionalLight(
			"DirectionalLight",
			new Vector3(0.5, -1, 1),
			scene,
		);
		directionalLight.intensity = 1.0;
		directionalLight.autoCalcShadowZBounds = false;
		directionalLight.autoUpdateExtends = false;
		return directionalLight;
	}

	// シャドウジェネレーターを作成する
	private createShadowGenerator(
		directionalLight: DirectionalLight,
	): ShadowGenerator {
		const shadowGenerator = new ShadowGenerator(4096, directionalLight, true);
		shadowGenerator.usePoissonSampling = true;
		shadowGenerator.useBlurExponentialShadowMap = true;
		shadowGenerator.usePercentageCloserFiltering = true;
		shadowGenerator.transparencyShadow = true;
		shadowGenerator.forceBackFacesOnly = true;
		shadowGenerator.frustumEdgeFalloff = 0.1;
		return shadowGenerator;
	}

	// 地面を作成するメソッド
	private createGround(
		scene: Scene,
		directionalLight: DirectionalLight,
		mmdRoot: TransformNode,
	): TransformNode {
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
	}

	// オーディオプレイヤーを設定するメソッド
	private setupAudioPlayer(scene: Scene): StreamAudioPlayer {
		const audioPlayer = new StreamAudioPlayer(scene);
		audioPlayer.preservesPitch = false;
		audioPlayer.source = "/gimme_gimme.wav";
		return audioPlayer;
	}

	// MMDランタイムを設定するメソッド
	private setupMmdRuntime(
		scene: Scene,
		wasmInstance: MmdWasmInstance,
		mmdAnimation: MmdAnimation,
		cameraAnimation: MmdAnimation,
		modelMesh: MmdMesh,
		mmdRoot: TransformNode,
		mmdCamera: MmdCamera,
		audioPlayer: StreamAudioPlayer,
	): void {
		const mmdRuntime = new MmdWasmRuntime(
			wasmInstance,
			scene,
			new MmdWasmPhysics(scene),
		);
		mmdRuntime.loggingEnabled = true;
		mmdRuntime.register(scene);

		mmdRuntime.setAudioPlayer(audioPlayer);
		mmdRuntime.playAnimation();

		const mmdPlayerControl = new MmdPlayerControl(
			scene,
			mmdRuntime,
			audioPlayer,
		);
		mmdPlayerControl.showPlayerControl();

		mmdRuntime.playAnimation();

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
		const shadowGenerator = this.createShadowGenerator(
			scene.lights[0] as DirectionalLight,
		);
		shadowGenerator.addShadowCaster(modelMesh);

		const mmdModel = mmdRuntime.createMmdModel(modelMesh);
		mmdModel.addAnimation(mmdWasmAnimation);
		mmdModel.setAnimation("motion");

		mmdRuntime.physics?.createGroundModel?.([0]);

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
	}

	// デフォルトのレンダリングパイプラインを設定する
	private setupDefaultRenderingPipeline(
		scene: Scene,
		mmdCamera: MmdCamera,
		camera: ArcRotateCamera,
	): void {
		const defaultPipeline = new DefaultRenderingPipeline(
			"default",
			true,
			scene,
			[mmdCamera, camera],
		);
		defaultPipeline.samples = 4;
		defaultPipeline.bloomEnabled = false;
		defaultPipeline.chromaticAberrationEnabled = true;
		defaultPipeline.chromaticAberration.aberrationAmount = 1;
		defaultPipeline.fxaaEnabled = true;
		defaultPipeline.imageProcessingEnabled = false;
	}

	// XRエクスペリエンスを設定するメソッド
	private async setupXRExperience(
		scene: Scene,
		ground: TransformNode,
		_mmdCamera: MmdCamera,
		camera: ArcRotateCamera,
	): Promise<WebXRDefaultExperience> {
		const xr = await WebXRDefaultExperience.CreateAsync(scene, {
			uiOptions: {
				sessionMode: "immersive-vr",
				referenceSpaceType: "local-floor",
			},
			disableDefaultUI: true,
			disableTeleportation: true,
		});

		const featuresManager = xr.baseExperience.featuresManager;
		featuresManager.enableFeature(
			WebXRFeatureName.POINTER_SELECTION,
			"stable",
			{
				xrInput: xr.input,
				enablePointerSelectionOnAllControllers: true,
			},
		);

		featuresManager.enableFeature(WebXRFeatureName.TELEPORTATION, "stable", {
			xrInput: xr.input,
			floorMeshes: [ground],
			snapPositions: [new Vector3(2.4 * 3.5 * 1, 0, -10 * 1)],
		});

		// 右スティック入力で位置を移動する
		xr.input.onControllerAddedObservable.add((controller) => {
			controller.onMotionControllerInitObservable.add((motionController) => {
				if (motionController.handedness === "right") {
					const thumbstick = motionController.getComponent(
						"xr-standard-thumbstick",
					);
					if (thumbstick) {
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
									.scale(axes.y * 0.5)
									.add(right.scale(axes.x * 0.5));

								xr.baseExperience.camera.position.addInPlace(movement);
							}
						});
					}
				}
			});
		});

		// スティック以外のボタンが押されたらXRモードを終了する
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

		featuresManager.enableFeature(WebXRFeatureName.TELEPORTATION, "stable", {
			xrInput: xr.input,
			floorMeshes: [ground],
			defaultTargetMeshOptions: {
				teleportationRadius: 2,
				torusArrowMaterial: null,
			},
			useMainComponentOnly: true,
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

				scene.activeCamera = camera;
			}
		});

		return xr;
	}

	// VRモードに入るボタンを設定する
	private setupEnterVrButton(
		xr: WebXRDefaultExperience,
		scene: Scene,
		_camera: ArcRotateCamera,
		_mmdCamera: MmdCamera,
	): void {
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
	}
}
