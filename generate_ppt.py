#!/usr/bin/env python3
"""Fill the GAI review PPT with D.E.X.T.E.R project content."""
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.enum.text import PP_ALIGN
import os

SRC = os.path.join(os.path.dirname(__file__), 'GAI review0 ppt.pptx')
OUT = os.path.join(os.path.dirname(__file__), 'D.E.X.T.E.R - GAI Review.pptx')

prs = Presentation(SRC)

# ── helpers ──────────────────────────────────────────────────────────────

def clear_text_frame(tf):
    """Remove all paragraphs from a text frame except the first."""
    for i in range(len(tf.paragraphs) - 1, 0, -1):
        p = tf.paragraphs[i]._p
        p.getparent().remove(p)
    tf.paragraphs[0].text = ''

def set_text(tf, lines, font_size=Pt(14), bold=False, color=None):
    """Set lines of text into a text frame."""
    clear_text_frame(tf)
    for i, line in enumerate(lines):
        if i == 0:
            p = tf.paragraphs[0]
        else:
            p = tf.add_paragraph()
        p.text = line
        for run in p.runs:
            run.font.size = font_size
            run.font.bold = bold
            if color:
                run.font.color.rgb = color

def set_table_cell(cell, text, font_size=Pt(11)):
    cell.text = text
    for p in cell.text_frame.paragraphs:
        for run in p.runs:
            run.font.size = font_size

# ── Slide 1: Title ──────────────────────────────────────────────────────

slide = prs.slides[0]
for shape in slide.shapes:
    if shape.has_text_frame:
        txt = shape.text_frame.text.strip()
        if 'BEACH SAND' in txt or 'NAME' in txt or 'DEPARTMENT' in txt:
            # Title placeholder
            if 'BEACH' in txt:
                shape.text_frame.paragraphs[0].text = 'D.E.X.T.E.R — AI-NATIVE DISASTER RESPONSE OPERATING SYSTEM'
                for run in shape.text_frame.paragraphs[0].runs:
                    run.font.size = Pt(28)
                    run.font.bold = True
            elif 'NAME' in txt:
                shape.text_frame.paragraphs[0].text = 'NAME'
            elif 'VIJAYASHIYAMALA' in txt or ': VIJAYASHIYAMALA' in txt:
                set_text(shape.text_frame, [
                    ': VIJAYASHIYAMALA V (927624BAM056)',
                    '  GIRUJASHRI (927624BAM017)',
                    '  QORAISHA LOVELY R (927624BAM036)',
                ])
            elif 'DEPARTMENT' in txt:
                set_text(shape.text_frame, [
                    'DEPARTMENT : CSE [AIML]   YEAR : 2026-2027'
                ])
    # Update any extra text box that may hold a tagline
    if shape.has_text_frame and not shape.text_frame.text.strip():
        pass

# ── Slide 2: Problem Statement ──────────────────────────────────────────

slide = prs.slides[1]
for shape in slide.shapes:
    if shape.has_text_frame:
        txt = shape.text_frame.text.strip()
        if 'Real-Time' in txt:
            shape.text_frame.paragraphs[0].text = 'Real-Time Problem Statement'
        elif 'Conventional' in txt or 'Target Users' in txt:
            set_text(shape.text_frame, [
                '',
                'Conventional disaster response relies on manual reconnaissance',
                'and fragmented communication between field teams, making',
                'coordination slow, error-prone, and dangerous.',
                '',
                'Key Gaps in Current Disaster Response:',
                '',
                '  1. No real-time telemetry processing',
                '  2. Single-AI cannot separate concerns',
                '  3. No structured decision chain',
                '  4. Information overload for commanders',
                '  5. No human-in-the-loop workflow',
            ], font_size=Pt(13))

# ── Slide 3: Project Objectives ─────────────────────────────────────────

slide = prs.slides[2]
for shape in slide.shapes:
    if shape.has_text_frame:
        txt = shape.text_frame.text.strip()
        if 'PROJECT OBJECTIVES' in txt:
            shape.text_frame.paragraphs[0].text = 'PROJECT OBJECTIVES'
        elif 'Develop' in txt or 'sediment' in txt.lower():
            set_text(shape.text_frame, [
                '1. Orchestrate a multi-agent dependency graph',
                '2. Convert rover telemetry into actionable rescue intelligence',
                '3. Provide explainable, traceable decisions',
                '4. Implement human-in-the-loop workflows',
                '5. Deliver a J.A.R.V.I.S.-style command interface',
            ], font_size=Pt(14))

