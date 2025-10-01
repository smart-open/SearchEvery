#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod scanner;
mod indexer;
mod search;
mod dedup;
mod config;

use serde::{Deserialize, Serialize};
use std::process::Command;
use serde_json::json;
use log::{info, warn, debug, error};

fn init_logging() {
    use std::path::PathBuf;
    use std::fs::OpenOptions;
    use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};
    use tracing_log::LogTracer;
    use once_cell::sync::OnceCell;
    use chrono::Local;
    use tracing_appender::non_blocking::WorkerGuard;

    static FILE_GUARDS: OnceCell<Vec<WorkerGuard>> = OnceCell::new();

    // logs 目录：位于可执行文件同级目录下
    let exe_dir: PathBuf = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));
    let logs_dir = exe_dir.join("logs");
    let _ = std::fs::create_dir_all(&logs_dir);

    // 当前日志文件：SearchEvery.log
    let current_path = logs_dir.join("SearchEvery.log");
    let current_file = OpenOptions::new().create(true).append(true).open(&current_path)
        .unwrap_or_else(|_| OpenOptions::new().create(true).write(true).open(&current_path).unwrap());
    let (file_nb_current, guard_current) = tracing_appender::non_blocking(current_file);

    // 每日日志文件：SearchEvery-yyyy-dd-mm.log（使用本地日期格式）
    let day_str = Local::now().format("%Y-%d-%m").to_string();
    let daily_path = logs_dir.join(format!("SearchEvery-{}.log", day_str));
    let daily_file = OpenOptions::new().create(true).append(true).open(&daily_path)
        .unwrap_or_else(|_| OpenOptions::new().create(true).write(true).open(&daily_path).unwrap());
    let (file_nb_daily, guard_daily) = tracing_appender::non_blocking(daily_file);

    // 控制台输出（开发模式便于调试）
    let (stdout_nb, _stdout_guard) = tracing_appender::non_blocking(std::io::stdout());

    // 将 log crate 事件桥接到 tracing
    let _ = LogTracer::init();

    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info"));

    tracing_subscriber::registry()
        .with(fmt::layer().with_ansi(true).with_target(false).with_writer(stdout_nb))
        .with(fmt::layer().with_ansi(false).with_target(true).with_writer(file_nb_current))
        .with(fmt::layer().with_ansi(false).with_target(true).with_writer(file_nb_daily))
        .with(env_filter)
        .init();

    // 保存 guards，避免日志丢失
    let _ = FILE_GUARDS.set(vec![guard_current, guard_daily]);
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ScanOptions {
    pub roots: Vec<String>,
    pub exclude_patterns: Vec<String>,
    pub max_file_size_mb: Option<u64>,
    pub follow_symlinks: bool,
}

#[tauri::command]
async fn scan_paths(opts: ScanOptions) -> Result<Vec<scanner::FileMeta>, String> {
    info!("scan_paths invoked: roots={:?}, exclude={:?}, max_file_size_mb={:?}, follow_symlinks={}",
        opts.roots, opts.exclude_patterns, opts.max_file_size_mb, opts.follow_symlinks);
    scanner::scan(opts).await.map_err(|e| e.to_string())
}

// 扫描目录（带进度事件）：实时发送已扫描文件数量
#[tauri::command]
async fn scan_paths_progress(opts: ScanOptions, window: tauri::Window) -> Result<Vec<scanner::FileMeta>, String> {
    use walkdir::WalkDir;

    let mut results: Vec<scanner::FileMeta> = Vec::new();
    let max_bytes = opts.max_file_size_mb.map(|m| m * 1024 * 1024);
    info!("scan_paths_progress start: roots={:?}", opts.roots);
    let mut scanned_files: usize = 0;
    let sample_every: usize = std::env::var("SE_SCAN_LOG_SAMPLE_EVERY").ok().and_then(|v| v.parse().ok()).unwrap_or(200);

    for root in opts.roots {
        info!("scanning root: {}", root);
        for entry in WalkDir::new(&root).follow_links(opts.follow_symlinks) {
            let entry = match entry { Ok(e) => e, Err(_) => continue };
            if !entry.file_type().is_file() { continue; }
            let path = entry.path();
            let path_str = match path.to_str() { Some(s) => s.to_string(), None => continue };

            // exclude patterns（简单包含匹配）
            if opts.exclude_patterns.iter().any(|p| path_str.contains(p)) {
                debug!("excluded by pattern: {}", path_str);
                continue;
            }

            let md = match path.metadata() { Ok(m) => m, Err(_) => continue };
            if let Some(mb) = max_bytes { if md.len() > mb { debug!("skip by size (>{} bytes): {}", mb, path_str); continue; } }

            let file_name = path.file_name().and_then(|s| s.to_str()).unwrap_or("").to_string();
            let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
            let modified_ts = md.modified().ok()
                .and_then(|t| t.elapsed().ok())
                .map(|e| chrono::Utc::now().timestamp() - e.as_secs() as i64)
                .unwrap_or(0);

            results.push(scanner::FileMeta {
                path: path_str.clone(),
                file_name: file_name.clone(),
                ext,
                size: md.len(),
                modified_ts,
            });

            scanned_files += 1;
            if scanned_files % sample_every == 0 {
                info!("scanning sample[{}]: {}", scanned_files, path_str);
            }

            let _ = window.emit("scan_progress", json!({
                "current": results.len(),
                "path": path_str,
                "name": file_name,
            }));
        }
    }

    let _ = window.emit("scan_done", json!({ "total": results.len() }));
    info!("scan_paths_progress done: total_files={}", results.len());
    Ok(results)
}

