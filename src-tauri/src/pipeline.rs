use serde_json::json;
use log::info;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::sync::Mutex;
use num_cpus;
use sysinfo::System;

use tauri::{Window, AppHandle};
use tauri::Manager; // for Window::app_handle and AppHandle::get_window

use crate::{indexer, config, pipeline_state};

// 合并扫描与索引：扫描到文件即投递到索引构建（多线程，资源感知）
#[tauri::command]
pub async fn scan_and_index_pipeline(
    opts: crate::ScanOptions,
    index_opts: indexer::IndexOptions,
    window: Window,
) -> Result<(), String> {
    let handle = window.app_handle();
    scan_and_index_pipeline_internal(opts.roots, opts.exclude_patterns, index_opts, handle).await
}

pub async fn scan_and_index_pipeline_internal(
    roots: Vec<String>,
    exclude_patterns: Vec<String>,
    index_opts: indexer::IndexOptions,
    app: AppHandle,
) -> Result<(), String> {
    use walkdir::WalkDir;
    use tantivy::{schema::*, Index, doc, Term};
    use std::{fs, io::Read};

    // 初始化 schema 与索引（path 可索引）
    let mut schema_builder = Schema::builder();
    let f_path = schema_builder.add_text_field("path", TextOptions::default().set_stored().set_indexing_options(TextFieldIndexing::default()));
    let f_name = schema_builder.add_text_field("name", TextOptions::default().set_stored().set_indexing_options(TextFieldIndexing::default()));
    let f_ext = schema_builder.add_text_field("ext", TextOptions::default().set_stored());
    let f_content = schema_builder.add_text_field("content", TextOptions::default().set_indexing_options(TextFieldIndexing::default()));
    let f_summary = schema_builder.add_text_field("summary", TextOptions::default().set_stored());
    let f_size = schema_builder.add_u64_field("size", NumericOptions::default().set_stored());
    let f_modified = schema_builder.add_i64_field("modified_ts", NumericOptions::default().set_stored());
    let schema = schema_builder.build();

    std::fs::create_dir_all(&index_opts.index_dir).map_err(|e| e.to_string())?;
    let index = match Index::open_in_dir(&index_opts.index_dir) {
        Ok(idx) => idx,
        Err(_) => Index::create_in_dir(&index_opts.index_dir, schema.clone()).map_err(|e| e.to_string())?,
    };

    // 资源感知的线程池：保留至少 2 个核心
    let cpu = num_cpus::get_physical().max(1);
    let threads = cpu.saturating_sub(2).max(1);
    let pool = rayon::ThreadPoolBuilder::new().num_threads(threads).build().map_err(|e| e.to_string())?;

    // 根据可用内存调整 writer 堆大小（保守设置）
    let mut sys = System::new();
    sys.refresh_memory();
    let total_mem = sys.total_memory(); // KiB
    let writer_heap_bytes: usize = ((total_mem as usize / 1024) / 64).min(100) * 1_000_000; // ~ total/64 MB, cap 100MB
    // 使用单一 Writer（加锁共享），避免并发创建多个 writer 导致写入失败
    let writer: Arc<Mutex<tantivy::IndexWriter<tantivy::TantivyDocument>>> = Arc::new(
        Mutex::new(
            index.writer::<tantivy::TantivyDocument>(writer_heap_bytes)
                 .map_err(|e| e.to_string())?
        )
    );

    let window = app.get_window("main");
    let emit = |name: &str, payload: serde_json::Value| {
        if let Some(w) = &window { let _ = w.emit(name, payload); }
        else { let _ = app.emit_all(name, payload); }
    };

    let max_bytes_opt: Option<u64> = Some(500 * 1024 * 1024); // 500MB 上限
    let mut scanned_files: usize = 0;
    let total_counter = Arc::new(AtomicUsize::new(0));

    info!("pipeline start: roots={:?}, index_dir={}", roots, index_opts.index_dir);
    let _ = pipeline_state::mark_started(&index_opts.index_dir);

    for root in roots {
        info!("pipeline scanning root: {}", root);
        for entry in WalkDir::new(&root).follow_links(false) {
            let entry = match entry { Ok(e) => e, Err(_) => continue };
            if !entry.file_type().is_file() { continue; }
            let path = entry.path();
            let path_str = match path.to_str() { Some(s) => s.to_string(), None => continue };
            if exclude_patterns.iter().any(|p| path_str.contains(p)) { continue; }
            let md = match path.metadata() { Ok(m) => m, Err(_) => continue };
            if let Some(mb) = max_bytes_opt { if md.len() > mb { continue; } }
            let file_name = path.file_name().and_then(|s| s.to_str()).unwrap_or("").to_string();
            let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
            // 使用文件实际的 UNIX 时间戳（秒）
            let modified_ts = md
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0);

            scanned_files += 1;
            emit("scan_progress", json!({"current": scanned_files, "path": path_str, "name": file_name}));

            // index_clone was unused; remove to avoid warning
            let index_opts_clone = index_opts.clone();
            let f_path_c = f_path.clone();
            let f_name_c = f_name.clone();
            let f_ext_c = f_ext.clone();
            let f_content_c = f_content.clone();
            let f_summary_c = f_summary.clone();
            let f_size_c = f_size.clone();
            let f_modified_c = f_modified.clone();
            let app_c = app.clone();
            let total_c = total_counter.clone();

            let writer_c = writer.clone();
            pool.spawn(move || {
                // 统一使用删除后写入的策略，确保去重（即便查询快照未包含最新提交）
                let term = Term::from_field_text(f_path_c, &path_str);

                let mut doc = doc!(
                    f_path_c => path_str.clone(),
                    f_name_c => file_name.clone(),
                    f_ext_c => ext.clone(),
                    f_size_c => md.len(),
                    f_modified_c => modified_ts,
                );
                if index_opts_clone.enable_content_parse {
                    let text_like = ["txt", "md", "csv", "log", "json", "xml", "ini", "conf", "yaml", "yml"];
                    if text_like.iter().any(|e| e.eq_ignore_ascii_case(ext.as_str())) {
                        let max_bytes: usize = 1_000_000;
                        if let Ok(mut file) = fs::File::open(&path_str) {
                            let mut buf = Vec::with_capacity(max_bytes);
                            let mut handle = file.by_ref().take(max_bytes as u64);
                            if handle.read_to_end(&mut buf).is_ok() {
                                if let Ok(text) = String::from_utf8(buf) {
                                    doc.add_text(f_content_c, &text);
                                    let summary: String = text.chars().take(300).collect();
                                    if !summary.is_empty() { doc.add_text(f_summary_c, &summary); }
                                }
                            }
                        }
                    }
                }
                if let Ok(mut w) = writer_c.lock() {
                    let _ = w.delete_term(term);
                    let _ = w.add_document(doc);
                    let _ = w.commit();
                }
                let cur = total_c.fetch_add(1, Ordering::SeqCst) + 1;
                let _ = app_c.emit_all("index_progress", json!({"current": cur, "name": file_name, "path": path_str}));
            });
        }
    }

    emit("scan_done", json!({"total": scanned_files}));
    let _ = pipeline_state::mark_completed(&index_opts.index_dir);
    emit("index_done", json!({"ok": true}));
    info!("pipeline done: scanned={}", scanned_files);
    Ok(())
}

// 前端手动触发自动扫描（立即执行一次）
#[tauri::command]
pub async fn start_auto_scan_now(window: Window) -> Result<(), String> {
    let cfg = config::read_config().await.map_err(|e| e.to_string())?;
    let handle = window.app_handle();
    let _ = handle.emit_all("auto_scan_start", json!({"reason":"manual"}));
    tauri::async_runtime::spawn(scan_and_index_pipeline_internal(
        cfg.scan_roots.clone(),
        cfg.exclude_patterns.clone(),
        indexer::IndexOptions { index_dir: cfg.index_dir.clone(), enable_content_parse: false },
        handle,
    ));
    Ok(())
}