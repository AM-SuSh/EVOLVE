# Three-way comparison raw data (collected Day3, for Day6 comparison.md)

Collected: 2026-06-23 13:39
Method: script counts (crates incl workspace members, LOC incl .rs/.asm, tests = #[test] count, target excluded)

## Self-developed os-lab
- Crates: 8 (workspace root + kernel + 5 component crates + user)
- Source files: 27 (.rs + .asm)
- Lines of code: 1882
- Unit tests: 9
- Labs: 3 (lab1-lab5, mapping to ch1+ch2 / ch2+ch3 / ch4 / ch5 / ch6+ch8)
- Architecture: single kernel + feature gate progressive (6 crates, 2 dependency layers)

## Reference tg-rcore-tutorial
- Crates: 29
- Source files: 548
- Lines of code: 36455
- Unit tests: 0
- Labs: 5 (ch3/ch4/ch5/ch6/ch8 base tests)
- Architecture: 8 independent kernels + 23 component crates, 4 dependency layers

## Local university environment
- Data TBD (plan line 322-323: member C research on local teaching env)
- Needed: lab count, knowledge coverage, onboarding difficulty, doc friendliness (qualitative)
