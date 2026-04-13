import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { GoogleGenAI } from "@google/genai";
import { 
  ClipboardCheck, 
  User, 
  Stethoscope, 
  Activity, 
  Heart, 
  AlertTriangle, 
  ShieldAlert, 
  Move, 
  Accessibility, 
  Brain,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Info,
  Clock,
  MapPin,
  Building2,
  Scale,
  Sparkles,
  Loader2,
  ArrowLeft,
  RotateCcw
} from 'lucide-react';
import { FullAssessment, YesNo, AKPSScore } from './types';
import { AKPS_LABELS, ROCKWOOD_LABELS, BRUA_LABELS, AFM_LEVELS, AN_ACC_CLASSES, RESPITE_CLASSES, BRADEN_LABELS } from './constants';
import { calculateFundingLogic, FundingResult } from './services/fundingAlgorithm';

const STEPS = [
  { id: 'details', title: 'Assessment Details', icon: User },
  { id: 'nursing', title: 'Nursing Requirements', icon: Stethoscope },
  { id: 'rugAdl', title: 'Functional Status (RUG-ADL)', icon: Activity },
  { id: 'akps', title: 'Performance Status (AKPS)', icon: Scale },
  { id: 'palliative', title: 'Palliative Care', icon: Heart },
  { id: 'frailty', title: 'Frailty & Falls', icon: AlertTriangle },
  { id: 'braden', title: 'Pressure Sore Risk', icon: ShieldAlert },
  { id: 'demmi', title: 'Mobility (DEMMI)', icon: Move },
  { id: 'afm', title: 'Functional Measure (AFM)', icon: Accessibility },
  { id: 'brua', title: 'Behaviour (BRUA)', icon: Brain },
  { id: 'summary', title: 'Summary', icon: ClipboardCheck },
];

const getLocalDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const INITIAL_STATE: FullAssessment = {
  details: {
    assessorId: '',
    facilityId: '',
    residentId: '',
    placeOfAssessment: 'RACF',
    dateOfAssessment: getLocalDate(),
  },
  nursing: {
    bariatric: 'No',
    oxygen: 'No',
    enteralFeeding: 'No',
    tracheostomy: 'No',
    catheter: 'No',
    stoma: 'No',
    peritonealDialysis: 'No',
    dailyInjections: 'No',
    complexWoundManagement: 'No',
  },
  rugAdl: {
    bedMobility: 1,
    toileting: 1,
    transfer: 1,
    eating: 1,
  },
  akps: 100,
  palliative: {
    enteredForPalliative: 'No',
    prognosisLessThan3Months: 'No',
    existingCarePlan: 'No',
    akpsScore40OrLess: 'No',
    palliativePhase: null,
    hasMalignancy: 'No',
  },
  frailty: {
    fallenInLast12Months: 'No',
    fallenInLast4Weeks: 'No',
    numberOfFallsInLast4Weeks: '0',
    lostWeightMoreThan10Percent: 'No',
    rockwoodScore: 1,
  },
  braden: {
    sensoryPerception: 4,
    moisture: 4,
    activity: 4,
    mobility: 4,
    nutrition: 4,
    frictionShear: 3,
  },
  demmi: {
    bed: { bridge: 'unable', rollOntoSide: 'unable', lyingToSitting: 'unable' },
    chair: { sitUnsupported: 'unable', sitToStand: 'unable', sitToStandNoArms: 'unable' },
    balance: { standUnsupported: 'unable', standFeetTogether: 'unable', standOnToes: 'unable', tandemStandEyesClosed: 'unable' },
    walking: { distance: 'unable', independence: 'unable' },
  },
  afm: {
    selfCare: { eating: 7, grooming: 7, bathing: 7, dressingUpper: 7, dressingLower: 7, toileting: 7 },
    sphincterControl: { bladder: 7, bowel: 7 },
    transfers: { bedChairWheelchair: 7, toilet: 7, tubShower: 7 },
    locomotion: { walkWheelchair: 7 },
    communication: { comprehension: 7, expression: 7 },
    socialCognition: { socialInteraction: 7, problemSolving: 7, memory: 7 },
  },
  brua: {
    wandering: 4,
    verballyDisruptive: 4,
    physicallyAggressive: 4,
    emotionalDependence: 4,
    dangerToSelfOrOthers: 4,
  },
};

