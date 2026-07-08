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
import { CheckCircle, XCircle, MapPin, Calendar, ArrowRight, X, RotateCcw, Home, Share2 } from "lucide-react";
import { useFTUEFeature } from "@/hooks/useFTUE";

interface ResultsWalkthroughProps {
  onComplete?: () => void;
}

export function ResultsWalkthrough({ onComplete }: ResultsWalkthroughProps) {
  const { shouldShow, markSeen } = useFTUEFeature("hasSeenResultsWalkthrough");
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
      title: "Round Results",
      description: "After submitting your guess, you'll see a detailed breakdown of your performance.",
      content: (
        <div className="space-y-3">
          <div className="p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
              <span className="font-semibold text-green-900 dark:text-green-100">Location Guess</span>
            </div>
            <p className="text-sm text-green-700 dark:text-green-300">
              Shows distance from actual location and XP earned (0-100)
            </p>
          </div>
          <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <span className="font-semibold text-blue-900 dark:text-blue-100">Year Guess</span>
            </div>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              Shows year difference and XP earned (0-100)
            </p>
          </div>
          <div className="p-3 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-800">
            <div className="flex items-center gap-2 mb-2">
              <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
              <span className="font-semibold text-red-900 dark:text-red-100">Hint Penalties</span>
            </div>
            <p className="text-sm text-red-700 dark:text-red-300">
              Any accuracy/XP deductions from hints used
            </p>
          </div>
        </div>
      ),
    },
    {
      title: "Map Visualization",
      description: "The results screen includes an interactive map showing:",
      content: (
        <div className="space-y-3">
          <div className="relative h-32 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden">
            {/* Simulated map */}
            <div className="absolute inset-0 bg-blue-50 dark:bg-blue-950/30">
              {/* Grid */}
              <div className="absolute inset-0 opacity-20">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="absolute w-full border-t border-blue-300" style={{ top: `${25 * (i + 1)}%` }} />
                ))}
              </div>
              {/* Sample pins */}
              <div className="absolute top-1/3 left-1/4">
                <div className="relative">
                  <MapPin className="w-6 h-6 text-red-500 fill-red-500 drop-shadow-lg" />
                  <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-xs font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">
                    Your guess
                  </span>
                </div>
              </div>
              <div className="absolute bottom-1/3 right-1/4">
                <div className="relative">
                  <MapPin className="w-6 h-6 text-green-500 fill-green-500 drop-shadow-lg" />
                  <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-xs font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">
                    Actual
                  </span>
                </div>
              </div>
              {/* Connection line */}
              <svg className="absolute inset-0 pointer-events-none">
                <line
                  x1="25%"
                  y1="33%"
                  x2="75%"
                  y2="66%"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeDasharray="4 4"
                  className="text-gray-400"
                />
              </svg>
            </div>
          </div>
          <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
            <li className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <span>Your guess location (red pin)</span>
            </li>
            <li className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
              <span>Actual location (green pin)</span>
            </li>
            <li className="flex items-start gap-2">
              <ArrowRight className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
              <span>Distance line with km label</span>
            </li>
          </ul>
        </div>
      ),
    },
    {
      title: "Final Results",
      description: "After completing all 5 rounds, you'll see your game summary:",
      content: (
        <div className="space-y-3">
          <div className="p-4 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl text-white">
            <div className="text-center">
              <span className="text-3xl font-bold">842</span>
              <span className="text-sm opacity-80 ml-1">/ 1000 XP</span>
              <p className="text-sm opacity-90 mt-1">Total Score</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
              <span className="text-lg font-bold text-gray-900 dark:text-white">84%</span>
              <p className="text-xs text-gray-500">Avg Accuracy</p>
            </div>
            <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
              <span className="text-lg font-bold text-gray-900 dark:text-white">3</span>
              <p className="text-xs text-gray-500">Hints Used</p>
            </div>
          </div>
          <div className="flex items-center justify-around pt-2">
            <div className="flex flex-col items-center gap-1">
              <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                <RotateCcw className="w-5 h-5 text-orange-600 dark:text-orange-400" />
              </div>
              <span className="text-xs text-gray-500">Play Again</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                <Home className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </div>
              <span className="text-xs text-gray-500">Home</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Share2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <span className="text-xs text-gray-500">Share</span>
            </div>
          </div>
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
            <div className="px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-teal-500/10 flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-teal-500" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-gray-900 dark:text-white">
                      Results Guide
                    </h3>
                    <div className="flex items-center gap-1 mt-0.5">
                      {steps.map((_, i) => (
                        <div
                          key={i}
                          className={`h-1 rounded-full transition-all duration-300 ${
                            i === currentStep
                              ? "w-4 bg-teal-500"
                              : i < currentStep
                              ? "w-1 bg-teal-300"
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
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-1">
                    {steps[currentStep].title}
                  </h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    {steps[currentStep].description}
                  </p>
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
                    className="flex items-center gap-2 px-6 py-2.5 bg-teal-500 hover:bg-teal-600 text-white rounded-xl font-semibold text-sm transition-colors"
                  >
                    Next
                    <ArrowRight className="w-4 h-4" />
                  </motion.button>
                ) : (
                  <motion.button
                    onClick={handleDismiss}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex items-center gap-2 px-6 py-2.5 bg-teal-500 hover:bg-teal-600 text-white rounded-xl font-semibold text-sm transition-colors"
                  >
                    Ready to Play!
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
