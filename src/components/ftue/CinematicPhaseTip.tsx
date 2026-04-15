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
import { Maximize2, Minimize2, MoveHorizontal, X, Play, Hand } from "lucide-react";
import { useFTUEFeature } from "@/hooks/useFTUE";

interface CinematicPhaseTipProps {
  onComplete?: () => void;
}

export function CinematicPhaseTip({ onComplete }: CinematicPhaseTipProps) {
  const { shouldShow, markSeen } = useFTUEFeature("hasSeenCinematicTip");
  const [isVisible, setIsVisible] = useState(false);

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
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                    <Play className="w-5 h-5 text-indigo-500" />
                  </div>
                  <h3 className="font-bold text-lg text-gray-900 dark:text-white">
                    Cinematic View
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
              {/* Cinematic demo */}
              <div className="relative h-40 bg-gray-900 rounded-xl overflow-hidden mb-6">
                {/* Simulated image */}
                <div className="absolute inset-0 bg-gradient-to-br from-gray-700 to-gray-800">
                  {/* Grid pattern to simulate image content */}
                  <div className="absolute inset-0 opacity-30">
                    {[...Array(8)].map((_, i) => (
                      <div
                        key={`h-${i}`}
                        className="absolute w-full border-t border-gray-600"
                        style={{ top: `${12.5 * (i + 1)}%` }}
                      />
                    ))}
                  </div>
                </div>

                {/* Auto-pan animation */}
                <motion.div
                  className="absolute inset-0"
                  initial={{ x: "0%" }}
                  animate={{ x: "-20%" }}
                  transition={{
                    duration: 5,
                    ease: "linear",
                    repeat: Infinity,
                    repeatType: "reverse",
                  }}
                >
                  <div className="w-[140%] h-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                </motion.div>

                {/* Center icon */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <motion.div
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center"
                  >
                    <MoveHorizontal className="w-6 h-6 text-white" />
                  </motion.div>
                </div>

                {/* Timer badge */}
                <div className="absolute top-3 right-3 px-2 py-1 bg-black/50 backdrop-blur-sm rounded-md">
                  <span className="text-xs font-mono text-white">0:05</span>
                </div>

                {/* Exit button demo */}
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
                  <motion.div
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="px-3 py-1.5 bg-orange-500 text-white text-xs font-medium rounded-full flex items-center gap-1.5 shadow-lg"
                  >
                    <Minimize2 className="w-3 h-3" />
                    Exit
                  </motion.div>
                </div>
              </div>

              {/* Feature list */}
              <div className="space-y-3 mb-6">
                <div className="flex items-start gap-3 p-3 bg-indigo-50 dark:bg-indigo-950/30 rounded-lg">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center shrink-0">
                    <MoveHorizontal className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div>
                    <p className="font-medium text-sm text-gray-900 dark:text-white">
                      Auto-Pan Feature
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      The image slowly pans left to right over 5 seconds, giving you a cinematic view.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <div className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center shrink-0">
                    <Hand className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  </div>
                  <div>
                    <p className="font-medium text-sm text-gray-900 dark:text-white">
                      Interactive Control
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Tap anywhere to interrupt the pan and manually explore the image.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-orange-50 dark:bg-orange-950/30 rounded-lg">
                  <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center shrink-0">
                    <Maximize2 className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <p className="font-medium text-sm text-gray-900 dark:text-white">
                      Fullscreen Mode
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Press the Exit button (pulsing at bottom) to proceed to guessing.
                    </p>
                  </div>
                </div>
              </div>

              {/* Tip */}
              <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg mb-4">
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  <span className="font-semibold">Tip:</span> Study the image carefully during the cinematic phase—every detail can help you guess better!
                </p>
              </div>

              {/* CTA */}
              <motion.button
                onClick={handleDismiss}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl font-semibold transition-colors"
              >
                Got it!
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
