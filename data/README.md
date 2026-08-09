# 道路データについて

`kagoshima_central_walking_roads.json` は、Web版の初期表示に使う鹿児島中央駅〜天文館周辺のOpenStreetMapデータです。

- 取得範囲: south 31.5755 / west 130.5322 / north 31.5987 / east 130.5637
- 取得日: 2026-08-06

Web版で別の地域を検索した場合は、その地域の道路・線路・駅と周辺施設データをOverpass APIからブラウザ内で取得します。道路は探索グラフに、鉄道と駅は地図表示に、コンビニ・学校・大学・スーパー・飲食店・医療施設・公園などは周辺検索に使用します。

`hayato_walking_roads.json` は、2026-08-01にOverpass APIから取得した隼人駅〜鹿児島高専周辺のOpenStreetMapデータです。

- 取得範囲: south 31.7265 / west 130.7220 / north 31.7490 / east 130.7470
- ライセンス: Open Data Commons Open Database License (ODbL) 1.0
- 著作権表示: Data © OpenStreetMap contributors
- 詳細: <https://www.openstreetmap.org/copyright>

再取得コマンド:

```powershell
python fetch_osm_data.py `
  --bbox 31.7265 130.7220 31.7490 130.7470 `
  --output data/hayato_walking_roads.json
```
