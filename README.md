# WorldChestFinder

Minecraft Java Edition のワールド（Anvil 形式）から、チェストなど `Items` タグを持つブロックエンティティ・エンティティを探し出し、Minecraft 風の UI で中身を表示・検索・編集できるデスクトップソフトウェアです。

## 対応バージョン

### 使えるワールド

- **Minecraft Java Edition 26.x** のワールド構成
- 次元は **`dimensions/<名前空間>/<パス>/`** に並ぶ形式（標準の 3 次元も含む）
- 各次元の **`region/`（ブロックエンティティ）** と **`entities/`（エンティティ）** を走査します（`poi/` は対象外）
- ブロックエンティティ / アイテム ID は **`minecraft:` 付き**形式

### `level.dat` の読み取り

スキャン時にワールドフォルダ直下の **`level.dat`** を読み、`DataVersion` などを取得します。

| 用途 | 説明 |
|------|------|
| **編集可否の判定** | `dimensions/minecraft/overworld/` が無いワールド（旧構成）は編集・保存できません |
| **画面での表示** | `Version.Name`（例: `26.2`）と `DataVersion` を画面上部に表示します |

### アイテム個数（`count`）

本ソフトウェアは **SNBT を正本** として扱います。

| 操作 | 挙動 |
|------|------|
| **スキャン** | ワールド上の NBT を SNBT として保持 |
| **保存・ドラッグ&ドロップ・適用** | SNBT の内容をそのまま書き込む（フィールド名の変換はしない） |
| **画面表示** | `count`（int）を読む（古い `Count` が残っている場合はそれで代用） |
| **空スロットの初期表示** | `count`（int）を使った SNBT テンプレートを表示 |

保存時にフィールド名を書き換えることはありません。SNBT で指定した内容がそのままワールドに保存されます。

### 非対応

- 1.21 以前の旧ワールド構成（ワールド直下の `region/`、`DIM-1`、`DIM1`）
- エンダーチェスト・プレイヤーインベントリ

### テクスチャについて

アイテム画像は起動時に **最新リリース**の client.jar から取得します。ワールドのバージョンと見た目が一致しない場合があります。

## 主な機能

- ワールド内の `.mca` を走査（`region/`、`entities/` など。`poi/` は対象外）
- `Items` タグを持つブロックエンティティ・エンティティの検出
- Minecraft 風の 9 列チェスト UI
- NBT・座標（X/Y/Z）・ディメンション・コンテナ種別・最小アイテム数での検索
- スロット単位の SNBT 編集、ドラッグ&ドロップでの移動
- 安全な保存（`.bak` バックアップ、一時ファイル経由の置換）

## 使い方

1. **ワールド選択** — `level.dat` があるワールドフォルダを選ぶ
2. **スキャン** — コンテナ一覧を作成（`DataVersion` を読み取り、画面上部に表示）
3. コンテナを選び、チェスト UI で中身を確認
4. スロットをクリックし、SNBT を編集して「適用」（またはドラッグ&ドロップで移動）
5. **保存** — 変更を `.mca` に書き込む

初回起動時は resource pack（client.jar の assets）を自動ダウンロードします。

- ワールドに `resources.zip` がある場合、スキャン時に展開し、バニラより優先してテクスチャを表示します
- ダウンロードに失敗した場合は、**.minecraft フォルダの指定** から代替パスを選べます

## 注意

**必ずワールド全体のバックアップを取ってから** ご利用ください。保存処理によりワールドデータが破損する可能性があります。

## 開発者向け

### 使用技術

- TypeScript
- Electron + electron-vite
- React 19
- [SpringNBTLibrary](https://github.com/ScriptArts/SpringNBTLibrary)（NBT / SNBT / Anvil リージョンの読み書き）
- Vitest

### NBT / ワールドの読み書き

NBT・SNBT・Anvil リージョン（`.mca`）の解析と書き込みは、すべて
**SpringNBTLibrary** に任せています（自前実装はしません）。

| 処理 | 使うもの |
|------|----------|
| ワールドを開く・`level.dat`・次元の解決 | `MinecraftWorld` / `Dimension`（`spring-nbt-library/world`） |
| `.mca` の読み書き | `RegionFile`（`spring-nbt-library/anvil`） |
| SNBT の解析・整形 | `snbt.parseCompound` / `snbt.writePretty` |
| NBT のタグ操作 | `NbtCompound` / `NbtList` などのタグ型 |

ライブラリは npm レジストリに公開されていないため、リリース配布物の tarball を
`vendor/spring-nbt-library-<版>.tgz` に置き、`package.json` から `file:` 参照しています。
ESM 専用パッケージなので、`electron.vite.config.ts` で main / preload のバンドルへ取り込んでいます。

ライブラリは Node.js 前提（`node:fs` などを使う）のため renderer からは読み込めません。
SlotEditor の SNBT 解析（`world:parse-item-snbt`）と、空スロットの SNBT テンプレート生成
（`world:build-empty-slot-snbt`）は IPC 経由で main プロセスへ委ねています。

唯一の例外は SlotEditor のシンタックスハイライト
（[snbtHighlightPlugin.ts](src/renderer/src/lib/snbt/snbtHighlightPlugin.ts)）です。
これは CodeMirror の表示を色分けするだけの正規表現ベースの処理で、
NBT の読み書きには一切関与しません（ライブラリはトークン列を公開していないため自前のままです）。

### セットアップ

```bash
npm install
npm run dev
```

### テスト

```bash
npm test
```

### ビルド

```bash
npm run build
npm run package
```
