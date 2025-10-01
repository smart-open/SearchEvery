use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use log::{info, warn};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    // 为了兼容旧配置文件，所有字段添加默认值
    #[serde(default = "default_search_mode")]
    pub search_mode: String, // "inverted" | "hybrid" | "vector"
    #[serde(default = "default_scan_roots")]
    pub scan_roots: Vec<String>,
    #[serde(default = "default_exclude_patterns")]
    pub exclude_patterns: Vec<String>,
    #[serde(default = "default_index_dir")]
    pub index_dir: String,
    #[serde(default = "default_path_max_len")]
    pub path_max_len: u32,
    #[serde(default = "default_auto_scan_enabled")]
    pub auto_scan_enabled: bool,
}

fn config_path() -> Result<std::path::PathBuf> {
    let base = tauri::api::path::app_config_dir(&tauri::Config::default()).ok_or_else(|| anyhow::anyhow!("config dir not available"))?;
    fs::create_dir_all(&base)?;
    Ok(base.join("config.json"))
}

pub async fn read_config() -> Result<AppConfig> {
    let p = config_path()?;
    if !p.exists() {
        info!("config not found, generating default");
        let default = AppConfig {
            search_mode: default_search_mode(),
            scan_roots: default_scan_roots(),
            exclude_patterns: default_exclude_patterns(),
            index_dir: default_index_dir(),
            path_max_len: default_path_max_len(),
            auto_scan_enabled: default_auto_scan_enabled(),
        };
        write_config(&default).await?;
        return Ok(default);
    }
    let s = fs::read_to_string(&p)?;
    info!("config loaded from {:?}", p);
    // 兼容旧配置文件缺失字段：通过 serde 默认值填充
    let mut cfg: AppConfig = serde_json::from_str(&s)?;
    // 防御性修复：若某些关键字段为空，则补全默认值
    if cfg.search_mode.trim().is_empty() { cfg.search_mode = default_search_mode(); }
    if cfg.scan_roots.is_empty() { cfg.scan_roots = default_scan_roots(); }
    if cfg.exclude_patterns.is_empty() { cfg.exclude_patterns = default_exclude_patterns(); }
    if cfg.index_dir.trim().is_empty() { cfg.index_dir = default_index_dir(); }
    if cfg.path_max_len == 0 { cfg.path_max_len = default_path_max_len(); }

    // 开发模式防御：若 index_dir 位于 src-tauri 目录内，改写为默认目录，避免开发重建循环
    if cfg.index_dir.to_lowercase().contains("src-tauri") {
        warn!("index_dir points into src-tauri; redirecting to default index directory to avoid dev rebuilds");
        cfg.index_dir = default_index_dir();
    }
    Ok(cfg)
}

pub async fn write_config(cfg: &AppConfig) -> Result<()> {
    let p = config_path()?;
    // 写入前防御：避免将 index_dir 设为 src-tauri 下路径
    let mut cfg_fixed = cfg.clone();
    if cfg_fixed.index_dir.to_lowercase().contains("src-tauri") {
        warn!("write_config: index_dir is under src-tauri, redirecting to default to avoid dev rebuilds");
        cfg_fixed.index_dir = default_index_dir();
    }
    let s = serde_json::to_string_pretty(&cfg_fixed)?;
    fs::write(&p, s)?;
    info!("config written to {:?}", p);
    Ok(())
}

// 重置配置：删除现有配置文件并返回新的默认配置
pub async fn reset_config() -> Result<AppConfig> {
    let p = config_path()?;
    if p.exists() {
        // 尝试删除旧配置文件；忽略删除失败以保证流程继续
        let _ = fs::remove_file(&p);
        warn!("old config removed: {:?}", p);
    }
    // 读取将触发默认配置生成
    read_config().await
}

// ---- 默认值函数：用于反序列化缺失字段 ----
fn default_search_mode() -> String { "inverted".into() }

fn default_scan_roots() -> Vec<String> {
    #[cfg(target_os = "windows")]
    {
        let mut drives = Vec::new();
        for c in b'A'..=b'Z' {
            let d = format!("{}:/", c as char);
            if Path::new(&d).exists() { drives.push(d); }
        }
        if drives.is_empty() { vec!["C:/".into()] } else { drives }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let home = tauri::api::path::home_dir().unwrap_or_else(|| std::path::PathBuf::from("~/"));
        vec![home.to_string_lossy().to_string()]
    }
}

fn default_exclude_patterns() -> Vec<String> {
    vec![
        "\\Windows".into(),
        "\\Program Files".into(),
        "\\Program Files (x86)".into(),
        "\\AppData".into(),
        "\\ProgramData".into(),
        "\\Temp".into(),
        "\\$Recycle.Bin".into(),
        "\\System Volume Information".into(),
        "\\node_modules".into(),
    ]
}

fn default_index_dir() -> String {
    let home = tauri::api::path::home_dir().unwrap_or_else(|| std::path::PathBuf::from("./"));
    home.join(".searchevery").join("indexs").to_string_lossy().to_string()
}

fn default_path_max_len() -> u32 { 80 }

fn default_auto_scan_enabled() -> bool { true }