# ── Slide 4: Existing System & Limitations ──────────────────────────────

slide = prs.slides[3]
for shape in slide.shapes:
    if shape.has_text_frame:
        txt = shape.text_frame.text.strip()
        if 'EXISTING SYSTEM' in txt:
            shape.text_frame.paragraphs[0].text = 'EXISTING SYSTEM & ITS LIMITATIONS'
        elif 'Existing Methodology' in txt or 'Manual sediment' in txt:
            set_text(shape.text_frame, [
                'Existing Methodology',
                '',
                '  Manual incident assessment by field commanders',
                '  Radio-based team coordination',
                '  Spreadsheet-based resource tracking',
                '  Paper-based SOPs and building codes',
                '  Post-incident manual documentation',
            ], font_size=Pt(13))
        elif 'Technical Constraints' in txt or 'High computational' in txt:
            set_text(shape.text_frame, [
                'Technical Constraints',
                '',
                '  No real-time sensor integration',
                '  Single-agent analysis',
                '  No dependency-aware execution',
                '  No confidence calibration',
                '  No explainability',
                '  No structured HITL',
            ], font_size=Pt(13))

# ── Slide 5: Proposed System ────────────────────────────────────────────

slide = prs.slides[4]
for shape in slide.shapes:
    if shape.has_text_frame:
        txt = shape.text_frame.text.strip()
        if 'PROPOSED SYSTEM' in txt:
            shape.text_frame.paragraphs[0].text = 'PROPOSED SYSTEM'
        elif 'proposed system introduces' in txt.lower() or 'vision-based' in txt.lower():
            set_text(shape.text_frame, [
                'D.E.X.T.E.R introduces a multi-agent dependency graph that',
                'processes real-time rover telemetry into structured rescue',
                'intelligence through specialized AI agents.',
                '',
                'Core Innovation: One Agent, One Responsibility',
                '',
                '  Risk Assessment     → structural risk evaluation',
                '  Victim Localization → sensor-fusion victim detection',
                '  Resource Coordination → team & equipment assignment',
                '  Knowledge Retrieval  → SOP & code query',
                '  Rescue Coordination  → field-ready synthesis',
                '  Orchestrator         → unified mission briefing',
            ], font_size=Pt(13))

# ── Slide 6: System Architecture (picture-only, no text to replace) ─────
# Slide 6 has pictures only — leave as-is

# ── Slide 7: Flowchart (picture-only, leave as-is) ─────────────────────

# ── Slide 8: Technology Stack (table) ───────────────────────────────────

slide = prs.slides[7]
for shape in slide.shapes:
    if shape.has_table:
        table = shape.table
        # Row 0 is header
        set_table_cell(table.cell(0, 0), 'Technology')
        set_table_cell(table.cell(0, 1), 'Purpose')
        # Fill rows
        tech_stack = [
            ('Python 3.11 + FastAPI', 'Agent framework + REST/SSE API'),
            ('React 19 + Vite', 'Command center frontend'),
            ('Tailwind + Glassmorphism', 'HUD design system'),
            ('Leaflet + CartoDB', 'GPS tactical command map'),
            ('Framer Motion + Lenis', 'Cinematic transitions + smooth scroll'),
            ('Web Speech API', 'Wake-word detection + TTS narration'),
            ('SSE + EventSource', 'Real-time telemetry streaming'),
            ('pytest (221 tests)', 'Full backend test coverage'),
            ('Groq LLM (planned)', 'Phase 2 agent intelligence'),
        ]
        for i, (tech, purpose) in enumerate(tech_stack):
            r = i + 1
            if r < len(table.rows):
                set_table_cell(table.cell(r, 0), tech)
                set_table_cell(table.cell(r, 1), purpose)

# ── Slide 9: Prompt Engineering ─────────────────────────────────────────

