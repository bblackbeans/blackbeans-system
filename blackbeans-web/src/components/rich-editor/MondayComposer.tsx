"use client";

import {
  BoldOutlined,
  FileOutlined,
  ItalicOutlined,
  LinkOutlined,
  OrderedListOutlined,
  PaperClipOutlined,
  SmileOutlined,
  StrikethroughOutlined,
  UnderlineOutlined,
  UnorderedListOutlined,
  UserOutlined,
} from "@ant-design/icons";
import type { Editor } from "@tiptap/react";
import Link from "@tiptap/extension-link";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import { Button, Input, Modal, Popover, Space, Tooltip, Typography } from "antd";
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import { toStoredMediaPath } from "@/lib/api";
import { isEmptyRichHtml, normalizeHtmlMediaPaths, toEditorHtml } from "@/lib/rich-content";
import { ComposerImage } from "@/components/rich-editor/ComposerImage";
import {
  UploadProgressToast,
  type UploadToastItem,
} from "@/components/rich-editor/UploadProgressToast";
import "tippy.js/dist/tippy.css";

const EMOJI_SET = [
  "😀", "😁", "😂", "🤣", "😊", "😍", "🤩", "😎",
  "🙂", "😉", "😢", "😭", "😡", "👍", "👎", "👏",
  "🙏", "🔥", "✨", "✅", "❌", "⚠️", "🎉", "🚀",
  "💡", "📌", "📎", "📷", "❤️", "🧡", "💛", "💚",
  "☕", "🎯", "📝", "⏰", "🤝", "💪", "🙌", "👀",
];

const DOC_ACCEPT =
  ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt,.csv,application/pdf";

export type MondayMentionOption = {
  id: string;
  label: string;
};

export type MondayComposerHandle = {
  getHtml: () => string;
  clear: () => void;
  focus: () => void;
  isEmpty: () => boolean;
};

type Props = {
  value?: string;
  onChange?: (html: string) => void;
  mentionOptions: MondayMentionOption[];
  /** Upload de imagem; deve retornar URL persistivel (`/media/...`). */
  onUploadImage: (file: File) => Promise<string | null>;
  /**
   * Arquivos nao-imagem (PDF, docs…).
   * Se informado (comentarios): so enfileira. Se omitido (descricao): upload + link no editor.
   */
  onAttachFiles?: (files: File[]) => void | Promise<void>;
  mode: "comment" | "description";
  /** Retorne `false` para indicar falha (nao limpa o editor). */
  onSubmit?: (html: string) => void | boolean | Promise<void | boolean>;
  draftKey?: string;
  placeholder?: string;
  submitLabel?: string;
  /** Em description: chama ao clicar Concluir (sai da edicao). */
  onDone?: () => void;
  disabled?: boolean;
  className?: string;
  /** Slot extra no rodape (legado). Preferir onAttachFiles. */
  extraFooter?: React.ReactNode;
};

