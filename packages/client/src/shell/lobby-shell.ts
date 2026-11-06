import { audio } from "../audio";
import { createKeyNav } from "./keynav";
import { dialog, notify } from "./notice";
import { bindHoverSound } from "./ui-sounds";

export interface LobbyShellOptions {
  active: () => boolean;
  leave: () => void;
}

export function bindLobbyShell(root: HTMLElement, opts: LobbyShellOptions): () => void {
  let asking = false;
  const confirmLeave = async () => {
    if (asking) return;
    asking = true;
    const leave = await dialog({
      title: "Leave the room?",
      body: "You'll drop out and head back to the title screen.",
      actions: [
        { label: "Stay", value: false, primary: true },
        { label: "Leave", value: true },
      ],
      cancel: false,
    });
    asking = false;
    if (leave) opts.leave();
  };
  const unbindNav = createKeyNav(root, { enabled: opts.active, onBack: () => void confirmLeave(), onMove: audio.sfx.hover });
  const unbindHover = bindHoverSound(root, audio.sfx.hover, opts.active);
  return () => {
    unbindNav();
    unbindHover();
  };
}

export function copyInvite(url: string): void {
  const write = navigator.clipboard?.writeText(url) ?? Promise.reject(new Error("no clipboard"));
  write.then(
    () => notify("Invite link copied"),
    () => notify("Couldn't copy the invite link", "error"),
  );
}
