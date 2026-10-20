# P13K — Indirect MAD prerequisite authority

Date: 2026-10-20

Repository: `deadspace`, starting HEAD `2b07a8c7a8834e52e840b5c9e6e91de5af755ddd`

Pinned game: `pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f`

## Decision

| Claim                                       | Result                                            |
| ------------------------------------------- | ------------------------------------------------- |
| Declared ancestry established               | **Yes**                                           |
| Mandatory obligation established            | **No — unavailable from retained evidence**       |
| Current Research actionability established  | **Yes, at the cycle-232 Research-owner boundary** |
| Incremental economic intervention justified | **No**                                            |
| CPU readiness                               | **Unresolved**                                    |

`tech-steel_containers` is a current offered action and a verified declared ancestor candidate on one retained MAD path. The witness follows an OR candidate at each High Tech level; it does not prove the selected actions are a complete, currently executable route, and it does not prove Steel Containers is mandatory. The graph records other High Tech grant candidates with conditional or excluded status, so P13J’s cycle-232 result remains **C** and its mandatory certificate remains unavailable. No action is proven unrelated from this incomplete graph.

The relationship categories remain distinct: a local declared witness may be reported through unrelated graph incompleteness; a mandatory claim needs complete applicable alternatives; a declared OR branch is not proof that several routes are feasible; and missing/conditional facts stay unknown. A mandatory obligation would still not authorize spending or execution.

## Pinned native facts and retained witness

The pinned `src/tech.js` definitions match the same-cycle effective definitions captured in P13H:

- `tech-steel_containers` grants `steel_container:1` and declares Smelting 2 plus Container 1.
- `tech-industrialization` grants `high_tech:3` and declares High Tech 2, Cement 2, and Steel Container 1.
- The selected witness’s standard-route progression is Electronics → High Tech 4 (High Tech 3 and Titanium 1), Fission → High Tech 5 (High Tech 4 and Uranium 1), ARPA → High Tech 6 (High Tech 5), and Rocketry → High Tech 7 (High Tech 6). Native Fission and Rocketry route restrictions include `standard` and `truepath`.
- `tech-mad` declares Uranium 1, Explosives 3, and High Tech 7; it grants `mad:1`, has a native condition, allows `standard` and `truepath`, and excludes Cataclysm, Lone Survivor, and Warlord.

The P13H cycle-232 effective-definition snapshot identity is SHA-256 `312e38cb60b87dc9b0cfc20dfb683352e24e620985c632bb45ca8eb54853089e`. The current grant-level identity is SHA-256 `24c31fda960171a4d6c67a1165fcd2660ecbbcf7921fa872388bdf58478e5f45`. Relevant current levels were Cement 3, Container 2, Explosives 2, High Tech 2, Smelting 3, Steel Container 0, Titanium 0, and Uranium 0. Steel Containers’ own native AND prerequisites, Smelting 2 and Container 1, are therefore satisfied in this sample. Its frontier prerequisites are recorded from the effective definition; the retained graph stops expansion at the current offer.

The reconstructed witness is:

```text
tech-mad
  AND: Uranium 1, Explosives 3, High Tech 7
  OR High Tech 7 candidates: 15; selected witness branch: tech-rocketry
    AND: High Tech 6
    OR High Tech 6 candidates: 16; selected witness branch: tech-arpa
      AND: High Tech 5
      OR High Tech 5 candidates: 17; selected witness branch: tech-fission
        AND: High Tech 4, Uranium 1
        OR High Tech 4 candidates: 18; selected witness branch: tech-electronics
          AND: High Tech 3, Titanium 1
          OR High Tech 3 candidates: 19; selected witness branch: tech-industrialization
            AND: High Tech 2, Cement 2, Steel Container 1
            OR Steel Container 1 candidates: 12; selected witness branch: tech-steel_containers
```

The P13H capture reports the listed path actions as currently applicable. Industrialization’s Cement declaration also carries a game-specific `skipRequirement` applicability boundary for Fliers; that exception is unresolved in the retained evidence. The path’s direct Steel Container edge is source-backed, but this side condition further prevents treating the entire route as a fully established executable path.

## Mandatory status and missing proof

The cycle-232 graph contains 121 action gates and 129 requirement gates. At High Tech levels 3 through 7, the retained OR candidate sets contain 19, 18, 17, 16, and 15 grant actions respectively. Each level has 2 candidates proven excluded for the current route and 2 candidates whose native prerequisite declarations remain conditional; the other unexcluded candidates are still conditional because the planner does not establish their full native queue/game-specific requirements and relevant route facts. The graph’s target is conditional and its dependency evidence is partial.

