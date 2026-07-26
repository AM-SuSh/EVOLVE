//! File system integration (lab5 embedded / lab6 disk).

#[cfg(all(feature = "lab5", not(feature = "lab6")))]
mod embedded;
#[cfg(feature = "lab6")]
mod disk;

#[cfg(all(feature = "lab5", not(feature = "lab6")))]
pub use embedded::*;
#[cfg(feature = "lab6")]
pub use disk::*;
