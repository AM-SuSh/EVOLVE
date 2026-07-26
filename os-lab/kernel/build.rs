use std::env;
use std::fs::{self, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Mutex};

use easy_fs::{BlockDevice, EasyFileSystem, BLOCK_SZ};

fn app_names() -> &'static [&'static str] {
    if env::var("CARGO_FEATURE_LAB8").is_ok() {
        &[
            "lab8_usertest",
            "lab8_integration_test",
            "threads_test",
            "threads_arg_test",
            "mutex_test",
            "condvar_test",
            "pipetest",
            "deadlock_mutex_test",
            "deadlock_sem_test",
            "lab7_usertest",
            "dup_test",
            "signal_test",
            "signal_child",
            "signal_mask_test",
            "pipe_test",
            "lab6_usertest",
            "file_test",
            "link_test",
            "mass_unlink_test",
            "mmap_test",
            "spawn_test",
            "stride_test",
            "fs_test",
            "fork_test",
            "exec_test",
            "hello",
        ]
    } else if env::var("CARGO_FEATURE_LAB7").is_ok() {
        &[
            "lab7_usertest",
            "dup_test",
            "signal_test",
            "signal_child",
            "signal_mask_test",
            "pipe_test",
            "lab6_usertest",
            "file_test",
            "link_test",
            "mass_unlink_test",
            "mmap_test",
            "spawn_test",
            "stride_test",
            "fs_test",
            "fork_test",
            "exec_test",
            "hello",
        ]
    } else if env::var("CARGO_FEATURE_LAB6").is_ok() {
        &[
            "lab6_usertest",
            "file_test",
            "link_test",
            "mass_unlink_test",
            "mmap_test",
            "spawn_test",
            "stride_test",
            "fs_test",
            "pipe_test",
            "fork_test",
            "exec_test",
            "hello",
        ]
    } else if env::var("CARGO_FEATURE_LAB5").is_ok() {
        &["fs_test", "pipe_test", "fork_test", "exec_test", "hello"]
    } else if env::var("CARGO_FEATURE_LAB4").is_ok() {
        &["fork_test", "exec_test", "hello"]
    } else {
        &["hello", "power", "yield"]
    }
}

fn lab6_disk_apps() -> &'static [(&'static str, &'static [u8])] {
    &[
        ("testfile", b"Hello from testfile!\n"),
        ("filea", b"Hello from filea!\n"),
    ]
}

struct BlockFile(Mutex<std::fs::File>);

impl BlockDevice for BlockFile {
    fn read_block(&self, block_id: usize, buf: &mut [u8]) {
        let mut file = self.0.lock().unwrap();
        file.seek(SeekFrom::Start((block_id * BLOCK_SZ) as u64))
            .expect("seek fs.img");
        assert_eq!(file.read(buf).unwrap(), BLOCK_SZ);
    }

    fn write_block(&self, block_id: usize, buf: &[u8]) {
        let mut file = self.0.lock().unwrap();
        file.seek(SeekFrom::Start((block_id * BLOCK_SZ) as u64))
            .expect("seek fs.img");
        assert_eq!(file.write(buf).unwrap(), BLOCK_SZ);
    }
}

fn initproc_app() -> &'static str {
    if env::var("CARGO_FEATURE_LAB8").is_ok() {
        "lab8_integration_test"
    } else if env::var("CARGO_FEATURE_LAB7").is_ok() {
        "lab7_usertest"
    } else {
        "lab6_usertest"
    }
}

