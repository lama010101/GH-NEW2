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

import { motion, AnimatePresence } from "framer-motion";
import { Trophy, MapPin, Calendar, Minus, X, Star, Target } from "lucide-react";
import { useFTUEFeature } from "@/hooks/useFTUE";

interface ScoringExplainerProps {
  onComplete?: () => void;
}

export function ScoringExplainer({ onComplete }: ScoringExplainerProps) {
  const { shouldShow, markSeen } = useFTUEFeature("hasSeenScoringExplanation");
  const [isVisible, setIsVisible] = useState(false);
  const [animatedScore, setAnimatedScore] = useState(0);

  useEffect(() => {
    if (shouldShow) {
      const timer = setTimeout(() => setIsVisible(true), 500);
      return () => clearTimeout(timer);
    }
  }, [shouldShow]);

  useEffect(() => {
    if (isVisible) {
      // Animate the score counter
      const duration = 2000;
      const steps = 60;
      const increment = 177 / steps;
      let current = 0;
      
      const interval = setInterval(() => {
        current += increment;
        if (current >= 177) {
          setAnimatedScore(177);
          clearInterval(interval);
        } else {
          setAnimatedScore(Math.floor(current));
        }
      }, duration / steps);

      return () => clearInterval(interval);
    }
  }, [isVisible]);

  const handleDismiss = () => {
    markSeen();
    setIsVisible(false);
    onComplete?.();
  };

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
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                    <Trophy className="w-5 h-5 text-purple-500" />
                  </div>
                  <h3 className="font-bold text-lg text-gray-900 dark:text-white">
                    How Scoring Works
                  </h3>
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
            <div className="p-6">
              {/* Animated score example */}
              <div className="mb-6 text-center">
                <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 shadow-lg shadow-purple-500/30">
                  <div className="text-center">
                    <span className="block text-3xl font-bold text-white">
                      {animatedScore}
                    </span>
                    <span className="text-xs text-white/80">points</span>
                  </div>
                </div>
                <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                  Maximum possible: 200 points per round
                </p>
              </div>

              {/* Score breakdown */}
              <div className="space-y-3 mb-6">
                <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-950/30 rounded-lg">
                  <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center shrink-0">
                    <MapPin className="w-5 h-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm text-gray-900 dark:text-white">
                        Location Accuracy
                      </p>
                      <span className="text-sm font-bold text-green-600 dark:text-green-400">
                        +85 XP
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      245 km from actual location
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0">
                    <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm text-gray-900 dark:text-white">
                        Year Accuracy
                      </p>
                      <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                        +92 XP
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      8 years difference
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-950/30 rounded-lg">
                  <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center shrink-0">
                    <Minus className="w-5 h-5 text-red-600 dark:text-red-400" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm text-gray-900 dark:text-white">
                        Hint Penalty
                      </p>
                      <span className="text-sm font-bold text-red-600 dark:text-red-400">
                        -0 XP
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      No hints used
                    </p>
                  </div>
                </div>

                {/* Total */}
                <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
                  <span className="font-semibold text-gray-900 dark:text-white">
                    Final Score
                  </span>
                  <span className="text-xl font-bold text-purple-600 dark:text-purple-400">
                    177 XP
                  </span>
                </div>
              </div>

              {/* Accuracy info */}
              <div className="flex items-start gap-3 p-3 bg-yellow-50 dark:bg-yellow-950/30 rounded-lg mb-4">
                <Target className="w-5 h-5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-sm text-gray-900 dark:text-white">
                    Accuracy Percentage
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    Your accuracy is calculated from both location and year guesses, minus any hint penalties.
                  </p>
                </div>
              </div>

              {/* CTA */}
              <motion.button
                onClick={handleDismiss}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full py-3 bg-purple-500 hover:bg-purple-600 text-white rounded-xl font-semibold transition-colors"
              >
                Ready to Play!
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
