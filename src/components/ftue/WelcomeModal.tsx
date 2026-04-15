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
import { useEffect, useState } from "react";
import { MapPin, Clock, Lightbulb, Trophy, ArrowRight, X } from "lucide-react";
import { useFTUEFeature } from "@/hooks/useFTUE";

interface WelcomeModalProps {
  onComplete?: () => void;
  onSkip?: () => void;
}

const slides = [
  {
    icon: MapPin,
    title: "Welcome to Guess History",
    description:
      "Test your knowledge of history and geography! Place pins on the map and guess the year of historical events.",
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
  },
  {
    icon: Clock,
    title: "Two Challenges in One",
    description:
      "Each round tests both your spatial awareness (WHERE did it happen?) and historical knowledge (WHEN did it happen?).",
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
  },
  {
    icon: Lightbulb,
    title: "Hints Available",
    description:
      "Stuck? Use hints to get closer to the answer. But be careful—hints reduce your final score!",
    color: "text-yellow-500",
    bgColor: "bg-yellow-500/10",
  },
  {
    icon: Trophy,
    title: "Earn Points & Badges",
    description:
      "Score up to 200 points per round (100 for location, 100 for year). Complete rounds to earn badges and climb the leaderboard!",
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
  },
];

export function WelcomeModal({ onComplete, onSkip }: WelcomeModalProps) {
  const { shouldShow, markSeen } = useFTUEFeature("hasSeenWelcome");
  const [isVisible, setIsVisible] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [direction, setDirection] = useState(0);

  useEffect(() => {
    // Delay showing to allow page to settle
    if (shouldShow) {
      const timer = setTimeout(() => setIsVisible(true), 500);
      return () => clearTimeout(timer);
    }
  }, [shouldShow]);

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      setDirection(1);
      setCurrentSlide((prev) => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrev = () => {
    if (currentSlide > 0) {
      setDirection(-1);
      setCurrentSlide((prev) => prev - 1);
    }
  };

  const handleComplete = () => {
    markSeen();
    setIsVisible(false);
    onComplete?.();
  };

  const handleSkip = () => {
    markSeen();
    setIsVisible(false);
    onSkip?.();
  };

  const slide = slides[currentSlide];
  const Icon = slide.icon;
  const isLastSlide = currentSlide === slides.length - 1;
  const isFirstSlide = currentSlide === 0;

  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 300 : -300,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction < 0 ? 300 : -300,
      opacity: 0,
    }),
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleSkip();
          }}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={handleSkip}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors z-10"
              aria-label="Skip tutorial"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>

            {/* Progress indicators */}
            <div className="absolute top-4 left-4 flex gap-1.5">
              {slides.map((_, index) => (
                <div
                  key={index}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    index === currentSlide
                      ? "w-8 bg-orange-500"
                      : index < currentSlide
                      ? "w-1.5 bg-orange-300"
                      : "w-1.5 bg-gray-200 dark:bg-gray-700"
                  }`}
                />
              ))}
            </div>

            {/* Content */}
            <div className="pt-12 pb-8 px-8 min-h-[400px] flex flex-col">
              <AnimatePresence mode="wait" custom={direction}>
                <motion.div
                  key={currentSlide}
                  custom={direction}
                  variants={variants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ type: "spring", damping: 25, stiffness: 200 }}
                  className="flex-1 flex flex-col items-center text-center"
                >
                  {/* Icon */}
                  <div
                    className={`w-24 h-24 rounded-2xl ${slide.bgColor} flex items-center justify-center mb-6`}
                  >
                    <Icon className={`w-12 h-12 ${slide.color}`} />
                  </div>

                  {/* Title */}
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                    {slide.title}
                  </h2>

                  {/* Description */}
                  <p className="text-gray-600 dark:text-gray-300 text-lg leading-relaxed max-w-sm">
                    {slide.description}
                  </p>
                </motion.div>
              </AnimatePresence>

              {/* Navigation */}
              <div className="mt-8 flex items-center justify-between gap-4">
                {/* Previous button */}
                <button
                  onClick={handlePrev}
                  disabled={isFirstSlide}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    isFirstSlide
                      ? "opacity-0 pointer-events-none"
                      : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  Back
                </button>

                {/* Next/Complete button */}
                <motion.button
                  onClick={handleNext}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex items-center gap-2 px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-semibold transition-colors shadow-lg shadow-orange-500/25"
                >
                  {isLastSlide ? (
                    <>Get Started</>
                  ) : (
                    <>
                      Next
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </motion.button>
              </div>

              {/* Skip option */}
              {!isLastSlide && (
                <button
                  onClick={handleSkip}
                  className="mt-4 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  Skip tutorial
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
