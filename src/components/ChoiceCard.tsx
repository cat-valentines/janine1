interface ChoiceCardProps {
  title: string;
  description: string;
  icon: string;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
  lockLabel?: string;
}

export function ChoiceCard({ title, description, icon, selected, onSelect, disabled = false, lockLabel }: ChoiceCardProps) {
  return (
    <button className={`choice-card ${selected ? 'selected' : ''}`} onClick={onSelect} type="button" disabled={disabled}>
      <span className="choice-icon" aria-hidden="true">
        {icon.startsWith('/') ? <img src={icon} alt="" /> : icon}
      </span>
      <strong>{title}</strong>
      <small>{description}</small>
      {lockLabel && <small className="character-lock">🔒 {lockLabel}</small>}
    </button>
  );
}
