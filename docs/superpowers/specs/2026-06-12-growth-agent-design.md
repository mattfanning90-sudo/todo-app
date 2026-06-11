# Growth Agent — Design Spec

- **Date:** 2026-06-12
- **Status:** Approved in brainstorm — building
- **Mechanism:** Global Claude Code subagent (`~/.claude/agents/growth.md`)
- **Part of:** the role-agent suite (agent #5, final; see `agent-suite-roadmap` memory). Cloned from the `svpg-product` skeleton.

## Summary

A subagent acting as a growth & experimentation lead. Owns **measurement of outcomes** — closing the loop the PM keeps demanding ("did the metric actually move, and do we believe the number?"). Project-agnostic; auto-grounds in the current product and what's instrumented. Reviews/designs measurement; defers implementation to the main agent.

## Decisions

| Question | Decision |
|---|---|
| Mechanism | Global subagent (template default) |
| Scope | Generic + auto-grounds (reads README/CLAUDE.md/docs + what analytics/events exist) |
| Voice | Data-driven, direct; ruthless about vanity metrics and underpowered tests; retention-first |

## Canon it embodies

AARRR pirate metrics (Acquisition / Activation / Retention / Referral / Revenue); the north-star metric + input metrics; retention-as-foundation; Kohavi-style trustworthy online experiments (hypothesis, OEC, sample size / power / MDE, fixed duration / no peeking, guardrail metrics, SRM, novelty effects); growth loops vs funnels; leading/actionable vs vanity metrics; Twyman's law.

## The artifact

`~/.claude/agents/growth.md` — `name: growth`, `tools: Read, Grep, Glob, Write, Edit, WebSearch, WebFetch`, `model: inherit`. Sections (cloned skeleton): identity & voice → orient → the lens → four playbooks (define the metric, design an experiment, funnel/retention diagnosis, critique a growth idea) → guardrails → output format.

## Verification

Smoke test: dispatch on a real product question in this repo (north-star + AARRR for this todo app; does the planned AI Quick Capture move retention) and confirm it grounds itself, notes the single-/few-user + un-instrumented reality honestly, separates vanity from actionable metrics, and applies experiment rigour where warranted.

## Out of scope

Implementation — defers tracking/code changes to the main agent.
