import { useState, useEffect, useRef, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Camera,
  Plus,
  X,
  Trash2,
  Settings,
  ImageOff,
  ArrowUp,
  ArrowDown,
  Minus,
  Loader2,
  ChevronLeft,
  ArrowLeftRight,
  Check,
  Scale,
  Utensils,
  Moon,
  Footprints,
} from "lucide-react";

// ---------- Speicherung ----------
// Diese Umgebung stellt bereits ein persistentes window.storage bereit
// (get/set/delete/list, jeweils pro Nutzer). Der komplette Code unten ruft
// es exakt in diesem Format auf – es braucht keinen externen Ersatz (kein
// Supabase, kein API-Key), das war die Ursache der Fehlermeldungen.

// Standalone browser storage adapter for the PWA.
if (typeof window !== "undefined" && !window.storage) {
  const DB_NAME = "wochenprotokoll-db", STORE = "kv";
  const openDB = () => new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
  });
  window.storage = {
    get: async key => { const db=await openDB(); return new Promise((resolve,reject)=>{const r=db.transaction(STORE,"readonly").objectStore(STORE).get(key);r.onsuccess=()=>resolve(r.result==null?null:{value:r.result});r.onerror=()=>reject(r.error);}); },
    set: async (key,value) => { const db=await openDB(); return new Promise((resolve,reject)=>{const r=db.transaction(STORE,"readwrite").objectStore(STORE).put(value,key);r.onsuccess=()=>resolve({key,value});r.onerror=()=>reject(r.error);}); },
    delete: async key => { const db=await openDB(); return new Promise((resolve,reject)=>{const r=db.transaction(STORE,"readwrite").objectStore(STORE).delete(key);r.onsuccess=()=>resolve({key});r.onerror=()=>reject(r.error);}); },
    list: async prefix => { const db=await openDB(); return new Promise((resolve,reject)=>{const r=db.transaction(STORE,"readonly").objectStore(STORE).getAllKeys();r.onsuccess=()=>resolve({keys:r.result.filter(k=>String(k).startsWith(prefix||""))});r.onerror=()=>reject(r.error);}); }
  };
}

const C = {
  bg: "#1A1613",
  surface: "#221D19",
  raised: "#2C2620",
  raised2: "#352E27",
  hairline: "#3A342C",
  amber: "#E3A857",
  amberDim: "#8A6636",
  sage: "#8FAE93",
  rust: "#C1694F",
  night: "#8C97C4",
  nightDim: "#5B6386",
  dose1: "#C98A5E",
  dose2: "#6FA8A0",
  text: "#F3EEE5",
  muted: "#9C9184",
  paper: "#EFE8DB",
};

// ---------- helpers ----------

function localISO(date) {
  const off = date.getTimezoneOffset();
  return new Date(date.getTime() - off * 60000).toISOString().slice(0, 10);
}

function todayISO() {
  return localISO(new Date());
}

function yesterdayISO() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return localISO(d);
}

function isSunday(iso) {
  return new Date(iso + "T00:00:00").getDay() === 0;
}

function fmtDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateShort(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

function fmtWeekday(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("de-DE", { weekday: "long" });
}

function fmtWeight(v) {
  if (v === null || v === undefined || isNaN(v)) return "–";
  return v.toFixed(1).replace(".", ",");
}

function fmtDelta(v) {
  if (v === null || v === undefined || isNaN(v)) return "–";
  const sign = v > 0 ? "+" : v < 0 ? "\u2212" : "\u00B1";
  return `${sign}${Math.abs(v).toFixed(1).replace(".", ",")}`;
}

function weeksBetween(isoA, isoB) {
  const a = new Date(isoA + "T00:00:00");
  const b = new Date(isoB + "T00:00:00");
  return Math.max(0, Math.round((b - a) / (1000 * 60 * 60 * 24 * 7)));
}

function rotationFor(id, spread = 3) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) % 1000;
  return (hash % (spread * 2 + 1)) - spread;
}

function timeToMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function fmtDuration(min) {
  if (min === null || min === undefined || isNaN(min)) return "–";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m === 0 ? `${h} Std.` : `${h} Std. ${m} Min.`;
}

const TIME_OPTIONS = (() => {
  const opts = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      opts.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return opts;
})();

function compressImage(file, maxDim = 900, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("Bild konnte nicht geladen werden."));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden."));
    reader.readAsDataURL(file);
  });
}

// ---------- small shared components ----------

function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,500&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
      .f-display { font-family: 'Fraunces', serif; }
      .f-body { font-family: 'IBM Plex Sans', sans-serif; }
      .f-mono { font-family: 'IBM Plex Mono', monospace; }
      @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes sheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes spin { to { transform: rotate(360deg); } }
      .anim-fade-up { animation: fadeUp 0.45s ease-out both; }
      .anim-sheet { animation: sheetUp 0.32s cubic-bezier(.2,.8,.2,1) both; }
      .anim-fade { animation: fadeIn 0.25s ease-out both; }
      .tape {
        position: absolute; top: -10px; left: 50%; transform: translateX(-50%) rotate(-2deg);
        width: 64px; height: 22px; background: rgba(227,168,87,0.35);
        border: 1px solid rgba(227,168,87,0.25);
      }
      input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.75); }
      ::-webkit-scrollbar { width: 6px; height: 6px; }
      ::-webkit-scrollbar-thumb { background: ${C.hairline}; border-radius: 3px; }
    `}</style>
  );
}

function StatTile({ label, value, sub, icon, delay = 0 }) {
  return (
    <div
      className="anim-fade-up"
      style={{
        animationDelay: `${delay}ms`,
        background: C.raised,
        border: `1px solid ${C.hairline}`,
        borderRadius: 14,
        padding: "14px 14px",
        flex: 1,
        minWidth: 0,
      }}
    >
      <div className="f-body" style={{ fontSize: 11, color: C.muted, marginBottom: 6, letterSpacing: 0.3 }}>
        {label}
      </div>
      <div className="f-mono" style={{ fontSize: 20, color: C.text, fontWeight: 500, display: "flex", alignItems: "baseline", gap: 4 }}>
        {icon}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{value}</span>
      </div>
      {sub && (
        <div className="f-body" style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function DeltaIcon({ delta, size = 14 }) {
  if (delta === null || delta === undefined) return null;
  if (delta > 0.05) return <ArrowUp size={size} color={C.rust} />;
  if (delta < -0.05) return <ArrowDown size={size} color={C.sage} />;
  return <Minus size={size} color={C.muted} />;
}

function deltaColor(delta) {
  if (delta === null || delta === undefined) return C.muted;
  if (delta > 0.05) return C.rust;
  if (delta < -0.05) return C.sage;
  return C.muted;
}

function ChartTooltipBox({ active, payload, unit }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ background: C.raised2, border: `1px solid ${C.hairline}`, borderRadius: 8, padding: "6px 10px" }}>
      <div className="f-mono" style={{ fontSize: 10, color: C.muted }}>{fmtDate(d.date)}</div>
      <div className="f-mono" style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>
        {d.weight !== undefined ? `${fmtWeight(d.weight)} kg` : `${d.hours} Std.`}
      </div>
    </div>
  );
}

function MovementTooltipBox({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ background: C.raised2, border: `1px solid ${C.hairline}`, borderRadius: 8, padding: "6px 10px" }}>
      <div className="f-mono" style={{ fontSize: 10, color: C.muted }}>{fmtDate(d.date)}</div>
      <div className="f-mono" style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{d.steps.toLocaleString("de-DE")} Schritte</div>
    </div>
  );
}

function DoseTooltipBox({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ background: C.raised2, border: `1px solid ${C.hairline}`, borderRadius: 8, padding: "6px 10px" }}>
      <div className="f-mono" style={{ fontSize: 10, color: C.muted }}>{fmtDate(d.date)}</div>
      <div className="f-mono" style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{d.value} mg</div>
    </div>
  );
}

function DoseChart({ title, color, data }) {
  if (data.length < 2) return null;
  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = +(values.reduce((s, v) => s + v, 0) / values.length).toFixed(2);
  return (
    <div className="anim-fade-up" style={{ background: C.surface, border: `1px solid ${C.hairline}`, borderRadius: 14, padding: "14px 8px 6px 4px", marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginLeft: 12, marginRight: 12, marginBottom: 4 }}>
        <div className="f-body" style={{ fontSize: 11, color: C.muted, letterSpacing: 0.3 }}>{title.toUpperCase()}</div>
        <div className="f-mono" style={{ fontSize: 11, color: C.muted }}>
          Ø {avg} mg · {min}–{max} mg
        </div>
      </div>
      <div style={{ height: 140 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 14, left: -14, bottom: 0 }}>
            <CartesianGrid stroke={C.hairline} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" interval={data.length > 7 ? Math.ceil(data.length / 6) : 0} tick={{ fontSize: 10, fill: C.muted, fontFamily: "IBM Plex Mono, monospace" }} axisLine={{ stroke: C.hairline }} tickLine={false} />
            <YAxis domain={["dataMin - 1", "dataMax + 1"]} width={34} tick={{ fontSize: 10, fill: C.muted, fontFamily: "IBM Plex Mono, monospace" }} axisLine={false} tickLine={false} />
            <Tooltip content={<DoseTooltipBox />} cursor={{ stroke: color, strokeWidth: 1 }} />
            <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={{ r: 2.5, fill: color, strokeWidth: 0 }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function TimelineRow({ entry, photoSrc, delta, checkinRate, index, onDelete, onEdit }) {
  const [confirming, setConfirming] = useState(false);
  const sunday = isSunday(entry.date);
  return (
    <div
      className="anim-fade-up"
      style={{
        animationDelay: `${Math.min(index * 25, 350)}ms`,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: sunday ? "10px 4px" : "7px 4px",
        borderBottom: `1px solid ${C.hairline}`,
        cursor: "pointer",
      }}
      onClick={() => onEdit(entry)}
    >
      {sunday && (
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 10,
            overflow: "hidden",
            flexShrink: 0,
            background: C.surface,
            border: `1px solid ${C.hairline}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {entry.hasPhoto ? (
            photoSrc ? (
              <img src={photoSrc} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <Loader2 size={16} color={C.muted} style={{ animation: "spin 1s linear infinite" }} />
            )
          ) : (
            <ImageOff size={16} color={C.muted} />
          )}
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="f-mono" style={{ fontSize: 11, color: C.muted, display: "flex", alignItems: "center", gap: 6 }}>
          {fmtDate(entry.date)}
          {sunday && (
            <span
              className="f-body"
              style={{ fontSize: 9, color: C.amber, background: "rgba(227,168,87,0.15)", border: `1px solid ${C.amberDim}`, borderRadius: 20, padding: "1px 6px", letterSpacing: 0.4 }}
            >
              CHECK-IN
            </span>
          )}
        </div>
        <div className="f-mono" style={{ fontSize: sunday ? 16 : 14, color: C.text, fontWeight: 500 }}>{fmtWeight(entry.weight)} kg</div>
        {sunday && (entry.testosterone != null || entry.retatrutide != null) && (
          <div className="f-body" style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>
            {entry.testosterone != null ? `T: ${entry.testosterone} mg` : ""}
            {entry.testosterone != null && entry.retatrutide != null ? " · " : ""}
            {entry.retatrutide != null ? `Reta: ${entry.retatrutide} mg` : ""}
          </div>
        )}
        {entry.notes && (
          <div className="f-body" style={{ fontSize: 11, color: C.muted, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {entry.notes}
          </div>
        )}
      </div>

      {sunday ? (
        checkinRate ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <DeltaIcon delta={checkinRate.deltaKg} />
              <span className="f-mono" style={{ color: deltaColor(checkinRate.deltaKg), fontSize: 13 }}>
                {fmtDelta(checkinRate.deltaKg)} kg
              </span>
            </div>
            {checkinRate.deltaPct !== null && (
              <span className="f-mono" style={{ fontSize: 10, color: C.muted }}>
                {fmtDelta(checkinRate.deltaPct)}%
              </span>
            )}
          </div>
        ) : (
          <span className="f-mono" style={{ color: C.muted, fontSize: 12, flexShrink: 0 }}>Erster Check-in</span>
        )
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 13, flexShrink: 0 }}>
          <DeltaIcon delta={delta} />
          <span className="f-mono" style={{ color: deltaColor(delta), fontSize: 13 }}>
            {delta === null ? "Start" : `${fmtDelta(delta)} kg`}
          </span>
        </div>
      )}

      {confirming ? (
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => onDelete(entry.id)}
            className="f-body"
            style={{ fontSize: 11, background: C.rust, color: C.paper, border: "none", borderRadius: 6, padding: "4px 7px" }}
          >
            Löschen
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="f-body"
            style={{ fontSize: 11, background: "transparent", color: C.muted, border: `1px solid ${C.hairline}`, borderRadius: 6, padding: "4px 7px" }}
          >
            Abbr.
          </button>
        </div>
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); setConfirming(true); }}
          aria-label="Eintrag löschen"
          style={{ background: "transparent", border: "none", padding: 4, flexShrink: 0, cursor: "pointer" }}
        >
          <Trash2 size={15} color={C.muted} />
        </button>
      )}
    </div>
  );
}

