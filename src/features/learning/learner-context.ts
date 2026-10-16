import { createContext, useContext } from 'react';

export interface LearnerInfo { name: string; editProfile: () => void }

/** Provided by AppGate once a profile exists; null while the app is outside the signed-in area. */
export const LearnerContext = createContext<LearnerInfo | null>(null);
export function useLearner(): LearnerInfo | null { return useContext(LearnerContext); }