slide = prs.slides[8]
for shape in slide.shapes:
    if shape.has_text_frame:
        txt = shape.text_frame.text.strip()
        if 'PROMPT ENGINEERING' in txt:
            shape.text_frame.paragraphs[0].text = 'PROMPT ENGINEERING'
        elif 'Structured Prompts' in txt or 'sediment analysis' in txt:
            set_text(shape.text_frame, [
                '1. Structured Agent Prompts — typed, validated outputs',
                '   (risk score, zone probabilities, task assignments)',
                '',
                '2. Context-Aware Prompting — Orchestrator references',
                '   evidence chains, confidence scores, agent reasoning',
                '',
                '3. Prompt Chaining — Risk→Resource, Victim→Knowledge,',
                '   all→Rescue Coordination→Briefing',
                '',
                '4. Wake-Word Voice Interaction — real-time partial',
                '   transcript parsing for "dexter" / "d.e.x.t.e.r"',
                '',
                '5. Explanation Prompts — Terra X chatbot answers',
                '   contextual queries with agent output references',
            ], font_size=Pt(12))

# ── Slide 10: Expected Outcome ──────────────────────────────────────────

slide = prs.slides[9]
for shape in slide.shapes:
    if shape.has_text_frame:
        txt = shape.text_frame.text.strip()
        if 'EXPECTED OUTCOME' in txt:
            shape.text_frame.paragraphs[0].text = 'EXPECTED OUTCOME'
        elif 'Expected Outcomes' in txt or 'Autonomous sediment' in txt:
            set_text(shape.text_frame, [
                'Expected Outcomes',
                '',
                '  Autonomous multi-agent disaster response',
                '  Real-time telemetry processing (288+ packets/mission)',
                '  Explainable AI decisions with confidence scores',
                '  Voice-initiated mission execution',
                '  GPS-tactical command map with 4 sensor layers',
                '  Human-in-the-loop commander approval workflow',
                '  Cinematic J.A.R.V.I.S.-style command interface',
            ], font_size=Pt(13))
        elif 'Future Scope' in txt or 'UAV-assisted' in txt:
            set_text(shape.text_frame, [
                'Future Scope',
                '',
                '  LLM-powered agent reasoning (Groq)',
                '  Full RAG knowledge base (NDRF SOPs)',
                '  Real rover telemetry (MQTT/WebSocket)',
                '  Multi-mission dashboard + history',
                '  AR field visualization',
                '  UAV-assisted reconnaissance',
                '  Digital twin simulation for training',
            ], font_size=Pt(13))

# ── Slide 11: Timeline & Team ──────────────────────────────────────────

slide = prs.slides[10]
for shape in slide.shapes:
    if shape.has_text_frame:
        txt = shape.text_frame.text.strip()
        if 'TIMELINE & TEAM' in txt:
            shape.text_frame.paragraphs[0].text = 'TIMELINE & TEAM RESPONSIBILITY'

    if shape.has_table:
        table = shape.table
        rows = len(table.rows)
        cols = len(table.columns)

        # Phase timeline table (7 rows x 2 cols)
        if rows == 7 and cols == 2:
            set_table_cell(table.cell(0, 0), 'Phase')
            set_table_cell(table.cell(0, 1), 'Duration')
            phases = [
                ('Backend Engine', 'Week 1-2'),
                ('Agent Intelligence', 'Week 3-4'),
                ('Simulation Engine', 'Week 5'),
                ('Frontend Command Center', 'Week 6-7'),
                ('Voice & Mission Assistant', 'Week 8'),
                ('Polish & Integration', 'Week 9'),
            ]
            for i, (phase, dur) in enumerate(phases):
                set_table_cell(table.cell(i + 1, 0), phase)
                set_table_cell(table.cell(i + 1, 1), dur)

        # Team table (4 rows x 2 cols)
        if rows == 4 and cols == 2:
            set_table_cell(table.cell(0, 0), 'Team Member')
            set_table_cell(table.cell(0, 1), 'Responsibility')
            team = [
                ('Vijayashiyamala V', 'Backend Lead — Agent framework, FastAPI, state, testing'),
                ('Girujashri', 'Frontend Lead — React UI, Leaflet map, glassmorphism, animations'),
                ('Qoraisha Lovely R', 'AI/Integration Lead — Prompt engineering, voice, knowledge retrieval'),
            ]
            for i, (name, role) in enumerate(team):
                set_table_cell(table.cell(i + 1, 0), name)
                set_table_cell(table.cell(i + 1, 1), role)

# ── Save ─────────────────────────────────────────────────────────────────

prs.save(OUT)
print(f'Saved: {OUT}')
