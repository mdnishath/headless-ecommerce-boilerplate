"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Card } from "@ui/card";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Switch } from "@ui/switch";
import { Button } from "@ui/button";
import type { CustomizationDoc } from "@core/studio/schema";
import type { VariantMeta } from "@core/studio/registry-meta";
import {
  enablePreview,
  publishDraft,
  saveDraft,
} from "@core/studio/actions";

const COLOR_FIELDS: Array<keyof CustomizationDoc["theme"]> = [
  "primary",
  "secondary",
  "accent",
  "background",
  "foreground",
];

export function Customizer({
  initialDoc,
  headerVariants,
}: {
  initialDoc: CustomizationDoc;
  headerVariants: VariantMeta[];
}) {
  const [doc, setDoc] = useState<CustomizationDoc>(initialDoc);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [previewKey, setPreviewKey] = useState(0);
  const [isPublishing, startPublish] = useTransition();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Enable Draft Mode once so the iframe renders the draft.
  useEffect(() => {
    void enablePreview();
  }, []);

  // Debounced autosave + iframe refresh whenever the doc changes.
  useEffect(() => {
    if (doc === initialDoc) {
      return;
    }
    setStatus("saving");
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
    }
    saveTimer.current = setTimeout(async () => {
      await saveDraft(doc);
      setStatus("saved");
      setPreviewKey((k) => k + 1); // reload the preview iframe
    }, 500);
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
    };
  }, [doc, initialDoc]);

  const selectedHeaderId = doc.slots.header.variant;
  const selectedMeta = headerVariants.find((v) => v.id === selectedHeaderId);

  function selectHeader(id: string) {
    setDoc((d) => ({ ...d, slots: { ...d.slots, header: { ...d.slots.header, variant: id, options: {} } } }));
  }
  function setHeaderOption(name: string, value: unknown) {
    setDoc((d) => ({
      ...d,
      slots: { ...d.slots, header: { ...d.slots.header, options: { ...d.slots.header.options, [name]: value } } },
    }));
  }
  function setColor(field: keyof CustomizationDoc["theme"], value: string) {
    setDoc((d) => ({ ...d, theme: { ...d.theme, [field]: value } }));
  }

  return (
    <div className="grid h-screen grid-cols-[380px_1fr]">
      {/* Left: controls */}
      <aside className="flex flex-col overflow-y-auto border-r p-4">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-bold">Studio</h1>
          <span className="text-xs text-muted-foreground">
            {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : ""}
          </span>
        </div>

        <Button
          onClick={() => startPublish(async () => { await publishDraft(); })}
          disabled={isPublishing}
          className="mb-6"
        >
          {isPublishing ? "Publishing…" : "Publish"}
        </Button>

        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold">Header design</h2>
          <div className="grid grid-cols-2 gap-2">
            {headerVariants.map((v) => (
              <Card
                key={v.id}
                onClick={() => selectHeader(v.id)}
                className={`cursor-pointer overflow-hidden p-0 ${v.id === selectedHeaderId ? "ring-2 ring-primary" : ""}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={v.thumbnail} alt={v.name} className="h-16 w-full object-cover" />
                <div className="p-1.5 text-xs">{v.name}</div>
              </Card>
            ))}
          </div>
        </section>

        {selectedMeta ? (
          <section className="mb-6">
            <h2 className="mb-2 text-sm font-semibold">Header options</h2>
            <div className="space-y-3">
              {selectedMeta.optionFields.map((f) => {
                const current = doc.slots.header.options[f.name] ?? f.default;
                if (f.control === "switch") {
                  return (
                    <div key={f.name} className="flex items-center justify-between">
                      <Label htmlFor={`opt-${f.name}`}>{f.name}</Label>
                      <Switch
                        id={`opt-${f.name}`}
                        checked={Boolean(current)}
                        onCheckedChange={(c) => setHeaderOption(f.name, c)}
                      />
                    </div>
                  );
                }
                return (
                  <div key={f.name}>
                    <Label htmlFor={`opt-${f.name}`}>{f.name}</Label>
                    <Input
                      id={`opt-${f.name}`}
                      type={f.control === "number" ? "number" : "text"}
                      value={String(current)}
                      onChange={(e) =>
                        setHeaderOption(
                          f.name,
                          f.control === "number" ? Number(e.target.value) : e.target.value,
                        )
                      }
                    />
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        <section>
          <h2 className="mb-2 text-sm font-semibold">Colors</h2>
          <div className="space-y-3">
            {COLOR_FIELDS.map((field) => (
              <div key={field}>
                <Label htmlFor={`color-${field}`}>{field}</Label>
                <Input
                  id={`color-${field}`}
                  value={String(doc.theme[field])}
                  onChange={(e) => setColor(field, e.target.value)}
                  placeholder="oklch(...) or #hex"
                />
              </div>
            ))}
          </div>
        </section>
      </aside>

      {/* Right: live preview */}
      <main className="bg-muted">
        <iframe
          key={previewKey}
          src="/"
          title="Live preview"
          className="h-full w-full border-0 bg-background"
        />
      </main>
    </div>
  );
}
