import * as React from "react";
import {
  CircleCheck,
  CircleX,
  Info,
  TriangleAlert,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import type { ExternalToast, ToasterProps } from "sonner";

export type MessageOptions = ExternalToast;
export type MessageProps = ToasterProps;

type MessageContent = Parameters<typeof toast>[0];
type MessageResult = ReturnType<typeof toast>;
type MessageId = string | number;
type MessageToastOptions = NonNullable<MessageProps["toastOptions"]>;

type MessageHandler = (
  content: MessageContent,
  options?: MessageOptions,
) => MessageResult;

type MessageApi = {
  error: MessageHandler;
  info: MessageHandler;
  loading: MessageHandler;
  open: MessageHandler;
  success: MessageHandler;
  warning: MessageHandler;
  destroy: (id?: MessageId) => MessageResult;
};

const DEFAULT_MESSAGE_OPTIONS: MessageOptions = {
  duration: 2400,
  position: "top-center",
};

const MESSAGE_MAX_WIDTH = "min(500px, calc(100vw - 32px))";

const MESSAGE_TOASTER_STYLE = {
  "--width": MESSAGE_MAX_WIDTH,
  maxWidth: MESSAGE_MAX_WIDTH,
} as React.CSSProperties;

const MESSAGE_TOAST_STYLE: React.CSSProperties = {
  fontSize: 14,
  left: "50%",
  maxWidth: MESSAGE_MAX_WIDTH,
  minWidth: "auto",
  padding: "10px 16px",
  translate: "-50% 0",
  whiteSpace: "normal",
  width: "max-content",
};

const MESSAGE_ICON_STYLE: React.CSSProperties = {
  color: "currentColor",
  flexShrink: 0,
};

const MESSAGE_ICONS: MessageProps["icons"] = {
  error: <CircleX aria-hidden="true" size={16} style={MESSAGE_ICON_STYLE} />,
  info: <Info aria-hidden="true" size={16} style={MESSAGE_ICON_STYLE} />,
  success: (
    <CircleCheck aria-hidden="true" size={16} style={MESSAGE_ICON_STYLE} />
  ),
  warning: (
    <TriangleAlert aria-hidden="true" size={16} style={MESSAGE_ICON_STYLE} />
  ),
};

const buildMessageOptions = (options?: MessageOptions): MessageOptions => ({
  ...DEFAULT_MESSAGE_OPTIONS,
  ...options,
});

const mergeMessageToastOptions = (
  toastOptions?: MessageToastOptions,
): MessageToastOptions => ({
  ...toastOptions,
  style: {
    ...MESSAGE_TOAST_STYLE,
    ...toastOptions?.style,
  },
});

const Message = React.forwardRef<HTMLElement, MessageProps>(
  (
    {
      closeButton = false,
      duration = DEFAULT_MESSAGE_OPTIONS.duration,
      expand = false,
      icons,
      position = DEFAULT_MESSAGE_OPTIONS.position,
      richColors = true,
      style,
      toastOptions,
      visibleToasts = 3,
      ...props
    },
    ref,
  ) => (
    <Toaster
      closeButton={closeButton}
      duration={duration}
      expand={expand}
      icons={{ ...MESSAGE_ICONS, ...icons }}
      position={position}
      ref={ref}
      richColors={richColors}
      style={{
        ...MESSAGE_TOASTER_STYLE,
        ...style,
      }}
      toastOptions={mergeMessageToastOptions(toastOptions)}
      visibleToasts={visibleToasts}
      {...props}
    />
  ),
);
Message.displayName = "Message";

const message: MessageApi = {
  destroy: (id) => toast.dismiss(id),
  error: (content, options) => toast.error(content, buildMessageOptions(options)),
  info: (content, options) => toast.info(content, buildMessageOptions(options)),
  loading: (content, options) => toast.loading(content, buildMessageOptions(options)),
  open: (content, options) => toast.message(content, buildMessageOptions(options)),
  success: (content, options) => toast.success(content, buildMessageOptions(options)),
  warning: (content, options) => toast.warning(content, buildMessageOptions(options)),
};

export { Message, message };
