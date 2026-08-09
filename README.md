# ナビ最短経路ラボ

日本全国の任意の地域で道路グラフを読み込み、BFS・ダイクストラ法・A*探索の動きを可視化するWeb教材です。

## 公開サイト

[GitHub Pagesでナビ最短経路ラボを開く](https://murayu427.github.io/shortest-route-navigation/)

## 主な機能

- BFS・ダイクストラ法・A*探索の切り替え
- 駅名・住所・施設名を使った日本全国の場所検索
- スタート地点とゴール地点の検索・地図上での微調整
- コンビニ、小学校、中学校、高校、大学、スーパー、レストランなどの周辺属性検索
- 道路・線路・駅の表示
- 探索アニメーションの再生、一時停止、中止、速度変更
- 探索完了後のアニメーションGIF生成・ダウンロード
- スマートフォン・タブレット・PCに対応したレスポンシブ表示

## ローカルで開く

ブラウザの制限により、`index.html` を直接開くのではなく簡易Webサーバーから表示してください。

```powershell
python -m http.server 8000
```

その後、ブラウザで <http://localhost:8000/> を開きます。ビルド作業やパッケージのインストールは不要です。

## 公開ファイルの構成

- `index.html` — 画面構造
- `styles.css` — レイアウトとレスポンシブデザイン
- `app-config.js` — API接続先・距離上限・初期データの設定
- `route-core.js` — 道路グラフ構築とBFS・ダイクストラ法・A*探索
- `app.js` — 場所検索、道路取得、Canvas描画、探索アニメーション
- `gif-encoder.js` — 探索結果をブラウザ内でGIFへ変換
- `data/kagoshima_central_walking_roads.json` — 初期表示用の道路・駅・施設データ

## GitHub Pages

すべて相対パスで読み込む静的サイトのため、`main` ブランチのルートをGitHub Pagesの公開元として使用できます。サーバー側プログラムは不要です。

場所検索時はNominatim、選択地域の道路・線路・駅・周辺施設の取得時はOverpass APIへブラウザから接続します。公開APIの負荷を抑えるため、検索間隔の制御、ブラウザ内キャッシュ、複数エンドポイントへの切り替え、取得範囲の分割を実装しています。

## 注意点とデータ出典

このサイトはアルゴリズム学習用です。通行止め、交通規制、工事、横断歩道の状態などをリアルタイム判定する実用ナビではありません。実際の移動には公式の交通情報やナビを確認してください。

- 道路・鉄道・施設データ: © OpenStreetMap contributors, ODbL 1.0
- 場所検索: Nominatim / © OpenStreetMap contributors
- [OpenStreetMap Copyright and License](https://www.openstreetmap.org/copyright)
- [Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/)
- [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API)
