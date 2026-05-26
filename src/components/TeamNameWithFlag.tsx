"use client";

const teamFlags: Record<string, string> = {
  "alemania": "🇩🇪",
  "argelia": "🇩🇿",
  "argentina": "🇦🇷",
  "arabia saudita": "🇸🇦",
  "australia": "🇦🇺",
  "austria": "🇦🇹",
  "belgica": "🇧🇪",
  "bosnia y herzegovina": "🇧🇦",
  "brasil": "🇧🇷",
  "cabo verde": "🇨🇻",
  "canada": "🇨🇦",
  "chequia": "🇨🇿",
  "colombia": "🇨🇴",
  "corea del sur": "🇰🇷",
  "costa de marfil": "🇨🇮",
  "croacia": "🇭🇷",
  "curazao": "🇨🇼",
  "ecuador": "🇪🇨",
  "egipto": "🇪🇬",
  "escocia": "🏴",
  "espana": "🇪🇸",
  "estados unidos": "🇺🇸",
  "francia": "🇫🇷",
  "ghana": "🇬🇭",
  "haiti": "🇭🇹",
  "inglaterra": "🏴",
  "irak": "🇮🇶",
  "iran": "🇮🇷",
  "japon": "🇯🇵",
  "jordania": "🇯🇴",
  "marruecos": "🇲🇦",
  "mexico": "🇲🇽",
  "noruega": "🇳🇴",
  "nueva zelanda": "🇳🇿",
  "paises bajos": "🇳🇱",
  "panama": "🇵🇦",
  "paraguay": "🇵🇾",
  "portugal": "🇵🇹",
  "qatar": "🇶🇦",
  "rd congo": "🇨🇩",
  "senegal": "🇸🇳",
  "sudafrica": "🇿🇦",
  "suecia": "🇸🇪",
  "suiza": "🇨🇭",
  "tunez": "🇹🇳",
  "turquia": "🇹🇷",
  "uruguay": "🇺🇾",
  "uzbekistan": "🇺🇿",
};

function normalizeTeamName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

export function TeamNameWithFlag({ team, compact = false }: { team: string; compact?: boolean }) {
  const flag = teamFlags[normalizeTeamName(team)];

  return (
    <span className={`team-label ${compact ? "team-label-compact" : ""}`}>
      {flag ? (
        <span aria-hidden="true" className="team-flag">
          {flag}
        </span>
      ) : null}
      <span>{team}</span>
    </span>
  );
}
