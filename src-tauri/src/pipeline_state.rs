use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
// 将管道状态文件写到应用配置目录，避免在开发模式下写入 src-tauri 目录导致重建
// 与 config.rs 的配置存储位置保持一致

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct PipelineState {
    pub last_day: Option<String>,
    pub completed: bool,
}

fn state_path(_index_dir: &str) -> PathBuf {
    // 使用 Tauri 的应用配置目录作为状态文件位置
    // 注意：这里不区分不同 index_dir，状态文件为全局单一文件
    let base = tauri::api::path::app_config_dir(&tauri::Config::default())
        .unwrap_or_else(|| std::path::PathBuf::from("./"));
    base.join("scan_state.json")
}

pub fn load_state(index_dir: &str) -> anyhow::Result<PipelineState> {
    let p = state_path(index_dir);
    if !p.exists() { return Ok(PipelineState::default()); }
    let s = fs::read_to_string(p)?;
    Ok(serde_json::from_str(&s)?)
}

pub fn mark_started(index_dir: &str) -> anyhow::Result<()> {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let st = PipelineState { last_day: Some(today), completed: false };
    let p = state_path(index_dir);
    if let Some(dir) = p.parent() { let _ = fs::create_dir_all(dir); }
    fs::write(p, serde_json::to_string_pretty(&st)?)?;
    Ok(())
}

pub fn mark_completed(index_dir: &str) -> anyhow::Result<()> {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let st = PipelineState { last_day: Some(today), completed: true };
    let p = state_path(index_dir);
    if let Some(dir) = p.parent() { let _ = fs::create_dir_all(dir); }
    fs::write(p, serde_json::to_string_pretty(&st)?)?;
    Ok(())
}