# GPS 里程小工具

一個可在手機瀏覽器使用的單頁網頁工具：
- 取得 GPS 定位（需要授權）
- 新增地標記錄（含時間、經緯度、誤差、里程與備註）
- 手動輸入並記憶里程數（保存在瀏覽器的 localStorage）
- 一鍵輸出 Excel（.xlsx），含「摘要」與「記錄」兩張工作表
- 「傳送地標」支援 Web Share API（若瀏覽器支援），否則提供複製文字備援

## 使用方式
1. 下載並解壓縮本專案 ZIP。
2. 直接以瀏覽器開啟 `index.html`（建議使用 Chrome/Edge/Firefox/Safari 最新版）。
3. 點「開始定位」授權後即可看到目前座標；可按「新增記錄」保存該點。
4. 在「里程數」區塊輸入本次行程里程（km），點「儲存」後將會記憶。
5. 完成後按「生成 Excel」即可匯出 `xlsx`。

> 注意：資料僅儲存在使用者裝置的瀏覽器中，如清除瀏覽器資料將會一併刪除。

## 權限與相容性
- 使用 **Geolocation API** 取得定位；在 iOS Safari 上需 HTTPS 或 localhost。
- 分享功能使用 **Web Share API**，若裝置不支援則會改為複製到剪貼簿。
- 匯出 Excel 透過 **SheetJS (CDN)**：
  ```html
  <script src="https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js"></script>
  ```

## 欄位說明
- **時間**：本機時間（YYYY-MM-DD HH:mm:ss）
- **緯度/經度**：小數點 6 位
- **誤差 (m)**：定位精度（公尺）
- **里程 (km)**：當下保存的里程數
- **備註**：自由文字
- **地圖連結**：Google Maps 快速開啟

## 常見問題
- **為什麼沒出現定位？** 請確認瀏覽器已授權定位；iOS 需在 Safari 設定中允許定位，並以 HTTPS 網站開啟。
- **可以在桌面電腦使用嗎？** 可以，但桌機的定位精度可能較差。
- **可以離線用嗎？** 首次載入需要網路以取得 SheetJS；之後若快取仍在，匯出可離線運作。

