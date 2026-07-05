"use client";

/**
 * Stock image paths for each era/region id.
 * Used as the image source for era/region buttons in Compete lobby and Practice settings.
 */

export const ERA_STOCK_IMAGES: Record<string, string> = {
  ancient: "/images/era-region/ancient.jpg",
  medieval: "/images/era-region/medieval.jpg",
  earlymodern: "/images/era-region/earlymodern.jpg",
  modern: "/images/era-region/modern.jpg",
  contemporary: "/images/era-region/contemporary.jpg",
};

export const REGION_STOCK_IMAGES: Record<string, string> = {
  africa: "/images/era-region/africa.jpg",
  asia: "/images/era-region/asia.jpg",
  europe: "/images/era-region/europe.jpg",
  north_america: "/images/era-region/north_america.jpg",
  south_america: "/images/era-region/south_america.jpg",
  oceania_antarctica: "/images/era-region/oceania_antarctica.jpg",
};
