use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use log::{info, warn};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub search_mode: String, // "inverted" | "hybrid" | "vector"
    pub scan_roots: Vec<String>,
    pub exclude_patterns: Vec<String>,
    pub index_dir: String,
    pub path_max_len: u32,
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
        // 默认：Windows 为所有可用盘符，其它系统为当前用户目录
        #[cfg(target_os = "windows")]
        let default_roots: Vec<String> = {
            let mut drives = Vec::new();
            for c in b'A'..=b'Z' {
                let d = format!("{}:/", c as char);
                if Path::new(&d).exists() { drives.push(d); }
            }
            if drives.is_empty() { vec!["C:/".into()] } else { drives }
        };

        #[cfg(not(target_os = "windows"))]
        let default_roots: Vec<String> = {
            let home = tauri::api::path::home_dir().unwrap_or_else(|| std::path::PathBuf::from("~/"));
            vec![home.to_string_lossy().to_string()]
        };

        // 索引目录：默认当前用户目录下 .searchevery/indexs
        let home = tauri::api::path::home_dir().unwrap_or_else(|| std::path::PathBuf::from("./"));
        let index_dir = home.join(".searchevery").join("indexs");

        let default = AppConfig {
            search_mode: "inverted".into(),
            scan_roots: default_roots,
            exclude_patterns: vec![
                "\\Windows".into(),
                "\\Program Files".into(),
                "\\Program Files (x86)".into(),
                "\\AppData".into(),
                "\\ProgramData".into(),
                "\\Temp".into(),
                "\\$Recycle.Bin".into(),
                "\\System Volume Information".into(),
                "\\node_modules".into(),
            ],
            index_dir: index_dir.to_string_lossy().to_string(),
            path_max_len: 80,
        };
        write_config(&default).await?;
        return Ok(default);
    }
    let s = fs::read_to_string(&p)?;
    info!("config loaded from {:?}", p);
    Ok(serde_json::from_str(&s)?)
}

pub async fn write_config(cfg: &AppConfig) -> Result<()> {
    let p = config_path()?;
    let s = serde_json::to_string_pretty(cfg)?;
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