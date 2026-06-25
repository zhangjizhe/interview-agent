#!/usr/bin/env python3
"""
重新拆分打标 knowledge-base.json
- 提取 markdown 中的关键概念作为 tags（去重、去停用词）
- 提取简略内容 preview（首段或考察点）
- 保持原有 body 完整
- 与原 tags 字段做并集合并，避免覆盖历史人工标签
"""
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

# 停用词：markdown 标题标记 + 通用废话词
STOPWORDS = {
    # Markdown 标题标记
    '🎯 考察点', '✅ 答题框架', '⚠️ 踩坑点', '💡 简历挂钩',
    '🎯', '✅', '⚠️', '💡', '🔑', '📌', '📝', '🚀',
    # 通用废话
    '答题框架', '考察点', '踩坑点', '简历挂钩', '关键点', '重点', '总结',
    '答', '答题', '问题', '问题？', '?', '？', '：', ':',
    '简述', '说明', '解释', '介绍', '如何', '怎么', '为什么', '哪些',
    '一个', '一种', '一样', '一直', '一些', '一定', '一起',
}

# 维度标签关键词
DIMENSION_KEYWORDS = {
    '原理': ['原理', '本质', '机制', '底层', '为什么'],
    '架构': ['架构', '模式', '范式', '设计', '结构', '拓扑'],
    '性能': ['性能', '优化', '并发', '吞吐', '延迟', '高可用'],
    '存储': ['存储', '记忆', '持久化', '缓存', '数据库'],
    '工具': ['工具', 'MCP', 'Function Call', 'Skill', 'API'],
    '算法': ['算法', '推理', 'CoT', 'ReAct', '规划', '决策'],
    '场景': ['场景', '选型', '实战', '案例', '应用'],
    '对比': ['对比', '区别', '差异', 'vs', '比较'],
    '深挖': ['深挖', '追问', '细节', '实现'],
}

def clean_markdown(md: str) -> str:
    """去除 markdown 标记，返回纯文本"""
    text = md
    # 去除代码块
    text = re.sub(r'```[\s\S]*?```', '', text)
    # 去除行内代码
    text = re.sub(r'`[^`]+`', '', text)
    # 去除加粗
    text = re.sub(r'\*\*([^*]+)\*\*', r'\1', text)
    # 去除斜体
    text = re.sub(r'\*([^*]+)\*', r'\1', text)
    # 去除表格
    text = re.sub(r'\|.*?\|', '', text)
    # 去除分隔线
    text = re.sub(r'---+\s*', '', text)
    # 去除多余空白
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def extract_preview(body: str, max_len: int = 150) -> str:
    """提取简略内容：第一个有意义的段落"""
    text = clean_markdown(body)
    # 优先取第一段
    paragraphs = [p.strip() for p in body.split('\n\n') if p.strip()]
    for p in paragraphs:
        clean = clean_markdown(p)
        # 跳过纯标题
        if clean.startswith('**') and len(clean) < 50:
            continue
        if len(clean) > 10:
            if len(clean) > max_len:
                return clean[:max_len] + '...'
            return clean
    if text:
        return text[:max_len] + ('...' if len(text) > max_len else '')
    return ''

def _normalize_tag(tag: str) -> str:
    """标签归一化：去首尾空白、统一内部空白，便于大小写不敏感的去重"""
    return re.sub(r'\s+', ' ', tag).strip()

