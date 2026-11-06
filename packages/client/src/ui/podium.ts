import type { PlayerInfo } from "@neon/sim";
import { h } from "../dom";
import "./podium.css";

const AWARD_FIRST = 2.4;
const AWARD_GAP = 1.8;

export interface PodiumEntry {
  name: string;
  color: string;
  value: string;
}

export interface AwardCard {
  title: string;
  blurb: string;
  stat: string;
  winner: PodiumEntry;
}

export function podiumOrder<T>(ranked: T[]): { item: T; place: number }[] {
  return [1, 0, 2].flatMap((i) => (i < ranked.length ? [{ item: ranked[i]!, place: i + 1 }] : []));
}

export function finalStandings(players: PlayerInfo[], winner: string | null): PlayerInfo[] {
  return [...players].sort((a, b) => b.score - a.score || Number(b.id === winner) - Number(a.id === winner));
}

export function awardDelay(index: number): number {
  return AWARD_FIRST + index * AWARD_GAP;
}

export function createPodium(parent: HTMLElement) {
  const layer = h("div", { class: "podium-layer" });
  const actions = h("div", { class: "podium-actions" });
  parent.append(layer);

  const steps = (entries: PodiumEntry[]) =>
    h(
      "div",
      { class: "podium-steps" },
      ...podiumOrder(entries).map(({ item, place }) =>
        h(
          "div",
          { class: `podium-step p${place}`, style: `--c:${item.color}` },
          h("div", { class: "podium-name" }, item.name),
          h("div", { class: "podium-value" }, item.value),
          h("div", { class: "podium-block" }, String(place)),
        ),
      ),
    );

  return {
    round(winner: string | null, top: PodiumEntry[]) {
      layer.replaceChildren(
        h("div", { class: "podium round" }, h("div", { class: "podium-title" }, winner ? `${winner} wins the round!` : "Nobody survived that one"), steps(top)),
      );
    },
    match(title: string, subtitle: string, standings: PodiumEntry[], awards: AwardCard[]) {
      actions.replaceChildren();
      layer.replaceChildren(
        h(
          "div",
          { class: "podium match" },
          h("h1", {}, title),
          h("p", { class: "hint" }, subtitle),
          steps(standings),
          standings.length > 3
            ? h(
                "ol",
                { class: "podium-rest" },
                ...standings.slice(3).map((p) => h("li", { style: `--c:${p.color}` }, h("span", {}, p.name), h("span", {}, p.value))),
              )
            : null,
          awards.length
            ? h(
                "div",
                { class: "podium-awards" },
                ...awards.map((a, i) =>
                  h(
                    "div",
                    { class: "award", style: `--c:${a.winner.color}; animation-delay:${awardDelay(i)}s` },
                    h("div", { class: "award-title" }, a.title),
                    h("div", { class: "award-winner" }, a.winner.name),
                    h("div", { class: "award-stat" }, a.stat),
                    h("div", { class: "award-blurb" }, a.blurb),
                  ),
                ),
              )
            : null,
          actions,
        ),
      );
    },
    actions(...children: HTMLElement[]) {
      actions.replaceChildren(...children);
    },
    hide() {
      layer.replaceChildren();
    },
  };
}
