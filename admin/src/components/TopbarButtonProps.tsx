type TopbarButtonProps = {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
};

export default function TopbarButtonProps({
  children,
  active,
  onClick,
}: TopbarButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`p-2 rounded-md transition-colors duration-200 ${active ? "bg-ctp-surface0 shadow-sm border border-ctp-surface1" : "hover:bg-ctp-surface2/30"
        }`}
    >
      <span
        className={`font-inter font-medium text-sm ${active ? "text-ctp-text" : "text-ctp-subtext0"
          }`}
      >
        {children}
      </span>
    </button>
  );
}
