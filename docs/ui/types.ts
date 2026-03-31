export type ImageViewerProps = {
  imageUrl: string;
  autoPan: boolean;
  onInteraction: () => void;
};

export type MapInputProps = {
  value: { lat: number; lng: number } | null;
  onChange: (loc: { lat: number; lng: number }) => void;
  disabled: boolean;
};

export type TimelineInputProps = {
  value: number;
  mode: "year" | "decade" | "century";
  onChange: (year: number) => void;
};

export type BadgeModalProps = {
  badge: any;
  open: boolean;
  onClose: () => void;
};
