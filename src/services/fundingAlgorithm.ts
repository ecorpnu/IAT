import { FullAssessment } from "../types";

export interface LogicStep {
  title: string;
  value: string;
  description: string;
  isMatch: boolean;
}

export interface FundingResult {
  classId: number;
  path: LogicStep[];
  compoundingFactors: string[];
}

export function calculateFundingLogic(assessment: FullAssessment): FundingResult {
  const path: LogicStep[] = [];
  
  // 1. Define Compounding Factors (Nursing & Behaviour)
  // Note: Pressure risk is handled separately in the "Not Mobile" branch
  const nursingFactors: string[] = [];
  if (assessment.nursing.oxygen === 'Yes') nursingFactors.push("Oxygen");
  if (assessment.nursing.enteralFeeding === 'Yes') nursingFactors.push("Enteral Feeding");
  if (assessment.nursing.tracheostomy === 'Yes') nursingFactors.push("Tracheostomy");
  if (assessment.nursing.complexWoundManagement === 'Yes') nursingFactors.push("Complex Wound");
  
  const behaviourFactors: string[] = [];
  if (assessment.brua.wandering <= 2) behaviourFactors.push("Wandering");
  if (assessment.brua.verballyDisruptive <= 2) behaviourFactors.push("Verbally Disruptive");
  if (assessment.brua.physicallyAggressive <= 2) behaviourFactors.push("Physically Aggressive");
  if (assessment.brua.emotionalDependence <= 2) behaviourFactors.push("Emotional Dependence");
  if (assessment.brua.dangerToSelfOrOthers <= 2) behaviourFactors.push("Danger to Self/Others");

  const bradenTotal = assessment.braden.sensoryPerception + assessment.braden.moisture + assessment.braden.activity + assessment.braden.mobility + assessment.braden.nutrition + assessment.braden.frictionShear;
  const isHighPressureRisk = bradenTotal <= 12;

  // General compounding factors (for Independent and Assisted branches)
  const allCompounding = [...nursingFactors, ...behaviourFactors];
  if (isHighPressureRisk) allCompounding.push("High Pressure Risk");
  
  const hasGeneralCompounding = allCompounding.length > 0;

  // 2. Branching Logic (Figure 2, Page 26 of Funding Guide)
  
  // Palliative Branch
  if (assessment.palliative.enteredForPalliative === 'Yes' && assessment.akps <= 40) {
    path.push({ 
      title: "Palliative Entry", 
      value: "Yes", 
      description: "Resident entered for planned palliative care with AKPS <= 40", 
      isMatch: true 
    });
    return { classId: 1, path, compoundingFactors: ["Palliative Status"] };
  }

  // Mobility Branch (RUG-ADL Mobility Score: Bed + Transfer + Toileting)
  const mobilityScore = assessment.rugAdl.bedMobility + assessment.rugAdl.transfer + assessment.rugAdl.toileting;
  
  if (mobilityScore === 3) {
    path.push({ title: "Mobility", value: "Independent", description: "RUG-ADL Mobility Score = 3", isMatch: true });
    if (hasGeneralCompounding) {
      path.push({ title: "Compounding Factors", value: "Present", description: allCompounding.join(", "), isMatch: true });
      return { classId: 3, path, compoundingFactors: allCompounding };
    } else {
      path.push({ title: "Compounding Factors", value: "None", description: "No technical nursing, high behavior, or pressure risk", isMatch: true });
      return { classId: 2, path, compoundingFactors: [] };
    }
  } else if (mobilityScore >= 4 && mobilityScore <= 12) {
    path.push({ title: "Mobility", value: "Assisted", description: "RUG-ADL Mobility Score between 4 and 12", isMatch: true });
    
    // Cognition Branch (AFM Cognitive Sum: 5 items)
    const cogSum = assessment.afm.communication.comprehension + 
                   assessment.afm.communication.expression + 
                   assessment.afm.socialCognition.socialInteraction + 
                   assessment.afm.socialCognition.problemSolving + 
                   assessment.afm.socialCognition.memory;
    
    if (cogSum >= 23) {
      path.push({ title: "Cognition", value: "High", description: "AFM Cognitive Sum >= 23", isMatch: true });
      if (hasGeneralCompounding) {
        path.push({ title: "Compounding Factors", value: "Present", description: allCompounding.join(", "), isMatch: true });
        return { classId: 5, path, compoundingFactors: allCompounding };
      } else {
        path.push({ title: "Compounding Factors", value: "None", description: "No technical nursing, high behavior, or pressure risk", isMatch: true });
        return { classId: 4, path, compoundingFactors: [] };
      }
    } else if (cogSum >= 13 && cogSum <= 22) {
      path.push({ title: "Cognition", value: "Medium", description: "AFM Cognitive Sum between 13 and 22", isMatch: true });
      if (hasGeneralCompounding) {
        path.push({ title: "Compounding Factors", value: "Present", description: allCompounding.join(", "), isMatch: true });
        return { classId: 7, path, compoundingFactors: allCompounding };
      } else {
        path.push({ title: "Compounding Factors", value: "None", description: "No technical nursing, high behavior, or pressure risk", isMatch: true });
        return { classId: 6, path, compoundingFactors: [] };
      }
    } else {
      path.push({ title: "Cognition", value: "Low", description: "AFM Cognitive Sum <= 12", isMatch: true });
      return { classId: 8, path, compoundingFactors: allCompounding };
    }
  } else {
    path.push({ title: "Mobility", value: "Not Mobile", description: "RUG-ADL Mobility Score >= 13", isMatch: true });
    
    // Function Branch (AFM Motor Sum: 6 self-care items)
    const motorSum = assessment.afm.selfCare.eating + 
                     assessment.afm.selfCare.grooming + 
                     assessment.afm.selfCare.bathing + 
                     assessment.afm.selfCare.dressingUpper + 
                     assessment.afm.selfCare.dressingLower + 
                     assessment.afm.selfCare.toileting;

    if (motorSum >= 13) {
      path.push({ title: "Function", value: "Higher", description: "AFM Motor Sum >= 13", isMatch: true });
      if (hasGeneralCompounding) {
        path.push({ title: "Compounding Factors", value: "Present", description: allCompounding.join(", "), isMatch: true });
        return { classId: 10, path, compoundingFactors: allCompounding };
      } else {
        path.push({ title: "Compounding Factors", value: "None", description: "No technical nursing, high behavior, or pressure risk", isMatch: true });
        return { classId: 9, path, compoundingFactors: [] };
      }
    } else {
      path.push({ title: "Function", value: "Lower", description: "AFM Motor Sum <= 12", isMatch: true });
      
      // Pressure Sore Risk Branch (Primary split here)
      if (!isHighPressureRisk) {
        path.push({ title: "Pressure Sore Risk", value: "Lower", description: "Braden Scale > 12", isMatch: true });
        return { classId: 11, path, compoundingFactors: allCompounding };
      } else {
        path.push({ title: "Pressure Sore Risk", value: "Higher", description: "Braden Scale <= 12", isMatch: true });
        
        // Check for OTHER compounding factors (Nursing or Behaviour only)
        const otherCompounding = [...nursingFactors, ...behaviourFactors];
        if (otherCompounding.length > 0) {
          path.push({ title: "Other Compounding Factors", value: "Present", description: otherCompounding.join(", "), isMatch: true });
          return { classId: 13, path, compoundingFactors: otherCompounding };
        } else {
          path.push({ title: "Other Compounding Factors", value: "None", description: "No technical nursing or high behavior triggers", isMatch: true });
          return { classId: 12, path, compoundingFactors: [] };
        }
      }
    }
  }
}
