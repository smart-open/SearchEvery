use serde::{Deserialize, Serialize};
use sysinfo::System;
use log::info;

use crate::{config, pipeline_state};

#[derive(Debug, Serialize, Deserialize)]
pub struct DiagnosticsReport {
    pub index_dir: String,
    pub index_open_ok: bool,
    pub index_doc_count: Option<usize>,
    pub schema_fields: Option<Vec<String>>,
    pub config_scan_roots_count: usize,
    pub config_auto_scan_enabled: bool,
    pub pipeline_started: bool,
    pub pipeline_completed: bool,
    pub pipeline_last_day: Option<String>,
    pub sys_cpu_avg: Option<f32>,
    pub sys_total_mem_kib: Option<u64>,
    pub sys_free_mem_kib: Option<u64>,
    pub warnings: Vec<String>,
}

#[tauri::command]
pub async fn diagnostics_report() -> Result<DiagnosticsReport, String> {
    use tantivy::{Index, query::AllQuery, collector::Count};

    let cfg = config::read_config().await.map_err(|e| e.to_string())?;
    let mut warnings: Vec<String> = Vec::new();

    if cfg.scan_roots.is_empty() {
        warnings.push("config.scan_roots is empty".into());
    }
    if cfg.index_dir.trim().is_empty() {
        warnings.push("config.index_dir is empty".into());
    }
    if !std::path::Path::new(&cfg.index_dir).exists() {
        warnings.push("index_dir does not exist".into());
    }

    // pipeline state
    let st = pipeline_state::load_state(&cfg.index_dir).unwrap_or_default();

    // system info
    let mut sys = System::new_all();
    sys.refresh_memory();
    sys.refresh_cpu();
    let sys_total_mem_kib = Some(sys.total_memory());
    let sys_free_mem_kib = Some(sys.free_memory());
    let sys_cpu_avg: Option<f32> = {
        let cpus = sys.cpus();
        if cpus.is_empty() { None } else {
            Some(cpus.iter().map(|c| c.cpu_usage()).sum::<f32>() / (cpus.len() as f32))
        }
    };

    // index status
    let mut index_open_ok = false;
    let mut index_doc_count: Option<usize> = None;
    let mut schema_fields: Option<Vec<String>> = None;
    if std::path::Path::new(&cfg.index_dir).exists() {
        match Index::open_in_dir(&cfg.index_dir) {
            Ok(index) => {
                index_open_ok = true;
                // schema fields
                let names: Vec<String> = index
                    .schema()
                    .fields()
                    .map(|(_f, entry)| entry.name().to_string())
                    .collect();
                schema_fields = Some(names);
                // doc count via Count collector
                if let Ok(reader) = index.reader() {
                    let searcher = reader.searcher();
                    if let Ok(cnt) = searcher.search(&AllQuery, &Count) {
                        index_doc_count = Some(cnt);
                    }
                }
            }
            Err(e) => {
                warnings.push(format!("open index failed: {}", e));
            }
        }
    }

    let report = DiagnosticsReport {
        index_dir: cfg.index_dir.clone(),
        index_open_ok,
        index_doc_count,
        schema_fields,
        config_scan_roots_count: cfg.scan_roots.len(),
        config_auto_scan_enabled: cfg.auto_scan_enabled,
        pipeline_started: st.last_day.is_some() && !st.completed,
        pipeline_completed: st.completed,
        pipeline_last_day: st.last_day,
        sys_cpu_avg,
        sys_total_mem_kib,
        sys_free_mem_kib,
        warnings,
    };
    info!("diagnostics_report generated");
    Ok(report)
}