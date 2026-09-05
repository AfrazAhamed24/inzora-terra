/**
 * ConversationManager - D.E.X.T.E.R's conversational dialogue controller.
 *
 * Manages the step-by-step interaction flow after the wake word:
 *   ACTIVATED → BRIEFING → AWAITING_SCAN_APPROVAL → SCANNING →
 *   ANALYZING → DETECTING → ROUTE_CALCULATION →
 *   AWAITING_DEPLOYMENT_APPROVAL → DEPLOYING → MISSION_ACTIVE → COMPLETED
 *
 * Each phase has associated dialogue. Commands advance the conversation.
 * D.E.X.T.E.R. never auto-executes — every step requires explicit approval.
 */

export type ConversationPhase =
  | 'IDLE'
  | 'ACTIVATED'
  | 'BRIEFING'
  | 'AWAITING_SCAN_APPROVAL'
  | 'SCANNING'
  | 'ANALYZING'
  | 'DETECTING'
  | 'ROUTE_CALCULATION'
  | 'AWAITING_DEPLOYMENT_APPROVAL'
  | 'DEPLOYING'
  | 'MISSION_ACTIVE'
  | 'COMPLETED'
  | 'STANDING_BY'

export interface ConversationResult {
  dialogue: string
  phase: ConversationPhase
  action?: string
}

const APPROVAL_REGEX = /^(yes|yeah|yep|y|proceed|start|begin|go|go\s*ahead|do\s*it|affirmative|confirm|scan|initiate|deploy|run|execute|launch)$/i
const DECLINE_REGEX = /^(no|nah|nope|n|cancel|abort|stop|wait|hold|stand\s*by|not\s*(?:yet|now))$/i
const RESTART_REGEX = /^(restart|start\s*over|begin\s*again|reset|new\s*mission)$/i

function isApproval(text: string): boolean {
  return APPROVAL_REGEX.test(text.trim().toLowerCase())
}

function isDecline(text: string): boolean {
  return DECLINE_REGEX.test(text.trim().toLowerCase())
}

function isRestart(text: string): boolean {
  return RESTART_REGEX.test(text.trim().toLowerCase())
}

const PHASE_DIALOGUE: Record<string, { enter: string; [key: string]: string }> = {
  ACTIVATED: {
    enter: "Yes, Commander. I'm D.E.X.T.E.R. — Disaster eXtraction, Terrain Evaluation & Rescue. Systems are online. Shall I begin the scan?",
  },
  BRIEFING: {
    enter: "Systems are online. I can scan for terrain conditions, survivors, hazards, and rescue routes. Shall I begin?",
  },
  AWAITING_SCAN_APPROVAL: {
    enter: 'Standing by, Commander.',
  },
  SCANNING: {
    enter: 'Scan initiated.',
    complete: 'Scan complete. Terrain data acquired.',
  },
  ANALYZING: {
    enter: 'Analyzing terrain and hazards.',
    complete: 'Analysis complete. No critical obstructions detected.',
  },
  DETECTING: {
    enter: 'Running survivor detection.',
    complete: 'Detection complete. Potential activity found in the northern sector.',
  },
  ROUTE_CALCULATION: {
    enter: 'Calculating rescue route.',
    complete: 'Route calculated. All checks complete.',
  },
  AWAITING_DEPLOYMENT_APPROVAL: {
    enter: 'Pre-operation checks complete. Ready to deploy. Shall I proceed?'
  },
  DEPLOYING: {
    enter: 'Confirmed. Deploying rescue engine.',
  },
  MISSION_ACTIVE: {
    enter: 'Engine active.',
  },
  COMPLETED: {
    enter: 'Mission complete, Commander.',
  },
  STANDING_BY: {
    enter: 'Standing by.',
  },
}

export class ConversationManager {
  private phase: ConversationPhase = 'IDLE'

  getPhase(): ConversationPhase {
    return this.phase
  }

  reset(): void {
    this.phase = 'IDLE'
  }

  /**
   * Process a user command and return the appropriate response.
   */
  handleCommand(command: string): ConversationResult {
    const text = command.trim()

    // Check for restart from any state
    if (isRestart(text) && this.phase !== 'IDLE') {
      this.phase = 'IDLE'
      return {
        dialogue: 'Mission reset. Ready when you are, Commander.',
        phase: this.phase,
      }
    }

    switch (this.phase) {
      case 'IDLE':
        return this.handleIdle(text)

      case 'ACTIVATED':
      case 'BRIEFING':
        return this.handleBriefing(text)

      case 'AWAITING_SCAN_APPROVAL':
        return this.handleScanApproval(text)

      case 'SCANNING':
      case 'ANALYZING':
      case 'DETECTING':
      case 'ROUTE_CALCULATION':
        return this.handleInProgress(text)

      case 'AWAITING_DEPLOYMENT_APPROVAL':
        return this.handleDeploymentApproval(text)

      case 'DEPLOYING':
      case 'MISSION_ACTIVE':
        return this.handleActive(text)

      case 'COMPLETED':
      case 'STANDING_BY':
        return this.handleCompleted(text)

      default:
        return this.respondDefault(text)
    }
  }

