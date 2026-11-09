import { nearestOnTrack, type Projection, type Track } from "@neon/sim";

export class TrackFollower {
  private track: Track | null = null;
  private last = new Map<string, number>();

  follow(track: Track, id: string, x: number, y: number): Projection {
    if (track !== this.track) {
      this.track = track;
      this.last.clear();
    }
    const at = nearestOnTrack(track, x, y, this.last.get(id));
    this.last.set(id, at.s);
    return at;
  }

  near(id: string): number | undefined {
    return this.last.get(id);
  }
}