The graph used the existing limits (`maxDepth:16`, `maxActions:256`): 121 actions were retained, so the action cap was not reached. It reported 140 depth-limit entries and 142 cycle entries over the retained registry. The native MAD condition, route restrictions, and trait exclusions are separately captured as eligible at this owner boundary, but those facts do not complete the upstream grant alternatives. The scoped classifier returns `verified` with `inputConsistency: incomplete` and no mandatory action or alternative group; `currentMandatoryResearchEvidence()` returns `partial`, not a complete certificate. The report therefore marks mandatory status unavailable, and the locally valid witness does not upgrade it.

Two high-Tech candidate declarations, `tech-lasers` and `tech-quantum_computing`, remain conditional because their native requirements are computed functions without a complete current-cycle result. Other unexcluded candidate action gates remain conditional because native queue precognition or game-specific requirement exceptions were not evaluated. The depth and cycle limits include unrelated branches, but relevant High Tech alternatives are unresolved inside the retained gate candidate sets themselves.

To upgrade mandatory status, the evidence must establish, for every native action capable of granting High Tech at the required levels: its effective current-cycle prerequisites (including complete computed requirements), applicable route/trait/condition and game-specific requirement-exception results, current grant levels, and all applicable OR candidates. Unknown branches must be resolved or shown excluded. Steel Containers is mandatory only if every complete applicable derivation of the unsatisfied terminal requirements crosses its grant action.

## Cycle-232 owner authority and economy

P13H cycle 232 equals its Research-owner publication cycle. MAD was the selected prestige; Research permission was enabled; queues were empty; the root generation was 0; and the progression epoch and catalog identity were current. Root generation 0 is valid. The offer-set identity was `c9bacdfea9d23974ebe965df6ba786710f669c7fc4a8b6a930ccf16f710a0e51`; offer membership was complete and binding generations were positive. Steel Containers was offered at generation 251, with native affordability true and a native price of 9,000 Knowledge and 250 Steel. Ordinary Research selected it and verified the `steel_container:1` grant.

The relationship classifier now additionally requires the selected MAD goal, matching owner cycle, current catalog and offer-binding status, nonnegative root generation, progression identity, complete offer membership with positive generations, captured definition/grant/applicability identities, and eligible MAD target evidence before it reports current offer actionability. A stale cycle or incomplete authority yields unknown even if a retained path witness exists.

This establishes actionability only at that Research-owner boundary. It does not carry the quoted price, affordability, offer membership, or binding authority into a later Smelter cycle. The supported economic decision is **no incremental resource intervention justified**: Research already held enough Knowledge and Steel and completed the native purchase. No extra Steel allocation target is warranted, and the historical purchase does not justify a production change. P12G Smelter was not rerun.

The result is not connected to production Research, Smelter, Gather, Jobs, or Construction execution. It adds no purchase override, reservation, or recurring traversal.

## Bounded computation and performance

P13K reused the one graph built by the existing P13J diagnostic. It made one prerequisite-planner invocation, one native-obligation-classifier invocation, and one local witness reconstruction. The retained graph contains 250 nodes and 797 prerequisite/candidate edge references. Witness reconstruction examined 14 nodes and 14 edges, including 6 OR candidate branches; its hard bounds were the retained 250 nodes and 797 edges. The existing planner’s depth/action bounds were not raised. No second graph expansion, additional Research draw, catalog scan, native control call, or recurring computation was added.

P13J’s test-surface Research-selection evidence publication had been allowed to build grant-level and applicability projections whenever performance diagnostics were enabled, even with P13J capture disabled. Those P13J-only selection and result projections are now gated on the explicit capture flag. The separate existing MAD performance diagnostic remains available when diagnostics are enabled. No full renderer CPU factorial or new renderer CPU benchmark was run; CPU readiness remains unresolved.

The tracked `evolve_automation.user.js` was rebuilt. Its small generated diff reflects the source guard change in a test-only path: with the production test surface disabled, the capture flag folds to false and the existing diagnostic gate is retained. There is no added production Research decision or native game behavior.

## Regression coverage and reproducibility

Focused tests cover the existing direct mandatory prerequisite, the indirect declared witness, a complete-authority indirect mandatory contract, an OR bypass, an unresolved alternative, a complete unrelated action, a missing definition, a globally incomplete but locally valid witness, stale cycle/root/progression/binding generations, valid root generation zero versus invalid offer-binding generation zero, and the no-actionable-obligation outcome staying C. The committed Stage 3I manifest remains a positive control for independent Black Powder and Mad Science claims (100 and 50 Mana).

Additional regressions ensure an absent intermediate action makes a no-path result unknown rather than unrelated, and stale owner authority cannot promote a locally valid witness to current actionability.

P13J asserts the retained cycle-232 sample remains fail-closed and that no incremental resource intervention is justified. Reproduce the P13H capture and P13K classification with:

```powershell
node experiments/p13h-research-owner-evidence.mjs
node experiments/p13j-current-mad-owner-obligation.mjs
```

The next strategic experiment should return to the established Stage 3I Mana bottleneck and measure a real goal-directed allocation improvement through native owners and actual milestone times.
