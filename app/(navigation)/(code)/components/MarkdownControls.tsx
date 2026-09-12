import React from "react";
import { useAtom } from "jotai";
import * as ToggleGroup from "@radix-ui/react-toggle-group";

import ControlContainer from "./ControlContainer";
import ControlsPopover from "./ControlsPopover";
import styles from "./ContentControls.module.css";
import { Switch } from "@/components/switch";
import useHotkeys from "../../../../utils/useHotkeys";
import {
  MarkdownAlign,
  MarkdownBodyFont,
  MarkdownCodeFont,
  MarkdownHanFont,
  MarkdownPunct,
  MarkdownViewMode,
  markdownAlignAtom,
  markdownBodyFontAtom,
  markdownCjkAtom,
  markdownCodeFontAtom,
  markdownCodeScaleAtom,
  markdownFontSizeAtom,
  markdownHanFontAtom,
  markdownLineHeightAtom,
  markdownPunctAtom,
  markdownViewModeAtom,
} from "../store/content";

const VIEW_MODES: { value: MarkdownViewMode; label: string }[] = [
  { value: "split", label: "Split" },
  { value: "preview", label: "Preview" },
];

const BODY_FONTS: { value: MarkdownBodyFont; label: string }[] = [
  { value: "sans", label: "Sans" },
  { value: "serif", label: "Serif" },
  { value: "mono", label: "Mono" },
];

const HAN_FONTS: { value: MarkdownHanFont; label: string }[] = [
  { value: "hei", label: "黑体" },
  { value: "song", label: "宋体" },
  { value: "kai", label: "楷体" },
];

/*
 * Curated Latin × Han pairings (the "bundled font presets" layer). Selecting
 * one sets both axes; touching either individual control below moves the
 * selection off every preset, which the toggle group shows as no selection.
 */
const PRESETS: { label: string; body: MarkdownBodyFont; han: MarkdownHanFont }[] = [
  { label: "现代黑体", body: "sans", han: "hei" },
  { label: "经典宋体", body: "serif", han: "song" },
  { label: "书卷楷体", body: "serif", han: "kai" },
  { label: "等宽", body: "mono", han: "hei" },
];

const CODE_FONTS: { value: MarkdownCodeFont; label: string }[] = [
  { value: "jetbrains", label: "JetBrains" },
  { value: "sfmono", label: "SF Mono" },
  { value: "consolas", label: "Consolas" },
];

const ALIGN_MODES: { value: MarkdownAlign; label: string }[] = [
  { value: "justify", label: "Justify" },
  { value: "start", label: "Start" },
];

const PUNCT_MODES: { value: MarkdownPunct; label: string }[] = [
  { value: "faithful", label: "Off" },
  { value: "fold", label: "Fold" },
  { value: "spacing", label: "Space" },
];

const FONT_SIZE_MIN = 12;
const FONT_SIZE_MAX = 24;
const LINE_HEIGHT_MIN = 1.2;
const LINE_HEIGHT_MAX = 2.4;