function MovementRow({ entry, index, onDelete, onEdit }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="anim-fade-up" style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 4px", borderBottom: `1px solid ${C.hairline}`, cursor: "pointer", animationDelay: `${Math.min(index * 25, 350)}ms` }} onClick={() => onEdit(entry)}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="f-mono" style={{ fontSize: 11, color: C.muted }}>{fmtDate(entry.date)}</div>
        <div className="f-mono" style={{ fontSize: 15, color: C.text, fontWeight: 500 }}>{entry.steps.toLocaleString("de-DE")} Schritte</div>
        <div className="f-body" style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{entry.cardioMin > 0 ? `${entry.cardioMin} Min. Cardio${entry.cardioType ? ` · ${entry.cardioType}` : ""}` : "Kein Cardio erfasst"}</div>
      </div>
      {confirming ? (
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
          <button onClick={() => onDelete(entry.id)} className="f-body" style={{ fontSize: 11, background: C.rust, color: C.paper, border: "none", borderRadius: 6, padding: "4px 7px" }}>Löschen</button>
          <button onClick={() => setConfirming(false)} className="f-body" style={{ fontSize: 11, background: "transparent", color: C.muted, border: `1px solid ${C.hairline}`, borderRadius: 6, padding: "4px 7px" }}>Abbr.</button>
        </div>
      ) : (
        <button onClick={(e) => { e.stopPropagation(); setConfirming(true); }} aria-label="Eintrag löschen" style={{ background: "transparent", border: "none", padding: 4, flexShrink: 0, cursor: "pointer" }}>
          <Trash2 size={15} color={C.muted} />
        </button>
      )}
    </div>
  );
}

function SleepRow({ entry, index, onDelete, onEdit }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div
      className="anim-fade-up"
      style={{
        animationDelay: `${Math.min(index * 25, 350)}ms`,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "9px 4px",
        borderBottom: `1px solid ${C.hairline}`,
        cursor: "pointer",
      }}
      onClick={() => onEdit(entry)}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="f-mono" style={{ fontSize: 11, color: C.muted }}>{fmtDate(entry.date)}</div>
        <div className="f-mono" style={{ fontSize: 15, color: C.text, fontWeight: 500 }}>{fmtDuration(entry.durationMin)}</div>
        <div className="f-body" style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{entry.bedTime} → {entry.wakeTime}</div>
      </div>

      {confirming ? (
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => onDelete(entry.id)}
            className="f-body"
            style={{ fontSize: 11, background: C.rust, color: C.paper, border: "none", borderRadius: 6, padding: "4px 7px" }}
          >
            Löschen
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="f-body"
            style={{ fontSize: 11, background: "transparent", color: C.muted, border: `1px solid ${C.hairline}`, borderRadius: 6, padding: "4px 7px" }}
          >
            Abbr.
          </button>
        </div>
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); setConfirming(true); }}
          aria-label="Eintrag löschen"
          style={{ background: "transparent", border: "none", padding: 4, flexShrink: 0, cursor: "pointer" }}
        >
          <Trash2 size={15} color={C.muted} />
        </button>
      )}
    </div>
  );
}

function Polaroid({ src, date, weight, rotation = 0, width = 240 }) {
  return (
    <div
      style={{
        position: "relative",
        width,
        background: C.paper,
        padding: "10px 10px 16px 10px",
        boxShadow: "0 10px 24px rgba(0,0,0,0.4)",
        transform: `rotate(${rotation}deg)`,
        margin: "0 auto",
      }}
    >
      <div className="tape" />
      <div style={{ width: "100%", aspectRatio: "1 / 1", background: "#141110", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {src ? (
          <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, color: "#6b6459" }}>
            <ImageOff size={26} />
            <span className="f-body" style={{ fontSize: 11 }}>Kein Foto</span>
          </div>
        )}
      </div>
      <div style={{ textAlign: "center", marginTop: 10 }}>
        <div className="f-mono" style={{ fontSize: 11, color: "#5a5348" }}>{fmtDate(date)}</div>
        <div className="f-mono" style={{ fontSize: 15, color: "#2b2620", fontWeight: 500 }}>{fmtWeight(weight)} kg</div>
      </div>
    </div>
  );
}