#[tauri::command]
async fn build_inverted_index(files: Vec<scanner::FileMeta>, opts: indexer::IndexOptions) -> Result<(), String> {
    info!("build_inverted_index invoked: files={}, index_dir={}, content_parse={}",
        files.len(), opts.index_dir, opts.enable_content_parse);
    indexer::build(files, opts).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn search_query(req: search::QueryRequest) -> Result<Vec<search::SearchResult>, String> {
    info!("search_query: q='{}', index_dir='{}'", req.query, req.index_dir);
    search::query(req).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn detect_duplicates(paths: Vec<String>) -> Result<Vec<dedup::DupGroup>, String> {
    info!("detect_duplicates: input_paths={}", paths.len());
    dedup::detect(paths).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn read_config() -> Result<config::AppConfig, String> {
    info!("read_config invoked");
    config::read_config().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn write_config(cfg: config::AppConfig) -> Result<(), String> {
    info!("write_config invoked");
    config::write_config(&cfg).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn reset_config() -> Result<config::AppConfig, String> {
    warn!("reset_config invoked: existing config will be removed");
    config::reset_config().await.map_err(|e| e.to_string())
}

// 打开所在位置（Windows: explorer /select, ；macOS: open -R；Linux: xdg-open 目录）
#[tauri::command]
fn open_location(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer").arg("/select,").arg(path).spawn().map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open").arg("-R").arg(path).spawn().map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        use std::path::Path;
        let p = Path::new(&path);
        let dir = if p.is_file() { p.parent().unwrap_or(p) } else { p };
        Command::new("xdg-open").arg(dir).spawn().map_err(|e| e.to_string())?;
        return Ok(());
    }
}

fn main() {
    init_logging();
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            scan_paths,
            scan_paths_progress,
            build_inverted_index,
            build_inverted_index_progress,
            search_query,
            detect_duplicates,
            read_config,
            write_config,
            reset_config,
            open_location
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// 构建索引（带进度事件）
#[tauri::command]
async fn build_inverted_index_progress(
    files: Vec<scanner::FileMeta>,
    opts: indexer::IndexOptions,
    window: tauri::Window,
) -> Result<(), String> {
    use tantivy::{schema::*, Index, doc};
    use std::{fs, io::Read};

    // 构建 schema（与 indexer.rs 保持一致，包含 summary 字段）
    let mut schema_builder = Schema::builder();
    let f_path = schema_builder.add_text_field("path", TextOptions::default().set_stored());
    let f_name = schema_builder.add_text_field(
        "name",
        TextOptions::default()
            .set_stored()
            .set_indexing_options(TextFieldIndexing::default()),
    );
    let f_ext = schema_builder.add_text_field("ext", TextOptions::default().set_stored());
    let f_content = schema_builder.add_text_field(
        "content",
        TextOptions::default().set_indexing_options(TextFieldIndexing::default()),
    );
    let f_summary = schema_builder.add_text_field("summary", TextOptions::default().set_stored());
    let f_size = schema_builder.add_u64_field("size", NumericOptions::default().set_stored());
    let f_modified = schema_builder.add_i64_field("modified_ts", NumericOptions::default().set_stored());
    let schema = schema_builder.build();

    std::fs::create_dir_all(&opts.index_dir).map_err(|e| e.to_string())?;
    let index = Index::create_in_dir(&opts.index_dir, schema.clone()).map_err(|e| e.to_string())?;
    let mut writer = index.writer(50_000_000).map_err(|e| e.to_string())?; // 50MB

    let total = files.len();
    for (i, fm) in files.into_iter().enumerate() {
        let mut doc = doc!(
            f_path => fm.path.clone(),
            f_name => fm.file_name.clone(),
            f_ext => fm.ext.clone(),
            f_size => fm.size,
            f_modified => fm.modified_ts,
        );

        if opts.enable_content_parse {
            // 仅解析文本类，限制最大 1MB
            let ext = fm.ext.as_str();
            let text_like = ["txt", "md", "csv", "log", "json", "xml", "ini", "conf", "yaml", "yml"];
            if text_like.iter().any(|e| e.eq_ignore_ascii_case(ext)) {
                let max_bytes: usize = 1_000_000;
                let path = std::path::Path::new(&fm.path);
                if path.exists() && path.is_file() {
                    if let Ok(mut file) = fs::File::open(path) {
                        let mut buf = Vec::with_capacity(max_bytes);
                        let mut handle = file.by_ref().take(max_bytes as u64);
                        if handle.read_to_end(&mut buf).is_ok() {
                            if let Ok(text) = String::from_utf8(buf) {
                                doc.add_text(f_content, &text);
                                let summary: String = text.chars().take(300).collect();
                                if !summary.is_empty() {
                                    doc.add_text(f_summary, &summary);
                                }
                            }
                        }
                    }
                }
            }
        }

        writer.add_document(doc).map_err(|e| e.to_string())?;

        let _ = window.emit("index_progress", json!({
            "current": i + 1,
            "total": total,
            "name": fm.file_name,
            "path": fm.path,
        }));
    }

    writer.commit().map_err(|e| e.to_string())?;
    let _ = window.emit("index_done", json!({"ok": true}));
    Ok(())
}