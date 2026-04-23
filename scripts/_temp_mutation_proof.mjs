function deepFreeze(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  }
  return obj;
}

const snapshot = deepFreeze({ a: 1, b: { c: 2 } });
try {
  snapshot.test = 1;
  console.log("MUTATION SUCCEEDED");
} catch {
  console.log("MUTATION BLOCKED");
}
try {
  snapshot.b.c = 3;
  console.log("DEEP MUTATION SUCCEEDED");
} catch {
  console.log("DEEP MUTATION BLOCKED");
}
