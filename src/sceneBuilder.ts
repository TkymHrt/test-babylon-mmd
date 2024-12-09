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

export class SceneBuilder implements ISceneBuilder {
	// ロードするファイルのパスを定数として定義
	private readonly MOTION_FILE_PATH = "/gimme_gimme_motion.bvmd";
	private readonly CAMERA_MOTION_FILE_PATH = "/GimmeGimmeC.bvmd";
	private readonly MODEL_FILE_PATH = "/sour_miku_black.bpmx";
	private readonly AUDIO_FILE_PATH = "/gimme_gimme.wav";

	// シーン内で使用するプロパティを定義
	private engine!: AbstractEngine;
	private scene!: Scene;
	private canvas!: HTMLCanvasElement;

	// カメラのルートノードを追加
	private cameraRoot!: TransformNode;

	public async build(
		canvas: HTMLCanvasElement,
		engine: AbstractEngine,
	): Promise<Scene> {
		try {
			this.engine = engine;
			this.canvas = canvas;

			// エンジンとシーンの初期設定
			this.initializeEngine();
			this.scene = new Scene(engine);
			this.setupScene();

			// 必要な要素を作成
			const mmdRoot = this.createMmdRoot();
			const mmdCamera = this.createMmdCamera(mmdRoot);
			const directionalLight = this.createDirectionalLight();
			const ground = this.createGround(directionalLight, mmdRoot);
			const audioPlayer = this.setupAudioPlayer();

			// ローディングUIの設定
			this.setupLoadingUI();

			// アセットを並行してロード
			const [wasmInstance, mmdAnimation, cameraAnimation, modelMesh] =
				await this.loadAssets(mmdRoot);

			// ローディングUIを非表示
			this.hideLoadingUI();

			// MMDランタイムの設定
			this.setupMmdRuntime(
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
			this.setupRenderingPipeline(mmdCamera);

			// XRエクスペリエンスの設定
			const xr = await this.setupXRExperience(ground, mmdCamera);

			// VRモードのボタンを設定
			this.setupEnterVrButton(xr);

			return this.scene;
		} catch (error) {
			console.error("シーンの構築中にエラーが発生しました:", error);
			throw error;
		}
	}

	// エンジンの初期設定
	private initializeEngine(): void {
		// SDEFを適用するためにエンジンをオーバーライド
		SdefInjector.OverrideEngineCreateEffect(this.engine);
		// カスタムテクスチャローダーを登録
		registerDxBmpTextureLoader();
	}

	// シーンの基本設定を行う
	private setupScene(): void {
		this.scene.clearColor = new Color4(0.95, 0.95, 0.95, 1.0);
		this.scene.ambientColor = new Color3(0.5, 0.5, 0.5);
	}

	// MMDのルートノードを作成する
	private createMmdRoot(): TransformNode {
		const mmdRoot = new TransformNode("mmdRoot", this.scene);
		mmdRoot.position.z = 20;
		return mmdRoot;
	}

	// MMDのカメラを作成する
	private createMmdCamera(mmdRoot: TransformNode): MmdCamera {
		const mmdCamera = new MmdCamera(
			"mmdCamera",
			new Vector3(0, 10, 0),
			this.scene,
		);
		mmdCamera.maxZ = 300;
		mmdCamera.minZ = 1;
		mmdCamera.parent = mmdRoot;
		mmdCamera.attachControl(this.canvas, false);
		mmdCamera.inertia = 0.8;
		return mmdCamera;
	}

	// ディレクショナルライトを作成する
	private createDirectionalLight(): DirectionalLight {
		const directionalLight = new DirectionalLight(
			"DirectionalLight",
			new Vector3(0.5, -1, 1),
			this.scene,
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

	// 地面を作成する
	private createGround(
		directionalLight: DirectionalLight,
		mmdRoot: TransformNode,
	): TransformNode {
		const ground = CreateGround(
			"ground1",
			{ width: 100, height: 100, subdivisions: 2, updatable: false },
			this.scene,
		);
		const shadowOnlyMaterial = new ShadowOnlyMaterial("shadowOnly", this.scene);
		ground.material = shadowOnlyMaterial;
		shadowOnlyMaterial.activeLight = directionalLight;
		shadowOnlyMaterial.alpha = 0.4;
		ground.receiveShadows = true;
		ground.parent = mmdRoot;
		return ground;
	}

	// オーディオプレイヤーを設定する
	private setupAudioPlayer(): StreamAudioPlayer {
		const audioPlayer = new StreamAudioPlayer(this.scene);
		audioPlayer.preservesPitch = false;
		audioPlayer.source = this.AUDIO_FILE_PATH;
		return audioPlayer;
	}

	// ローディングUIの設定
	private setupLoadingUI(): void {
		this.engine.displayLoadingUI();
	}

	// ローディングUIを非表示にする
	private hideLoadingUI(): void {
		this.scene.onAfterRenderObservable.addOnce(() =>
			this.engine.hideLoadingUI(),
		);
	}

	// アセットを並行してロード
	private async loadAssets(
		_mmdRoot: TransformNode,
	): Promise<[MmdWasmInstance, MmdAnimation, MmdAnimation, MmdMesh]> {
		const materialBuilder = new MmdStandardMaterialBuilder();
		const bvmdLoader = new BvmdLoader(this.scene);
		bvmdLoader.loggingEnabled = true;
		SceneLoader.RegisterPlugin(new BpmxLoader());

		const loadingTexts: string[] = [];
		const updateLoadingText = (index: number, text: string): void => {
			loadingTexts[index] = text;
			this.engine.loadingUIText = `<br/><br/><br/><br/>${loadingTexts.join(
				"<br/><br/>",
			)}`;
		};

		return Promise.all([
			getMmdWasmInstance(new MmdWasmInstanceTypeSPR()),
			bvmdLoader.loadAsync("motion", this.MOTION_FILE_PATH, (event) =>
				updateLoadingText(
					0,
					`モーションを読み込み中... ${event.loaded}/${
						event.total
					} (${Math.floor((event.loaded * 100) / event.total)}%)`,
				),
			),
			bvmdLoader.loadAsync(
				"cameraMotion",
				this.CAMERA_MOTION_FILE_PATH,
				(event) =>
					updateLoadingText(
						1,
						`カメラモーションを読み込み中... ${event.loaded}/${
							event.total
						} (${Math.floor((event.loaded * 100) / event.total)}%)`,
					),
			),
			loadAssetContainerAsync(this.MODEL_FILE_PATH, this.scene, {
				onProgress: (event) =>
					updateLoadingText(
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
	}

	// MMDランタイムを設定する
	private setupMmdRuntime(
		wasmInstance: MmdWasmInstance,
		mmdAnimation: MmdAnimation,
		cameraAnimation: MmdAnimation,
		modelMesh: MmdMesh,
		mmdRoot: TransformNode,
		mmdCamera: MmdCamera,
		audioPlayer: StreamAudioPlayer,
		directionalLight: DirectionalLight,
	): void {
		const mmdRuntime = new MmdWasmRuntime(
			wasmInstance,
			this.scene,
			new MmdWasmPhysics(this.scene),
		);
		mmdRuntime.loggingEnabled = true;
		mmdRuntime.register(this.scene);

		mmdRuntime.setAudioPlayer(audioPlayer);
		mmdRuntime.playAnimation();

		const mmdPlayerControl = new MmdPlayerControl(
			this.scene,
			mmdRuntime,
			audioPlayer,
		);
		mmdPlayerControl.showPlayerControl();

		mmdRuntime.setCamera(mmdCamera);

		const mmdWasmAnimation = new MmdWasmAnimation(
			mmdAnimation,
			wasmInstance,
			this.scene,
		);
		const cameraWasmAnimation = new MmdWasmAnimation(
			cameraAnimation,
			wasmInstance,
			this.scene,
		);

		mmdCamera.addAnimation(cameraWasmAnimation);
		mmdCamera.setAnimation("cameraMotion");

		modelMesh.parent = mmdRoot;

		for (const mesh of modelMesh.metadata.meshes) mesh.receiveShadows = true;
		const shadowGenerator = this.createShadowGenerator(directionalLight);
		shadowGenerator.addShadowCaster(modelMesh);

		const mmdModel = mmdRuntime.createMmdModel(modelMesh);
		mmdModel.addAnimation(mmdWasmAnimation);
		mmdModel.setAnimation("motion");

		mmdRuntime.physics?.createGroundModel?.([0]);

		this.optimizeScene();
	}

	// シーンの最適化
	private optimizeScene(): void {
		this.scene.onAfterRenderObservable.addOnce(() => {
			this.scene.freezeMaterials();

			const meshes = this.scene.meshes;
			for (let i = 0, len = meshes.length; i < len; ++i) {
				const mesh = meshes[i];
				mesh.freezeWorldMatrix();
				mesh.doNotSyncBoundingInfo = true;
				mesh.isPickable = false;
				mesh.alwaysSelectAsActiveMesh = true;
			}

			this.scene.skipPointerMovePicking = true;
			this.scene.skipPointerDownPicking = true;
			this.scene.skipPointerUpPicking = true;
			this.scene.skipFrustumClipping = true;
			this.scene.blockMaterialDirtyMechanism = true;
		});
	}

	// レンダリングパイプラインを設定する
	private setupRenderingPipeline(mmdCamera: MmdCamera): void {
		const defaultPipeline = new DefaultRenderingPipeline(
			"default",
			true,
			this.scene,
			[mmdCamera],
		);
		defaultPipeline.samples = 4;
		defaultPipeline.fxaaEnabled = true;
	}

	// XRエクスペリエンスを設定する
	private async setupXRExperience(
		ground: TransformNode,
		mmdCamera: MmdCamera,
	): Promise<WebXRDefaultExperience> {
		const xr = await WebXRDefaultExperience.CreateAsync(this.scene, {
			uiOptions: {
				sessionMode: "immersive-vr",
				referenceSpaceType: "local-floor",
			},
			disableDefaultUI: true,
			disableTeleportation: true,
		});

		// カメラのルートノードを作成し、カメラの親に設定
		this.cameraRoot = new TransformNode("cameraRoot", this.scene);
		xr.baseExperience.camera.parent = this.cameraRoot;

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

								this.cameraRoot.position.addInPlace(movement);
							}
						});
					} else if (motionController.handedness === "left") {
						// 視点の回転操作
						thumbstick.onAxisValueChangedObservable.add((axes) => {
							if (xr.baseExperience.state === WebXRState.IN_XR) {
								const rotationSpeed = 0.05;
								this.cameraRoot.rotation.y -= axes.x * rotationSpeed;
								this.cameraRoot.rotation.x -= axes.y * rotationSpeed;
								// ピッチ角度を制限（必要に応じて調整）
								this.cameraRoot.rotation.x = Math.max(
									-Math.PI / 2,
									Math.min(Math.PI / 2, this.cameraRoot.rotation.x),
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
				const defaultPipeline = this.scene.postProcessRenderPipelineManager
					.supportedPipelines[0] as DefaultRenderingPipeline;
				defaultPipeline.fxaaEnabled = true;
				defaultPipeline.chromaticAberrationEnabled = true;

				const enterVrButton = document.getElementById("enterVrButton");
				if (enterVrButton) {
					enterVrButton.style.display = "block";
				}

				this.scene.activeCamera = mmdCamera;
			}
		});

		return xr;
	}

	// VRモードに入るボタンを設定する
	private setupEnterVrButton(xr: WebXRDefaultExperience): void {
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

			const defaultPipeline = this.scene.postProcessRenderPipelineManager
				.supportedPipelines[0] as DefaultRenderingPipeline;
			defaultPipeline.fxaaEnabled = false;
			defaultPipeline.chromaticAberrationEnabled = false;

			defaultPipeline.addCamera(xr.baseExperience.camera);

			this.scene.activeCamera = xr.baseExperience.camera;
			xr.baseExperience.camera.position.y = 10.0;

			enterVrButton.style.display = "none";
		});
	}
}
