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
import { MapPin, MousePointer, X, Navigation } from "lucide-react";
import { useFTUEFeature } from "@/hooks/useFTUE";

interface MapTutorialCoachmarkProps {
  targetRef?: React.RefObject<HTMLElement>;
  onComplete?: () => void;
}

export function MapTutorialCoachmark({ targetRef, onComplete }: MapTutorialCoachmarkProps) {
  const { shouldShow, markSeen } = useFTUEFeature("hasSeenMapTutorial");
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (shouldShow) {
      const timer = setTimeout(() => setIsVisible(true), 1000);
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
        <>
          {/* Backdrop highlight */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 pointer-events-none"
          >
            <div className="absolute inset-0 bg-black/40" />
            {/* Spotlight effect around map area - simplified as center highlight */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-transparent ring-4 ring-orange-500/50 shadow-[0_0_100px_rgba(249,115,22,0.3)]" />
          </motion.div>

          {/* Coachmark card */}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm"
          >
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 m-4">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
                    <MapPin className="w-5 h-5 text-orange-500" />
                  </div>
                  <h3 className="font-bold text-lg text-gray-900 dark:text-white">
                    Place Your Guess
                  </h3>
                </div>
                <button
                  onClick={handleDismiss}
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>

              {/* Animation demo */}
              <div className="relative h-32 bg-gray-100 dark:bg-gray-800 rounded-xl mb-4 overflow-hidden">
                <motion.div
                  className="absolute inset-0 flex items-center justify-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  {/* Map background representation */}
                  <div className="w-full h-full bg-blue-50 dark:bg-blue-950/30 relative">
                    {/* Grid pattern */}
                    <div className="absolute inset-0 opacity-20">
                      {[...Array(5)].map((_, i) => (
                        <div
                          key={`h-${i}`}
                          className="absolute w-full border-t border-blue-300 dark:border-blue-700"
                          style={{ top: `${20 * (i + 1)}%` }}
                        />
                      ))}
                      {[...Array(5)].map((_, i) => (
                        <div
                          key={`v-${i}`}
                          className="absolute h-full border-l border-blue-300 dark:border-blue-700"
                          style={{ left: `${20 * (i + 1)}%` }}
                        />
                      ))}
                    </div>

                    {/* Animated pin placement */}
                    <motion.div
                      className="absolute"
                      initial={{ top: "30%", left: "40%", scale: 0 }}
                      animate={{ scale: [0, 1.2, 1] }}
                      transition={{
                        delay: 0.5,
                        duration: 0.5,
                        ease: "easeOut",
                      }}
                    >
                      <MapPin className="w-8 h-8 text-red-500 fill-red-500 drop-shadow-lg" />
                    </motion.div>

                    {/* Click indicator */}
                    <motion.div
                      className="absolute top-[30%] left-[40%]"
                      initial={{ scale: 0, opacity: 1 }}
                      animate={{ scale: 2, opacity: 0 }}
                      transition={{
                        delay: 0.3,
                        duration: 0.6,
                        repeat: Infinity,
                        repeatDelay: 1,
                      }}
                    >
                      <div className="w-8 h-8 rounded-full border-2 border-orange-500" />
                    </motion.div>
                  </div>
                </motion.div>

                {/* Mouse cursor */}
                <motion.div
                  className="absolute"
                  initial={{ top: "60%", left: "20%" }}
                  animate={{ top: "30%", left: "40%" }}
                  transition={{
                    delay: 0.2,
                    duration: 0.8,
                    ease: "easeInOut",
                  }}
                >
                  <MousePointer className="w-6 h-6 text-gray-700 dark:text-gray-300 drop-shadow-md" />
                </motion.div>
              </div>

              {/* Instructions */}
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-orange-500 text-white flex items-center justify-center text-sm font-semibold shrink-0 mt-0.5">
                    1
                  </div>
                  <p className="text-gray-600 dark:text-gray-300 text-sm">
                    Click anywhere on the map to place your pin
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-orange-500 text-white flex items-center justify-center text-sm font-semibold shrink-0 mt-0.5">
                    2
                  </div>
                  <p className="text-gray-600 dark:text-gray-300 text-sm">
                    Drag to pan, scroll to zoom
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-orange-500 text-white flex items-center justify-center text-sm font-semibold shrink-0 mt-0.5">
                    3
                  </div>
                  <p className="text-gray-600 dark:text-gray-300 text-sm">
                    Click again to move your pin
                  </p>
                </div>
              </div>

              {/* Pro tip */}
              <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg flex items-start gap-2">
                <Navigation className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  <span className="font-semibold">Pro tip:</span> Use the search bar to quickly jump to regions you know!
                </p>
              </div>

              {/* CTA */}
              <motion.button
                onClick={handleDismiss}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="mt-4 w-full py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-semibold transition-colors"
              >
                Got it!
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
