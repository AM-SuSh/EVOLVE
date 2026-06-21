# os-lab build entrypoints

FEATURE ?= lab1
KERNEL := kernel
CARGO := cargo

.PHONY: all build run test check clean test-lab1 test-lab2 test-lab3 test-lab4 test-lab5

all: build

build:
	$(CARGO) build -p $(KERNEL) --features $(FEATURE)

run:
	$(CARGO) run -p $(KERNEL) --features $(FEATURE)

test:
	$(CARGO) check --workspace
	$(CARGO) build -p $(KERNEL) --features $(FEATURE)

check:
	$(CARGO) check -p $(KERNEL) --features lab1
	$(CARGO) check -p $(KERNEL) --features lab2
	$(CARGO) check -p $(KERNEL) --features lab3
	$(CARGO) check -p $(KERNEL) --features lab4
	$(CARGO) check -p $(KERNEL) --features lab5

clean:
	$(CARGO) clean

test-lab1:
	$(MAKE) run FEATURE=lab1

test-lab2:
	$(MAKE) run FEATURE=lab2

test-lab3:
	$(MAKE) run FEATURE=lab3

test-lab4:
	$(MAKE) run FEATURE=lab4

test-lab5:
	$(MAKE) run FEATURE=lab5
