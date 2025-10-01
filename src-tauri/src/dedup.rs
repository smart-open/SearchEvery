use anyhow::Result;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs::File, io::Read, path::Path};
use log::info;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DupGroup {
    // kind: "hash" 或 "name"
    pub kind: String,
    // key: 若 kind=hash 则为内容哈希；若 kind=name 则为文件名
    pub key: String,
    pub files: Vec<String>,
}

pub async fn detect(paths: Vec<String>) -> Result<Vec<DupGroup>> {
    use std::collections::HashMap;
    info!("dedup::detect start: paths={}", paths.len());
    let mut hash_map: HashMap<String, Vec<String>> = HashMap::new();
    let mut name_map: HashMap<String, Vec<String>> = HashMap::new();

    for p in &paths {
        // 名称分组（不含路径）
        if let Some(name) = std::path::Path::new(p).file_name().and_then(|s| s.to_str()) {
            name_map.entry(name.to_string()).or_default().push(p.clone());
        }
    }

    // 计算内容哈希（可能耗时，放最后）
    for p in paths {
        if let Some(h) = hash_file(&p)? {
            hash_map.entry(h).or_default().push(p);
        }
    }

    let mut groups: Vec<DupGroup> = Vec::new();
    // hash 组
    for (h, files) in hash_map.into_iter() {
        if files.len() > 1 {
            groups.push(DupGroup { kind: "hash".to_string(), key: h, files });
        }
    }
    // name 组
    for (name, files) in name_map.into_iter() {
        if files.len() > 1 {
            groups.push(DupGroup { kind: "name".to_string(), key: name, files });
        }
    }

    info!("dedup::detect done: groups={}", groups.len());
    Ok(groups)
}

fn hash_file(path: &str) -> Result<Option<String>> {
    let p = Path::new(path);
    if !p.exists() || !p.is_file() {
        return Ok(None);
    }
    let mut file = File::open(p)?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 8192];
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 { break; }
        hasher.update(&buf[..n]);
    }
    Ok(Some(hex::encode(hasher.finalize())))
}