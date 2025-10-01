use anyhow::Result;
use serde::{Deserialize, Serialize};
use walkdir::WalkDir;
use log::{info, debug};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileMeta {
    pub path: String,
    pub file_name: String,
    pub ext: String,
    pub size: u64,
    pub modified_ts: i64,
}

pub async fn scan(opts: super::ScanOptions) -> Result<Vec<FileMeta>> {
    info!("scanner::scan start: roots={:?}", opts.roots);
    let mut results = Vec::new();
    let max_bytes = opts.max_file_size_mb.map(|m| m * 1024 * 1024);
    let mut scanned_files: usize = 0;
    let sample_every: usize = std::env::var("SE_SCAN_LOG_SAMPLE_EVERY").ok().and_then(|v| v.parse().ok()).unwrap_or(200);

    for root in opts.roots {
        info!("scanner scanning root: {}", root);
        for entry in WalkDir::new(&root).follow_links(opts.follow_symlinks) {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };
            if !entry.file_type().is_file() {
                continue;
            }
            let path = entry.path();
            let path_str = match path.to_str() { Some(s) => s.to_string(), None => continue };

            // exclude patterns (simple contains for now)
            if opts.exclude_patterns.iter().any(|p| path_str.contains(p)) { debug!("excluded by pattern: {}", path_str); continue; }

            let md = match path.metadata() { Ok(m) => m, Err(_) => continue };
            if let Some(mb) = max_bytes { if md.len() > mb { debug!("skip by size (>{} bytes): {}", mb, path_str); continue; } }
            let file_name = path.file_name().and_then(|s| s.to_str()).unwrap_or("").to_string();
            let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
            let modified_ts = md.modified().ok()
                .and_then(|t| t.elapsed().ok())
                .map(|e| chrono::Utc::now().timestamp() - e.as_secs() as i64)
                .unwrap_or(0);

            results.push(FileMeta {
                path: path_str,
                file_name,
                ext,
                size: md.len(),
                modified_ts,
            });

            scanned_files += 1;
            if scanned_files % sample_every == 0 {
                info!("scanner sample[{}]", scanned_files);
            }
        }
    }
    info!("scanner::scan done: total_files={}", results.len());
    Ok(results)
}