// @ts-ignore
import zsm from '../assets/zsm.png'

export default function AboutPage() {
  return (
    <div className="panel">
      <div className="panel-header">
        <div className="status">关于产品</div>
      </div>
      <div className="panel-body about-body">
        <img src={zsm} alt="skm" className="skm-float" />
        <ul className="about">
          <li>产品名：SearchEvery</li>
          <li>版本：预览版</li>
          <li>技术栈：React + Vite 前端，Tauri + Rust 后端，Tantivy 搜索引擎</li>
        </ul>
        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>产品简介</div>
          <div className="muted">SearchEvery 致力于在本地海量文件中快速检索与定位，提供稳定、可配置且易用的搜索体验。</div>
          <div style={{ fontWeight: 600, margin: '12px 0 6px' }}>功能说明</div>
          <ul className="features">
            <li>目录扫描与排除：可设置根目录与排除模式（如 \\Windows, \\Program Files）。</li>
            <li>索引构建：支持倒排索引，带实时进度事件与状态展示。</li>
            <li>内容解析：可选文本类文件解析以生成摘要（需启用）。</li>
            <li>检索与筛选：关键词搜索、精确短语与正则高亮、扩展名过滤、大小范围（MB 单位）、结果排序（综合/时间/大小）。</li>
            <li>结果查看：表格/卡片视图切换，支持打开文件所在位置。</li>
            <li>主题与语言：多主题（护眼/明亮/暗黑/科技/天蓝/暗紫/暗灰），中英文切换。</li>
            <li>重复文件：预留功能，后续将支持按组展示与清理策略。</li>
          </ul>
          <div style={{ fontWeight: 600, margin: '12px 0 6px' }}>隐私与许可</div>
          <ul className="features">
            <li>所有数据处理均在本地完成，除非用户手动分享，程序不会上传任何文件或索引。</li>
            <li>开源许可：MIT License；欢迎反馈与贡献。</li>
          </ul>
          <div style={{ fontWeight: 600, margin: '12px 0 6px' }}>路线图（预告）</div>
          <ul className="features">
            <li>更多内容类型解析与预览支持。</li>
            <li>更细粒度的筛选维度与排序策略。</li>
            <li>重复文件识别与清理策略落地。</li>
          </ul>
        </div>
      </div>
      <div className="panel-footer">
        <div className="copyright">
          <div className="copy-content">
            <div className="copy-title">版权声明</div>
            <div>© 2025 七夜工作室 · 保留所有权利</div>
            <div className="muted">MIT License · 联系：qiye2025@qq.com · 代码仓库：
              <a href="https://github.com/smart-open/SearchEvery" target="_blank" rel="noopener noreferrer">github.com/smart-open/SearchEvery</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
