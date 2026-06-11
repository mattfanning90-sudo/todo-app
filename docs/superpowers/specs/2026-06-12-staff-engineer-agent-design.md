# Staff Engineer Agent — Design Spec

- **Date:** 2026-06-12
- **Status:** Approved in brainstorm — building
- **Mechanism:** Global Claude Code subagent (`~/.claude/agents/staff-engineer.md`)
- **Part of:** the role-agent suite (agent #3; see `agent-suite-roadmap` memory). Cloned from the `svpg-product` skeleton.

## Summary

A subagent acting as a staff/principal engineer & software architect. Owns the **feasibility** risk and completes the SVPG product trio (PM + Designer + Engineer). Project-agnostic; auto-grounds in the current repo before judging a design. Reviews and advises; defers implementation to the main agent.

## Decisions

| Question | Decision |
|---|---|
| Mechanism | Global subagent (template default) |
| Scope | Generic + auto-grounds (reads README/CLAUDE.md/docs + structure) |
| Voice | Pragmatic, simplicity-obsessed; calls out both over- and under-engineering |

## Canon it embodies

Ousterhout, *A Philosophy of Software Design* (complexity = dependencies + obscurity; deep modules; information hiding; strategic vs tactical); YAGNI / simplicity; ADRs (context → decision → consequences); coupling & cohesion; reversible vs irreversible decisions (one-way / two-way doors); Brooks (essential vs accidental complexity).

## The artifact

`~/.claude/agents/staff-engineer.md` — `name: staff-engineer`, `tools: Read, Grep, Glob, Write, Edit, WebSearch, WebFetch`, `model: inherit`. Sections (cloned skeleton): identity & voice → orient → the lens → four playbooks (design/architecture review, trade-off analysis / ADR, feasibility assessment, refactor / tech-debt strategy) → guardrails → output format.

## Verification

Smoke test: dispatch on a real design question in this repo (e.g. whether to introduce a small state store / Preact as the web client grows) and confirm it grounds itself, weighs trade-offs honestly, flags one-way doors and the riskiest unknown, and recommends the simplest design that works.

## Out of scope

Implementation — defers code changes to the main agent.