fn pack_fs_image(workspace_root: &Path, target: &str, apps: &[&str], initproc: &str) {
    let fs_path = workspace_root
        .join("target")
        .join(target)
        .join("release")
        .join("fs.img");
    println!("cargo:rerun-if-changed={}", fs_path.display());

    if let Some(parent) = fs_path.parent() {
        fs::create_dir_all(parent).expect("create fs.img parent dir");
    }

    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(true)
        .open(&fs_path)
        .expect("create fs.img");
    file.set_len((64 * 2048 * BLOCK_SZ) as u64)
        .expect("set fs.img size");

    let block_file = Arc::new(BlockFile(Mutex::new(file)));
    let efs = EasyFileSystem::create(block_file, 64 * 2048, 1);
    let root = EasyFileSystem::root_inode(&efs);

    let app_dir = user_target_root(workspace_root).join(target).join("release");

    for app in apps {
        let mut elf = Vec::new();
        fs::File::open(app_dir.join(app))
            .unwrap_or_else(|e| panic!("open user elf {app}: {e}"))
            .read_to_end(&mut elf)
            .expect("read user elf");
        let inode = root.create(app).expect("create app in fs.img");
        inode.write_at(0, elf.as_slice());
    }

    // initproc runs the integration test chain by default.
    let mut init_elf = Vec::new();
    fs::File::open(app_dir.join(initproc))
        .unwrap_or_else(|e| panic!("open {initproc} for initproc: {e}"))
        .read_to_end(&mut init_elf)
        .expect("read initproc elf");
    let init_inode = root.create("initproc").expect("create initproc");
    init_inode.write_at(0, init_elf.as_slice());

    for (name, data) in lab6_disk_apps() {
        let inode = root.create(name).expect("create disk file");
        inode.write_at(0, data);
    }

    println!("cargo:rustc-env=KERNEL_FS_IMG={}", fs_path.display());
}

fn main() {
    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let workspace_root = manifest_dir.parent().unwrap();
    let target = env::var("TARGET").unwrap();
    let apps = app_names();

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
        || env::var("CARGO_FEATURE_LAB5").is_ok()
        || env::var("CARGO_FEATURE_LAB6").is_ok()
        || env::var("CARGO_FEATURE_LAB7").is_ok()
        || env::var("CARGO_FEATURE_LAB8").is_ok();

    if enabled {
        build_user_apps(workspace_root, &target);
        let apps_dir = out_dir.join("apps");
        fs::create_dir_all(&apps_dir).expect("create apps dir");
        for app in apps {
            let elf = user_elf_path(workspace_root, &target, app);
            let bin = apps_dir.join(format!("{app}.bin"));
            elf_to_bin(&elf, &bin);
            let elf_copy = apps_dir.join(app);
            fs::copy(&elf, &elf_copy).expect("copy user elf");
        }
        println!("cargo:rustc-env=KERNEL_APP_DIR={}", apps_dir.display());
        println!("cargo:rustc-env=KERNEL_APP_ELF_DIR={}", apps_dir.display());

        if env::var("CARGO_FEATURE_LAB6").is_ok()
            || env::var("CARGO_FEATURE_LAB7").is_ok()
            || env::var("CARGO_FEATURE_LAB8").is_ok()
        {
            pack_fs_image(workspace_root, &target, apps, initproc_app());
        }
    }
}

/// 用户程序的独立 target 目录。外层 cargo 在整个构建期间持有 `target/` 的
/// 目录锁；嵌套 cargo 若共用同一目录会永远等锁（干净环境首次构建必现死锁），
/// 因此用户程序必须构建到自己的目录里。
fn user_target_root(workspace_root: &Path) -> PathBuf {
    workspace_root.join("target").join("user-apps")
}

fn user_elf_path(workspace_root: &Path, target: &str, app: &str) -> PathBuf {
    user_target_root(workspace_root)
        .join(target)
        .join("release")
        .join(app)
}

fn build_user_apps(workspace_root: &Path, target: &str) {
    let status = Command::new("cargo")
        .current_dir(workspace_root)
        .args([
            "build",
            "-p",
            "user",
            "--bins",
            "--target",
            target,
            "--release",
            "--target-dir",
        ])
        .arg(user_target_root(workspace_root))
        .status()
        .expect("failed to spawn cargo for user apps");
    assert!(status.success(), "failed to build user apps");
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
