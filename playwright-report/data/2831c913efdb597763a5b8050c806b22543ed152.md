# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: multiplayer-simulation.spec.ts >> Multiplayer Simulation >> 6 players, 3 games, 5 rounds each, full edge-case suite
- Location: scripts/test/playwright/specs/multiplayer-simulation.spec.ts:16:7

# Error details

```
Test timeout of 60000ms exceeded.
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - generic [ref=e5]:
      - img "Guess-History" [ref=e7]
      - button "--% | --XP" [ref=e8] [cursor=pointer]:
        - generic [ref=e9]: "--%"
        - generic [ref=e10]: "|"
        - generic [ref=e11]: "--XP"
      - generic [ref=e12]:
        - button [ref=e14] [cursor=pointer]:
          - img [ref=e15]
        - button [ref=e18] [cursor=pointer]
    - generic [ref=e19]:
      - generic [ref=e20]: Where and when did it happen?
      - generic [ref=e21]:
        - generic [ref=e23]:
          - generic [ref=e24]:
            - generic [ref=e26]:
              - heading "CHALLENGE FRIENDS" [level=2] [ref=e27]
              - paragraph [ref=e29]:
                - generic [ref=e30]: Play against your friends.
                - generic [ref=e31]: "Real-Time: Up to 5 mins"
                - text: "Turn-Based: Up to 14 days"
            - generic [ref=e32]:
              - generic [ref=e33]:
                - button "INVITATIONS" [ref=e34] [cursor=pointer]
                - button "YOUR TURN" [ref=e35] [cursor=pointer]
                - button "COMPLETED" [ref=e36] [cursor=pointer]
              - generic [ref=e37]:
                - img [ref=e39]
                - generic [ref=e42]: No pending invitations
            - generic [ref=e43]:
              - button "JOIN GAME" [ref=e44] [cursor=pointer]:
                - img [ref=e45]
                - text: JOIN GAME
              - button "CREATE GAME" [ref=e49] [cursor=pointer]:
                - img [ref=e50]
                - text: CREATE GAME
          - generic:
            - img "CHALLENGE"
        - generic [ref=e53]:
          - generic [ref=e54]:
            - generic [ref=e56]:
              - heading "DAILY COMPETITION" [level=2] [ref=e57]
              - paragraph [ref=e59]:
                - generic [ref=e60]: A new challenge every day.
                - generic [ref=e61]: Same events for everyone.
                - text: Climb the leaderboard.
            - generic [ref=e63]:
              - img [ref=e64]
              - generic [ref=e67]: New challenge in 16h 58m
          - generic:
            - img "DAILY"
        - generic [ref=e69]:
          - generic [ref=e72]:
            - heading "PROGRESSIVE RUNS" [level=2] [ref=e73]
            - paragraph [ref=e75]:
              - generic [ref=e76]: Beat levels and earn XP.
              - generic [ref=e77]: Progressive difficulty from 1 to 100.
              - text: Unlock new challenges.
          - generic:
            - img "LEVEL UP"
        - generic [ref=e79]:
          - generic [ref=e82]:
            - heading "SOLO WARM-UP" [level=2] [ref=e83]
            - paragraph [ref=e85]:
              - generic [ref=e86]: Hone your skills solo.
              - generic [ref=e87]: Custom timer and year range.
              - text: Unlimited practice games.
          - generic:
            - img "PRACTICE"
  - alert [ref=e88]
```