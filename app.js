(() => {
  const $ = (id) => document.getElementById(id);

  const state = {
    watchId: null,
    current: null, // {lat, lng, acc, ts}
    records: [], // {ts, lat, lng, acc, note, mileage}
    mileage: 0
  };

  // --- Persistence helpers ---
  const STORAGE_KEY = "gpsMileageTool_v1";
  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      records: state.records,
      mileage: state.mileage
    }));
    updateCounts();
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      state.records = Array.isArray(data.records) ? data.records : [];
      state.mileage = Number(data.mileage || 0);
    } catch(e) {
      console.warn("Failed to load storage", e);
    }
  }

  // --- UI Bindings ---
  function fmtTs(ts) {
    const d = new Date(ts);
    const pad = (n)=> String(n).padStart(2,'0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function updatePositionUI(pos) {
    if (!pos) return;
    const {lat, lng, acc, ts} = pos;
    $("lat").textContent = lat?.toFixed(6) ?? "–";
    $("lng").textContent = lng?.toFixed(6) ?? "–";
    $("acc").textContent = acc?.toFixed(1) ?? "–";
    $("ts").textContent = ts ? fmtTs(ts) : "–";
    const url = `https://www.google.com/maps?q=${lat},${lng}`;
    $("mapLink").href = url;
  }

  function updateMileageUI() {
    $("mileageDisplay").textContent = Number(state.mileage || 0).toFixed(2);
  }

  function updateCounts() {
    $("recordCount").textContent = state.records.length;
  }

  function renderRecords() {
    const container = $("records");
    container.innerHTML = "";
    state.records.slice().reverse().forEach((r, idx) => {
      const div = document.createElement("div");
      div.className = "record";
      div.innerHTML = `
        <div><strong>${fmtTs(r.ts)}</strong></div>
        <div>(${r.lat.toFixed(6)}, ${r.lng.toFixed(6)}) ・ 誤差 ${r.acc?.toFixed(1) ?? "-"} m</div>
        <div>里程：<strong>${(r.mileage ?? 0).toFixed(2)} km</strong></div>
        <div>備註：<small>${r.note ? escapeHtml(r.note) : "—"}</small></div>
        <div class="row">
          <a class="link" href="https://www.google.com/maps?q=${r.lat},${r.lng}" target="_blank" rel="noopener">地圖</a>
          <button class="secondary" data-action="share" data-lat="${r.lat}" data-lng="${r.lng}" data-note="${encodeURIComponent(r.note || '')}">分享</button>
          <button class="danger" data-action="delete" data-ts="${r.ts}">刪除</button>
        </div>
      `;
      container.appendChild(div);
    });
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, m => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    })[m]);
  }

  // --- Geolocation ---
  function startWatch() {
    if (!navigator.geolocation) {
      $("status").textContent = "此裝置不支援定位。";
      return;
    }
    $("status").textContent = "定位中…";
    state.watchId = navigator.geolocation.watchPosition(
      (p) => {
        const { latitude, longitude, accuracy } = p.coords;
        state.current = { lat: latitude, lng: longitude, acc: accuracy, ts: Date.now() };
        $("status").textContent = "已取得定位";
        updatePositionUI(state.current);
      },
      (err) => {
        $("status").textContent = `定位失敗：${err.message}`;
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 }
    );
  }

  function stopWatch() {
    if (state.watchId != null) {
      navigator.geolocation.clearWatch(state.watchId);
      state.watchId = null;
      $("status").textContent = "已停止定位";
    }
  }

  // --- Actions ---
  function addRecord() {
    if (!state.current) {
      alert("尚未取得定位，請先開始定位。");
      return;
    }
    const note = $("noteInput").value.trim();
    const rec = {
      ts: Date.now(),
      lat: state.current.lat,
      lng: state.current.lng,
      acc: state.current.acc,
      note,
      mileage: Number(state.mileage || 0)
    };
    state.records.push(rec);
    save();
    renderRecords();
  }

  async function shareLandmark(lat, lng, note) {
    const url = `https://www.google.com/maps?q=${lat},${lng}`;
    const text = `位置：${lat.toFixed(6)}, ${lng.toFixed(6)}\n${note ? "備註：" + note + "\n" : ""}${url}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "地標", text, url });
      } catch(e) {
        // user cancelled
      }
    } else {
      // fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(text);
        alert("已複製地標內容，可貼上至聊天軟體。");
      } catch(e) {
        prompt("此瀏覽器不支援自動複製，請手動複製：", text);
      }
    }
  }

  function exportExcel() {
    const rows = [
      ["時間", "緯度", "經度", "誤差(m)", "里程(km)", "備註", "地圖連結"]
    ];
    for (const r of state.records) {
      const mapUrl = `https://www.google.com/maps?q=${r.lat},${r.lng}`;
      rows.push([fmtTs(r.ts), r.lat, r.lng, r.acc ?? "", Number(r.mileage || 0), r.note || "", mapUrl]);
    }

    // Data sheet
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [
      { wch: 20 }, { wch: 11 }, { wch: 11 }, { wch: 8 }, { wch: 10 }, { wch: 30 }, { wch: 24 }
    ];

    // Summary sheet
    const totalMileage = Number(state.mileage || 0);
    const summary = [
      ["摘要", ""],
      ["總里程 (km)", totalMileage],
      ["記錄筆數", state.records.length],
      ["匯出時間", fmtTs(Date.now())],
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(summary);
    ws2["!cols"] = [{ wch: 16 }, { wch: 20 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws2, "摘要");
    XLSX.utils.book_append_sheet(wb, ws, "記錄");

    const fname = `GPS里程_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.xlsx`;
    XLSX.writeFile(wb, fname);
  }

  function clearRecords() {
    if (!confirm("確定要清空所有記錄嗎？此動作無法復原。")) return;
    state.records = [];
    save();
    renderRecords();
  }

  // --- Event Listeners ---
  $("btnStart").addEventListener("click", startWatch);
  $("btnStop").addEventListener("click", stopWatch);
  $("btnAddRecord").addEventListener("click", addRecord);
  $("btnExport").addEventListener("click", exportExcel);
  $("btnClearRecords").addEventListener("click", clearRecords);
  $("btnShare").addEventListener("click", () => {
    if (!state.current) {
      alert("尚未取得定位，請先開始定位。");
      return;
    }
    const note = $("noteInput").value.trim();
    shareLandmark(state.current.lat, state.current.lng, note);
  });

  $("btnSaveMileage").addEventListener("click", () => {
    const val = Number($("mileageInput").value);
    if (Number.isNaN(val)) {
      alert("請輸入數字。");
      return;
    }
    state.mileage = val;
    updateMileageUI();
    save();
  });

  $("btnResetMileage").addEventListener("click", () => {
    if (!confirm("要把里程歸零嗎？")) return;
    state.mileage = 0;
    $("mileageInput").value = "";
    updateMileageUI();
    save();
  });

  $("records").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === "delete") {
      const ts = Number(btn.dataset.ts);
      const idx = state.records.findIndex(r => r.ts === ts);
      if (idx >= 0) {
        state.records.splice(idx, 1);
        save();
        renderRecords();
      }
    } else if (action === "share") {
      const lat = Number(btn.dataset.lat);
      const lng = Number(btn.dataset.lng);
      const note = decodeURIComponent(btn.dataset.note || "");
      shareLandmark(lat, lng, note);
    }
  });

  // --- Init ---
  load();
  updateMileageUI();
  updateCounts();
  renderRecords();
  updatePositionUI(null);

})();