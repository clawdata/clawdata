/**
 * Mission Control — Agent skill persistence (localStorage).
 */

let _agentSkills: Record<string, string[]> = {};

export function loadAgentSkills(): void {
  try {
    const raw = localStorage.getItem("mc-agent-skills");
    if (raw) _agentSkills = JSON.parse(raw);
  } catch { _agentSkills = {}; }
}

export function saveAgentSkills(): void {
  localStorage.setItem("mc-agent-skills", JSON.stringify(_agentSkills));
}

export function getAgentSkills(name: string): string[] {
  return _agentSkills[name] || [];
}

export function setAgentSkills(name: string, skills: string[]): void {
  _agentSkills[name] = skills;
  saveAgentSkills();
}

export function deleteAgentSkills(name: string): void {
  delete _agentSkills[name];
  saveAgentSkills();
}
