# Demo LibrePCB project

This is a small real LibrePCB project used to dogfood the `librepcb-ci` action: the repository's own CI runs the action against this project on every push and publishes the result to the demo Pages site.

It is vendored from LibrePCB's test data (the `Gerber Test` project), pinned at commit `b0724e58b6755354d93c60f3ed3afdf109069927` of https://github.com/LibrePCB/librepcb-test-data, which matches the submodule LibrePCB 2.1.1 is tested against. The project is licensed CC0-1.0 (see `LICENSE.txt`).

The only local change is `project/jobs.lp`: the upstream `Gerber Test` ships an empty job set, so it was replaced with the full reference job set from the `Project With Two Boards` test project (every output job type), and `resources/template.txt` was added so the `copy` job has its input.
