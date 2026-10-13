import React, { useMemo } from 'react';
import MarkdownIt from 'markdown-it';
import texmath from 'markdown-it-texmath';
import katex from 'katex';
import DOMPurify from 'dompurify';
import { resolveAsset } from './model';
import 'katex/dist/katex.min.css';

export function renderMarkdown(text, source = '', assets = {}) {
    const md = new MarkdownIt({ html: false, breaks: true, linkify: false }).use(texmath, { engine: katex, delimiters: ['dollars', 'brackets'], katexOptions: { throwOnError: false, strict: 'ignore', trust: false } });
    md.renderer.rules.image = (tokens, idx) => {
      const token = tokens[idx], url = token.attrGet('src'), resolved = resolveAsset(url, source, assets);
      return resolved ? `<img src="${md.utils.escapeHtml(resolved)}" alt="${md.utils.escapeHtml(token.content)}" loading="lazy"/>` : `<span class="missing-image">配图待导入：${md.utils.escapeHtml(url)}</span>`;
    };
    const originalLink = md.renderer.rules.link_open || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
    md.renderer.rules.link_open = (tokens, idx, options, env, self) => { tokens[idx].attrSet('target', '_blank'); tokens[idx].attrSet('rel', 'noopener noreferrer'); return originalLink(tokens, idx, options, env, self); };
    return DOMPurify.sanitize(md.render(text), { ADD_ATTR: ['target'], ADD_TAGS: ['eq', 'eqn'] });
}

export default function Markdown({ text = '', source = '', assets = {} }) {
  const html = useMemo(() => renderMarkdown(text, source, assets), [text, source, assets]);
  return <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}