function readDraft(key?: string): string | null {
  if (!key || typeof window === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeDraft(key: string | undefined, html: string) {
  if (!key || typeof window === "undefined") return;
  try {
    if (isEmptyRichHtml(html)) localStorage.removeItem(key);
    else localStorage.setItem(key, html);
  } catch {
    // ignore
  }
}

export function clearComposerDraft(key: string | undefined) {
  if (!key || typeof window === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function extractImageFiles(data: DataTransfer | null | undefined): File[] {
  if (!data) return [];
  const out: File[] = [];
  const seenSizes = new Set<string>();
  const push = (file: File | null) => {
    if (!file || !file.type.startsWith("image/")) return;
    // Clipboard costuma expor o mesmo print em files[] e em items[] (tamanhos iguais).
    const key = `${file.type}:${file.size}`;
    if (seenSizes.has(key)) return;
    seenSizes.add(key);
    out.push(file);
  };
  // Preferir FileList; so cai em items se files vier vazio.
  if (data.files?.length) {
    Array.from(data.files).forEach((file) => push(file));
    return out;
  }
  if (data.items?.length) {
    Array.from(data.items).forEach((item) => {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        push(item.getAsFile());
      }
    });
  }
  return out;
}

/** Detecta imagem no clipboard/drop mesmo quando FileList ainda esta vazio (Linux). */
function clipboardHasImageSignal(data: DataTransfer | null | undefined): boolean {
  if (!data) return false;
  if (extractImageFiles(data).length > 0) return true;
  const types = Array.from(data.types || []);
  if (types.some((t) => t.startsWith("image/"))) return true;
  if (data.items?.length) {
    return Array.from(data.items).some(
      (item) => item.kind === "file" && item.type.startsWith("image/"),
    );
  }
  return false;
}

function escapeHtmlAttr(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

const MondayComposer = forwardRef<MondayComposerHandle, Props>(function MondayComposer(
  {
    value = "",
    onChange,
    mentionOptions,
    onUploadImage,
    onAttachFiles,
    mode,
    onSubmit,
    draftKey,
    placeholder,
    submitLabel,
    onDone,
    disabled,
    className,
    extraFooter,
  },
  ref,
) {
  const reactId = useId();
  const [uploads, setUploads] = useState<UploadToastItem[]>([]);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("https://");
  const [submitting, setSubmitting] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const mentionOptionsRef = useRef(mentionOptions);
  mentionOptionsRef.current = mentionOptions;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const draftKeyRef = useRef(draftKey);
  draftKeyRef.current = draftKey;
  const skipNextDraftWrite = useRef(false);
  const lastEmittedHtml = useRef<string>("");
  const pasteGuardUntil = useRef(0);
  const [emojiOpen, setEmojiOpen] = useState(false);

  const initialHtml = (() => {
    const draft = readDraft(draftKey);
    if (draft != null && draft !== "") return toEditorHtml(draft);
    return toEditorHtml(value);
  })();

  const uploadFiles = useCallback(
    async (files: File[], ed: Editor | null) => {
      if (!ed || !files.length) return;
      for (const file of files) {
        const id = `${reactId}-${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        // Preview imediato (blob) — upload segue em background.
        const blobUrl = URL.createObjectURL(file);
        ed.chain().focus().setImage({ src: blobUrl, alt: file.name }).run();
        setUploads((prev) => [...prev, { id, name: file.name, status: "uploading" }]);
        try {
          const url = await onUploadImage(file);
          const stored = toStoredMediaPath(url) || url;
          if (!stored) throw new Error("sem url");
          // Troca blob → /media/... sem inserir segundo no.
          const { state } = ed;
          let replaced = false;
          state.doc.descendants((node, pos) => {
            if (replaced) return false;
            if (node.type.name === "image" && node.attrs.src === blobUrl) {
              ed.chain()
                .command(({ tr }) => {
                  tr.setNodeMarkup(pos, undefined, {
                    ...node.attrs,
                    src: stored,
                    alt: file.name,
                  });
                  return true;
                })
                .run();
              replaced = true;
              return false;
            }
            return undefined;
          });
          if (!replaced) {
            ed.chain().focus().setImage({ src: stored, alt: file.name }).run();
          }
          URL.revokeObjectURL(blobUrl);
          setUploads((prev) =>
            prev.map((item) => (item.id === id ? { ...item, status: "done" } : item)),
          );
          window.setTimeout(() => {
            setUploads((prev) => prev.filter((item) => item.id !== id));
          }, 1800);
        } catch {
          // Remove preview blob se upload falhar
          const { state } = ed;
          state.doc.descendants((node, pos) => {
            if (node.type.name === "image" && node.attrs.src === blobUrl) {
              ed.chain()
                .command(({ tr }) => {
                  tr.delete(pos, pos + node.nodeSize);
                  return true;
                })
                .run();
              return false;
            }
            return undefined;
          });
          URL.revokeObjectURL(blobUrl);
          setUploads((prev) =>
            prev.map((item) => (item.id === id ? { ...item, status: "error" } : item)),
          );
          window.setTimeout(() => {
            setUploads((prev) => prev.filter((item) => item.id !== id));
          }, 3500);
        }
      }
    },
    [onUploadImage, reactId],
  );
  const uploadFilesRef = useRef(uploadFiles);
  uploadFilesRef.current = uploadFiles;

  const handleDocFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      if (onAttachFiles) {
        await onAttachFiles(files);
        return;
      }
      const ed = editorRef.current;
      if (!ed) return;
      for (const file of files) {
        if (file.type.startsWith("image/")) {
          await uploadFiles([file], ed);
          continue;
        }
        const id = `${reactId}-doc-${file.name}-${Date.now()}`;
        setUploads((prev) => [...prev, { id, name: file.name, status: "uploading" }]);
        try {
          const url = await onUploadImage(file);
          const stored = toStoredMediaPath(url) || url;
          if (!stored) throw new Error("sem url");
          ed.chain()
            .focus()
            .insertContent(
              `<p><a href="${escapeHtmlAttr(stored)}" target="_blank" rel="noopener noreferrer nofollow" class="bb-rich-link">${escapeHtmlAttr(file.name)}</a></p>`,
            )
            .run();
          setUploads((prev) =>
            prev.map((item) => (item.id === id ? { ...item, status: "done" } : item)),
          );
          window.setTimeout(() => {
            setUploads((prev) => prev.filter((item) => item.id !== id));
          }, 2200);
        } catch {
          setUploads((prev) =>
            prev.map((item) => (item.id === id ? { ...item, status: "error" } : item)),
          );
          window.setTimeout(() => {
            setUploads((prev) => prev.filter((item) => item.id !== id));
          }, 3500);
        }
      }
    },
    [onAttachFiles, onUploadImage, reactId, uploadFiles],
  );

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    onCreate: ({ editor: ed }) => {
      editorRef.current = ed;
    },
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
        HTMLAttributes: {
          class: "bb-rich-link",
          rel: "noopener noreferrer nofollow",
          target: "_blank",
        },
      }),
      ComposerImage,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({
        placeholder:
          placeholder ||
          (mode === "comment"
            ? "Escreva uma atualização… Use @ para mencionar. Cole ou anexe imagens."
            : "Descreva a tarefa… Use @ para mencionar."),
      }),
      Mention.configure({
        HTMLAttributes: { class: "mention" },
        suggestion: {
          char: "@",
          items: ({ query }: { query: string }) => {
            const q = query.toLowerCase();
            return mentionOptionsRef.current
              .filter(
                (item) =>
                  item.id.toLowerCase().includes(q) || item.label.toLowerCase().includes(q),
              )
              .slice(0, 8);
          },
          render: () => {
            let component: HTMLDivElement | null = null;
            let popup: TippyInstance[] | null = null;
            let selected = 0;
            let currentProps: SuggestionProps<MondayMentionOption> | null = null;

            const refresh = () => {
              if (!component || !currentProps) return;
              const items = currentProps.items;
              component.innerHTML = "";
              if (!items.length) {
                component.innerHTML = `<div class="bb-mention-empty">Nenhum usuario</div>`;
                return;
              }
              items.forEach((item, index) => {
                const row = document.createElement("button");
                row.type = "button";
                row.className = `bb-mention-item${index === selected ? " is-active" : ""}`;
                const avatar = document.createElement("span");
                avatar.className = "bb-mention-item__avatar";
                avatar.textContent = (item.label || item.id).trim().charAt(0).toUpperCase() || "@";
                const text = document.createElement("span");
                text.className = "bb-mention-item__text";
                text.textContent = `@${item.id}${item.label && item.label !== item.id ? ` — ${item.label}` : ""}`;
                row.appendChild(avatar);
                row.appendChild(text);
                row.onmousedown = (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                };
                row.onclick = (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  currentProps?.command({ id: item.id, label: item.id });
                };
                component!.appendChild(row);
              });
            };

            return {
              onStart: (props: SuggestionProps<MondayMentionOption>) => {
                currentProps = props;
                selected = 0;
                component = document.createElement("div");
                component.className = "bb-mention-dropdown";
                refresh();
                if (!props.clientRect) return;
                popup = tippy("body", {
                  getReferenceClientRect: props.clientRect as () => DOMRect,
                  appendTo: () => document.body,
                  content: component,
                  showOnCreate: true,
                  interactive: true,
                  trigger: "manual",
                  placement: "bottom-start",
                  theme: "bb-mention",
                  zIndex: 3100,
                  offset: [0, 6],
                  popperOptions: {
                    strategy: "fixed",
                  },
                });
              },
              onUpdate: (props: SuggestionProps<MondayMentionOption>) => {
                currentProps = props;
                selected = 0;
                refresh();
                popup?.[0]?.setProps({
                  getReferenceClientRect: props.clientRect as () => DOMRect,
                });
              },
              onKeyDown: (props: SuggestionKeyDownProps) => {
                if (props.event.key === "Escape") {
                  popup?.[0]?.hide();
                  return true;
                }
                const items = currentProps?.items ?? [];
                if (props.event.key === "ArrowDown") {
                  selected = (selected + 1) % Math.max(items.length, 1);
                  refresh();
                  return true;
                }
                if (props.event.key === "ArrowUp") {
                  selected = (selected - 1 + Math.max(items.length, 1)) % Math.max(items.length, 1);
                  refresh();
                  return true;
                }
                if (props.event.key === "Enter") {
                  const item = items[selected];
                  if (item) currentProps?.command({ id: item.id, label: item.id });
                  return true;
                }
                return false;
              },
              onExit: () => {
                popup?.[0]?.destroy();
                popup = null;
                component = null;
              },
            };
          },
        },
      }),
    ],
    content: initialHtml || undefined,
    editorProps: {
      attributes: {
        class: "bb-monday-editor-prose",
      },
      handlePaste: (_view, event) => {
        const now = Date.now();
        // Guard ANTES de qualquer early-return (2o evento Linux costuma ser so HTML).
        if (now < pasteGuardUntil.current) {
          event.preventDefault();
          return true;
        }
        const data = event.clipboardData;
        const files = extractImageFiles(data);
        const hasImage = files.length > 0 || clipboardHasImageSignal(data);
        if (!hasImage) return false;
        pasteGuardUntil.current = now + 1200;
        event.preventDefault();
        event.stopImmediatePropagation?.();
        if (files.length) {
          void uploadFilesRef.current(files, editorRef.current);
        }
        return true;
      },
      handleDrop: (_view, event) => {
        const now = Date.now();
        if (now < pasteGuardUntil.current) {
          event.preventDefault();
          return true;
        }
        const data = event.dataTransfer;
        const files = extractImageFiles(data);
        const hasImage = files.length > 0 || clipboardHasImageSignal(data);
        if (!hasImage) return false;
        pasteGuardUntil.current = now + 1200;
        event.preventDefault();
        if (files.length) {
          void uploadFilesRef.current(files, editorRef.current);
        }
        return true;
      },
      // Remove imgs blob/data colados via HTML (o arquivo ja sobe pelo handlePaste).
      transformPastedHTML(html) {
        return html
          .replace(/<img\b[^>]*src=["']blob:[^"']*["'][^>]*>/gi, "")
          .replace(/<img\b[^>]*src=["']data:image[^"']*["'][^>]*>/gi, "");
      },
    },
    onUpdate: ({ editor: ed }) => {
      const html = normalizeHtmlMediaPaths(ed.getHTML());
      lastEmittedHtml.current = html;
      onChangeRef.current?.(html);
      if (!skipNextDraftWrite.current) writeDraft(draftKeyRef.current, html);
      skipNextDraftWrite.current = false;
    },
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // Sync externo: limpa so quando o parent esvazia value apos ter tido conteudo (publish).
  // Nao apaga rascunho no mount (value vazio + draft no localStorage).
  const prevValueRef = useRef(value);
  useEffect(() => {
    if (!editor) return;
    const prev = prevValueRef.current;
    prevValueRef.current = value;

    if (!isEmptyRichHtml(value)) {
      const next = normalizeHtmlMediaPaths(toEditorHtml(value));
      const current = normalizeHtmlMediaPaths(editor.getHTML());
      if (next === current) lastEmittedHtml.current = next;
      return;
    }

    const published = !isEmptyRichHtml(prev) && isEmptyRichHtml(value);
    if (published) {
      clearComposerDraft(draftKey);
      if (!isEmptyRichHtml(editor.getHTML())) {
        skipNextDraftWrite.current = true;
        lastEmittedHtml.current = "";
        editor.commands.clearContent(true);
      }
      return;
    }

    // value ja era vazio: so limpa editor se nao houver draft
    const draft = readDraft(draftKey);
    if (draft) return;
    if (!isEmptyRichHtml(editor.getHTML()) && !lastEmittedHtml.current) {
      skipNextDraftWrite.current = true;
      editor.commands.clearContent(true);
    }
  }, [value, editor, draftKey]);

  useImperativeHandle(
    ref,
    () => ({
      getHtml: () => normalizeHtmlMediaPaths(editor?.getHTML() ?? ""),
      clear: () => {
        clearComposerDraft(draftKey);
        editor?.commands.clearContent(true);
        onChange?.("");
      },
      focus: () => editor?.commands.focus(),
      isEmpty: () => isEmptyRichHtml(editor?.getHTML() ?? ""),
    }),
    [editor, draftKey, onChange],
  );

  const insertMentionTrigger = () => {
    editor?.chain().focus().insertContent("@").run();
  };

  const hasUploading = uploads.some((u) => u.status === "uploading");

  const finishDescription = () => {
    if (!editor) {
      onDone?.();
      return;
    }
    const html = normalizeHtmlMediaPaths(editor.getHTML());
    // Nao persistir blob: no form
    if (html.includes("blob:")) return;
    lastEmittedHtml.current = html;
    onChange?.(html);
    writeDraft(draftKey, html);
    onDone?.();
  };

  const applyLink = () => {
    const url = linkUrl.trim();
    if (!url || !editor) return;
    if (editor.state.selection.empty) {
      editor.chain().focus().insertContent(`<a href="${url}">${url}</a>`).run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
    setLinkOpen(false);
    setLinkUrl("https://");
  };

  const handleSubmit = async () => {
    if (!onSubmit || submitting || !editor || hasUploading) return;
    const html = normalizeHtmlMediaPaths(editor.getHTML());
    if (html.includes("blob:")) return;
    setSubmitting(true);
    try {
      const result = await onSubmit(html);
      if (result === false) return;
      // Limpa de forma deterministica (nao depende so do sync por value).
      clearComposerDraft(draftKey);
      skipNextDraftWrite.current = true;
      lastEmittedHtml.current = "";
      editor.commands.clearContent(true);
      onChange?.("");
    } finally {
      setSubmitting(false);
    }
  };

  const primaryLabel =
    submitLabel || (mode === "comment" ? "Atualizar" : "Concluir");

  return (
    <div className={`bb-monday-composer ${className ?? ""}`.trim()}>
      <div className="bb-monday-toolbar" role="toolbar" aria-label="Formatacao">
        <Tooltip title="Negrito">
          <Button
            type="text"
            size="small"
            icon={<BoldOutlined />}
            disabled={!editor || disabled}
            onClick={() => editor?.chain().focus().toggleBold().run()}
            className={editor?.isActive("bold") ? "is-active" : undefined}
          />
        </Tooltip>
        <Tooltip title="Italico">
          <Button
            type="text"
            size="small"
            icon={<ItalicOutlined />}
            disabled={!editor || disabled}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            className={editor?.isActive("italic") ? "is-active" : undefined}
          />
        </Tooltip>
        <Tooltip title="Sublinhado">
          <Button
            type="text"
            size="small"
            icon={<UnderlineOutlined />}
            disabled={!editor || disabled}
            onClick={() => editor?.chain().focus().toggleUnderline().run()}
            className={editor?.isActive("underline") ? "is-active" : undefined}
          />
        </Tooltip>
        <Tooltip title="Tachado">
          <Button
            type="text"
            size="small"
            icon={<StrikethroughOutlined />}
            disabled={!editor || disabled}
            onClick={() => editor?.chain().focus().toggleStrike().run()}
            className={editor?.isActive("strike") ? "is-active" : undefined}
          />
        </Tooltip>
        <span className="bb-monday-toolbar__sep" />
        <Tooltip title="Lista">
          <Button
            type="text"
            size="small"
            icon={<UnorderedListOutlined />}
            disabled={!editor || disabled}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
            className={editor?.isActive("bulletList") ? "is-active" : undefined}
          />
        </Tooltip>
        <Tooltip title="Lista numerada">
          <Button
            type="text"
            size="small"
            icon={<OrderedListOutlined />}
            disabled={!editor || disabled}
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            className={editor?.isActive("orderedList") ? "is-active" : undefined}
          />
        </Tooltip>
        <Tooltip title="Checklist">
          <Button
            type="text"
            size="small"
            disabled={!editor || disabled}
            onClick={() => editor?.chain().focus().toggleTaskList().run()}
            className={editor?.isActive("taskList") ? "is-active" : undefined}
          >
            ☐
          </Button>
        </Tooltip>
        <Tooltip title="Link">
          <Button
            type="text"
            size="small"
            icon={<LinkOutlined />}
            disabled={!editor || disabled}
            onClick={() => {
              const prev = editor?.getAttributes("link").href as string | undefined;
              setLinkUrl(prev || "https://");
              setLinkOpen(true);
            }}
            className={editor?.isActive("link") ? "is-active" : undefined}
          />
        </Tooltip>
      </div>

      <div
        className="bb-monday-editor-shell bb-drop-zone"
        onDragOver={(e) => {
          e.preventDefault();
          e.currentTarget.classList.add("bb-drop-active");
        }}
        onDragLeave={(e) => e.currentTarget.classList.remove("bb-drop-active")}
      >
        <EditorContent editor={editor} />
      </div>

      <div className="bb-monday-footer">
        <Space size={4}>
          <Tooltip title="Mencionar pessoa (@)">
            <Button
              type="text"
              size="small"
              icon={<UserOutlined />}
              disabled={disabled}
              onClick={insertMentionTrigger}
              aria-label="Mencionar"
            />
          </Tooltip>
          <Popover
            trigger="click"
            open={emojiOpen}
            onOpenChange={setEmojiOpen}
            placement="topLeft"
            content={
              <div className="bb-emoji-grid">
                {EMOJI_SET.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      editor?.chain().focus().insertContent(emoji).run();
                      setEmojiOpen(false);
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            }
          >
            <Tooltip title="Emoji">
              <Button
                type="text"
                size="small"
                icon={<SmileOutlined />}
                disabled={disabled}
                aria-label="Emoji"
              />
            </Tooltip>
          </Popover>
          <Tooltip title="Inserir imagem">
            <Button
              type="text"
              size="small"
              icon={<PaperClipOutlined />}
              disabled={disabled || hasUploading}
              onClick={() => {
                // Abrir o seletor no mesmo tick do clique (mais responsivo).
                imageInputRef.current?.click();
              }}
              aria-label="Inserir imagem"
            />
          </Tooltip>
          <Tooltip title="Anexar arquivos (PDF, docs…)">
            <Button
              type="text"
              size="small"
              icon={<FileOutlined />}
              disabled={disabled || hasUploading}
              onClick={() => {
                docInputRef.current?.click();
              }}
              aria-label="Anexar arquivos"
            />
          </Tooltip>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              const list = Array.from(e.target.files || []).filter((f) => f.type.startsWith("image/"));
              e.target.value = "";
              if (list.length) void uploadFiles(list, editor);
            }}
          />
          <input
            ref={docInputRef}
            type="file"
            accept={DOC_ACCEPT}
            multiple
            hidden
            onChange={(e) => {
              const list = Array.from(e.target.files || []);
              e.target.value = "";
              if (list.length) void handleDocFiles(list);
            }}
          />
          {extraFooter}
        </Space>
        <Space>
          {mode === "description" ? (
            <Button
              type="primary"
              size="small"
              disabled={disabled || hasUploading}
              loading={hasUploading}
              onClick={finishDescription}
            >
              {primaryLabel}
            </Button>
          ) : (
            <Button
              type="primary"
              size="small"
              disabled={disabled || submitting || hasUploading || isEmptyRichHtml(editor?.getHTML() ?? "")}
              loading={submitting || hasUploading}
              onClick={() => void handleSubmit()}
            >
              {primaryLabel}
            </Button>
          )}
        </Space>
      </div>

      {mode === "comment" ? (
        <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 4 }}>
          Rascunho fica neste aparelho ate voce clicar em Atualizar.
        </Typography.Text>
      ) : null}

      <Modal
        title="Inserir link"
        open={linkOpen}
        onOk={applyLink}
        onCancel={() => setLinkOpen(false)}
        okText="Aplicar"
        cancelText="Cancelar"
        destroyOnHidden
      >
        <Input
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          placeholder="https://"
          onPressEnter={applyLink}
        />
      </Modal>

      <UploadProgressToast items={uploads} />
    </div>
  );
});

export default MondayComposer;
