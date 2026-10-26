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

## 多人連線（最多 4 人）

1. 一個人在主選單按「建立房間」，畫面上方會出現 4 碼房間代碼。
2. 其他人打開同一個網址按「加入房間」輸入代碼，或直接點房主複製的邀請連結（`?room=代碼`）。
3. 每個人選職業、按「準備好了」，房主按「開始遊戲」。

房主的瀏覽器負責跑遊戲邏輯，其他人用 [PeerJS](https://peerjs.com/) 點對點連過來，不需要另外架伺服器（做法與 farm-shop 相同）。
斷線或重新整理會自動接回原本的角色；房主關掉後在主選單按「繼續」，會用同一個房間代碼重新開房。

- 換格：所有活著的玩家都靠近同一邊才會換格
- 金幣、裝備、藥水、祭壇契約、寶箱、休息點都是各自的；擊殺金幣每人都拿一份
- 倒地後等隊友清空該格（或換格）就以 30% 血量復活，全員倒地才算失敗
- 每多一位玩家，怪物血量 +60%（`src/config/multiplayer.ts`）

## 操作

| 動作 | 電腦 | 手機 |
| --- | --- | --- |
| 移動 | WASD / 方向鍵 | 左下虛擬搖桿 |
| 小技能 / 大招 | Q E R / F | 右下按鈕 |
| 學習 / 升級技能 | Ctrl + Q E R F | 技能旁的「+」 |
| 藥水（一次只能帶一種） | 1 | 技能按鈕左側的藥水格 |
| 切換自動普攻（開＝自動普攻，關＝不普攻） | Space | 自動普攻按鈕 |
| 鎖定 / 解除 | 點擊敵人 / ESC 或點空地 | 點擊敵人 / 點空地或解除按鈕 |
| 裝備、地圖、暫停 | C、M、P | 右上按鈕、點小地圖 |

## 等級與技能

- 1–18 級，擊殺怪物得到經驗（多人時每人各拿一份），每升一級得到 1 個技能點，基礎數值也會成長。
- 技能一開始都沒學，只有被動生效。小技能最高 5 級，第 n 級需要角色 2n−1 級（9 級才能升滿一個）；大招最高 3 級，在 6／11／16 級學習與升級。
- 設定在 `src/config/leveling.ts`；各職業技能的冷卻、魔力、各等級數值在 `src/config/classes.ts`。
- 已實作：戰士（嗜血、重擊、獻祭、衝鋒、狂怒）。其他職業的技能效果尚未實作。

## 結構

```
src/
  config/   所有數值與設定（職業、怪物、藥水、裝備、商店、地圖、鍵位、色票）
  i18n/     字典（zh-TW 完整、en 保留 key）與 t()
  core/     純邏輯，不依賴 Phaser：地圖生成、傷害、選目標、換格判斷、存檔資料
  sim/      格子內的即時模擬（玩家、怪物、普攻、預警、互動、換格），由房主執行
  net/      連線：房主（GameHost）、畫面用的連線介面（net）、訊息格式
  save/     localStorage 存檔與設定
  state/    執行期全域狀態（目前這一局、設定）
  systems/  輸入整合、技能效果註冊表
  scenes/   各畫面（主選單、職業、地圖、格子、HUD、商店、對話框、設定、結算）
  ui/       按鈕、血條、面板、虛擬搖桿
tests/      core 單元測試
```

## 擴充點

- **技能效果**：在 `src/systems/SkillSystem.ts` 的 `SKILL_HANDLERS` 以技能 id 註冊 handler（在房主的模擬中執行，多人自動同步）。
- **裝備**：`src/config/equipment.ts`，武器限定職業，防具分重甲/輕甲/布甲。
- **多層地圖**：`generateFloor({ floor, seed })` 已參數化，`RunState.floor` 已存在。
- **英文**：填 `src/i18n/en.ts`，並把 `'en'` 加入 `AVAILABLE_LOCALES`。
