use core::fmt::{self, Write};

struct Stdout;

impl Write for Stdout {
    fn write_str(&mut self, s: &str) -> fmt::Result {
        for byte in s.bytes() {
            os_sbi::console_putchar(byte);
        }
        Ok(())
    }
}

pub fn init() {}

pub fn print(args: fmt::Arguments) {
    Stdout.write_fmt(args).unwrap();
}

#[macro_export]
macro_rules! print {
    ($fmt:expr) => {
        $crate::console::print(format_args!($fmt))
    };
    ($fmt:expr, $($arg:tt)*) => {
        $crate::console::print(format_args!($fmt, $($arg)*))
    };
}

#[macro_export]
macro_rules! println {
    () => {
        $crate::print!("\n")
    };
    ($fmt:expr) => {
        $crate::print!(concat!($fmt, "\n"))
    };
    ($fmt:expr, $($arg:tt)*) => {
        $crate::print!(concat!($fmt, "\n"), $($arg)*)
    };
}