export default function App() {
  const [currentStep, setCurrentStep] = useState(() => {
    const saved = localStorage.getItem('anacc_current_step');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [assessment, setAssessment] = useState<FullAssessment>(() => {
    const saved = localStorage.getItem('anacc_assessment_data');
    return saved ? JSON.parse(saved) : INITIAL_STATE;
  });
  const [showFlowChart, setShowFlowChart] = useState(true);
  const [clinicalSummary, setClinicalSummary] = useState<string>(() => {
    return localStorage.getItem('anacc_clinical_summary') || '';
  });
  const [fundingAssessment, setFundingAssessment] = useState<string>(() => {
    return localStorage.getItem('anacc_funding_assessment') || '';
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [algoResult, setAlgoResult] = useState<FundingResult | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  // Persistence & URL State Handling
  useEffect(() => {
    // Try to load state from URL hash first (for new tabs)
    const hash = window.location.hash;
    if (hash.startsWith('#state=')) {
      try {
        const stateStr = decodeURIComponent(hash.substring(7));
        const state = JSON.parse(stateStr);
        if (state.assessment) setAssessment(state.assessment);
        if (state.currentStep !== undefined) setCurrentStep(state.currentStep);
        if (state.clinicalSummary) setClinicalSummary(state.clinicalSummary);
        if (state.fundingAssessment) setFundingAssessment(state.fundingAssessment);
        // Clear hash to clean up URL
        window.history.replaceState(null, '', window.location.pathname);
      } catch (e) {
        console.error("Failed to load state from URL hash:", e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('anacc_current_step', currentStep.toString());
    localStorage.setItem('anacc_assessment_data', JSON.stringify(assessment));
    localStorage.setItem('anacc_clinical_summary', clinicalSummary);
    localStorage.setItem('anacc_funding_assessment', fundingAssessment);
  }, [currentStep, assessment, clinicalSummary, fundingAssessment]);

  useEffect(() => {
    if (currentStep === STEPS.length - 1) {
      setAlgoResult(calculateFundingLogic(assessment));
    }
  }, [currentStep, assessment]);

  const handleDownload = () => {
    const reportElement = document.getElementById('assessment-report-content');
    if (!reportElement) return;

    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map(s => s.outerHTML)
      .join('');

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>AN-ACC Report - ${assessment.details.residentId || 'Resident'}</title>
          ${styles}
          <style>
            body { padding: 40px; font-family: sans-serif; max-width: 800px; margin: 0 auto; }
            .no-print, .print-hidden { display: none !important; }
          </style>
        </head>
        <body>
          ${reportElement.innerHTML}
        </body>
      </html>
    `;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AN-ACC-Report-${assessment.details.residentId || 'Resident'}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetAssessment = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      setTimeout(() => setConfirmReset(false), 3000);
      return;
    }

    localStorage.clear();
    const newState = {
      ...INITIAL_STATE,
      details: {
        ...INITIAL_STATE.details,
        dateOfAssessment: getLocalDate()
      }
    };
    setAssessment(newState);
    setCurrentStep(0);
    setClinicalSummary('');
    setFundingAssessment('');
    setAlgoResult(null);
    setConfirmReset(false);
    window.scrollTo(0, 0);
  };

  const goToFirstStep = () => {
    setCurrentStep(0);
    window.scrollTo(0, 0);
  };

  const handlePrint = () => {
    const reportElement = document.getElementById('assessment-report-content');
    if (!reportElement) {
      alert('Report content not found. Please generate the assessment first.');
      return;
    }

    const printWindow = window.open('', '_blank', 'width=1000,height=800');
    if (!printWindow) {
      alert('Please allow popups to print the report.');
      return;
    }

    // Capture all styles
    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map(s => s.outerHTML)
      .join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>AN-ACC Assessment Report - ${assessment.details.residentId || 'Resident'}</title>
          ${styles}
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
            body { 
              padding: 40px; 
              background: white !important; 
              font-family: 'Inter', sans-serif;
              color: #18181b;
            }
            .print-hidden { display: none !important; }
            .no-print { display: none !important; }
            /* Ensure prose looks good in print */
            .prose { max-width: none !important; }
            .prose pre { white-space: pre-wrap !important; }
            /* Force background colors in print */
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            .bg-zinc-900 { background-color: #18181b !important; color: white !important; }
            .bg-emerald-50 { background-color: #ecfdf5 !important; }
            .bg-indigo-50 { background-color: #eef2ff !important; }
            .bg-amber-50 { background-color: #fffbeb !important; }
          </style>
        </head>
        <body>
          <div class="max-w-4xl mx-auto">
            ${reportElement.innerHTML}
          </div>
          <script>
            window.onload = () => {
              setTimeout(() => {
                window.print();
                // We don't close automatically to allow the user to see the result
              }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const nextStep = () => setCurrentStep((prev) => Math.min(prev + 1, STEPS.length - 1));
  const prevStep = () => setCurrentStep((prev) => Math.max(prev - 1, 0));

  const generateClinicalSummary = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    setClinicalSummary('');
    setFundingAssessment('');
    
    const today = new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'long', year: 'numeric' });
    const assessmentDate = new Date(assessment.details.dateOfAssessment).toLocaleDateString('en-AU', { day: '2-digit', month: 'long', year: 'numeric' });

    // Prompt for Clinical Summary (Updated to ISBAR format per IAT Guide p.359)
    const clinicalPrompt = `You are a senior clinical assessor for the Australian National Aged Care Classification (AN-ACC). 
    
    REPORT METADATA:
    - Date of Report (Today): ${today}
    - Date of Assessment: ${assessmentDate}
    - Resident ID: ${assessment.details.residentId || 'Not Specified'}
    - Facility ID: ${assessment.details.facilityId || 'Not Specified'}
    - Assessor ID: ${assessment.details.assessorId || 'Not Specified'}

    Based on the following assessment data, provide a professional "Written Assessment" summary using the official ISBAR format.
    
    The resident has been assessed as AN-ACC Class ${algoResult?.classId || 'Unknown'}.
    
    IMPORTANT: 
    - Use plain text for mathematical symbols (e.g., use "<=" instead of LaTeX).
    - Use "DD MMMM YYYY" for all dates.
    - Be precise about RUG-ADL: The Mobility Score (Bed+Transfer+Toileting) is ${assessment.rugAdl.bedMobility + assessment.rugAdl.transfer + assessment.rugAdl.toileting}.
    
    - INTRODUCTION: Resident identification and assessment context.
    - SITUATION: Current clinical status and primary reasons for care.
    - BACKGROUND: Relevant medical history and previous functional levels.
    - ASSESSMENT: Analysis of nursing needs, functional status (RUG-ADL/AFM), mobility (DEMMI), frailty, and behavior.
    - RECOMMENDATION: Suggested care interventions and support requirements.

    Assessment Data:
    ${JSON.stringify(assessment, null, 2)}
    
    Format the output in clear Markdown.`;

    // Prompt for Funding Assessment (Updated with precise cut-offs and deterministic result)
    const fundingPrompt = `You are an AN-ACC Funding Specialist. 
    
    REPORT METADATA:
    - Date of Report (Today): ${today}
    - Date of Assessment: ${assessmentDate}
    - Resident ID: ${assessment.details.residentId || 'Not Specified'}
    - Facility ID: ${assessment.details.facilityId || 'Not Specified'}
    - Assessor ID: ${assessment.details.assessorId || 'Not Specified'}

    Based on the AN-ACC Funding Guide (Nov 2025), explain the clinical reasons for the following AN-ACC Classification.
    
    VERIFIED ALGORITHM RESULT:
    - Assessed Class: Class ${algoResult?.classId || 'Unknown'}
    - Logic Path: ${algoResult?.path.map(p => `${p.title}: ${p.value}`).join(' -> ') || 'Unknown'}
    - Compounding Factors: ${algoResult?.compoundingFactors.length ? algoResult.compoundingFactors.join(', ') : 'None'}
    
    IMPORTANT: 
    - DO NOT use LaTeX symbols like $\\leq$ or $\\rightarrow$. Use plain text or standard symbols like "<=" and "->".
    - Use "DD MMMM YYYY" for all dates.
    
    CRITERIA TO CONSIDER (For your explanation):
    1. PALLIATIVE: Class 1 if entered for planned palliative care AND AKPS <= 40.
    2. MOBILITY (RUG-ADL Mobility Score = Bed + Transfer + Toileting):
       - Independent: Score = 3
       - Assisted: Score = 4 to 12
       - Not Mobile: Score = 13 to 15
    3. COGNITION (AFM Cognitive Sum: 5 items):
       - High: 23-35 | Medium: 13-22 | Low: 5-12
    4. FUNCTION (AFM Motor Sum: 6 self-care items):
       - Higher: 13-42 | Lower: 6-12
    5. PRESSURE RISK: Higher Risk if Braden Scale <= 12.
    6. COMPOUNDING FACTORS: Technical nursing, high behavior triggers (BRUA 1 or 2), or high pressure risk (except in the Not Mobile branch where it's a primary branch).
    
    ASSESSMENT DATA:
    ${JSON.stringify(assessment, null, 2)}
    
    OUTPUT REQUIREMENTS:
    1. Confirm the Assessed AN-ACC Class (must match the Verified Algorithm Result above).
    2. Daily Subsidy Rate (refer to Class ${algoResult?.classId} specifically).
    3. Detailed Clinical Reasons for this classification based on the branching logic and the specific score sums from the data.
    4. Explain why specific compounding factors were or were not identified.
    
    Format in Markdown.`;

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('Clinical Analysis Engine Key is missing. If you are in a new tab, please generate the report in the AI Studio preview first, then refresh the new tab to see the results.');
      }
      const ai = new GoogleGenAI({ apiKey });
      
      // 1. Generate Clinical Summary (ISBAR)
      const clinicalRes = await ai.models.generateContent({ 
        model: "gemini-3-flash-preview", 
        contents: clinicalPrompt 
      });
      
      const clinicalText = clinicalRes.text;
      if (clinicalText) {
        setClinicalSummary(clinicalText);
      } else {
        throw new Error('Clinical summary returned empty');
      }

      // 2. Generate Funding Assessment
      const fundingRes = await ai.models.generateContent({ 
        model: "gemini-3-flash-preview", 
        contents: fundingPrompt 
      });
      
      const fundingText = fundingRes.text;
      if (fundingText) {
        setFundingAssessment(fundingText);
      } else {
        setFundingAssessment('Funding assessment returned empty, but clinical summary was generated.');
      }

    } catch (error) {
      console.error("AI Generation Error:", error);
      setClinicalSummary('### Generation Error\nAn error occurred while communicating with the clinical analysis engine. Please ensure your assessment data is complete and try again.');
      setFundingAssessment('Analysis could not be completed at this time.');
    } finally {
      setIsGenerating(false);
    }
  };

  const updateSection = (section: keyof FullAssessment, data: any) => {
    // Clear generated reports when data changes to prevent stale reports
    setClinicalSummary('');
    setFundingAssessment('');
    
    setAssessment((prev) => {
      const currentSection = prev[section];
      if (typeof currentSection === 'object' && currentSection !== null && !Array.isArray(currentSection)) {
        return {
          ...prev,
          [section]: { ...currentSection, ...data },
        };
      }
      return {
        ...prev,
        [section]: data,
      };
    });
  };

  const renderStepContent = () => {
    const step = STEPS[currentStep].id;

    switch (step) {
      case 'details':
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-zinc-700 flex items-center gap-2">
                  <User size={16} /> Assessor ID
                </label>
                <input
                  type="text"
                  className="w-full p-3 bg-white border border-zinc-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  value={assessment.details.assessorId}
                  onChange={(e) => updateSection('details', { assessorId: e.target.value })}
                  placeholder="Enter Assessor ID"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-zinc-700 flex items-center gap-2">
                  <Building2 size={16} /> Facility ID
                </label>
                <input
                  type="text"
                  className="w-full p-3 bg-white border border-zinc-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  value={assessment.details.facilityId}
                  onChange={(e) => updateSection('details', { facilityId: e.target.value })}
                  placeholder="Enter Facility ID"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-zinc-700 flex items-center gap-2">
                  <ClipboardCheck size={16} /> Resident ID
                </label>
                <input
                  type="text"
                  className="w-full p-3 bg-white border border-zinc-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  value={assessment.details.residentId}
                  onChange={(e) => updateSection('details', { residentId: e.target.value })}
                  placeholder="Enter Resident ID"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-zinc-700 flex items-center gap-2">
                  <Clock size={16} /> Date of Assessment
                </label>
                <input
                  type="date"
                  className="w-full p-3 bg-white border border-zinc-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  value={assessment.details.dateOfAssessment}
                  onChange={(e) => updateSection('details', { dateOfAssessment: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-zinc-700 flex items-center gap-2">
                  <MapPin size={16} /> Place of Assessment
                </label>
                <select
                  className="w-full p-3 bg-white border border-zinc-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  value={assessment.details.placeOfAssessment}
                  onChange={(e) => updateSection('details', { placeOfAssessment: e.target.value })}
                >
                  <option value="RACF">Residential Aged Care Facility (RACF)</option>
                  <option value="Hospital">Hospital</option>
                  <option value="Home">Home</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
          </div>
        );

      case 'nursing':
        return (
          <div className="space-y-6">
            <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 flex gap-3">
              <Info className="text-emerald-600 shrink-0" size={20} />
              <p className="text-sm text-emerald-800">
                Identify complex nursing requirements that impact cost of care. Include only if required on a regular basis (most days).
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { key: 'bariatric', label: 'Requires 3+ people for transfers due to weight?' },
                { key: 'oxygen', label: 'Requires Oxygen monitoring/supply?' },
                { key: 'enteralFeeding', label: 'Requires Enteral feeding (PEG/J tubes)?' },
                { key: 'tracheostomy', label: 'Requires Tracheostomy care?' },
                { key: 'catheter', label: 'Requires Catheter care?' },
                { key: 'stoma', label: 'Requires Stoma care?' },
                { key: 'peritonealDialysis', label: 'Requires Peritoneal dialysis?' },
                { key: 'dailyInjections', label: 'Requires Daily injections?' },
                { key: 'complexWoundManagement', label: 'Requires Complex wound management?' },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between p-4 bg-white border border-zinc-100 rounded-2xl shadow-sm">
                  <span className="text-sm font-medium text-zinc-700 pr-4">{item.label}</span>
                  <div className="flex gap-2">
                    {['Yes', 'No'].map((val) => (
                      <button
                        key={val}
                        onClick={() => updateSection('nursing', { [item.key]: val })}
                        className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                          assessment.nursing[item.key as keyof typeof assessment.nursing] === val
                            ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-200'
                            : 'bg-zinc-50 text-zinc-500 hover:bg-zinc-100'
                        }`}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'rugAdl':
        return (
          <div className="space-y-8">
            <div className="grid grid-cols-1 gap-8">
              {[
                { key: 'bedMobility', label: 'Bed Mobility', options: [1, 3, 4, 5], desc: 'Ability to move in bed after transfer into bed is complete.' },
                { key: 'toileting', label: 'Toileting', options: [1, 3, 4, 5], desc: 'Includes mobilising, adjustment of clothing, and hygiene.' },
                { key: 'transfer', label: 'Transfer', options: [1, 3, 4, 5], desc: 'Transfer in/out of bed, chair, shower/tub.' },
                { key: 'eating', label: 'Eating', options: [1, 2, 3], desc: 'Cutting food, bringing to mouth, chewing/swallowing.' },
              ].map((item) => (
                <div key={item.key} className="space-y-4">
                  <div>
                    <h3 className="text-lg font-bold text-zinc-800">{item.label}</h3>
                    <p className="text-sm text-zinc-500">{item.desc}</p>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {item.options.map((val) => (
                      <button
                        key={val}
                        onClick={() => updateSection('rugAdl', { [item.key]: val })}
                        className={`p-4 rounded-2xl border-2 transition-all text-left ${
                          assessment.rugAdl[item.key as keyof typeof assessment.rugAdl] === val
                            ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                            : 'border-zinc-100 bg-white text-zinc-600 hover:border-zinc-300'
                        }`}
                      >
                        <div className="text-xl font-black mb-1">Score {val}</div>
                        <div className="text-xs opacity-70">
                          {val === 1 ? 'Independent' : val === 3 ? 'Limited Assist' : val === 4 ? 'Device + 1 Person' : val === 5 ? '2+ Persons' : 'Limited Assist (Eating)'}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'akps':
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-zinc-800">Australia-modified Karnofsky Performance Status</h3>
            <div className="grid grid-cols-1 gap-2">
              {(Object.keys(AKPS_LABELS).reverse() as unknown as AKPSScore[]).map((score) => (
                <button
                  key={score}
                  onClick={() => setAssessment(prev => ({ ...prev, akps: Number(score) as AKPSScore }))}
                  className={`p-4 rounded-2xl border-2 transition-all text-left flex items-center gap-4 ${
                    assessment.akps === Number(score)
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                      : 'border-zinc-100 bg-white text-zinc-600 hover:border-zinc-300'
                  }`}
                >
                  <div className="w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center font-bold text-lg shrink-0">
                    {score}
                  </div>
                  <span className="text-sm font-medium">{AKPS_LABELS[score]}</span>
                </button>
              ))}
            </div>
          </div>
        );

      case 'palliative':
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4">
              {[
                { key: 'enteredForPalliative', label: 'Did the resident enter for residential palliative care?' },
                { key: 'prognosisLessThan3Months', label: 'Prognosis less than 3 months?' },
                { key: 'existingCarePlan', label: 'Existing palliative care plan on entry?' },
                { key: 'akpsScore40OrLess', label: 'Is the current AKPS score 40 or less?' },
                { key: 'hasMalignancy', label: 'Does the resident have a malignancy?' },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between p-4 bg-white border border-zinc-100 rounded-2xl shadow-sm">
                  <span className="text-sm font-medium text-zinc-700 pr-4">{item.label}</span>
                  <div className="flex gap-2">
                    {['Yes', 'No'].map((val) => (
                      <button
                        key={val}
                        onClick={() => updateSection('palliative', { [item.key]: val })}
                        className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                          assessment.palliative[item.key as keyof typeof assessment.palliative] === val
                            ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-200'
                            : 'bg-zinc-50 text-zinc-500 hover:bg-zinc-100'
                        }`}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              
              <div className="space-y-2 mt-4">
                <label className="text-sm font-semibold text-zinc-700">Palliative Care Phase</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {['Stable', 'Unstable', 'Deteriorating', 'Terminal'].map((phase) => (
                    <button
                      key={phase}
                      onClick={() => updateSection('palliative', { palliativePhase: phase })}
                      className={`p-3 rounded-xl border-2 transition-all text-sm font-bold ${
                        assessment.palliative.palliativePhase === phase
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                          : 'border-zinc-100 bg-white text-zinc-600'
                      }`}
                    >
                      {phase}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );

      case 'frailty':
        return (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <label className="text-sm font-semibold text-zinc-700">Falls in last 12 months</label>
                <div className="flex flex-col gap-2">
                  {['No', 'Yes, once', 'Yes, more than once'].map((val) => (
                    <button
                      key={val}
                      onClick={() => updateSection('frailty', { fallenInLast12Months: val })}
                      className={`p-3 rounded-xl border-2 transition-all text-left text-sm font-medium ${
                        assessment.frailty.fallenInLast12Months === val
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                          : 'border-zinc-100 bg-white text-zinc-600'
                      }`}
                    >
                      {val}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-4">
                <label className="text-sm font-semibold text-zinc-700">Weight Loss ({'>'}10% in 12 months)</label>
                <div className="flex gap-2">
                  {['Yes', 'No'].map((val) => (
                    <button
                      key={val}
                      onClick={() => updateSection('frailty', { lostWeightMoreThan10Percent: val })}
                      className={`flex-1 p-3 rounded-xl border-2 transition-all text-sm font-bold ${
                        assessment.frailty.lostWeightMoreThan10Percent === val
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                          : 'border-zinc-100 bg-white text-zinc-600'
                      }`}
                    >
                      {val}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-bold text-zinc-800">Rockwood Frailty Scale</h3>
              <div className="grid grid-cols-1 gap-2">
                {Object.entries(ROCKWOOD_LABELS).map(([score, info]) => (
                  <button
                    key={score}
                    onClick={() => updateSection('frailty', { rockwoodScore: Number(score) })}
                    className={`p-4 rounded-2xl border-2 transition-all text-left flex items-start gap-4 ${
                      assessment.frailty.rockwoodScore === Number(score)
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                        : 'border-zinc-100 bg-white text-zinc-600 hover:border-zinc-300'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center font-bold text-sm shrink-0 mt-1">
                      {score}
                    </div>
                    <div>
                      <div className="font-bold text-sm">{info.title}</div>
                      <div className="text-xs opacity-70">{info.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case 'braden':
        return (
          <div className="space-y-6">
            <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 flex gap-3">
              <Info className="text-blue-600 shrink-0" size={20} />
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> Lower scores indicate higher risk. 1 is the most severe limitation, while 4 is no impairment.
              </p>
            </div>
            <h3 className="text-lg font-bold text-zinc-800">Braden Scale - Pressure Sore Risk</h3>
            <div className="grid grid-cols-1 gap-8">
              {[
                { key: 'sensoryPerception', label: 'Sensory Perception', max: 4 },
                { key: 'moisture', label: 'Moisture', max: 4 },
                { key: 'activity', label: 'Activity', max: 4 },
                { key: 'mobility', label: 'Mobility', max: 4 },
                { key: 'nutrition', label: 'Nutrition', max: 4 },
                { key: 'frictionShear', label: 'Friction and Shear', max: 3 },
              ].map((item) => (
                <div key={item.key} className="space-y-3">
                  <label className="text-sm font-bold text-zinc-700">{item.label}</label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {Array.from({ length: item.max }, (_, i) => i + 1).map((val) => (
                      <button
                        key={val}
                        onClick={() => updateSection('braden', { [item.key]: val })}
                        className={`p-4 rounded-2xl border-2 transition-all text-left flex flex-col gap-1 ${
                          assessment.braden[item.key as keyof typeof assessment.braden] === val
                            ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                            : 'border-zinc-100 bg-white text-zinc-600 hover:border-zinc-300'
                        }`}
                      >
                        <span className="text-xl font-black">{val}</span>
                        <span className="text-[10px] font-bold leading-tight opacity-70 uppercase tracking-wider">
                          {BRADEN_LABELS[item.key][val]}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'demmi':
        return (
          <div className="space-y-8">
            <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 flex gap-3">
              <AlertTriangle className="text-amber-600 shrink-0" size={20} />
              <p className="text-sm text-amber-800">
                Based on direct observation. Do not ask resident to complete tasks if there is a falls risk or distress.
              </p>
            </div>
            
            <div className="space-y-6">
              {/* Bed Domain */}
              <div className="space-y-4">
                <h4 className="text-md font-bold text-zinc-700 border-b pb-2">Bed Tasks</h4>
                <div className="grid grid-cols-1 gap-4">
                  {[
                    { key: 'bridge', label: 'Bridge', desc: 'Lift bottom clear of bed while lying on back with knees bent.', options: ['unable', 'able'], domain: 'bed' },
                    { key: 'rollOntoSide', label: 'Roll onto side', desc: 'Roll from lying on back to lying on the side.', options: ['unable', 'able'], domain: 'bed' },
                    { key: 'lyingToSitting', label: 'Lying to sitting', desc: 'Sit up over edge of bed from a lying position.', options: ['unable', 'min assist/supervision', 'independent'], domain: 'bed' },
                  ].map(task => (
                    <div key={task.key} className="flex flex-col p-4 bg-white rounded-xl border border-zinc-100 gap-3">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-zinc-800">{task.label}</span>
                        <span className="text-xs text-zinc-500">{task.desc}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {task.options.map(v => (
                          <button 
                            key={v} 
                            onClick={() => updateSection('demmi', { [task.domain]: { ...(assessment.demmi as any)[task.domain], [task.key]: v } })} 
                            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                              (assessment.demmi as any)[task.domain][task.key] === v 
                                ? 'bg-emerald-600 text-white shadow-md' 
                                : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
                            }`}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Chair Domain */}
              <div className="space-y-4">
                <h4 className="text-md font-bold text-zinc-700 border-b pb-2">Chair Tasks</h4>
                <div className="grid grid-cols-1 gap-4">
                  {[
                    { key: 'sitUnsupported', label: 'Sit unsupported in chair', desc: 'Sit in a chair without using backrest or armrests for 10 seconds.', options: ['unable', '10 sec'], domain: 'chair' },
                    { key: 'sitToStand', label: 'Sit to stand from chair', desc: 'Stand up from a chair using armrests for support.', options: ['unable', 'min assist/supervision', 'independent'], domain: 'chair' },
                    { key: 'sitToStandNoArms', label: 'Sit to stand without using arms', desc: 'Stand up from a chair with arms folded across chest.', options: ['unable', 'able'], domain: 'chair' },
                  ].map(task => (
                    <div key={task.key} className="flex flex-col p-4 bg-white rounded-xl border border-zinc-100 gap-3">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-zinc-800">{task.label}</span>
                        <span className="text-xs text-zinc-500">{task.desc}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {task.options.map(v => (
                          <button 
                            key={v} 
                            onClick={() => updateSection('demmi', { [task.domain]: { ...(assessment.demmi as any)[task.domain], [task.key]: v } })} 
                            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                              (assessment.demmi as any)[task.domain][task.key] === v 
                                ? 'bg-emerald-600 text-white shadow-md' 
                                : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
                            }`}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Balance Domain */}
              <div className="space-y-4">
                <h4 className="text-md font-bold text-zinc-700 border-b pb-2">Static Balance (No Gait Aid)</h4>
                <div className="grid grid-cols-1 gap-4">
                  {[
                    { key: 'standUnsupported', label: 'Stand unsupported', desc: 'Stand without any support for 10 seconds.', options: ['unable', '10 sec'], domain: 'balance' },
                    { key: 'standFeetTogether', label: 'Stand feet together', desc: 'Stand with feet touching for 10 seconds.', options: ['unable', '10 sec'], domain: 'balance' },
                    { key: 'standOnToes', label: 'Stand on toes', desc: 'Stand on the balls of the feet for 10 seconds.', options: ['unable', '10 sec'], domain: 'balance' },
                    { key: 'tandemStandEyesClosed', label: 'Tandem stand with eyes closed', desc: 'Stand with one foot directly in front of the other and eyes closed for 10 seconds.', options: ['unable', '10 sec'], domain: 'balance' },
                  ].map(task => (
                    <div key={task.key} className="flex flex-col p-4 bg-white rounded-xl border border-zinc-100 gap-3">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-zinc-800">{task.label}</span>
                        <span className="text-xs text-zinc-500">{task.desc}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {task.options.map(v => (
                          <button 
                            key={v} 
                            onClick={() => updateSection('demmi', { [task.domain]: { ...(assessment.demmi as any)[task.domain], [task.key]: v } })} 
                            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                              (assessment.demmi as any)[task.domain][task.key] === v 
                                ? 'bg-emerald-600 text-white shadow-md' 
                                : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
                            }`}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Walking Domain */}
              <div className="space-y-4">
                <h4 className="text-md font-bold text-zinc-700 border-b pb-2">Walking Tasks</h4>
                <div className="grid grid-cols-1 gap-4">
                  <div className="flex flex-col p-4 bg-white rounded-xl border border-zinc-100 gap-3">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-zinc-800">Walking Distance</span>
                      <span className="text-xs text-zinc-500">Maximum distance the resident can walk, with or without a gait aid.</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {['unable', '5m', '10m', '20m', '50m'].map(v => (
                        <button 
                          key={v} 
                          onClick={() => updateSection('demmi', { walking: { ...assessment.demmi.walking, distance: v as any } })} 
                          className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                            assessment.demmi.walking.distance === v 
                              ? 'bg-emerald-600 text-white shadow-md' 
                              : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
                          }`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col p-4 bg-white rounded-xl border border-zinc-100 gap-3">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-zinc-800">Walking Independence</span>
                      <span className="text-xs text-zinc-500">Level of assistance or supervision required for walking.</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {['unable', 'min assist/supervision', 'independent with aid', 'independent without aid'].map(v => (
                        <button 
                          key={v} 
                          onClick={() => updateSection('demmi', { walking: { ...assessment.demmi.walking, independence: v as any } })} 
                          className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                            assessment.demmi.walking.independence === v 
                              ? 'bg-emerald-600 text-white shadow-md' 
                              : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
                          }`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'afm':
        return (
          <div className="space-y-6">
            <div className="bg-zinc-900 text-white p-6 rounded-3xl shadow-xl">
              <h3 className="text-2xl font-bold mb-2">Australian Functional Measure</h3>
              <p className="text-zinc-400 text-sm">Measures care burden on a scale of 1-7.</p>
            </div>
            
            <div className="grid grid-cols-1 gap-8">
              {['selfCare', 'sphincterControl', 'transfers', 'locomotion', 'communication', 'socialCognition'].map((cat) => (
                <div key={cat} className="space-y-4">
                  <h4 className="text-lg font-bold text-zinc-800 capitalize">{cat.replace(/([A-Z])/g, ' $1')}</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.keys(assessment.afm[cat as keyof typeof assessment.afm]).map((item) => (
                      <div key={item} className="p-4 bg-white border border-zinc-100 rounded-2xl shadow-sm space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-bold text-zinc-700 capitalize">{item.replace(/([A-Z])/g, ' $1')}</span>
                          <span className="text-emerald-600 font-black text-xl">
                            {(assessment.afm[cat as keyof typeof assessment.afm] as any)[item]}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="1"
                          max="7"
                          step="1"
                          className="w-full h-2 bg-zinc-100 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                          value={(assessment.afm[cat as keyof typeof assessment.afm] as any)[item]}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            updateSection('afm', { [cat]: { ...(assessment.afm[cat as keyof typeof assessment.afm] as any), [item]: val } });
                          }}
                        />
                        <div className="flex justify-between text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
                          <span>Total Assist</span>
                          <span>Independent</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'brua':
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-zinc-800">Behaviour Resource Utilisation Assessment</h3>
            <div className="grid grid-cols-1 gap-6">
              {[
                { key: 'wandering', label: 'Problem wandering or intrusive behaviour' },
                { key: 'verballyDisruptive', label: 'Verbally disruptive or noisy' },
                { key: 'physicallyAggressive', label: 'Physically aggressive or inappropriate' },
                { key: 'emotionalDependence', label: 'Emotional dependence' },
                { key: 'dangerToSelfOrOthers', label: 'Danger to self or others' },
              ].map((item) => (
                <div key={item.key} className="space-y-3">
                  <label className="text-sm font-bold text-zinc-700">{item.label}</label>
                  <div className="grid grid-cols-1 gap-2">
                    {[1, 2, 3, 4].map((val) => (
                      <button
                        key={val}
                        onClick={() => updateSection('brua', { [item.key]: val })}
                        className={`p-3 rounded-xl border-2 transition-all text-left text-xs font-medium ${
                          assessment.brua[item.key as keyof typeof assessment.brua] === val
                            ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                            : 'border-zinc-100 bg-white text-zinc-600'
                        }`}
                      >
                        <span className="font-bold mr-2">{val}.</span>
                        {BRUA_LABELS[val]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'summary':
        return (
          <div className="space-y-8" id="assessment-report-content">
            <div className="bg-zinc-900 text-white p-8 rounded-[2rem] shadow-2xl relative overflow-hidden print:bg-white print:text-zinc-900 print:shadow-none print:border print:border-zinc-200">
              <div className="relative z-10">
                <h2 className="text-3xl font-black mb-2">Assessment Summary</h2>
                <p className="text-zinc-400 print:text-zinc-600">Resident: {assessment.details.residentId || 'Not Specified'}</p>
                <p className="text-zinc-400 text-xs mt-1 print:text-zinc-600">Date: {assessment.details.dateOfAssessment}</p>
              </div>
              <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -mr-32 -mt-32 print:hidden"></div>
            </div>

            {/* Disclaimer Section */}
            <div className="bg-amber-50 p-6 rounded-3xl border border-amber-200 flex gap-4 items-start">
              <AlertTriangle className="text-amber-600 shrink-0 mt-1" size={24} />
              <div className="space-y-1">
                <h5 className="text-sm font-black text-amber-900 uppercase tracking-widest">Educational Disclaimer</h5>
                <p className="text-xs text-amber-800 leading-relaxed">
                  This report is generated for <strong>educational and reference purposes only</strong>. It is not a formal funding determination. 
                  Assessors should not rely solely on this output for clinical or financial decisions. Always verify results against the latest 
                  official Australian Government AN-ACC Funding Guide and Reference Manual.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-6 bg-white rounded-3xl border border-zinc-100 shadow-sm">
                <h4 className="text-sm font-black text-zinc-400 uppercase tracking-widest mb-4">Nursing & Clinical</h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">AKPS Score</span>
                    <span className="font-bold text-emerald-600">{assessment.akps}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Palliative Status</span>
                    <span className="font-bold">{assessment.palliative.enteredForPalliative}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Rockwood Frailty</span>
                    <span className="font-bold">{assessment.frailty.rockwoodScore}</span>
                  </div>
                </div>
              </div>

              <div className="p-6 bg-white rounded-3xl border border-zinc-100 shadow-sm">
                <h4 className="text-sm font-black text-zinc-400 uppercase tracking-widest mb-4">Functional Status</h4>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">RUG-ADL Total (4 items)</span>
                    <span className="font-bold">
                      {(assessment.rugAdl.bedMobility as number) + (assessment.rugAdl.toileting as number) + (assessment.rugAdl.transfer as number) + (assessment.rugAdl.eating as number)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm p-2 bg-emerald-50 rounded-lg border border-emerald-100">
                    <span className="text-emerald-700 font-bold">AN-ACC Mobility Score</span>
                    <span className="font-black text-emerald-600">
                      {(assessment.rugAdl.bedMobility as number) + (assessment.rugAdl.toileting as number) + (assessment.rugAdl.transfer as number)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">AFM Motor Avg</span>
                    <span className="font-bold">
                      {( (Object.values(assessment.afm.selfCare).reduce((a: number, b: any) => a + (b as number), 0) as number) / 6).toFixed(1)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* AI Clinical Summary Section */}
            <div className="p-8 bg-emerald-50 rounded-[2.5rem] border border-emerald-100 space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white">
                    <Sparkles size={20} />
                  </div>
                  <h3 className="text-xl font-black text-emerald-900">Clinical Written Assessment</h3>
                </div>
              </div>

              {isGenerating ? (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <Loader2 className="animate-spin text-emerald-600" size={40} />
                  <p className="text-emerald-800 font-bold animate-pulse">Analyzing clinical data and determining funding class...</p>
                </div>
              ) : clinicalSummary ? (
                <div className="space-y-8">
                  <div className="prose prose-emerald max-w-none bg-white p-8 rounded-3xl border border-emerald-100 shadow-inner overflow-auto max-h-[500px]">
                    <h4 className="text-emerald-700 font-black uppercase tracking-widest text-xs mb-4">Clinical Summary</h4>
                    <Markdown>{clinicalSummary}</Markdown>
                  </div>
                  
                  <div className="prose prose-indigo max-w-none bg-indigo-50/50 p-8 rounded-3xl border border-indigo-100 shadow-inner overflow-auto max-h-[500px]">
                    <div className="flex items-center gap-2 mb-4">
                      <Scale className="text-indigo-600" size={20} />
                      <h4 className="text-indigo-700 font-black uppercase tracking-widest text-xs">Funding Classification & Reasons</h4>
                    </div>
                    <Markdown>{fundingAssessment}</Markdown>
                  </div>

                  {/* Deterministic Algorithm Verification */}
                  {algoResult && (
                    <div className="bg-white p-8 rounded-3xl border border-zinc-200 space-y-6">
                      <div className="flex items-center gap-2">
                        <Activity className="text-emerald-600" size={20} />
                        <h4 className="text-zinc-900 font-black uppercase tracking-widest text-xs">Algorithm Verification (Branching Logic)</h4>
                      </div>
                      
                      <div className="space-y-4">
                        {algoResult.path.map((step, idx) => (
                          <div key={idx} className="flex gap-4 items-start">
                            <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold text-[10px] shrink-0 mt-1">
                              {idx + 1}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-sm text-zinc-900">{step.title}:</span>
                                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md text-[10px] font-black uppercase">{step.value}</span>
                              </div>
                              <p className="text-xs text-zinc-500 mt-1">{step.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="pt-4 border-t border-zinc-100">
                        <div className="flex justify-between items-center bg-zinc-900 text-white p-4 rounded-2xl">
                          <div>
                            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Calculated Class</p>
                            <h5 className="text-lg font-black">Class {algoResult.classId}</h5>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Daily Rate</p>
                            <h5 className="text-lg font-black text-emerald-400">${AN_ACC_CLASSES[algoResult.classId]?.rate.toFixed(2)}</h5>
                          </div>
                        </div>
                      </div>

                      <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100">
                        <h5 className="text-[10px] font-black text-amber-800 uppercase tracking-widest mb-2 flex items-center gap-1">
                          <ShieldAlert size={12} /> Verification Links
                        </h5>
                        <ul className="text-[10px] text-amber-900 space-y-1 list-disc ml-4 font-medium">
                          <li>Branching logic verified against <strong>Funding Guide Page 26, Figure 2</strong>.</li>
                          <li>Classification rates verified against <strong>Funding Guide Page 24, Table 2</strong>.</li>
                          <li>Compounding factors mapped from <strong>Reference Manual Section 1 (Technical Nursing)</strong>.</li>
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-emerald-600/50 italic font-medium">
                  Click the button above to generate a detailed written clinical assessment and funding eligibility report.
                </div>
              )}
            </div>

            <div className="flex flex-col gap-4 print:hidden relative z-20 no-print">
              <div className="flex flex-col md:flex-row gap-4">
                <button 
                  type="button"
                  onClick={handlePrint}
                  className="flex-1 py-4 bg-zinc-900 text-white rounded-2xl font-black text-lg shadow-xl shadow-zinc-200 hover:bg-zinc-800 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer relative z-30"
                  title="Print the full assessment report as a PDF"
                >
                  <ClipboardCheck size={24} /> Print Full Report
                </button>
                {clinicalSummary && (
                  <button 
                    onClick={generateClinicalSummary}
                    className="py-4 px-8 bg-white text-emerald-600 border-2 border-emerald-600 rounded-2xl font-black text-lg hover:bg-emerald-50 transition-all flex items-center justify-center gap-2"
                  >
                    <Sparkles size={24} /> Regenerate
                  </button>
                )}
              </div>

              {/* Print Troubleshooting */}
              <div className="bg-zinc-100 p-4 rounded-2xl border border-zinc-200 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Info className="text-zinc-500" size={20} />
                  <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider">
                    Printing issues in Preview? Open the app in a new tab for full PDF support.
                  </p>
                </div>
                <button 
                  onClick={goToFirstStep}
                  className="px-4 py-2 bg-white border border-zinc-300 text-zinc-700 rounded-xl text-[10px] font-black uppercase hover:bg-zinc-50 transition-all flex items-center gap-2"
                >
                  <ArrowLeft size={12} /> Back to Start
                </button>
                <button 
                  onClick={handleDownload}
                  className="px-4 py-2 bg-white border border-zinc-300 text-zinc-700 rounded-xl text-[10px] font-black uppercase hover:bg-zinc-50 transition-all flex items-center gap-2"
                >
                  Download HTML <ChevronRight size={12} />
                </button>
                <a 
                  href={`${window.location.origin}${window.location.pathname}#state=${encodeURIComponent(JSON.stringify({ assessment, currentStep, clinicalSummary, fundingAssessment }))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-white border border-zinc-300 text-zinc-700 rounded-xl text-[10px] font-black uppercase hover:bg-zinc-50 transition-all flex items-center gap-2"
                >
                  Open in New Tab <ChevronRight size={12} />
                </a>
              </div>

              {/* Reset Option */}
              <div className="flex justify-center pt-8 border-t border-zinc-200 mt-8">
                <button 
                  onClick={resetAssessment}
                  className={`flex items-center gap-3 px-10 py-5 rounded-2xl font-black text-xl transition-all shadow-xl active:scale-95 ${
                    confirmReset 
                      ? 'bg-red-600 text-white shadow-red-200' 
                      : 'bg-white text-zinc-400 border-2 border-zinc-200 hover:border-red-500 hover:text-red-500'
                  }`}
                >
                  <RotateCcw size={24} className={confirmReset ? 'animate-spin' : ''} />
                  {confirmReset ? 'Click Again to Confirm Reset' : 'Start New Assessment'}
                </button>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] font-sans text-zinc-900 selection:bg-emerald-100">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page { margin: 1.5cm; size: A4; }
          body { background: white !important; -webkit-print-color-adjust: exact; }
          header, footer, .print\\:hidden, button, .no-print { display: none !important; }
          main { padding: 0 !important; max-width: none !important; }
          .rounded-\\[2\\.5rem\\], .rounded-3xl, .rounded-\\[2rem\\] { border-radius: 0.5rem !important; }
          .shadow-xl, .shadow-2xl, .shadow-sm { shadow: none !important; box-shadow: none !important; }
          .bg-zinc-900 { background-color: #18181b !important; color: white !important; border: none !important; }
          .text-zinc-400, .text-zinc-500 { color: #4b5563 !important; }
          .prose { max-width: none !important; }
          .max-h-\\[500px\\] { max-height: none !important; overflow: visible !important; }
          .bg-emerald-50, .bg-indigo-50\\/50, .bg-amber-50 { background-color: #f0fdf4 !important; border: 1px solid #dcfce7 !important; }
          
          /* Page Break Management */
          .prose, .bg-white, .bg-emerald-50, .bg-amber-50 { page-break-inside: avoid; break-inside: avoid; }
          h2, h3, h4 { page-break-after: avoid; break-after: avoid; }
        }
      `}} />
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-50 print:hidden">
        <div className="max-w-5xl mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-200">
              <Activity size={24} />
            </div>
            <div>
              <h1 className="font-black text-xl tracking-tight">AN-ACC</h1>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Aged Care Assessment</p>
            </div>
          </div>
          
          <div className="hidden md:flex items-center gap-2 bg-zinc-50 p-1.5 rounded-2xl border border-zinc-100">
            {STEPS.map((step, idx) => (
              <div 
                key={step.id}
                className={`w-2.5 h-2.5 rounded-full transition-all duration-500 ${
                  idx === currentStep ? 'bg-emerald-600 w-8' : idx < currentStep ? 'bg-emerald-200' : 'bg-zinc-200'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-4">
            <button 
              onClick={() => setShowFlowChart(!showFlowChart)}
              className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
            >
              <Info size={14} /> {showFlowChart ? 'Hide Flow' : 'Show Flow'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 pb-32">
        {/* Flow Chart Overview */}
        <AnimatePresence>
          {showFlowChart && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mb-8 overflow-hidden print:hidden"
            >
              <div className="bg-white p-6 rounded-[2rem] border border-zinc-200 shadow-sm">
                <h2 className="text-sm font-black text-zinc-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                  <Activity size={16} /> Assessment Flow Algorithm
                </h2>
                <div className="flex flex-wrap gap-4 items-center justify-center">
                  {STEPS.map((step, idx) => (
                    <React.Fragment key={step.id}>
                      <div className={`flex flex-col items-center gap-2 p-3 rounded-2xl transition-all ${idx === currentStep ? 'bg-emerald-50 border border-emerald-200 scale-110 shadow-lg' : 'opacity-40'}`}>
                        <step.icon size={20} className={idx === currentStep ? 'text-emerald-600' : 'text-zinc-400'} />
                        <span className="text-[10px] font-bold text-center max-w-[80px] leading-tight">{step.title}</span>
                      </div>
                      {idx < STEPS.length - 1 && <ChevronRight size={16} className="text-zinc-300" />}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Current Step Content */}
        <div className="bg-white rounded-[2.5rem] border border-zinc-200 shadow-xl shadow-zinc-200/50 overflow-hidden min-h-[600px] flex flex-col">
          <div className="p-8 md:p-12 flex-1">
            <div className="flex items-center gap-4 mb-10">
              <div className="w-14 h-14 bg-zinc-900 rounded-2xl flex items-center justify-center text-white shadow-xl">
                {React.createElement(STEPS[currentStep].icon, { size: 28 })}
              </div>
              <div>
                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em]">Step {currentStep + 1} of {STEPS.length}</span>
                <h2 className="text-3xl font-black tracking-tight text-zinc-900">{STEPS[currentStep].title}</h2>
              </div>
            </div>

            <motion.div
              key={currentStep}
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            >
              {renderStepContent()}
            </motion.div>
          </div>

          {/* Navigation Footer */}
          <div className="p-8 bg-zinc-50 border-t border-zinc-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={prevStep}
                disabled={currentStep === 0}
                className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-bold transition-all ${
                  currentStep === 0 ? 'opacity-0 pointer-events-none' : 'text-zinc-500 hover:bg-zinc-200'
                }`}
              >
                <ChevronLeft size={20} /> Previous
              </button>
              {currentStep > 0 && (
                <button
                  onClick={goToFirstStep}
                  className="hidden md:flex items-center gap-2 px-4 py-3 rounded-2xl font-bold text-zinc-400 hover:text-zinc-600 hover:bg-zinc-200 transition-all"
                  title="Go back to the first page"
                >
                  <ArrowLeft size={16} /> First Page
                </button>
              )}
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={nextStep}
                disabled={currentStep === STEPS.length - 1}
                className={`flex items-center gap-2 px-8 py-4 bg-zinc-900 text-white rounded-2xl font-bold shadow-xl shadow-zinc-200 hover:bg-zinc-800 transition-all ${
                  currentStep === STEPS.length - 1 ? 'hidden' : ''
                }`}
              >
                Continue <ChevronRight size={20} />
              </button>
              {currentStep === STEPS.length - 1 && (
                <div className="flex items-center gap-4">
                  {!clinicalSummary && !isGenerating && (
                    <button
                      onClick={generateClinicalSummary}
                      className="flex items-center gap-2 px-8 py-4 bg-emerald-600 text-white rounded-2xl font-bold shadow-xl shadow-emerald-200 hover:bg-emerald-700 active:scale-95 transition-all"
                    >
                      <Sparkles size={20} /> Finalize & Generate Report
                    </button>
                  )}
                  {clinicalSummary && (
                    <div className="flex items-center gap-2 text-emerald-600 font-bold">
                      <CheckCircle2 size={20} /> Assessment Finalized
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Footer Branding */}
      <footer className="max-w-5xl mx-auto px-4 py-12 text-center">
        <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">
          Australian National Aged Care Classification (AN-ACC) Reference Tool
        </p>
        <p className="text-[10px] text-zinc-300 mt-2">
          Based on Publication Date: 1 April 2021
        </p>
      </footer>
    </div>
  );
}
