use anyhow::Result;
use serde::{Deserialize, Serialize};
use tantivy::{schema::*, Index, doc};
use std::{fs, io::Read};
use log::info;

use crate::scanner::FileMeta;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexOptions {
    pub index_dir: String,
    pub enable_content_parse: bool,
}

pub async fn build(files: Vec<FileMeta>, opts: IndexOptions) -> Result<()> {
    info!("indexer::build start: files={}, index_dir={}, content_parse={}", files.len(), opts.index_dir, opts.enable_content_parse);
    let mut schema_builder = Schema::builder();

    // 字段选项在 tantivy 0.22 中需使用 Options 显式设置
    // 确保 path 可索引，以支持 delete_term/upsert
    let f_path = schema_builder.add_text_field(
        "path",
        TextOptions::default()
            .set_stored()
            .set_indexing_options(TextFieldIndexing::default()),
    );
    let f_name = schema_builder.add_text_field(
        "name",
        TextOptions::default()
            .set_stored()
            .set_indexing_options(TextFieldIndexing::default()),
    );
    let f_ext = schema_builder.add_text_field(
        "ext",
        TextOptions::default().set_stored(),
    );
    let f_content = schema_builder.add_text_field(
        "content",
        TextOptions::default().set_indexing_options(TextFieldIndexing::default()),
    );
    // 摘要片段：存储简短文本，便于结果页展示
    let f_summary = schema_builder.add_text_field(
        "summary",
        TextOptions::default().set_stored(),
    );
    let f_size = schema_builder.add_u64_field("size", NumericOptions::default().set_stored());
    let f_modified = schema_builder.add_i64_field("modified_ts", NumericOptions::default().set_stored());
    let schema = schema_builder.build();

    std::fs::create_dir_all(&opts.index_dir)?;
    let index = Index::create_in_dir(&opts.index_dir, schema.clone())?;

    let mut writer = index.writer(50_000_000)?; // 50MB

    let mut processed = 0usize;
    let sample_every: usize = std::env::var("SE_INDEX_LOG_SAMPLE_EVERY").ok().and_then(|v| v.parse().ok()).unwrap_or(500);
    for fm in files {
        let mut doc = doc!(
            f_path => fm.path.clone(),
            f_name => fm.file_name.clone(),
            f_ext => fm.ext.clone(),
            f_size => fm.size,
            f_modified => fm.modified_ts,
        );

        if opts.enable_content_parse {
            if let Some(text) = parse_content(&fm).await {
                doc.add_text(f_content, &text);
                // 生成简短摘要（前 300 个字符）
                let summary: String = text.chars().take(300).collect();
                if !summary.is_empty() {
                    doc.add_text(f_summary, &summary);
                }
            }
        }
        writer.add_document(doc)?;
        processed += 1;
        if processed % sample_every == 0 { info!("indexer sample[{}]: {}", processed, fm.file_name); }
    }

    writer.commit()?;
    info!("indexer::build done: indexed={}", processed);
    Ok(())
}

async fn parse_content(_fm: &FileMeta) -> Option<String> {
    // 先支持纯文本类文件，限制最大读取大小，避免占用过多内存
    let ext = _fm.ext.as_str();
    let text_like = ["txt", "md", "csv", "log", "json", "xml", "ini", "conf", "yaml", "yml"];
    if !text_like.iter().any(|e| e.eq_ignore_ascii_case(ext)) {
        return None;
    }
    // 最大读取 1MB
    let max_bytes: usize = 1_000_000;
    let path = std::path::Path::new(&_fm.path);
    if !path.exists() || !path.is_file() { return None; }
    let mut file = match fs::File::open(path) { Ok(f) => f, Err(_) => return None };
    let mut buf = Vec::with_capacity(max_bytes);
    let mut handle = file.by_ref().take(max_bytes as u64);
    if handle.read_to_end(&mut buf).is_err() { return None; }
    let text = String::from_utf8_lossy(&buf).to_string();
    Some(text)
}