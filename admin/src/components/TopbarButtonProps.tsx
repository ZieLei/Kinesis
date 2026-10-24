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
      className={`p-2 rounded-md transition-colors duration-200 ${active ? "bg-white shadow-sm" : "hover:bg-black/10"
        }`}
    >
      <span
        className={`font-inter font-medium text-sm ${active ? "text-black" : "text-black/60"
          }`}
      >
        {children}
      </span>
    </button>
  );
}
