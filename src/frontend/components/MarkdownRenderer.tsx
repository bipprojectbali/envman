import { Code, useMantineColorScheme } from "@mantine/core";
import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
  oneLight,
  vscDarkPlus,
} from "react-syntax-highlighter/dist/esm/styles/prism";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";

interface MarkdownRendererProps {
  children: string;
  fontSize?: number | string;
}

export function MarkdownRenderer({
  children,
  fontSize = 14,
}: MarkdownRendererProps) {
  const { colorScheme } = useMantineColorScheme();
  const containerRef = useRef<HTMLDivElement>(null);

  // TanStack Router mendaftarkan click listener di document pada CAPTURE phase.
  // Satu-satunya cara mengalahkannya: pasang listener kita juga di capture phase
  // pada container, lalu stopPropagation() sebelum event naik ke document.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("a");
      if (!target) return;

      const href = target.getAttribute("href");
      if (!href) return;

      // Anchor link dalam halaman (#section)
      if (href.startsWith("#")) {
        e.preventDefault();
        e.stopPropagation();
        const section = document.getElementById(href.slice(1));
        if (section) {
          section.scrollIntoView({ behavior: "smooth", block: "start" });
          // Sertakan pathname agar router tidak parse "#section" sebagai route "/"
          history.replaceState(null, "", window.location.pathname + href);
        }
        return;
      }

      // External link — buka di tab baru
      if (href.startsWith("http") || href.startsWith("//")) {
        e.preventDefault();
        e.stopPropagation();
        window.open(href, "_blank", "noopener,noreferrer");
      }
      // Internal path — biarkan router handle (tidak di-stop)
    };

    // capture: true → berjalan sebelum TanStack Router listener di document
    el.addEventListener("click", handleClick, { capture: true });
    return () =>
      el.removeEventListener("click", handleClick, { capture: true });
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        fontSize,
        minWidth: 0,
        maxWidth: "100%",
        overflowWrap: "break-word",
        wordBreak: "break-word",
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug]}
        components={{
          code({ className, children: codeChildren, ...rest }) {
            const lang = /language-(\w+)/.exec(className || "")?.[1];
            const inline = !className;
            if (inline) {
              return (
                <code {...rest} className={className}>
                  {codeChildren}
                </code>
              );
            }
            return lang ? (
              <SyntaxHighlighter
                language={lang}
                style={colorScheme === "dark" ? vscDarkPlus : oneLight}
                customStyle={{
                  borderRadius: 6,
                  fontSize: 13,
                  margin: "8px 0",
                  maxWidth: "100%",
                  overflowX: "auto",
                }}
                codeTagProps={{ style: { whiteSpace: "pre" } }}
                showLineNumbers={String(codeChildren).split("\n").length > 5}
              >
                {String(codeChildren).trimEnd()}
              </SyntaxHighlighter>
            ) : (
              <pre
                style={{ fontSize: 13, maxWidth: "100%", overflowX: "auto" }}
              >
                {String(codeChildren).trimEnd()}
              </pre>
            );
          },
          table({ children: tableChildren, ...rest }) {
            return (
              <div
                style={{ maxWidth: "100%", overflowX: "auto", margin: "8px 0" }}
              >
                <table {...rest}>{tableChildren}</table>
              </div>
            );
          },
          pre({ children: preChildren, ...rest }) {
            return (
              <pre
                {...rest}
                style={{ maxWidth: "100%", overflowX: "auto", margin: "8px 0" }}
              >
                {preChildren}
              </pre>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
