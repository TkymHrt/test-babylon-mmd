# test-babylon-mmd

このプロジェクトは、以下の技術を使用して構築された Web ベースの MMD（MikuMikuDance）ビューアです。基本的に [babylon-mmd](https://github.com/noname0310/babylon-mmd) のサンプルを参考にしています。

## 使用技術

- **Vite**: 高速なビルドツールと開発サーバー。
- **Vanilla TypeScript**: 型安全な JavaScript 開発のための TypeScript。
- **Biome**: コードのフォーマットとリンティングのためのツール。
- **Babylon.js**: 強力な 3D レンダリングエンジン。
- **babylon-mmd**: Babylon.js で MMD モデルを読み込み、表示するためのライブラリ。

## はじめに

プロジェクトを始めるには、以下の手順に従ってください：

1. **リポジトリをクローン**:

   ```sh
   git clone https://github.com/your-repo/test-babylon-mmd.git
   cd test-babylon-mmd
   ```

2. **依存関係をインストール**:

   ```sh
   bun install
   ```

3. **必要なファイルを public フォルダに追加**:
   bpmx ファイルと bvmd ファイル、および音声ファイルを `public` フォルダにコピーします。

   - bpmx ファイルと bvmd ファイルは、babylon-mmd の作者が提供する変換ページを使用して、pmx と vmd ファイルを変換してください。
     - [pmx converter](https://noname0310.github.io/babylon-mmd/pmx_converter)
     - [vmd converter](https://noname0310.github.io/babylon-mmd/vmd_converter)

   - **注意:** 任意の bpmx や bvmd ファイルを使用する場合は、`SceneBuilder.ts` ファイル内でファイルパスを変更する必要があります。

4. **開発サーバーを実行**:

   ```sh
   bun run dev
   ```

5. **ブラウザを開く**: `http://localhost:5173` にアクセスして、MMD Web Viewer を表示します。

## 特徴

- MMD モデルの読み込みと表示。
- Babylon.js を使用したインタラクティブな 3D レンダリング。
- TypeScript による型安全な開発。
- Biome によるコードフォーマットとリンティング。
- VR 対応で、VR デバイスを使用して MMD モデルを鑑賞可能。

## 謝辞

- [Vite](https://vitejs.dev/)
- [TypeScript](https://www.typescriptlang.org/)
- [Biome](https://biomejs.com/)
- [Babylon.js](https://www.babylonjs.com/)
- [babylon-mmd](https://github.com/noname0310/babylon-mmd)
