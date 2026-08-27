import { useRef, useState } from "react";
import { MagnifyingGlassPlusIcon } from "@heroicons/react/24/outline";
import { HelpImagePreview } from "@/features/help/components/help-image-preview";
import { findCategory, findTopic } from "@/features/help/help-data";
import type { ReactNode } from "react";

type HelpArticleProps = {
  slug: string;
  children: ReactNode;
};

export const HelpArticle = ({ slug, children }: HelpArticleProps) => {
  const topic = findTopic(slug);
  const category = topic ? findCategory(topic.categorySlug) : null;

  return (
    <article
      className="mx-auto w-full max-w-[1280px] px-8 py-7 xl:px-10"
      data-testid="help-article"
    >
      <div className="mx-auto w-full max-w-[880px]" data-testid="help-reading-column">
        {category && topic ? (
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.04em] text-[#8a90a1]">
            {category.title} / {topic.title}
          </p>
        ) : null}

        <div className="mb-3 flex items-center gap-2">
          <h1 className="m-0 text-2xl font-bold leading-8 text-[#282c3b]">{topic?.title}</h1>
          {topic?.stepCount != null ? (
            <span className="inline-flex h-6 items-center rounded-full bg-[#eef0ff] px-2.5 text-xs font-bold text-[#6467d1]">
              {topic.stepCount} steps
            </span>
          ) : null}
        </div>

        {topic?.overview ? (
          <div className="mb-6 rounded-2xl border border-[#d8ddf3] bg-[#f7f8ff] px-4 py-3 text-sm font-medium leading-6 text-[#4f5670]">
            {topic.overview}
          </div>
        ) : null}
      </div>

      <div className="[&>*]:mx-auto [&>*]:max-w-[880px]">
        {children}
      </div>
    </article>
  );
};

export const HelpH2 = ({ children }: { children: ReactNode }) => (
  <h2 className="mb-3 mt-7 text-sm font-bold leading-5 text-[#282c3b]">{children}</h2>
);

export const HelpParagraph = ({ children }: { children: ReactNode }) => (
  <p className="mb-3 text-sm font-medium leading-6 text-[#5f6575]">{children}</p>
);

export const HelpStep = ({ n, children }: { n: number; children: ReactNode }) => (
  <div className="mb-4 flex gap-3">
    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#706cd5] text-xs font-bold text-white">
      {n}
    </div>
    <div className="min-w-0 text-sm font-medium leading-6 text-[#40424f]">{children}</div>
  </div>
);

export const HelpList = ({ items }: { items: ReactNode[] }) => (
  <ul className="mb-4 list-disc space-y-2 pl-5 text-sm font-medium leading-6 text-[#5f6575]">
    {items.map((item, index) => (
      <li key={index}>{item}</li>
    ))}
  </ul>
);

type HelpFieldTableItem = {
  label: string;
  details: ReactNode;
};

export const HelpFieldTable = ({ items, title }: { items: HelpFieldTableItem[]; title?: string }) => (
  <div className="my-4 rounded-2xl border border-[#e3e7ef] bg-white">
    {title ? (
      <div className="border-b border-[#edf0f5] px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] text-[#7f8392]">
        {title}
      </div>
    ) : null}
    <dl className="divide-y divide-[#edf0f5]">
      {items.map((item) => (
        <div key={item.label} className="grid grid-cols-[190px_minmax(0,1fr)] gap-4 px-3 py-2.5">
          <dt className="text-sm font-bold leading-6 text-[#40424f]">{item.label}</dt>
          <dd className="text-sm font-medium leading-6 text-[#6f7485]">{item.details}</dd>
        </div>
      ))}
    </dl>
  </div>
);

export const HelpOutcome = ({ children }: { children: ReactNode }) => (
  <div className="my-4 rounded-2xl border border-[#cfd8ef] bg-[#f8faff] px-3 py-3 text-sm font-medium leading-6 text-[#4f5670]">
    <strong>Result: </strong>
    {children}
  </div>
);

const HelpCallout = ({
  children,
  label,
  tone,
}: {
  children: ReactNode;
  label: string;
  tone: "blue" | "yellow" | "orange";
}) => {
  const styles = {
    blue: "border-[#b8cff4] bg-[#f5f8ff] text-[#435b7e]",
    yellow: "border-[#ead7a2] bg-[#fff9e9] text-[#725a22]",
    orange: "border-[#e6b694] bg-[#fff4ec] text-[#88492a]",
  }[tone];

  return (
    <div className={`my-4 rounded-2xl border-l-4 px-3 py-2.5 text-sm font-medium leading-6 ${styles}`}>
      <strong>{label}: </strong>
      {children}
    </div>
  );
};

