"use client";

import React from "react";

interface WhereIconProps {
  size?: number | string;
  className?: string;
  style?: React.CSSProperties;
  strokeWidth?: number;
}

export default function WhereIcon({ size = 24, className, style, strokeWidth = 1.5 }: WhereIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
    >
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
