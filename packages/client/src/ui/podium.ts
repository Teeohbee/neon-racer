import type { PlayerInfo } from "@neon/sim";
import { h } from "../dom";
import "./podium.css";

const AWARD_FIRST = 2.4;
const AWARD_GAP = 1.8;
const LONG_NAME = 9;
const VERY_LONG_NAME = 13;

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

export function nameFit(name: string): "" | "long" | "very-long" {
  const length = [...name].length;
  return length > VERY_LONG_NAME ? "very-long" : length > LONG_NAME ? "long" : "";
}

export interface PodiumSounds {
  click?: () => void;
  reveal?: () => void;
}

export function createPodium(parent: HTMLElement, sounds: PodiumSounds = {}) {
  const layer = h("div", { class: "podium-layer" });
  const actions = h("div", { class: "podium-actions" });
  parent.append(layer);
  actions.addEventListener("click", (e) => {
    if (e.target instanceof Element && e.target.closest("button:not(:disabled)")) sounds.click?.();
  });
  layer.addEventListener("animationstart", (e) => {
    if (e.animationName === "award-reveal") sounds.reveal?.();
  });

  const steps = (entries: PodiumEntry[]) =>
    h(
      "div",
      { class: "podium-steps" },
      ...podiumOrder(entries).map(({ item, place }) =>
        h(
          "div",
          { class: `podium-step p${place}`, style: `--c:${item.color}` },
          h("div", { class: `podium-name ${nameFit(item.name)}`, title: item.name }, item.name),
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
