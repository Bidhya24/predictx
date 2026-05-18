import React, { useState, useEffect, useCallback, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { ethers } from "ethers";

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const CONTRACT_ADDRESS = "0xa0c7A8Ebf9E88B464a84F482ea2aC24688705052"; 
const USDC_ADDRESS     = "0x3600000000000000000000000000000000000000"; // Arc Native System Contract

const ARC_TESTNET = {
  chainId:         "0x" + (5042002).toString(16), // 5042002 -> 0x4cef52
  chainName:       "Arc Testnet",
  nativeCurrency:  { name: "USDC", symbol: "USDC", decimals: 6 },
  rpcUrls:         ["https://rpc.testnet.arc.network"],
  blockExplorerUrls: ["https://testnet.arcscan.app"],
};

// ─── ABI ─────────────────────────────────────────────────────────────────────
const CONTRACT_ABI = [
  "function placeBet(uint8 asset, uint8 direction, uint8 duration, uint256 amount, int256 openPrice) external",
  "function settleBet(uint226 betId, int256 closePrice) external",
  "function getUserBets(address user) view returns (uint256[])",
  "function getBet(uint256 betId) view returns (tuple(uint256 id, address user, uint8 asset, uint8 direction, uint8 duration, uint256 amount, int256 openPrice, int256 closePrice, uint256 openTime, uint256 closeTime, uint8 status))",
  "function getUserStats(address user) view returns (uint256 trades, uint256 wins, uint256 winRateBps, int256 pnl)",
  "function getLeaderboard() view returns (address[] players, int256[] pnls, uint256[] trades)",
  "function getWeeklyLeaderboard(uint256 week) view returns (address[] players, int256[] pnls)",
  "function getDailyLeaderboard(uint256 day) view returns (address[] players, int256[] pnls)",
  "function getPendingBets(address user) view returns (uint256[])",
  "function currentWeek() view returns (uint256)",
  "function currentDay() view returns (uint256)",
];

const USDC_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
];

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const ASSETS = ["BTC", "ETH", "SOL"];
const BINANCE_SYMBOLS = { BTC: "BTCUSDT", ETH: "ETHUSDT", SOL: "SOLUSDT" };
const DURATIONS = [
  { label: "1 minute",  value: 0, seconds: 60 },
  { label: "3 minute",  value: 1, seconds: 180 },
  { label: "5 minute",  value: 2, seconds: 300 },
];
const STATUS_MAP = { 0: "PENDING", 1: "WON", 2: "LOST", 3: "DRAW" };
const ASSET_COLORS = { BTC: "#f7931a", ETH: "#627eea", SOL: "#9945ff" };

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function shortAddr(addr) {
  if (!addr) return "";
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght=400;700&family=Syne:wght=400;600;700;800&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg:        #050508; --bg2:       #0c0c14; --bg3:       #12121e;
    --border:    #1e1e30; --border2:   #2a2a40; --text:      #e8e8f0;
    --muted:     #6b6b8a; --green:     #00e676; --green2:    #00c853;
    --red:       #ff3d5a; --red2:      #c62828; --gold:      #ffd600;
    --btc:       #f7931a; --eth:       #627eea; --sol:       #9945ff; --accent:    #4f8aff;
  }
  html, body, #root { height: 100%; }
  body { font-family: 'Syne', sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; overflow-x: hidden; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: var(--bg2); }
  ::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 2px; }
  .grid-bg { position: fixed; inset: 0; z-index: 0; pointer-events: none; background-image: linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px); background-size: 40px 40px; opacity: 0.3; }
  .app { position: relative; z-index: 1; min-height: 100vh; display: flex; flex-direction: column; }
  .header { display: flex; align-items: center; justify-content: space-between; padding: 16px 24px; border-bottom: 1px solid var(--border); background: rgba(5,5,8,0.9); backdrop-filter: blur(12px); position: sticky; top: 0; z-index: 100; }
  .logo { font-size: 20px; font-weight: 800; letter-spacing: -0.5px; background: linear-gradient(135deg, #4f8aff, #9945ff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  .logo span { color: var(--green); -webkit-text-fill-color: var(--green); }
  .nav { display: flex; gap: 4px; }
  .nav-btn { padding: 8px 16px; border-radius: 8px; border: none; cursor: pointer; font-family: 'Syne', sans-serif; font-size: 13px; font-weight: 600; background: transparent; color: var(--muted); transition: all 0.2s; letter-spacing: 0.3px; }
  .nav-btn:hover { color: var(--text); background: var(--bg3); }
  .nav-btn.active { background: var(--bg3); color: var(--text); border: 1px solid var(--border2); }
  .wallet-btn { padding: 9px 18px; border-radius: 8px; border: 1px solid var(--border2); cursor: pointer; font-family: 'Syne', sans-serif; font-size: 13px; font-weight: 700; background: var(--bg3); color: var(--text); transition: all 0.2s; letter-spacing: 0.3px; display: flex; align-items: center; gap: 8px; }
  .wallet-btn:hover { border-color: var(--accent); color: var(--accent); }
  .wallet-btn.connected { border-color: var(--green); color: var(--green); }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--green); animation: pulse 2s infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
  .main { flex: 1; display: grid; grid-template-columns: 1fr 380px; gap: 0; max-width: 1400px; margin: 0 auto; width: 100%; padding: 24px; }
  .chart-side { padding-right: 24px; }
  .asset-tabs { display: flex; gap: 8px; margin-bottom: 20px; }
  .asset-tab { display: flex; align-items: center; gap: 8px; padding: 10px 20px; border-radius: 10px; border: 1px solid var(--border); background: var(--bg2); cursor: pointer; font-family: 'Syne', sans-serif; font-weight: 700; font-size: 14px; color: var(--muted); transition: all 0.2s; }
  .asset-tab:hover { border-color: var(--border2); color: var(--text); }
  .asset-tab.active { border-color: var(--accent); color: var(--text); background: rgba(79,138,255,0.08); }
  .asset-tab .asset-dot { width: 8px; height: 8px; border-radius: 50%; }
  .price-header { margin-bottom: 16px; }
  .price-label { font-size: 12px; font-weight: 600; color: var(--muted); letter-spacing: 1px; text-transform: uppercase; margin-bottom: 6px; }
  .price-big { font-family: 'Space Mono', monospace; font-size: 36px; font-weight: 700; letter-spacing: -1px; }
  .price-change { font-family: 'Space Mono', monospace; font-size: 13px; margin-top: 4px; }
  .price-change.up { color: var(--green); }
  .price-change.down { color: var(--red); }
  .chart-box { background: var(--bg2); border: 1px solid var(--border); border-radius: 16px; padding: 20px; margin-bottom: 20px; position: relative; overflow: hidden; }
  .duration-tabs { display: flex; gap: 8px; margin-bottom: 20px; }
  .dur-tab { flex: 1; padding: 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg2); cursor: pointer; font-family: 'Syne', sans-serif; font-weight: 700; font-size: 13px; color: var(--muted); transition: all 0.2s; text-align: center; }
  .dur-tab:hover { color: var(--text); border-color: var(--border2); }
  .dur-tab.active { background: var(--bg3); color: var(--text); border-color: var(--border2); }
  .bet-panel { background: var(--bg2); border: 1px solid var(--border); border-radius: 16px; padding: 24px; position: sticky; top: 80px; align-self: start; }
  .panel-title { font-size: 11px; font-weight: 700; color: var(--muted); letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 20px; }
  .pool-bar-wrap { margin-bottom: 24px; }
  .pool-label { font-size: 11px; color: var(--muted); letter-spacing: 0.8px; text-transform: uppercase; margin-bottom: 10px; }
  .pool-bar { display: flex; height: 8px; border-radius: 4px; overflow: hidden; margin-bottom: 8px; }
  .pool-bar-green { background: var(--green); transition: width 0.5s; }
  .pool-bar-red { background: var(--red); flex: 1; }
  .pool-stats { display: flex; justify-content: space-between; font-family: 'Space Mono', monospace; font-size: 11px; }
  .pool-stats .up { color: var(--green); }
  .pool-stats .down { color: var(--red); }
  .bet-input-wrap { margin-bottom: 20px; }
  .bet-input-label-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .bet-input-label { font-size: 11px; color: var(--muted); letter-spacing: 0.8px; text-transform: uppercase; }
  .balance-display { font-family: 'Space Mono', monospace; font-size: 11px; color: var(--accent); font-weight: bold; }
  .bet-input-row { display: flex; align-items: center; gap: 8px; }
  .bet-input { flex: 1; padding: 12px 14px; border-radius: 8px; border: 1px solid var(--border2); background: var(--bg3); color: var(--text); font-family: 'Space Mono', monospace; font-size: 15px; outline: none; transition: border-color 0.2s; }
  .bet-input:focus { border-color: var(--accent); }
  .usdc-tag { padding: 12px 12px; border-radius: 8px; background: var(--bg3); border: 1px solid var(--border2); font-size: 11px; font-weight: 700; color: var(--muted); letter-spacing: 0.5px; white-space: nowrap; }
  .quick-amounts { display: flex; gap: 6px; margin-top: 8px; }
  .quick-btn { flex: 1; padding: 6px; border-radius: 6px; border: 1px solid var(--border); background: transparent; color: var(--muted); font-family: 'Syne', sans-serif; font-size: 12px; cursor: pointer; transition: all 0.2s; }
  .quick-btn:hover { border-color: var(--border2); color: var(--text); }
  .payout-info { background: var(--bg3); border-radius: 8px; padding: 12px 14px; margin-bottom: 20px; }
  .payout-row { display: flex; justify-content: space-between; font-size: 12px; color: var(--muted); margin-bottom: 4px; }
  .payout-row:last-child { margin-bottom: 0; color: var(--text); font-weight: 700; font-size: 13px; }
  .payout-row span:last-child { font-family: 'Space Mono', monospace; }
  .bet-buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .btn-higher, .btn-lower { padding: 16px; border-radius: 10px; border: none; cursor: pointer; font-family: 'Syne', sans-serif; font-size: 15px; font-weight: 800; transition: all 0.15s; letter-spacing: 0.5px; display: flex; align-items: center; justify-content: center; gap: 6px; }
  .btn-higher { background: var(--green); color: #000; }
  .btn-higher:hover { background: #00ff84; transform: translateY(-1px); box-shadow: 0 4px 20px rgba(0,230,118,0.3); }
  .btn-lower { background: var(--red); color: #fff; }
  .btn-lower:hover { background: #ff5577; transform: translateY(-1px); box-shadow: 0 4px 20px rgba(255,61,90,0.3); }
  .btn-higher:disabled, .btn-lower:disabled { opacity: 0.4; cursor: not-allowed; transform: none; box-shadow: none; }
  .pending-section { margin-top: 20px; }
  .pending-title { font-size: 11px; color: var(--muted); letter-spacing: 0.8px; text-transform: uppercase; margin-bottom: 10px; }
  .pending-bet { background: var(--bg3); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
  .pending-bet-info { font-size: 12px; }
  .pending-bet-info .asset { font-weight: 700; color: var(--text); }
  .pending-bet-info .meta { color: var(--muted); font-family: 'Space Mono', monospace; font-size: 11px; margin-top: 2px; }
  .settle-btn { padding: 5px 10px; border-radius: 6px; border: 1px solid var(--border2); background: transparent; color: var(--accent); font-family: 'Syne', sans-serif; font-size: 11px; font-weight: 700; cursor: pointer; transition: all 0.2s; }
  .settle-btn:hover { background: var(--accent); color: #000; }
  .settle-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .page { max-width: 900px; margin: 0 auto; padding: 32px 24px; }
  .page-title { font-size: 28px; font-weight: 800; margin-bottom: 8px; }
  .page-sub { color: var(--muted); font-size: 14px; margin-bottom: 32px; }
  .stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 32px; }
  .stat-card { background: var(--bg2); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
  .stat-card .label { font-size: 11px; color: var(--muted); letter-spacing: 1px; text-transform: uppercase; margin-bottom: 8px; }
  .stat-card .value { font-family: 'Space Mono', monospace; font-size: 22px; font-weight: 700; }
  .stat-card .value.green { color: var(--green); }
  .stat-card .value.red { color: var(--red); }
  .history-item { background: var(--bg2); border: 1px solid var(--border); border-radius: 10px; padding: 16px 20px; margin-bottom: 8px; display: flex; align-items: center; gap: 16px; }
  .history-icon { width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }
  .history-icon.won { background: rgba(0,230,118,0.12); }
  .history-icon.lost { background: rgba(255,61,90,0.12); }
  .history-icon.pending { background: rgba(79,138,255,0.12); }
  .history-info { flex: 1; }
  .history-info .top { font-weight: 700; font-size: 14px; margin-bottom: 3px; }
  .history-info .bot { color: var(--muted); font-size: 12px; font-family: 'Space Mono', monospace; }
  .history-result { text-align: right; }
  .history-result .amount { font-family: 'Space Mono', monospace; font-size: 15px; font-weight: 700; }
  .history-result .amount.won { color: var(--green); }
  .history-result .amount.lost { color: var(--red); }
  .history-result .amount.pending { color: var(--accent); }
  .history-result .date { color: var(--muted); font-size: 11px; margin-top: 3px; font-family: 'Space Mono', monospace; }
  .lb-tabs { display: flex; gap: 4px; margin-bottom: 24px; }
  .lb-tab { padding: 8px 18px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg2); cursor: pointer; font-family: 'Syne', sans-serif; font-size: 13px; font-weight: 700; color: var(--muted); transition: all 0.2s; }
  .lb-tab.active { background: var(--bg3); color: var(--text); border-color: var(--border2); }
  .your-rank { background: linear-gradient(135deg, rgba(79,138,255,0.08), rgba(153,69,255,0.08)); border: 1px solid rgba(79,138,255,0.3); border-radius: 12px; padding: 20px 24px; margin-bottom: 24px; display: flex; align-items: center; justify-content: space-between; }
  .your-rank .rank-num { font-size: 32px; font-weight: 800; font-family: 'Space Mono', monospace; color: var(--accent); }
  .your-rank .rank-label { font-size: 11px; color: var(--muted); letter-spacing: 1px; text-transform: uppercase; margin-top: 2px; }
  .your-rank .rank-pnl { font-family: 'Space Mono', monospace; font-size: 22px; font-weight: 700; text-align: right; }
  .lb-row { display: flex; align-items: center; gap: 16px; background: var(--bg2); border: 1px solid var(--border); border-radius: 10px; padding: 14px 20px; margin-bottom: 6px; transition: border-color 0.2s; }
  .lb-row:hover { border-color: var(--border2); }
  .lb-row.top3 { border-color: rgba(255,214,0,0.2); background: rgba(255,214,0,0.03); }
  .lb-rank { font-family: 'Space Mono', monospace; font-size: 14px; font-weight: 700; width: 32px; color: var(--muted); }
  .lb-rank.gold { color: #ffd600; }
  .lb-rank.silver { color: #b0b0b0; }
  .lb-rank.bronze { color: #cd7f32; }
  .lb-avatar { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }
  .lb-addr { flex: 1; font-family: 'Space Mono', monospace; font-size: 13px; }
  .lb-trades { font-size: 12px; color: var(--muted); }
  .lb-pnl { font-family: 'Space Mono', monospace; font-size: 15px; font-weight: 700; }
  .lb-pnl.pos { color: var(--green); }
  .lb-pnl.neg { color: var(--red); }
  .empty { text-align: center; padding: 60px 20px; color: var(--muted); font-size: 14px; }
  .connect-prompt { text-align: center; padding: 80px 20px; }
  .connect-prompt h2 { font-size: 24px; font-weight: 800; margin-bottom: 8px; }
  .connect-prompt p { color: var(--muted); margin-bottom: 24px; }
  .toast { position: fixed; bottom: 24px; right: 24px; z-index: 9999; background: var(--bg3); border: 1px solid var(--border2); border-radius: 10px; padding: 14px 18px; font-size: 13px; max-width: 320px; animation: slideIn 0.3s ease; box-shadow: 0 8px 32px rgba(0,0,0,0.4); }
  .toast.success { border-color: var(--green); color: var(--green); }
  .toast.error   { border-color: var(--red);   color: var(--red); }
  .toast.info    { border-color: var(--accent); color: var(--accent); }
  @media (max-width: 900px) { .main { grid-template-columns: 1fr; } .chart-side { padding-right: 0; margin-bottom: 20px; } .stats-row { grid-template-columns: 1fr 1fr; } }
`;

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ backgroundColor: "#0c0c14", border: "1px solid #1e1e30", padding: "10px", borderRadius: "6px" }}>
      <p style={{ margin: 0, fontSize: "12px", color: "#6b6b8a" }}>{payload[0].payload.time}</p>
      <p style={{ margin: "4px 0 0 0", fontFamily: "Space Mono, monospace", fontWeight: "bold", color: "#00e676" }}>
        ${payload[0].value.toFixed(2)}
      </p>
    </div>
  );
}

function formatUSDC(raw) {
  return (Number(raw) / 1e6).toFixed(2);
}

function formatPnL(raw) {
  const n = Number(raw) / 1e6;
  return (n >= 0 ? "+" : "") + n.toFixed(2);
}

async function fetchBinancePrice(symbol) {
  const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
  const data = await res.json();
  return parseFloat(data.price);
}

async function fetchBinanceKlines(symbol, interval = "1m", limit = 60) {
  const res = await fetch(
    `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
  );
  const data = await res.json();
  return data.map((k) => ({
    time: new Date(k[0]).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    price: parseFloat(k[4]),
    open: parseFloat(k[1]),
  }));
}

export default function App() {
  const [tab, setTab] = useState("trade");
  const [activeAsset, setActiveAsset] = useState(0); // 0=BTC, 1=ETH, 2=SOL
  const [activeDuration, setActiveDuration] = useState(0); // 0=1m, 1=3m, 2=5m
  const [betAmount, setBetAmount] = useState("10");
  const [currentPrice, setCurrentPrice] = useState(0);
  const [chartData, setChartData] = useState([]);
  const [account, setAccount] = useState(null);
  const [usdcBalance, setUsdcBalance] = useState("0.00");
  const [loading, setLoading] = useState(false);
  const [pendingBets, setPendingBets] = useState([]);
  const [userStats, setUserStats] = useState({ trades: 0, wins: 0, winRateBps: 0, pnl: 0 });
  const [history, setHistory] = useState([]);
  const [leaderboard, setLeaderboard] = useState({ players: [], pnls: [], trades: [] });
  const [lbTab, setLbTab] = useState("alltime");
  const [toast, setToast] = useState(null);

  const showToast = (text, type = "info") => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4000);
  };

  const getProviderOrSigner = async (needSigner = false) => {
    if (!window.ethereum) throw new Error("MetaMask not found");
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    if (needSigner) {
      return provider.getSigner();
    }
    return provider;
  };

  const connectWallet = async () => {
    try {
      if (!window.ethereum) return showToast("Please install MetaMask extension", "error");
      setLoading(true);
      
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: ARC_TESTNET.chainId }],
        });
      } catch (switchError) {
        if (switchError.code === 4902) {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [ARC_TESTNET],
          });
        } else {
          throw switchError;
        }
      }

      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      setAccount(accounts[0]);
      showToast("Wallet connected successfully", "success");
    } catch (err) {
      showToast(err.message || "Failed to connect wallet", "error");
    } finally {
      setLoading(false);
    }
  };

  const fetchAppData = useCallback(async () => {
    if (!account) return;
    try {
      const provider = await getProviderOrSigner();
      
      // Fetch Live USDC Balance from native contract
      const usdcContract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider);
      const rawBalance = await usdcContract.balanceOf(account);
      setUsdcBalance(formatUSDC(rawBalance));

      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
      
      const stats = await contract.getUserStats(account);
      setUserStats({
        trades: stats.trades.toNumber(),
        wins: stats.wins.toNumber(),
        winRateBps: stats.winRateBps.toNumber(),
        pnl: stats.pnl.toString(),
      });

      const pBetsIds = await contract.getPendingBets(account);
      const fetchedPending = await Promise.all(
        pBetsIds.map(async (id) => {
          const b = await contract.getBet(id);
          return { ...b, id: id.toNumber() };
        })
      );
      setPendingBets(fetchedPending);

      const allBetIds = await contract.getUserBets(account);
      const fetchedHistory = await Promise.all(
        allBetIds.slice(-10).map(async (id) => {
          const b = await contract.getBet(id);
          return { ...b, id: id.toNumber() };
        })
      );
      setHistory(fetchedHistory.reverse());

      let lbData;
      if (lbTab === "alltime") {
        lbData = await contract.getLeaderboard();
      } else if (lbTab === "weekly") {
        const week = await contract.currentWeek();
        lbData = await contract.getWeeklyLeaderboard(week);
      } else {
        const day = await contract.currentDay();
        lbData = await contract.getDailyLeaderboard(day);
      }
      setLeaderboard({
        players: lbData.players,
        pnls: lbData.pnls.map(p => p.toString()),
        trades: lbData.trades ? lbData.trades.map(t => t.toNumber()) : [],
      });
    } catch (err) {
      console.error("Data fetch error:", err);
    }
  }, [account, lbTab]);

  // ULTRA FAST REFRESH INTERVAL LOOP (Dropped from 4s down to 1s)
  useEffect(() => {
    const symbol = BINANCE_SYMBOLS[ASSETS[activeAsset]];
    fetchBinancePrice(symbol).then(setCurrentPrice);
    fetchBinanceKlines(symbol).then(setChartData);

    const interval = setInterval(() => {
      fetchBinancePrice(symbol).then(setCurrentPrice);
      fetchBinanceKlines(symbol).then(setChartData); // Keep the chart moving live!
    }, 1000);

    return () => clearInterval(interval);
  }, [activeAsset]);

  useEffect(() => {
    fetchAppData();
  }, [fetchAppData]);

  const handlePlaceBet = async (direction) => {
    if (!account) return connectWallet();
    try {
      setLoading(true);
      const signer = await getProviderOrSigner(true);
      const usdcContract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, signer);
      const marketContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

      const amountWei = ethers.utils.parseUnits(betAmount, 6);
      showToast("Checking allowance...", "info");
      
      const allowance = await usdcContract.allowance(account, CONTRACT_ADDRESS);
      if (allowance.lt(amountWei)) {
        showToast("Approving USDC spending...", "info");
        const txApp = await usdcContract.approve(CONTRACT_ADDRESS, ethers.constants.MaxUint256);
        await txApp.wait();
        showToast("USDC Approved!", "success");
      }

      const priceScale = ethers.BigNumber.from(Math.round(currentPrice * 1e8));
      showToast("Signing prediction transaction...", "info");
      
      const txBet = await marketContract.placeBet(
        activeAsset,
        direction,
        activeDuration,
        amountWei,
        priceScale
      );
      await txBet.wait();
      
      showToast("Bet successfully submitted!", "success");
      fetchAppData();
    } catch (err) {
      showToast(err.data?.message || err.message || "Transaction failed", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSettle = async (betId) => {
    try {
      setLoading(true);
      const signer = await getProviderOrSigner(true);
      const marketContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const symbol = BINANCE_SYMBOLS[ASSETS[activeAsset]];
      
      showToast("Fetching execution price...", "info");
      const liveClosePrice = await fetchBinancePrice(symbol);
      const closePriceScaled = ethers.BigNumber.from(Math.round(liveClosePrice * 1e8));

      showToast("Settling position outcome...", "info");
      const tx = await marketContract.settleBet(betId, closePriceScaled);
      await tx.wait();

      showToast("Position settled completely!", "success");
      fetchAppData();
    } catch (err) {
      showToast(err.data?.message || err.message || "Settlement failed", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <style>{STYLES}</style>
      <div className="grid-bg" />

      {toast && <div className={`toast ${toast.type}`}>{toast.text}</div>}

      <header className="header">
        <div className="logo">PREDICT<span>X</span></div>
        <nav className="nav">
          <button className={`nav-btn ${tab === "trade" ? "active" : ""}`} onClick={() => setTab("trade")}>MARKET</button>
          <button className={`nav-btn ${tab === "dashboard" ? "active" : ""}`} onClick={() => setTab("dashboard")}>DASHBOARD</button>
          <button className={`nav-btn ${tab === "leaderboard" ? "active" : ""}`} onClick={() => setTab("leaderboard")}>LEADERBOARD</button>
        </nav>
        <button className={`wallet-btn ${account ? "connected" : ""}`} onClick={connectWallet} disabled={loading}>
          {account ? (
            <>
              <div className="dot" />
              {shortAddr(account)}
            </>
          ) : (
            loading ? <div className="spinner" /> : "CONNECT WALLET"
          )}
        </button>
      </header>

      {tab === "trade" && (
        <main className="main">
          <div className="chart-side">
            <div className="asset-tabs">
              {ASSETS.map((symbol, idx) => (
                <button
                  key={symbol}
                  className={`asset-tab ${activeAsset === idx ? "active" : ""}`}
                  onClick={() => setActiveAsset(idx)}
                >
                  <div className="asset-dot" style={{ backgroundColor: ASSET_COLORS[symbol] }} />
                  {symbol}
                </button>
              ))}
            </div>

            <div className="price-header">
              <div className="price-label">{ASSETS[activeAsset]} / USDC Price</div>
              <div className="price-big">${currentPrice ? currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "0.00"}</div>
            </div>

            <div className="chart-box">
              <div style={{ width: "100%", height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <XAxis dataKey="time" stroke="#2a2a40" tick={{ fill: "#6b6b8a", fontSize: 11 }} />
                    <YAxis hide domain={["dataMin - 5", "dataMax + 5"]} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="price" stroke={ASSET_COLORS[ASSETS[activeAsset]]} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="duration-tabs">
              {DURATIONS.map((dur) => (
                <button
                  key={dur.value}
                  className={`dur-tab ${activeDuration === dur.value ? "active" : ""}`}
                  onClick={() => setActiveDuration(dur.value)}
                >
                  {dur.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bet-panel">
            <div className="panel-title">Execution Terminal</div>

            <div className="bet-input-wrap">
              <div className="bet-input-label-row">
                <div className="bet-input-label">Collateral Size</div>
                {account && (
                  <div className="balance-display">
                    Bal: {usdcBalance} USDC
                  </div>
                )}
              </div>
              <div className="bet-input-row">
                <input
                  type="number"
                  className="bet-input"
                  value={betAmount}
                  onChange={(e) => setBetAmount(e.target.value)}
                  min="1"
                />
                <div className="usdc-tag">USDC</div>
              </div>
              <div className="quick-amounts">
                {["10", "50", "100", "500"].map((amt) => (
                  <button key={amt} className="quick-btn" onClick={() => setBetAmount(amt)}>${amt}</button>
                ))}
              </div>
            </div>

            <div className="payout-info">
              <div className="payout-row"><span>Multiplier</span><span>2.00x</span></div>
              <div className="payout-row"><span>Potential Returns</span><span>${(Number(betAmount) * 2).toFixed(2)} USDC</span></div>
            </div>

            <div className="bet-buttons">
              <button className="btn-higher" onClick={() => handlePlaceBet(0)} disabled={loading}>HIGHER</button>
              <button className="btn-lower" onClick={() => handlePlaceBet(1)} disabled={loading}>LOWER</button>
            </div>

            <div className="pending-section">
              <div className="pending-title">Positions Pending ({pendingBets.length})</div>
              {pendingBets.length === 0 ? (
                <div style={{ fontSize: "12px", color: "var(--muted)", padding: "10px 0" }}>No open positions.</div>
              ) : (
                pendingBets.map((b) => {
                  const remaining = Math.max(0, b.openTime.toNumber() + DURATIONS[b.duration].seconds - Math.floor(Date.now() / 1000));
                  return (
                    <div key={b.id} className="pending-bet">
                      <div className="pending-bet-info">
                        <div className="asset">{ASSETS[b.asset]} · {b.direction === 0 ? "HIGHER" : "LOWER"}</div>
                        <div className="meta">${formatUSDC(b.amount)} USDC @ ${(b.openPrice.toNumber() / 1e8).toFixed(2)}</div>
                      </div>
                      <button
                        className="settle-btn"
                        onClick={() => handleSettle(b.id)}
                        disabled={remaining > 0 || loading}
                      >
                        {remaining > 0 ? `${remaining}s` : "SETTLE"}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </main>
      )}

      {tab === "dashboard" && (
        <div className="page">
          <h1 className="page-title">Personal Portal</h1>
          <p className="page-sub">Historical track-record and real-time equity growth status.</p>

          {!account ? (
            <div className="connect-prompt">
              <h2>Account disconnected</h2>
              <p>Connect your Web3 core to unlock deep statistical indexing metrics.</p>
              <button className="wallet-btn" onClick={connectWallet}>CONNECT WALLET</button>
            </div>
          ) : (
            <>
              <div className="stats-row">
                <div className="stat-card">
                  <div className="label">Total Positions</div>
                  <div className="value">{userStats.trades}</div>
                </div>
                <div className="stat-card">
                  <div className="label">Wins Registered</div>
                  <div className="value">{userStats.wins}</div>
                </div>
                <div className="stat-card">
                  <div className="label">Win Strategy Edge</div>
                  <div className="value">{(userStats.winRateBps / 100).toFixed(1)}%</div>
                </div>
                <div className="stat-card">
                  <div className="label">All-Time Net Profit</div>
                  <div className={`value ${Number(userStats.pnl) >= 0 ? "green" : "red"}`}>
                    ${formatPnL(userStats.pnl)}
                  </div>
                </div>
              </div>

              <h3>Position Log</h3>
              <div style={{ marginTop: "16px" }}>
                {history.length === 0 ? (
                  <div className="empty">No historical positions loaded yet. Execute trade terms to begin.</div>
                ) : (
                  history.map((b) => (
                    <div key={b.id} className="history-item">
                      <div className={`history-icon ${STATUS_MAP[b.status].toLowerCase()}`}>
                        {b.status === 1 ? "✓" : b.status === 2 ? "✕" : "⏳"}
                      </div>
                      <div className="history-info">
                        <div className="top">{ASSETS[b.asset]} · {b.direction === 0 ? "HIGHER" : "LOWER"}</div>
                        <div className="bot">
                          Open: ${(b.openPrice.toNumber() / 1e8).toFixed(2)} 
                          {b.status !== 0 && ` · Close: ${(b.closePrice.toNumber() / 1e8).toFixed(2)}`}
                        </div>
                      </div>
                      <div className="history-result">
                        <div className={`amount ${STATUS_MAP[b.status].toLowerCase()}`}>
                          {b.status === 1 ? `+$${formatUSDC(b.amount)}` : b.status === 2 ? `-$${formatUSDC(b.amount)}` : "PENDING"}
                        </div>
                        <div className="date">{new Date(b.openTime.toNumber() * 1000).toLocaleDateString()}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}

      {tab === "leaderboard" && (
        <div className="page">
          <h1 className="page-title">Global Standings</h1>
          <p className="page-sub">Top operational net accounts performing on Arc network parameters.</p>

          <div className="lb-tabs">
            <button className={`lb-tab ${lbTab === "alltime" ? "active" : ""}`} onClick={() => setLbTab("alltime")}>ALL TIME</button>
            <button className={`lb-tab ${lbTab === "weekly" ? "active" : ""}`} onClick={() => setLbTab("weekly")}>WEEKLY</button>
            <button className={`lb-tab ${lbTab === "daily" ? "active" : ""}`} onClick={() => setLbTab("daily")}>DAILY</button>
          </div>

          <div style={{ marginTop: "16px" }}>
            {leaderboard.players.length === 0 ? (
              <div className="empty">No active competitor records tracked for this epoch timeline.</div>
            ) : (
              leaderboard.players.map((player, idx) => {
                const currentPnL = Number(leaderboard.pnls[idx]);
                return (
                  <div key={player} className={`lb-row ${idx < 3 ? "top3" : ""}`}>
                    <div className={`lb-rank ${idx === 0 ? "gold" : idx === 1 ? "silver" : idx === 2 ? "bronze" : ""}`}>
                      #{idx + 1}
                    </div>
                    <div className="lb-addr">{shortAddr(player)}</div>
                    {leaderboard.trades[idx] !== undefined && (
                      <div className="lb-trades">{leaderboard.trades[idx]} Trades</div>
                    )}
                    <div className={`lb-pnl ${currentPnL >= 0 ? "pos" : "neg"}`}>
                      {currentPnL >= 0 ? "+" : ""}${(currentPnL / 1e6).toFixed(2)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
