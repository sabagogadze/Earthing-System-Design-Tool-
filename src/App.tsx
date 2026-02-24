/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { 
  Zap, 
  Settings2, 
  Info, 
  Download, 
  CheckCircle2, 
  AlertCircle, 
  Layers, 
  ThermometerSun,
  Droplets,
  Snowflake,
  FlaskConical
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import jsPDF from 'jspdf';
import { toPng } from 'html-to-image';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Constants & Types
const SOIL_TYPES = [
  { id: 'wet_clay', name: 'სველი თიხა', rho: 30 },
  { id: 'garden_soil', name: 'ბაღის მიწა', rho: 50 },
  { id: 'sandy_soil', name: 'ქვიშნარი', rho: 200 },
  { id: 'gravel', name: 'ხრეში', rho: 1000 },
  { id: 'rock', name: 'კლდე', rho: 2000 },
  { id: 'custom', name: 'სხვა (ხელით შეყვანა)', rho: 0 },
];

const MATERIALS = [
  { id: 'copper', name: 'სპილენძი', k: 1 },
  { id: 'galvanized', name: 'მოთუთიებული ფოლადი', k: 1.2 }, // Simplified material factor
];

export default function App() {
  // State
  const [soilType, setSoilType] = useState(SOIL_TYPES[1]);
  const [customRho, setCustomRho] = useState<number>(50);
  const [length, setLength] = useState<number>(2.5); // L
  const [diameter, setDiameter] = useState<number>(0.016); // d (meters)
  const [depth, setDepth] = useState<number>(2.5); // h
  const [material, setMaterial] = useState(MATERIALS[1]);
  const [seasonality, setSeasonality] = useState<number>(1.1); // Ks
  const [useGEM, setUseGEM] = useState<boolean>(false);
  const [targetResistance, setTargetResistance] = useState<number>(10);
  
  // Horizontal Strip State
  const [useStrip, setUseStrip] = useState<boolean>(true);
  const [stripWidth, setStripWidth] = useState<number>(40); // mm
  const [stripDepth, setStripDepth] = useState<number>(0.5); // m
  const [rodSpacing, setRodSpacing] = useState<number>(3); // m

  // Derived Values
  const effectiveRho = useMemo(() => {
    return soilType.id === 'custom' ? customRho : soilType.rho;
  }, [soilType, customRho]);

  const results = useMemo(() => {
    const effectiveDiameter = useGEM ? diameter * 3 : diameter;
    // Formula for single vertical rod: R = (rho / (2 * PI * L)) * ln(4L / d)
    const singleR = (effectiveRho / (2 * Math.PI * length)) * Math.log((4 * length) / effectiveDiameter);
    
    let neededRods = 1;
    let actualR = singleR * seasonality;
    let configId = 'single';
    let configName = 'ერთი ღერო';

    const calculateTotalR = (n: number) => {
      const efficiency = n === 1 ? 1 : (rodSpacing >= length ? 0.9 : 0.75);
      const rv = singleR / (n * efficiency);
      
      if (!useStrip || n === 1) return rv * seasonality;

      // Calculate horizontal strip resistance
      let Lh = (n - 1) * rodSpacing;
      if (n === 3) Lh = 3 * rodSpacing; // Triangle
      if (n === 4) Lh = 4 * rodSpacing; // Square
      
      const w = stripWidth / 1000; // convert to meters
      const h = stripDepth;
      
      let rh = Infinity;
      if (Lh > 0) {
        const insideLog = (2 * Lh * Lh) / (w * h);
        rh = (effectiveRho / (2 * Math.PI * Lh)) * Math.log(Math.max(insideLog, 2));
      }
      
      // Combined resistance (parallel with C=1.1 mutual interference penalty)
      const combinedR = ((rv * rh) / (rv + rh)) * 1.1;
      return combinedR * seasonality;
    };

    if (calculateTotalR(1) > targetResistance) {
      while (calculateTotalR(neededRods) > targetResistance && neededRods < 100) {
        neededRods++;
      }
      actualR = calculateTotalR(neededRods);
    } else {
      actualR = calculateTotalR(1);
    }

    if (neededRods === 1) {
      configId = 'single';
      configName = 'ერთი ღერო';
    } else if (neededRods === 2) {
      configId = 'linear_2';
      configName = useStrip ? 'ხაზოვანი (2 ღერო + სალტე)' : 'ხაზოვანი (2 ღერო)';
    } else if (neededRods === 3) {
      configId = 'triangle';
      configName = useStrip ? 'სამკუთხა კონტური (3 ღერო + სალტე)' : 'სამკუთხა კონტური (3 ღერო)';
    } else if (neededRods === 4) {
      configId = 'grid_4';
      configName = useStrip ? 'კვადრატული ბადე (4 ღერო + სალტე)' : 'კვადრატული ბადე (4 ღერო)';
    } else {
      configId = 'grid_n';
      configName = useStrip ? `მრავალღეროვანი (${neededRods} ღერო + სალტე)` : `მრავალღეროვანი (${neededRods} ღერო)`;
    }

    let warning = "";
    if (effectiveRho > 500) {
      warning = "მაღალი კუთრი წინაღობის გამო, რეკომენდებულია ჰორიზონტალური კონტურის გაზრდა ან ქიმიური დამუშავება (GEM).";
    }

    return {
      neededRods,
      actualR: parseFloat(actualR.toFixed(2)),
      singleR: parseFloat((singleR * seasonality).toFixed(2)),
      configId,
      configName,
      warning
    };
  }, [effectiveRho, length, diameter, targetResistance, useStrip, stripWidth, stripDepth, rodSpacing, seasonality, useGEM]);

  const exportPDF = async () => {
    const element = document.getElementById('report-content');
    if (!element) return;
    
    try {
      const dataUrl = await toPng(element, {
        backgroundColor: '#0a0a0a',
        quality: 1,
        pixelRatio: 2,
      });
      
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgProps = pdf.getImageProperties(dataUrl);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save('earthing-report.pdf');
    } catch (error) {
      console.error('PDF export failed:', error);
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8 max-w-7xl mx-auto overflow-x-hidden">
      {/* Header */}
      <header className="mb-8 md:mb-12 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#00ff88]/10 rounded-lg">
              <Zap className="text-[#00ff88] w-6 h-6 md:w-8 md:h-8" />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight neon-text">
              დამიწების კალკულატორი
            </h1>
          </div>
          <p className="text-white/40 text-xs md:text-sm pl-11 sm:pl-0">
            Earthing System Design Tool • IEEE 80 & BS 7430
          </p>
        </div>
        
        <div className="flex items-center gap-1 bg-white/5 p-1 rounded-full border border-white/10 self-end sm:self-auto">
          <button 
            onClick={() => setSeasonality(1.1)}
            className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all", seasonality === 1.1 ? "bg-blue-500/20 text-blue-400" : "text-white/40 hover:text-white/70")}
          >
            <Droplets size={14} /> <span className="hidden sm:inline">ტენიანი</span>
          </button>
          <button 
            onClick={() => setSeasonality(1.4)}
            className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all", seasonality === 1.4 ? "bg-orange-500/20 text-orange-400" : "text-white/40 hover:text-white/70")}
          >
            <ThermometerSun size={14} /> <span className="hidden sm:inline">მშრალი</span>
          </button>
          <button 
            onClick={() => setSeasonality(1.8)}
            className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all", seasonality === 1.8 ? "bg-cyan-500/20 text-cyan-400" : "text-white/40 hover:text-white/70")}
          >
            <Snowflake size={14} /> <span className="hidden sm:inline">გაყინული</span>
          </button>
        </div>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8 pb-12" id="report-content">
        {/* Left Side: Inputs */}
        <div className="lg:col-span-7 space-y-6 order-2 lg:order-1">
          <section className="glass-card rounded-2xl p-5 md:p-6 space-y-6 neon-border">
            <div className="flex items-center gap-2 border-b border-white/10 pb-4">
              <Settings2 className="text-[#00ff88]" size={20} />
              <h2 className="text-lg font-semibold">პარამეტრები</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 md:gap-6">
              {/* Soil Type */}
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="!mb-0">ნიადაგის ტიპი</label>
                  {soilType.id !== 'custom' && (
                    <span className="text-[10px] font-mono text-[#00ff88] bg-[#00ff88]/10 px-2 py-0.5 rounded-full border border-[#00ff88]/20">
                      ρ = {soilType.rho} Ω·m
                    </span>
                  )}
                </div>
                <select 
                  className="w-full h-11"
                  value={soilType.id}
                  onChange={(e) => setSoilType(SOIL_TYPES.find(t => t.id === e.target.value) || SOIL_TYPES[0])}
                >
                  {SOIL_TYPES.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                {soilType.id === 'custom' && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mt-2 space-y-2"
                  >
                    <label className="text-[10px] uppercase tracking-wider opacity-50">კუთრი წინაღობა (Ω·m)</label>
                    <input 
                      type="number" 
                      className="w-full h-11" 
                      value={customRho}
                      onChange={(e) => setCustomRho(Number(e.target.value))}
                    />
                    <p className="text-[10px] text-orange-400/80 leading-relaxed">
                      * თუ გაქვთ დიაპაზონი (მაგ: 200-8000), უსაფრთხოებისთვის გამოიყენეთ <b>მაქსიმალური</b> მნიშვნელობა, ან ჩაატარეთ ზუსტი გეოლოგიური გაზომვა.
                    </p>
                  </motion.div>
                )}
              </div>

              {/* Target Resistance */}
              <div className="space-y-2 sm:col-span-2">
                <label>სასურველი წინაღობა (Ω)</label>
                <div className="flex flex-wrap gap-2">
                  {[4, 10, 25].map(val => (
                    <button
                      key={val}
                      onClick={() => setTargetResistance(val)}
                      className={cn(
                        "flex-1 min-w-[60px] h-11 rounded-lg text-sm font-bold transition-all",
                        targetResistance === val 
                          ? "bg-[#00ff88] text-black shadow-[0_0_15px_rgba(0,255,136,0.3)]" 
                          : "bg-white/5 text-white/60 hover:bg-white/10"
                      )}
                    >
                      {val} Ω
                    </button>
                  ))}
                  <input 
                    type="number"
                    className="w-full sm:w-24 h-11 text-center font-mono"
                    value={targetResistance}
                    onChange={(e) => setTargetResistance(Number(e.target.value))}
                  />
                </div>
              </div>

              {/* Electrode Length */}
              <div className="space-y-2">
                <label>სიგრძე (L, მ)</label>
                <input 
                  type="number" 
                  step="0.1"
                  className="w-full h-11" 
                  value={length}
                  onChange={(e) => setLength(Number(e.target.value))}
                />
              </div>

              {/* Electrode Diameter */}
              <div className="space-y-2">
                <label>დიამეტრი (d, მმ)</label>
                <input 
                  type="number" 
                  step="1"
                  className="w-full h-11" 
                  value={diameter * 1000}
                  onChange={(e) => setDiameter(Number(e.target.value) / 1000)}
                />
              </div>

              {/* Burial Depth */}
              <div className="space-y-2">
                <label>ჩაფლვის სიღრმე (h, მ)</label>
                <input 
                  type="number" 
                  step="0.1"
                  className="w-full h-11" 
                  value={depth}
                  onChange={(e) => setDepth(Number(e.target.value))}
                />
              </div>

              {/* Material */}
              <div className="space-y-2">
                <label>მასალა</label>
                <select 
                  className="w-full h-11"
                  value={material.id}
                  onChange={(e) => setMaterial(MATERIALS.find(m => m.id === e.target.value) || MATERIALS[0])}
                >
                  {MATERIALS.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>

              {/* GEM Toggle */}
              <div className="space-y-2 sm:col-span-2 flex items-center justify-between bg-[#00ff88]/5 border border-[#00ff88]/20 p-3 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[#00ff88]/20 rounded-lg">
                    <FlaskConical className="text-[#00ff88]" size={18} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">GEM (ქიმიური დამუშავება)</h4>
                    <p className="text-[10px] text-white/50">ზრდის კონტაქტის ფართობს და ამცირებს წინაღობას</p>
                  </div>
                </div>
                <label className="relative flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer"
                    checked={useGEM}
                    onChange={(e) => setUseGEM(e.target.checked)}
                  />
                  <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#00ff88]"></div>
                </label>
              </div>

              {/* Target Resistance */}
              <div className="space-y-2 sm:col-span-2">
                <label>სასურველი წინაღობა (Ω)</label>
                <div className="flex flex-wrap gap-2">
                  {[4, 10, 25].map(val => (
                    <button
                      key={val}
                      onClick={() => setTargetResistance(val)}
                      className={cn(
                        "flex-1 min-w-[60px] h-11 rounded-lg text-sm font-bold transition-all",
                        targetResistance === val 
                          ? "bg-[#00ff88] text-black shadow-[0_0_15px_rgba(0,255,136,0.3)]" 
                          : "bg-white/5 text-white/60 hover:bg-white/10"
                      )}
                    >
                      {val} Ω
                    </button>
                  ))}
                  <input 
                    type="number"
                    className="w-full sm:w-24 h-11 text-center font-mono"
                    value={targetResistance}
                    onChange={(e) => setTargetResistance(Number(e.target.value))}
                  />
                </div>
              </div>

              {/* Horizontal Strip Toggle */}
              <div className="space-y-3 sm:col-span-2 pt-4 border-t border-white/10">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className="relative flex items-center justify-center">
                    <input 
                      type="checkbox" 
                      className="peer sr-only"
                      checked={useStrip}
                      onChange={(e) => setUseStrip(e.target.checked)}
                    />
                    <div className="w-10 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#00ff88]"></div>
                  </div>
                  <span className="text-sm font-semibold text-white/90 group-hover:text-white transition-colors">
                    ჰორიზონტალური სალტე (შემაერთებელი კონტური)
                  </span>
                </label>
                
                <AnimatePresence>
                  {useStrip && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 overflow-hidden"
                    >
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-wider opacity-60">სალტის სიგანე (მმ)</label>
                        <input 
                          type="number" 
                          className="w-full h-10 text-sm bg-black/20" 
                          value={stripWidth}
                          onChange={(e) => setStripWidth(Number(e.target.value))}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-wider opacity-60">ჩაფლვის სიღრმე (მ)</label>
                        <input 
                          type="number" 
                          step="0.1"
                          className="w-full h-10 text-sm bg-black/20" 
                          value={stripDepth}
                          onChange={(e) => setStripDepth(Number(e.target.value))}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-wider opacity-60">ღეროებს შორის მანძილი (მ)</label>
                        <input 
                          type="number" 
                          step="0.5"
                          className="w-full h-10 text-sm bg-black/20" 
                          value={rodSpacing}
                          onChange={(e) => setRodSpacing(Number(e.target.value))}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </section>

          <section className="glass-card rounded-2xl p-4 border-l-4 border-[#00ff88]/30">
            <div className="flex gap-3 text-white/50">
              <div className="mt-0.5"><Info size={14} /></div>
              <p className="text-[11px] leading-relaxed">
                გამოთვლები ეფუძნება IEEE 80 და BS 7430 სტანდარტებს. 
                R = (ρ / 2πL) * ln(4L/d). 
                ჯგუფური ეფექტურობა: η = 0.8.
              </p>
            </div>
          </section>
        </div>

        {/* Right Side: Results */}
        <div className="lg:col-span-5 space-y-6 order-1 lg:order-2">
          <motion.div 
            layout
            className={cn(
              "glass-card rounded-2xl p-6 md:p-8 flex flex-col items-center justify-center text-center space-y-6 relative overflow-hidden transition-colors duration-500 neon-border"
            )}
          >
            {/* Background Glow */}
            <div className={cn(
              "absolute -top-24 -right-24 w-64 h-64 blur-[100px] opacity-20 transition-colors duration-500 bg-[#00ff88]"
            )} />

            <div className="space-y-1 relative z-10">
              <span className="text-[10px] md:text-xs font-semibold text-white/40 uppercase tracking-[0.2em]">
                საჭირო ღეროების რაოდენობა
              </span>
              <div className="flex items-baseline justify-center gap-2">
                <motion.span 
                  key={results.neededRods}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "text-6xl md:text-8xl font-bold tracking-tighter tabular-nums text-[#00ff88]"
                  )}
                >
                  {results.neededRods}
                </motion.span>
                <span className="text-2xl md:text-4xl font-light text-white/20">ცალი</span>
              </div>
            </div>

            <div className="w-full h-px bg-white/5 relative z-10" />

            <div className="w-full text-left space-y-5 relative z-10">
              <h3 className="text-xs font-bold text-white/30 uppercase tracking-widest flex items-center gap-2">
                <Layers size={14} />
                ანალიზი
              </h3>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                  <span className="text-[9px] text-white/30 block uppercase font-bold mb-1">მიღწეული წინაღობა</span>
                  <span className="text-base md:text-lg font-mono font-bold text-[#00ff88]">{results.actualR} <span className="text-[10px] opacity-40">Ω</span></span>
                </div>
                <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                  <span className="text-[9px] text-white/30 block uppercase font-bold mb-1">1 ღეროს წინაღობა</span>
                  <span className="text-base md:text-lg font-mono font-bold text-white/80">{results.singleR} <span className="text-[10px] opacity-40">Ω</span></span>
                </div>
              </div>

              <div className={cn(
                "p-4 rounded-2xl text-xs md:text-sm leading-relaxed border bg-[#00ff88]/5 border-[#00ff88]/10 text-white/70 space-y-2"
              )}>
                <div>
                  <span className="font-bold text-white block mb-1">💡 რეკომენდებული კონფიგურაცია:</span>
                  {results.configName}
                </div>
                {results.warning && (
                  <div className="pt-2 mt-2 border-t border-[#00ff88]/20 text-orange-400">
                    <span className="font-bold block mb-1">⚠️ ყურადღება:</span>
                    {results.warning}
                  </div>
                )}
              </div>
            </div>
          </motion.div>

          {/* Visualization */}
          <div className="glass-card rounded-2xl p-6 h-64 flex flex-col items-center justify-center border border-white/10 relative overflow-hidden">
            <div className="absolute top-4 left-4 flex items-center gap-2 text-[10px] text-white/30 uppercase tracking-widest">
              <Zap size={12} />
              სქემატური ნახაზი
            </div>
            
            <div className="w-full h-full flex items-center justify-center">
              <svg width="200" height="160" viewBox="0 0 200 160" className="drop-shadow-[0_0_15px_rgba(0,255,136,0.2)]">
                {/* Ground Surface Line */}
                <line x1="20" y1="40" x2="180" y2="40" stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="4 2" />
                
                <AnimatePresence mode="wait">
                  {results.configId === 'single' && (
                    <motion.g
                      key="single"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                    >
                      {/* Vertical Rod */}
                      <line x1="100" y1="40" x2="100" y2="120" stroke="#00ff88" strokeWidth="4" strokeLinecap="round" />
                      {/* Depth Indicator */}
                      <text x="110" y="85" fill="rgba(255,255,255,0.4)" fontSize="10" fontFamily="monospace">L={length}m</text>
                    </motion.g>
                  )}

                  {results.configId === 'linear_2' && (
                    <motion.g
                      key="linear_2"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                    >
                      <line x1="75" y1="80" x2="125" y2="80" stroke="#00ff88" strokeWidth={useStrip ? 3 : 1} strokeDasharray={useStrip ? "none" : "4 4"} opacity={useStrip ? 1 : 0.3} />
                      <line x1="75" y1="60" x2="75" y2="100" stroke="#00ff88" strokeWidth="4" strokeLinecap="round" />
                      <line x1="125" y1="60" x2="125" y2="100" stroke="#00ff88" strokeWidth="4" strokeLinecap="round" />
                    </motion.g>
                  )}

                  {results.configId === 'triangle' && (
                    <motion.g
                      key="triangle"
                      initial={{ opacity: 0, rotate: -10 }}
                      animate={{ opacity: 1, rotate: 0 }}
                      exit={{ opacity: 0, rotate: 10 }}
                    >
                      {/* Triangle Rods */}
                      <line x1="100" y1="50" x2="60" y2="110" stroke="#00ff88" strokeWidth={useStrip ? 3 : 1} strokeDasharray={useStrip ? "none" : "4 4"} opacity={useStrip ? 1 : 0.3} />
                      <line x1="60" y1="110" x2="140" y2="110" stroke="#00ff88" strokeWidth={useStrip ? 3 : 1} strokeDasharray={useStrip ? "none" : "4 4"} opacity={useStrip ? 1 : 0.3} />
                      <line x1="140" y1="110" x2="100" y2="50" stroke="#00ff88" strokeWidth={useStrip ? 3 : 1} strokeDasharray={useStrip ? "none" : "4 4"} opacity={useStrip ? 1 : 0.3} />
                      {/* Rod points */}
                      <circle cx="100" cy="50" r="4" fill="#00ff88" />
                      <circle cx="60" cy="110" r="4" fill="#00ff88" />
                      <circle cx="140" cy="110" r="4" fill="#00ff88" />
                    </motion.g>
                  )}

                  {results.configId === 'grid_4' && (
                    <motion.g
                      key="grid_4"
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.5 }}
                    >
                      {/* Grid Square */}
                      <rect x="60" y="60" width="80" height="60" fill="none" stroke="#00ff88" strokeWidth={useStrip ? 3 : 1} strokeDasharray={useStrip ? "none" : "4 4"} opacity={useStrip ? 1 : 0.3} />
                      {/* Corner Rods */}
                      <circle cx="60" cy="60" r="5" fill="#00ff88" />
                      <circle cx="140" cy="60" r="5" fill="#00ff88" />
                      <circle cx="60" cy="120" r="5" fill="#00ff88" />
                      <circle cx="140" cy="120" r="5" fill="#00ff88" />
                    </motion.g>
                  )}

                  {results.configId === 'grid_n' && (
                    <motion.g
                      key="grid_n"
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.5 }}
                    >
                      <rect x="50" y="50" width="100" height="60" fill="none" stroke="#00ff88" strokeWidth={useStrip ? 2 : 1} strokeDasharray={useStrip ? "none" : "4 4"} opacity={useStrip ? 1 : 0.3} />
                      <line x1="100" y1="50" x2="100" y2="110" stroke="#00ff88" strokeWidth={useStrip ? 2 : 1} strokeDasharray={useStrip ? "none" : "4 4"} opacity={useStrip ? 1 : 0.3} />
                      <line x1="50" y1="80" x2="150" y2="80" stroke="#00ff88" strokeWidth={useStrip ? 2 : 1} strokeDasharray={useStrip ? "none" : "4 4"} opacity={useStrip ? 1 : 0.3} />
                      
                      <circle cx="50" cy="50" r="4" fill="#00ff88" />
                      <circle cx="100" cy="50" r="4" fill="#00ff88" />
                      <circle cx="150" cy="50" r="4" fill="#00ff88" />
                      <circle cx="50" cy="80" r="4" fill="#00ff88" />
                      <circle cx="100" cy="80" r="4" fill="#00ff88" />
                      <circle cx="150" cy="80" r="4" fill="#00ff88" />
                      <circle cx="50" cy="110" r="4" fill="#00ff88" />
                      <circle cx="100" cy="110" r="4" fill="#00ff88" />
                      <circle cx="150" cy="110" r="4" fill="#00ff88" />
                    </motion.g>
                  )}
                </AnimatePresence>
                
                {/* Ground Symbol */}
                <g transform="translate(100, 140)">
                  <line x1="-15" y1="0" x2="15" y2="0" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
                  <line x1="-10" y1="5" x2="10" y2="5" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
                  <line x1="-5" y1="10" x2="5" y2="10" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
                </g>
              </svg>
            </div>
          </div>
        </div>
      </main>

      <footer className="mt-8 pb-8 text-center text-white/10 text-[9px] uppercase tracking-[0.3em]">
        Earthing Design Pro • 2026 • IEC & IEEE Standards
      </footer>
    </div>
  );
}
