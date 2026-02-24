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
  Droplets
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

const CONFIGURATIONS = [
  { id: 'single', name: 'ერთი ღერო', count: 1 },
  { id: 'triangle', name: 'სამკუთხა კონტური', count: 3 },
  { id: 'linear', name: 'ხაზოვანი (3 ღერო)', count: 3 },
  { id: 'grid_4', name: 'კვადრატული ბადე (4 ღერო)', count: 4 },
];

const MATERIALS = [
  { id: 'copper', name: 'სპილენძი', k: 1 },
  { id: 'galvanized', name: 'მოთუთიებული ფოლადი', k: 1.2 }, // Simplified material factor
];

export default function App() {
  // State
  const [soilType, setSoilType] = useState(SOIL_TYPES[1]);
  const [customRho, setCustomRho] = useState<number>(50);
  const [config, setConfig] = useState(CONFIGURATIONS[0]);
  const [length, setLength] = useState<number>(2.5); // L
  const [diameter, setDiameter] = useState<number>(0.016); // d (meters)
  const [depth, setDepth] = useState<number>(2.5); // h
  const [material, setMaterial] = useState(MATERIALS[1]);
  const [isDrySeason, setIsDrySeason] = useState(false);
  const [targetResistance, setTargetResistance] = useState<number>(10);

  // Derived Values
  const effectiveRho = useMemo(() => {
    const baseRho = soilType.id === 'custom' ? customRho : soilType.rho;
    return isDrySeason ? baseRho * 1.5 : baseRho;
  }, [soilType, customRho, isDrySeason]);

  const results = useMemo(() => {
    // Formula for single vertical rod: R = (rho / (2 * PI * L)) * ln(4L / d)
    // d is diameter, L is length
    const singleR = (effectiveRho / (2 * Math.PI * length)) * Math.log((4 * length) / diameter);
    
    // For multiple rods: R_total = R_single / (n * efficiency)
    const efficiency = 0.8; // Efficiency factor eta
    const totalR = singleR / (config.count * efficiency);
    
    const isAcceptable = totalR <= targetResistance;
    
    // Recommendation logic
    let recommendation = "";
    let neededRods = config.count;
    if (!isAcceptable) {
      // Calculate how many rods needed: targetR = singleR / (n * 0.8) => n = singleR / (targetR * 0.8)
      neededRods = Math.ceil(singleR / (targetResistance * efficiency));
      recommendation = `წინაღობის ${targetResistance} ომამდე დასაყვანად დაამატეთ კიდევ ${neededRods - config.count} ღერო ან გაზარდეთ მათი სიგრძე.`;
    } else {
      recommendation = "წინაღობა ნორმის ფარგლებშია.";
    }

    return {
      totalR: parseFloat(totalR.toFixed(2)),
      isAcceptable,
      recommendation,
      neededRods
    };
  }, [effectiveRho, length, diameter, config, targetResistance]);

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
        
        <div className="flex items-center gap-3 self-end sm:self-auto">
          <button 
            onClick={() => setIsDrySeason(!isDrySeason)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-full border transition-all text-sm font-medium",
              isDrySeason 
                ? "bg-orange-500/10 border-orange-500/30 text-orange-400" 
                : "bg-blue-500/10 border-blue-500/30 text-blue-400"
            )}
          >
            {isDrySeason ? <ThermometerSun size={16} /> : <Droplets size={16} />}
            <span>
              {isDrySeason ? "მშრალი (x1.5)" : "სველი სეზონი"}
            </span>
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
                <label>ნიადაგის ტიპი</label>
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
                    className="mt-2"
                  >
                    <label className="text-[10px] uppercase tracking-wider opacity-50">კუთრი წინაღობა (Ω·m)</label>
                    <input 
                      type="number" 
                      className="w-full h-11" 
                      value={customRho}
                      onChange={(e) => setCustomRho(Number(e.target.value))}
                    />
                  </motion.div>
                )}
              </div>

              {/* Configuration */}
              <div className="space-y-2">
                <label>კონფიგურაცია</label>
                <select 
                  className="w-full h-11"
                  value={config.id}
                  onChange={(e) => setConfig(CONFIGURATIONS.find(c => c.id === e.target.value) || CONFIGURATIONS[0])}
                >
                  {CONFIGURATIONS.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
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
              "glass-card rounded-2xl p-6 md:p-8 flex flex-col items-center justify-center text-center space-y-6 relative overflow-hidden transition-colors duration-500",
              results.isAcceptable ? "neon-border" : "border-red-500/40 shadow-[0_0_20px_rgba(239,68,68,0.1)]"
            )}
          >
            {/* Background Glow */}
            <div className={cn(
              "absolute -top-24 -right-24 w-64 h-64 blur-[100px] opacity-20 transition-colors duration-500",
              results.isAcceptable ? "bg-[#00ff88]" : "bg-red-500"
            )} />

            <div className="space-y-1 relative z-10">
              <span className="text-[10px] md:text-xs font-semibold text-white/40 uppercase tracking-[0.2em]">
                ჯამური წინაღობა
              </span>
              <div className="flex items-baseline justify-center gap-2">
                <motion.span 
                  key={results.totalR}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "text-6xl md:text-8xl font-bold tracking-tighter tabular-nums",
                    results.isAcceptable ? "text-[#00ff88]" : "text-red-500"
                  )}
                >
                  {results.totalR}
                </motion.span>
                <span className="text-2xl md:text-4xl font-light text-white/20">Ω</span>
              </div>
            </div>

            <div className={cn(
              "relative z-10 flex items-center gap-2 px-6 py-3 rounded-full font-bold text-sm transition-all duration-500",
              results.isAcceptable 
                ? "bg-[#00ff88]/10 text-[#00ff88] border border-[#00ff88]/20" 
                : "bg-red-500/10 text-red-500 border border-red-500/20"
            )}>
              {results.isAcceptable ? (
                <>
                  <CheckCircle2 size={18} />
                  <span>მისაღებია</span>
                </>
              ) : (
                <>
                  <AlertCircle size={18} />
                  <span>არ არის მისაღები</span>
                </>
              )}
            </div>

            <div className="w-full h-px bg-white/5 relative z-10" />

            <div className="w-full text-left space-y-5 relative z-10">
              <h3 className="text-xs font-bold text-white/30 uppercase tracking-widest flex items-center gap-2">
                <Layers size={14} />
                ანალიზი
              </h3>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                  <span className="text-[9px] text-white/30 block uppercase font-bold mb-1">ნიადაგის ρ</span>
                  <span className="text-base md:text-lg font-mono font-bold text-white/80">{effectiveRho} <span className="text-[10px] opacity-40">Ω·m</span></span>
                </div>
                <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                  <span className="text-[9px] text-white/30 block uppercase font-bold mb-1">რაოდენობა</span>
                  <span className="text-base md:text-lg font-mono font-bold text-white/80">{config.count} <span className="text-[10px] opacity-40">ღერო</span></span>
                </div>
              </div>

              <div className={cn(
                "p-4 rounded-2xl text-xs md:text-sm leading-relaxed border",
                results.isAcceptable 
                  ? "bg-[#00ff88]/5 border-[#00ff88]/10 text-white/70" 
                  : "bg-red-500/5 border-red-500/10 text-white/70"
              )}>
                <span className="font-bold text-white block mb-1.5">💡 რეკომენდაცია:</span>
                {results.recommendation}
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
                  {config.id === 'single' && (
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

                  {config.id === 'triangle' && (
                    <motion.g
                      key="triangle"
                      initial={{ opacity: 0, rotate: -10 }}
                      animate={{ opacity: 1, rotate: 0 }}
                      exit={{ opacity: 0, rotate: 10 }}
                    >
                      {/* Triangle Rods */}
                      <line x1="100" y1="50" x2="60" y2="110" stroke="#00ff88" strokeWidth="3" />
                      <line x1="60" y1="110" x2="140" y2="110" stroke="#00ff88" strokeWidth="3" />
                      <line x1="140" y1="110" x2="100" y2="50" stroke="#00ff88" strokeWidth="3" />
                      {/* Rod points */}
                      <circle cx="100" cy="50" r="4" fill="#00ff88" />
                      <circle cx="60" cy="110" r="4" fill="#00ff88" />
                      <circle cx="140" cy="110" r="4" fill="#00ff88" />
                    </motion.g>
                  )}

                  {config.id === 'linear' && (
                    <motion.g
                      key="linear"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                    >
                      {/* Linear Connection */}
                      <line x1="50" y1="80" x2="150" y2="80" stroke="#00ff88" strokeWidth="2" strokeDasharray="2 2" />
                      {/* Rods */}
                      <line x1="50" y1="60" x2="50" y2="100" stroke="#00ff88" strokeWidth="4" strokeLinecap="round" />
                      <line x1="100" y1="60" x2="100" y2="100" stroke="#00ff88" strokeWidth="4" strokeLinecap="round" />
                      <line x1="150" y1="60" x2="150" y2="100" stroke="#00ff88" strokeWidth="4" strokeLinecap="round" />
                    </motion.g>
                  )}

                  {config.id === 'grid_4' && (
                    <motion.g
                      key="grid"
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.5 }}
                    >
                      {/* Grid Square */}
                      <rect x="60" y="60" width="80" height="60" fill="none" stroke="#00ff88" strokeWidth="2" strokeDasharray="4 2" />
                      {/* Corner Rods */}
                      <circle cx="60" cy="60" r="5" fill="#00ff88" />
                      <circle cx="140" cy="60" r="5" fill="#00ff88" />
                      <circle cx="60" cy="120" r="5" fill="#00ff88" />
                      <circle cx="140" cy="120" r="5" fill="#00ff88" />
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