export const HelpTip = ({ children }: { children: ReactNode }) => (
  <HelpCallout label="Tip" tone="blue">{children}</HelpCallout>
);

export const HelpNote = ({ children }: { children: ReactNode }) => (
  <HelpCallout label="Note" tone="yellow">{children}</HelpCallout>
);

export const HelpWarning = ({ children }: { children: ReactNode }) => (
  <HelpCallout label="Warning" tone="orange">{children}</HelpCallout>
);

type HelpScreenshotProps = {
  src: string;
  alt: string;
  caption: string;
};

const resolveAsset = (src: string): string => {
  if (/^https?:\/\//.test(src)) {
    return src;
  }

  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${base}/${src.replace(/^\//, "")}`;
};

export const HelpScreenshot = ({ src, alt, caption }: HelpScreenshotProps) => {
  const resolvedSrc = resolveAsset(src);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <figure className="mx-auto my-5 w-full max-w-[880px]" data-testid="help-screenshot">
      <button
        ref={triggerRef}
        aria-label={`Open full-screen preview: ${alt}`}
        className="group relative mx-auto block w-full max-w-full cursor-zoom-in overflow-hidden rounded-2xl text-left outline-none focus-visible:ring-2 focus-visible:ring-[#706cd5] focus-visible:ring-offset-2 disabled:cursor-default"
        disabled={!loaded}
        type="button"
        onClick={() => setPreviewOpen(true)}
      >
        <img
          alt={alt}
          className="mx-auto block h-auto max-w-full rounded-2xl border border-[#dfe3eb] shadow-[0_10px_28px_rgba(36,39,45,0.12)]"
          src={resolvedSrc}
          onError={(event) => {
            setLoaded(false);
            const img = event.currentTarget;
            img.style.display = "none";
            const fallback = img.nextElementSibling as HTMLElement | null;
            if (fallback) {
              fallback.style.display = "flex";
            }
          }}
          onLoad={(event) => {
            setLoaded(true);
            event.currentTarget.style.display = "block";
            const fallback = event.currentTarget.nextElementSibling as HTMLElement | null;
            if (fallback) {
              fallback.style.display = "none";
            }
          }}
        />
        <span className="hidden h-28 w-full items-center justify-center rounded-2xl border border-dashed border-[#b9c0cf] text-xs font-semibold text-[#7f8392]">
          {alt}
        </span>
        {loaded ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-black/0 text-white opacity-0 transition group-hover:bg-black/20 group-hover:opacity-100 group-focus-visible:bg-black/20 group-focus-visible:opacity-100"
          >
            <span className="inline-flex items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-sm font-semibold shadow-lg">
              <MagnifyingGlassPlusIcon className="h-5 w-5" />
              View full screen
            </span>
          </span>
        ) : null}
      </button>
      <figcaption className="mt-2 text-center text-xs italic leading-5 text-[#7f8392]">
        {caption}
      </figcaption>
      <HelpImagePreview
        alt={alt}
        open={previewOpen}
        src={resolvedSrc}
        triggerRef={triggerRef}
        onOpenChange={setPreviewOpen}
      />
    </figure>
  );
};

type HelpControlsRefItem = {
  name: string;
  description: string;
  icon?: ReactNode;
};

export const HelpControlsRef = ({ items }: { items: HelpControlsRefItem[] }) => {
  const hasIcons = items.some((item) => item.icon);

  return (
    <div className="mt-7 border-t border-[#dfe3eb] pt-4">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.08em] text-[#7f8392]">
        Controls on this screen
      </h3>
      <table className="w-full border-collapse text-sm">
        <tbody>
          {items.map((item) => (
            <tr key={item.name} className="border-b border-[#edf0f5] last:border-b-0">
              {hasIcons ? (
                <td className="w-8 py-2.5 pr-3 align-top text-[#7f8392]">
                  <span className="inline-flex h-5 w-5 items-center justify-center">{item.icon}</span>
                </td>
              ) : null}
              <td className="w-[38%] py-2.5 pr-4 align-top font-bold text-[#40424f]">{item.name}</td>
              <td className="py-2.5 align-top font-medium leading-6 text-[#6f7485]">{item.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
