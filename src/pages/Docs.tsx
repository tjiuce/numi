import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import docsContent from '../docs.md?raw';
import { Menu, X } from 'lucide-react';

interface Heading {
  id: string;
  text: string;
  level: number;
}

export default function Docs() {
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [headings, setHeadings] = useState<Heading[]>([]);

  useEffect(() => {
    // Extract headings from markdown
    const regex = /^(#{2,3})\s+(.*)/gm;
    const extracted: Heading[] = [];
    let match;
    while ((match = regex.exec(docsContent)) !== null) {
      const level = match[1].length;
      const text = match[2];
      // simplified slug generation similar to rehype-slug
      const id = text.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
      extracted.push({ id, text, level });
    }
    setHeadings(extracted);
  }, []);

  const renderHeading = (level: number, props: any) => {
    const Tag = `h${level}` as any;
    return (
      <div className="heading-container group">
        <Tag id={props.id} style={{ fontSize: level === 2 ? '24px' : '20px' }}>{props.children}</Tag>
        <a href={`#${props.id}`} className="heading-anchor" title="Copy link">#</a>
      </div>
    );
  };

  const components = {
    h2: (props: any) => renderHeading(2, props),
    h3: (props: any) => renderHeading(3, props),
    table: (props: any) => (
      <div className="docs-table-wrapper">
        <table className="docs-table" {...props} />
      </div>
    )
  };

  return (
    <div className="docs-layout">
      {/* Mobile Toggle */}
      <button className="mobile-nav-toggle" onClick={() => setIsNavOpen(!isNavOpen)}>
        {isNavOpen ? <X size={20} /> : <Menu size={20} />}
        <span>Table of Contents</span>
      </button>

      {/* Navigation Sidebar */}
      <nav className={`docs-nav ${isNavOpen ? 'open' : ''}`}>
        <ul>
          {headings.map((h, i) => (
            <li key={i} style={{ paddingLeft: h.level === 3 ? '15px' : '0' }}>
              <a href={`#${h.id}`} onClick={() => setIsNavOpen(false)}>
                {h.text}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* Main Content */}
      <div className="docs-page">
        <div className="docs-content">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeSlug]}
            components={components}
          >
            {docsContent}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
