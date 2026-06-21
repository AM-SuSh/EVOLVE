use std::env;
use std::fs;
use std::path::PathBuf;

fn main() {
    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());
    let linker_src = PathBuf::from("linker.ld");
    let linker_dst = out_dir.join("linker.ld");

    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed=linker.ld");
    println!("cargo:rerun-if-changed=src/entry.asm");

    fs::copy(&linker_src, &linker_dst).expect("copy linker script");

    println!("cargo:rustc-link-arg=-T{}", linker_dst.display());
}