function TabBar({ active, onChange }) {
  const tabs = [
    { key: "gewicht", label: "Gewicht", Icon: Scale, color: C.amber },
    { key: "ernaehrung", label: "Ernährung", Icon: Utensils, color: C.sage },
    { key: "schlaf", label: "Schlaf", Icon: Moon, color: C.night },
    { key: "bewegung", label: "Bewegung", Icon: Footprints, color: C.amber },
  ];
  return (
    <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 40, background: C.surface, borderTop: `1px solid ${C.hairline}` }}>
      <div style={{ maxWidth: 460, margin: "0 auto", display: "flex" }}>
        {tabs.map((t) => {
          const Icon = t.Icon;
          const isActive = active === t.key;
          return (
            <button
              key={t.key}
              onClick={() => onChange(t.key)}
              className="f-body"
              style={{ flex: 1, background: "transparent", border: "none", padding: "10px 4px 12px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer" }}
            >
              <Icon size={19} color={isActive ? t.color : C.muted} />
              <span style={{ fontSize: 10, color: isActive ? t.color : C.muted, fontWeight: isActive ? 600 : 400 }}>{t.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Ernährungsplan tab (static reference) ----------

function NutritionTab() {
  const [dayType, setDayType] = useState("rest");
  const meals = [
    { time: "Morgens", items: ["30 g Whey", "500 g ungesüßte Mandelmilch"] },
    { time: "Mittag", items: ["200 g Hähnchen", "400 g Gemüse", "170 g Reis (Trockengewicht)"] },
    { time: "Pre-Workout", items: ["100 g Rice Pudding", "100 g TK-Obst", "30 g Whey"] },
    ...(dayType === "training" ? [{ time: "Intra-Workout", items: ["40 g Maltodextrin"], tag: "Nur Trainingstage" }] : []),
    { time: "Abends", items: ["350 g entrahmte Milch", "30 g Whey"] },
  ];

  return (
    <div className="anim-fade-up">
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <button
          onClick={() => setDayType("rest")}
          className="f-body"
          style={{ flex: 1, background: dayType === "rest" ? "rgba(143,174,147,0.15)" : C.raised, border: `1px solid ${dayType === "rest" ? C.sage : C.hairline}`, borderRadius: 10, padding: "10px", cursor: "pointer" }}
        >
          <div className="f-mono" style={{ fontSize: 16, color: dayType === "rest" ? C.sage : C.text, fontWeight: 500 }}>~1.900 kcal</div>
          <div className="f-body" style={{ fontSize: 11, color: C.muted }}>Rest Day</div>
        </button>
        <button
          onClick={() => setDayType("training")}
          className="f-body"
          style={{ flex: 1, background: dayType === "training" ? "rgba(143,174,147,0.15)" : C.raised, border: `1px solid ${dayType === "training" ? C.sage : C.hairline}`, borderRadius: 10, padding: "10px", cursor: "pointer" }}
        >
          <div className="f-mono" style={{ fontSize: 16, color: dayType === "training" ? C.sage : C.text, fontWeight: 500 }}>~2.050 kcal</div>
          <div className="f-body" style={{ fontSize: 11, color: C.muted }}>Trainingstag</div>
        </button>
      </div>

      <div style={{ background: C.surface, border: `1px solid ${C.hairline}`, borderRadius: 14, padding: "4px 14px" }}>
        {meals.map((meal, i) => (
          <div
            key={meal.time}
            className="anim-fade-up"
            style={{ animationDelay: `${i * 40}ms`, display: "flex", gap: 12, padding: "13px 0", borderBottom: i < meals.length - 1 ? `1px solid ${C.hairline}` : "none" }}
          >
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.sage, marginTop: 6, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <div className="f-mono" style={{ fontSize: 12, color: C.sage, fontWeight: 500, letterSpacing: 0.3 }}>{meal.time.toUpperCase()}</div>
                {meal.tag && (
                  <span className="f-body" style={{ fontSize: 9, color: C.sage, background: "rgba(143,174,147,0.15)", border: `1px solid ${C.sage}`, borderRadius: 20, padding: "1px 7px", letterSpacing: 0.3, opacity: 0.9 }}>
                    {meal.tag}
                  </span>
                )}
              </div>
              <div className="f-body" style={{ fontSize: 13, color: C.text, marginTop: 3, lineHeight: 1.5 }}>
                {meal.items.join(" · ")}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="f-body" style={{ fontSize: 11, color: C.muted, textAlign: "center", marginTop: 14, padding: "0 10px" }}>
        Kalorienangaben sind Richtwerte. Mengen jeweils pro Portion.
      </div>
    </div>
  );
}

// ---------- main app ----------

export default function CheckInTracker() {
  const [tab, setTab] = useState("gewicht");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [resetConfirming, setResetConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [diagResult, setDiagResult] = useState(null); // null | "running" | { ok: true } | { ok: false, message }

  // ---- Gewicht: data ----
  const [entries, setEntries] = useState([]);
  const [photos, setPhotos] = useState({});
  const [weightSubView, setWeightSubView] = useState("home"); // home | compare
  const [compareIds, setCompareIds] = useState([null, null]);
  const fileInputRef = useRef(null);

  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formDate, setFormDate] = useState(todayISO());
  const [formWeight, setFormWeight] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formPhotoPreview, setFormPhotoPreview] = useState(null);
  const [formPhotoData, setFormPhotoData] = useState(null);
  const [formTestosterone, setFormTestosterone] = useState("");
  const [formRetatrutide, setFormRetatrutide] = useState("");
  const [compressing, setCompressing] = useState(false);
  const [formError, setFormError] = useState(null);

  const [todayWeight, setTodayWeight] = useState("");
  const [todayNotes, setTodayNotes] = useState("");
  const [todayPhotoPreview, setTodayPhotoPreview] = useState(null);
  const [todayPhotoData, setTodayPhotoData] = useState(null);
  const [todayTestosterone, setTodayTestosterone] = useState("");
  const [todayRetatrutide, setTodayRetatrutide] = useState("");
  const [todayCompressing, setTodayCompressing] = useState(false);
  const [todaySaving, setTodaySaving] = useState(false);
  const [todayError, setTodayError] = useState(null);
  const todayFileInputRef = useRef(null);

  // ---- Schlaf: data ----
  const [sleepEntries, setSleepEntries] = useState([]);
  // ---- Bewegung: data ----
  const [movementEntries, setMovementEntries] = useState([]);
  const [todaySteps, setTodaySteps] = useState("");
  const [todayCardioMin, setTodayCardioMin] = useState("");
  const [todayCardioType, setTodayCardioType] = useState("");
  const [todayMovementSaving, setTodayMovementSaving] = useState(false);
  const [todayMovementError, setTodayMovementError] = useState(null);
  const [showMovementAdd, setShowMovementAdd] = useState(false);
  const [movementFormDate, setMovementFormDate] = useState(todayISO());
  const [movementFormSteps, setMovementFormSteps] = useState("");
  const [movementFormCardioMin, setMovementFormCardioMin] = useState("");
  const [movementFormCardioType, setMovementFormCardioType] = useState("");
  const [movementSaving, setMovementSaving] = useState(false);
  const [movementFormError, setMovementFormError] = useState(null);
  const [todayBedTime, setTodayBedTime] = useState("23:00");
  const [todayWakeTime, setTodayWakeTime] = useState("07:00");
  const [todaySleepSaving, setTodaySleepSaving] = useState(false);
  const [todaySleepError, setTodaySleepError] = useState(null);

  const [showSleepAdd, setShowSleepAdd] = useState(false);
  const [sleepFormDate, setSleepFormDate] = useState(todayISO());
  const [sleepFormBed, setSleepFormBed] = useState("23:00");
  const [sleepFormWake, setSleepFormWake] = useState("07:00");
  const [sleepSaving, setSleepSaving] = useState(false);
  const [sleepFormError, setSleepFormError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get("entries-meta", false);
        if (res && res.value) setEntries(JSON.parse(res.value));
      } catch (e) {
        // keine Einträge vorhanden
      }
      try {
        const res2 = await window.storage.get("sleep-entries", false);
        if (res2 && res2.value) setSleepEntries(JSON.parse(res2.value));
      } catch (e) {
        // keine Schlaf-Einträge vorhanden
      }
      try {
        const res3 = await window.storage.get("movement-entries", false);
        if (res3 && res3.value) setMovementEntries(JSON.parse(res3.value));
      } catch (e) {
        // keine Schlaf-Einträge vorhanden
      }
      setLoading(false);
    })();
  }, []);

  const todayStr = todayISO();
  const isSundayToday = isSunday(todayStr);
  const todayEntry = entries.find((e) => e.date === todayStr);
  const todaySleepEntry = sleepEntries.find((e) => e.date === todayStr);
  const todayMovementEntry = movementEntries.find((e) => e.date === todayStr);

  const sortedAsc = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const sortedDesc = [...sortedAsc].reverse();
  const withDelta = sortedAsc.map((e, i) => ({
    ...e,
    delta: i === 0 ? null : +(e.weight - sortedAsc[i - 1].weight).toFixed(1),
  }));
  const withDeltaDesc = [...withDelta].reverse();
  const photoEntries = sortedAsc.filter((e) => e.hasPhoto);

  const sundaysAsc = sortedAsc.filter((e) => isSunday(e.date));
  const sundayRates = {};
  sundaysAsc.forEach((e, i) => {
    if (i === 0) {
      sundayRates[e.date] = null;
      return;
    }
    const prev = sundaysAsc[i - 1];
    const deltaKg = +(e.weight - prev.weight).toFixed(1);
    const deltaPct = prev.weight ? +(((e.weight - prev.weight) / prev.weight) * 100).toFixed(1) : null;
    sundayRates[e.date] = { deltaKg, deltaPct, prevDate: prev.date };
  });
  const todayCheckinRate = todayEntry ? sundayRates[todayEntry.date] : null;

  const testoData = sundaysAsc.filter((e) => e.testosterone != null).map((e) => ({ date: e.date, label: fmtDateShort(e.date), value: e.testosterone }));
  const retaData = sundaysAsc.filter((e) => e.retatrutide != null).map((e) => ({ date: e.date, label: fmtDateShort(e.date), value: e.retatrutide }));

  const sleepSortedAsc = [...sleepEntries].sort((a, b) => a.date.localeCompare(b.date));
  const sleepSortedDesc = [...sleepSortedAsc].reverse();
  const last7Sleep = sleepSortedDesc.slice(0, 7);
  const avgDuration7 = last7Sleep.length ? Math.round(last7Sleep.reduce((s, e) => s + e.durationMin, 0) / last7Sleep.length) : null;
  const sleepChartData = sleepSortedAsc.map((e) => ({ date: e.date, label: fmtDateShort(e.date), hours: +(e.durationMin / 60).toFixed(1) }));
  const sleepTickInterval = sleepChartData.length > 7 ? Math.ceil(sleepChartData.length / 6) : 0;
  const movementSortedAsc = [...movementEntries].sort((a, b) => a.date.localeCompare(b.date));
  const movementSortedDesc = [...movementSortedAsc].reverse();
  const last7Movement = movementSortedDesc.slice(0, 7);
  const avgSteps7 = last7Movement.length ? Math.round(last7Movement.reduce((s, e) => s + e.steps, 0) / last7Movement.length) : null;
  const avgCardio7 = last7Movement.length ? Math.round(last7Movement.reduce((s, e) => s + e.cardioMin, 0) / last7Movement.length) : null;
  const movementChartData = movementSortedAsc.map((e) => ({ date: e.date, label: fmtDateShort(e.date), steps: e.steps }));
  const movementTickInterval = movementChartData.length > 7 ? Math.ceil(movementChartData.length / 6) : 0;

  const loadPhoto = useCallback(async (id) => {
    try {
      const res = await window.storage.get(`photo:${id}`, false);
      if (res && res.value) setPhotos((p) => (p[id] ? p : { ...p, [id]: res.value }));
    } catch (e) {
      // kein Foto vorhanden
    }
  }, []);

  useEffect(() => {
    entries.forEach((e) => {
      if (e.hasPhoto && !photos[e.id]) loadPhoto(e.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  // retries a storage.set call a couple of times before giving up — helps with transient
  // "Unexpected response type" style failures from the storage layer itself
  async function storageSet(key, value, attempts = 2) {
    let lastErr;
    for (let i = 0; i <= attempts; i++) {
      try {
        const res = await window.storage.set(key, value, false);
        if (res) return res;
        lastErr = new Error("Speicher antwortete ohne Bestätigung.");
      } catch (e) {
        lastErr = e;
      }
      if (i < attempts) await new Promise((r) => setTimeout(r, 450 * (i + 1)));
    }
    throw lastErr;
  }

  // ---- Gewicht: shared upsert-by-date save ----
  async function saveEntry({ date, weight, notes, photoData, testosterone, retatrutide }) {
    const sunday = isSunday(date);
    const existing = entries.find((e) => e.date === date);
    const entry = {
      id: date,
      date,
      weight,
      notes: sunday ? (notes || "").trim() : "",
      hasPhoto: sunday && !!photoData,
      testosterone: sunday && testosterone !== "" && testosterone !== null && testosterone !== undefined && !isNaN(testosterone) ? +testosterone : null,
      retatrutide: sunday && retatrutide !== "" && retatrutide !== null && retatrutide !== undefined && !isNaN(retatrutide) ? +retatrutide : null,
    };
    const next = [...entries.filter((e) => e.date !== date), entry];

    if (sunday && photoData) {
      await storageSet(`photo:${date}`, photoData);
      setPhotos((p) => ({ ...p, [date]: photoData }));
    } else if (existing && existing.hasPhoto && !photoData) {
      await window.storage.delete(`photo:${date}`, false).catch(() => {});
      setPhotos((p) => {
        const cp = { ...p };
        delete cp[date];
        return cp;
      });
    }

    await storageSet("entries-meta", JSON.stringify(next));
    setEntries(next);
  }

  function resetForm() {
    setFormDate(todayISO());
    setFormWeight("");
    setFormNotes("");
    setFormPhotoPreview(null);
    setFormPhotoData(null);
    setFormTestosterone("");
    setFormRetatrutide("");
    setFormError(null);
  }

  async function handleFile(file) {
    if (!file) return;
    setCompressing(true);
    setFormError(null);
    try {
      const dataUrl = await compressImage(file);
      setFormPhotoData(dataUrl);
      setFormPhotoPreview(dataUrl);
    } catch (e) {
      setFormError("Foto konnte nicht verarbeitet werden.");
    }
    setCompressing(false);
  }

  async function handleTodayFile(file) {
    if (!file) return;
    setTodayCompressing(true);
    setTodayError(null);
    try {
      const dataUrl = await compressImage(file);
      setTodayPhotoData(dataUrl);
      setTodayPhotoPreview(dataUrl);
    } catch (e) {
      setTodayError("Foto konnte nicht verarbeitet werden.");
    }
    setTodayCompressing(false);
  }

  async function submitToday() {
    const w = parseFloat(todayWeight.replace(",", "."));
    if (!todayWeight || isNaN(w) || w <= 0) {
      setTodayError("Bitte ein gültiges Gewicht eingeben.");
      return;
    }
    setTodaySaving(true);
    setTodayError(null);
    try {
      await saveEntry({
        date: todayStr,
        weight: w,
        notes: todayNotes,
        photoData: todayPhotoData,
        testosterone: todayTestosterone.replace(",", "."),
        retatrutide: todayRetatrutide.replace(",", "."),
      });
      setTodayWeight("");
      setTodayNotes("");
      setTodayPhotoData(null);
      setTodayPhotoPreview(null);
      setTodayTestosterone("");
      setTodayRetatrutide("");
    } catch (e) {
      setTodayError(`Speichern fehlgeschlagen: ${e?.message || "unbekannter Fehler"}`);
    }
    setTodaySaving(false);
  }

  async function submitEntry() {
    const w = parseFloat(formWeight.replace(",", "."));
    if (!formWeight || isNaN(w) || w <= 0) {
      setFormError("Bitte ein gültiges Gewicht eingeben.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await saveEntry({
        date: formDate,
        weight: w,
        notes: formNotes,
        photoData: formPhotoData,
        testosterone: formTestosterone.replace(",", "."),
        retatrutide: formRetatrutide.replace(",", "."),
      });
      resetForm();
      setShowAdd(false);
    } catch (e) {
      setFormError(`Speichern fehlgeschlagen: ${e?.message || "unbekannter Fehler"}`);
    }
    setSaving(false);
  }

  function editEntry(entry) {
    setFormDate(entry.date);
    setFormWeight(String(entry.weight));
    setFormNotes(entry.notes || "");
    setFormTestosterone(entry.testosterone !== null && entry.testosterone !== undefined ? String(entry.testosterone) : "");
    setFormRetatrutide(entry.retatrutide !== null && entry.retatrutide !== undefined ? String(entry.retatrutide) : "");
    if (entry.hasPhoto) {
      const src = photos[entry.id] || null;
      setFormPhotoData(src);
      setFormPhotoPreview(src);
    } else {
      setFormPhotoData(null);
      setFormPhotoPreview(null);
    }
    setFormError(null);
    setShowAdd(true);
  }

  function openBackfill() {
    resetForm();
    setFormDate(yesterdayISO());
    setShowAdd(true);
  }

  async function deleteEntry(id) {
    const next = entries.filter((e) => e.id !== id);
    try {
      await storageSet("entries-meta", JSON.stringify(next));
      try {
        await window.storage.delete(`photo:${id}`, false);
      } catch (e) {
        // kein Foto zu löschen
      }
      setEntries(next);
      setPhotos((p) => {
        const cp = { ...p };
        delete cp[id];
        return cp;
      });
    } catch (e) {
      setError(`Löschen fehlgeschlagen: ${e?.message || "unbekannter Fehler"}`);
    }
  }

  function openCompare() {
    const valid = compareIds.filter((id) => photoEntries.some((e) => e.id === id));
    if (valid.length < 2) {
      if (photoEntries.length >= 2) setCompareIds([photoEntries[0].id, photoEntries[photoEntries.length - 1].id]);
      else if (photoEntries.length === 1) setCompareIds([photoEntries[0].id, photoEntries[0].id]);
    }
    setWeightSubView("compare");
  }

  // ---- Schlaf: functions ----
  async function saveSleep({ date, bedTime, wakeTime }) {
    const bedMin = timeToMinutes(bedTime);
    const wakeMin = timeToMinutes(wakeTime);
    const durationMin = ((wakeMin - bedMin) + 1440) % 1440;
    const entry = { id: date, date, bedTime, wakeTime, durationMin };
    const next = [...sleepEntries.filter((e) => e.date !== date), entry];
    await storageSet("sleep-entries", JSON.stringify(next));
    setSleepEntries(next);
  }

  async function submitTodaySleep() {
    if (!todayBedTime || !todayWakeTime) {
      setTodaySleepError("Bitte beide Zeiten angeben.");
      return;
    }
    setTodaySleepSaving(true);
    setTodaySleepError(null);
    try {
      await saveSleep({ date: todayStr, bedTime: todayBedTime, wakeTime: todayWakeTime });
    } catch (e) {
      setTodaySleepError(`Speichern fehlgeschlagen: ${e?.message || "unbekannter Fehler"}`);
    }
    setTodaySleepSaving(false);
  }

  function resetSleepForm() {
    setSleepFormDate(todayISO());
    setSleepFormBed("23:00");
    setSleepFormWake("07:00");
    setSleepFormError(null);
  }

  function openSleepBackfill() {
    resetSleepForm();
    setSleepFormDate(yesterdayISO());
    setShowSleepAdd(true);
  }

  function editSleepEntry(entry) {
    setSleepFormDate(entry.date);
    setSleepFormBed(entry.bedTime);
    setSleepFormWake(entry.wakeTime);
    setSleepFormError(null);
    setShowSleepAdd(true);
  }

  async function submitSleepEntry() {
    if (!sleepFormBed || !sleepFormWake) {
      setSleepFormError("Bitte beide Zeiten angeben.");
      return;
    }
    setSleepSaving(true);
    setSleepFormError(null);
    try {
      await saveSleep({ date: sleepFormDate, bedTime: sleepFormBed, wakeTime: sleepFormWake });
      resetSleepForm();
      setShowSleepAdd(false);
    } catch (e) {
      setSleepFormError(`Speichern fehlgeschlagen: ${e?.message || "unbekannter Fehler"}`);
    }
    setSleepSaving(false);
  }

  async function deleteSleepEntry(id) {
    const next = sleepEntries.filter((e) => e.id !== id);
    try {
      await storageSet("sleep-entries", JSON.stringify(next));
      setSleepEntries(next);
    } catch (e) {
      setError(`Löschen fehlgeschlagen: ${e?.message || "unbekannter Fehler"}`);
    }
  }

  async function saveMovement({ date, steps, cardioMin, cardioType }) {
    const entry = { id: date, date, steps, cardioMin, cardioType: (cardioType || "").trim() };
    const next = [...movementEntries.filter((e) => e.date !== date), entry];
    await storageSet("movement-entries", JSON.stringify(next));
    setMovementEntries(next);
  }

  async function submitTodayMovement() {
    const steps = parseInt(todaySteps, 10);
    const cardioMin = todayCardioMin === "" ? 0 : parseInt(todayCardioMin, 10);
    if (todaySteps === "" || isNaN(steps) || steps < 0 || isNaN(cardioMin) || cardioMin < 0) {
      setTodayMovementError("Bitte gültige Schritte und Cardio-Minuten eingeben."); return;
    }
    setTodayMovementSaving(true); setTodayMovementError(null);
    try { await saveMovement({ date: todayStr, steps, cardioMin, cardioType: todayCardioType }); setTodaySteps(""); setTodayCardioMin(""); setTodayCardioType(""); }
    catch (e) { setTodayMovementError(`Speichern fehlgeschlagen: ${e?.message || "unbekannter Fehler"}`); }
    setTodayMovementSaving(false);
  }

  function resetMovementForm() { setMovementFormDate(todayISO()); setMovementFormSteps(""); setMovementFormCardioMin(""); setMovementFormCardioType(""); setMovementFormError(null); }
  function openMovementBackfill() { resetMovementForm(); setMovementFormDate(yesterdayISO()); setShowMovementAdd(true); }
  function editMovementEntry(entry) { setMovementFormDate(entry.date); setMovementFormSteps(String(entry.steps)); setMovementFormCardioMin(entry.cardioMin ? String(entry.cardioMin) : ""); setMovementFormCardioType(entry.cardioType || ""); setMovementFormError(null); setShowMovementAdd(true); }
  async function submitMovementEntry() {
    const steps = parseInt(movementFormSteps, 10); const cardioMin = movementFormCardioMin === "" ? 0 : parseInt(movementFormCardioMin, 10);
    if (movementFormSteps === "" || isNaN(steps) || steps < 0 || isNaN(cardioMin) || cardioMin < 0) { setMovementFormError("Bitte gültige Schritte und Cardio-Minuten eingeben."); return; }
    setMovementSaving(true); setMovementFormError(null);
    try { await saveMovement({ date: movementFormDate, steps, cardioMin, cardioType: movementFormCardioType }); resetMovementForm(); setShowMovementAdd(false); }
    catch (e) { setMovementFormError(`Speichern fehlgeschlagen: ${e?.message || "unbekannter Fehler"}`); }
    setMovementSaving(false);
  }
  async function deleteMovementEntry(id) { const next = movementEntries.filter((e) => e.id !== id); try { await storageSet("movement-entries", JSON.stringify(next)); setMovementEntries(next); } catch (e) { setError(`Löschen fehlgeschlagen: ${e?.message || "unbekannter Fehler"}`); } }

  async function resetAll() {
    setResetting(true);
    try {
      const listed = await window.storage.list("photo:", false).catch(() => null);
      if (listed && listed.keys) {
        for (const k of listed.keys) {
          await window.storage.delete(k, false).catch(() => {});
        }
      }
      await window.storage.delete("entries-meta", false).catch(() => {});
      await window.storage.delete("sleep-entries", false).catch(() => {});
      await window.storage.delete("movement-entries", false).catch(() => {});
      setEntries([]);
      setPhotos({});
      setCompareIds([null, null]);
      setSleepEntries([]);
      setMovementEntries([]);
    } catch (e) {
      setError("Zurücksetzen fehlgeschlagen.");
    }
    setResetting(false);
    setResetConfirming(false);
  }

  async function runDiagnostic() {
    setDiagResult("running");
    const testKey = `diag-test-${Date.now()}`;
    try {
      if (!window.storage) throw new Error("window.storage ist in dieser Ansicht nicht vorhanden.");
      const setRes = await window.storage.set(testKey, "hallo", false);
      if (!setRes) throw new Error("set() antwortete ohne Ergebnis.");
      const getRes = await window.storage.get(testKey, false);
      if (!getRes || getRes.value !== "hallo") throw new Error(`get() lieferte unerwarteten Wert: ${JSON.stringify(getRes)}`);
      await window.storage.delete(testKey, false).catch(() => {});
      setDiagResult({ ok: true });
    } catch (e) {
      setDiagResult({ ok: false, message: e?.message || String(e) });
    }
  }

  const latest = sortedDesc[0];
  const first = sortedAsc[0];
  const totalDelta = latest && first && latest.id !== first.id ? +(latest.weight - first.weight).toFixed(1) : null;

  const chartData = sortedAsc.map((e) => ({ date: e.date, label: fmtDateShort(e.date), weight: e.weight }));
  const tickInterval = chartData.length > 7 ? Math.ceil(chartData.length / 6) : 0;

  const entryA = entries.find((e) => e.id === compareIds[0]);
  const entryB = entries.find((e) => e.id === compareIds[1]);

  const formIsSunday = isSunday(formDate);

  const headerInfo = {
    gewicht: { title: "Wochenprotokoll", subtitle: "Täglich Gewicht, sonntags Check-in" },
    ernaehrung: { title: "Ernährungsplan", subtitle: "Dein aktueller Plan" },
    schlaf: { title: "Schlafprotokoll", subtitle: "Dauer, Einschlaf- & Aufwachzeit" },
  }[tab];

  const showMainHeader = !(tab === "gewicht" && weightSubView === "compare");

  return (
    <div className="f-body" style={{ minHeight: "100vh", background: C.bg, color: C.text }}>
      <GlobalStyle />

      <div style={{ maxWidth: 460, margin: "0 auto", padding: "20px 16px 100px" }}>
        {/* header */}
        {showMainHeader && (
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
            <div>
              <div className="f-display" style={{ fontSize: 26, color: C.text, lineHeight: 1.1 }}>{headerInfo.title}</div>
              <div className="f-body" style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{headerInfo.subtitle}</div>
            </div>
            <button
              onClick={() => setShowSettings(true)}
              aria-label="Einstellungen"
              style={{ background: C.raised, border: `1px solid ${C.hairline}`, borderRadius: 10, padding: 9, cursor: "pointer" }}
            >
              <Settings size={17} color={C.muted} />
            </button>
          </div>
        )}

        {error && (
          <div
            className="anim-fade"
            style={{ background: "rgba(193,105,79,0.15)", border: `1px solid ${C.rust}`, color: C.text, borderRadius: 10, padding: "9px 12px", fontSize: 13, marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}
          >
            <span>{error}</span>
            <button onClick={() => setError(null)} style={{ background: "transparent", border: "none", cursor: "pointer" }}>
              <X size={14} color={C.text} />
            </button>
          </div>
        )}

        {loading && (
          <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
            <Loader2 size={22} color={C.muted} style={{ animation: "spin 1s linear infinite" }} />
          </div>
        )}

        {/* ================= GEWICHT TAB ================= */}
        {!loading && tab === "gewicht" && weightSubView === "compare" && (
          <div className="anim-fade-up">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
              <button onClick={() => setWeightSubView("home")} aria-label="Zurück" style={{ background: C.raised, border: `1px solid ${C.hairline}`, borderRadius: 10, padding: 8, cursor: "pointer" }}>
                <ChevronLeft size={17} color={C.muted} />
              </button>
              <div className="f-display" style={{ fontSize: 20, color: C.text }}>Vergleich</div>
            </div>

            {photoEntries.length < 2 ? (
              <div className="f-body" style={{ fontSize: 13, color: C.muted, textAlign: "center", padding: "30px 10px" }}>
                Sobald du zwei Sonntags-Check-ins mit Foto hast, kannst du sie hier vergleichen.
              </div>
            ) : (
              <>
                <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
                  <div style={{ flex: 1 }}>
                    <label className="f-body" style={{ fontSize: 11, color: C.muted }}>Vorher</label>
                    <select
                      value={compareIds[0] || ""}
                      onChange={(e) => setCompareIds([e.target.value, compareIds[1]])}
                      className="f-mono"
                      style={{ width: "100%", background: C.raised, color: C.text, border: `1px solid ${C.hairline}`, borderRadius: 8, padding: "8px 8px", fontSize: 12, marginTop: 4 }}
                    >
                      {photoEntries.map((e) => (
                        <option key={e.id} value={e.id}>{fmtDate(e.date)} · {fmtWeight(e.weight)} kg</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="f-body" style={{ fontSize: 11, color: C.muted }}>Nachher</label>
                    <select
                      value={compareIds[1] || ""}
                      onChange={(e) => setCompareIds([compareIds[0], e.target.value])}
                      className="f-mono"
                      style={{ width: "100%", background: C.raised, color: C.text, border: `1px solid ${C.hairline}`, borderRadius: 8, padding: "8px 8px", fontSize: 12, marginTop: 4 }}
                    >
                      {photoEntries.map((e) => (
                        <option key={e.id} value={e.id}>{fmtDate(e.date)} · {fmtWeight(e.weight)} kg</option>
                      ))}
                    </select>
                  </div>
                </div>

                {entryA && entryB && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}>
                    <Polaroid src={photos[entryA.id]} date={entryA.date} weight={entryA.weight} rotation={rotationFor(entryA.id, 3)} />
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <ArrowLeftRight size={14} color={C.amber} />
                      <div className="f-mono" style={{ fontSize: 13, color: C.amber, background: "rgba(227,168,87,0.12)", border: `1px solid ${C.amberDim}`, borderRadius: 20, padding: "5px 14px" }}>
                        {fmtDelta(+(entryB.weight - entryA.weight).toFixed(1))} kg · {weeksBetween(entryA.date, entryB.date)} Wochen
                      </div>
                    </div>
                    <Polaroid src={photos[entryB.id]} date={entryB.date} weight={entryB.weight} rotation={rotationFor(entryB.id, 3)} />
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {!loading && tab === "gewicht" && weightSubView === "home" && (
          <>
            <div
              className="anim-fade-up"
              style={{
                background: isSundayToday ? "rgba(227,168,87,0.08)" : C.surface,
                border: `1px solid ${isSundayToday ? C.amberDim : C.hairline}`,
                borderRadius: 16,
                padding: 16,
                marginBottom: 18,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span className="f-mono" style={{ fontSize: 11, color: C.muted, letterSpacing: 0.4 }}>
                  HEUTE · {fmtWeekday(todayStr).toUpperCase()}
                </span>
                {isSundayToday && (
                  <span className="f-body" style={{ fontSize: 9, color: C.amber, background: "rgba(227,168,87,0.18)", border: `1px solid ${C.amberDim}`, borderRadius: 20, padding: "1px 7px", letterSpacing: 0.4 }}>
                    CHECK-IN-TAG
                  </span>
                )}
              </div>

              {todayEntry ? (
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(143,174,147,0.18)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Check size={16} color={C.sage} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="f-mono" style={{ fontSize: 20, color: C.text, fontWeight: 500 }}>{fmtWeight(todayEntry.weight)} kg</div>
                    <div className="f-body" style={{ fontSize: 12, color: C.muted }}>Heute eingetragen</div>
                    {isSundayToday && todayCheckinRate && (
                      <div className="f-mono" style={{ fontSize: 12, color: deltaColor(todayCheckinRate.deltaKg), marginTop: 3 }}>
                        {fmtDelta(todayCheckinRate.deltaKg)} kg{todayCheckinRate.deltaPct !== null ? ` · ${fmtDelta(todayCheckinRate.deltaPct)}%` : ""} seit letztem Check-in
                      </div>
                    )}
                    {isSundayToday && (todayEntry.testosterone != null || todayEntry.retatrutide != null) && (
                      <div className="f-body" style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                        {todayEntry.testosterone != null ? `T: ${todayEntry.testosterone} mg` : ""}
                        {todayEntry.testosterone != null && todayEntry.retatrutide != null ? " · " : ""}
                        {todayEntry.retatrutide != null ? `Reta: ${todayEntry.retatrutide} mg` : ""}
                      </div>
                    )}
                  </div>
                  {todayEntry.hasPhoto && photos[todayEntry.id] && (
                    <img src={photos[todayEntry.id]} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover", border: `1px solid ${C.hairline}` }} />
                  )}
                  <button
                    onClick={() => editEntry(todayEntry)}
                    className="f-body"
                    style={{ fontSize: 12, color: C.amber, background: "transparent", border: "none", cursor: "pointer", flexShrink: 0 }}
                  >
                    Bearbeiten
                  </button>
                </div>
              ) : (
                <>
                  <div className="f-display" style={{ fontSize: 17, color: C.text, marginBottom: 3 }}>
                    {isSundayToday ? "Wochen-Check-in" : "Gewicht eintragen"}
                  </div>
                  <div className="f-body" style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
                    {isSundayToday ? "Heute mit Foto — für deinen wöchentlichen Vergleich." : "Nur das Gewicht — Fotos gibt's sonntags."}
                  </div>

                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    min="0"
                    placeholder="z. B. 72.4"
                    value={todayWeight}
                    onChange={(e) => setTodayWeight(e.target.value)}
                    className="f-mono"
                    style={{ width: "100%", background: C.raised, color: C.text, border: `1px solid ${C.hairline}`, borderRadius: 9, padding: "11px 12px", fontSize: 18, boxSizing: "border-box", marginBottom: 10 }}
                  />

                  {isSundayToday && (
                    <>
                      <input
                        ref={todayFileInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => handleTodayFile(e.target.files && e.target.files[0])}
                        style={{ display: "none" }}
                      />
                      {todayPhotoPreview ? (
                        <div style={{ marginBottom: 10, position: "relative", width: 84 }}>
                          <img src={todayPhotoPreview} alt="" style={{ width: 84, height: 84, objectFit: "cover", borderRadius: 10, border: `1px solid ${C.hairline}` }} />
                          <button
                            onClick={() => { setTodayPhotoPreview(null); setTodayPhotoData(null); }}
                            aria-label="Foto entfernen"
                            style={{ position: "absolute", top: -7, right: -7, background: C.rust, border: `2px solid ${C.surface}`, borderRadius: "50%", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                          >
                            <X size={11} color={C.paper} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => todayFileInputRef.current && todayFileInputRef.current.click()}
                          disabled={todayCompressing}
                          className="f-body"
                          style={{ width: "100%", background: C.raised, border: `1px dashed ${C.hairline}`, borderRadius: 9, padding: "12px 10px", color: C.muted, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", marginBottom: 10 }}
                        >
                          {todayCompressing ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Camera size={16} />}
                          {todayCompressing ? "Foto wird verarbeitet…" : "Foto aufnehmen oder auswählen (optional)"}
                        </button>
                      )}

                      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <label className="f-body" style={{ fontSize: 11, color: C.muted }}>Testosteron (mg)</label>
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min="0"
                            placeholder="optional"
                            value={todayTestosterone}
                            onChange={(e) => setTodayTestosterone(e.target.value)}
                            className="f-mono"
                            style={{ width: "100%", background: C.raised, color: C.text, border: `1px solid ${C.hairline}`, borderRadius: 9, padding: "9px 10px", fontSize: 14, marginTop: 4, boxSizing: "border-box" }}
                          />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <label className="f-body" style={{ fontSize: 11, color: C.muted }}>Retatrutide (mg)</label>
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min="0"
                            placeholder="optional"
                            value={todayRetatrutide}
                            onChange={(e) => setTodayRetatrutide(e.target.value)}
                            className="f-mono"
                            style={{ width: "100%", background: C.raised, color: C.text, border: `1px solid ${C.hairline}`, borderRadius: 9, padding: "9px 10px", fontSize: 14, marginTop: 4, boxSizing: "border-box" }}
                          />
                        </div>
                      </div>

                      <textarea
                        value={todayNotes}
                        onChange={(e) => setTodayNotes(e.target.value)}
                        placeholder="Notizen (optional) — z. B. Schlaf, Training …"
                        rows={2}
                        className="f-body"
                        style={{ width: "100%", background: C.raised, color: C.text, border: `1px solid ${C.hairline}`, borderRadius: 9, padding: "9px 10px", fontSize: 13, boxSizing: "border-box", resize: "none", marginBottom: 10 }}
                      />
                    </>
                  )}

                  {todayError && (
                    <div className="f-body" style={{ fontSize: 12, color: C.rust, marginBottom: 10 }}>{todayError}</div>
                  )}

                  <button
                    onClick={submitToday}
                    disabled={todaySaving || todayCompressing}
                    className="f-body"
                    style={{ width: "100%", background: C.amber, color: "#221A0E", border: "none", borderRadius: 10, padding: "11px", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: todaySaving || todayCompressing ? 0.7 : 1 }}
                  >
                    {todaySaving ? "Speichert…" : isSundayToday ? "Check-in speichern" : "Speichern"}
                  </button>
                </>
              )}
            </div>

            {entries.length === 0 && (
              <div className="f-body anim-fade-up" style={{ fontSize: 12, color: C.muted, textAlign: "center", padding: "4px 10px 20px" }}>
                Trag täglich dein Gewicht ein — sonntags kommt automatisch der Foto-Check-in dazu.
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
              <button
                onClick={openBackfill}
                className="f-body"
                style={{ flex: 1, background: "transparent", color: C.text, border: `1px solid ${C.hairline}`, borderRadius: 10, padding: "10px 12px", fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer" }}
              >
                <Plus size={15} /> Tag nachtragen
              </button>
              {photoEntries.length >= 2 && (
                <button
                  onClick={openCompare}
                  className="f-body"
                  style={{ flex: 1, background: "transparent", color: C.text, border: `1px solid ${C.hairline}`, borderRadius: 10, padding: "10px 12px", fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer" }}
                >
                  <ArrowLeftRight size={15} /> Vergleichen
                </button>
              )}
            </div>

            {entries.length > 0 && (
              <>
                <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
                  <StatTile label="AKTUELL" value={`${fmtWeight(latest.weight)} kg`} sub={fmtDate(latest.date)} delay={0} />
                  <StatTile
                    label="UNTERSCHIED SEIT START"
                    value={totalDelta === null ? "–" : `${fmtDelta(totalDelta)} kg`}
                    sub={totalDelta === null ? "noch kein Verlauf" : `seit ${fmtDate(first.date)}`}
                    icon={totalDelta !== null && <DeltaIcon delta={totalDelta} size={13} />}
                    delay={60}
                  />
                  <StatTile label="EINTRÄGE" value={`${entries.length}`} sub={entries.length === 1 ? "Tag" : "Tage"} delay={120} />
                </div>

                {chartData.length >= 2 && (
                  <div className="anim-fade-up" style={{ background: C.surface, border: `1px solid ${C.hairline}`, borderRadius: 14, padding: "14px 8px 6px 4px", marginBottom: 18 }}>
                    <div className="f-body" style={{ fontSize: 11, color: C.muted, letterSpacing: 0.3, marginLeft: 12, marginBottom: 4 }}>VERLAUF</div>
                    <div style={{ height: 190 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 6, right: 14, left: -14, bottom: 0 }}>
                          <CartesianGrid stroke={C.hairline} strokeDasharray="3 3" vertical={false} />
                          <XAxis
                            dataKey="label"
                            interval={tickInterval}
                            tick={{ fontSize: 10, fill: C.muted, fontFamily: "IBM Plex Mono, monospace" }}
                            axisLine={{ stroke: C.hairline }}
                            tickLine={false}
                          />
                          <YAxis
                            domain={["dataMin - 1", "dataMax + 1"]}
                            width={38}
                            tick={{ fontSize: 10, fill: C.muted, fontFamily: "IBM Plex Mono, monospace" }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(v) => v.toFixed(0)}
                          />
                          <Tooltip content={<ChartTooltipBox />} cursor={{ stroke: C.amberDim, strokeWidth: 1 }} />
                          <Line type="monotone" dataKey="weight" stroke={C.amber} strokeWidth={2} dot={{ r: 2.5, fill: C.amber, strokeWidth: 0 }} activeDot={{ r: 5 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {(testoData.length >= 2 || retaData.length >= 2) && (
                  <>
                    <div className="f-body" style={{ fontSize: 11, color: C.muted, letterSpacing: 0.3, marginBottom: 6, marginLeft: 4 }}>DOSEN (SONNTAGS)</div>
                    <DoseChart title="Testosteron" color={C.dose1} data={testoData} />
                    <DoseChart title="Retatrutide" color={C.dose2} data={retaData} />
                  </>
                )}

                <div className="f-body" style={{ fontSize: 11, color: C.muted, letterSpacing: 0.3, marginBottom: 2, marginLeft: 4 }}>EINTRÄGE</div>
                <div>
                  {withDeltaDesc.map((e, i) => (
                    <TimelineRow key={e.id} entry={e} photoSrc={photos[e.id]} delta={e.delta} checkinRate={sundayRates[e.date] || null} index={i} onDelete={deleteEntry} onEdit={editEntry} />
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* ================= ERNÄHRUNG TAB ================= */}
        {!loading && tab === "ernaehrung" && <NutritionTab />}

        {/* ================= SCHLAF TAB ================= */}
        {!loading && tab === "schlaf" && (
          <>
            <div
              className="anim-fade-up"
              style={{ background: "rgba(140,151,196,0.08)", border: `1px solid ${C.nightDim}`, borderRadius: 16, padding: 16, marginBottom: 18 }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span className="f-mono" style={{ fontSize: 11, color: C.muted, letterSpacing: 0.4 }}>LETZTE NACHT</span>
              </div>

              {todaySleepEntry ? (
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(140,151,196,0.18)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Moon size={16} color={C.night} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="f-mono" style={{ fontSize: 20, color: C.text, fontWeight: 500 }}>{fmtDuration(todaySleepEntry.durationMin)}</div>
                    <div className="f-body" style={{ fontSize: 12, color: C.muted }}>{todaySleepEntry.bedTime} → {todaySleepEntry.wakeTime}</div>
                  </div>
                  <button
                    onClick={() => editSleepEntry(todaySleepEntry)}
                    className="f-body"
                    style={{ fontSize: 12, color: C.night, background: "transparent", border: "none", cursor: "pointer", flexShrink: 0 }}
                  >
                    Bearbeiten
                  </button>
                </div>
              ) : (
                <>
                  <div className="f-display" style={{ fontSize: 17, color: C.text, marginBottom: 3 }}>Schlaf eintragen</div>
                  <div className="f-body" style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>Wann bist du ins Bett gegangen, wann aufgestanden?</div>

                  <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <label className="f-body" style={{ fontSize: 11, color: C.muted }}>Zu Bett</label>
                      <select
                        value={todayBedTime}
                        onChange={(e) => setTodayBedTime(e.target.value)}
                        className="f-mono"
                        style={{ width: "100%", background: C.raised, color: C.text, border: `1px solid ${C.hairline}`, borderRadius: 9, padding: "9px 8px", fontSize: 15, marginTop: 4, boxSizing: "border-box" }}
                      >
                        {TIME_OPTIONS.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <label className="f-body" style={{ fontSize: 11, color: C.muted }}>Aufgewacht</label>
                      <select
                        value={todayWakeTime}
                        onChange={(e) => setTodayWakeTime(e.target.value)}
                        className="f-mono"
                        style={{ width: "100%", background: C.raised, color: C.text, border: `1px solid ${C.hairline}`, borderRadius: 9, padding: "9px 8px", fontSize: 15, marginTop: 4, boxSizing: "border-box" }}
                      >
                        {TIME_OPTIONS.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {todayBedTime && todayWakeTime && (
                    <div className="f-mono" style={{ fontSize: 12, color: C.night, marginBottom: 10 }}>
                      → {fmtDuration(((timeToMinutes(todayWakeTime) - timeToMinutes(todayBedTime)) + 1440) % 1440)}
                    </div>
                  )}

                  {todaySleepError && (
                    <div className="f-body" style={{ fontSize: 12, color: C.rust, marginBottom: 10 }}>{todaySleepError}</div>
                  )}

                  <button
                    onClick={submitTodaySleep}
                    disabled={todaySleepSaving}
                    className="f-body"
                    style={{ width: "100%", background: C.night, color: "#1E2033", border: "none", borderRadius: 10, padding: "11px", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: todaySleepSaving ? 0.7 : 1 }}
                  >
                    {todaySleepSaving ? "Speichert…" : "Speichern"}
                  </button>
                </>
              )}
            </div>

            {sleepEntries.length === 0 && (
              <div className="f-body anim-fade-up" style={{ fontSize: 12, color: C.muted, textAlign: "center", padding: "4px 10px 20px" }}>
                Trag jeden Morgen ein, wann du ins Bett gegangen und aufgewacht bist — die Dauer wird automatisch berechnet.
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
              <button
                onClick={openSleepBackfill}
                className="f-body"
                style={{ flex: 1, background: "transparent", color: C.text, border: `1px solid ${C.hairline}`, borderRadius: 10, padding: "10px 12px", fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer" }}
              >
                <Plus size={15} /> Nacht nachtragen
              </button>
            </div>

            {sleepEntries.length > 0 && (
              <>
                <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
                  <StatTile label="LETZTE NACHT" value={todaySleepEntry ? fmtDuration(todaySleepEntry.durationMin) : "–"} sub={todaySleepEntry ? `${todaySleepEntry.bedTime} → ${todaySleepEntry.wakeTime}` : "noch nicht erfasst"} delay={0} />
                  <StatTile label="SCHNITT (7 NÄCHTE)" value={avgDuration7 !== null ? fmtDuration(avgDuration7) : "–"} sub={`${last7Sleep.length} Nächte`} delay={60} />
                  <StatTile label="NÄCHTE" value={`${sleepEntries.length}`} sub="erfasst" delay={120} />
                </div>

                {sleepChartData.length >= 2 && (
                  <div className="anim-fade-up" style={{ background: C.surface, border: `1px solid ${C.hairline}`, borderRadius: 14, padding: "14px 8px 6px 4px", marginBottom: 18 }}>
                    <div className="f-body" style={{ fontSize: 11, color: C.muted, letterSpacing: 0.3, marginLeft: 12, marginBottom: 4 }}>VERLAUF</div>
                    <div style={{ height: 190 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={sleepChartData} margin={{ top: 6, right: 14, left: -14, bottom: 0 }}>
                          <CartesianGrid stroke={C.hairline} strokeDasharray="3 3" vertical={false} />
                          <XAxis
                            dataKey="label"
                            interval={sleepTickInterval}
                            tick={{ fontSize: 10, fill: C.muted, fontFamily: "IBM Plex Mono, monospace" }}
                            axisLine={{ stroke: C.hairline }}
                            tickLine={false}
                          />
                          <YAxis
                            domain={[0, "dataMax + 1"]}
                            width={30}
                            tick={{ fontSize: 10, fill: C.muted, fontFamily: "IBM Plex Mono, monospace" }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(v) => v.toFixed(0)}
                          />
                          <Tooltip content={<ChartTooltipBox />} cursor={{ stroke: C.nightDim, strokeWidth: 1 }} />
                          <Line type="monotone" dataKey="hours" stroke={C.night} strokeWidth={2} dot={{ r: 2.5, fill: C.night, strokeWidth: 0 }} activeDot={{ r: 5 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                <div className="f-body" style={{ fontSize: 11, color: C.muted, letterSpacing: 0.3, marginBottom: 2, marginLeft: 4 }}>EINTRÄGE</div>
                <div>
                  {sleepSortedDesc.map((e, i) => (
                    <SleepRow key={e.id} entry={e} index={i} onDelete={deleteSleepEntry} onEdit={editSleepEntry} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
        {!loading && tab === "bewegung" && (
          <>
            <div className="anim-fade-up" style={{ background: "rgba(227,168,87,0.08)", border: `1px solid ${C.amberDim}`, borderRadius: 16, padding: 16, marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}><span className="f-mono" style={{ fontSize: 11, color: C.muted, letterSpacing: 0.4 }}>HEUTE</span></div>
              {todayMovementEntry ? (
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(227,168,87,0.16)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Footprints size={16} color={C.amber} /></div>
                  <div style={{ flex: 1 }}><div className="f-mono" style={{ fontSize: 20, color: C.text, fontWeight: 500 }}>{todayMovementEntry.steps.toLocaleString("de-DE")} Schritte</div><div className="f-body" style={{ fontSize: 12, color: C.muted }}>{todayMovementEntry.cardioMin > 0 ? `${todayMovementEntry.cardioMin} Min. Cardio${todayMovementEntry.cardioType ? ` · ${todayMovementEntry.cardioType}` : ""}` : "Kein Cardio erfasst"}</div></div>
                  <button onClick={() => editMovementEntry(todayMovementEntry)} className="f-body" style={{ fontSize: 12, color: C.amber, background: "transparent", border: "none", cursor: "pointer" }}>Bearbeiten</button>
                </div>
              ) : (
                <>
                  <div className="f-display" style={{ fontSize: 17, color: C.text, marginBottom: 3 }}>Bewegung eintragen</div>
                  <div className="f-body" style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>Schritte und Cardio für heute.</div>
                  <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                    <div style={{ flex: 1 }}><label className="f-body" style={{ fontSize: 11, color: C.muted }}>Schritte</label><input type="number" inputMode="numeric" min="0" step="1" placeholder="z. B. 12.000" value={todaySteps} onChange={(e) => setTodaySteps(e.target.value)} className="f-mono" style={{ width: "100%", background: C.raised, color: C.text, border: `1px solid ${C.hairline}`, borderRadius: 9, padding: "10px", fontSize: 15, marginTop: 4, boxSizing: "border-box" }} /></div>
                    <div style={{ flex: 1 }}><label className="f-body" style={{ fontSize: 11, color: C.muted }}>Cardio (Min.)</label><input type="number" inputMode="numeric" min="0" step="1" placeholder="z. B. 30" value={todayCardioMin} onChange={(e) => setTodayCardioMin(e.target.value)} className="f-mono" style={{ width: "100%", background: C.raised, color: C.text, border: `1px solid ${C.hairline}`, borderRadius: 9, padding: "10px", fontSize: 15, marginTop: 4, boxSizing: "border-box" }} /></div>
                  </div>
                  <input value={todayCardioType} onChange={(e) => setTodayCardioType(e.target.value)} placeholder="Cardio-Art optional — z. B. Fahrrad, Laufband" className="f-body" style={{ width: "100%", background: C.raised, color: C.text, border: `1px solid ${C.hairline}`, borderRadius: 9, padding: "10px", fontSize: 13, marginBottom: 10, boxSizing: "border-box" }} />
                  {todayMovementError && <div className="f-body" style={{ fontSize: 12, color: C.rust, marginBottom: 10 }}>{todayMovementError}</div>}
                  <button onClick={submitTodayMovement} disabled={todayMovementSaving} className="f-body" style={{ width: "100%", background: C.amber, color: "#221A0E", border: "none", borderRadius: 10, padding: "11px", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: todayMovementSaving ? 0.7 : 1 }}>{todayMovementSaving ? "Speichert…" : "Speichern"}</button>
                </>
              )}
            </div>
            <div style={{ display: "flex", gap: 10, marginBottom: 20 }}><button onClick={openMovementBackfill} className="f-body" style={{ flex: 1, background: "transparent", color: C.text, border: `1px solid ${C.hairline}`, borderRadius: 10, padding: "10px 12px", fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer" }}><Plus size={15} /> Tag nachtragen</button></div>
            {movementEntries.length > 0 && (
              <>
                <div style={{ display: "flex", gap: 10, marginBottom: 18 }}><StatTile label="HEUTE" value={todayMovementEntry ? `${todayMovementEntry.steps.toLocaleString("de-DE")}` : "–"} sub="Schritte" delay={0} /><StatTile label="Ø SCHRITTE (7 TAGE)" value={avgSteps7 !== null ? avgSteps7.toLocaleString("de-DE") : "–"} sub={`${last7Movement.length} Tage`} delay={60} /><StatTile label="Ø CARDIO (7 TAGE)" value={avgCardio7 !== null ? `${avgCardio7} Min.` : "–"} sub="pro Tag" delay={120} /></div>
                {movementChartData.length >= 2 && <div className="anim-fade-up" style={{ background: C.surface, border: `1px solid ${C.hairline}`, borderRadius: 14, padding: "14px 8px 6px 4px", marginBottom: 18 }}><div className="f-body" style={{ fontSize: 11, color: C.muted, letterSpacing: 0.3, marginLeft: 12, marginBottom: 4 }}>SCHRITTE-VERLAUF</div><div style={{ height: 190 }}><ResponsiveContainer width="100%" height="100%"><LineChart data={movementChartData} margin={{ top: 6, right: 14, left: -14, bottom: 0 }}><CartesianGrid stroke={C.hairline} strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" interval={movementTickInterval} tick={{ fontSize: 10, fill: C.muted, fontFamily: "IBM Plex Mono, monospace" }} axisLine={{ stroke: C.hairline }} tickLine={false} /><YAxis width={45} tick={{ fontSize: 10, fill: C.muted, fontFamily: "IBM Plex Mono, monospace" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v/1000)}k`} /><Tooltip content={<MovementTooltipBox />} cursor={{ stroke: C.amberDim, strokeWidth: 1 }} /><Line type="monotone" dataKey="steps" stroke={C.amber} strokeWidth={2} dot={{ r: 2.5, fill: C.amber, strokeWidth: 0 }} activeDot={{ r: 5 }} /></LineChart></ResponsiveContainer></div></div>}
                <div className="f-body" style={{ fontSize: 11, color: C.muted, letterSpacing: 0.3, marginBottom: 2, marginLeft: 4 }}>EINTRÄGE</div><div>{movementSortedDesc.map((e, i) => <MovementRow key={e.id} entry={e} index={i} onDelete={deleteMovementEntry} onEdit={editMovementEntry} />)}</div>
              </>
            )}
          </>
        )}
      </div>

      <TabBar active={tab} onChange={setTab} />

      {/* SETTINGS SHEET */}
      {showSettings && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50 }}>
          <div onClick={() => setShowSettings(false)} className="anim-fade" style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)" }} />
          <div
            className="anim-sheet f-body"
            style={{ position: "absolute", left: 0, right: 0, bottom: 0, maxWidth: 460, margin: "0 auto", background: C.surface, borderTop: `1px solid ${C.hairline}`, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: "18px 18px 26px", maxHeight: "80vh", overflowY: "auto" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div className="f-display" style={{ fontSize: 19, color: C.text }}>Einstellungen</div>
              <button onClick={() => setShowSettings(false)} style={{ background: "transparent", border: "none", cursor: "pointer" }}>
                <X size={19} color={C.muted} />
              </button>
            </div>
            <div style={{ background: C.raised, border: `1px solid ${C.hairline}`, borderRadius: 14, padding: 16, marginBottom: 14 }}>
              <div className="f-body" style={{ fontSize: 13, color: C.text, marginBottom: 4, fontWeight: 500 }}>Speicher-Test</div>
              <div className="f-body" style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
                Prüft direkt, ob Schreiben/Lesen im Speicher gerade grundsätzlich funktioniert — unabhängig von Gewicht oder Schlaf.
              </div>
              <button
                onClick={runDiagnostic}
                disabled={diagResult === "running"}
                className="f-body"
                style={{ background: "transparent", border: `1px solid ${C.hairline}`, color: C.text, borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer" }}
              >
                {diagResult === "running" ? "Teste…" : "Test starten"}
              </button>
              {diagResult && diagResult !== "running" && (
                <div
                  className="f-mono"
                  style={{ marginTop: 10, fontSize: 12, color: diagResult.ok ? C.sage : C.rust, background: diagResult.ok ? "rgba(143,174,147,0.1)" : "rgba(193,105,79,0.1)", border: `1px solid ${diagResult.ok ? C.sage : C.rust}`, borderRadius: 8, padding: "8px 10px" }}
                >
                  {diagResult.ok ? "✓ Speicher funktioniert (schreiben, lesen, löschen erfolgreich)." : `✗ ${diagResult.message}`}
                </div>
              )}
            </div>

            <div style={{ background: C.raised, border: `1px solid ${C.hairline}`, borderRadius: 14, padding: 16 }}>
              <div className="f-body" style={{ fontSize: 13, color: C.text, marginBottom: 4, fontWeight: 500 }}>Alle Daten löschen</div>
              <div className="f-body" style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
                Entfernt unwiderruflich alle Gewichts- und Schlaf-Einträge sowie gespeicherte Fotos von diesem Gerät.
              </div>
              {!resetConfirming ? (
                <button
                  onClick={() => setResetConfirming(true)}
                  className="f-body"
                  style={{ background: "transparent", border: `1px solid ${C.rust}`, color: C.rust, borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer" }}
                >
                  Alle Daten löschen
                </button>
              ) : (
                <div>
                  <div className="f-body" style={{ fontSize: 12, color: C.text, marginBottom: 8 }}>
                    Wirklich alle Einträge und Fotos unwiderruflich löschen?
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={resetAll}
                      disabled={resetting}
                      className="f-body"
                      style={{ background: C.rust, color: C.paper, border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer" }}
                    >
                      {resetting ? "Löscht…" : "Ja, löschen"}
                    </button>
                    <button
                      onClick={() => setResetConfirming(false)}
                      className="f-body"
                      style={{ background: "transparent", color: C.muted, border: `1px solid ${C.hairline}`, borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer" }}
                    >
                      Abbrechen
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* GEWICHT: BACKFILL / EDIT SHEET */}
      {showAdd && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50 }}>
          <div onClick={() => !saving && setShowAdd(false)} className="anim-fade" style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)" }} />
          <div
            className="anim-sheet f-body"
            style={{ position: "absolute", left: 0, right: 0, bottom: 0, maxWidth: 460, margin: "0 auto", background: C.surface, borderTop: `1px solid ${C.hairline}`, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: "18px 18px 26px", maxHeight: "88vh", overflowY: "auto" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div className="f-display" style={{ fontSize: 19, color: C.text }}>
                {formIsSunday ? "Wochen-Check-in" : "Gewicht eintragen"}
              </div>
              <button onClick={() => !saving && setShowAdd(false)} style={{ background: "transparent", border: "none", cursor: "pointer" }}>
                <X size={19} color={C.muted} />
              </button>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label className="f-body" style={{ fontSize: 12, color: C.muted }}>Datum</label>
              <input
                type="date"
                value={formDate}
                max={todayISO()}
                onChange={(e) => setFormDate(e.target.value)}
                className="f-mono"
                style={{ width: "100%", background: C.raised, color: C.text, border: `1px solid ${C.hairline}`, borderRadius: 9, padding: "9px 10px", fontSize: 14, marginTop: 4, boxSizing: "border-box" }}
              />
              <div className="f-body" style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                {fmtWeekday(formDate)}{formIsSunday ? " — Check-in-Tag mit Foto" : ""}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label className="f-body" style={{ fontSize: 12, color: C.muted }}>Gewicht (kg)</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                min="0"
                placeholder="z. B. 72.4"
                value={formWeight}
                onChange={(e) => setFormWeight(e.target.value)}
                className="f-mono"
                style={{ width: "100%", background: C.raised, color: C.text, border: `1px solid ${C.hairline}`, borderRadius: 9, padding: "9px 10px", fontSize: 16, marginTop: 4, boxSizing: "border-box" }}
              />
            </div>

            {formIsSunday ? (
              <>
                <div style={{ marginBottom: 14 }}>
                  <label className="f-body" style={{ fontSize: 12, color: C.muted }}>Foto (optional)</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => handleFile(e.target.files && e.target.files[0])}
                    style={{ display: "none" }}
                  />
                  {formPhotoPreview ? (
                    <div style={{ marginTop: 6, position: "relative", width: 110 }}>
                      <img src={formPhotoPreview} alt="" style={{ width: 110, height: 110, objectFit: "cover", borderRadius: 10, border: `1px solid ${C.hairline}` }} />
                      <button
                        onClick={() => { setFormPhotoPreview(null); setFormPhotoData(null); }}
                        aria-label="Foto entfernen"
                        style={{ position: "absolute", top: -7, right: -7, background: C.rust, border: `2px solid ${C.surface}`, borderRadius: "50%", width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                      >
                        <X size={12} color={C.paper} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => fileInputRef.current && fileInputRef.current.click()}
                      disabled={compressing}
                      className="f-body"
                      style={{ marginTop: 6, width: "100%", background: C.raised, border: `1px dashed ${C.hairline}`, borderRadius: 10, padding: "16px 10px", color: C.muted, fontSize: 12, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer" }}
                    >
                      {compressing ? <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> : <Camera size={18} />}
                      {compressing ? "Foto wird verarbeitet…" : "Foto aufnehmen oder auswählen"}
                    </button>
                  )}
                </div>

                <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label className="f-body" style={{ fontSize: 12, color: C.muted }}>Testosteron (mg)</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      placeholder="optional"
                      value={formTestosterone}
                      onChange={(e) => setFormTestosterone(e.target.value)}
                      className="f-mono"
                      style={{ width: "100%", background: C.raised, color: C.text, border: `1px solid ${C.hairline}`, borderRadius: 9, padding: "9px 10px", fontSize: 14, marginTop: 4, boxSizing: "border-box" }}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label className="f-body" style={{ fontSize: 12, color: C.muted }}>Retatrutide (mg)</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      placeholder="optional"
                      value={formRetatrutide}
                      onChange={(e) => setFormRetatrutide(e.target.value)}
                      className="f-mono"
                      style={{ width: "100%", background: C.raised, color: C.text, border: `1px solid ${C.hairline}`, borderRadius: 9, padding: "9px 10px", fontSize: 14, marginTop: 4, boxSizing: "border-box" }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: 18 }}>
                  <label className="f-body" style={{ fontSize: 12, color: C.muted }}>Notizen (optional)</label>
                  <textarea
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="z. B. Schlaf, Training, wie du dich fühlst …"
                    rows={2}
                    className="f-body"
                    style={{ width: "100%", background: C.raised, color: C.text, border: `1px solid ${C.hairline}`, borderRadius: 9, padding: "9px 10px", fontSize: 13, marginTop: 4, boxSizing: "border-box", resize: "none" }}
                  />
                </div>
              </>
            ) : (
              <div className="f-body" style={{ fontSize: 12, color: C.muted, marginBottom: 18 }}>
                Fotos &amp; Notizen gibt's beim Sonntags-Check-in.
              </div>
            )}

            {formError && (
              <div className="f-body" style={{ fontSize: 12, color: C.rust, marginBottom: 12 }}>{formError}</div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={submitEntry}
                disabled={saving || compressing}
                className="f-body"
                style={{ flex: 1, background: C.amber, color: "#221A0E", border: "none", borderRadius: 10, padding: "12px", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: saving || compressing ? 0.7 : 1 }}
              >
                {saving ? "Speichert…" : "Speichern"}
              </button>
              <button
                onClick={() => { if (!saving) { resetForm(); setShowAdd(false); } }}
                className="f-body"
                style={{ background: "transparent", color: C.muted, border: `1px solid ${C.hairline}`, borderRadius: 10, padding: "12px 16px", fontSize: 14, cursor: "pointer" }}
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BEWEGUNG: BACKFILL / EDIT SHEET */}
      {showMovementAdd && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50 }}><div onClick={() => !movementSaving && setShowMovementAdd(false)} className="anim-fade" style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)" }} /><div className="anim-sheet f-body" style={{ position: "absolute", left: 0, right: 0, bottom: 0, maxWidth: 460, margin: "0 auto", background: C.surface, borderTop: `1px solid ${C.hairline}`, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: "18px 18px 26px", maxHeight: "88vh", overflowY: "auto" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}><div className="f-display" style={{ fontSize: 19, color: C.text }}>Bewegung eintragen</div><button onClick={() => !movementSaving && setShowMovementAdd(false)} style={{ background: "transparent", border: "none", cursor: "pointer" }}><X size={19} color={C.muted} /></button></div><div style={{ marginBottom: 14 }}><label className="f-body" style={{ fontSize: 12, color: C.muted }}>Datum</label><input type="date" value={movementFormDate} max={todayISO()} onChange={(e) => setMovementFormDate(e.target.value)} className="f-mono" style={{ width: "100%", background: C.raised, color: C.text, border: `1px solid ${C.hairline}`, borderRadius: 9, padding: "9px 10px", fontSize: 14, marginTop: 4, boxSizing: "border-box" }} /></div><div style={{ display: "flex", gap: 10, marginBottom: 10 }}><div style={{ flex: 1 }}><label className="f-body" style={{ fontSize: 12, color: C.muted }}>Schritte</label><input type="number" inputMode="numeric" min="0" step="1" value={movementFormSteps} onChange={(e) => setMovementFormSteps(e.target.value)} className="f-mono" style={{ width: "100%", background: C.raised, color: C.text, border: `1px solid ${C.hairline}`, borderRadius: 9, padding: "9px 10px", fontSize: 15, marginTop: 4, boxSizing: "border-box" }} /></div><div style={{ flex: 1 }}><label className="f-body" style={{ fontSize: 12, color: C.muted }}>Cardio (Min.)</label><input type="number" inputMode="numeric" min="0" step="1" value={movementFormCardioMin} onChange={(e) => setMovementFormCardioMin(e.target.value)} className="f-mono" style={{ width: "100%", background: C.raised, color: C.text, border: `1px solid ${C.hairline}`, borderRadius: 9, padding: "9px 10px", fontSize: 15, marginTop: 4, boxSizing: "border-box" }} /></div></div><input value={movementFormCardioType} onChange={(e) => setMovementFormCardioType(e.target.value)} placeholder="Cardio-Art optional" className="f-body" style={{ width: "100%", background: C.raised, color: C.text, border: `1px solid ${C.hairline}`, borderRadius: 9, padding: "10px", fontSize: 13, marginBottom: 14, boxSizing: "border-box" }} />{movementFormError && <div className="f-body" style={{ fontSize: 12, color: C.rust, marginBottom: 12 }}>{movementFormError}</div>}<div style={{ display: "flex", gap: 10 }}><button onClick={submitMovementEntry} disabled={movementSaving} className="f-body" style={{ flex: 1, background: C.amber, color: "#221A0E", border: "none", borderRadius: 10, padding: "12px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>{movementSaving ? "Speichert…" : "Speichern"}</button><button onClick={() => { if (!movementSaving) { resetMovementForm(); setShowMovementAdd(false); } }} className="f-body" style={{ background: "transparent", color: C.muted, border: `1px solid ${C.hairline}`, borderRadius: 10, padding: "12px 16px", fontSize: 14 }}>Abbrechen</button></div></div></div>
      )}

      {/* SCHLAF: BACKFILL / EDIT SHEET */}
      {showSleepAdd && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50 }}>
          <div onClick={() => !sleepSaving && setShowSleepAdd(false)} className="anim-fade" style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)" }} />
          <div
            className="anim-sheet f-body"
            style={{ position: "absolute", left: 0, right: 0, bottom: 0, maxWidth: 460, margin: "0 auto", background: C.surface, borderTop: `1px solid ${C.hairline}`, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: "18px 18px 26px", maxHeight: "88vh", overflowY: "auto" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div className="f-display" style={{ fontSize: 19, color: C.text }}>Schlaf eintragen</div>
              <button onClick={() => !sleepSaving && setShowSleepAdd(false)} style={{ background: "transparent", border: "none", cursor: "pointer" }}>
                <X size={19} color={C.muted} />
              </button>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label className="f-body" style={{ fontSize: 12, color: C.muted }}>Datum</label>
              <input
                type="date"
                value={sleepFormDate}
                max={todayISO()}
                onChange={(e) => setSleepFormDate(e.target.value)}
                className="f-mono"
                style={{ width: "100%", background: C.raised, color: C.text, border: `1px solid ${C.hairline}`, borderRadius: 9, padding: "9px 10px", fontSize: 14, marginTop: 4, boxSizing: "border-box" }}
              />
              <div className="f-body" style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{fmtWeekday(sleepFormDate)}</div>
            </div>

            <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label className="f-body" style={{ fontSize: 12, color: C.muted }}>Zu Bett</label>
                <select
                  value={sleepFormBed}
                  onChange={(e) => setSleepFormBed(e.target.value)}
                  className="f-mono"
                  style={{ width: "100%", background: C.raised, color: C.text, border: `1px solid ${C.hairline}`, borderRadius: 9, padding: "9px 8px", fontSize: 15, marginTop: 4, boxSizing: "border-box" }}
                >
                  {TIME_OPTIONS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label className="f-body" style={{ fontSize: 12, color: C.muted }}>Aufgewacht</label>
                <select
                  value={sleepFormWake}
                  onChange={(e) => setSleepFormWake(e.target.value)}
                  className="f-mono"
                  style={{ width: "100%", background: C.raised, color: C.text, border: `1px solid ${C.hairline}`, borderRadius: 9, padding: "9px 8px", fontSize: 15, marginTop: 4, boxSizing: "border-box" }}
                >
                  {TIME_OPTIONS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>

            {sleepFormBed && sleepFormWake && (
              <div className="f-mono" style={{ fontSize: 12, color: C.night, marginBottom: 14 }}>
                → {fmtDuration(((timeToMinutes(sleepFormWake) - timeToMinutes(sleepFormBed)) + 1440) % 1440)}
              </div>
            )}

            {sleepFormError && (
              <div className="f-body" style={{ fontSize: 12, color: C.rust, marginBottom: 12 }}>{sleepFormError}</div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={submitSleepEntry}
                disabled={sleepSaving}
                className="f-body"
                style={{ flex: 1, background: C.night, color: "#1E2033", border: "none", borderRadius: 10, padding: "12px", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: sleepSaving ? 0.7 : 1 }}
              >
                {sleepSaving ? "Speichert…" : "Speichern"}
              </button>
              <button
                onClick={() => { if (!sleepSaving) { resetSleepForm(); setShowSleepAdd(false); } }}
                className="f-body"
                style={{ background: "transparent", color: C.muted, border: `1px solid ${C.hairline}`, borderRadius: 10, padding: "12px 16px", fontSize: 14, cursor: "pointer" }}
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
