use anyhow::Result;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs::File, io::Read, path::Path};
use log::{info, warn, debug};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DupGroup {
    pub hash: String,
    pub files: Vec<String>,
}

pub async fn detect(paths: Vec<String>) -> Result<Vec<DupGroup>> {
    use std::collections::HashMap;
    info!("dedup::detect start: paths={}", paths.len());
    let mut map: HashMap<String, Vec<String>> = HashMap::new();

    for p in paths {
        if let Some(h) = hash_file(&p)? {
            map.entry(h).or_default().push(p);
        }
    }

    let groups: Vec<DupGroup> = map.into_iter()
        .filter_map(|(h, files)| if files.len() > 1 { Some(DupGroup { hash: h, files }) } else { None })
        .collect();
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