// Radar Forex — Escáner en la nube
// Corre de forma independiente (GitHub Actions), sin depender del PC ni la luz de Agustin.
// Misma lógica de análisis que la página HTML: EMA 9/21 + RSI 14, filtro de tendencia mayor,
// Fibonacci, ATR, y riesgo con spread descontado. Envía las señales directo a Telegram.

import { readFileSync, writeFileSync, existsSync } from "fs";

const DRY_RUN = process.env.DRY_RUN === "1"; // para probar sin tocar APIs reales

const PARES = [
  { sym: "EUR/USD", id: "EURUSD", jpy: false, dec: 5, cripto: false },
  { sym: "GBP/USD", id: "GBPUSD", jpy: false, dec: 5, cripto: false },
  { sym: "USD/JPY", id: "USDJPY", jpy: true, dec: 3, cripto: false },
  { sym: "USD/CHF", id: "USDCHF", jpy: false, dec: 5, cripto: false },
  { sym: "USD/CAD", id: "USDCAD", jpy: false, dec: 5, cripto: false },
  { sym: "AUD/USD", id: "AUDUSD", jpy: false, dec: 5, cripto: false },
  // Cripto: opera 24/7, incluido sábado y domingo cuando el forex está cerrado.
  // OJO: "contrato" (unidades por 1.0 lote) y "spread" DEBEN verificarse en tu MT5
  // (clic derecho sobre el símbolo → Especificación) antes de usar dinero real.
  { sym: "BTC/USD", id: "BTCUSD", cripto: true, dec: 2 },
  { sym: "ETH/USD", id: "ETHUSD", cripto: true, dec: 2 },
  { sym: "XRP/USD", id: "XRPUSD", cripto: true, dec: 5 },
];

/* ============ Calendario del mercado forex ============ */
// Aproximado: cierra viernes ~21:00 UTC (5pm hora de Nueva York) y reabre
// domingo ~21:00 UTC. El cripto ignora esto y corre todos los días.
function forexAbierto(fecha = new Date()) {
  const dia = fecha.getUTCDay(); // 0=domingo, 5=viernes, 6=sábado
  const hora = fecha.getUTCHours();
  if (dia === 6) return false;
  if (dia === 0 && hora < 21) return false;
  if (dia === 5 && hora >= 21) return false;
  return true;
}

const COOLDOWN_MS = 15 * 60 * 1000;
const CONFIG_PATH = new URL("./config.json", import.meta.url);
const STATE_PATH = new URL("./state.json", import.meta.url);