  /**
   * Advance to the next phase (called after TTS completes for the current phase).
   */
  advance(): ConversationResult {
    const PHASE_ORDER: ConversationPhase[] = [
      'SCANNING', 'ANALYZING', 'DETECTING', 'ROUTE_CALCULATION',
      'AWAITING_DEPLOYMENT_APPROVAL',
    ]

    const idx = PHASE_ORDER.indexOf(this.phase)
    if (idx >= 0 && idx < PHASE_ORDER.length - 1) {
      this.phase = PHASE_ORDER[idx + 1]
      return {
        dialogue: PHASE_DIALOGUE[this.phase]?.enter || '',
        phase: this.phase,
      }
    }

    return { dialogue: '', phase: this.phase }
  }

  /**
   * Force-set the phase (used after TTS completion for phase-complete dialogue).
   */
  setPhase(phase: ConversationPhase): void {
    this.phase = phase
  }

  /**
   * Get the "complete" dialogue for the current phase (spoken after operation finishes).
   */
  getCompleteDialogue(): string {
    return PHASE_DIALOGUE[this.phase]?.complete || ''
  }

  /**
   * Get the "enter" dialogue for a phase.
   */
  getEnterDialogue(phase: ConversationPhase): string {
    return PHASE_DIALOGUE[phase]?.enter || ''
  }

  // ---- Private handlers ----

  private handleIdle(text: string): ConversationResult {
    if (isApproval(text)) {
      this.phase = 'ACTIVATED'
      return {
        dialogue: PHASE_DIALOGUE.ACTIVATED.enter,
        phase: this.phase,
      }
    }
    return this.respondDefault(text)
  }

  private handleBriefing(text: string): ConversationResult {
    if (isApproval(text)) {
      this.phase = 'SCANNING'
      return {
        dialogue: 'Understood, Commander. Initiating environmental scan.',
        phase: this.phase,
      }
    }
    if (isDecline(text)) {
      this.phase = 'STANDING_BY'
      return {
        dialogue: PHASE_DIALOGUE.STANDING_BY.enter,
        phase: this.phase,
      }
    }
    return {
      dialogue: 'Ready when you are. Say "proceed" to begin.',
      phase: this.phase,
    }
  }

  private handleScanApproval(text: string): ConversationResult {
    if (isApproval(text)) {
      this.phase = 'SCANNING'
      return {
        dialogue: 'Understood, Commander. Initiating environmental scan.',
        phase: this.phase,
      }
    }
    if (isDecline(text)) {
      this.phase = 'STANDING_BY'
      return {
        dialogue: PHASE_DIALOGUE.STANDING_BY.enter,
        phase: this.phase,
      }
    }
    return {
      dialogue: 'Standing by. Say "proceed" to begin.',
      phase: this.phase,
    }
  }

  private handleInProgress(text: string): ConversationResult {
    if (isDecline(text)) {
      this.phase = 'STANDING_BY'
      return {
        dialogue: 'Operation paused. Standing by, Commander.',
        phase: this.phase,
      }
    }
    return {
      dialogue: 'Processing. I will update you shortly.',
      phase: this.phase,
    }
  }

  private handleDeploymentApproval(text: string): ConversationResult {
    if (isApproval(text)) {
      this.phase = 'DEPLOYING'
      return {
        dialogue: PHASE_DIALOGUE.DEPLOYING.enter,
        phase: this.phase,
        action: 'deploy',
      }
    }
    if (isDecline(text)) {
      this.phase = 'STANDING_BY'
      return {
        dialogue: PHASE_DIALOGUE.STANDING_BY.enter,
        phase: this.phase,
      }
    }
    return {
      dialogue: 'Standing by. Say "proceed" to deploy.',
      phase: this.phase,
    }
  }

  private handleActive(_text: string): ConversationResult {
    return {
      dialogue: 'Engine is operating. I will alert you if anything requires attention.',
      phase: this.phase,
    }
  }

  private handleCompleted(text: string): ConversationResult {
    if (isRestart(text) || isApproval(text)) {
      this.phase = 'ACTIVATED'
      return {
        dialogue: PHASE_DIALOGUE.ACTIVATED.enter,
        phase: this.phase,
      }
    }
    return {
      dialogue: 'Mission complete. Say "restart" for a new operation.',
      phase: this.phase,
    }
  }

  private respondDefault(text: string): ConversationResult {
    if (!text) {
      return {
        dialogue: "I'm listening, Commander.",
        phase: this.phase,
      }
    }
    // This should rarely be reached — most input goes through dexterBrain.
    // If it does hit here, provide a natural clarification request.
    return {
      dialogue: "I'm not sure what you need. Could you rephrase that?",
      phase: this.phase,
    }
  }
}

export default ConversationManager
