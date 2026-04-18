use super::*;

#[test]
fn is_leap_divisible_by_400() {
    assert!(is_leap(2000));
    assert!(is_leap(1600));
}

#[test]
fn is_leap_divisible_by_4_not_100() {
    assert!(is_leap(2024));
    assert!(is_leap(1996));
}

#[test]
fn is_leap_divisible_by_100_not_400() {
    assert!(!is_leap(1900));
    assert!(!is_leap(2100));
}

#[test]
fn is_leap_non_leap_year() {
    assert!(!is_leap(2023));
    assert!(!is_leap(2025));
}

#[test]
fn format_unix_timestamp_epoch() {
    assert_eq!(format_unix_timestamp(0), "1970-01-01T00:00:00Z");
}

#[test]
fn format_unix_timestamp_one_day_later() {
    assert_eq!(format_unix_timestamp(86400), "1970-01-02T00:00:00Z");
}

#[test]
fn format_unix_timestamp_time_components() {
    // 1 hour + 2 minutes + 3 seconds
    assert_eq!(format_unix_timestamp(3723), "1970-01-01T01:02:03Z");
}

#[test]
fn format_unix_timestamp_end_of_january() {
    assert_eq!(format_unix_timestamp(30 * 86400), "1970-01-31T00:00:00Z");
}

#[test]
fn format_unix_timestamp_leap_day() {
    // Days from epoch to 2024-01-01: 14 leap + 40 non-leap years = 19724
    // Feb 29 is day index 59 (0-based) within 2024
    let days_to_2024: u64 = 19724;
    let leap_day = (days_to_2024 + 59) * 86400;
    assert_eq!(format_unix_timestamp(leap_day), "2024-02-29T00:00:00Z");
}
