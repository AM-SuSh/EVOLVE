# os-lab build entrypoints

FEATURE ?= lab1
KERNEL := kernel
CARGO := cargo
FS_IMG := target/riscv64gc-unknown-none-elf/release/fs.img

.PHONY: all build run test check clean test-lab1 test-lab2 test-lab3 test-lab4 test-lab5 test-lab6 test-lab7 test-lab8 check-fs-img

QEMU_BASE = qemu-system-riscv64 -machine virt -nographic -bios default
QEMU_LAB6 = $(QEMU_BASE) -drive file=$(FS_IMG),if=none,format=raw,id=x0 -device virtio-blk-device,drive=x0,bus=virtio-mmio-bus.0 -kernel

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
	$(CARGO) check -p $(KERNEL) --features lab6
	$(CARGO) check -p $(KERNEL) --features lab7
	$(CARGO) check -p $(KERNEL) --features lab8

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

test-lab6:
	$(CARGO) build -p $(KERNEL) --features lab6 --release
	@$(MAKE) check-fs-img
	$(QEMU_LAB6) target/riscv64gc-unknown-none-elf/release/kernel

test-lab7:
	$(CARGO) build -p $(KERNEL) --features lab7 --release
	@$(MAKE) check-fs-img
	$(QEMU_LAB6) target/riscv64gc-unknown-none-elf/release/kernel

test-lab8:
	$(CARGO) build -p $(KERNEL) --features lab8 --release
	@$(MAKE) check-fs-img
	$(QEMU_LAB6) target/riscv64gc-unknown-none-elf/release/kernel

check-fs-img:
	@powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-fs-img.ps1
