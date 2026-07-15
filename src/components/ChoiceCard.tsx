interface ChoiceCardProps {
  title: string;
  description: string;
  icon: string;
  selected: boolean;
  onSelect: () => void;
}

export function ChoiceCard({ title, description, icon, selected, onSelect }: ChoiceCardProps) {
  return (
    <button className={`choice-card ${selected ? 'selected' : ''}`} onClick={onSelect} type="button">
      <span className="choice-icon" aria-hidden="true">
        {icon.startsWith('/') ? <img src={icon} alt="" /> : icon}
      </span>
      <strong>{title}</strong>
      <small>{description}</small>
    </button>
  );
}
