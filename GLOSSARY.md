# High Rollers

A top-down party racer on hard-light lanes above a neon city: rounds of elimination racing, played online or together on one screen.

## Ways to play

**Online play**:
Players on their own devices sharing a Room on the server through an invite link.
_Avoid_: multiplayer, network mode

**Local play**:
Several people on one screen, each with their own controller, with the whole match running on that device.
_Avoid_: couch mode, local mode, splitscreen

**Practice**:
One person driving alone on any track, with no Room and no elimination. Hidden from the title menu since 2026-11-19; the code stays in `practice.ts`.

## People and places

**Room**:
One group playing together: its Players, settings and the match in progress.

**Player**:
Someone (or a bot) taking part in a Room. A Punter is a Player who races no car.

**Runner**:
One of the six named bots, each with its own Driving style. Any bot in any Room is a Runner, and The Book always races all six.
_Avoid_: horse, entrant, AI

**Seat**:
A place for one person in Local play, bound to one controller and named by its car colour.
_Avoid_: slot, pad, local player

**Host**:
The Player who chooses the Room's settings. In Local play, the first Seat to join.

## Rules

**Mode**:
Whether cars bump each other in a race: Ghost (no contact) or Contact (bumping).
_Avoid_: using "mode" for a way to play

**Round**:
One race on a track, ending when the elimination line has caught all but one car. A match is a series of Rounds.
_Avoid_: race, heat

## The Book

**The Book**:
A Room setting where every car is a bot and the people bet Chips on each Round instead of driving. Works in both Online and Local play.
_Avoid_: betting mode, bookie mode

**Punter**:
A person in a Room playing The Book.
_Avoid_: bettor, gambler, spectator

**Chips**:
What Punters bet and spend. The Punter with the biggest stack when The Book's last Round ends wins.
_Avoid_: money, credits, coins

**Bet**:
Chips staked on one outcome of the coming Round: a Win (the last car standing) or a First out (the first Runner eliminated, whether by the line, a drop or a hazard).

**House odds**:
The fixed payout on each bot, set before the Betting window opens.
_Avoid_: pool, tote

**Betting window**:
The time between Rounds in The Book when Punters place Bets. It closes when every Punter has locked in or time runs out.


**Form**:
A Runner's recent results, shown beside its odds.

**Bailout**:
A top-up to the minimum stake for a Punter who starts a Betting window below it. Bailouts are counted and shown at the end.
_Avoid_: rebuy, loan

**Driving style**:
How a bot races, such as chasing slipstreams or playing safe near drops, as distinct from how fast it is.
_Avoid_: personality, skill, difficulty
