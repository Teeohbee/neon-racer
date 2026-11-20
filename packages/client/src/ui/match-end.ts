import type { PlayerInfo } from "@neon/sim";
import { formatScore } from "./format";
import { finalStandings } from "./podium";

type Cup = { cup: number; leg: number };

export const isLegEnd = ({ cup, leg }: Cup) => cup > 0 && leg < cup;

export function rematchLabel(state: Cup): string {
  if (isLegEnd(state)) return `Next track (${state.leg + 1}/${state.cup})`;
  return state.cup ? "New cup" : "Rematch";
}

export const stillWaiting = (players: PlayerInfo[]) => players.filter((p) => !p.bot && !p.rematch).length;

export const cupTable = (players: PlayerInfo[], legWinner: string | null) =>
  [...players].sort((a, b) => b.cupPoints - a.cupPoints || Number(b.id === legWinner) - Number(a.id === legWinner));

export const matchStandings = ({ players, cup }: { players: PlayerInfo[]; cup: number }, matchWinner: string | null) =>
  cup
    ? cupTable(players, matchWinner).map((p) => ({ id: p.id, score: `${p.cupPoints} pts` }))
    : finalStandings(players, matchWinner).map((p) => ({ id: p.id, score: formatScore(p.score) }));

export function tallyLine(players: PlayerInfo[]): string {
  const winners = players.filter((p) => p.wins > 0).sort((a, b) => b.wins - a.wins);
  return winners.length ? `Tonight: ${winners.map((p) => `${p.name} ${p.wins}`).join(" · ")}` : "";
}