export const MarkdownViewModeControl: React.FC = () => {
  const [viewMode, setViewMode] = useAtom(markdownViewModeAtom);

  useHotkeys("v", () => {
    const index = VIEW_MODES.findIndex((mode) => mode.value === viewMode);
    setViewMode(VIEW_MODES[(index + 1) % VIEW_MODES.length].value);
  });

  return (
    <ControlContainer title="View">
      <ToggleGroup.Root
        className={styles.toggleGroup}
        type="single"
        value={viewMode}
        aria-label="Markdown view mode"
        onValueChange={(value) => {
          if (value === "split" || value === "preview") setViewMode(value);
        }}
      >
        {VIEW_MODES.map((mode) => (
          <ToggleGroup.Item
            key={mode.value}
            className={styles.toggleGroupItem}
            value={mode.value}
            aria-label={mode.label}
          >
            {mode.label}
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>
    </ControlContainer>
  );
};

export const MarkdownPresetControl: React.FC = () => {
  const [bodyFont] = useAtom(markdownBodyFontAtom);
  const [hanFont] = useAtom(markdownHanFontAtom);
  const [, setBodyFont] = useAtom(markdownBodyFontAtom);
  const [, setHanFont] = useAtom(markdownHanFontAtom);

  const active = PRESETS.find((preset) => preset.body === bodyFont && preset.han === hanFont);
  // jotai needs a stable setter pair; apply both axes on selection
  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    setBodyFont(preset.body);
    setHanFont(preset.han);
  };

  return (
    <ControlContainer title="Font preset">
      <ToggleGroup.Root
        className={styles.toggleGroup}
        type="single"
        value={active?.label ?? ""}
        aria-label="Font preset"
        onValueChange={(value) => {
          const preset = PRESETS.find((entry) => entry.label === value);
          if (preset) applyPreset(preset);
        }}
      >
        {PRESETS.map((preset) => (
          <ToggleGroup.Item
            key={preset.label}
            className={styles.toggleGroupItem}
            value={preset.label}
            aria-label={preset.label}
          >
            {preset.label}
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>
    </ControlContainer>
  );
};

export const MarkdownFontControl: React.FC = () => {
  const [font, setFont] = useAtom(markdownBodyFontAtom);

  useHotkeys("shift+f", () => {
    const index = BODY_FONTS.findIndex((entry) => entry.value === font);
    setFont(BODY_FONTS[(index + 1) % BODY_FONTS.length].value);
  });

  return (
    <ControlContainer title="Latin font">
      <ToggleGroup.Root
        className={styles.toggleGroup}
        type="single"
        value={font}
        aria-label="Latin body font"
        onValueChange={(value) => {
          if (value === "sans" || value === "serif" || value === "mono") setFont(value);
        }}
      >
        {BODY_FONTS.map((entry) => (
          <ToggleGroup.Item
            key={entry.value}
            className={styles.toggleGroupItem}
            value={entry.value}
            aria-label={entry.label}
          >
            {entry.label}
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>
    </ControlContainer>
  );
};

export const MarkdownHanFontControl: React.FC = () => {
  const [hanFont, setHanFont] = useAtom(markdownHanFontAtom);

  return (
    <ControlContainer title="Han font">
      <ToggleGroup.Root
        className={styles.toggleGroup}
        type="single"
        value={hanFont}
        aria-label="Han font"
        onValueChange={(value) => {
          if (value === "hei" || value === "song" || value === "kai") setHanFont(value);
        }}
      >
        {HAN_FONTS.map((entry) => (
          <ToggleGroup.Item
            key={entry.value}
            className={styles.toggleGroupItem}
            value={entry.value}
            aria-label={entry.label}
          >
            {entry.label}
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>
    </ControlContainer>
  );
};

export const MarkdownCodeFontControl: React.FC = () => {
  const [codeFont, setCodeFont] = useAtom(markdownCodeFontAtom);

  return (
    <ControlContainer title="Code font">
      <ToggleGroup.Root
        className={styles.toggleGroup}
        type="single"
        value={codeFont}
        aria-label="Code font"
        onValueChange={(value) => {
          if (value === "jetbrains" || value === "sfmono" || value === "consolas") setCodeFont(value);
        }}
      >
        {CODE_FONTS.map((entry) => (
          <ToggleGroup.Item
            key={entry.value}
            className={styles.toggleGroupItem}
            value={entry.value}
            aria-label={entry.label}
          >
            {entry.label}
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>
    </ControlContainer>
  );
};

export const MarkdownAlignControl: React.FC = () => {
  const [align, setAlign] = useAtom(markdownAlignAtom);

  useHotkeys("a", () => {
    const index = ALIGN_MODES.findIndex((mode) => mode.value === align);
    setAlign(ALIGN_MODES[(index + 1) % ALIGN_MODES.length].value);
  });

  return (
    <ControlContainer title="Align">
      <ToggleGroup.Root
        className={styles.toggleGroup}
        type="single"
        value={align}
        aria-label="Markdown paragraph alignment"
        onValueChange={(value) => {
          if (value === "justify" || value === "start") setAlign(value);
        }}
      >
        {ALIGN_MODES.map((mode) => (
          <ToggleGroup.Item
            key={mode.value}
            className={styles.toggleGroupItem}
            value={mode.value}
            aria-label={mode.label}
          >
            {mode.label}
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>
    </ControlContainer>
  );
};

type StepperProps = {
  title: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
};

const Stepper: React.FC<StepperProps> = ({ title, value, min, max, step, format, onChange }) => {
  const clamp = (next: number) => Math.min(max, Math.max(min, Number(next.toFixed(2))));

  return (
    <ControlContainer title={title}>
      <div className={styles.stepper}>
        <button
          type="button"
          className={styles.stepperButton}
          onClick={() => onChange(clamp(value - step))}
          disabled={value <= min}
          aria-label={`Decrease ${title}`}
        >
          −
        </button>
        <span className={styles.stepperValue}>{format(value)}</span>
        <button
          type="button"
          className={styles.stepperButton}
          onClick={() => onChange(clamp(value + step))}
          disabled={value >= max}
          aria-label={`Increase ${title}`}
        >
          +
        </button>
      </div>
    </ControlContainer>
  );
};

export const MarkdownFontSizeControl: React.FC = () => {
  const [fontSize, setFontSize] = useAtom(markdownFontSizeAtom);

  return (
    <Stepper
      title="Size"
      value={fontSize}
      min={FONT_SIZE_MIN}
      max={FONT_SIZE_MAX}
      step={1}
      format={(value) => `${value}px`}
      onChange={setFontSize}
    />
  );
};

export const MarkdownLineHeightControl: React.FC = () => {
  const [lineHeight, setLineHeight] = useAtom(markdownLineHeightAtom);

  return (
    <Stepper
      title="Leading"
      value={lineHeight}
      min={LINE_HEIGHT_MIN}
      max={LINE_HEIGHT_MAX}
      step={0.1}
      format={(value) => value.toFixed(1)}
      onChange={setLineHeight}
    />
  );
};

export const MarkdownCodeScaleControl: React.FC = () => {
  const [codeScale, setCodeScale] = useAtom(markdownCodeScaleAtom);

  return (
    <Stepper
      title="Code scale"
      value={codeScale}
      min={0.8}
      max={1.3}
      step={0.05}
      format={(value) => `${value.toFixed(2)}×`}
      onChange={setCodeScale}
    />
  );
};

export const MarkdownFontPopover: React.FC = () => {
  const [bodyFont] = useAtom(markdownBodyFontAtom);
  const [hanFont] = useAtom(markdownHanFontAtom);

  const preset = PRESETS.find((entry) => entry.body === bodyFont && entry.han === hanFont);
  const summary = preset ? preset.label : "自定义";

  return (
    <ControlsPopover title="Font" summary={summary}>
      <MarkdownPresetControl />
      <MarkdownFontControl />
      <MarkdownHanFontControl />
      <MarkdownCodeFontControl />
    </ControlsPopover>
  );
};

export const MarkdownTextPopover: React.FC = () => {
  const [fontSize] = useAtom(markdownFontSizeAtom);
  const [lineHeight] = useAtom(markdownLineHeightAtom);

  return (
    <ControlsPopover title="Text" summary={`${fontSize}px · ${lineHeight.toFixed(1)}`}>
      <MarkdownFontSizeControl />
      <MarkdownLineHeightControl />
      <MarkdownCodeScaleControl />
    </ControlsPopover>
  );
};

export const MarkdownTypographyPopover: React.FC = () => {
  const [align] = useAtom(markdownAlignAtom);
  const [punct] = useAtom(markdownPunctAtom);
  const [cjk] = useAtom(markdownCjkAtom);

  const alignLabel = align === "justify" ? "两端对齐" : "左对齐";
  const punctLabel = { faithful: "标点原样", fold: "标点折叠", spacing: "标点留白" }[punct];
  const parts = [alignLabel, punctLabel, ...(cjk ? ["中西间距"] : [])];

  return (
    <ControlsPopover title="排版" summary={parts.join(" · ")}>
      <MarkdownAlignControl />
      <MarkdownPunctControl />
      <MarkdownCjkControl />
    </ControlsPopover>
  );
};

export const MarkdownPunctControl: React.FC = () => {
  const [punct, setPunct] = useAtom(markdownPunctAtom);

  return (
    <ControlContainer title="Punct">
      <ToggleGroup.Root
        className={styles.toggleGroup}
        type="single"
        value={punct}
        aria-label="Halfwidth punctuation policy"
        onValueChange={(value) => {
          if (value === "faithful" || value === "fold" || value === "spacing") setPunct(value);
        }}
      >
        {PUNCT_MODES.map((mode) => (
          <ToggleGroup.Item
            key={mode.value}
            className={styles.toggleGroupItem}
            value={mode.value}
            aria-label={mode.label}
          >
            {mode.label}
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>
    </ControlContainer>
  );
};

export const MarkdownCjkControl: React.FC = () => {
  const [cjk, setCjk] = useAtom(markdownCjkAtom);

  useHotkeys("j", () => setCjk((value) => !value));

  return (
    <ControlContainer title="CJK spacing">
      <Switch checked={cjk} onCheckedChange={setCjk} />
    </ControlContainer>
  );
};