function hoy() {
  return new Date().toISOString().slice(0, 10);
}
function leerJSON(url, def) {
  try {
    return JSON.parse(readFileSync(url, "utf8"));
  } catch (e) {
    return def;
  }
}
function guardarJSON(url, obj) {
  writeFileSync(url, JSON.stringify(obj, null, 2));
}
function esperar(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/* ============ Indicadores (idénticos a la página) ============ */
function ema(vals, p) {
  const k = 2 / (p + 1);
  const out = [];
  let prev = vals.slice(0, p).reduce((a, b) => a + b, 0) / p;
  for (let i = 0; i < vals.length; i++) {
    if (i < p - 1) { out.push(null); continue; }
    if (i === p - 1) { out.push(prev); continue; }
    prev = vals[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}
function rsi(vals, p = 14) {
  const out = new Array(vals.length).fill(null);
  let g = 0, l = 0;
  for (let i = 1; i <= p; i++) { const d = vals[i] - vals[i - 1]; if (d >= 0) g += d; else l -= d; }
  let ag = g / p, al = l / p;
  out[p] = 100 - 100 / (1 + (al === 0 ? 1e9 : ag / al));
  for (let i = p + 1; i < vals.length; i++) {
    const d = vals[i] - vals[i - 1];
    ag = (ag * (p - 1) + Math.max(d, 0)) / p;
    al = (al * (p - 1) + Math.max(-d, 0)) / p;
    out[i] = 100 - 100 / (1 + (al === 0 ? 1e9 : ag / al));
  }
  return out;
}
function atr(highs, lows, closes, p = 14) {
  const trs = [];
  for (let i = 1; i < closes.length; i++) {
    trs.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
  }
  let a = trs.slice(0, p).reduce((x, y) => x + y, 0) / p;
  for (let i = p; i < trs.length; i++) a = (a * (p - 1) + trs[i]) / p;
  return a;
}
function fibonacci(highs, lows, closes, dir, lookback = 40) {
  const hs = highs.slice(-lookback), ls = lows.slice(-lookback);
  const iHigh = hs.indexOf(Math.max(...hs));
  const iLow = ls.indexOf(Math.min(...ls));
  const swingHigh = hs[iHigh], swingLow = ls[iLow];
  const rango = swingHigh - swingLow;
  if (rango <= 0) return null;
  const precio = closes[closes.length - 1];
  let retro;
  if (dir === "BUY") {
    if (iLow > iHigh) return { retro: null, confluencia: false, nota: "impulso bajista reciente" };
    retro = (swingHigh - precio) / rango;
  } else {
    if (iHigh > iLow) return { retro: null, confluencia: false, nota: "impulso alcista reciente" };
    retro = (precio - swingLow) / rango;
  }
  const niveles = [0.382, 0.5, 0.618];
  let nivel = null;
  for (const f of niveles) if (Math.abs(retro - f) <= 0.08) nivel = f;
  return { retro, nivel, confluencia: nivel !== null, swingHigh, swingLow };
}
function evaluar(closes, highs, lows, sens) {
  const e9 = ema(closes, 9), e21 = ema(closes, 21), r = rsi(closes, 14);
  const n = closes.length - 1;
  const cruceUp = e9[n - 1] <= e21[n - 1] && e9[n] > e21[n];
  const cruceDown = e9[n - 1] >= e21[n - 1] && e9[n] < e21[n];
  const cruceUp2 = cruceUp || (e9[n - 2] <= e21[n - 2] && e9[n - 1] > e21[n - 1] && e9[n] > e21[n]);
  const cruceDown2 = cruceDown || (e9[n - 2] >= e21[n - 2] && e9[n - 1] < e21[n - 1] && e9[n] < e21[n]);
  const rsiN = r[n], rsiPrev = r[n - 1];
  let dir = null, motivo = "";
  if (sens === "conservador") {
    if (cruceUp && rsiN > 52 && rsiN < 70) { dir = "BUY"; motivo = "Cruce EMA 9>21 + RSI " + rsiN.toFixed(0); }
    else if (cruceDown && rsiN < 48 && rsiN > 30) { dir = "SELL"; motivo = "Cruce EMA 9<21 + RSI " + rsiN.toFixed(0); }
  } else if (sens === "balanceado") {
    if (cruceUp2 && rsiN > 50 && rsiN < 72) { dir = "BUY"; motivo = "Cruce EMA reciente + RSI " + rsiN.toFixed(0); }
    else if (cruceDown2 && rsiN < 50 && rsiN > 28) { dir = "SELL"; motivo = "Cruce EMA reciente + RSI " + rsiN.toFixed(0); }
  } else {
    const tendUp = closes[n] > e9[n] && e9[n] > e21[n];
    const tendDn = closes[n] < e9[n] && e9[n] < e21[n];
    if ((cruceUp2 || (tendUp && rsiPrev <= 50 && rsiN > 50)) && rsiN < 75) { dir = "BUY"; motivo = "Impulso alcista (RSI cruza 50)"; }
    else if ((cruceDown2 || (tendDn && rsiPrev >= 50 && rsiN < 50)) && rsiN > 25) { dir = "SELL"; motivo = "Impulso bajista (RSI cruza 50)"; }
  }
  return { dir, motivo, e9: e9[n], e21: e21[n], rsi: rsiN, atr: atr(highs, lows, closes, 14) };
}
function tendenciaHTF(closes) {
  if (!closes || closes.length < 16) return "flat";
  const p = closes.length >= 30 ? 21 : 10;
  const e = ema(closes, p);
  const n = closes.length - 1;
  const margen = Math.abs(e[n]) * 0.00004;
  if (closes[n] > e[n] + margen) return "up";
  if (closes[n] < e[n] - margen) return "down";
  return "flat";
}
function pipInfo(par, precio, lotes, cfg) {
  if (par.cripto) {
    // Sin "pips": medimos en incrementos de $1 en el precio del activo.
    // pipUSD = cuánto gana/pierde tu posición si el precio se mueve $1.
    const contrato = (cfg.criptoContratos && cfg.criptoContratos[par.id]) || 1;
    const pipSize = 1;
    const pipUSD = lotes * contrato * pipSize;
    return { pipSize, pipUSD };
  }
  const unidades = lotes * 100000;
  const pipSize = par.jpy ? 0.01 : 0.0001;
  let pipUSD;
  if (par.sym.endsWith("/USD")) pipUSD = unidades * pipSize;
  else pipUSD = (unidades * pipSize) / precio;
  return { pipSize, pipUSD };
}
function planOperacion(par, precio, dir, cfg) {
  const { pipSize, pipUSD } = pipInfo(par, precio, cfg.lote, cfg);
  const spread = par.cripto ? ((cfg.criptoSpreads && cfg.criptoSpreads[par.id]) || 0) : (cfg.spreads[par.id] || 0);
  const slPips = cfg.riesgo / pipUSD - spread;
  const tp1Pips = cfg.tp1 / pipUSD + spread;
  const tp2Pips = cfg.tp2 / pipUSD + spread;
  const spreadUSD = spread * pipUSD;
  const unidad = par.cripto ? "$ de movimiento" : "pips";
  if (slPips < (par.cripto ? 0.0001 : 3)) {
    return { valida: false, motivoInvalida: `Spread (≈ $${spreadUSD.toFixed(2)}) deja solo ${Math.max(slPips, 0).toFixed(par.cripto ? 4 : 1)} ${unidad} de stop` };
  }
  const s = dir === "BUY" ? 1 : -1;
  const sl = precio - s * slPips * pipSize;
  const tp1 = precio + s * tp1Pips * pipSize;
  const tp2 = precio + s * tp2Pips * pipSize;
  // Seguridad: si el contrato/spread configurado da un resultado imposible
  // (precio negativo o un stop mayor al 50% del precio), no se envía la señal.
  // Esto casi siempre significa que "contrato" en config.json está mal para ese activo.
  if (sl <= 0 || tp1 <= 0 || tp2 <= 0 || Math.abs(precio - sl) > precio * 0.5) {
    return { valida: false, motivoInvalida: `Cálculo de riesgo fuera de rango (revisa "contrato" en config.json para ${par.id})` };
  }
  return {
    valida: true,
    entrada: precio,
    sl, tp1, tp2,
    slPips, tp1Pips, tp2Pips, pipUSD, spread, spreadUSD, unidad,
  };
}
function fibTexto(fib) {
  if (!fib || fib.retro === null) return "";
  const pct = (fib.retro * 100).toFixed(0);
  return fib.confluencia ? ` · Fib ${pct}% ★` : ` · Fib ${pct}%`;
}

/* ============ Datos: Twelve Data ============ */
async function fetchSerie(sym, interval, key, size) {
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(sym)}&interval=${interval}&outputsize=${size}&apikey=${encodeURIComponent(key)}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status === "error" || !data.values) throw new Error(data.message || "Respuesta inválida de la API");
  const v = data.values.slice().reverse();
  return {
    closes: v.map((x) => parseFloat(x.close)),
    highs: v.map((x) => parseFloat(x.high)),
    lows: v.map((x) => parseFloat(x.low)),
  };
}

/* ============ Datos: modo de prueba (sin API real) ============ */
function serieSintetica(base, jpy, n) {
  const closes = [], highs = [], lows = [];
  let v = base, regimen = 1;
  const vol = jpy ? 0.05 : 0.00035;
  for (let i = 0; i < n; i++) {
    if (i % 22 === 0) regimen = -regimen;
    const prev = v;
    v = prev + regimen * vol * 0.45 + (Math.random() - 0.5) * vol * 2;
    highs.push(Math.max(prev, v) + Math.random() * vol * 0.6);
    lows.push(Math.min(prev, v) - Math.random() * vol * 0.6);
    closes.push(v);
  }
  return { closes, highs, lows };
}

/* ============ Telegram ============ */
async function enviarTelegram(token, chatId, texto) {
  if (DRY_RUN) { console.log("[DRY_RUN] Telegram:\n" + texto); return; }
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ chat_id: chatId, text: texto }),
  });
  if (!res.ok) console.error("Error enviando a Telegram:", await res.text());
}

