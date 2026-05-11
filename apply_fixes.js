const fs = require('fs');

let content = fs.readFileSync('src/app/compete/[gameId]/page.tsx', 'utf8');

// Fix 1: WHERE card - move whereExpanded wrapper to only wrap leaderboard rows
// Remove opening wrapper
content = content.replace(
  /                    \{whereExpanded && \(\s*<>/g,
  '                    {submittedHintPenaltyRef.current.accPenalty > 0 && ('
);

// Remove closing wrapper and add new wrapper around leaderboard
content = content.replace(
  /                          \}\)\n                        <\/div>\n                      <\/>\n                    \)\}/g,
  '                          })}\n                        </div>\n                    {whereExpanded && (\n                      <div style={{ marginTop: 12 }}>'
);

// Add closing for whereExpanded wrapper around leaderboard
content = content.replace(
  /                          \}\)\n                        <\/div>\n                  <\/div>\n                  \{\/\* WHEN CARD \*\/\}/g,
  '                          })}\n                        </div>\n                    )}\n                  </div>\n                  {/* WHEN CARD */}'
);

// Fix 1: WHEN card - move whenExpanded wrapper to only wrap leaderboard rows
// Remove opening wrapper
content = content.replace(
  /                    \{whenExpanded && \(\s*<>/g,
  '                    {submittedHintPenaltyRef.current.whenAccPenalty > 0 && ('
);

// Remove closing wrapper and add new wrapper around leaderboard
content = content.replace(
  /                          \}\)\n                        <\/div>\n                      <\/>\n                    \)\}/g,
  '                          })}\n                        </div>\n                    {whenExpanded && (\n                      <div>'
);

// Add closing for whenExpanded wrapper around leaderboard
content = content.replace(
  /                          \}\)\n                        <\/div>\n                  <\/div>\n                  <\/div>\n                  \{\/\* HINTS USED CARD \*\/\}/g,
  '                          })}\n                        </div>\n                    )}\n                  </div>\n                  </div>\n                  {/* HINTS USED CARD */}'
);

// Fix 2: Year timeline - replace hardcoded range with dynamic range
content = content.replace(
  /const timelineMin = Math\.max\(0, correctYear - 150\);/g,
  'const allYears = [correctYear, ...whenRows.map(r => r.guessYear).filter((y): y is number => y != null)]; const maxDelta = allYears.reduce((max, y) => Math.max(max, Math.abs(y - correctYear)), 0); const minSpread = maxDelta === 0 ? 20 : maxDelta; const padding = Math.max(10, Math.ceil(minSpread / 10) * 10 - minSpread + 10); const timelineMin = Math.floor((Math.min(...allYears) - padding) / 10) * 10;'
);

content = content.replace(
  /const timelineMax = correctYear \+ 150;/g,
  'const timelineMax = Math.ceil((Math.max(...allYears) + padding) / 10) * 10;'
);

// Fix 2: Add decade tick marks
const tickMarks = `                          {/* Decade tick marks */}
                          {(() => {
                            const ticks: { year: number; isMajor: boolean; xPercent: number }[] = [];
                            for (let year = timelineMin; year <= timelineMax; year += 10) {
                              const xPercent = ((year - timelineMin) / timelineRange) * 100;
                              ticks.push({ year, isMajor: year % 50 === 0, xPercent });
                            }
                            return ticks.map((tick) => {
                              const isNearCorrect = Math.abs(tick.xPercent - 50) < 8;
                              return (
                                <div key={tick.year} style={{
                                  position: "absolute",
                                  top: "50%",
                                  left: \`\${tick.xPercent}%\`,
                                  width: 1,
                                  height: tick.isMajor ? 10 : 6,
                                  background: "#444",
                                  transform: "translateY(-50%)",
                                }}>
                                  {tick.isMajor && !isNearCorrect && (
                                    <div style={{
                                      position: "absolute",
                                      top: 14,
                                      left: "50%",
                                      transform: "translateX(-50%)",
                                      fontSize: 8,
                                      color: "#555",
                                      whiteSpace: "nowrap",
                                    }}>
                                      {tick.year}
                                    </div>
                                  )}
                                </div>
                              );
                            });
                          })()}`;

content = content.replace(
  '                          {/* Correct year marker */}',
  tickMarks + '\n                          {/* Correct year marker */}'
);

fs.writeFileSync('src/app/compete/[gameId]/page.tsx', content, 'utf8');
console.log('All fixes applied');
