(() => {
  const $ = (id) => document.getElementById(id);

  const state = {
    watchId: null,
    current: null,
    records: [],
    mileage: 0,
    // auto trip
    autoOn: false,
    tripRunning: false,
    tripKm: 0,
    lastPoint: null
  };

  const STORAGE_KEY = "gpsMileageTool_v2";
  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      records: state.records,
      mileage: state.mileage,
      tripKm: state.tripKm,
      autoOn: state.autoOn
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
      state.tripKm = Number(data.tripKm || 0);
      state.autoOn = !!data.autoOn;
    } catch(e) {}
  }

  const fmtTs = (ts) => {
    const d = new Date(ts);
    const pad = (n)=> String(n).padStart(2,'0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  function updatePositionUI(pos) {
    if (!pos) return;
    const {lat, lng, acc, ts, speedKmh} = pos;
    $("lat").textContent = lat?.toFixed(6) ?? "–";
    $("lng").textContent = lng?.toFixed(6) ?? "–";
    $("acc").textContent = acc?.toFixed(1) ?? "–";
    $("speed").textContent = (speedKmh ?? 0).toFixed(1);
    $("ts").textContent = ts ? fmtTs(ts) : "–";
    const url = `https://www.google.com/maps?q=${lat},${lng}`;
    $("mapLink").href = url;
  }

  function updateMileageUI() {
    $("mileageDisplay").textContent = Number(state.mileage || 0).toFixed(2);
    $("autoMileage").textContent = Number(state.tripKm || 0).toFixed(2);
  }

  function updateCounts() {
    $("recordCount").textContent = state.records.length;
  }

  function renderRecords() {
    const container = $("records");
    container.innerHTML = "";
    state.records.slice().reverse().forEach((r) => {
      const div = document.createElement("div");
      div.className = "record";
      div.innerHTML = `
        <div><strong>${fmtTs(r.ts)}</strong></div>
        <div>(${r.lat.toFixed(6)}, ${r.lng.toFixed(6)}) ・ 誤差 ${r.acc?.toFixed(1) ?? "-"} m ・ 速度 ${(r.speedKmh ?? 0).toFixed(1)} km/h</div>
        <div>里程：<strong>${(r.mileage ?? 0).toFixed(2)} km</strong>（自動里程 ${(r.tripKm ?? 0).toFixed(2)} km）</div>
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

  // --- Haversine ---
  function haversine(a, b) {
    const R = 6371000; // meters
    const toRad = (x)=> x * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const s1 = Math.sin(dLat/2), s2 = Math.sin(dLng/2);
    const q = s1*s1 + Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*s2*s2;
    return 2 * R * Math.asin(Math.sqrt(q)); // meters
  }

  function shouldAccumulate(prev, curr, cfg) {
    if (!prev) return false;
    if (curr.acc != null && curr.acc > cfg.accThresh) return false;
    const d = haversine(prev, curr); // meters
    if (d < cfg.stepThresh) return false;
    // speed guard (if time between points known)
    const dt = (curr.ts - prev.ts) / 1000; // seconds
    if (dt > 0) {
      const v_kmh = (d/ dt) * 3.6;
      if (v_kmh > cfg.speedMax) return false;
    }
    return true;
  }

  function doAccumulate(prev, curr, cfg) {
    const d_m = haversine(prev, curr);
    const d_km = (d_m / 1000) * cfg.scaleFactor;
    state.tripKm += d_km;
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
        const { latitude, longitude, accuracy, speed } = p.coords;
        const speedKmh = (speed != null && !Number.isNaN(speed)) ? (speed * 3.6) : null;
        const curr = { lat: latitude, lng: longitude, acc: accuracy, ts: Date.now(), speedKmh };
        state.current = curr;
        $("status").textContent = "已取得定位";
        updatePositionUI(curr);

        // auto mileage
        if (state.autoOn && state.tripRunning) {
          const cfg = {
            accThresh: Number($("#accThresh").value || 25),
            stepThresh: Number($("#stepThresh").value || 5),
            speedMax: Number($("#speedMax").value || 180),
            scaleFactor: Number($("#scaleFactor").value || 1)
          };
          if (curr.acc != null && curr.acc <= cfg.accThresh) {
            if (shouldAccumulate(state.lastPoint, curr, cfg)) {
              doAccumulate(state.lastPoint, curr, cfg);
              updateMileageUI();
              save();
            }
            state.lastPoint = {lat: curr.lat, lng: curr.lng, ts: curr.ts};
          }
        }
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
    if (!state.current) { alert("尚未取得定位，請先開始定位。"); return; }
    const note = $("noteInput").value.trim();
    const rec = {
      ts: Date.now(),
      lat: state.current.lat,
      lng: state.current.lng,
      acc: state.current.acc,
      speedKmh: state.current.speedKmh,
      note,
      mileage: Number(state.mileage || 0),
      tripKm: Number(state.tripKm || 0)
    };
    state.records.push(rec);
    save();
    renderRecords();
  }

  async function shareLandmark(lat, lng, note) {
    const url = `https://www.google.com/maps?q=${lat},${lng}`;
    const text = `位置：${lat.toFixed(6)}, ${lng.toFixed(6)}\n${note ? "備註：" + note + "\n" : ""}${url}`;
    if (navigator.share) {
      try { await navigator.share({ title: "地標", text, url }); } catch(e) {}
    } else {
      try {
        await navigator.clipboard.writeText(text);
        alert("已複製地標內容，可貼上至聊天軟體。");
      } catch(e) {
        prompt("此瀏覽器不支援自動複製，請手動複製：", text);
      }
    }
  }

  function exportExcel() {
    const rows = [["時間","緯度","經度","誤差(m)","速度(km/h)","里程(km)","自動里程(km)","備註","地圖連結"]];
    for (const r of state.records) {
      const mapUrl = `https://www.google.com/maps?q=${r.lat},${r.lng}`;
      rows.push([fmtTs(r.ts), r.lat, r.lng, r.acc ?? "", (r.speedKmh ?? ""), Number(r.mileage || 0), Number(r.tripKm || 0), r.note || "", mapUrl]);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{wch:20},{wch:11},{wch:11},{wch:8},{wch:10},{wch:10},{wch:12},{wch:30},{wch:24}];

    const totalMileage = Number(state.mileage || 0);
    const summary = [
      ["摘要",""],
      ["總里程 (手動) km", totalMileage],
      ["自動里程 (行程) km", Number(state.tripKm || 0)],
      ["記錄筆數", state.records.length],
      ["匯出時間", fmtTs(Date.now())],
      ["自動里程設定", ""],
      ["精度門檻(m)", $("#accThresh").value],
      ["最小步長(m)", $("#stepThresh").value],
      ["速度上限(km/h)", $("#speedMax").value],
      ["校正係數", $("#scaleFactor").value]
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(summary);
    ws2["!cols"] = [{wch:24},{wch:24}];

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

  // UI events
  $("btnStart").addEventListener("click", startWatch);
  $("btnStop").addEventListener("click", stopWatch);
  $("btnAddRecord").addEventListener("click", addRecord);
  $("btnExport").addEventListener("click", exportExcel);
  $("btnClearRecords").addEventListener("click", clearRecords);
  $("btnShare").addEventListener("click", () => {
    if (!state.current) { alert("尚未取得定位，請先開始定位。"); return; }
    const note = $("noteInput").value.trim();
    shareLandmark(state.current.lat, state.current.lng, note);
  });

  $("btnSaveMileage").addEventListener("click", () => {
    const val = Number($("mileageInput").value);
    if (Number.isNaN(val)) { alert("請輸入數字。"); return; }
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
  $("btnUseAuto").addEventListener("click", () => {
    state.mileage = Number(state.tripKm || 0);
    $("mileageInput").value = state.mileage.toFixed(2);
    updateMileageUI();
    save();
  });

  // Auto mileage controls
  $("autoMileageToggle").addEventListener("change", (e) => {
    state.autoOn = e.target.checked;
    document.querySelector(".autoPanel").classList.toggle("hidden", !state.autoOn);
    save();
  });
  $("btnTripStart").addEventListener("click", () => {
    state.tripRunning = true;
    state.lastPoint = state.current ? {lat: state.current.lat, lng: state.current.lng, ts: state.current.ts} : null;
  });
  $("btnTripPause").addEventListener("click", () => {
    state.tripRunning = false;
  });
  $("btnTripReset").addEventListener("click", () => {
    if (!confirm("重設行程里程？")) return;
    state.tripKm = 0;
    state.lastPoint = null;
    updateMileageUI();
    save();
  });

  // Init
  load();
  // reflect toggle
  $("autoMileageToggle").checked = state.autoOn;
  document.querySelector(".autoPanel").classList.toggle("hidden", !state.autoOn);
  updateMileageUI();
  updateCounts();
  renderRecords();
})();