/* ============ Programa principal ============ */
async function main() {
  const cfg = leerJSON(CONFIG_PATH, null);
  if (!cfg) throw new Error("No se encontró config.json");
  let state = leerJSON(STATE_PATH, { dia: hoy(), senalesHoy: 0, ultimaSenal: {} });
  if (state.dia !== hoy()) { state.dia = hoy(); state.senalesHoy = 0; }

  const key = process.env.TWELVE_DATA_API_KEY;
  const tgToken = process.env.TELEGRAM_BOT_TOKEN;
  const tgChat = process.env.TELEGRAM_CHAT_ID;
  if (!DRY_RUN && (!key || !tgToken || !tgChat)) {
    throw new Error("Faltan variables de entorno: TWELVE_DATA_API_KEY, TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID (revisa los Secrets del repositorio)");
  }

  const htfInterval = cfg.tf === "1min" ? "15min" : "30min";
  const forexOK = forexAbierto();
  let llamadas = 0;

  for (const par of PARES) {
    if (!par.cripto && !forexOK) {
      console.log(`${par.sym}: mercado forex cerrado (fin de semana), se salta`);
      continue;
    }
    try {
      let serie, htfCloses = null;
      if (DRY_RUN) {
        serie = serieSintetica(par.jpy ? 155 : 1.1, par.jpy, 90);
        if (cfg.htf) htfCloses = serieSintetica(par.jpy ? 155 : 1.1, par.jpy, 60).closes;
      } else {
        if (llamadas > 0) await esperar(8000); // respeta el límite de 8 llamadas/min de Twelve Data
        serie = await fetchSerie(par.sym, cfg.tf, key, 90);
        llamadas++;
        if (cfg.htf) {
          await esperar(8000);
          htfCloses = (await fetchSerie(par.sym, htfInterval, key, 60)).closes;
          llamadas++;
        }
      }
      const { closes, highs, lows } = serie;
      if (closes.length < 40) { console.log(`${par.sym}: datos insuficientes`); continue; }

      const ev = evaluar(closes, highs, lows, cfg.sens);
      if (!ev.dir) { console.log(`${par.sym}: sin señal (RSI ${ev.rsi.toFixed(1)})`); continue; }

      const precio = closes.at(-1);
      const htfDir = cfg.htf ? tendenciaHTF(htfCloses) : null;
      const fib = cfg.fib !== "off" ? fibonacci(highs, lows, closes, ev.dir) : null;

      if (cfg.htf && ((ev.dir === "BUY" && htfDir !== "up") || (ev.dir === "SELL" && htfDir !== "down"))) {
        console.log(`${par.sym}: señal ${ev.dir} descartada por tendencia mayor (${htfDir})`);
        continue;
      }
      if (cfg.fib === "req" && !(fib && fib.confluencia)) {
        console.log(`${par.sym}: señal ${ev.dir} descartada por falta de confluencia Fibonacci`);
        continue;
      }
      const plan = planOperacion(par, precio, ev.dir, cfg);
      if (!plan.valida) { console.log(`${par.sym}: ${plan.motivoInvalida}`); continue; }

      const clave = par.sym + "|" + ev.dir;
      const ahora = Date.now();
      if (state.ultimaSenal[clave] && ahora - state.ultimaSenal[clave] < COOLDOWN_MS) {
        console.log(`${par.sym}: señal ${ev.dir} en cooldown`);
        continue;
      }
      state.ultimaSenal[clave] = ahora;
      state.senalesHoy++;

      const fibStar = fib && fib.confluencia ? " ★Fib" : "";
      const decSl = par.cripto ? 4 : 1;
      const texto = `${ev.dir === "BUY" ? "🟢 COMPRA" : "🔴 VENTA"} ${par.sym}${fibStar}${par.cripto ? " (fin de semana)" : ""}
Entrada: ${plan.entrada.toFixed(par.dec)}
Stop:    ${plan.sl.toFixed(par.dec)} (${plan.slPips.toFixed(decSl)} ${plan.unidad} · -$${cfg.riesgo.toFixed(2)})
TP 1:    ${plan.tp1.toFixed(par.dec)} (+$${cfg.tp1.toFixed(2)})
TP 2:    ${plan.tp2.toFixed(par.dec)} (+$${cfg.tp2.toFixed(2)})
Motivo:  ${ev.motivo}${fibTexto(fib)}`;

      console.log(texto);
      await enviarTelegram(tgToken, tgChat, texto);
    } catch (err) {
      console.error(`Error en ${par.sym}:`, err.message);
    }
  }

  guardarJSON(STATE_PATH, state);
  console.log(`Listo. Señales hoy: ${state.senalesHoy}`);
}

main().catch((err) => {
  console.error("Error fatal:", err.message);
  process.exit(1);
});
