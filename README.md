# 暗燼迴廊（試作版）

黑暗風格網頁 roguelike，Phaser 3 + TypeScript + Vite。手機（橫向）與電腦瀏覽器皆可遊玩。

## 指令

```bash
npm install
npm run dev        # 開發伺服器 http://localhost:5173
npm test           # core 邏輯單元測試（vitest）
npm run build      # 型別檢查 + 打包到 dist/
npm run i18n:sync  # 依 zh-TW.ts 同步 en.ts 的 key
```

## 部署到 GitHub Pages

推到 GitHub 的 `main` 分支後，`.github/workflows/deploy.yml` 會自動測試、打包並部署。
第一次需要到 repo 的 **Settings → Pages → Source** 選擇 **GitHub Actions**。

## 操作

| 動作 | 電腦 | 手機 |
| --- | --- | --- |
| 移動 | WASD / 方向鍵 | 左下虛擬搖桿 |
| 小技能 / 大招 | Q E R / F | 右下按鈕 |
| 藥水 1–5 | 1–5 | 下方藥水欄 |
| 手動攻擊 | Space | 攻擊按鈕 |
| 鎖定 / 解除 | 點擊敵人 / ESC 或點空地 | 點擊敵人 / 點空地或解除按鈕 |
| 裝備、地圖、暫停 | C、M、P | 右上按鈕、點小地圖 |

## 結構

```
src/
  config/   所有數值與設定（職業、怪物、藥水、裝備、商店、地圖、鍵位、色票）
  i18n/     字典（zh-TW 完整、en 保留 key）與 t()
  core/     純邏輯，不依賴 Phaser：地圖生成、傷害、選目標、換格判斷、存檔資料
  save/     localStorage 存檔與設定
  state/    執行期全域狀態（目前這一局、設定）
  entities/ 玩家、怪物、投射物、紅色預警區
  systems/  輸入、普攻、怪物 AI、技能、藥水
  scenes/   各畫面（主選單、職業、地圖、格子、HUD、商店、對話框、設定、結算）
  ui/       按鈕、血條、面板、虛擬搖桿
tests/      core 單元測試
```

## 擴充點

- **技能效果**：在 `src/systems/SkillSystem.ts` 的 `SKILL_HANDLERS` 以技能 id 註冊 handler。
- **裝備屬性生效**：`src/config/player.ts` 的 `applyEquipmentStats` 改為 `true`。
- **多人換格**：`core/roomTransition.ts` 的 `canTransition()` 已接受玩家陣列，規則為所有玩家都靠近同一邊。
- **多層地圖**：`generateFloor({ floor, seed })` 已參數化，`RunState.floor` 已存在。
- **英文**：填 `src/i18n/en.ts`，並把 `'en'` 加入 `AVAILABLE_LOCALES`。
