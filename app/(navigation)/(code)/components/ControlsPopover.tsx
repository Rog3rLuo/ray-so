"use client";

import React, { type PropsWithChildren } from "react";
import * as Popover from "@radix-ui/react-popover";
import { ChevronDownIcon } from "@raycast/icons";

import ControlContainer from "./ControlContainer";
import styles from "./ContentControls.module.css";

type PropTypes = {
  /** 组标题（与其它控制组的标题同级展示） */
  title: string;
  /** 触发器上显示的当前值摘要 */
  summary: string;
  children: React.ReactNode;
};

/**
 * 收纳式控制组：底部控制栏空间有限，字体/排版这类多行配置收进弹出面板，
 * 触发器常驻并展示当前值摘要。内容复用现有控制组件（含各自的快捷键）。
 */
const ControlsPopover: React.FC<PropsWithChildren<PropTypes>> = ({ title, summary, children }) => {
  return (
    <ControlContainer title={title}>
      <Popover.Root>
        <Popover.Trigger className={styles.popoverTrigger}>
          <span className={styles.popoverSummary}>{summary}</span>
          <ChevronDownIcon aria-hidden />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            side="top"
            align="start"
            sideOffset={14}
            className={styles.popoverContent}
            aria-label={title}
          >
            {children}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </ControlContainer>
  );
};

export default ControlsPopover;
