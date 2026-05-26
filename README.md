# WorldChestFinder

Minecraft Java Edition ワールド（Anvil 形式）から `Items` タグを持つ Block Entity / Entity を検出し、Minecraft 風チェスト UI で表示・検索・編集する Electron デスクトップアプリです。

## Tech Stack

- TypeScript
- Electron + electron-vite
- React 19
- prismarine-nbt
- Vitest

## Features

- ワールド全体走査: `region/`, `entities/`, `poi/` 配下の `.mca` を再帰探索
- `Items` タグの再帰検出
- Minecraft 風 9 列チェストグリッド UI
- NBT / Pos（X・Y・Z） / ディメンション / コンテナタイプ / 最小アイテム数での検索
- スロット単位の編集と安全保存（`.bak` バックアップ + 一時ファイル経由の置換）

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
2. **スキャン** — コンテナ一覧を構築
3. コンテナを選択してチェスト UI で中身を確認
4. スロットをクリックして Item ID / Count を編集
5. **保存** — 変更を `.mca` に書き込み

初回起動時に resource pack（client.jar の assets）を自動ダウンロードします。

- ワールドに `resources.zip` がある場合はスキャン時に自動展開し、バニラより優先してテクスチャ解決します
- ダウンロード失敗時は **Fallback .minecraft** で `.minecraft` フォルダを指定できます

## Important

ワールド破損のリスクを避けるため、使用前に必ずワールド全体のバックアップを取得してください。
