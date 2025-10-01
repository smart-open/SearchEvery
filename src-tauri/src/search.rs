use anyhow::Result;
use serde::{Deserialize, Serialize};
use tantivy::{schema::*, Index, query::QueryParser, collector::TopDocs};
use log::{info, debug, warn};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchFilters {
    pub ext: Option<Vec<String>>, // 文件扩展名过滤
    pub min_size: Option<u64>,
    pub max_size: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub path: String,
    pub name: String,
    pub ext: String,
    pub score: f32,
    pub size: Option<u64>,
    pub modified_ts: Option<i64>,
    pub summary: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryRequest {
    pub query: String,
    pub filters: Option<SearchFilters>,
    pub index_dir: String,
}

pub async fn query(req: QueryRequest) -> Result<Vec<SearchResult>> {
    info!("search::query start: q='{}', index='{}'", req.query, req.index_dir);
    let index = Index::open_in_dir(&req.index_dir)?;
    let reader = index.reader()?;
    let searcher = reader.searcher();
    let schema = index.schema();
    let f_name = schema.get_field("name").unwrap();
    let f_content = schema.get_field("content").unwrap();
    let f_ext = schema.get_field("ext").unwrap();
    let f_path = schema.get_field("path").unwrap();
    let f_size = schema.get_field("size").ok();
    let f_modified = schema.get_field("modified_ts").ok();
    let f_summary = schema.get_field("summary").ok();
    let parser = QueryParser::for_index(&index, vec![f_name, f_content]);
    let query = parser.parse_query(&req.query)?;

    let top_docs = searcher.search(&query, &TopDocs::with_limit(50))?;
    let mut results = Vec::new();
    for (score, doc_address) in top_docs {
        let doc: tantivy::TantivyDocument = searcher.doc(doc_address)?;
        let path = doc
            .get_first(f_path)
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let name = doc
            .get_first(f_name)
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let ext = doc
            .get_first(f_ext)
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let size = f_size.and_then(|f| doc.get_first(f)).and_then(|v| v.as_u64());
        let modified_ts = f_modified.and_then(|f| doc.get_first(f)).and_then(|v| v.as_i64());
        let summary = f_summary
            .and_then(|f| doc.get_first(f))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        // 过滤器：扩展名与大小
        if let Some(filters) = &req.filters {
            if let Some(exts) = &filters.ext {
                if !exts.is_empty() && !exts.iter().any(|e| e.eq_ignore_ascii_case(&ext)) {
                    debug!("filter skip by ext: {}", ext);
                    continue;
                }
            }
            if let Some(min_s) = filters.min_size {
                if let Some(sz) = size { if sz < min_s { debug!("filter skip by min_size: {}", sz); continue; } }
            }
            if let Some(max_s) = filters.max_size {
                if let Some(sz) = size { if sz > max_s { debug!("filter skip by max_size: {}", sz); continue; } }
            }
        }

        results.push(SearchResult { path, name, ext, score, size, modified_ts, summary });
    }
    info!("search::query done: results={}", results.len());
    Ok(results)
}