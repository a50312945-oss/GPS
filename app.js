(() => {
  const $ = (id) => document.getElementById(id);

  const state = {
    watchId: null,
    current: null,
    lastPoint: null,
    tracking: false,
    tripStartTs: null,
    tripEndTs: null,
    tripKm: 0,
    trips: []
  };

  const STORAGE_KEY = "gpsTripLogger_v1";
  function saveAll() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      trips: state.trips
    }));
    updateTripCount();
  }
  function loadAll() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      state.trips = Array.isArray(data.trips) ? data.trips : [];
    } catch(e) {}
  }

  const fmtTs = (ts) => {
    const d = new Date(ts);
    const pad = (n)=> String(n).padStart(2,'0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };
  const fmtHMS = (sec) => {
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60), s = sec%60;
    const pad = (n)=> String(n).padStart(2,'0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
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

  function updateTripUI() {
    const dur = (state.tripEndTs ? (state.tripEndTs - state.tripStartTs) : (state.tracking ? (Date.now() - state.tripStartTs) : 0)) / 1000;
    $("tripDuration").textContent = state.tripStartTs ? fmtHMS(dur) : "00:00:00";
    $("tripDistance").textContent = state.tripKm.toFixed(2);
    const hours = Math.max(0.000001, dur/3600);
    const avg = state.tripKm / hours;
    $("tripAvg").textContent = isFinite(avg) ? avg.toFixed(1) : "0.0";
  }

  function updateTripCount() {
    $("tripCount").textContent = state.trips.length;
  }

  function renderTrips() {
    const root = $("trips");
    root.innerHTML = "";
    state.trips.slice().reverse().forEach((t) => {
      const div = document.createElement("div");
      div.className = "trip";
      div.innerHTML = `
        <div><strong>${t.name || "(未命名行程)"} — ${t.distanceKm.toFixed(2)} km</strong></div>
        <div>${fmtTs(t.startTs)} → ${fmtTs(t.endTs)} ・ 時長 ${fmtHMS((t.endTs - t.startTs)/1000)} ・ 平均 ${(t.avgKmh).toFixed(1)} km/h</div>
        <div>起點 (${t.startLat.toFixed(6)}, ${t.startLng.toFixed(6)}) ・ <a class="link" href="https://www.google.com/maps?q=${t.startLat},${t.startLng}" target="_blank">地圖</a></div>
        <div>終點 (${t.endLat.toFixed(6)}, ${t.endLng.toFixed(6)}) ・ <a class="link" href="https://www.google.com/maps?q=${t.endLat},${t.endLng}" target="_blank">地圖</a></div>
        <div>備註：<small>${t.note ? escapeHtml(t.note) : "—"}</small></div>
        <div class="row">
          <button class="danger" data-action="del" data-id="${t.id}">刪除</button>
        </div>
      `;
      root.appendChild(div);
    });
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, m => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    })[m]);
  }

  // Haversine
  function haversine(a, b) {
    const R = 6371000;
    const toRad = (x)=> x * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const s1 = Math.sin(dLat/2), s2 = Math.sin(dLng/2);
    const q = s1*s1 + Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*s2*s2;
    return 2 * R * Math.asin(Math.sqrt(q));
  }

  function shouldAccumulate(prev, curr, cfg) {
    if (!prev) return false;
    if (curr.acc != null && curr.acc > cfg.accThresh) return false;
    const d = haversine(prev, curr);
    if (d < cfg.stepThresh) return false;
    const dt = (curr.ts - prev.ts) / 1000;
    if (dt > 0) {
      const v_kmh = (d / dt) * 3.6;
      if (v_kmh > cfg.speedMax) return false;
    }
    return true;
  }

  function startGPS() {
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

        // track distance if a trip is running
        if (state.tracking) {
          const cfg = {
            accThresh: Number($("#accThresh").value || 25),
            stepThresh: Number($("#stepThresh").value || 5),
            speedMax: Number($("#speedMax").value || 180),
            scaleFactor: Number($("#scaleFactor").value || 1)
          };
          if (curr.acc != null && curr.acc <= cfg.accThresh) {
            if (shouldAccumulate(state.lastPoint, curr, cfg)) {
              const d_m = haversine(state.lastPoint, curr);
              state.tripKm += (d_m / 1000) * cfg.scaleFactor;
              updateTripUI();
            }
            state.lastPoint = { lat: curr.lat, lng: curr.lng, ts: curr.ts };
          }
        }
      },
      (err) => {
        $("status").textContent = `定位失敗：${err.message}`;
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 }
    );
  }
  function stopGPS() {
    if (state.watchId != null) {
      navigator.geolocation.clearWatch(state.watchId);
      state.watchId = null;
      $("status").textContent = "已停止定位";
    }
  }

  function tripStart() {
    if (!state.current) { alert("尚未取得定位，請先開始定位。"); return; }
    state.tracking = true;
    state.tripStartTs = Date.now();
    state.tripEndTs = null;
    state.tripKm = 0;
    state.lastPoint = { lat: state.current.lat, lng: state.current.lng, ts: state.current.ts };
    updateTripUI();
  }
  function tripEnd() {
    if (!state.tracking) { alert("尚未開始行程"); return; }
    state.tracking = false;
    state.tripEndTs = Date.now();
    updateTripUI();
  }
  function tripReset() {
    if (!confirm("重設本次行程？")) return;
    state.tracking = false;
    state.tripStartTs = null;
    state.tripEndTs = null;
    state.tripKm = 0;
    state.lastPoint = null;
    updateTripUI();
  }

  function saveTrip() {
    if (!state.tripStartTs || !state.tripEndTs) { alert("請先開始並結束行程。"); return; }
    const dur = (state.tripEndTs - state.tripStartTs) / 1000;
    const hours = Math.max(0.000001, dur/3600);
    const avg = state.tripKm / hours;
    const t = {
      id: Date.now(),
      name: $("#tripName").value.trim(),
      note: $("#tripNote").value.trim(),
      startTs: state.tripStartTs,
      endTs: state.tripEndTs,
      distanceKm: Number(state.tripKm),
      avgKmh: Number(isFinite(avg) ? avg : 0),
      startLat: state.current?.lat ?? state.lastPoint?.lat ?? 0,
      startLng: state.current?.lng ?? state.lastPoint?.lng ?? 0,
      endLat: state.current?.lat ?? 0,
      endLng: state.current?.lng ?? 0,
      settings: {
        accThresh: Number($("#accThresh").value || 25),
        stepThresh: Number($("#stepThresh").value || 5),
        speedMax: Number($("#speedMax").value || 180),
        scaleFactor: Number($("#scaleFactor").value || 1)
      }
    };
    state.trips.push(t);
    saveAll();
    renderTrips();
    alert("已保存行程。");
  }

  function exportTrips() {
    const rows = [["行程名稱","開始時間","結束時間","時長(hh:mm:ss)","距離(km)","平均速度(km/h)","起點緯度","起點經度","終點緯度","終點經度","備註","精度門檻(m)","最小步長(m)","速度上限(km/h)","校正係數"]];
    for (const t of state.trips) {
      rows.push([
        t.name || "",
        fmtTs(t.startTs),
        fmtTs(t.endTs),
        (function(){ const s=(t.endTs-t.startTs)/1000; const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), ss=Math.floor(s%60); const pad=(n)=>String(n).padStart(2,"0"); return `${pad(h)}:${pad(m)}:${pad(ss)}`; })(),
        Number(t.distanceKm || 0),
        Number(t.avgKmh || 0),
        t.startLat, t.startLng, t.endLat, t.endLng,
        t.note || "",
        t.settings?.accThresh ?? "",
        t.settings?.stepThresh ?? "",
        t.settings?.speedMax ?? "",
        t.settings?.scaleFactor ?? 1
      ]);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{wch:16},{wch:20},{wch:20},{wch:12},{wch:10},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:30},{wch:12},{wch:12},{wch:14},{wch:10}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "行程列表");
    const fname = `GPS行程列表_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.xlsx`;
    XLSX.writeFile(wb, fname);
  }

  // DOM events
  $("btnStartGPS").addEventListener("click", startGPS);
  $("btnStopGPS").addEventListener("click", stopGPS);
  $("btnTripStart").addEventListener("click", tripStart);
  $("btnTripEnd").addEventListener("click", tripEnd);
  $("btnTripReset").addEventListener("click", tripReset);
  $("btnSaveTrip").addEventListener("click", saveTrip);
  $("btnExportTrips").addEventListener("click", exportTrips);
  $("btnClearTrips").addEventListener("click", () => {
    if (!confirm("確定要清空歷史行程？")) return;
    state.trips = [];
    saveAll();
    renderTrips();
  });
  $("trips").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    if (btn.dataset.action === "del") {
      const id = Number(btn.dataset.id);
      const idx = state.trips.findIndex(x => x.id === id);
      if (idx >= 0) { state.trips.splice(idx, 1); saveAll(); renderTrips(); }
    }
  });

  // Timer for updating duration on screen
  setInterval(() => {
    if (state.tracking && state.tripStartTs) updateTripUI();
  }, 1000);

  // Init
  loadAll();
  updateTripCount();
  renderTrips();
})();