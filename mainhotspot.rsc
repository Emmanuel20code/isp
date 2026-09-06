# ─── WiFiBilling Onboarding Entry Point (mainhotspot.rsc) ───
# Refactored for project compatibility.

# ─── 0. CONFIGURATION VARIABLES ───
:global wfbServerBase "https://wifibilling.site"
:global wfbOnboardToken "KXK-WM5SUZ"
:global wfbRouterId "ROUTER_01"
:global wfbAgentKey "AGENT_KEY"

:log info "WiFiBilling: Starting onboarding process..."

# ─── 1. CORE SETUP ───
# Running the unified setup logic directly to avoid multi-script conflicts
/system script run streamlined-setup.rsc

# ─── 2. FINALIZATION ───
:log info "WiFiBilling: Onboarding completed successfully."
:put "WiFiBilling: Onboarding completed successfully."
