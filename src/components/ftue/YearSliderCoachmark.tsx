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
import { Calendar, GripHorizontal, SlidersHorizontal, X, ArrowLeftRight } from "lucide-react";
import { useFTUEFeature } from "@/hooks/useFTUE";

interface YearSliderCoachmarkProps {
  onComplete?: () => void;
}

export function YearSliderCoachmark({ onComplete }: YearSliderCoachmarkProps) {
  const { shouldShow, markSeen } = useFTUEFeature("hasSeenYearSliderTutorial");
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
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-blue-500" />
                  </div>
                  <h3 className="font-bold text-lg text-gray-900 dark:text-white">
                    Guess the Year
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
              {/* Slider demo */}
              <div className="mb-6 bg-gray-50 dark:bg-gray-800/50 rounded-xl p-6">
                {/* Scale indicator */}
                <div className="flex items-center justify-center gap-2 mb-4">
                  <SlidersHorizontal className="w-4 h-4 text-gray-400" />
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Century View
                  </span>
                </div>

                {/* Animated slider */}
                <div className="relative">
                  {/* Track */}
                  <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-blue-500 rounded-full"
                      initial={{ width: "0%" }}
                      animate={{ width: "60%" }}
                      transition={{
                        duration: 1.5,
                        ease: "easeInOut",
                        repeat: Infinity,
                        repeatType: "reverse",
                      }}
                    />
                  </div>

                  {/* Thumb */}
                  <motion.div
                    className="absolute top-1/2 -translate-y-1/2 w-6 h-6 bg-white dark:bg-gray-700 rounded-full shadow-lg border-2 border-blue-500 flex items-center justify-center"
                    initial={{ left: "0%" }}
                    animate={{ left: "60%" }}
                    transition={{
                      duration: 1.5,
                      ease: "easeInOut",
                      repeat: Infinity,
                      repeatType: "reverse",
                    }}
                  >
                    <GripHorizontal className="w-3 h-3 text-blue-500" />
                  </motion.div>

                  {/* Year display */}
                  <motion.div
                    className="absolute -top-8 left-1/2 -translate-x-1/2"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                  >
                    <div className="bg-blue-500 text-white px-3 py-1 rounded-lg text-sm font-bold shadow-lg">
                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.8 }}
                      >
                        1964
                      </motion.span>
                    </div>
                  </motion.div>
                </div>

                {/* Scale toggle demo */}
                <div className="flex items-center justify-center gap-2 mt-6">
                  <button className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                    CENTURY
                  </button>
                  <button className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-500 text-white">
                    DECADE
                  </button>
                  <button className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                    YEAR
                  </button>
                </div>
              </div>

              {/* Instructions */}
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-semibold shrink-0 mt-0.5">
                    1
                  </div>
                  <div>
                    <p className="text-gray-900 dark:text-white font-medium text-sm">
                      Drag the slider to select a year
                    </p>
                    <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">
                      Or tap on the track to jump
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-semibold shrink-0 mt-0.5">
                    2
                  </div>
                  <div>
                    <p className="text-gray-900 dark:text-white font-medium text-sm">
                      Switch precision modes
                    </p>
                    <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">
                      Century → Decade → Year for fine-tuning
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-semibold shrink-0 mt-0.5">
                    3
                  </div>
                  <div>
                    <p className="text-gray-900 dark:text-white font-medium text-sm">
                      Swipe horizontally to switch
                    </p>
                    <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">
                      Quick gesture to change precision
                    </p>
                  </div>
                </div>
              </div>

              {/* Scale explanation */}
              <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                <div className="flex items-start gap-2">
                  <ArrowLeftRight className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    <span className="font-semibold">Tip:</span> Start with Century view for rough estimates, then switch to Year for precision.
                  </p>
                </div>
              </div>

              {/* CTA */}
              <motion.button
                onClick={handleDismiss}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="mt-5 w-full py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-semibold transition-colors"
              >
                Try it out!
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
