# Acceptance Test

Initial:
{ "rounds": {} }

Steps:
1. startRound(1, 50)
2. submitGuess(1, 40)
3. completeRound(1, "LOW")

Expected:
{
  "rounds": {
    "1": {
      "target": 50,
      "guess": 40,
      "result": "LOW",
      "diff": 10,
      "completed": true
    }
  }
}
