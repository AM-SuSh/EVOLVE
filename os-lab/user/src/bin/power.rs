#![no_std]
#![no_main]

extern crate user_lib;

use core::arch::global_asm;
use user_lib::{exit, println};

global_asm!(include_str!("../entry.asm"));

const fn mul_mod(a: usize, b: usize, p: usize) -> usize {
    let mut result = 0usize;
    let mut aa = a % p;
    let mut bb = b;
    while bb > 0 {
        if bb & 1 == 1 {
            result = (result + aa) % p;
        }
        aa = (aa * 2) % p;
        bb >>= 1;
    }
    result
}

const fn pow_mod(mut base: usize, mut exp: usize, p: usize) -> usize {
    let mut result = 1usize;
    base %= p;
    while exp > 0 {
        if exp & 1 == 1 {
            result = mul_mod(result, base, p);
        }
        exp >>= 1;
        base = mul_mod(base, base, p);
    }
    result
}

const RESULT: usize = pow_mod(2, 1_000_000_002, 998_244_353);
const _: () = assert!(RESULT == 409_684_505);

#[no_mangle]
pub fn main() -> ! {
    println("Power test start");
    println("2^1000000002 % 998244353 = 409684505");
    if RESULT == 409_684_505 {
        println("Power check ok");
    }
    exit(0);
}
