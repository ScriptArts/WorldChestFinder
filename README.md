# WorldChestFinder

Minecraft Java Edition ワールド（Anvil 形式）から `Items` タグを持つ Block Entity / Entity を検出し、Minecraft 風チェスト UI で表示・検索・編集する Electron デスクトップソフトウェアです。

## 対応 Minecraft バージョン

### サポート対象

- **Minecraft Java Edition 1.18 以降** の Anvil ワールド（`region/` 等の `.mca`）
- チャンク NBT は **`Level` ラッパーなし**の現行形式（1.18 以降）
- Block Entity / アイテム ID は **`minecraft:` 名前空間付き**形式

### `level.dat` と DataVersion

スキャン時にワールド直下の **`level.dat`** を読み取り、次の用途に使います。

| 用途 | 内容 |
|------|------|
| **対応可否の判定** | `DataVersion` が 2860（1.18）未満のワールドは編集・保存不可 |
| **GUI の個数表示** | チェスト UI 等で表示する個数を解釈する際の優先順位 |
| **空スロットの SNBT テンプレート** | 新規編集時の初期 SNBT を生成する際の `Count` / `count` 選択 |

`Version.Name`（例: `1.21.11`）はヘッダー表示用です。

### item 個数（`Count` / `count`）の扱い

Minecraft では item NBT の個数フィールド名がバージョンによって異なります。

- **1.20.4 以前**: `Count`（byte）が主流
- **1.20.5 以降**: `count`（int）が主流

本ソフトウェアの基本方針は **SNBT を正本とする** ことです。

| 操作 | 挙動 |
|------|------|
| **スキャン** | ディスク上の NBT を SNBT（`raw`）として保持 |
| **保存・DnD・SlotEditor 適用** | SNBT の内容をそのまま NBT に書き込む（フィールド名の変換は行わない） |
| **GUI 表示** | `DataVersion` に応じて `Count` / `count` のどちらを個数として読むか決める（両方ある場合はバージョンに応じた方を優先） |
| **空スロットの初期 SNBT** | `DataVersion` に応じたテンプレートを SlotEditor に表示 |

つまり、**保存時に DataVersion から `Count` / `count` を書き換えることはありません。** ユーザーが SNBT で指定した NBT がそのままワールドに保存されます。

### 非対応

- 1.18 未満の旧 Anvil 形式（`Level` ラッパー、`TileEntities` 主体のチャンク等）
- エンダーチェスト・プレイヤーインベントリ（スキャン対象外）

### テクスチャ

UI のアイテムテクスチャは起動時に **最新リリース**の client.jar assets を取得して表示します。ワールドのバージョンと異なる場合があります。

## Tech Stack

- TypeScript
- Electron + electron-vite
- React 19
- prismarine-nbt
- Vitest

## Features

- ワールド走査: `region/`、`entities/` 等配下の `.mca` を再帰探索（`poi/` は対象外）
- `Items` タグの再帰検出（Block Entity / Entity）
- Minecraft 風 9 列チェストグリッド UI
- NBT / Pos（X・Y・Z） / ディメンション / コンテナタイプ / 最小アイテム数での検索
- スロット単位の SNBT 編集、DnD による移動
- 安全保存（`.bak` バックアップ + 一時ファイル経由の置換）

## Setup

```bash
npm install
npm run dev
```

## Test

```bash
npm test
```

## Build

```bash
npm run build
npm run package
```

## Usage

1. **ワールド選択** — Minecraft ワールドフォルダ（`level.dat` があるディレクトリ）を選択
2. **スキャン** — コンテナ一覧を構築（`DataVersion` を読み取り、ヘッダーに表示）
3. コンテナを選択してチェスト UI で中身を確認
4. スロットをクリックし、SlotEditor で **NBT（SNBT）** を編集して「適用」（または DnD で移動）
5. **保存** — 変更を `.mca` に書き込み

初回起動時に resource pack（client.jar の assets）を自動ダウンロードします。

- ワールドに `resources.zip` がある場合はスキャン時に自動展開し、バニラより優先してテクスチャ解決します
- ダウンロード失敗時は **Fallback .minecraft** で `.minecraft` フォルダを指定できます

## Important

ワールド破損のリスクを避けるため、使用前に必ずワールド全体のバックアップを取得してください。