def extract_key_concepts(body: str, title: str, topic: str, max_tags: int = 5) -> list:
    """从 body 中提取关键概念作为标签"""
    raw_concepts = []  # 用 list 保序，set 去重
    text = body + ' ' + title + ' ' + topic

    # 1. 提取 **加粗** 内容（通常是关键概念）
    bold_items = re.findall(r'\*\*([^*]{2,30})\*\*', text)
    for item in bold_items:
        item = item.strip()
        # 跳过标题类
        if item in STOPWORDS or len(item) < 2:
            continue
        # 跳过包含"挂钩"等标记
        if any(marker in item for marker in ['考察点', '答题框架', '踩坑点', '简历挂钩']):
            continue
        raw_concepts.append(item)

    # 2. 提取英文术语（驼峰/全大写）
    english_terms = re.findall(r'\b([A-Z][a-zA-Z]+(?:[A-Z][a-z]+)+)\b', text)
    english_terms += re.findall(r'\b([A-Z]{2,}s?)\b', text)  # MCP, API, A2A, RAG
    # 过滤常见全大写噪声（不在知识库语境里有意义）
    ENGLISH_NOISE = {'ID', 'OK', 'YES', 'NO', 'TBC', 'TODO', 'TBD', 'FAQ', 'PS', 'VS', 'OKR'}
    for term in english_terms:
        if term in ENGLISH_NOISE:
            continue
        if term not in STOPWORDS and len(term) >= 2:
            raw_concepts.append(term)

    # 3. 提取反引号内的代码/术语
    code_terms = re.findall(r'`([^`]{2,30})`', text)
    for term in code_terms:
        if term not in STOPWORDS:
            raw_concepts.append(term)

    # 4. 维度推断
    for dim, keywords in DIMENSION_KEYWORDS.items():
        for kw in keywords:
            if kw in text:
                raw_concepts.append(dim)
                break

    # 5. 清理、去重（大小写不敏感）、排序保留
    seen = set()
    result = []
    for c in raw_concepts:
        if c in STOPWORDS or len(c) < 2:
            continue
        norm = _normalize_tag(c).lower()
        if norm in seen:
            continue
        seen.add(norm)
        result.append(c)
        if len(result) >= max_tags:
            break

    return result

def infer_difficulty(body: str, title: str) -> str:
    """根据内容推断难度"""
    text = body + ' ' + title
    high_indicators = ['底层', '原理', '本质', '源码', '为什么', '深挖', '追根究底', '源码级']
    low_indicators = ['简述', '介绍', '什么是', '基础', '入门']

    if any(ind in text for ind in high_indicators):
        return 'P6-P7'
    elif any(ind in text for ind in low_indicators):
        return 'P4-P5'
    return 'P5-P6'

def retag_knowledge_base(input_path: str, output_path: str, max_tags: int = 5):
    try:
        with open(input_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except FileNotFoundError:
        print(f'❌ Input file not found: {input_path}')
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f'❌ Invalid JSON in {input_path}: {e}')
        sys.exit(1)

    items = data.get('items', [])
    new_items = []

    for item in items:
        body = item.get('body', '')
        title = item.get('title', '')
        topic = item.get('topic', '')

        # 提取关键概念作为标签
        key_concepts = extract_key_concepts(body, title, topic, max_tags=max_tags)

        # 合并历史 tags（如有），按归一化去重，新标签优先，且受 max_tags 约束
        existing_tags = item.get('tags') or []
        if not isinstance(existing_tags, list):
            existing_tags = []
        seen_norm = {_normalize_tag(t).lower() for t in key_concepts}
        merged_tags = list(key_concepts)
        for t in existing_tags:
            if len(merged_tags) >= max_tags:
                break
            if not isinstance(t, str):
                continue
            norm = _normalize_tag(t).lower()
            if norm and norm not in seen_norm:
                seen_norm.add(norm)
                merged_tags.append(t)

        # 提取简略内容
        preview = extract_preview(body)

        # 推断难度
        difficulty = infer_difficulty(body, title)

        new_item = {
            **item,
            'tags': merged_tags,            # 关键概念标签 + 历史标签合并
            'preview': preview,              # 简略内容
            'difficulty': difficulty,        # 难度
        }
        new_items.append(new_item)

    data['items'] = new_items
    data['retaggedAt'] = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'
    data['tagSchema'] = {
        'tags': '关键概念/技术术语（来自 body 中加粗/代码/英文术语）',
        'preview': '简略内容预览',
        'difficulty': '难度分级 P4-P7',
    }

    try:
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except OSError as e:
        print(f'❌ Failed to write {output_path}: {e}')
        sys.exit(1)

    print(f'✅ Retagged {len(new_items)} items')
    if len(new_items) >= 2:
        print(f'   样例: {new_items[0]["id"]} -> tags={new_items[0]["tags"]}')
        print(f'   样例: {new_items[1]["id"]} -> tags={new_items[1]["tags"]}')
    elif len(new_items) == 1:
        print(f'   样例: {new_items[0]["id"]} -> tags={new_items[0]["tags"]}')
    else:
        print('   ⚠️ 输入 items 为空，输出文件中无内容')

if __name__ == '__main__':
    base = Path(__file__).parent.parent  # scripts -> apps/api
    input_path = base / 'knowledge-base.json'
    output_path = base / 'knowledge-base-retagged.json'

    if not input_path.exists():
        print(f'❌ Input not found: {input_path}')
        sys.exit(1)

    retag_knowledge_base(str(input_path), str(output_path))
    print(f'✅ Output: {output_path}')
