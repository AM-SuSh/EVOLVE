use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

const APP_NAMES: &[&str] = &["hello", "power", "yield"];

fn main() {
    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let workspace_root = manifest_dir.parent().unwrap();
    let target = env::var("TARGET").unwrap();

    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed=linker.ld");
    println!("cargo:rerun-if-changed=src/entry.asm");
    println!("cargo:rerun-if-changed=../user");

    let linker_src = manifest_dir.join("linker.ld");
    let linker_dst = out_dir.join("linker.ld");
    fs::copy(&linker_src, &linker_dst).expect("copy kernel linker script");
    println!("cargo:rustc-link-arg=-T{}", linker_dst.display());

    let enabled = env::var("CARGO_FEATURE_LAB2").is_ok()
        || env::var("CARGO_FEATURE_LAB3").is_ok()
        || env::var("CARGO_FEATURE_LAB4").is_ok()
        || env::var("CARGO_FEATURE_LAB5").is_ok();

    if enabled {
        build_user_apps(workspace_root, &target);
        let apps_dir = out_dir.join("apps");
        fs::create_dir_all(&apps_dir).expect("create apps dir");
        for app in APP_NAMES {
            let elf = workspace_root
                .join("target")
                .join(&target)
                .join("release")
                .join(app);
            let bin = apps_dir.join(format!("{app}.bin"));
            elf_to_bin(&elf, &bin);
        }
        println!("cargo:rustc-env=KERNEL_APP_DIR={}", apps_dir.display());
    }
}

fn build_user_apps(workspace_root: &Path, target: &str) {
    for app in APP_NAMES {
        let status = Command::new("cargo")
            .current_dir(workspace_root)
            .args([
                "build",
                "-p",
                "user",
                "--bin",
                app,
                "--target",
                target,
                "--release",
            ])
            .status()
            .expect("failed to spawn cargo for user app");
        assert!(status.success(), "failed to build user app {app}");
    }
}

fn elf_to_bin(elf: &Path, bin: &Path) {
    let status = Command::new("rust-objcopy")
        .args([
            elf.to_str().unwrap(),
            "--strip-all",
            "-O",
            "binary",
            bin.to_str().unwrap(),
        ])
        .status()
        .expect("failed to spawn rust-objcopy");
    assert!(status.success(), "objcopy failed for {}", elf.display());
}
