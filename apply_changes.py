#!/usr/bin/env python3
import re

# Read file
with open('src/components/compete/LobbySection.tsx', 'r') as f:
    content = f.read()

# Change 2: Replace header
old_header = """{/* Title Bar */}
      <div className={styles['lobby-title-bar']}>
        <button className={styles['lobby-back-btn']} onClick={() => router.push("/")}>
          ←
        </button>
        <div className={styles['lobby-title-center']}>
          <span className={styles['lobby-title-text']}>Compete</span>
          <span className={styles['lobby-status-line']}>
            <span
              className={styles['lobby-connection-dot']}
              style={{
                background: isConnected ? "#22d3ee" : "#ef4444",
                boxShadow: isConnected
                  ? "0 0 6px rgba(34,211,238,0.5)"
                  : "0 0 6px rgba(239,68,68,0.4)",
              }}
            />
            Room {roomCode} · Status: {sessionStatus}
          </span>
        </div>
        <span className={styles['lobby-title-spacer']} />
      </div>"""

new_header = """{/* Header */}
      <header className={styles['lobby-header']}>
        <button className={styles['lobby-back-btn']} onClick={() => router.push("/")}>←</button>
        <div className={styles['lobby-header-top']}>
          <span className={styles['lobby-mode-badge']}>COMPETE</span>
          <span className={styles['lobby-status-chip']}>
            <span className={styles['lobby-status-dot']} />
            Waiting for players
          </span>
        </div>
        <h1 className={styles['lobby-title-h1']}>Game Lobby</h1>
      </header>"""

content = content.replace(old_header, new_header)
print(f"Header replaced: {old_header not in content}")

# Change 3: Add accent bar to Invite Players subsection
old_invite = """{/* Sub-section A: Invite Players */}
          {viewer?.isHost && (
          <div className={styles['lobby-subsection']}>
            <div className={styles['lobby-subsection-header']}>
              <span className={styles['lobby-subsection-title']}>Invite Players</span>"""

new_invite = """{/* Sub-section A: Invite Players */}
          {viewer?.isHost && (
          <div className={styles['lobby-subsection']}>
            <div className={styles['lobby-subsection-header']}>
              <span className={styles['lobby-accent-bar-sm']} />
              <span className={styles['lobby-subsection-title']}>Invite Players</span>"""

content = content.replace(old_invite, new_invite)
print(f"Invite accent bar added: {old_invite not in content}")

# Write file
with open('src/components/compete/LobbySection.tsx', 'w') as f:
    f.write(content)

print("TSX changes applied")
