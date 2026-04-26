/**
 * ⚠️ FTUE SYSTEM — DISABLED / NOT IN USE
 *
 * This system is intentionally NOT integrated.
 *
 * DO NOT:
 * - Use in multiplayer
 * - Mount during active rounds
 * - Connect to game phase or timers
 * - Block user interaction
 *
 * Any future integration must respect server-authoritative architecture.
 */

"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lightbulb, AlertTriangle, X, ChevronRight, Lock } from "lucide-react";
import { useFTUEFeature } from "@/hooks/useFTUE";

interface HintSystemTutorialProps {
  onComplete?: () => void;
}

const hintExamples = [
  {
    name: "Remote Landmark",
    description: "Distance to nearest major landmark",
    cost: "-15% accuracy",
    locked: false,
  },
  {
    name: "Decade Range",
    description: "Reveals which decade the event occurred",
    cost: "-20% accuracy",
    locked: false,
  },
  {
    name: "Precise Distance",
    description: "Exact km to location",
    cost: "-25% accuracy",
    locked: true,
    requires: "Remote Landmark",
  },
];

export function HintSystemTutorial({ onComplete }: HintSystemTutorialProps) {
  const { shouldShow, markSeen } = useFTUEFeature("hasSeenHintTutorial");
  const [isVisible, setIsVisible] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    if (shouldShow) {
      const timer = setTimeout(() => setIsVisible(true), 500);
      return () => clearTimeout(timer);
    }
  }, [shouldShow]);

  const handleDismiss = () => {
    markSeen();
    setIsVisible(false);
    onComplete?.();
  };

  const steps = [
    {
      title: "Hints Help You Guess",
      content: (
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
            Stuck on a difficult image? Purchase hints to get closer to the answer. Each hint reveals valuable information about the location or year.
          </p>
          <div className="bg-yellow-50 dark:bg-yellow-950/30 rounded-lg p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-700 dark:text-yellow-300">
              <span className="font-semibold">Important:</span> Hints reduce your final score. Use them wisely!
            </p>
          </div>
        </div>
      ),
    },
    {
      title: "Hint Types",
      content: (
        <div className="space-y-2">
          {hintExamples.map((hint, index) => (
            <motion.div
              key={hint.name}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`p-3 rounded-lg border ${
                hint.locked
                  ? "bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700"
                  : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-2">
                  {hint.locked ? (
                    <Lock className="w-4 h-4 text-gray-400 mt-0.5" />
                  ) : (
                    <Lightbulb className="w-4 h-4 text-yellow-500 mt-0.5" />
                  )}
                  <div>
                    <p className={`font-medium text-sm ${hint.locked ? "text-gray-500" : "text-gray-900 dark:text-white"}`}>
                      {hint.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {hint.description}
                    </p>
                  </div>
                </div>
                <span className="text-xs font-medium text-red-500 shrink-0">
                  {hint.cost}
                </span>
              </div>
              {hint.requires && (
                <p className="text-xs text-gray-400 mt-1 ml-6">
                  Requires: {hint.requires}
                </p>
              )}
            </motion.div>
          ))}
        </div>
      ),
    },
    {
      title: "Dependency System",
      content: (
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
            Some hints have dependencies. You must purchase basic hints before unlocking advanced ones.
          </p>
          <div className="flex items-center justify-center gap-2 py-2">
            <div className="px-3 py-1.5 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg text-xs font-medium text-yellow-700 dark:text-yellow-300">
              Basic Hint
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400" />
            <div className="px-3 py-1.5 bg-yellow-200 dark:bg-yellow-800/50 rounded-lg text-xs font-medium text-yellow-800 dark:text-yellow-200">
              Advanced Hint
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            Example: Buy &quot;Remote Landmark&quot; to unlock &quot;Precise Distance&quot;
          </p>
        </div>
      ),
    },
  ];

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleDismiss();
          }}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 pt-6 pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center">
                    <Lightbulb className="w-5 h-5 text-yellow-500" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-gray-900 dark:text-white">
                      Hint System
                    </h3>
                    <div className="flex items-center gap-1 mt-0.5">
                      {steps.map((_, i) => (
                        <div
                          key={i}
                          className={`h-1 rounded-full transition-all duration-300 ${
                            i === currentStep
                              ? "w-4 bg-yellow-500"
                              : i < currentStep
                              ? "w-1 bg-yellow-300"
                              : "w-1 bg-gray-200 dark:bg-gray-700"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleDismiss}
                  className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="px-6 pb-6">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStep}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                >
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-3">
                    {steps[currentStep].title}
                  </h4>
                  {steps[currentStep].content}
                </motion.div>
              </AnimatePresence>

              {/* Navigation */}
              <div className="flex items-center justify-between mt-6">
                <button
                  onClick={() => setCurrentStep((prev) => Math.max(0, prev - 1))}
                  disabled={currentStep === 0}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    currentStep === 0
                      ? "opacity-0 pointer-events-none"
                      : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  }`}
                >
                  Back
                </button>

                {currentStep < steps.length - 1 ? (
                  <motion.button
                    onClick={() => setCurrentStep((prev) => prev + 1)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex items-center gap-2 px-6 py-2.5 bg-yellow-500 hover:bg-yellow-600 text-white rounded-xl font-semibold text-sm transition-colors"
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </motion.button>
                ) : (
                  <motion.button
                    onClick={handleDismiss}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex items-center gap-2 px-6 py-2.5 bg-yellow-500 hover:bg-yellow-600 text-white rounded-xl font-semibold text-sm transition-colors"
                  >
                    Got it!
                  </motion.button>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
